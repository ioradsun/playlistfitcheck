import type { CinematicDirection } from "@/types/CinematicDirection";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { SceneManifest } from "@/engine/SceneManifest";

export type LineBeatMap = {
  lineIndex: number;
  beats: number[];
  strongBeats: number[];
  beatCount: number;
  beatsPerSecond: number;
  firstBeat: number;
  lastBeat: number;
};

export type ScenePayload = {
  lines: LyricLine[];
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  physics_spec: PhysicsSpec;
  scene_manifest: SceneManifest | null;
  cinematic_direction: CinematicDirection | null;
  palette: string[];
  lineBeatMap: LineBeatMap[];
  songStart: number;
  songEnd: number;
};

export type Keyframe = {
  timeMs: number;
  chunks: Array<{
    id: string;
    x: number;
    y: number;
    alpha: number;
    scale: number;
    visible: boolean;
  }>;
  cameraX: number;
  cameraY: number;
  beatIndex: number;
};

export type BakedTimeline = Keyframe[];

const FRAME_STEP_MS = 16;

function buildKeyframe(payload: ScenePayload, frameIndex: number, durationMs: number, beats: number[]): Keyframe {
  const timeMs = frameIndex * FRAME_STEP_MS;
  const tSec = payload.songStart + timeMs / 1000;
  const songProgress = Math.min(1, timeMs / durationMs);
  const activeLineIndex = payload.lines.findIndex((line) => tSec >= line.start && tSec < line.end);

  const chunks = payload.lines
    .map((line, idx) => {
      const visible = idx === activeLineIndex;
      const widthSeed = Math.max(220, line.text.length * 11);
      const centerX = 960 * 0.5;
      const spread = ((idx % 5) - 2) * 36;
      return {
        id: `${idx}`,
        x: centerX + spread,
        y: 540 * 0.52,
        alpha: visible ? 1 : 0,
        scale: visible ? 1 + Math.sin(songProgress * Math.PI * 4) * 0.03 : 1,
        visible,
        widthSeed,
      };
    })
    .map(({ widthSeed, ...chunk }) => chunk);

  let beatIndex = 0;
  for (let i = 0; i < beats.length; i += 1) {
    if (beats[i] <= tSec) beatIndex = i;
    else break;
  }

  return {
    timeMs,
    chunks,
    cameraX: Math.sin(songProgress * Math.PI * 2) * 4,
    cameraY: Math.cos(songProgress * Math.PI * 2) * 3,
    beatIndex,
  };
}

export function bakeScene(
  payload: ScenePayload,
  onProgress?: (progress: number) => void,
): BakedTimeline {
  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const frames: BakedTimeline = [];
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const beats = payload.beat_grid?.beats ?? [];

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    frames.push(buildKeyframe(payload, frameIndex, durationMs, beats));

    if (onProgress && frameIndex % 20 === 0) {
      onProgress(Math.min(1, frameIndex / totalFrames));
    }
  }

  onProgress?.(1);
  return frames;
}

export function bakeSceneChunked(
  payload: ScenePayload,
  onProgress?: (progress: number) => void,
): Promise<BakedTimeline> {
  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const beats = payload.beat_grid?.beats ?? [];
  const frames: BakedTimeline = [];
  const chunkSize = 120;

  return new Promise((resolve) => {
    let frameIndex = 0;

    const processChunk = () => {
      const chunkEnd = Math.min(totalFrames, frameIndex + chunkSize - 1);
      for (; frameIndex <= chunkEnd; frameIndex += 1) {
        frames.push(buildKeyframe(payload, frameIndex, durationMs, beats));
      }

      onProgress?.(Math.min(1, frameIndex / Math.max(1, totalFrames + 1)));

      if (frameIndex <= totalFrames) {
        setTimeout(processChunk, 0);
        return;
      }

      onProgress?.(1);
      resolve(frames);
    };

    processChunk();
  });
}
