/**
 * exportVideo.ts — WebCodecs + mp4-muxer based video export.
 *
 * Renders frames faster than real-time and outputs native MP4 (H.264).
 * Supports video-only or video+audio (AAC) export via WebCodecs.
 *
 * Optimizations over V1:
 * ───────────────────────
 * 1. Zero-copy VideoFrame via transferToImageBitmap() — eliminates the
 *    GPU→CPU→GPU round-trip that `new VideoFrame(canvas)` forces.
 * 2. Event-driven backpressure (ondequeue) — replaces setTimeout polling
 *    with a callback that fires the instant the encoder drains a frame.
 * 3. Pipelined render/encode — draws the NEXT frame while the encoder
 *    chews on the current one, keeping both GPU and encoder saturated.
 * 4. Batched yields — only yields to the event loop when the encoder
 *    queue is actually full, not on an arbitrary modulo.
 * 5. Pre-computed constants — keyframe interval, timestamp math pulled
 *    out of the hot loop.
 * 6. Configurable bitrate scaling — adapts to resolution automatically.
 */
import * as Mp4Muxer from 'mp4-muxer';
import { sliceAudio } from "@/engine/audioSlice";

interface ExportOptions {
  player: any; // LyricDancePlayer instance
  width: number;
  height: number;
  fps: number;
  songDuration: number;
  /** Absolute time offset in seconds (in the audio file's timeline).
   *  Internally converted to song-relative time before calling drawAtTime.
   *  Use this for clip export: set startOffset = moment.startSec, songDuration = moment.endSec - moment.startSec. */
  startOffset?: number;
  /**
   * When set, the player pins the background image to this section index
   * for the entire clip, preventing mid-clip image changes when the moment
   * spans a section boundary. Compute via `player.resolveSectionAtTime(startSec)`.
   */
  pinSectionIdx?: number | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Max encoder queue depth before backpressure kicks in (default: 8) */
  maxQueueDepth?: number;
  /** Override bitrate in bps. Default scales with resolution. */
  bitrate?: number;
  /** Optional caption text rendered in stroked MrBeast-style text above lyrics. */
  captionText?: string;
  captionOptions?: {
    style: "stroke" | "bar" | "pill" | "none";
    position: "top" | "bottom";
  };
  credit?: {
    artistName: string;
    songTitle: string;
    avatarImg: HTMLImageElement | null;
  };
  /** Optional audio to mux alongside video. When provided, output is an A/V MP4. */
  audioSlice?: {
    audioUrl: string;
    startSec: number;
    endSec: number;
  };
}

function concatPlanarChannels(channels: Float32Array[]): Float32Array {
  const channelCount = channels.length;
  if (channelCount === 0) return new Float32Array();
  const frameCount = channels[0]?.length ?? 0;
  const out = new Float32Array(frameCount * channelCount);
  for (let ch = 0; ch < channelCount; ch += 1) {
    out.set(channels[ch], ch * frameCount);
  }
  return out;
}

// ── Bitrate heuristic: ~5 bits/pixel/frame, clamped to [2Mbps, 20Mbps] ──
function defaultBitrate(w: number, h: number, fps: number): number {
  return Math.max(2_000_000, Math.min(20_000_000, Math.round(w * h * fps * 5 / 1000) * 1000));
}

// ── H.264 profile/level selection ──
function pickCodecString(w: number, h: number): string {
  const pixels = w * h;
  if (pixels > 2073600) return 'avc1.640033'; // High @ 5.1 — 4K-ish
  if (pixels > 921600)  return 'avc1.64002a'; // High @ 4.2 — 1080p
  return 'avc1.640028';                        // High @ 4.0 — 720p and below
}

/** Word-wrap text to fit within maxWidth. Returns an array of lines. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [text];
}

export async function exportVideoAsMP4(options: ExportOptions): Promise<Blob> {
  const {
    player,
    width,
    height,
    fps,
    songDuration,
    onProgress,
    signal,
    maxQueueDepth = 8,
    bitrate,
    audioSlice,
  } = options;

  const totalFrames = Math.ceil(songDuration * fps);
  const usPerFrame = Math.round(1_000_000 / fps);
  const keyFrameInterval = Math.round(fps * 2); // every 2s
  const effectiveBitrate = bitrate ?? defaultBitrate(width, height, fps);
  let audioSliceResult: Awaited<ReturnType<typeof sliceAudio>> | null = null;

  if (audioSlice) {
    if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
      console.warn("[exportVideo] AudioEncoder unavailable; exporting video-only.");
    } else {
      try {
        audioSliceResult = await sliceAudio(
          audioSlice.audioUrl,
          audioSlice.startSec,
          audioSlice.endSec,
          0.05,
          signal,
        );
      } catch (e) {
        console.warn("[exportVideo] Audio slice failed; exporting video-only.", e);
      }
    }
  }

  // ── Prime render pipeline (images/Ken Burns/sims) before resize/export ──
  if (typeof player.prepareExportFramePipeline === 'function') {
    await player.prepareExportFramePipeline();
  }

  // ── Resize player once ──
  player.setupExportResolution(width, height, options.pinSectionIdx ?? null);
  // drawAtTime(tSec) adds songStartSec internally: timeSec = songStartSec + tSec.
  // So tSec must be RELATIVE to songStart (0 = first beat).
  // ExportStudio passes startOffset as absolute audio time (e.g. 24.22s).
  // Subtract songStartSec to convert absolute → relative.
  const songStart = typeof player.exportSongStartSec === 'number' ? player.exportSongStartSec : 0;

  // ── MP4 muxer ──
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    audio: audioSliceResult
      ? {
        codec: 'aac',
        sampleRate: audioSliceResult.sampleRate,
        numberOfChannels: audioSliceResult.numberOfChannels,
      }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // ── Encoder with event-driven drain ──
  let encodeError: Error | null = null;
  let drainResolve: (() => void) | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
    error: (e) => { encodeError = e; drainResolve?.(); },
  });

  // When a frame finishes encoding, wake up the render loop if it's waiting
  (videoEncoder as any).ondequeue = () => {
    if (drainResolve && videoEncoder.encodeQueueSize <= maxQueueDepth >>> 1) {
      drainResolve();
      drainResolve = null;
    }
  };

  videoEncoder.configure({
    codec: pickCodecString(width, height),
    width,
    height,
    bitrate: effectiveBitrate,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    // Hint: latency doesn't matter for offline export — let encoder batch
    latencyMode: 'quality',
  });

  try {
    const canvas = player.getExportCanvas();

    // ── Feature-detect zero-copy path ──
    // transferToImageBitmap() is available on OffscreenCanvas and on
    // regular HTMLCanvasElement in Chromium 94+. Falls back to direct
    // canvas reference if unavailable (still works, just copies).
    const hasTransfer = typeof canvas.transferToImageBitmap === 'function';

    let lastProgressPct = -1;

    for (let i = 0; i < totalFrames; i++) {
      // ── Abort check ──
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (encodeError) throw encodeError;

      // ── Render ──
      player.drawAtTime((options.startOffset ?? 0) - songStart + i / fps);

      if (options.captionText && options.captionOptions?.style !== "none") {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const style = options.captionOptions?.style ?? "stroke";
          const pos = options.captionOptions?.position ?? "bottom";
          const isPortrait = height > width;
          const fontSize = Math.round(height * 0.028);
          const lineHeight = Math.round(fontSize * 1.5);

          // Max width: leave margins for social UI
          const maxW = isPortrait
            ? Math.round(width * 0.76)
            : Math.round(width * 0.65);

          ctx.font = `800 ${fontSize}px "SF Pro Display", "Helvetica Neue", -apple-system, sans-serif`;
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";

          // Word-wrap the caption
          const lines = wrapText(ctx, options.captionText, maxW);
          const totalTextHeight = lines.length * lineHeight;

          // Alignment
          const leftAligned = pos === "bottom" && isPortrait;
          ctx.textAlign = leftAligned ? "left" : "center";
          const textX = leftAligned
            ? Math.round(width * 0.06)
            : Math.round(width / 2);

          // Y position: center the text block at the target position
          const targetY = pos === "top"
            ? Math.round(height * (isPortrait ? 0.10 : 0.08))
            : isPortrait
              ? Math.round(height * 0.78)
              : Math.round(height * 0.82);

          // Offset so the block is centered on targetY
          const blockStartY = targetY - totalTextHeight / 2 + lineHeight / 2;

          // Measure widest line for bar/pill background
          let widestLine = 0;
          for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > widestLine) widestLine = w;
          }

          ctx.textAlign = leftAligned ? "left" : "center";

          switch (style) {
            case "bar": {
              const padX = Math.round(fontSize * 0.6);
              const padY = Math.round(fontSize * 0.45);
              const rectW = widestLine + padX * 2;
              const rectH = totalTextHeight + padY * 2;
              const rectX = leftAligned
                ? textX - padX
                : textX - rectW / 2;
              const rectY = blockStartY - lineHeight / 2 - padY;
              const r = Math.round(fontSize * 0.25);

              ctx.fillStyle = "rgba(0,0,0,0.7)";
              ctx.beginPath();
              ctx.roundRect(rectX, rectY, rectW, rectH, r);
              ctx.fill();

              ctx.fillStyle = "#ffffff";
              for (let li = 0; li < lines.length; li++) {
                ctx.fillText(lines[li], textX, blockStartY + li * lineHeight);
              }
              break;
            }
            case "pill": {
              // Pill: one pill per line
              const padX = Math.round(fontSize * 0.7);
              const padY = Math.round(fontSize * 0.3);
              ctx.fillStyle = "#000000";

              for (let li = 0; li < lines.length; li++) {
                const lw = ctx.measureText(lines[li]).width;
                const pillW = lw + padX * 2;
                const pillH = fontSize + padY * 2;
                const cy = blockStartY + li * lineHeight;
                const pillX = leftAligned
                  ? textX - padX
                  : textX - pillW / 2;
                const pillY = cy - pillH / 2;

                ctx.beginPath();
                ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
                ctx.fill();
              }

              ctx.fillStyle = "#ffffff";
              for (let li = 0; li < lines.length; li++) {
                ctx.fillText(lines[li], textX, blockStartY + li * lineHeight);
              }
              break;
            }
            case "stroke":
            default: {
              ctx.strokeStyle = "#000000";
              ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.14));

              for (let li = 0; li < lines.length; li++) {
                const y = blockStartY + li * lineHeight;
                ctx.strokeText(lines[li], textX, y);
              }
              ctx.fillStyle = "#ffffff";
              for (let li = 0; li < lines.length; li++) {
                const y = blockStartY + li * lineHeight;
                ctx.fillText(lines[li], textX, y);
              }
              break;
            }
          }
        }
      }

      // ── Artist credit pill ──
      if (options.credit) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const { artistName, songTitle, avatarImg } = options.credit;
          const isPortrait = height > width;
          const pillFontSize = Math.max(10, Math.round(width * 0.018));
          const avatarSize = Math.round(pillFontSize * 1.8);
          const pillPadX = Math.round(pillFontSize * 0.7);
          const pillPadY = Math.round(pillFontSize * 0.4);
          const pillGap = Math.round(pillFontSize * 0.5);
          const pillX = Math.round(width * (isPortrait ? 0.05 : 0.08));
          const pillY = Math.round(height * (isPortrait ? 0.08 : 0.06));

          const creditText = `${artistName} · ${songTitle}`;
          ctx.font = `400 ${pillFontSize}px "SF Mono", "Geist Mono", monospace`;
          const textMetrics = ctx.measureText(creditText);
          const textW = Math.min(textMetrics.width, width * 0.6);

          const totalW = avatarSize + pillGap + textW + pillPadX * 2;
          const totalH = avatarSize + pillPadY * 2;
          const radius = totalH / 2;

          // Pill background
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, totalW, totalH, radius);
          ctx.fill();

          // Avatar circle
          const avatarX = pillX + pillPadX;
          const avatarY = pillY + pillPadY;
          const avatarR = avatarSize / 2;
          if (avatarImg && avatarImg.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
            ctx.fill();
          }

          // Text
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = `400 ${pillFontSize}px "SF Mono", "Geist Mono", monospace`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(creditText, avatarX + avatarSize + pillGap, pillY + totalH / 2, textW);
          ctx.restore();
        }
      }

      // ── Create VideoFrame (zero-copy when possible) ──
      const timestamp = i * usPerFrame;
      let frame: VideoFrame;
      if (hasTransfer) {
        // transferToImageBitmap() detaches the bitmap from the canvas
        // and hands ownership to VideoFrame — no pixel copy.
        const bitmap = canvas.transferToImageBitmap();
        frame = new VideoFrame(bitmap, { timestamp, duration: usPerFrame });
        bitmap.close();
      } else {
        // HTMLCanvasElement doesn't have transferToImageBitmap.
        // new VideoFrame(canvas) can capture stale pixels when the context
        // uses alpha:false — the browser may defer flushing draw commands.
        // createImageBitmap forces a synchronous pixel read.
        const bitmap = await createImageBitmap(canvas);
        frame = new VideoFrame(bitmap, { timestamp, duration: usPerFrame });
        bitmap.close();
      }

      // ── Encode ──
      videoEncoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
      frame.close();

      // ── Backpressure: event-driven wait ──
      // Only yields when the encoder queue is actually full.
      // The ondequeue callback wakes us the instant capacity opens up,
      // instead of polling with setTimeout(1).
      if (videoEncoder.encodeQueueSize >= maxQueueDepth) {
        await new Promise<void>((resolve) => {
          drainResolve = resolve;
          // Safety timeout — if ondequeue doesn't fire within 5s, unblock.
          // Prevents deadlock if the encoder stalls.
          setTimeout(() => { if (drainResolve === resolve) { drainResolve = null; resolve(); } }, 5000);
        });
      }

      // ── Progress (avoid excessive calls — only on integer % change) ──
      if (onProgress) {
        const pct = Math.round((i / totalFrames) * (audioSliceResult ? 90 : 100));
        if (pct !== lastProgressPct) {
          lastProgressPct = pct;
          onProgress(pct);
        }
      }
    }

    // ── Flush + finalize ──
    await videoEncoder.flush();
    videoEncoder.close();

    if (audioSliceResult) {
      onProgress?.(95);
      if (encodeError) throw encodeError;

      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta ?? undefined),
        error: (e) => { encodeError = e as Error; },
      });

      audioEncoder.configure({
        codec: "mp4a.40.2",
        sampleRate: audioSliceResult.sampleRate,
        numberOfChannels: audioSliceResult.numberOfChannels,
        bitrate: 128_000,
      });

      const planar = concatPlanarChannels(audioSliceResult.samples);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: audioSliceResult.sampleRate,
        numberOfFrames: audioSliceResult.samples[0]?.length ?? 0,
        numberOfChannels: audioSliceResult.numberOfChannels,
        timestamp: 0,
        data: planar.buffer as ArrayBuffer,
      });
      audioEncoder.encode(audioData);
      audioData.close();
      await audioEncoder.flush();
      audioEncoder.close();
      if (encodeError) throw encodeError;
      onProgress?.(100);
    }

    muxer.finalize();

    const { buffer } = muxer.target as Mp4Muxer.ArrayBufferTarget;
    return new Blob([buffer], { type: 'video/mp4' });

  } catch (err) {
    try { videoEncoder.close(); } catch (_) { /* already closed */ }
    throw err;
  } finally {
    player.teardownExportResolution();
  }
}

/**
 * Check if the browser supports WebCodecs video encoding.
 */
export function canExportVideo(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Probe whether the encoder config will actually work before starting a
 * long export. Returns false if the browser's encoder rejects the codec/
 * resolution combo (e.g. no H.264 HW encoder on Linux Firefox).
 */
export async function probeEncoderSupport(width: number, height: number): Promise<boolean> {
  if (!canExportVideo()) return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: pickCodecString(width, height),
      width,
      height,
      bitrate: defaultBitrate(width, height, 30),
      framerate: 30,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}
