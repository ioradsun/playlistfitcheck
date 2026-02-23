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
const BASE_X = 960 * 0.5;
const BASE_Y_CENTER = 540 * 0.5;

type WordDirectiveLike = {
  word?: string;
};

type TensionStageLike = {
  startRatio?: number;
  endRatio?: number;
  motion?: number;
  motionIntensity?: number;
};

type ChapterLike = {
  startRatio?: number;
  endRatio?: number;
  cameraDistance?: string;
  cameraMovement?: string;
};

type BakeState = {
  beats: number[];
  beatCursor: number;
  lastBeatIndex: number;
  linePulse: Map<number, number>;
};

function getBeatIndex(tSec: number, state: BakeState): number {
  if (!state.beats.length) return 0;

  while (state.beatCursor + 1 < state.beats.length && state.beats[state.beatCursor + 1] <= tSec) {
    state.beatCursor += 1;
  }

  while (state.beatCursor > 0 && state.beats[state.beatCursor] > tSec) {
    state.beatCursor -= 1;
  }

  return state.beatCursor;
}

function getChapterIndexAndData(
  cinematicDirection: CinematicDirection | null,
  songProgress: number,
): { chapterIndex: number; chapter: ChapterLike | null } {
  const chapters = (cinematicDirection?.chapters ?? []) as ChapterLike[];
  if (!chapters.length) return { chapterIndex: -1, chapter: null };

  const idx = chapters.findIndex((chapter) => {
    const startRatio = chapter.startRatio ?? 0;
    const endRatio = chapter.endRatio ?? 1;
    return songProgress >= startRatio && songProgress <= endRatio;
  });

  if (idx >= 0) return { chapterIndex: idx, chapter: chapters[idx] };
  return { chapterIndex: chapters.length - 1, chapter: chapters[chapters.length - 1] };
}

function getShotY(cinematicDirection: CinematicDirection | null, chapter: ChapterLike | null): number {
  if (!cinematicDirection || !chapter) return 540 * 0.52;

  const distance = (chapter.cameraDistance ?? "Medium").toLowerCase();
  if (distance.includes("wide")) return 540 * 0.65;
  if (distance.includes("close")) return 540 * 0.35;
  return BASE_Y_CENTER;
}

function getTensionMotion(
  cinematicDirection: CinematicDirection | null,
  songProgress: number,
): number {
  if (!cinematicDirection?.tensionCurve?.length) return 0.5;

  const stages = cinematicDirection.tensionCurve as TensionStageLike[];
  const currentStage =
    stages.find((stage) => songProgress >= (stage.startRatio ?? 0) && songProgress <= (stage.endRatio ?? 1)) ??
    stages[stages.length - 1];

  const motion = currentStage.motion ?? currentStage.motionIntensity ?? 0.5;
  return Math.max(0, Math.min(1, motion));
}

function getActiveLineIndex(lines: LyricLine[], tSec: number): number {
  return lines.findIndex((line) => tSec >= line.start && tSec < line.end);
}

function bakeFrame(
  frameIndex: number,
  payload: ScenePayload,
  durationMs: number,
  state: BakeState,
): Keyframe {
  const timeMs = frameIndex * FRAME_STEP_MS;
  const tSec = payload.songStart + timeMs / 1000;
  const songProgress = Math.min(1, timeMs / durationMs);
  const activeLineIndex = getActiveLineIndex(payload.lines, tSec);
  const beatIndex = getBeatIndex(tSec, state);

  const onBeat = beatIndex !== state.lastBeatIndex;
  if (onBeat && activeLineIndex >= 0) {
    state.linePulse.set(activeLineIndex, 0.08);
    state.lastBeatIndex = beatIndex;
  }

  const energy = (payload.physics_spec as PhysicsSpec & { energy?: number; params?: Record<string, number> })
    .energy ?? payload.physics_spec?.params?.energy ?? 0.5;
  const density = (payload.physics_spec as PhysicsSpec & { density?: number; params?: Record<string, number> })
    .density ?? payload.physics_spec?.params?.density ?? 0.5;
  const baseScale = 1 + Math.max(0, Math.min(1, energy)) * 0.15;
  const pulseDecayPerFrame = 0.08 / 4;

  const { chapterIndex, chapter } = getChapterIndexAndData(payload.cinematic_direction, songProgress);
  const tensionMotion = getTensionMotion(payload.cinematic_direction, songProgress);

  const chunks: Keyframe["chunks"] = [];

  for (let idx = 0; idx < payload.lines.length; idx += 1) {
    const line = payload.lines[idx];
    const lineActive = idx === activeLineIndex;

    const fadeIn = Math.min(1, Math.max(0, (tSec - line.start) / 0.2));
    const fadeOut = Math.min(1, Math.max(0, (line.end - tSec) / 0.3));
    const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));

    const chapterOffset = ((Math.max(0, chapterIndex) % 3) - 1) * 60;
    const lineVariance = ((idx % 7) - 3) * 12;
    const x = BASE_X + chapterOffset + lineVariance;
    const y = getShotY(payload.cinematic_direction, chapter);

    const priorPulse = state.linePulse.get(idx) ?? 0;
    const pulse = lineActive ? priorPulse : 0;
    const scale = baseScale + pulse * (0.85 + density * 0.15);

    chunks.push({
      id: `${idx}`,
      x,
      y,
      alpha,
      scale,
      visible: alpha > 0.001,
    });

    if (lineActive && payload.cinematic_direction?.wordDirectives) {
      const directives = Object.values(payload.cinematic_direction.wordDirectives as Record<string, WordDirectiveLike>);
      const normalizedText = (line.text ?? "").toLowerCase();
      const heroDirective = directives.find((directive) => {
        const word = (directive.word ?? "").trim().toLowerCase();
        return word.length > 0 && normalizedText.includes(word);
      });

      if (heroDirective?.word) {
        const heroWord = heroDirective.word.trim();
        const lowerHero = heroWord.toLowerCase();
        const heroStart = normalizedText.indexOf(lowerHero);
        if (heroStart >= 0) {
          const preText = line.text.slice(0, heroStart);
          const approxCharW = 12;
          const preOffset = (preText.length * approxCharW) / 2;
          const heroOffset = (heroWord.length * approxCharW) / 2;

          chunks.push({
            id: `${idx}-hero`,
            x: x + preOffset + heroOffset,
            y,
            alpha: Math.min(1, alpha + 0.15),
            scale: scale * 1.3,
            visible: alpha > 0.001,
          });
        }
      }
    }

    if (priorPulse > 0) {
      state.linePulse.set(idx, Math.max(0, priorPulse - pulseDecayPerFrame));
    }
  }

  return {
    timeMs,
    chunks,
    cameraX: Math.sin(songProgress * Math.PI * 2) * 4 * tensionMotion,
    cameraY: Math.cos(songProgress * Math.PI * 2) * 3 * tensionMotion,
    beatIndex,
  };
}

function createBakeState(payload: ScenePayload): BakeState {
  return {
    beats: payload.beat_grid?.beats ?? [],
    beatCursor: 0,
    lastBeatIndex: -1,
    linePulse: new Map<number, number>(),
  };
}

export function bakeScene(
  payload: ScenePayload,
  onProgress?: (progress: number) => void,
): BakedTimeline {
  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const frames: BakedTimeline = [];
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const state = createBakeState(payload);

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    frames.push(bakeFrame(frameIndex, payload, durationMs, state));

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
  framesPerChunk = 120,
): Promise<BakedTimeline> {
  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const state = createBakeState(payload);

  const frames: BakedTimeline = [];
  let frameIndex = 0;

  const step = () =>
    new Promise<void>((resolve) => {
      const end = Math.min(totalFrames, frameIndex + Math.max(1, framesPerChunk));

      for (; frameIndex <= end; frameIndex += 1) {
        frames.push(bakeFrame(frameIndex, payload, durationMs, state));

        if (frameIndex === totalFrames) break;
      }

      onProgress?.(Math.min(1, frameIndex / totalFrames));
      setTimeout(() => resolve(), 0);
    });

  const run = async (): Promise<BakedTimeline> => {
    while (frameIndex <= totalFrames) {
      await step();
      if (frameIndex >= totalFrames) break;
    }
    onProgress?.(1);
    return frames;
  };

  return run();
}
