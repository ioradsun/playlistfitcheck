/**
 * exportVideo.ts — WebCodecs + mp4-muxer based video export.
 *
 * Renders frames faster than real-time and outputs native MP4 (H.264).
 * Video-only for V1 — users add audio in TikTok/Instagram/YouTube.
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

interface ExportOptions {
  player: any; // LyricDancePlayer instance
  width: number;
  height: number;
  fps: number;
  songDuration: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Max encoder queue depth before backpressure kicks in (default: 8) */
  maxQueueDepth?: number;
  /** Override bitrate in bps. Default scales with resolution. */
  bitrate?: number;
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
  } = options;

  const totalFrames = Math.ceil(songDuration * fps);
  const usPerFrame = Math.round(1_000_000 / fps);
  const keyFrameInterval = Math.round(fps * 2); // every 2s
  const effectiveBitrate = bitrate ?? defaultBitrate(width, height, fps);

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
      player.drawAtTime(i / fps);

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
        const pct = Math.round((i / totalFrames) * 100);
        if (pct !== lastProgressPct) {
          lastProgressPct = pct;
          onProgress(pct);
        }
      }
    }

    // ── Flush + finalize ──
    await videoEncoder.flush();
    videoEncoder.close();
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
