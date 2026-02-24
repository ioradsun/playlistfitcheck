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
  bpm?: number | null;
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
    scaleX: number;
    scaleY: number;
    visible: boolean;
    fontSize: number;
    color: string;
    entryOffsetY: number;
    entryOffsetX: number;
    entryScale: number;
    exitOffsetY: number;
    exitScale: number;
    skewX: number;
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
const easeIn = (t: number): number => Math.pow(t, 3);
const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutElastic = (t: number): number => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
};

type EntryStyle =
  | 'slam-down' | 'punch-in' | 'explode-in' | 'snap-in' | 'shatter-in'
  | 'rise' | 'materialize' | 'breathe-in' | 'drift-in' | 'surface'
  | 'drop' | 'plant' | 'stomp' | 'cut-in'
  | 'whisper' | 'bloom' | 'melt-in' | 'ink-drop'
  | 'fades';

type BehaviorStyle =
  | 'pulse' | 'vibrate' | 'float' | 'grow' | 'contract'
  | 'flicker' | 'orbit' | 'lean' | 'none';

type ExitStyle =
  | 'shatter' | 'snap-out' | 'burn-out' | 'punch-out'
  | 'dissolve' | 'drift-up' | 'exhale' | 'sink'
  | 'drop-out' | 'cut-out' | 'vanish'
  | 'linger' | 'evaporate' | 'whisper-out'
  | 'fades';

type MotionProfile = 'weighted' | 'fluid' | 'elastic' | 'drift' | 'glitch';

interface MotionDefaults {
  entries: EntryStyle[];
  behaviors: BehaviorStyle[];
  exits: ExitStyle[];
  entryDuration: number;
  exitDuration: number;
  behaviorIntensity: number;
}

interface AnimState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  skewX: number;
  glowMult: number;
}

const MOTION_DEFAULTS: Record<MotionProfile, MotionDefaults> = {
  weighted: { entries: ['slam-down', 'drop', 'plant', 'stomp'], behaviors: ['pulse', 'vibrate', 'pulse', 'grow'], exits: ['shatter', 'snap-out', 'burn-out'], entryDuration: 0.1, exitDuration: 0.12, behaviorIntensity: 1.2 },
  fluid: { entries: ['rise', 'materialize', 'breathe-in', 'drift-in'], behaviors: ['float', 'grow', 'float', 'lean'], exits: ['dissolve', 'drift-up', 'linger'], entryDuration: 0.35, exitDuration: 0.4, behaviorIntensity: 0.6 },
  elastic: { entries: ['explode-in', 'punch-in', 'breathe-in'], behaviors: ['pulse', 'orbit', 'pulse', 'float'], exits: ['punch-out', 'snap-out'], entryDuration: 0.15, exitDuration: 0.1, behaviorIntensity: 1.0 },
  drift: { entries: ['whisper', 'surface', 'drift-in', 'bloom'], behaviors: ['float', 'flicker', 'float', 'grow'], exits: ['evaporate', 'linger', 'sink'], entryDuration: 0.5, exitDuration: 0.6, behaviorIntensity: 0.4 },
  glitch: { entries: ['snap-in', 'cut-in', 'shatter-in'], behaviors: ['vibrate', 'flicker', 'vibrate', 'orbit'], exits: ['cut-out', 'snap-out', 'burn-out'], entryDuration: 0.05, exitDuration: 0.06, behaviorIntensity: 1.4 },
};
type VisualMode = 'intimate' | 'cinematic' | 'explosive';

const INTIMATE_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.42, 0.48], [0.58, 0.52]],
  3: [[0.38, 0.45], [0.5, 0.55], [0.62, 0.45]],
  4: [[0.35, 0.43], [0.5, 0.37], [0.5, 0.6], [0.65, 0.5]],
  5: [[0.35, 0.4], [0.45, 0.58], [0.5, 0.35], [0.55, 0.58], [0.65, 0.4]],
  6: [[0.35, 0.4], [0.45, 0.58], [0.5, 0.35], [0.55, 0.58], [0.65, 0.4], [0.5, 0.5]],
};

const CINEMATIC_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.45], [0.7, 0.55]],
  3: [[0.25, 0.35], [0.5, 0.55], [0.75, 0.38]],
  4: [[0.28, 0.35], [0.72, 0.32], [0.25, 0.65], [0.72, 0.65]],
  5: [[0.18, 0.38], [0.38, 0.65], [0.5, 0.3], [0.65, 0.65], [0.82, 0.38]],
  6: [[0.2, 0.32], [0.5, 0.25], [0.8, 0.32], [0.22, 0.68], [0.5, 0.73], [0.78, 0.65]],
};

const EXPLOSIVE_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.22, 0.42], [0.78, 0.58]],
  3: [[0.15, 0.35], [0.55, 0.65], [0.85, 0.3]],
  4: [[0.15, 0.3], [0.82, 0.28], [0.18, 0.7], [0.8, 0.68]],
  5: [[0.12, 0.35], [0.35, 0.72], [0.5, 0.25], [0.68, 0.7], [0.88, 0.33]],
  6: [[0.12, 0.28], [0.42, 0.18], [0.82, 0.25], [0.15, 0.72], [0.55, 0.8], [0.85, 0.7]],
};

const getVisualMode = (payload: ScenePayload): VisualMode => {
  const sceneManifest = payload.scene_manifest ?? null;
  const manifestMode = (sceneManifest as any)?.visualMode;
  if (manifestMode === 'intimate' || manifestMode === 'cinematic' || manifestMode === 'explosive') return manifestMode;
  if (!payload.cinematic_direction) return 'cinematic';
  const physicsProfile = payload.cinematic_direction.visualWorld?.physicsProfile;
  const backgroundSystem = payload.cinematic_direction.visualWorld?.backgroundSystem ?? 'default';
  const heat = physicsProfile?.heat ?? 0.5;
  const beatResponse = physicsProfile?.beatResponse ?? 'pulse';

  return heat > 0.7 || backgroundSystem === 'storm' || beatResponse === 'slam'
    ? 'explosive'
    : heat > 0.4 || backgroundSystem === 'cosmic' || backgroundSystem === 'urban'
      ? 'cinematic'
      : 'intimate';
};


function deriveMotionProfile(payload: ScenePayload): MotionProfile {
  const physics = payload.cinematic_direction?.visualWorld?.physicsProfile;
  const heat = physics?.heat ?? 0.5;
  const beatResponse = physics?.beatResponse ?? 'pulse';
  const backgroundSystem = payload.cinematic_direction?.visualWorld?.backgroundSystem ?? '';
  const chaos = (physics as Record<string, unknown> | undefined)?.chaos ?? 'stable';

  if (beatResponse === 'slam' || heat > 0.75) return 'weighted';
  if (chaos === 'glitch' || backgroundSystem === 'urban') return 'glitch';
  if (heat > 0.55 || backgroundSystem === 'storm') return 'elastic';
  if (heat < 0.3 || backgroundSystem === 'intimate') return 'drift';
  return 'fluid';
}

function assignWordAnimations(
  wm: WordMetaEntry,
  motionDefaults: MotionDefaults,
  storyboard: StoryboardEntryLike[],
  manifestDirective: ManifestWordDirective | null,
): { entry: EntryStyle; behavior: BehaviorStyle; exit: ExitStyle } {
  const storyEntry = storyboard?.[wm.lineIndex];
  const kinetic = wm.directive?.kineticClass ?? null;
  const emphasisLevel = wm.directive?.emphasisLevel ?? 1;

  if (manifestDirective?.entryStyle) {
    return {
      entry: manifestDirective.entryStyle,
      behavior: manifestDirective.behavior ?? 'none',
      exit: manifestDirective.exitStyle ?? motionDefaults.exits[0],
    };
  }

  if (kinetic === 'IMPACT') return { entry: 'slam-down', behavior: 'pulse', exit: 'burn-out' };
  if (kinetic === 'RISING') return { entry: 'rise', behavior: 'float', exit: 'drift-up' };
  if (kinetic === 'FALLING') return { entry: 'drop', behavior: 'none', exit: 'sink' };
  if (kinetic === 'SPINNING') return { entry: 'explode-in', behavior: 'orbit', exit: 'shatter' };
  if (kinetic === 'FLOATING') return { entry: 'bloom', behavior: 'float', exit: 'evaporate' };

  if (emphasisLevel >= 4) {
    return { entry: motionDefaults.entries[0], behavior: motionDefaults.behaviors[0], exit: motionDefaults.exits[0] };
  }

  const storyEntryStyle = storyEntry?.entryStyle ?? 'fades';
  const entryMap: Record<string, EntryStyle> = {
    rises: 'rise',
    'slams-in': 'slam-down',
    'fractures-in': 'shatter-in',
    materializes: 'materialize',
    hiding: 'whisper',
    cuts: 'snap-in',
    fades: motionDefaults.entries[1] ?? 'materialize',
  };
  const exitMap: Record<string, ExitStyle> = {
    'dissolves-upward': 'drift-up',
    'burns-out': 'burn-out',
    shatters: 'shatter',
    lingers: 'linger',
    fades: motionDefaults.exits[1] ?? 'dissolve',
  };

  // Use lineIndex + wordIndex as seed for variation across groups
  const variationSeed = ((wm.lineIndex ?? 0) * 7 + (wm.wordIndex ?? 0) * 3) % 4;

  const entryVariant = motionDefaults.entries[variationSeed % motionDefaults.entries.length];
  const behaviorOptions = motionDefaults.behaviors;
  const behaviorVariant = behaviorOptions.length > 0
    ? behaviorOptions[variationSeed % behaviorOptions.length]
    : 'pulse';
  const exitVariant = motionDefaults.exits[variationSeed % motionDefaults.exits.length];

  return {
    entry: entryMap[storyEntryStyle] ?? entryVariant,
    behavior: behaviorVariant,
    exit: exitMap[storyEntry?.exitStyle ?? 'fades'] ?? exitVariant,
  };
}

function computeEntryState(style: EntryStyle, progress: number, intensity: number): AnimState {
  const ep = easeOut(Math.min(1, progress));
  const eb = easeOutBack(Math.min(1, progress));
  const ee = easeOutElastic(Math.min(1, progress));

  switch (style) {
    case 'slam-down': return { offsetX: 0, offsetY: -(1 - ep) * 80 * intensity, scaleX: 1 + (1 - ep) * 0.3 * intensity, scaleY: ep < 0.9 ? 1 : 1 - (1 - ep) * 10 * intensity, alpha: Math.min(1, progress * 8), skewX: 0, glowMult: ep > 0.85 ? (1 - ep) * 4 : 0 };
    case 'punch-in': return { offsetX: (1 - eb) * -120 * intensity, offsetY: 0, scaleX: 1, scaleY: 1, alpha: Math.min(1, progress * 6), skewX: (1 - ep) * -8 * intensity, glowMult: 0 };
    case 'explode-in': return { offsetX: 0, offsetY: 0, scaleX: 1 + (1 - ep) * 2.5 * intensity, scaleY: 1 + (1 - ep) * 2.5 * intensity, alpha: Math.min(1, progress * 4), skewX: 0, glowMult: (1 - ep) * 2 };
    case 'snap-in': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: progress > 0.01 ? 1 : 0, skewX: 0, glowMult: 0 };
    case 'rise': return { offsetX: 0, offsetY: (1 - ep) * 45 * intensity, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0 };
    case 'materialize': return { offsetX: 0, offsetY: 0, scaleX: 0.75 + ep * 0.25, scaleY: 0.75 + ep * 0.25, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: 0, glowMult: (1 - ep) * 0.8 };
    case 'breathe-in': return { offsetX: 0, offsetY: 0, scaleX: 0.9 + ee * 0.1, scaleY: 0.9 + ee * 0.1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0 };
    case 'drift-in': return { offsetX: (1 - ep) * -30, offsetY: (1 - ep) * 10, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: (1 - ep) * -3, glowMult: 0 };
    case 'surface': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: easeIn(Math.min(1, progress * 1.2)), skewX: 0, glowMult: (1 - ep) * 1.5 };
    case 'drop': return { offsetX: 0, offsetY: -(1 - ep) * 60 * intensity, scaleX: 1, scaleY: 1, alpha: progress > 0.1 ? 1 : 0, skewX: 0, glowMult: 0 };
    case 'plant': return { offsetX: 0, offsetY: 0, scaleX: 1 + (1 - ep) * 0.2, scaleY: 1 + (1 - ep) * 0.2, alpha: progress > 0.05 ? 1 : 0, skewX: 0, glowMult: 0 };
    case 'stomp': { const wipeProgress = Math.min(1, progress * 3); return { offsetX: 0, offsetY: (1 - wipeProgress) * 20, scaleX: 1, scaleY: wipeProgress, alpha: wipeProgress, skewX: 0, glowMult: 0 }; }
    case 'cut-in': return { offsetX: (1 - ep) * -40, offsetY: 0, scaleX: 1, scaleY: 1, alpha: Math.min(1, progress * 5), skewX: 0, glowMult: 0 };
    case 'whisper': return { offsetX: 0, offsetY: 0, scaleX: 0.95 + ep * 0.05, scaleY: 0.95 + ep * 0.05, alpha: easeIn(Math.min(1, progress * 0.8)), skewX: 0, glowMult: 0 };
    case 'bloom': return { offsetX: 0, offsetY: 0, scaleX: 0.5 + ep * 0.5, scaleY: 0.5 + ep * 0.5, alpha: easeOut(Math.min(1, progress * 1.2)), skewX: 0, glowMult: (1 - ep) * 2.5 };
    case 'melt-in': return { offsetX: 0, offsetY: (1 - ep) * 15, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 1.8)), skewX: (1 - ep) * 2, glowMult: 0 };
    case 'ink-drop': return { offsetX: 0, offsetY: 0, scaleX: ep < 0.5 ? ep * 2 : 1, scaleY: ep < 0.5 ? ep * 2 : 1, alpha: Math.min(1, progress * 3), skewX: 0, glowMult: (1 - ep) * 0.5 };
    case 'shatter-in': return { offsetX: (1 - ep) * (Math.random() > 0.5 ? 30 : -30), offsetY: (1 - ep) * (Math.random() > 0.5 ? -20 : 20), scaleX: 0.8 + ep * 0.2, scaleY: 0.8 + ep * 0.2, alpha: Math.min(1, progress * 4), skewX: (1 - ep) * 5, glowMult: 0 };
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0 };
  }
}

function computeExitState(style: ExitStyle, progress: number, intensity: number): AnimState {
  const ep = easeOut(Math.min(1, progress));
  const ei = easeIn(Math.min(1, progress));
  switch (style) {
    case 'shatter': return { offsetX: ep * 40 * (Math.random() > 0.5 ? 1 : -1), offsetY: ep * -30, scaleX: 1 + ep * 0.4, scaleY: 1 - ep * 0.3, alpha: 1 - ei, skewX: ep * 10, glowMult: ep * 1.5 };
    case 'snap-out': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: progress > 0.02 ? 0 : 1, skewX: 0, glowMult: 0 };
    case 'burn-out': return { offsetX: 0, offsetY: 0, scaleX: 1 + ep * 0.1, scaleY: 1 + ep * 0.1, alpha: 1 - ei, skewX: 0, glowMult: ep * 3 };
    case 'punch-out': return { offsetX: ep * 150 * intensity, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 3), skewX: ep * 8, glowMult: 0 };
    case 'dissolve': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0 };
    case 'drift-up': return { offsetX: 0, offsetY: -ep * 35, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0 };
    case 'exhale': return { offsetX: 0, offsetY: 0, scaleX: 1 - ep * 0.1, scaleY: 1 - ep * 0.1, alpha: 1 - ep, skewX: 0, glowMult: 0 };
    case 'sink': return { offsetX: 0, offsetY: ep * 40, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0 };
    case 'drop-out': return { offsetX: 0, offsetY: ep * 200 * intensity, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 4), skewX: 0, glowMult: 0 };
    case 'cut-out': return { offsetX: ep * 60, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 5), skewX: 0, glowMult: 0 };
    case 'vanish': return { offsetX: 0, offsetY: 0, scaleX: 1 - ei * 0.8, scaleY: 1 - ei * 0.8, alpha: 1 - ei, skewX: 0, glowMult: 0 };
    case 'linger': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 0.28, skewX: 0, glowMult: 0 };
    case 'evaporate': return { offsetX: 0, offsetY: -ep * 12, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 0.7)), skewX: 0, glowMult: 0 };
    case 'whisper-out': return { offsetX: 0, offsetY: 0, scaleX: 1 - ep * 0.08, scaleY: 1 - ep * 0.08, alpha: 1 - easeIn(Math.min(1, progress * 0.9)), skewX: 0, glowMult: 0 };
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0 };
  }
}

function computeBehaviorState(style: BehaviorStyle, tSec: number, wordStart: number, beatPhase: number, intensity: number): Partial<AnimState> {
  const age = tSec - wordStart;
  switch (style) {
    case 'pulse': { const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.04 * intensity; return { scaleX: 1 + pulse, scaleY: 1 + pulse }; }
    case 'vibrate': return { offsetX: Math.sin(tSec * 80) * 1.5 * intensity };
    case 'float': return { offsetY: Math.sin(age * 1.8) * 4 * intensity };
    case 'grow': { const growScale = 1 + Math.min(0.15, age * 0.04) * intensity; return { scaleX: growScale, scaleY: growScale }; }
    case 'contract': { const contractScale = 1 - Math.min(0.1, age * 0.03) * intensity; return { scaleX: contractScale, scaleY: contractScale }; }
    case 'flicker': return { alpha: 0.85 + Math.random() * 0.15 };
    case 'orbit': { const angle = age * 1.2; return { offsetX: Math.sin(angle) * 2 * intensity, offsetY: Math.cos(angle) * 1.5 * intensity }; }
    case 'lean': return { skewX: Math.sin(age * 0.8) * 4 * intensity };
    default: return {};
  }
}

const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'i', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'but',
  'is', 'it', 'my', 'me', 'you', 'we', 'he', 'she', 'they', 'im', 'its',
  'was', 'be', 'do', 'got', 'get', 'just', 'so', 'no', 'not', 'for', 'with',
  'that', 'this', 'they', 'are', 'have', 'had', 'his', 'her', 'our', 'your',
  'all', 'been', 'has', 'would', 'will', 'can', 'could', 'if', 'as', 'up',
]);

const MIN_GROUP_DURATION = 0.4;
const MAX_GROUP_SIZE = 5;

function isFillerWord(word: string): boolean {
  return FILLER_WORDS.has(word.replace(/[^a-zA-Z]/g, '').toLowerCase());
}

type WordDirectiveLike = {
  word?: string;
  kineticClass?: string;
  colorOverride?: string;
  emphasisLevel?: number;
};


type ManifestWordDirective = {
  position?: [number, number];
  fontSize?: number;
  scaleX?: number;
  scaleY?: number;
  color?: string;
  glow?: number;
  entryStyle?: EntryStyle;
  behavior?: BehaviorStyle;
  exitStyle?: ExitStyle;
  kineticClass?: string;
};

type ManifestLineLayout = {
  positions?: Array<[number, number]>;
  stagger?: number;
};

type ManifestChapter = {
  zoom?: number;
  driftIntensity?: number;
  dominantColor?: string;
  atmosphere?: string;
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

interface PhraseGroup {
  words: WordMetaEntry[];
  start: number;
  end: number;
  anchorWordIdx: number;
  lineIndex: number;
  groupIndex: number;
}

interface GroupPosition {
  x: number;
  y: number;
  fontSize: number;
  isAnchor: boolean;
  isFiller: boolean;
}

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
  emotionalIntensity?: number;
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
  visualMode: VisualMode;
  heat: number;
};

function getLayoutForMode(
  mode: VisualMode,
  wordIndex: number,
  totalWords: number,
  chapterEmotionalIntensity: number,
): [number, number] {
  const effectiveMode = chapterEmotionalIntensity > 0.8 && mode !== 'intimate' ? 'explosive' : mode;
  const templates = effectiveMode === 'explosive'
    ? EXPLOSIVE_LAYOUTS
    : effectiveMode === 'cinematic'
      ? CINEMATIC_LAYOUTS
      : INTIMATE_LAYOUTS;
  const cap = Math.min(totalWords, 6);
  const template = templates[cap] ?? templates[6];
  return template[wordIndex % template.length];
}

function getWordFontSize(
  word: string,
  directive: WordDirectiveLike | null,
  baseFontSize: number,
  visualMode: VisualMode,
): number {
  const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (isFillerWord(clean)) return Math.round(baseFontSize * 0.65);

  const emphasisLevel = directive?.emphasisLevel ?? 2;
  const emphasisMultiplier = visualMode === 'explosive' ? 0.25
    : visualMode === 'cinematic' ? 0.18 : 0.12;
  const scale = 0.8 + (emphasisLevel - 1) * emphasisMultiplier;
  return Math.round(baseFontSize * scale);
}

function findAnchorWord(words: WordMetaEntry[]): number {
  let maxScore = -1;
  let maxIdx = words.length - 1;

  for (let i = 0; i < words.length; i += 1) {
    const emp = words[i].directive?.emphasisLevel ?? 1;
    const isImpact = words[i].directive?.kineticClass === 'IMPACT';
    const isRising = words[i].directive?.kineticClass === 'RISING';
    const isFiller = isFillerWord(words[i].word);
    const wordLen = words[i].clean.length;

    const score = (emp * 2)
      + (isImpact ? 6 : 0)
      + (isRising ? 4 : 0)
      - (isFiller ? 5 : 0)
      + (wordLen > 5 ? 2 : 0)
      + (wordLen > 8 ? 2 : 0);

    if (score > maxScore) {
      maxScore = score;
      maxIdx = i;
    }
  }
  return maxIdx;
}

function mergeShortGroups(groups: PhraseGroup[]): PhraseGroup[] {
  const result: PhraseGroup[] = [];
  let i = 0;

  while (i < groups.length) {
    const g = groups[i];
    const duration = g.end - g.start;

    if (duration < MIN_GROUP_DURATION && i < groups.length - 1) {
      const next = groups[i + 1];
      if (next.lineIndex === g.lineIndex && (g.words.length + next.words.length) <= MAX_GROUP_SIZE) {
        const mergedWords = [...g.words, ...next.words];
        const merged: PhraseGroup = {
          words: mergedWords,
          start: g.start,
          end: next.end,
          anchorWordIdx: findAnchorWord(mergedWords),
          lineIndex: g.lineIndex,
          groupIndex: g.groupIndex,
        };
        result.push(merged);
        i += 2;
        continue;
      }
    }

    result.push(g);
    i += 1;
  }

  return result;
}

function buildPhraseGroups(wordMeta: WordMetaEntry[]): PhraseGroup[] {
  const lineMap = new Map<number, WordMetaEntry[]>();
  for (const wm of wordMeta) {
    if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []);
    lineMap.get(wm.lineIndex)?.push(wm);
  }

  const groups: PhraseGroup[] = [];

  for (const [lineIdx, words] of lineMap) {
    let current: WordMetaEntry[] = [];
    let groupIdx = 0;

    const flushGroup = () => {
      if (current.length === 0) return;
      groups.push({
        words: [...current],
        start: current[0].start,
        end: current[current.length - 1].end,
        anchorWordIdx: findAnchorWord(current),
        lineIndex: lineIdx,
        groupIndex: groupIdx,
      });
      groupIdx += 1;
      current = [];
    };

    for (let i = 0; i < words.length; i += 1) {
      const wm = words[i];
      current.push(wm);

      const duration = current[current.length - 1].end - current[0].start;
      const isNaturalBreak = /[,\.!?;]$/.test(wm.word);
      const isMaxSize = current.length >= MAX_GROUP_SIZE;
      const isLast = i === words.length - 1;

      if (isLast) {
        flushGroup();
      } else if ((isNaturalBreak || isMaxSize) && duration >= MIN_GROUP_DURATION) {
        flushGroup();
      }
    }
  }

  groups.sort((a, b) => a.start - b.start);
  return mergeShortGroups(groups).map((group) => ({
    ...group,
    end: Math.max(group.end, group.start + MIN_GROUP_DURATION),
  }));
}

function getGroupLayout(
  group: PhraseGroup,
  visualMode: VisualMode,
  canvasW: number,
  canvasH: number,
  baseFontSize: number,
): GroupPosition[] {
  const count = group.words.length;
  const anchorIdx = group.anchorWordIdx;
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.5;

  const MIN_FONT = 28;

  if (count === 1) {
    const isFiller = isFillerWord(group.words[0].word);
    return [{
      x: cx,
      y: cy,
      fontSize: Math.max(MIN_FONT, isFiller ? baseFontSize * 0.9 : baseFontSize * 1.2),
      isAnchor: true,
      isFiller,
    }];
  }

  const positions: GroupPosition[] = [];
  const spread = visualMode === 'explosive' ? 1.4
    : visualMode === 'cinematic' ? 1.0 : 0.7;

  for (let i = 0; i < count; i += 1) {
    const wm = group.words[i];
    const isFiller = isFillerWord(wm.word);
    const isAnchor = i === anchorIdx;
    const emp = wm.directive?.emphasisLevel ?? 1;

    if (isAnchor) {
      const anchorFontSize = Math.max(
        MIN_FONT,
        baseFontSize * (1.0 + (emp - 1) * 0.15),
      );
      positions.push({ x: cx, y: cy, fontSize: anchorFontSize, isAnchor: true, isFiller });
    } else {
      const relIdx = i - anchorIdx;
      const xOff = relIdx * baseFontSize * 2.2 * spread;
      const yOff = isFiller ? -baseFontSize * 1.1 : baseFontSize * 0.9;

      const supportFontSize = Math.max(
        MIN_FONT,
        isFiller ? baseFontSize * 0.55 : baseFontSize * 0.75,
      );

      positions.push({
        x: cx + xOff,
        y: cy + yOff,
        fontSize: supportFontSize,
        isAnchor: false,
        isFiller,
      });
    }
  }

  const margin = 60;
  for (const pos of positions) {
    pos.x = Math.max(margin, Math.min(canvasW - margin, pos.x));
    pos.y = Math.max(margin, Math.min(canvasH - margin, pos.y));
  }

  return positions;
}

function dimColor(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * factor);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

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

function createPrebakedData(payload: ScenePayload, totalFrames: number, visualMode: VisualMode): PrebakedData {
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
    visualMode,
    heat,
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
  const sceneManifest = (payload.scene_manifest ?? null) as unknown as Record<string, unknown> | null;
  const manifestWordDirectives = (sceneManifest?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
  const manifestLineLayouts = (sceneManifest?.lineLayouts ?? {}) as Record<string, ManifestLineLayout>;
  const manifestChapters = (sceneManifest?.chapters ?? []) as ManifestChapter[];
  const manifestStagger = typeof sceneManifest?.stagger === 'number' ? sceneManifest.stagger : null;
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
  const fallbackZoom = distanceToZoom[chapterCameraEntry?.distance ?? 'Medium'] ?? 1.0;
  const targetZoom = manifestChapters[currentChapterIdx]?.zoom ?? fallbackZoom;

  state.currentZoom = state.currentZoom ?? 1.0;
  state.currentZoom += (targetZoom - state.currentZoom) * 0.015;


  const chunks: Keyframe["chunks"] = [];

  if (pre.wordMeta.length > 0) {
    const currentChapter = findByRatio(chapters, songProgress);
    const chapterEmotionalIntensity = currentChapter?.emotionalIntensity ?? pre.heat;
    const motionProfile = deriveMotionProfile(payload);
    const motionDefaults = MOTION_DEFAULTS[motionProfile];
    const storyboard = payload.cinematic_direction?.storyboard ?? [];
    const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;

    const WORD_LINGER_BY_PROFILE: Record<string, number> = {
      weighted: 0.15,
      fluid: 0.55,
      elastic: 0.2,
      drift: 0.8,
      glitch: 0.05,
    };

    const animParams = {
      linger: WORD_LINGER_BY_PROFILE[motionProfile] ?? 0.4,
      stagger: manifestStagger ?? 0.05,
      entryDuration: motionDefaults.entryDuration,
      exitDuration: motionDefaults.exitDuration,
    };

    const phraseGroups = payload.words?.length > 0
      ? buildPhraseGroups(pre.wordMeta)
      : null;

    const groupLayouts = new Map<string, GroupPosition[]>();
    if (phraseGroups) {
      for (const group of phraseGroups) {
        const key = `${group.lineIndex}-${group.groupIndex}`;
        const baseFontSize = pre.lineFontSizes[group.lineIndex] ?? 36;
        groupLayouts.set(key, getGroupLayout(group, pre.visualMode, 960, 540, baseFontSize));
      }
    }

    if (phraseGroups) {
      for (const group of phraseGroups) {
        const groupEnd = group.end + animParams.linger;
        if (tSec < group.start - animParams.stagger * group.words.length) continue;
        if (tSec > groupEnd) continue;

        const groupKey = `${group.lineIndex}-${group.groupIndex}`;
        const layout = groupLayouts.get(groupKey);
        if (!layout) continue;

        const anchorWord = group.words[group.anchorWordIdx];
        const manifestAnchorDirective = manifestWordDirectives[anchorWord?.clean] ?? null;
        const { entry, behavior, exit } = assignWordAnimations(
          anchorWord,
          motionDefaults,
          storyboard as StoryboardEntryLike[],
          manifestAnchorDirective,
        );

        for (let wi = 0; wi < group.words.length; wi += 1) {
          const wm = group.words[wi];
          const pos = layout[wi];
          if (!pos) continue;

          const isAnchor = wi === group.anchorWordIdx;
          const staggerDelay = isAnchor
            ? 0
            : Math.abs(wi - group.anchorWordIdx) * animParams.stagger;

          const adjustedElapsed = Math.max(0, tSec - group.start - staggerDelay);
          const rawEntryProgress = adjustedElapsed / Math.max(0.01, animParams.entryDuration);
          const entryProgress = Math.min(1, Math.max(0, rawEntryProgress));
          const exitProgress = Math.max(0, (tSec - group.end) / Math.max(0.01, animParams.exitDuration));

          const entryState = computeEntryState(entry, entryProgress, motionDefaults.behaviorIntensity);
          const exitState = computeExitState(exit, exitProgress, motionDefaults.behaviorIntensity);
          const beatPhase = beatIndex >= 0
            ? ((tSec - (state.beats[beatIndex] ?? 0)) / (60 / (bpm ?? 120))) % 1
            : 0;
          const behaviorState = computeBehaviorState(
            behavior,
            tSec,
            group.start,
            beatPhase,
            motionDefaults.behaviorIntensity,
          );

          const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
          const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
          const finalScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1);
          const finalScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1);
          const finalAlpha = exitProgress > 0
            ? exitState.alpha
            : entryState.alpha * (behaviorState.alpha ?? 1);
          const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
          const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);

          const manifestDirective = manifestWordDirectives[wm.clean] ?? null;
          const baseColor = manifestDirective?.color
            ?? wm.directive?.colorOverride
            ?? pre.lineColors[wm.lineIndex]
            ?? '#ffffff';
          const color = isAnchor ? baseColor : dimColor(baseColor, 0.65);
          const wordGlow = isAnchor
            ? glow * (1 + finalGlowMult) * (pos.isFiller ? 0.5 : 1.0)
            : glow * 0.3;

          if (chunks.length === 0) {
            console.log('[BAKER] first chunk animation:', {
              entry,
              behavior,
              exit,
              entryProgress: entryProgress.toFixed(2),
              entryState,
              finalOffsetY: finalOffsetY.toFixed(1),
              finalScaleX: finalScaleX.toFixed(2),
              finalScaleY: finalScaleY.toFixed(2),
              finalAlpha: finalAlpha.toFixed(2),
            });
          }

          chunks.push({
            id: `${group.lineIndex}-${group.groupIndex}-${wi}`,
            x: pos.x + finalOffsetX,
            y: pos.y + finalOffsetY,
            alpha: Math.max(0, Math.min(1, finalAlpha)),
            scaleX: finalScaleX * (manifestDirective?.scaleX ?? 1),
            scaleY: finalScaleY * (manifestDirective?.scaleY ?? 1),
            scale: 1,
            visible: finalAlpha > 0.01,
            fontSize: pos.fontSize,
            color,
            glow: wordGlow,
            skewX: finalSkewX,
            entryOffsetY: 0,
            entryOffsetX: 0,
            entryScale: 1,
            exitOffsetY: 0,
            exitScale: 1,
          });
        }
      }
    } else {
      const wordLinger = WORD_LINGER_BY_PROFILE[motionProfile] ?? 0.4;
      const wordChunks = pre.wordMeta
        .filter((wm) => {
          return tSec >= wm.start && tSec < (wm.end + wordLinger);
        })
        .map((wm) => {
          const lineWords = pre.wordMeta.filter((w) => w.lineIndex === wm.lineIndex);
          const totalWords = lineWords.length;
          const manifestDirective = manifestWordDirectives[wm.clean] ?? null;
          const lineLayout = manifestLineLayouts[String(wm.lineIndex)] ?? null;
          const position = manifestDirective?.position
            ?? lineLayout?.positions?.[wm.wordIndex]
            ?? getLayoutForMode(pre.visualMode, wm.wordIndex, totalWords, chapterEmotionalIntensity);
          const [nx, ny] = position;

          const canvasX = nx * 960;
          const canvasY = ny * 540;
          const elapsed = tSec - wm.start;

          const stagger = wm.wordIndex * (manifestStagger ?? lineLayout?.stagger ?? 0);
          const adjustedElapsed = Math.max(0, elapsed - stagger);

          const { entry, behavior, exit } = assignWordAnimations(
            wm,
            motionDefaults,
            storyboard as StoryboardEntryLike[],
            manifestDirective,
          );

          const entryProgress = Math.max(0, adjustedElapsed / motionDefaults.entryDuration);
          const entryState = computeEntryState(entry, entryProgress, motionDefaults.behaviorIntensity);

          const exitDuration = exit === 'linger' ? 0.05
            : exit === 'evaporate' ? 0.8
              : motionDefaults.exitDuration;
          const exitProgress = Math.max(0, (tSec - wm.end) / exitDuration);
          const exitState = computeExitState(exit, exitProgress, motionDefaults.behaviorIntensity);

          const beatPhase = beatIndex >= 0
            ? ((tSec - (state.beats[beatIndex] ?? 0)) / (60 / (bpm ?? 120))) % 1
            : 0;
          const behaviorState = computeBehaviorState(
            behavior,
            tSec,
            wm.start,
            beatPhase,
            motionDefaults.behaviorIntensity,
          );

          const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
          const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
          const finalScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1);
          const finalScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1);
          const finalAlpha = exitProgress > 0
            ? exitState.alpha
            : entryState.alpha * (behaviorState.alpha ?? 1);
          const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
          const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);

          const color = manifestDirective?.color
            ?? wm.directive?.colorOverride
            ?? pre.lineColors[wm.lineIndex]
            ?? '#ffffff';

          const baseFontSize = pre.lineFontSizes[wm.lineIndex] ?? 36;
          const soloWordBonus = motionProfile === 'drift' || motionProfile === 'fluid' ? 1.3 : 1.0;
          const fontSize = manifestDirective?.fontSize
            ?? getWordFontSize(wm.word, wm.directive, baseFontSize * soloWordBonus, pre.visualMode);

          const wordGlow = manifestDirective?.glow
            ? glow * manifestDirective.glow
            : (wm.directive?.emphasisLevel ?? 0) >= 4 ? glow * 1.8 : glow * 0.6;

          return {
            id: `${wm.lineIndex}-${wm.wordIndex}`,
            x: canvasX + finalOffsetX,
            y: canvasY + finalOffsetY,
            alpha: finalAlpha,
            scaleX: finalScaleX * (manifestDirective?.scaleX ?? 1),
            scaleY: finalScaleY * (manifestDirective?.scaleY ?? 1),
            scale: 1,
            visible: finalAlpha > 0.01,
            fontSize,
            color,
            glow: wordGlow * (1 + finalGlowMult),
            entryOffsetY: 0,
            entryOffsetX: 0,
            entryScale: 1,
            exitOffsetY: 0,
            exitScale: 1,
            skewX: finalSkewX,
          };
        });

      chunks.push(...wordChunks);
    }
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
        scaleX: chunkScale,
        scaleY: chunkScale,
        visible,
        fontSize: pre.lineFontSizes[idx] ?? 36,
        color: pre.lineColors[idx] ?? "#ffffff",
        entryOffsetY,
        entryOffsetX,
        entryScale,
        exitOffsetY,
        exitScale,
        skewX: 0,
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
            scaleX: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            scaleY: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            visible,
            fontSize: pre.lineFontSizes[idx] ?? 36,
            color: pre.lineColors[idx] ?? "#ffffff",
            entryOffsetY,
            entryOffsetX,
            entryScale,
            exitOffsetY,
            exitScale,
            skewX: 0,
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
  const visualMode = getVisualMode(payload);
  const state = createBakeState(payload);
  const pre = createPrebakedData(payload, totalFrames, visualMode);

  // --- Diagnostic logs (once per bake) ---
  const _motionProfile = deriveMotionProfile(payload);
  const _motionDefaults = MOTION_DEFAULTS[_motionProfile];
  const _physSpec = payload.physics_spec as unknown as Record<string, unknown> | null;
  const _heat = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat ?? 0.5;
  const _beatResponse = payload.cinematic_direction?.visualWorld?.physicsProfile?.beatResponse ?? 'slam';
  const _chaos = Number(_physSpec?.chaos ?? 0);
  const _animParams = {
    linger: ({ weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05 } as Record<string, number>)[_motionProfile] ?? 0.4,
    stagger: 0.05,
    entryDuration: _motionDefaults.entryDuration,
    exitDuration: _motionDefaults.exitDuration,
  };
  console.log('[BAKER ANIM] motionProfile:', _motionProfile);
  console.log('[BAKER ANIM] visualMode:', visualMode);
  console.log('[BAKER ANIM] heat:', _heat, 'beatResponse:', _beatResponse, 'chaos:', _chaos);
  console.log('[BAKER ANIM] animParams:', _animParams);

  const _phraseGroups = payload.words?.length > 0 ? buildPhraseGroups(pre.wordMeta) : null;
  const _storyboard = payload.cinematic_direction?.storyboard ?? [];
  const _sceneManifest = (payload.scene_manifest ?? null) as unknown as Record<string, unknown> | null;
  const _manifestWordDirectives = (_sceneManifest?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
  _phraseGroups?.slice(0, 5).forEach((group, i) => {
    const anchor = group.words[group.anchorWordIdx];
    const { entry, behavior, exit } = assignWordAnimations(
      anchor, _motionDefaults,
      _storyboard as StoryboardEntryLike[],
      _manifestWordDirectives[anchor?.clean] ?? null,
    );
    console.log(`[BAKER ANIM] group ${i}:`, {
      words: group.words.map(w => w.word).join(' '),
      anchor: anchor?.word,
      entry,
      behavior,
      exit,
      kinetic: anchor?.directive?.kineticClass,
      emphasis: anchor?.directive?.emphasisLevel,
    });
  });
  // --- End diagnostic logs ---

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
  const visualMode = getVisualMode(payload);
  const state = createBakeState(payload);
  const pre = createPrebakedData(payload, totalFrames, visualMode);

  // --- Diagnostic logs (once per bake) ---
  {
    const mp = deriveMotionProfile(payload);
    const md = MOTION_DEFAULTS[mp];
    const ps = payload.physics_spec as unknown as Record<string, unknown> | null;
    const h = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat ?? 0.5;
    const br = payload.cinematic_direction?.visualWorld?.physicsProfile?.beatResponse ?? 'slam';
    const ch = Number(ps?.chaos ?? 0);
    const ap = {
      linger: ({ weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05 } as Record<string, number>)[mp] ?? 0.4,
      stagger: 0.05,
      entryDuration: md.entryDuration,
      exitDuration: md.exitDuration,
    };
    console.log('[BAKER ANIM] motionProfile:', mp);
    console.log('[BAKER ANIM] visualMode:', visualMode);
    console.log('[BAKER ANIM] heat:', h, 'beatResponse:', br, 'chaos:', ch);
    console.log('[BAKER ANIM] animParams:', ap);

    const pg = payload.words?.length > 0 ? buildPhraseGroups(pre.wordMeta) : null;
    const sb = payload.cinematic_direction?.storyboard ?? [];
    const sm = (payload.scene_manifest ?? null) as unknown as Record<string, unknown> | null;
    const mwd = (sm?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
    pg?.slice(0, 5).forEach((group, i) => {
      const anchor = group.words[group.anchorWordIdx];
      const { entry, behavior, exit } = assignWordAnimations(
        anchor, md,
        sb as StoryboardEntryLike[],
        mwd[anchor?.clean] ?? null,
      );
      console.log(`[BAKER ANIM] group ${i}:`, {
        words: group.words.map(w => w.word).join(' '),
        anchor: anchor?.word,
        entry,
        behavior,
        exit,
        kinetic: anchor?.directive?.kineticClass,
        emphasis: anchor?.directive?.emphasisLevel,
      });
    });
  }
  // --- End diagnostic logs ---

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
