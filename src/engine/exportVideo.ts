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
  /** Absolute time offset in seconds. drawAtTime will be called with startOffset + frame_time.
   *  Use this for clip export: set startOffset = clipStart, songDuration = clipEnd - clipStart. */
  startOffset?: number;
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
  player.setupExportResolution(width, height);

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
      player.drawAtTime((options.startOffset ?? 0) + i / fps);

      if (options.captionText && options.captionOptions?.style !== "none") {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const style = options.captionOptions?.style ?? "stroke";
          const pos = options.captionOptions?.position ?? "bottom";
          const isPortrait = height > width;
          const isSquare = Math.abs(width - height) < 100;
          const fontSize = Math.round(height * 0.032);

          const captionY = pos === "top"
            ? Math.round(height * (isPortrait ? 0.12 : 0.10))
            : isPortrait
              ? Math.round(height * 0.76)
              : isSquare
                ? Math.round(height * 0.80)
                : Math.round(height * 0.80);
          ctx.font = `800 ${fontSize}px "SF Pro Display", "Helvetica Neue", -apple-system, sans-serif`;
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";

          const leftAligned = pos === "bottom" && isPortrait;
          const leftPad = leftAligned ? Math.round(width * 0.06) : 0;
          const maxW = leftAligned
            ? Math.round(width * 0.76)
            : Math.round(width * 0.80);
          const textX = leftAligned ? leftPad : width / 2;
          ctx.textAlign = leftAligned ? "left" : "center";

          switch (style) {
            case "bar": {
              const metrics = ctx.measureText(options.captionText);
              const textW = Math.min(metrics.width, maxW);
              const padX = Math.round(fontSize * 0.5);
              const padY = Math.round(fontSize * 0.35);
              const rectX = leftAligned
                ? textX - padX
                : textX - textW / 2 - padX;
              const rectY = captionY - fontSize / 2 - padY;
              const rectW = textW + padX * 2;
              const rectH = fontSize + padY * 2;

              ctx.fillStyle = "rgba(0,0,0,0.7)";
              const r = Math.round(fontSize * 0.2);
              ctx.beginPath();
              ctx.roundRect(rectX, rectY, rectW, rectH, r);
              ctx.fill();

              ctx.fillStyle = "#ffffff";
              ctx.fillText(options.captionText, textX, captionY, maxW);
              break;
            }
            case "pill": {
              const metrics = ctx.measureText(options.captionText);
              const textW = Math.min(metrics.width, maxW);
              const padX = Math.round(fontSize * 0.6);
              const padY = Math.round(fontSize * 0.3);
              const rectX = leftAligned
                ? textX - padX
                : textX - textW / 2 - padX;
              const rectY = captionY - fontSize / 2 - padY;
              const rectW = textW + padX * 2;
              const rectH = fontSize + padY * 2;

              ctx.fillStyle = "#000000";
              ctx.beginPath();
              ctx.roundRect(rectX, rectY, rectW, rectH, rectH / 2);
              ctx.fill();

              ctx.fillStyle = "#ffffff";
              ctx.fillText(options.captionText, textX, captionY, maxW);
              break;
            }
            case "stroke":
            default: {
              ctx.strokeStyle = "#000000";
              ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.12));
              ctx.strokeText(options.captionText, textX, captionY, maxW);
              ctx.fillStyle = "#ffffff";
              ctx.fillText(options.captionText, textX, captionY, maxW);
              break;
            }
          }
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
        frame = new VideoFrame(canvas, { timestamp, duration: usPerFrame });
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
