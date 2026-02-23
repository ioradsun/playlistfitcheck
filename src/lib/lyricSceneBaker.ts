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
    glow: number;
    visible: boolean;
  }>;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
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

type StoryboardEntryLike = {
  startSec?: number;
  endSec?: number;
  shotType?: string;
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
  pulseBudget: number;
  currentZoom: number;
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

function getShotY(_cinematicDirection: CinematicDirection | null, _chapter: ChapterLike | null): number {
  // True vertical center — no chapter-based y positioning until basic layout is solid
  return 540 * 0.48;
}

function getActiveLineIndex(lines: LyricLine[], tSec: number): number {
  return lines.findIndex((line) => tSec >= line.start && tSec < line.end);
}

function bakeFrame(
  frameIndex: number,
  payload: ScenePayload,
  durationMs: number,
  state: BakeState,
  linePositions: number[],
  lineChapterOffsets: number[],
): Keyframe {
  const timeMs = frameIndex * FRAME_STEP_MS;
  const tSec = payload.songStart + timeMs / 1000;
  const songProgress = Math.min(1, timeMs / durationMs);
  const activeLineIndex = getActiveLineIndex(payload.lines, tSec);
  const beatIndex = getBeatIndex(tSec, state);

  if (beatIndex !== state.lastBeatIndex) {
    state.lastBeatIndex = beatIndex;
    state.pulseBudget = 12;
  }
  if (state.pulseBudget > 0) state.pulseBudget -= 1;
  const pulseProgress = state.pulseBudget / 12;
  const beatPulse = pulseProgress * pulseProgress * 0.08;

  const { chapter } = getChapterIndexAndData(payload.cinematic_direction, songProgress);
  const tensionStages = (payload.cinematic_direction?.tensionCurve ?? []) as TensionStageLike[];
  const tensionMotion = tensionStages.find(
    (s) => tSec >= (s.startRatio ?? 0) && tSec < (s.endRatio ?? 9999),
  )?.motionIntensity ?? 0.5;

  // Shot type → camera zoom
  const shotZoomMap: Record<string, number> = {
    'CloseUp': 1.25,
    'Medium': 1.0,
    'Wide': 0.82,
    'FloatingInWorld': 0.95,
  };
  const storyboard = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];
  const currentShot = storyboard.find(
    (s) => tSec >= (s.startSec ?? 0) && tSec < (s.endSec ?? 9999),
  )?.shotType ?? 'Medium';
  const targetZoom = shotZoomMap[currentShot] ?? 1.0;
  state.currentZoom += (targetZoom - state.currentZoom) * 0.02;

  const chunks: Keyframe["chunks"] = [];

  for (let idx = 0; idx < payload.lines.length; idx += 1) {
    const line = payload.lines[idx];
    const lineActive = idx === activeLineIndex;

    const fadeIn = Math.min(1, Math.max(0, (tSec - line.start) / 0.2));
    const fadeOut = Math.min(1, Math.max(0, (line.end - tSec) / 0.3));
    const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));

    let x = linePositions[idx] + lineChapterOffsets[idx];
    const estimatedWidth = Math.min(880, line.text.length * 28);
    const maxX = 960 - estimatedWidth / 2 - 60;
    const minX = estimatedWidth / 2 + 60;
    x = Math.max(minX, Math.min(maxX, x));
    const y = getShotY(payload.cinematic_direction, chapter);

    const visible = alpha > 0.001;
    const scale = lineActive && visible ? 1.0 + beatPulse : 1.0;

    chunks.push({
      id: `${idx}`,
      x,
      y,
      alpha,
      scale,
      visible,
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
            scale: scale * 1.15,
            visible,
          });
        }
      }
    }
  }

  return {
    timeMs,
    chunks,
    cameraX: Math.sin(songProgress * Math.PI * 3.7) * 12 * tensionMotion,
    cameraY: Math.cos(songProgress * Math.PI * 2.3) * 7 * tensionMotion,
    cameraZoom: state.currentZoom,
    beatIndex,
  };
}

function getLinePositions(payload: ScenePayload): number[] {
  return payload.lines.map((_, idx) => {
    const centerX = 960 * 0.5;
    const lineVariance = ((idx % 3) - 1) * 20; // max ±20px only
    return centerX + lineVariance;
  });
}

function getLineChapterOffsets(payload: ScenePayload): number[] {
  // No chapter offset for now — keep centered until basic layout is solid
  return payload.lines.map(() => 0);
}

function createBakeState(payload: ScenePayload): BakeState {
  return {
    beats: payload.beat_grid?.beats ?? [],
    beatCursor: 0,
    lastBeatIndex: 0,
    pulseBudget: 0,
    currentZoom: 1.0,
  };
}

export function bakeScene(
  payload: ScenePayload,
  onProgress?: (progress: number) => void,
): BakedTimeline {
  const linePositions = getLinePositions(payload);
  const lineChapterOffsets = getLineChapterOffsets(payload);

  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const frames: BakedTimeline = [];
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const state = createBakeState(payload);

  console.log("[lyricSceneBaker] tensionCurveLength", payload.cinematic_direction?.tensionCurve?.length);

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    frames.push(bakeFrame(frameIndex, payload, durationMs, state, linePositions, lineChapterOffsets));

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
  const linePositions = getLinePositions(payload);
  const lineChapterOffsets = getLineChapterOffsets(payload);
  const durationMs = Math.max(1, (payload.songEnd - payload.songStart) * 1000);
  const totalFrames = Math.ceil(durationMs / FRAME_STEP_MS);
  const state = createBakeState(payload);

  const frames: BakedTimeline = [];
  let frameIndex = 0;

  const step = () =>
    new Promise<void>((resolve) => {
      const end = Math.min(totalFrames, frameIndex + Math.max(1, framesPerChunk));

      for (; frameIndex <= end; frameIndex += 1) {
        frames.push(bakeFrame(frameIndex, payload, durationMs, state, linePositions, lineChapterOffsets));

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
