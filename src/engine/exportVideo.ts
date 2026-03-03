/**
 * exportVideo.ts — WebCodecs + mp4-muxer based video export.
 *
 * Renders frames faster than real-time and outputs native MP4 (H.264).
 * Video-only for V1 — users add audio in TikTok/Instagram/YouTube.
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
}

export async function exportVideoAsMP4(options: ExportOptions): Promise<Blob> {
  const { player, width, height, fps, songDuration, onProgress, signal } = options;
  const totalFrames = Math.ceil(songDuration * fps);

  // Temporarily set player to export resolution
  player.setupExportResolution(width, height);

  // Create MP4 muxer
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // Create video encoder
  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
    error: (e) => { encodeError = e; },
  });

  videoEncoder.configure({
    codec: 'avc1.640028', // H.264 High Profile Level 4.0
    width,
    height,
    bitrate: 8_000_000, // 8 Mbps
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
  });

  try {
    // Render and encode each frame
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (encodeError) {
        throw encodeError;
      }

      const tSec = i / fps;
      const timestampMicros = Math.round(tSec * 1_000_000);
      const durationMicros = Math.round(1_000_000 / fps);

      // Draw frame at this timestamp
      player.drawAtTime(tSec);

      // Create VideoFrame from the player's canvas
      const canvas = player.getExportCanvas();
      const frame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        duration: durationMicros,
      });

      // Encode — keyframe every 2 seconds
      const keyFrame = i % (fps * 2) === 0;
      videoEncoder.encode(frame, { keyFrame });
      frame.close();

      // Yield every 3rd frame so VideoEncoder processes chunks
      // in parallel with our next draw — 3-5x speedup
      if (i % 3 === 0) {
        await new Promise<void>(r => setTimeout(r, 0));
      }

      // Back-pressure: if encoder queue is building up, wait
      if (videoEncoder.encodeQueueSize > 5) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (videoEncoder.encodeQueueSize <= 2) {
              resolve();
            } else {
              setTimeout(check, 1);
            }
          };
          check();
        });
      }

      // Report progress
      if (onProgress && i % 10 === 0) {
        onProgress(Math.round((i / totalFrames) * 100));
      }
    }

    // Flush remaining frames
    await videoEncoder.flush();
    videoEncoder.close();

    // Finalize MP4
    muxer.finalize();

    const { buffer } = muxer.target as Mp4Muxer.ArrayBufferTarget;
    return new Blob([buffer], { type: 'video/mp4' });
  } catch (err) {
    try { videoEncoder.close(); } catch (_) {}
    throw err;
  } finally {
    // Restore player to display mode
    player.teardownExportResolution();
  }
}

/**
 * Check if the browser supports WebCodecs video encoding.
 */
export function canExportVideo(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}
