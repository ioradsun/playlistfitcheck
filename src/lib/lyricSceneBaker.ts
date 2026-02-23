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
    scale: number;
    visible: boolean;
    fontSize: number;
    color: string;
  }>;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
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
  lineIndex?: number;
  entryStyle?: string;
  exitStyle?: string;
  heroWord?: string;
  shotType?: string;
};

type ChapterLike = {
  startRatio?: number;
  endRatio?: number;
  dominantColor?: string;
  typographyShift?: {
    fontWeight?: number;
  };
};

type CameraDistanceLike = {
  chapterIndex?: number;
  distance?: string;
};

type BakeState = {
  beats: number[];
  beatCursor: number;
  lastBeatIndex: number;
  glowBudget: number;
  springOffset: number;
  springVelocity: number;
  currentZoom: number;
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

const findByRatio = <T extends { startRatio?: number; endRatio?: number }>(
  arr: T[],
  progress: number,
): T | null =>
  arr?.find((item) =>
    progress >= (item.startRatio ?? 0) &&
    progress < (item.endRatio ?? 1),
  ) ?? arr?.[arr.length - 1] ?? null;

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
  const wordDirectivesMap = (payload.cinematic_direction?.wordDirectives ?? {}) as Record<string, WordDirectiveLike>;
  const tensionCurve = (payload.cinematic_direction?.tensionCurve ?? []) as TensionStageLike[];
  const physSpec = payload.physics_spec as unknown as Record<string, unknown> | null;
  const energy = Number(physSpec?.energy ?? 0.5);
  const density = Number(physSpec?.density ?? 0.5);
  const storyboards = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];
  const songDuration = Math.max(0.01, payload.songEnd - payload.songStart);

  const shotCycle = ['Medium', 'CloseUp', 'Wide', 'CloseUp', 'Medium', 'Wide'];
  const chapterCount = Math.max(1, chapters.length || 4);

  console.log('[BAKER] ratio-based setup — chapters:', chapters.length,
    'first chapter ratio:', chapters[0]?.startRatio, '-', chapters[0]?.endRatio,
    'tension stages:', tensionCurve.length,
    'distanceByChapter:', payload.cinematic_direction?.cameraLanguage?.distanceByChapter?.length);

  const lineShotTypes = payload.lines.map((line, lineIndex) => {
    const storyboardEntry = storyboards[lineIndex] ?? null;
    if (storyboardEntry?.shotType) return storyboardEntry.shotType;
    // Fall back — divide song into equal segments by chapter count
    const progress = ((line.start ?? 0) - payload.songStart) / songDuration;
    const chapterIdx = Math.floor(progress * chapterCount);
    return shotCycle[chapterIdx % shotCycle.length];
  });

  const lineHeroWords = payload.lines.map((_, lineIndex) => {
    const storyboardEntry = storyboards[lineIndex] ?? null;
    const heroWord = storyboardEntry?.heroWord ?? null;
    return heroWord ? wordDirectivesMap[heroWord]?.word ?? heroWord : null;
  });

  const lineFontSizes = payload.lines.map((line, idx) => {
    const shot = lineShotTypes[idx];
    const lineProgress = ((line.start ?? 0) - payload.songStart) / songDuration;
    const currentChapter = findByRatio(chapters, lineProgress);
    const typoShift = currentChapter?.typographyShift;
    const fontWeight = typoShift?.fontWeight
      ?? payload.cinematic_direction?.visualWorld?.typographyProfile?.fontWeight
      ?? 700;
    const weightScale = fontWeight >= 800 ? 1.06 : 1;

    if (shot === "CloseUp") return Math.round(48 * weightScale);
    if (shot === "Wide") return Math.round(24 * weightScale);
    return Math.round(36 * weightScale);
  });

  console.log('[BAKER] storyboard:', JSON.stringify(payload.cinematic_direction?.storyboard?.slice(0, 2)));
  console.log('[BAKER] first 5 lineShotTypes:', lineShotTypes.slice(0, 5));
  console.log('[BAKER] first 5 lineFontSizes:', lineFontSizes.slice(0, 5));

  const lineColors = payload.lines.map((_, idx) => {
    const line = payload.lines[idx];
    const lineProgress = songDuration > 0
      ? ((line.start ?? 0) - (payload.songStart ?? 0)) / songDuration
      : 0;
    const chapter = chapters.find((ch) =>
      lineProgress >= (ch.startRatio ?? 0) && lineProgress < (ch.endRatio ?? 1),
    );
    const color = chapter?.dominantColor ?? payload.palette?.[0] ?? '#ffffff';
    return blendWithWhite(color, 0.55);
  });

  const chapterIndexByFrame = new Array<number>(totalFrames + 1).fill(-1);
  const tensionMotionByFrame = new Array<number>(totalFrames + 1).fill(0.5);
  const activeLineByFrame = new Array<number>(totalFrames + 1).fill(-1);

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    const tSec = payload.songStart + (frameIndex * FRAME_STEP_MS) / 1000;
    const progress = Math.min(1, (tSec - payload.songStart) / songDuration);

    const chapter = findByRatio(chapters, progress);
    chapterIndexByFrame[frameIndex] = chapter ? chapters.indexOf(chapter) : -1;

    const tension = findByRatio(tensionCurve, progress);
    tensionMotionByFrame[frameIndex] = tension?.motionIntensity ?? tension?.motion ?? 0.5;

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
    state.glowBudget = 13;
    state.springVelocity = 1.2;
  }
  if (state.glowBudget > 0) state.glowBudget -= 1;
  const glowProgress = state.glowBudget / 13;
  const glow = glowProgress > 0.77
    ? (glowProgress - 0.77) / 0.23
    : glowProgress / 0.77;

  state.springOffset += state.springVelocity;
  state.springVelocity *= 0.82;
  state.springOffset *= 0.88;
  const scale = 1.0 + Math.max(0, state.springOffset);

  const tensionMotion = pre.tensionMotionByFrame[frameIndex] ?? 0.5;

  const chapters = pre.chapters;
  const distanceToZoom: Record<string, number> = {
    'Wide': 0.82,
    'Medium': 1.0,
    'Close': 1.15,
    'CloseUp': 1.2,
    'ExtremeClose': 1.35,
    'FloatingInWorld': 0.95,
  };
  const currentChapterIdx = chapters.findIndex((ch) =>
    songProgress >= (ch.startRatio ?? 0) && songProgress < (ch.endRatio ?? 1),
  );
  const chapterCameraEntry = (payload.cinematic_direction?.cameraLanguage?.distanceByChapter ?? [])
    .find((d) => (d as CameraDistanceLike).chapterIndex === currentChapterIdx) as CameraDistanceLike | undefined;
  const targetZoom = distanceToZoom[chapterCameraEntry?.distance ?? 'Medium'] ?? 1.0;

  state.currentZoom = state.currentZoom ?? 1.0;
  state.currentZoom += (targetZoom - state.currentZoom) * 0.015;

  const chunks: Keyframe["chunks"] = [];

  for (let idx = 0; idx < payload.lines.length; idx += 1) {
    const line = payload.lines[idx];
    const lineActive = idx === activeLineIndex;

    const fadeIn = Math.min(1, Math.max(0, (tSec - line.start) / 0.2));
    const fadeOut = Math.min(1, Math.max(0, (line.end - tSec) / 0.3));
    const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));

    const x = BASE_X;
    const y = BASE_Y_CENTER;

    const visible = alpha > 0.001;
    const storyboardEntry = payload.cinematic_direction?.storyboard?.[idx] ?? null;
    const entryStyle = storyboardEntry?.entryStyle ?? 'fades';
    const exitStyle = storyboardEntry?.exitStyle ?? 'fades';
    const heroWord = storyboardEntry?.heroWord ?? pre.lineHeroWords[idx] ?? null;

    const chunkGlow = lineActive && visible ? glow * 0.9 : 0;
    const chunkScale = lineActive && visible ? scale : 1.0;

    if (frameIndex === 100) {
      console.log('[BAKER frame 100] cameraZoom:', state.currentZoom,
        'springOffset:', state.springOffset,
        'springVelocity:', state.springVelocity,
        'beatIndex:', beatIndex,
        'active chunk scale:', chunkScale, 'lineActive:', lineActive);
    }

    chunks.push({
      id: `${idx}`,
      x,
      y,
      alpha,
      glow: chunkGlow,
      scale: chunkScale,
      visible,
      fontSize: pre.lineFontSizes[idx] ?? 36,
      color: pre.lineColors[idx] ?? "#ffffff",
    });

    if (lineActive) {
      const wordDirectivesMap = (payload.cinematic_direction?.wordDirectives ?? {}) as Record<string, WordDirectiveLike>;
      const lineHeroWord = heroWord
        ? wordDirectivesMap[heroWord] ?? null
        : null;
      const normalizedText = (line.text ?? "").toLowerCase();
      const directiveWord = (lineHeroWord?.word ?? heroWord ?? "").trim();

      if (directiveWord) {
        const lowerHero = directiveWord.toLowerCase();
        const heroStart = normalizedText.indexOf(lowerHero);
        if (heroStart >= 0) {
          const preText = line.text.slice(0, heroStart);
          const approxCharW = 12;
          const preOffset = (preText.length * approxCharW) / 2;
          const heroOffset = (directiveWord.length * approxCharW) / 2;

          chunks.push({
            id: `${idx}-hero`,
            x: x + preOffset + heroOffset,
            y,
            alpha: Math.min(1, alpha + ((entryStyle as string) === 'punch' ? 0.2 : 0.15)),
            glow: Math.min(1, chunkGlow + 0.2),
            scale: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            visible,
            fontSize: pre.lineFontSizes[idx] ?? 36,
            color: pre.lineColors[idx] ?? "#ffffff",
          });
        }
      }
    }
  }

  const chapterIdx = pre.chapterIndexByFrame[frameIndex] ?? -1;
  const bgBlend = chapterIdx >= 0 ? (chapterIdx / Math.max(1, pre.chapters.length - 1)) : 0;

  const particles: Keyframe["particles"] = [];
  const particleCount = Math.floor(pre.energy * 4);
  for (let p = 0; p < particleCount; p += 1) {
    particles.push({
      x: Math.sin(songProgress * Math.PI * (p + 1) * 2.3) * 400 + 480,
      y: Math.cos(songProgress * Math.PI * (p + 1) * 1.7) * 250 + 270,
      size: 2 + pre.energy * 3,
      alpha: 0.15 + glow * 0.3,
    });
  }

  return {
    timeMs,
    chunks,
    cameraX: Math.sin(songProgress * Math.PI * 3.7) * 14 * tensionMotion,
    cameraY: Math.cos(songProgress * Math.PI * 2.3) * 8 * tensionMotion,
    cameraZoom: state.currentZoom,
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
    glowBudget: 0,
    springOffset: 0,
    springVelocity: 0,
    currentZoom: 1.0,
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
