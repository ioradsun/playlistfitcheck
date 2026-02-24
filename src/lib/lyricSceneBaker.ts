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
  words?: Array<{ word: string; start: number; end: number }>;
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
    entryOffsetY: number;
    entryOffsetX: number;
    entryScale: number;
    exitOffsetY: number;
    exitScale: number;
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
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

type WordDirectiveLike = {
  word?: string;
  kineticClass?: string;
  colorOverride?: string;
  emphasisLevel?: number;
};

interface WordEntry {
  word: string;
  start: number;
  end: number;
}

type WordMetaEntry = WordEntry & {
  clean: string;
  directive: WordDirectiveLike | null;
  lineIndex: number;
  wordIndex: number;
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
    colorOverride?: string;
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
  springInitialVelocity: number;
  glowMax: number;
  energy: number;
  density: number;
  wordMeta: WordMetaEntry[];
};

const WORD_LINGER = 0.5;

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
  const minChannel = 170;
  const br = Math.max(minChannel, Math.round(r + (255 - r) * whiteFraction));
  const bg = Math.max(minChannel, Math.round(g + (255 - g) * whiteFraction));
  const bb = Math.max(minChannel, Math.round(b + (255 - b) * whiteFraction));
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
  const beatResponse = payload.cinematic_direction?.visualWorld?.physicsProfile?.beatResponse ?? 'slam';
  const heat = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat ?? 0.5;

  const shotCycle = ['Medium', 'CloseUp', 'Wide', 'CloseUp', 'Medium', 'Wide'];
  const chapterCount = Math.max(1, chapters.length || 4);


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

    const shotFontSizes: Record<string, number> = {
      Wide: 22,
      Medium: 36,
      Close: 48,
      CloseUp: 52,
      ExtremeClose: 64,
      FloatingInWorld: 30,
    };

    return Math.round((shotFontSizes[shot] ?? 36) * weightScale);
  });


  const lineColors = payload.lines.map((_, idx) => {
    const line = payload.lines[idx];
    const lineProgress = songDuration > 0
      ? ((line.start ?? 0) - (payload.songStart ?? 0)) / songDuration
      : 0;
    const chapter = findByRatio(chapters, lineProgress);
    const chapterIndex = chapters.indexOf(chapter as ChapterLike);
    const colorOverride = chapter?.typographyShift?.colorOverride;
    if (colorOverride) return colorOverride;

    const textColor = payload.palette?.[2] ?? '#F0F0F0';
    const accentColor = payload.palette?.[1] ?? '#FFD700';
    const baseColor = chapterIndex >= 2 ? accentColor : textColor;
    return blendWithWhite(baseColor, 0.55);
  });

  const chapterIndexByFrame = new Array<number>(totalFrames + 1).fill(-1);
  const tensionMotionByFrame = new Array<number>(totalFrames + 1).fill(0.5);
  const activeLineByFrame = new Array<number>(totalFrames + 1).fill(-1);
  const words: WordEntry[] = payload.words ?? [];
  const wordMeta: WordMetaEntry[] = words.map((w) => {
    const clean = w.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const directive = wordDirectivesMap[clean] ?? null;
    const lineIndex = payload.lines.findIndex(
      (l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? 9999),
    );
    return {
      ...w,
      clean,
      directive,
      lineIndex: Math.max(0, lineIndex),
      wordIndex: 0,
    };
  });

  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) {
    lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0;
    wm.wordIndex = lineWordCounters[wm.lineIndex]++;
  }

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
    springInitialVelocity: beatResponse === 'slam' ? 1.8 * heat : 0.8 * heat,
    glowMax: beatResponse === 'slam' ? 1.2 * heat : 0.6 * heat,
    energy,
    density,
    wordMeta,
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
    state.springVelocity = pre.springInitialVelocity;
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

  if (pre.wordMeta.length > 0) {
    // Pre-compute x positions for each word within its line
    // so words lay out as readable text centered on canvas
    const wordPositions = pre.wordMeta.map((wm) => {
      const lineWords = pre.wordMeta.filter((w) => w.lineIndex === wm.lineIndex);
      const totalWidth = lineWords.reduce((sum, w) => sum + (w.word.length * 18), 0);
      const startX = (960 / 2) - (totalWidth / 2);

      let x = startX;
      for (const lw of lineWords) {
        if (lw.wordIndex === wm.wordIndex) break;
        x += lw.word.length * 18 + 12;
      }
      x += (wm.word.length * 18) / 2;

      // Y varies by line index for multi-line feel
      const y = (540 / 2) + ((wm.lineIndex % 3) - 1) * 52;

      return { x, y };
    });

    const wordChunks = pre.wordMeta
      .filter((wm) => tSec >= wm.start && tSec < (wm.end + WORD_LINGER))
      .map((wm) => {
        const elapsed = tSec - wm.start;
        const remaining = (wm.end + WORD_LINGER) - tSec;

        const entryAlpha = Math.min(1, elapsed / 0.04);
        const exitAlpha = Math.min(1, remaining / 0.08);
        const alpha = Math.min(entryAlpha, exitAlpha);

        const stagger = wm.wordIndex * 0.025;
        const adjustedElapsed = elapsed - stagger;
        const ep = adjustedElapsed > 0 ? easeOut(Math.min(1, adjustedElapsed / 0.18)) : 0;

        const storyEntry = payload.cinematic_direction?.storyboard?.[wm.lineIndex];
        const entryStyle = storyEntry?.entryStyle ?? 'fades';
        const kinetic = wm.directive?.kineticClass;

        let offsetY = 0;
        let offsetX = 0;
        let entryScale = 1;
        if (kinetic === 'RISING' || entryStyle === 'rises') {
          offsetY = (1 - ep) * 40;
        } else if (entryStyle === 'slams-in' || kinetic === 'IMPACT') {
          entryScale = 1 + (1 - ep) * 0.5;
        } else if (entryStyle === 'fractures-in') {
          offsetX = (1 - ep) * -35;
        } else if (entryStyle === 'materializes') {
          entryScale = 0.8 + ep * 0.2;
        } else if (kinetic === 'FALLING') {
          offsetY = (1 - ep) * -30;
        }

        // Remove xSpread/ySpread — use pre-computed position instead
        const pos = wordPositions[pre.wordMeta.indexOf(wm)];
        const x = pos.x;
        const y = pos.y;

        const color = wm.directive?.colorOverride
          ?? pre.lineColors[wm.lineIndex]
          ?? '#ffffff';

        const emphasisLevel = wm.directive?.emphasisLevel ?? 1;
        const baseFontSize = pre.lineFontSizes[wm.lineIndex] ?? 36;
        const fontSize = Math.round(baseFontSize * (1 + (emphasisLevel - 1) * 0.15));

        const wordGlow = emphasisLevel >= 4
          ? glow * 1.5
          : emphasisLevel >= 3
            ? glow * 1.1
            : glow;

        return {
          id: `${wm.lineIndex}-${wm.wordIndex}`,
          x: x + offsetX,
          y: y + offsetY,
          alpha,
          scale: entryScale,
          visible: alpha > 0.01,
          fontSize,
          color,
          glow: wordGlow,
          entryOffsetY: 0,
          entryOffsetX: 0,
          entryScale,
          exitOffsetY: 0,
          exitScale: 1,
        };
      });

    chunks.push(...wordChunks);
  } else {

    for (let idx = 0; idx < payload.lines.length; idx += 1) {
      const line = payload.lines[idx];
      const lineActive = idx === activeLineIndex;
      const storyboardEntry = payload.cinematic_direction?.storyboard?.[idx] ?? null;
      const entryStyle = storyboardEntry?.entryStyle ?? 'fades';
      const exitStyle = storyboardEntry?.exitStyle ?? 'fades';

      const lineStart = line.start ?? 0;
      const lineEnd = line.end ?? 0;
      const isCutStyle = (entryStyle as string) === 'cuts' || (exitStyle as string) === 'cuts';
      const fadeIn = isCutStyle
        ? (tSec >= lineStart ? 1 : 0)
        : Math.min(1, Math.max(0, (tSec - lineStart) / 0.2));
      const fadeOut = isCutStyle
        ? (tSec < lineEnd ? 1 : 0)
        : Math.min(1, Math.max(0, (lineEnd - tSec) / 0.3));
      const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));

      const x = BASE_X;
      const y = BASE_Y_CENTER;

      const visible = alpha > 0.001;
      const heroWord = storyboardEntry?.heroWord ?? pre.lineHeroWords[idx] ?? null;

      const elapsed = tSec - lineStart;
      const remaining = lineEnd - tSec;

      const entryDuration = 0.25;
      const exitDuration = exitStyle === 'lingers' ? 0.5 : 0.3;
      const entryProgress = Math.min(1, Math.max(0, elapsed / entryDuration));
      const exitProgress = Math.min(1, Math.max(0, 1 - remaining / exitDuration));
      const ep = easeOut(entryProgress);
      const xp = easeOut(exitProgress);

      let entryOffsetY = 0;
      let entryOffsetX = 0;
      let entryScale = 1;
      let exitOffsetY = 0;
      let exitScale = 1;

      if (!isCutStyle) {
      if (entryStyle === 'rises') {
        entryOffsetY = (1 - ep) * 40;
      } else if (entryStyle === 'slams-in') {
        entryScale = 1 + (1 - ep) * 0.4;
      } else if (entryStyle === 'materializes') {
        entryScale = 0.85 + ep * 0.15;
      } else if (entryStyle === 'fractures-in') {
        entryOffsetX = (1 - ep) * -30;
      } else if ((entryStyle as string) === 'hiding') {
        entryScale = 0.7 + ep * 0.3;
      }

      if (exitStyle === 'dissolves-upward') {
        exitOffsetY = xp * -30;
      } else if (exitStyle === 'burns-out') {
        exitScale = 1 + xp * 0.15;
      } else if (exitStyle === 'shatters') {
        exitScale = 1 + xp * 0.25;
      }
      }

      const chunkGlow = lineActive && visible ? glow * pre.glowMax : 0;
      const chunkScale = lineActive && visible ? scale : 1.0;


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
        entryOffsetY,
        entryOffsetX,
        entryScale,
        exitOffsetY,
        exitScale,
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
            entryOffsetY,
            entryOffsetX,
            entryScale,
            exitOffsetY,
            exitScale,
          });
        }
        }
      }
    }
  }

  const chapterIdx = pre.chapterIndexByFrame[frameIndex] ?? -1;
  const bgBlend = chapterIdx >= 0 ? (chapterIdx / Math.max(1, pre.chapters.length - 1)) : 0;

  const particleCount = Math.floor(pre.energy * 12 + (state.glowBudget / 13) * 20);
  const particles: Keyframe["particles"] = Array.from({ length: particleCount }, (_, i) => {
    const seed = (i * 0.618033) % 1;
    const seed2 = (i * 0.381966) % 1;
    const drift = (tSec * 0.03 * (0.5 + seed * 0.5)) % 1;
    return {
      x: 0.1 + (seed * 0.8),
      y: ((0.1 + seed2 * 0.8) - drift + 1) % 1,
      size: 0.8 + seed * 2.5,
      alpha: (0.04 + (state.glowBudget / 13) * 0.15) * (0.4 + seed * 0.6),
    };
  });

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
