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
    fontSize: number;
    color: string;
  }>;
  cameraX: number;
  cameraY: number;
  beatIndex: number;
  bgBlend: number;
  particles: Array<{
    x: number;
    y: number;
    size: number;
    alpha: number;
  }>;
};

export type BakedTimeline = Keyframe[];

const FRAME_STEP_MS = 16;
const BASE_X = 960 * 0.5;
const BASE_Y_CENTER = 540 * 0.5;

type StoryboardLike = {
  startSec?: number;
  endSec?: number;
  shotType?: string;
};

type WordDirectiveLike = {
  word?: string;
};

type TensionStageLike = {
  startSec?: number;
  endSec?: number;
  motion?: number;
};

type ChapterLike = {
  startSec?: number;
  endSec?: number;
};

type BakeState = {
  beats: number[];
  beatCursor: number;
  lastBeatIndex: number;
  pulseBudget: number;
};

type PrebakedData = {
  chapters: ChapterLike[];
  tensionMotionByFrame: number[];
  chapterIndexByFrame: number[];
  activeLineByFrame: number[];
  lineHeroWords: Array<string | null>;
  lineFontSizes: number[];
  lineColors: string[];
  energy: number;
  density: number;
};

function normalizeWordDirectives(source: CinematicDirection | null): WordDirectiveLike[] {
  const raw = source?.wordDirectives;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WordDirectiveLike[];
  return Object.values(raw as Record<string, WordDirectiveLike>);
}

export function blendWithWhite(hex: string, whiteFraction: number): string {
  const clean = (hex ?? "").replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#cccccc";
  const br = Math.round(r + (255 - r) * whiteFraction);
  const bg = Math.round(g + (255 - g) * whiteFraction);
  const bb = Math.round(b + (255 - b) * whiteFraction);
  return `#${br.toString(16).padStart(2, "0")}${bg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

function createPrebakedData(payload: ScenePayload, totalFrames: number): PrebakedData {
  const chapters = (payload.cinematic_direction?.chapters ?? []) as ChapterLike[];
  const wordDirectives = normalizeWordDirectives(payload.cinematic_direction);
  const tensionCurve = (payload.cinematic_direction?.tensionCurve ?? []) as TensionStageLike[];
  const energy = payload.physics_spec?.energy ?? 0.5;
  const density = payload.physics_spec?.density ?? 0.5;
  const storyboards = (payload.cinematic_direction?.storyboard ?? []) as StoryboardLike[];

  const lineChapterIndex = payload.lines.map((line) => {
    for (let i = 0; i < chapters.length; i += 1) {
      const ch = chapters[i];
      if ((line.start ?? 0) >= (ch.startSec ?? 0) && (line.start ?? 0) < (ch.endSec ?? 9999)) return i;
    }
    return -1;
  });

  const lineShotTypes = payload.lines.map((line) => {
    for (let i = 0; i < storyboards.length; i += 1) {
      const s = storyboards[i];
      if ((line.start ?? 0) >= (s.startSec ?? 0) && (line.start ?? 0) < (s.endSec ?? 9999)) {
        return s.shotType ?? "Medium";
      }
    }
    return "Medium";
  });

  const lineHeroWords = payload.lines.map((line) => {
    const text = line.text?.toLowerCase() ?? "";
    for (let i = 0; i < wordDirectives.length; i += 1) {
      const word = wordDirectives[i]?.word?.toLowerCase();
      if (word && text.includes(word)) return wordDirectives[i]?.word ?? null;
    }
    return null;
  });

  const lineFontSizes = payload.lines.map((_, idx) => {
    const shot = lineShotTypes[idx];
    if (shot === "CloseUp") return 48;
    if (shot === "Wide") return 24;
    return 36;
  });

  const lineColors = payload.lines.map((_, idx) => {
    const ci = lineChapterIndex[idx];
    if (ci < 0 || !payload.palette?.length) return "#ffffff";
    return blendWithWhite(payload.palette[ci % payload.palette.length] ?? "#ffffff", 0.45);
  });

  const chapterIndexByFrame = new Array<number>(totalFrames + 1).fill(-1);
  const tensionMotionByFrame = new Array<number>(totalFrames + 1).fill(0.5);
  const activeLineByFrame = new Array<number>(totalFrames + 1).fill(-1);

  let chapterCursor = 0;
  let tensionCursor = 0;

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    const tSec = payload.songStart + (frameIndex * FRAME_STEP_MS) / 1000;

    while (chapterCursor < chapters.length && tSec >= (chapters[chapterCursor].endSec ?? 9999)) {
      chapterCursor += 1;
    }
    if (
      chapterCursor < chapters.length &&
      tSec >= (chapters[chapterCursor].startSec ?? 0) &&
      tSec < (chapters[chapterCursor].endSec ?? 9999)
    ) {
      chapterIndexByFrame[frameIndex] = chapterCursor;
    }

    while (tensionCursor < tensionCurve.length && tSec >= (tensionCurve[tensionCursor].endSec ?? 9999)) {
      tensionCursor += 1;
    }
    if (
      tensionCursor < tensionCurve.length &&
      tSec >= (tensionCurve[tensionCursor].startSec ?? 0) &&
      tSec < (tensionCurve[tensionCursor].endSec ?? 9999)
    ) {
      tensionMotionByFrame[frameIndex] = tensionCurve[tensionCursor].motion ?? 0.5;
    }

    for (let idx = 0; idx < payload.lines.length; idx += 1) {
      const line = payload.lines[idx];
      if (tSec >= (line.start ?? 0) && tSec < (line.end ?? 0)) {
        activeLineByFrame[frameIndex] = idx;
        break;
      }
    }
  }

  return {
    chapters,
    tensionMotionByFrame,
    chapterIndexByFrame,
    activeLineByFrame,
    lineHeroWords,
    lineFontSizes,
    lineColors,
    energy,
    density,
  };
}

function getBeatIndex(tSec: number, state: BakeState): number {
  if (!state.beats.length) return -1;

  while (state.beatCursor + 1 < state.beats.length && state.beats[state.beatCursor + 1] <= tSec) {
    state.beatCursor += 1;
  }

  while (state.beatCursor > 0 && state.beats[state.beatCursor] > tSec) {
    state.beatCursor -= 1;
  }

  return state.beatCursor;
}

function bakeFrame(
  frameIndex: number,
  payload: ScenePayload,
  durationMs: number,
  state: BakeState,
  pre: PrebakedData,
): Keyframe {
  const timeMs = frameIndex * FRAME_STEP_MS;
  const tSec = payload.songStart + timeMs / 1000;
  const songProgress = Math.min(1, timeMs / durationMs);
  const activeLineIndex = pre.activeLineByFrame[frameIndex] ?? -1;
  const beatIndex = getBeatIndex(tSec, state);

  if (beatIndex !== state.lastBeatIndex) {
    state.lastBeatIndex = beatIndex;
    state.pulseBudget = 6;
  }
  if (state.pulseBudget > 0) state.pulseBudget -= 1;
  const beatPulse = state.pulseBudget > 0 ? (state.pulseBudget / 6) * 0.15 : 0;

  const tensionMotion = pre.tensionMotionByFrame[frameIndex] ?? 0.5;
  const cameraX = Math.sin(songProgress * Math.PI * 3.7) * 14 * tensionMotion;
  const cameraY = Math.cos(songProgress * Math.PI * 2.3) * 8 * tensionMotion;

  const currentChapterIndex = pre.chapterIndexByFrame[frameIndex] ?? -1;
  const bgBlend =
    currentChapterIndex >= 0 ? currentChapterIndex / Math.max(1, pre.chapters.length - 1) : 0;

  const particleCount = Math.max(0, Math.floor(pre.energy * 8 + beatPulse * 12 + pre.density * 2));
  const particles: Keyframe["particles"] = Array.from({ length: particleCount }, (_, i) => ({
    x: 0.1 + ((i * 0.618033) % 0.8),
    y: 0.1 + ((i * 0.381966) % 0.8),
    size: 1 + pre.energy * 2,
    alpha: 0.06 + beatPulse * 0.12,
  }));

  const chunks: Keyframe["chunks"] = [];

  for (let idx = 0; idx < payload.lines.length; idx += 1) {
    const line = payload.lines[idx];
    const visible = idx === activeLineIndex;
    const lineStart = line.start ?? 0;
    const lineEnd = line.end ?? lineStart;
    const fadeIn = visible ? Math.min(1, Math.max(0, (tSec - lineStart) / 0.2)) : 0;
    const fadeOut = visible ? Math.min(1, Math.max(0, (lineEnd - tSec) / 0.3)) : 0;
    const alpha = Math.min(fadeIn, fadeOut);
    const scale = visible ? 1.0 + beatPulse : 1.0;
    const heroWord = pre.lineHeroWords[idx];
    const fontSize = pre.lineFontSizes[idx] ?? 36;

    const baseChunk = {
      id: String(idx),
      x: BASE_X,
      y: BASE_Y_CENTER,
      alpha,
      scale,
      visible: visible && alpha > 0,
      fontSize,
      color: pre.lineColors[idx] ?? "#ffffff",
    };

    chunks.push(baseChunk);

    if (heroWord && visible) {
      chunks.push({
        id: `${idx}-hero`,
        x: BASE_X,
        y: BASE_Y_CENTER + fontSize * 1.4,
        alpha: Math.min(1, alpha * 1.2),
        scale: scale * 1.35,
        visible: alpha > 0,
        fontSize: fontSize * 1.3,
        color: payload.palette?.[1] ?? "#aaccff",
      });
    }
  }

  return {
    timeMs,
    chunks,
    cameraX,
    cameraY,
    beatIndex,
    bgBlend,
    particles,
  };
}

function createBakeState(payload: ScenePayload): BakeState {
  return {
    beats: payload.beat_grid?.beats ?? [],
    beatCursor: 0,
    lastBeatIndex: -1,
    pulseBudget: 0,
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
  const pre = createPrebakedData(payload, totalFrames);

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    frames.push(bakeFrame(frameIndex, payload, durationMs, state, pre));

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
  const pre = createPrebakedData(payload, totalFrames);

  const frames: BakedTimeline = [];
  let frameIndex = 0;

  const step = () =>
    new Promise<void>((resolve) => {
      const end = Math.min(totalFrames, frameIndex + Math.max(1, framesPerChunk));

      for (; frameIndex <= end; frameIndex += 1) {
        frames.push(bakeFrame(frameIndex, payload, durationMs, state, pre));

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
