import type { CinematicDirection, CinematicSection } from "@/types/CinematicDirection";
import { deriveTensionCurve, enrichSections } from "@/engine/directionResolvers";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { FrameRenderState } from "@/engine/presetDerivation";

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
  motion_profile_spec: PhysicsSpec;
  frame_state: FrameRenderState | null;
  cinematic_direction: CinematicDirection | null;
  auto_palettes?: string[][];
  palette: string[];
  lineBeatMap: LineBeatMap[];
  songStart: number;
  songEnd: number;
};

export type Keyframe = {
  timeMs: number;
  chunks: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    alpha: number;
    glow: number;
    scale: number;
    scaleX: number;
    scaleY: number;
    visible: boolean;
    fontSize: number;
    fontWeight: number;
    fontFamily?: string;
    isAnchor: boolean;
    color: string;
    emitterType?: WordEmitterType;
    trail?: string;
    entryStyle?: string;
    exitStyle?: string;
    emphasisLevel?: number;
    entryProgress?: number;
    exitProgress?: number;
    iconGlyph?: string;
    iconStyle?: 'outline' | 'filled' | 'ghost';
    iconPosition?: 'behind' | 'above' | 'beside' | 'replace';
    iconScale?: number;
    behavior?: BehaviorStyle;
    entryOffsetY: number;
    entryOffsetX: number;
    entryScale: number;
    exitOffsetY: number;
    exitScale: number;
    skewX: number;
    blur?: number;
    rotation?: number;
    ghostTrail?: boolean;
    ghostCount?: number;
    ghostSpacing?: number;
    ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial';
    letterIndex?: number;
    letterTotal?: number;
    letterDelay?: number;
    isLetterChunk?: boolean;
    frozen?: boolean;
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
    shape?: 'circle' | 'line' | 'diamond' | 'glow';
  }>;
  particleColor?: string;
  atmosphere?: AtmosphereConfig;
  sectionIndex: number;
};

export type BakedTimeline = Keyframe[];

export const BAKER_VERSION = 7;
const FRAME_STEP_MS = 1000 / 60;
const BASE_X = 960 * 0.5;
const BASE_Y_CENTER = 540 * 0.5;
const deterministicSign = (seed: number): number => (Math.sin(seed * 127.1 + 311.7) > 0 ? 1 : -1);
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
  | 'fades'
  // Previously phantom (now implemented)
  | 'focus-in' | 'spin-in' | 'tumble-in';

type BehaviorStyle =
  | 'pulse' | 'vibrate' | 'float' | 'grow' | 'contract'
  | 'flicker' | 'orbit' | 'lean' | 'freeze' | 'tilt' | 'pendulum' | 'pulse-focus' | 'none';

type ExitStyle =
  | 'shatter' | 'snap-out' | 'burn-out' | 'punch-out'
  | 'dissolve' | 'drift-up' | 'exhale' | 'sink'
  | 'drop-out' | 'cut-out' | 'vanish'
  | 'linger' | 'evaporate' | 'whisper-out'
  | 'fades'
  // Semantic exits (Fix 10)
  | 'gravity-fall' | 'soar' | 'launch' | 'scatter-fly'
  | 'melt' | 'freeze-crack'
  // Previously phantom (now implemented)
  | 'scatter-letters' | 'cascade-down' | 'cascade-up'
  | 'blur-out' | 'spin-out' | 'peel-off' | 'peel-reverse';

type MotionProfile = 'weighted' | 'fluid' | 'elastic' | 'drift' | 'glitch';

interface MotionDefaults {
  entries: EntryStyle[];
  behaviors: BehaviorStyle[];
  exits: ExitStyle[];
  entryDuration: number;
  exitDuration: number;
  behaviorIntensity: number;
}

interface TypographyProfile {
  fontFamily: string;
  fontWeight: number;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
  heroWeight: number;
}

type SceneTone = 'dark' | 'light' | 'mixed-dawn' | 'mixed-dusk' | 'mixed-pulse';

interface AtmosphereConfig {
  vignetteStrength: number;
  blurAmount: number;
  grainOpacity: number;
  tintStrength: number;
  overlayType: 'none' | 'frost' | 'gradient-wash' | 'split-mask';
}

interface TextureConfig {
  particleCount: number;
  particleColor: 'accent' | 'text' | 'glow' | 'dim';
  speed: number;
  size: [number, number];
  direction: 'up' | 'down' | 'radial' | 'swirl' | 'random';
  opacity: [number, number];
  shape: 'circle' | 'line' | 'diamond' | 'glow';
}

interface AnimState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  skewX: number;
  glowMult: number;
  blur: number;
  rotation: number;
}

const MOTION_DEFAULTS: Record<MotionProfile, MotionDefaults> = {
  weighted: { entries: ['slam-down', 'drop', 'plant', 'stomp'], behaviors: ['pulse', 'vibrate', 'pulse', 'grow'], exits: ['shatter', 'snap-out', 'burn-out'], entryDuration: 0.1, exitDuration: 0.12, behaviorIntensity: 1.2 },
  fluid: { entries: ['rise', 'materialize', 'breathe-in', 'drift-in'], behaviors: ['float', 'grow', 'float', 'lean'], exits: ['dissolve', 'drift-up', 'linger'], entryDuration: 0.35, exitDuration: 0.4, behaviorIntensity: 0.6 },
  elastic: { entries: ['explode-in', 'punch-in', 'breathe-in'], behaviors: ['pulse', 'orbit', 'pulse', 'float'], exits: ['punch-out', 'snap-out'], entryDuration: 0.15, exitDuration: 0.1, behaviorIntensity: 1.0 },
  drift: { entries: ['whisper', 'surface', 'drift-in', 'bloom'], behaviors: ['float', 'flicker', 'float', 'grow'], exits: ['evaporate', 'linger', 'sink'], entryDuration: 0.5, exitDuration: 0.6, behaviorIntensity: 0.4 },
  glitch: { entries: ['snap-in', 'cut-in', 'shatter-in'], behaviors: ['vibrate', 'flicker', 'vibrate', 'orbit'], exits: ['cut-out', 'snap-out', 'burn-out'], entryDuration: 0.05, exitDuration: 0.06, behaviorIntensity: 1.4 },
};

const EMPHASIS_CURVE: Record<number, number> = {
  1: 0.78,
  2: 0.92,
  3: 1.18,
  4: 1.55,
  5: 1.95,
};

const TYPOGRAPHY_FONT_WEIGHTS: Record<string, number> = {
  'bold-impact': 800,
  'clean-modern': 600,
  'elegant-serif': 500,
  'raw-condensed': 600,
  'whisper-soft': 400,
  'tech-mono': 500,
  'display-heavy': 800,
  'editorial-light': 400,
};

const PALETTE_COLORS: Record<string, string[]> = {
  // [background, accent, text, glow, dim]
  'cold-gold': ['#0A0A0F', '#C9A96E', '#F0ECE2', '#FFD700', '#5A4A30'],
  'warm-ember': ['#1A0A05', '#E8632B', '#FFF0E6', '#FF6B35', '#7D3A1A'],
  'ice-blue': ['#050A14', '#4FA4D4', '#E8F4F8', '#00BFFF', '#2A5570'],
  'midnight-rose': ['#0F0510', '#D4618C', '#F5E6EE', '#FF69B4', '#8A3358'],
  'neon-green': ['#050F05', '#39FF14', '#E6FFE6', '#00FF41', '#1A7A0A'],
  'storm-grey': ['#0E0E12', '#A0A4AC', '#E8E8EC', '#B8BCC4', '#5A5A66'],
  'blood-red': ['#120505', '#D43030', '#FFE6E6', '#FF3030', '#7A1A1A'],
  'lavender-dream': ['#0A0510', '#B088F9', '#F0E6FF', '#C49EFF', '#5A3A8A'],
  'earth-brown': ['#0F0A05', '#A0845C', '#F5EDE2', '#C4A878', '#6A5030'],
  'pure-white': ['#F8F8FA', '#3344AA', '#1A1A2E', '#4466FF', '#8888AA'],
  'soft-cream': ['#FFF8F0', '#8B6040', '#1A1008', '#C49A6C', '#6A4A30'],
  'sky-blue': ['#EEF5FF', '#2255AA', '#0A1A30', '#3B82F6', '#4A6A9A'],
  'sunset-pink': ['#FFF0F0', '#AA3366', '#1A0510', '#FF6B9D', '#883355'],
  'spring-green': ['#F0FFF0', '#228844', '#0A200F', '#34D058', '#3A7A4A'],
};

function resolveV3Palette(payload: ScenePayload, chapterProgress?: number): string[] {
  const autoPalettes = payload.auto_palettes;
  const cd = payload.cinematic_direction as unknown as Record<string, unknown> | null;
  const rawChapters = (cd?.chapters as any[]) ?? [];
  const chapters = rawChapters.length > 0
    ? rawChapters
    : enrichSections((cd?.sections as CinematicSection[] | undefined)).map((s) => ({
        startRatio: s.startRatio,
        endRatio: s.endRatio,
        palette: undefined,
      }));

  // Priority 1: computed image-driven palettes
  if (autoPalettes && autoPalettes.length > 0 && chapterProgress != null && chapters.length > 0) {
    const chapterIdx = chapters.findIndex((ch: any) =>
      chapterProgress >= (ch.startRatio ?? 0) && chapterProgress < (ch.endRatio ?? 1)
    );
    if (chapterIdx >= 0 && autoPalettes[chapterIdx]) {
      return autoPalettes[chapterIdx];
    }
    return autoPalettes[0];
  }

  if (autoPalettes && autoPalettes.length > 0) {
    return autoPalettes[0];
  }

  // Check per-chapter palette override first
  if (chapterProgress != null && chapters.length > 0) {
    const chapter = chapters.find((ch: any) =>
      chapterProgress >= (ch.startRatio ?? 0) && chapterProgress < (ch.endRatio ?? 1)
    );
    const chapterPalette = chapter?.palette as string | undefined;
    if (chapterPalette && PALETTE_COLORS[chapterPalette]) {
      return PALETTE_COLORS[chapterPalette];
    }
  }

  // Fall back to top-level palette
  const paletteName = cd?.palette as string | undefined;
  if (paletteName && PALETTE_COLORS[paletteName]) {
    return PALETTE_COLORS[paletteName];
  }

  // Final fallback
  const existing = payload.palette ?? [];
  return [
    existing[0] ?? '#0A0A0F',
    existing[1] ?? '#FFD700',
    existing[2] ?? '#F0F0F0',
    existing[3] ?? '#FFD700',
    existing[4] ?? '#555555',
  ];
}

const TYPOGRAPHY_PROFILES: Record<string, TypographyProfile> = {
  'bold-impact': { fontFamily: '"Oswald", sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.05, heroWeight: 900 },
  'clean-modern': { fontFamily: '"Montserrat", sans-serif', fontWeight: 600, textTransform: 'none', letterSpacing: 0.02, heroWeight: 800 },
  'elegant-serif': { fontFamily: '"Playfair Display", serif', fontWeight: 500, textTransform: 'none', letterSpacing: 0.01, heroWeight: 700 },
  'raw-condensed': { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04, heroWeight: 800 },
  'whisper-soft': { fontFamily: '"Nunito", sans-serif', fontWeight: 400, textTransform: 'none', letterSpacing: 0.03, heroWeight: 600 },
  'tech-mono': { fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, textTransform: 'none', letterSpacing: 0.06, heroWeight: 700 },
  'display-heavy': { fontFamily: '"Bebas Neue", sans-serif', fontWeight: 400, textTransform: 'uppercase', letterSpacing: 0.08, heroWeight: 400 },
  'editorial-light': { fontFamily: '"Cormorant Garamond", serif', fontWeight: 400, textTransform: 'none', letterSpacing: 0.01, heroWeight: 600 },
};

const SCENE_TONE_LUMINANCE: Record<SceneTone, [number, number, number]> = {
  dark: [0.04, 0.06, 0.08],
  light: [0.90, 0.92, 0.95],
  'mixed-dawn': [0.05, 0.06, 0.85],
  'mixed-dusk': [0.80, 0.75, 0.06],
  'mixed-pulse': [0.05, 0.80, 0.06],
};

const ATMOSPHERE_CONFIGS: Record<string, AtmosphereConfig> = {
  void: { vignetteStrength: 0, blurAmount: 0, grainOpacity: 0, tintStrength: 0, overlayType: 'none' },
  cinematic: { vignetteStrength: 0.6, blurAmount: 0.3, grainOpacity: 0.08, tintStrength: 0.15, overlayType: 'none' },
  haze: { vignetteStrength: 0.3, blurAmount: 0.7, grainOpacity: 0.05, tintStrength: 0.3, overlayType: 'gradient-wash' },
  split: { vignetteStrength: 0.2, blurAmount: 0.4, grainOpacity: 0, tintStrength: 0.5, overlayType: 'split-mask' },
  grain: { vignetteStrength: 0.4, blurAmount: 0.1, grainOpacity: 0.25, tintStrength: 0.1, overlayType: 'none' },
  wash: { vignetteStrength: 0.3, blurAmount: 0.5, grainOpacity: 0.05, tintStrength: 0.7, overlayType: 'gradient-wash' },
  glass: { vignetteStrength: 0.1, blurAmount: 0.85, grainOpacity: 0, tintStrength: 0.2, overlayType: 'frost' },
  clean: { vignetteStrength: 0.1, blurAmount: 0, grainOpacity: 0, tintStrength: 0, overlayType: 'none' },
};

const TEXTURE_CONFIGS: Record<string, TextureConfig> = {
  fire: { particleCount: 40, particleColor: 'accent', speed: 1.5, size: [2, 6], direction: 'up', opacity: [0.2, 0.6], shape: 'glow' },
  rain: { particleCount: 60, particleColor: 'text', speed: 3.0, size: [1, 3], direction: 'down', opacity: [0.1, 0.3], shape: 'line' },
  snow: { particleCount: 35, particleColor: 'text', speed: 0.5, size: [2, 4], direction: 'down', opacity: [0.3, 0.6], shape: 'circle' },
  aurora: { particleCount: 20, particleColor: 'glow', speed: 0.3, size: [8, 20], direction: 'swirl', opacity: [0.05, 0.15], shape: 'glow' },
  smoke: { particleCount: 25, particleColor: 'dim', speed: 0.4, size: [10, 25], direction: 'up', opacity: [0.03, 0.1], shape: 'glow' },
  storm: { particleCount: 80, particleColor: 'text', speed: 4.0, size: [1, 2], direction: 'down', opacity: [0.15, 0.4], shape: 'line' },
  dust: { particleCount: 30, particleColor: 'dim', speed: 0.2, size: [1, 3], direction: 'random', opacity: [0.1, 0.25], shape: 'circle' },
  void: { particleCount: 5, particleColor: 'dim', speed: 0.1, size: [1, 2], direction: 'random', opacity: [0.02, 0.06], shape: 'circle' },
  stars: { particleCount: 50, particleColor: 'text', speed: 0, size: [1, 3], direction: 'random', opacity: [0.2, 0.8], shape: 'diamond' },
  petals: { particleCount: 20, particleColor: 'accent', speed: 0.8, size: [4, 8], direction: 'down', opacity: [0.15, 0.35], shape: 'circle' },
};

const ARC_CURVES: Record<string, (t: number) => number> = {
  'slow-burn': (t) => (t < 0.6 ? t * 0.5 : 0.3 + (t - 0.6) * 1.75),
  surge: (t) => (t < 0.3 ? 0.3 + t * 1.5 : 0.75 + (t - 0.3) * 0.36),
  collapse: (t) => 1.0 - t * 0.8,
  dawn: (t) => t * t,
  flatline: () => 0.5,
  eruption: (t) => (t < 0.25 ? 0.15 : t < 0.5 ? 0.15 + (t - 0.25) * 3.4 : 1.0),
};

const HEAT_FROM_MOTION: Record<string, number> = {
  weighted: 0.8, elastic: 0.6, fluid: 0.45, glitch: 0.7, drift: 0.2,
};

const BEAT_FROM_MOTION: Record<string, string> = {
  weighted: 'slam', elastic: 'pulse', fluid: 'pulse', glitch: 'snap', drift: 'pulse',
};

function resolveMotionProfile(motionField: string | undefined, payload: ScenePayload): MotionProfile {
  if (motionField && motionField in MOTION_DEFAULTS) {
    return motionField as MotionProfile;
  }
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

function resolveTypographyFontWeight(typographyField: string | undefined, payload: ScenePayload): number {
  if (typographyField && typographyField in TYPOGRAPHY_FONT_WEIGHTS) {
    return TYPOGRAPHY_FONT_WEIGHTS[typographyField];
  }
  return payload.cinematic_direction?.visualWorld?.typographyProfile?.fontWeight ?? 700;
}

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
  const frameState = payload.frame_state ?? null;
  const manifestMode = (frameState as any)?.visualMode;
  if (manifestMode === 'intimate' || manifestMode === 'cinematic' || manifestMode === 'explosive') return manifestMode;
  if (!payload.cinematic_direction) return 'cinematic';

  // New prompt: derive from motion + texture
  const motion = (payload.cinematic_direction as any)?.motion as string | undefined;
  const texture = (payload.cinematic_direction as any)?.texture as string | undefined;
  if (motion) {
    if (motion === 'weighted' || motion === 'glitch' || texture === 'storm' || texture === 'fire') return 'explosive';
    if (motion === 'drift' || texture === 'petals' || texture === 'snow') return 'intimate';
    return 'cinematic';
  }

  // Fallback: old visualWorld path
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
  const directMotion = (payload.cinematic_direction as any)?.motion as string | undefined;
  return resolveMotionProfile(directMotion, payload);
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
    case 'slam-down': return { offsetX: 0, offsetY: -(1 - ep) * 80 * intensity, scaleX: 1 + (1 - ep) * 0.3 * intensity, scaleY: ep < 0.9 ? 1 : 1 - (1 - ep) * 10 * intensity, alpha: Math.min(1, progress * 8), skewX: 0, glowMult: ep > 0.85 ? (1 - ep) * 4 : 0, blur: 0, rotation: 0 };
    case 'punch-in': return { offsetX: (1 - eb) * -120 * intensity, offsetY: 0, scaleX: 1, scaleY: 1, alpha: Math.min(1, progress * 6), skewX: (1 - ep) * -8 * intensity, glowMult: 0, blur: 0, rotation: 0 };
    case 'explode-in': { const mult = Math.min(2.0, 2.5 * intensity); return { offsetX: 0, offsetY: 0, scaleX: 1 + (1 - ep) * mult, scaleY: 1 + (1 - ep) * mult, alpha: Math.min(1, progress * 4), skewX: 0, glowMult: (1 - ep) * 2, blur: 0, rotation: 0 }; }
    case 'snap-in': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: progress > 0.01 ? 1 : 0, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'rise': return { offsetX: 0, offsetY: (1 - ep) * 45 * intensity, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'materialize': return { offsetX: 0, offsetY: 0, scaleX: 0.75 + ep * 0.25, scaleY: 0.75 + ep * 0.25, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: 0, glowMult: (1 - ep) * 0.8, blur: 0, rotation: 0 };
    case 'breathe-in': return { offsetX: 0, offsetY: 0, scaleX: 0.9 + ee * 0.1, scaleY: 0.9 + ee * 0.1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'drift-in': return { offsetX: (1 - ep) * -30, offsetY: (1 - ep) * 10, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: (1 - ep) * -3, glowMult: 0, blur: 0, rotation: 0 };
    case 'surface': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: easeIn(Math.min(1, progress * 1.2)), skewX: 0, glowMult: (1 - ep) * 1.5, blur: 0, rotation: 0 };
    case 'drop': return { offsetX: 0, offsetY: -(1 - ep) * 60 * intensity, scaleX: 1, scaleY: 1, alpha: progress > 0.1 ? 1 : 0, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'plant': return { offsetX: 0, offsetY: 0, scaleX: 1 + (1 - ep) * 0.2, scaleY: 1 + (1 - ep) * 0.2, alpha: progress > 0.05 ? 1 : 0, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'stomp': { const wipeProgress = Math.min(1, progress * 3); return { offsetX: 0, offsetY: (1 - wipeProgress) * 20, scaleX: 1, scaleY: wipeProgress, alpha: wipeProgress, skewX: 0, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'cut-in': return { offsetX: (1 - ep) * -40, offsetY: 0, scaleX: 1, scaleY: 1, alpha: Math.min(1, progress * 5), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'whisper': return { offsetX: 0, offsetY: 0, scaleX: 0.95 + ep * 0.05, scaleY: 0.95 + ep * 0.05, alpha: easeIn(Math.min(1, progress * 0.8)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'bloom': return { offsetX: 0, offsetY: 0, scaleX: 0.5 + ep * 0.5, scaleY: 0.5 + ep * 0.5, alpha: easeOut(Math.min(1, progress * 1.2)), skewX: 0, glowMult: (1 - ep) * 2.5, blur: 0, rotation: 0 };
    case 'melt-in': return { offsetX: 0, offsetY: (1 - ep) * 15, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 1.8)), skewX: (1 - ep) * 2, glowMult: 0, blur: 0, rotation: 0 };
    case 'ink-drop': return { offsetX: 0, offsetY: 0, scaleX: ep < 0.5 ? ep * 2 : 1, scaleY: ep < 0.5 ? ep * 2 : 1, alpha: Math.min(1, progress * 3), skewX: 0, glowMult: (1 - ep) * 0.5, blur: 0, rotation: 0 };
    case 'shatter-in': return {
      offsetX: (1 - ep) * (30 * deterministicSign(progress * 13.37)),
      offsetY: (1 - ep) * (20 * deterministicSign(progress * 7.91)),
      scaleX: 0.8 + ep * 0.2,
      scaleY: 0.8 + ep * 0.2,
      alpha: Math.min(1, progress * 4),
      skewX: (1 - ep) * 5,
      glowMult: 0,
      blur: 0,
      rotation: 0,
    };
    case 'focus-in': {
      // Starts blurred/large, snaps to sharp focus
      const focusScale = 1 + (1 - ep) * 0.6;
      return { offsetX: 0, offsetY: 0, scaleX: focusScale, scaleY: focusScale, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: 0, glowMult: (1 - ep) * 2, blur: (1 - ep) * 1.0, rotation: 0 };
    }
    case 'spin-in': {
      // Rotates in from offscreen with skew suggesting rotation
      const spin = (1 - ep) * 25;
      return { offsetX: (1 - ep) * -60, offsetY: 0, scaleX: 0.6 + ep * 0.4, scaleY: 0.6 + ep * 0.4, alpha: easeOut(Math.min(1, progress * 2)), skewX: spin, glowMult: 0, blur: 0, rotation: (1 - ep) * Math.PI * 2 };
    }
    case 'tumble-in': {
      // Falls in from above with rotation, bounces at landing
      const fallY = (1 - eb) * -80;
      const tumble = (1 - ep) * 20;
      return { offsetX: (1 - ep) * 30, offsetY: fallY, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2.5)), skewX: tumble, glowMult: 0, blur: 0, rotation: (1 - ep) * Math.PI };
    }
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }
}

function computeExitState(style: ExitStyle, progress: number, intensity: number, letterIndex = 0, letterTotal = 1): AnimState {
  const ep = easeOut(Math.min(1, progress));
  const ei = easeIn(Math.min(1, progress));
  switch (style) {
    case 'shatter': return { offsetX: ep * 40 * deterministicSign(progress * 9.43), offsetY: ep * -30, scaleX: 1 + ep * 0.4, scaleY: 1 - ep * 0.3, alpha: 1 - ei, skewX: ep * 10, glowMult: ep * 1.5, blur: 0, rotation: 0 };
    case 'snap-out': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: progress > 0.02 ? 0 : 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'burn-out': return { offsetX: 0, offsetY: 0, scaleX: 1 + ep * 0.1, scaleY: 1 + ep * 0.1, alpha: 1 - ei, skewX: 0, glowMult: ep * 3, blur: 0, rotation: 0 };
    case 'punch-out': return { offsetX: ep * 150 * intensity, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 3), skewX: ep * 8, glowMult: 0, blur: 0, rotation: 0 };
    case 'dissolve': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'drift-up': return { offsetX: 0, offsetY: -ep * 35, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'exhale': return { offsetX: 0, offsetY: 0, scaleX: 1 - ep * 0.1, scaleY: 1 - ep * 0.1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'sink': return { offsetX: 0, offsetY: ep * 40, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'drop-out': return { offsetX: 0, offsetY: ep * 200 * intensity, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 4), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'cut-out': return { offsetX: ep * 60, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - Math.min(1, progress * 5), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'vanish': return { offsetX: 0, offsetY: 0, scaleX: 1 - ei * 0.8, scaleY: 1 - ei * 0.8, alpha: 1 - ei, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'linger': return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 0.28, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'evaporate': return { offsetX: 0, offsetY: -ep * 12, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 0.7)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    case 'whisper-out': return { offsetX: 0, offsetY: 0, scaleX: 1 - ep * 0.08, scaleY: 1 - ep * 0.08, alpha: 1 - easeIn(Math.min(1, progress * 0.9)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    // ═══ SEMANTIC EXITS (new) ═══
    case 'gravity-fall': {
      // Each letter falls like a raindrop — cubic acceleration
      // Best paired with letterSequence: true
      const gravity = ep * ep * ep;
      return { offsetX: Math.sin(progress * 3) * 4, offsetY: gravity * 600, scaleX: 1, scaleY: 1 + ep * 0.15, alpha: 1 - easeIn(Math.min(1, progress * 1.2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'soar': {
      // Flight arc — accelerates up and to the right
      // For: bird, fly, wings, free, soaring
      const arc = easeIn(ep);
      return { offsetX: arc * 150, offsetY: -arc * 250, scaleX: 1 - ep * 0.3, scaleY: 1 - ep * 0.3, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: -arc * 8, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'launch': {
      // Rockets upward with exponential acceleration
      // For: rise, escape, blast, rocket, up
      const thrust = ep * ep;
      return { offsetX: Math.sin(progress * 12) * 3, offsetY: -thrust * 400, scaleX: 1, scaleY: 1 + ep * 0.2, alpha: 1 - easeIn(Math.min(1, progress * 2)), skewX: 0, glowMult: ep * 0.5, blur: 0, rotation: 0 };
    }
    case 'scatter-fly': {
      // Letters arc in different directions like a flock dispersing
      // For: break, scatter, flock, apart, release
      const arc = easeIn(ep);
      return { offsetX: Math.sin(progress * 4) * 80 * arc, offsetY: -arc * 200, scaleX: 1 - ep * 0.5, scaleY: 1 - ep * 0.5, alpha: 1 - ep, skewX: Math.sin(progress * 6) * 12, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'melt': {
      // Drips downward, losing shape — widens and squishes
      // For: melt, drip, candle, wax, dissolving
      const drip = easeIn(ep);
      return { offsetX: Math.sin(progress * 2) * 3, offsetY: drip * 120, scaleX: 1 + ep * 0.3, scaleY: 1 - ep * 0.4, alpha: 1 - easeIn(Math.min(1, progress * 0.9)), skewX: progress * 6, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'freeze-crack': {
      // Holds completely still, then cracks apart suddenly at 70%
      // For: freeze, ice, stuck, numb, shatter after stillness
      const hold = progress < 0.7;
      const breakProgress = hold ? 0 : (progress - 0.7) / 0.3;
      const bp = easeIn(Math.min(1, breakProgress));
      return { offsetX: hold ? 0 : bp * 60 * (progress % 2 < 1 ? 1 : -1), offsetY: hold ? 0 : bp * 40, scaleX: 1, scaleY: 1, alpha: hold ? 1.0 : 1 - bp, skewX: hold ? 0 : bp * 15, glowMult: 0, blur: 0, rotation: 0 };
    }

    // ═══ PREVIOUSLY PHANTOM EXITS (now implemented) ═══
    case 'scatter-letters': {
      // Individual letters explode outward in random directions
      // Deterministic using progress to avoid random jitter
      const burst = easeIn(ep);
      const angle = (progress * 7.3) % (Math.PI * 2);
      return { offsetX: Math.cos(angle) * burst * 100, offsetY: Math.sin(angle) * burst * 80 + burst * 40, scaleX: 1 - ep * 0.3, scaleY: 1 - ep * 0.3, alpha: 1 - ei, skewX: burst * 20 * Math.sin(angle), glowMult: 0, blur: 0, rotation: ep * (angle > Math.PI ? 0.5 : -0.5) };
    }
    case 'cascade-down': {
      // Falls straight down with stagger — waterfall effect
      const fall = easeIn(ep);
      return { offsetX: 0, offsetY: fall * 300, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'cascade-up': {
      // Rises upward with stagger — reverse waterfall
      const rise = easeIn(ep);
      return { offsetX: 0, offsetY: -rise * 300, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'blur-out': {
      // Scales up slightly while fading — simulates defocus
      return { offsetX: 0, offsetY: 0, scaleX: 1 + ep * 0.25, scaleY: 1 + ep * 0.25, alpha: 1 - ep, skewX: 0, glowMult: ep * 2, blur: ep * 1.0, rotation: 0 };
    }
    case 'spin-out': {
      // Rotates away via increasing skew
      return { offsetX: ep * 80, offsetY: 0, scaleX: 1 - ep * 0.4, scaleY: 1 - ep * 0.4, alpha: 1 - ei, skewX: ep * 30, glowMult: 0, blur: 0, rotation: ep * Math.PI * 2 };
    }
    case 'peel-off': {
      // Peels away to the right like a sticker
      return { offsetX: ep * 120, offsetY: ep * -20, scaleX: 1 - ep * 0.2, scaleY: 1, alpha: 1 - ei, skewX: ep * 15, glowMult: 0, blur: 0, rotation: 0 };
    }
    case 'peel-reverse': {
      // Peels away to the left
      return { offsetX: -ep * 120, offsetY: ep * -20, scaleX: 1 - ep * 0.2, scaleY: 1, alpha: 1 - ei, skewX: -ep * 15, glowMult: 0, blur: 0, rotation: 0 };
    }
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }
}

function computeBehaviorState(style: BehaviorStyle, tSec: number, wordStart: number, beatPhase: number, intensity: number): Partial<AnimState> {
  const age = tSec - wordStart;
  switch (style) {
    case 'pulse': { const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.03 * intensity; return { scaleX: 1 + pulse, scaleY: 1 + pulse }; }
    case 'vibrate': return { offsetX: Math.sin(tSec * 18) * 1.2 * intensity };
    case 'float': return { offsetY: Math.sin(age * 1.8) * 4 * intensity };
    case 'grow': { const growScale = 1 + Math.min(0.15, age * 0.04) * intensity; return { scaleX: growScale, scaleY: growScale }; }
    case 'contract': { const contractScale = 1 - Math.min(0.1, age * 0.03) * intensity; return { scaleX: contractScale, scaleY: contractScale }; }
    case 'flicker': { const f = Math.sin(tSec * 6) * 0.5 + Math.sin(tSec * 13) * 0.5; return { alpha: 0.88 + f * 0.12 }; }
    case 'orbit': { const angle = age * 1.2; return { offsetX: Math.sin(angle) * 2 * intensity, offsetY: Math.cos(angle) * 1.5 * intensity }; }
    case 'lean': return { skewX: Math.sin(age * 0.8) * 4 * intensity };
    case 'freeze': {
      if (age > 0.3) {
        return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, blur: 0, rotation: 0 };
      }
      const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.04 * intensity;
      return { scaleX: 1 + pulse, scaleY: 1 + pulse };
    }
    case 'tilt': return { rotation: Math.sin(age * 2) * 0.14 * intensity };
    case 'pendulum': return { rotation: Math.sin(age * 0.8) * 0.26 * intensity };
    case 'pulse-focus': {
      const focusPulse = Math.sin(beatPhase * Math.PI * 2) * 0.3;
      return { blur: Math.max(0, focusPulse) };
    }
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

type VisualMetaphor =
  | 'ember-burst' | 'frost-form' | 'lens-focus' | 'gravity-drop'
  | 'ascent' | 'fracture' | 'heartbeat' | 'pain-weight' | 'isolation'
  | 'convergence' | 'shockwave' | 'void-absorb' | 'radiance' | 'gold-rain'
  | 'speed-blur' | 'slow-drift' | 'power-surge' | 'dream-float'
  | 'truth-snap' | 'motion-streak';

export type WordEmitterType =
  | 'ember' | 'frost' | 'spark-burst' | 'dust-impact' | 'light-rays'
  | 'converge' | 'shockwave-ring' | 'gold-coins' | 'memory-orbs'
  | 'motion-trail' | 'dark-absorb' | 'none';

interface SemanticEffect {
  entry: EntryStyle;
  behavior: BehaviorStyle;
  exit: ExitStyle;
  colorOverride: string | null;
  glowMultiplier: number;
  scaleX: number;
  scaleY: number;
  emitterType: WordEmitterType;
  alphaMax: number;
  entryDurationMult: number;
  fontWeight: number;
}

const SEMANTIC_EFFECTS: Record<VisualMetaphor, SemanticEffect> = {
  'ember-burst': { entry: 'rise', behavior: 'float', exit: 'burn-out', colorOverride: '#FF8C00', glowMultiplier: 2.0, scaleX: 1.0, scaleY: 1.15, emitterType: 'ember', alphaMax: 1.0, entryDurationMult: 0.8, fontWeight: 800 },
  'frost-form': { entry: 'materialize', behavior: 'flicker', exit: 'dissolve', colorOverride: '#A8D8EA', glowMultiplier: 0.8, scaleX: 1.0, scaleY: 1.0, emitterType: 'frost', alphaMax: 0.9, entryDurationMult: 1.4, fontWeight: 400 },
  'lens-focus': { entry: 'surface', behavior: 'none', exit: 'dissolve', colorOverride: '#FFFFFF', glowMultiplier: 1.2, scaleX: 1.0, scaleY: 1.0, emitterType: 'none', alphaMax: 1.0, entryDurationMult: 1.6, fontWeight: 700 },
  'gravity-drop': { entry: 'slam-down', behavior: 'none', exit: 'sink', colorOverride: null, glowMultiplier: 0.5, scaleX: 1.3, scaleY: 0.7, emitterType: 'dust-impact', alphaMax: 1.0, entryDurationMult: 0.6, fontWeight: 900 },
  'ascent': { entry: 'rise', behavior: 'float', exit: 'drift-up', colorOverride: null, glowMultiplier: 1.3, scaleX: 1.0, scaleY: 1.15, emitterType: 'light-rays', alphaMax: 1.0, entryDurationMult: 1.0, fontWeight: 700 },
  'fracture': { entry: 'shatter-in', behavior: 'vibrate', exit: 'shatter', colorOverride: '#CCCCCC', glowMultiplier: 0.6, scaleX: 1.0, scaleY: 1.0, emitterType: 'spark-burst', alphaMax: 0.9, entryDurationMult: 0.7, fontWeight: 700 },
  'heartbeat': { entry: 'bloom', behavior: 'pulse', exit: 'exhale', colorOverride: '#FFB4B4', glowMultiplier: 1.5, scaleX: 1.0, scaleY: 1.0, emitterType: 'memory-orbs', alphaMax: 1.0, entryDurationMult: 1.2, fontWeight: 700 },
  'pain-weight': { entry: 'plant', behavior: 'flicker', exit: 'linger', colorOverride: '#8B0000', glowMultiplier: 0.4, scaleX: 1.0, scaleY: 0.9, emitterType: 'none', alphaMax: 0.85, entryDurationMult: 0.8, fontWeight: 800 },
  'isolation': { entry: 'whisper', behavior: 'float', exit: 'evaporate', colorOverride: '#888888', glowMultiplier: 0.2, scaleX: 1.0, scaleY: 1.0, emitterType: 'none', alphaMax: 0.70, entryDurationMult: 2.0, fontWeight: 400 },
  'convergence': { entry: 'breathe-in', behavior: 'pulse', exit: 'linger', colorOverride: '#FFF5E4', glowMultiplier: 1.4, scaleX: 1.05, scaleY: 1.0, emitterType: 'converge', alphaMax: 1.0, entryDurationMult: 1.1, fontWeight: 700 },
  'shockwave': { entry: 'explode-in', behavior: 'vibrate', exit: 'shatter', colorOverride: '#FFFFFF', glowMultiplier: 2.5, scaleX: 1.6, scaleY: 0.65, emitterType: 'shockwave-ring', alphaMax: 1.0, entryDurationMult: 0.4, fontWeight: 900 },
  'void-absorb': { entry: 'surface', behavior: 'flicker', exit: 'snap-out', colorOverride: '#1a1a1a', glowMultiplier: 0.0, scaleX: 1.0, scaleY: 1.0, emitterType: 'dark-absorb', alphaMax: 0.95, entryDurationMult: 1.0, fontWeight: 700 },
  'radiance': { entry: 'bloom', behavior: 'pulse', exit: 'burn-out', colorOverride: '#FFD700', glowMultiplier: 3.0, scaleX: 1.1, scaleY: 1.0, emitterType: 'light-rays', alphaMax: 1.0, entryDurationMult: 0.9, fontWeight: 800 },
  'gold-rain': { entry: 'cut-in', behavior: 'grow', exit: 'punch-out', colorOverride: '#FFD700', glowMultiplier: 1.8, scaleX: 1.0, scaleY: 1.0, emitterType: 'gold-coins', alphaMax: 1.0, entryDurationMult: 0.6, fontWeight: 900 },
  'speed-blur': { entry: 'punch-in', behavior: 'lean', exit: 'punch-out', colorOverride: null, glowMultiplier: 1.0, scaleX: 1.2, scaleY: 0.85, emitterType: 'motion-trail', alphaMax: 1.0, entryDurationMult: 0.5, fontWeight: 700 },
  'slow-drift': { entry: 'whisper', behavior: 'float', exit: 'evaporate', colorOverride: '#CCCCCC', glowMultiplier: 0.3, scaleX: 1.0, scaleY: 1.0, emitterType: 'none', alphaMax: 0.80, entryDurationMult: 2.5, fontWeight: 400 },
  'power-surge': { entry: 'slam-down', behavior: 'pulse', exit: 'burn-out', colorOverride: null, glowMultiplier: 2.0, scaleX: 1.1, scaleY: 1.1, emitterType: 'spark-burst', alphaMax: 1.0, entryDurationMult: 0.5, fontWeight: 900 },
  'dream-float': { entry: 'materialize', behavior: 'float', exit: 'dissolve', colorOverride: null, glowMultiplier: 0.9, scaleX: 1.0, scaleY: 1.0, emitterType: 'memory-orbs', alphaMax: 0.80, entryDurationMult: 1.8, fontWeight: 400 },
  'truth-snap': { entry: 'snap-in', behavior: 'none', exit: 'snap-out', colorOverride: '#FFFFFF', glowMultiplier: 0.0, scaleX: 1.0, scaleY: 1.0, emitterType: 'none', alphaMax: 1.0, entryDurationMult: 1.0, fontWeight: 700 },
  'motion-streak': { entry: 'punch-in', behavior: 'lean', exit: 'cut-out', colorOverride: null, glowMultiplier: 1.2, scaleX: 1.15, scaleY: 0.9, emitterType: 'motion-trail', alphaMax: 1.0, entryDurationMult: 0.6, fontWeight: 700 },
};

type WordDirectiveLike = {
  word?: string;
  kineticClass?: string;
  colorOverride?: string;
  emphasisLevel?: number;
  visualMetaphor?: string;
  ghostTrail?: boolean;
  ghostCount?: number;
  ghostSpacing?: number;
  ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial';
  letterSequence?: boolean;
  trail?: string;
  entry?: string;
  behavior?: string;
  exit?: string;
};

function resolveV3EmitterType(directive: WordDirectiveLike | null): WordEmitterType {
  if (!directive) return 'none';

  // Priority 1: ghostTrail → memory-orbs (ghost rendering handled separately via chunk.ghostTrail)
  if (directive.ghostTrail) return 'memory-orbs';

  // Priority 2: visualMetaphor keyword matching
  const meta = (directive.visualMetaphor ?? '').toLowerCase();
  if (meta) {
    if (meta.includes('smoke') || meta.includes('dissipat')) return 'ember';
    if (meta.includes('fire') || meta.includes('ember')) return 'ember';
    if (meta.includes('frost') || meta.includes('ice') || meta.includes('cold')) return 'frost';
    if (meta.includes('ripple') || meta.includes('wave')) return 'spark-burst';
    if (meta.includes('weight') || meta.includes('drop')) return 'dust-impact';
    if (meta.includes('photograph') || meta.includes('fad')) return 'memory-orbs';
    if (meta.includes('petal') || meta.includes('bloom') || meta.includes('flower')) return 'light-rays';
    if (meta.includes('glow') || meta.includes('radiat')) return 'ember';
    if (meta.includes('path') || meta.includes('wind')) return 'dust-impact';
  }

  // Priority 3: entry style
  if (directive.entry === 'bloom') return 'light-rays';
  if (directive.entry === 'rise') return 'ember';
  if (directive.entry === 'burst' || directive.entry === 'explode-in') return 'spark-burst';
  if (directive.entry === 'shake' || directive.entry === 'slam-down') return 'dust-impact';

  // Priority 4: behavior
  if (directive.behavior === 'float') return 'dust-impact';
  if (directive.behavior === 'pulse') return 'spark-burst';

  return 'none';
}

function resolveV3EmitterDirection(directive: WordDirectiveLike | null): 'up' | 'down' | 'left' | 'right' | 'radial' {
  if (directive?.ghostDirection) return directive.ghostDirection;
  if (directive?.behavior === 'float') return 'up';
  if (directive?.entry === 'rise') return 'up';
  if (directive?.entry === 'bloom') return 'radial';
  if (directive?.entry === 'burst' || directive?.entry === 'explode-in') return 'radial';
  return 'up';
}


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
  iconGlyph?: string;
  iconStyle?: 'outline' | 'filled' | 'ghost';
  iconPosition?: 'behind' | 'above' | 'beside' | 'replace';
  iconScale?: number;
};

function buildWordDirectivesMap(wordDirectives: CinematicDirection['wordDirectives']): Record<string, WordDirectiveLike> {
  const map: Record<string, WordDirectiveLike> = {};
  if (!wordDirectives) return map;

  if (Array.isArray(wordDirectives)) {
    for (const directive of wordDirectives) {
      const key = String(directive?.word ?? '').trim().toLowerCase();
      if (!key) continue;
      map[key] = directive as WordDirectiveLike;
    }
    return map;
  }

  for (const [word, directive] of Object.entries(wordDirectives)) {
    const key = word.trim().toLowerCase();
    if (!key || !directive) continue;
    map[key] = directive as WordDirectiveLike;
  }

  return map;
}

type ChapterLike = {
  startRatio?: number;
  endRatio?: number;
  emotionalIntensity?: number;
  dominantColor?: string;
  typographyShift?: {
    fontWeight?: number;
    colorOverride?: string;
  };
  // Per-chapter overrides from new Gemini prompt
  motion?: string;
  texture?: string;
  typography?: string;
  atmosphere?: string;
  overrides?: {
    motion?: string;
    texture?: string;
    typography?: string;
    atmosphere?: string;
  };
};
type CameraDistanceLike = {
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
  resolvedPalettes: string[][];
  resolvedPaletteDefault: string[];
  fontFamily: string;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
  chapterLuminance: number[];
  springInitialVelocity: number;
  glowMax: number;
  energy: number;
  density: number;
  wordMeta: WordMetaEntry[];
  visualMode: VisualMode;
  heat: number;
  // Pre-computed once (was previously rebuilt every frame)
  phraseGroups: PhraseGroup[] | null;
  groupLayouts: Map<string, GroupPosition[]>;
  motionProfile: MotionProfile;
  motionDefaults: MotionDefaults;
  chapterMotionProfiles: MotionProfile[];
  chapterMotionDefaults: MotionDefaults[];
  chapterAtmosphere: AtmosphereConfig[];
  chapterTexture: TextureConfig[];
  chapterTypography: TypographyProfile[];
  chapterFontWeights: number[];
  animParams: { linger: number; stagger: number; entryDuration: number; exitDuration: number };
  manifestWordDirectives: Record<string, ManifestWordDirective>;
  manifestLineLayouts: Record<string, ManifestLineLayout>;
  manifestChapters: ManifestChapter[];
  manifestStagger: number | null;
  storyboard: StoryboardEntryLike[];
  emotionalArc: string;
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
  _visualMode: VisualMode,
): number {
  const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (isFillerWord(clean)) return Math.round(baseFontSize * 0.72);

  const emphasisLevel = directive?.emphasisLevel ?? 2;
  const scale = EMPHASIS_CURVE[emphasisLevel] ?? 1.0;
  // Clamp: hero word never exceeds 32% of reference canvas height (540)
  const maxWidthPx = 960 * 0.85;
  const avgCharWidth = 0.55;
  const charCount = Math.max(1, clean.length || word.length || 1);
  const maxFontByWidth = maxWidthPx / (charCount * avgCharWidth);
  const maxFontSize = Math.min(540 * 0.38, maxFontByWidth);
  const sized = Math.min(Math.round(baseFontSize * scale), maxFontSize);
  // Filler words are always subordinate — cap at base regardless of emphasis
  if (isFillerWord(clean)) return Math.min(sized, Math.round(baseFontSize * 0.72));
  return sized;
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
  fontWeight: number,
  fontFamily: string,
  measureCtx: OffscreenCanvasRenderingContext2D,
): GroupPosition[] {
  const count = group.words.length;
  const anchorIdx = group.anchorWordIdx;
  const anchorPositions: Array<[number, number]> = [
    [0.5, 0.5],
    [0.5, 0.38],
    [0.5, 0.62],
    [0.42, 0.5],
    [0.58, 0.5],
    [0.5, 0.45],
    [0.5, 0.55],
  ];
  const posVariant = anchorPositions[group.lineIndex % anchorPositions.length];
  const deterministicSpread = ((group.lineIndex * 0.618033) % 0.2) - 0.1;
  const cxBase = canvasW * (posVariant[0] + (visualMode === 'explosive' ? deterministicSpread : 0));
  const cyBase = canvasH * (posVariant[1] + (visualMode === 'explosive' ? deterministicSpread : 0));
  const slot = (group as any)._positionSlot ?? 0;
  const lineOffset = (group as any)._lineOffset ?? 0;
  const cx = cxBase + slot * canvasW * 0.16;
  const cy = cyBase + lineOffset;

  const MIN_FONT = 30;

  if (count === 1) {
    const isFiller = isFillerWord(group.words[0].word);
    return [{
      x: Math.max(80, Math.min(canvasW - 80, cx)),
      y: Math.round(Math.max(80, Math.min(canvasH - 80, cy))),
      fontSize: Math.max(MIN_FONT, isFiller ? baseFontSize * 0.9 : baseFontSize * 1.2),
      isAnchor: true,
      isFiller,
    }];
  }

  const positions: GroupPosition[] = [];
  const spread = visualMode === 'explosive' ? 1.4
    : visualMode === 'cinematic' ? 1.0 : 0.7;

  // Pre-compute font sizes for all words so we can calculate word widths for inline spacing
  const wordFontSizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const wm = group.words[i];
    const isFiller = isFillerWord(wm.word);
    const isAnchor = i === anchorIdx;
    const emp = wm.directive?.emphasisLevel ?? 1;
    if (isAnchor) {
      wordFontSizes.push(Math.max(MIN_FONT, baseFontSize * (EMPHASIS_CURVE[emp] ?? 1.0)));
    } else {
      wordFontSizes.push(Math.max(MIN_FONT, isFiller ? baseFontSize * 0.72 : baseFontSize * 0.88));
    }
  }

  const getWordWidth = (word: string, fontSize: number) => {
    const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (measureCtx.font !== fontStr) measureCtx.font = fontStr;
    return measureCtx.measureText(word).width;
  };

  const getSpaceWidth = (fontSize: number) => {
    const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (measureCtx.font !== fontStr) measureCtx.font = fontStr;
    return measureCtx.measureText(' ').width;
  };

  // All non-anchor words stay on one baseline in original word order (left-to-right readable phrase).
  // The anchor word gets its own prominent position; the rest form a centered phrase line below it.
  const supportIndices = Array.from({ length: count }, (_, i) => i).filter(i => i !== anchorIdx);

  // Place anchor word prominently
  {
    const isFiller = isFillerWord(group.words[anchorIdx].word);
    positions[anchorIdx] = { x: cx, y: Math.round(cy), fontSize: wordFontSizes[anchorIdx], isAnchor: true, isFiller };
  }

  // Layout remaining words as a single readable phrase on one baseline below the anchor
  if (supportIndices.length > 0) {
    // Use a uniform font size for the phrase line (the non-filler support size) for consistency
    const phraseFontSize = Math.max(MIN_FONT, baseFontSize * 0.82);

    // Calculate per-word widths + total group width, then lay out from the group's left edge.
    // This prevents all support words from collapsing to the same center x.
    const phraseWordWidths = supportIndices.map((idx) =>
      getWordWidth(group.words[idx].word, phraseFontSize),
    );
    const interWordSpace = getSpaceWidth(phraseFontSize);
    const totalWidth = phraseWordWidths.reduce((sum, width) => sum + width, 0)
      + interWordSpace * Math.max(0, supportIndices.length - 1);

    // Center the phrase block on cx, then place each word by cumulative width.
    // Use anchor fontSize directly — stable across line transitions
    const anchorFontSize = positions[anchorIdx]?.fontSize ?? baseFontSize;
    const phraseY = Math.round(cy + anchorFontSize * 1.25);
    const supportMargin = 80;
    const minLeft = supportMargin;
    const maxLeft = canvasW - supportMargin - totalWidth;
    const startX = Math.max(minLeft, Math.min(maxLeft, cx - totalWidth * 0.5));
    let cumulativeWidth = 0;
    for (let j = 0; j < supportIndices.length; j++) {
      const idx = supportIndices[j];
      const ww = phraseWordWidths[j];
      const isFiller = isFillerWord(group.words[idx].word);
      positions[idx] = {
        x: startX + cumulativeWidth + ww * 0.5,
        y: phraseY,
        fontSize: phraseFontSize,
        isAnchor: false,
        isFiller,
      };
      cumulativeWidth += ww + interWordSpace;
    }
  }

  // Fill any gaps (shouldn't happen, but defensive)
  for (let i = 0; i < count; i += 1) {
    if (!positions[i]) {
      const isFiller = isFillerWord(group.words[i].word);
      positions[i] = { x: cx, y: Math.round(cy), fontSize: wordFontSizes[i], isAnchor: false, isFiller };
    }
  }

  const margin = 80;
  for (let i = 0; i < positions.length; i += 1) {
    const pos = positions[i];
    const word = group.words[i]?.word ?? '';
    const halfW = getWordWidth(word, pos.fontSize) * 0.5;
    const minX = margin + halfW;
    const maxX = canvasW - margin - halfW;
    pos.x = Math.max(minX, Math.min(maxX, pos.x));
    pos.y = Math.round(Math.max(margin, Math.min(canvasH - margin, pos.y)));
  }

  return positions;
}


function dimColor(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const target = 100;
  const dr = Math.round(r * factor + target * (1 - factor));
  const dg = Math.round(g * factor + target * (1 - factor));
  const db = Math.round(b * factor + target * (1 - factor));
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${clamp(dr).toString(16).padStart(2, '0')}${clamp(dg).toString(16).padStart(2, '0')}${clamp(db).toString(16).padStart(2, '0')}`;
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

function resolveWorldDefaults(payload: ScenePayload, chapters: ChapterLike[]) {
  const cd = payload.cinematic_direction as (CinematicDirection & Record<string, unknown>) | null;
  const resolvedPaletteDefault = resolveV3Palette(payload);

  const typographyName = (cd?.typography as string | undefined) ?? 'clean-modern';
  const baseTypography = TYPOGRAPHY_PROFILES[typographyName] ?? TYPOGRAPHY_PROFILES['clean-modern'];

  const motionProfile: MotionProfile = ((cd?.motion as MotionProfile | undefined) && MOTION_DEFAULTS[cd.motion as MotionProfile])
    ? (cd.motion as MotionProfile)
    : ((payload.frame_state as any)?.motionProfile as MotionProfile | undefined) ?? 'fluid';

  const sceneTone = (cd?.sceneTone as SceneTone | undefined) ?? 'dark';
  const luminanceTriplet = SCENE_TONE_LUMINANCE[sceneTone] ?? SCENE_TONE_LUMINANCE.dark;
  const chapterLuminance = chapters.map((_, idx) => luminanceTriplet[Math.min(2, idx)] ?? luminanceTriplet[2]);

  const atmosphereName = (cd?.atmosphere as string | undefined) ?? 'cinematic';
  const baseAtmosphere = ATMOSPHERE_CONFIGS[atmosphereName] ?? ATMOSPHERE_CONFIGS.cinematic;

  const textureName = (cd?.texture as string | undefined) ?? 'smoke';
  const baseTexture = TEXTURE_CONFIGS[textureName] ?? TEXTURE_CONFIGS.smoke;

  const chapterMotionProfiles: MotionProfile[] = chapters.map((chapter) => {
    const chapterMotion = (chapter.overrides?.motion ?? chapter.motion ?? cd?.motion) as MotionProfile | undefined;
    if (chapterMotion && chapterMotion in MOTION_DEFAULTS) return chapterMotion;
    return motionProfile;
  });
  const chapterMotionDefaults: MotionDefaults[] = chapterMotionProfiles.map((mp) => MOTION_DEFAULTS[mp]);
  const chapterAtmosphere: AtmosphereConfig[] = chapters.map((chapter) => {
    const key = chapter.overrides?.atmosphere ?? chapter.atmosphere;
    return (key && ATMOSPHERE_CONFIGS[key]) ? ATMOSPHERE_CONFIGS[key] : baseAtmosphere;
  });
  const chapterTexture: TextureConfig[] = chapters.map((chapter) => {
    const key = chapter.overrides?.texture ?? chapter.texture;
    return (key && TEXTURE_CONFIGS[key]) ? TEXTURE_CONFIGS[key] : baseTexture;
  });
  const chapterTypography: TypographyProfile[] = chapters.map((chapter) => {
    const key = chapter.overrides?.typography ?? chapter.typography;
    return (key && TYPOGRAPHY_PROFILES[key]) ? TYPOGRAPHY_PROFILES[key] : baseTypography;
  });

  return {
    resolvedPaletteDefault,
    baseTypography,
    motionProfile,
    chapterMotionProfiles,
    chapterMotionDefaults,
    chapterLuminance,
    baseAtmosphere,
    chapterAtmosphere,
    baseTexture,
    chapterTexture,
    chapterTypography,
    emotionalArc: (cd?.emotionalArc as string | undefined) ?? 'slow-burn',
  };
}

function createPrebakedData(payload: ScenePayload, totalFrames: number, visualMode: VisualMode): PrebakedData {
  // V3 uses sections (enriched with startRatio/endRatio), V2 used chapters directly
  const rawChapters = (payload.cinematic_direction?.chapters ?? []) as ChapterLike[];
  const chapters: ChapterLike[] = rawChapters.length > 0
    ? rawChapters
    : enrichSections(payload.cinematic_direction?.sections).map((s: CinematicSection) => ({
        title: s.description ?? `Section ${s.sectionIndex}`,
        startRatio: s.startRatio,
        endRatio: s.endRatio,
        emotionalArc: s.mood ?? '',
        dominantColor: '',
        lightBehavior: '',
        particleDirective: '',
        backgroundDirective: '',
        emotionalIntensity: 0.5,
        typographyShift: null,
        motion: s.motion,
        texture: s.texture,
        typography: s.typography,
        atmosphere: s.atmosphere,
        sectionIndex: s.sectionIndex,
        description: s.description,
        mood: s.mood,
      } as ChapterLike));
  const resolved = resolveWorldDefaults(payload, chapters);
  const wordDirectivesMap = buildWordDirectivesMap(payload.cinematic_direction?.wordDirectives);
  const tensionCurve = ((payload.cinematic_direction?.tensionCurve as TensionStageLike[] | undefined)?.length
    ? payload.cinematic_direction?.tensionCurve
    : deriveTensionCurve(payload.cinematic_direction?.emotionalArc)) as TensionStageLike[];
  const physSpec = payload.motion_profile_spec as unknown as Record<string, unknown> | null;
  const energy = Number(physSpec?.energy ?? 0.5);
  const density = Number(physSpec?.density ?? 0.5);
  const storyboards = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];
  const songDuration = Math.max(0.01, payload.songEnd - payload.songStart);
  // Global heat/beatResponse from motion pick or old path
  const globalMotion = resolved.motionProfile;
  const heat = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat
    ?? HEAT_FROM_MOTION[globalMotion] ?? 0.5;
  const beatResponse = payload.cinematic_direction?.visualWorld?.physicsProfile?.beatResponse
    ?? BEAT_FROM_MOTION[globalMotion] ?? 'slam';

  const chapterMotionProfiles = resolved.chapterMotionProfiles;
  const chapterMotionDefaults = resolved.chapterMotionDefaults;
  const chapterFontWeights: number[] = resolved.chapterTypography.map((typo) => typo.fontWeight);
  const resolvedPaletteDefault = resolveV3Palette(payload);
  const resolvedPalettes = chapters.map((ch: any) => {
    const mid = ((ch.startRatio ?? 0) + (ch.endRatio ?? 1)) / 2;
    return resolveV3Palette(payload, mid);
  });

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
    const actIdx = Math.max(0, chapters.indexOf(currentChapter as ChapterLike));
    const actSizeMultiplier = actIdx === 0 ? 0.85 : actIdx === 1 ? 1.0 : 1.2;

    const useCinematicSizes = payload.cinematic_direction != null;
    const shotFontSizes: Record<string, number> = useCinematicSizes
      ? { Wide: 56, Medium: 72, Close: 88, CloseUp: 104, ExtremeClose: 120, FloatingInWorld: 60 }
      : { Wide: 34, Medium: 44, Close: 54, CloseUp: 62, ExtremeClose: 72, FloatingInWorld: 36 };

    const baseFontSize = shotFontSizes[shot] ?? 36;
    const actBaseFontSize = baseFontSize * actSizeMultiplier;
    return Math.round(actBaseFontSize);
  });


  const lineColors = payload.lines.map((_, idx) => {
    const line = payload.lines[idx];
    const lineProgress = songDuration > 0
      ? ((line.start ?? 0) - (payload.songStart ?? 0)) / songDuration
      : 0;
    // Resolve palette per-line (picks chapter override if available)
    const linePalette = resolveV3Palette(payload, lineProgress);

    const chapter = findByRatio(chapters, lineProgress);
    const chapterIndex = chapters.indexOf(chapter as ChapterLike);
    const colorOverride = (chapter as any)?.typographyShift?.colorOverride
      ?? (chapter as any)?.overrides?.colorOverride;
    if (colorOverride) return colorOverride;

    const textColor = linePalette[2];
    const accentColor = linePalette[1];

    if (chapterIndex >= 2) return accentColor;
    if (chapterIndex === 1) return blendWithWhite(accentColor, 0.35);
    return textColor;
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

    let latestIdx = -1;
    let latestStart = -Infinity;
    for (let idx = 0; idx < payload.lines.length; idx += 1) {
      const line = payload.lines[idx];
      const lineStart = line.start ?? 0;
      if (tSec >= lineStart && tSec < (line.end ?? 0) && lineStart >= latestStart) {
        latestStart = lineStart;
        latestIdx = idx;
      }
    }
    activeLineByFrame[frameIndex] = latestIdx;
  }
  // Pre-compute phrase groups, motion profile, and layouts ONCE
  const frameState = (payload.frame_state ?? null) as unknown as Record<string, unknown> | null;
  const manifestWordDirectives = (frameState?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
  const manifestLineLayouts = (frameState?.lineLayouts ?? {}) as Record<string, ManifestLineLayout>;
  const manifestChapters = (frameState?.chapters ?? []) as ManifestChapter[];
  const manifestStagger = typeof frameState?.stagger === 'number' ? frameState.stagger : null;
  const storyboard = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];

  const motionProfile = resolved.motionProfile;
  const motionDefaults = MOTION_DEFAULTS[motionProfile];

  const WORD_LINGER_BY_PROFILE: Record<string, number> = {
    weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05,
  };
  const animParams = {
    linger: WORD_LINGER_BY_PROFILE[motionProfile] ?? 0.4,
    stagger: manifestStagger ?? 0.05,
    entryDuration: motionDefaults.entryDuration,
    exitDuration: motionDefaults.exitDuration,
  };

  const phraseGroups = words.length > 0 ? buildPhraseGroups(wordMeta) : null;
  if (phraseGroups) {
    const slotStarts: number[] = [];
    const slotEnds: number[] = [];
    for (let gi = 0; gi < phraseGroups.length; gi += 1) {
      const group = phraseGroups[gi];
      const visStart = group.start - animParams.entryDuration - animParams.stagger * group.words.length;
      const visEnd = group.end + animParams.linger + animParams.exitDuration;
      let slot = 0;
      for (; slot < slotEnds.length; slot += 1) {
        if (visStart >= slotEnds[slot]) break;
      }
      if (slot === slotEnds.length) {
        slotStarts.push(visStart);
        slotEnds.push(visEnd);
      } else {
        slotStarts[slot] = visStart;
        slotEnds[slot] = visEnd;
      }
      (group as any)._positionSlot = slot % 3;
    }

    const byLine = new Map<number, PhraseGroup[]>();
    for (let gi = 0; gi < phraseGroups.length; gi += 1) {
      const group = phraseGroups[gi];
      const arr = byLine.get(group.lineIndex) ?? [];
      arr.push(group);
      byLine.set(group.lineIndex, arr);
    }
    for (const [, groups] of byLine) {
      for (let gi = 0; gi < groups.length; gi += 1) {
        const g = groups[gi];
        const t = g.start;
        const visibleLineIndices: number[] = [];
        for (let li = 0; li < payload.lines.length; li += 1) {
          const line = payload.lines[li];
          if (t >= (line.start ?? 0) && t < (line.end ?? 0)) visibleLineIndices.push(li);
        }
        const visibleCount = Math.max(1, visibleLineIndices.length);
        const lineSpacing = 72;
        const linePos = Math.max(0, visibleLineIndices.indexOf(g.lineIndex));
        (g as any)._lineOffset = (linePos - (visibleCount - 1) * 0.5) * lineSpacing;
      }
    }
  }
  const measureCanvas = new OffscreenCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d')!;

  const groupLayouts = new Map<string, GroupPosition[]>();
  if (phraseGroups) {
    for (let gi = 0; gi < phraseGroups.length; gi += 1) {
      const group = phraseGroups[gi];
      const key = `${group.lineIndex}-${group.groupIndex}`;
      const baseFontSize = lineFontSizes[group.lineIndex] ?? 36;
      groupLayouts.set(
        key,
        getGroupLayout(
          group,
          visualMode,
          960,
          540,
          baseFontSize,
          resolved.baseTypography.fontWeight,
          resolved.baseTypography.fontFamily,
          measureCtx,
        ),
      );
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
    resolvedPalettes,
    resolvedPaletteDefault,
    fontFamily: resolved.baseTypography.fontFamily,
    textTransform: resolved.baseTypography.textTransform,
    letterSpacing: resolved.baseTypography.letterSpacing,
    chapterLuminance: resolved.chapterLuminance,
    springInitialVelocity: beatResponse === 'slam' ? 1.8 * heat : 0.8 * heat,
    glowMax: beatResponse === 'slam' ? 1.2 * heat : 0.6 * heat,
    energy,
    density,
    wordMeta,
    visualMode,
    heat,
    phraseGroups,
    groupLayouts,
    motionProfile,
    motionDefaults,
    chapterMotionProfiles,
    chapterMotionDefaults,
    chapterAtmosphere: resolved.chapterAtmosphere,
    chapterTexture: resolved.chapterTexture,
    chapterTypography: resolved.chapterTypography,
    chapterFontWeights,
    animParams,
    manifestWordDirectives,
    manifestLineLayouts,
    manifestChapters,
    manifestStagger,
    storyboard,
    emotionalArc: resolved.emotionalArc,
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
  const arcFn = ARC_CURVES[pre.emotionalArc] ?? ARC_CURVES['slow-burn'];
  const intensity = Math.max(0, Math.min(1, arcFn(songProgress)));
  const intensityGlowMult = 0.5 + intensity * 1.0;
  const intensityScaleMult = 0.95 + intensity * 0.1;
  const activeLineIndex = pre.activeLineByFrame[frameIndex] ?? -1;
  const beatIndex = getBeatIndex(tSec, state);

  if (beatIndex !== state.lastBeatIndex) {
    state.lastBeatIndex = beatIndex;
    state.glowBudget = 13;
    state.springVelocity = pre.springInitialVelocity;
  }
  if (state.glowBudget > 0) state.glowBudget -= 1;
  const glowProgress = state.glowBudget / 13;
  const glow = Math.pow(glowProgress, 0.6);

  state.springOffset += state.springVelocity;
  state.springVelocity *= 0.82;
  state.springOffset *= 0.88;
  const scale = 1.0 + Math.max(0, state.springOffset);

  const tensionMotion = pre.tensionMotionByFrame[frameIndex] ?? 0.5;

  const chapters = pre.chapters;
  const manifestWordDirectives = pre.manifestWordDirectives;
  const manifestChapters = pre.manifestChapters;
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
  const fallbackZoom = distanceToZoom['Medium'] ?? 1.0;
  const targetZoom = manifestChapters[currentChapterIdx]?.zoom ?? fallbackZoom;

  state.currentZoom = state.currentZoom ?? 1.0;
  state.currentZoom += (targetZoom - state.currentZoom) * 0.06;


  const chunks: Keyframe["chunks"] = [];

  if (pre.wordMeta.length > 0) {
    const currentChapter = findByRatio(chapters, songProgress);
    const chapterEmotionalIntensity = currentChapter?.emotionalIntensity ?? pre.heat;
    // Use per-chapter motion if available, else global
    const activeChapterIdx = currentChapterIdx >= 0 ? currentChapterIdx : 0;
    const motionDefaults = pre.chapterMotionDefaults[activeChapterIdx] ?? pre.motionDefaults;
    const storyboard = pre.storyboard;
    const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;
    const animParams = pre.animParams;
    const phraseGroups = pre.phraseGroups;
    const groupLayouts = pre.groupLayouts;

    if (phraseGroups) {
      for (let gi = 0; gi < phraseGroups.length; gi += 1) {
        const group = phraseGroups[gi];
        const nextGroupStart = phraseGroups[gi + 1]?.start ?? Infinity;
        const groupEnd = Math.min(group.end + animParams.linger, nextGroupStart);
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
        const storyEntry = storyboard?.[group.lineIndex];
        const iconGlyph = storyEntry?.iconGlyph ?? null;
        const iconStyle = storyEntry?.iconStyle ?? 'ghost';
        const iconPosition = storyEntry?.iconPosition ?? 'behind';
        const iconScale = storyEntry?.iconScale ?? 2.0;

        for (let wi = 0; wi < group.words.length; wi += 1) {
          const wm = group.words[wi];
          const pos = layout[wi];
          if (!pos) continue;

          const isAnchor = wi === group.anchorWordIdx;
          const staggerDelay = isAnchor ? 0 : Math.abs(wi - group.anchorWordIdx) * animParams.stagger;
          const manifestDirective = manifestWordDirectives[wm.clean] ?? null;

          const metaphor = wm.directive?.visualMetaphor as VisualMetaphor | undefined;
          const semanticEffect = metaphor ? SEMANTIC_EFFECTS[metaphor] : null;
          const effectiveEntry = (wm.directive?.entry as EntryStyle | undefined) ?? semanticEffect?.entry ?? entry;
          const effectiveBehavior = (wm.directive?.behavior as BehaviorStyle | undefined) ?? semanticEffect?.behavior ?? behavior;
          const effectiveExit = (wm.directive?.exit as ExitStyle | undefined) ?? semanticEffect?.exit ?? exit;
          const entryDurationMult = semanticEffect?.entryDurationMult ?? 1.0;
          const semanticAlphaMax = semanticEffect?.alphaMax ?? 1.0;
          const semanticScaleX = semanticEffect?.scaleX ?? 1.0;
          const semanticScaleY = semanticEffect?.scaleY ?? 1.0;
          const semanticGlowMult = semanticEffect?.glowMultiplier ?? 1.0;
          const semanticFontWeight = semanticEffect?.fontWeight ?? null;
          const semanticColorOverride = semanticEffect?.colorOverride ?? null;
          const directiveTrail = wm.directive?.trail ?? 'none';
          const emitterType: WordEmitterType = semanticEffect?.emitterType
            ?? (directiveTrail !== 'none' ? directiveTrail as WordEmitterType : undefined)
            ?? resolveV3EmitterType(wm.directive)
            ?? 'none';
          const isLetterSequence = wm.directive?.letterSequence === true;
          const letterTotal = isLetterSequence ? wm.word.length : 1;
          const splitExitStyles: ExitStyle[] = ['scatter-letters', 'peel-off', 'peel-reverse', 'cascade-down', 'cascade-up'];

          for (let li = 0; li < letterTotal; li += 1) {
            const letterDelay = isLetterSequence ? li * 0.06 : 0;
            const adjustedElapsed = Math.max(0, tSec - group.start - staggerDelay - letterDelay);
            const effectiveEntryDuration = animParams.entryDuration * entryDurationMult;
            const rawEntryProgress = adjustedElapsed / Math.max(0.01, effectiveEntryDuration);
            const entryProgress = Math.min(1, Math.max(0, rawEntryProgress));
            const exitDelay = isLetterSequence && splitExitStyles.includes(effectiveExit) ? letterDelay : 0;
            const effectiveExitDuration = Math.min(animParams.exitDuration, Math.max(0.05, nextGroupStart - group.end));
            const exitProgress = Math.max(0, (tSec - group.end - exitDelay) / Math.max(0.01, effectiveExitDuration));

            const entryState = computeEntryState(effectiveEntry, entryProgress, motionDefaults.behaviorIntensity);
            const exitState = computeExitState(effectiveExit, exitProgress, motionDefaults.behaviorIntensity, li, letterTotal);
            const beatPhase = beatIndex >= 0
              ? ((tSec - (state.beats[beatIndex] ?? 0)) / (60 / (bpm ?? 120))) % 1
              : 0;
            const behaviorState = computeBehaviorState(effectiveBehavior, tSec, group.start, beatPhase, motionDefaults.behaviorIntensity);

            const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
            const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
            const rawScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1);
            const rawScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1);
            const finalScaleX = rawScaleX * semanticScaleX;
            const finalScaleY = rawScaleY * semanticScaleY;
            const isEntryComplete = entryProgress >= 1.0;
            const isExiting = exitProgress > 0;
            const rawFinalAlpha = isExiting ? Math.max(0, exitState.alpha) : isEntryComplete ? 1.0 * (behaviorState.alpha ?? 1) : Math.max(0.1, entryState.alpha * (behaviorState.alpha ?? 1));
            const finalAlpha = Math.min(semanticAlphaMax, rawFinalAlpha);
            const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
            const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);
            const finalBlur = (entryState.blur ?? 0) + (exitState.blur ?? 0) + (behaviorState.blur ?? 0);
            const finalRotation = (entryState.rotation ?? 0) + (exitState.rotation ?? 0) + (behaviorState.rotation ?? 0);
            const isFrozen = effectiveBehavior === 'freeze' && (tSec - group.start) > 0.3;

            const baseColor = semanticColorOverride ?? manifestDirective?.color ?? wm.directive?.colorOverride ?? pre.lineColors[wm.lineIndex] ?? '#ffffff';
            const color = isAnchor ? baseColor : dimColor(baseColor, 0.65);
            const wordGlow = (isAnchor ? glow * (1 + finalGlowMult) * (pos.isFiller ? 0.5 : 1.0) : glow * 0.3) * semanticGlowMult * intensityGlowMult;
            const chapterTypography = pre.chapterTypography[activeChapterIdx] ?? pre.chapterTypography[0];
            const chapterFontWeight = semanticFontWeight
              ?? currentChapter?.typographyShift?.fontWeight
              ?? (isAnchor ? chapterTypography?.heroWeight : chapterTypography?.fontWeight)
              ?? pre.chapterFontWeights[activeChapterIdx]
              ?? 700;
            const chunkText = isLetterSequence
              ? (wm.word[li] ?? '')
              : (chapterTypography?.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word);

            // Letter positioning: spread characters across word span, centered on pos.x
            const charW = isLetterSequence ? pos.fontSize * 0.6 : 0;
            const wordSpan = charW * letterTotal;
            const letterOffsetX = isLetterSequence
              ? (li * charW) - (wordSpan * 0.5) + (charW * 0.5)
              : 0;

            chunks.push({
              id: isLetterSequence ? `${group.lineIndex}-${group.groupIndex}-${wi}-L${li}` : `${group.lineIndex}-${group.groupIndex}-${wi}`,
              text: chunkText,
              x: Math.round(pos.x + finalOffsetX + letterOffsetX),
              y: Math.round(pos.y + finalOffsetY),
              alpha: Math.max(0, Math.min(1, finalAlpha)),
              scaleX: finalScaleX * (manifestDirective?.scaleX ?? 1) * intensityScaleMult,
              scaleY: finalScaleY * (manifestDirective?.scaleY ?? 1) * intensityScaleMult,
              scale: 1,
              visible: finalAlpha > 0.01,
              fontSize: pos.fontSize,
              fontWeight: chapterFontWeight,
              fontFamily: chapterTypography?.fontFamily ?? pre.fontFamily,
              isAnchor,
              color,
              glow: wordGlow,
              emitterType: emitterType !== 'none' ? emitterType : undefined,
              trail: wm.directive?.trail ?? (emitterType !== 'none' ? emitterType : 'none'),
              entryStyle: (wm.directive?.entry as string | undefined) ?? effectiveEntry,
              exitStyle: (wm.directive?.exit as string | undefined) ?? effectiveExit,
              emphasisLevel: wm.directive?.emphasisLevel ?? 3,
              entryProgress,
              exitProgress: Math.min(1, exitProgress),
              iconGlyph: isAnchor && iconGlyph && !isLetterSequence ? iconGlyph : undefined,
              iconStyle: isAnchor && iconGlyph && !isLetterSequence ? iconStyle : undefined,
              iconPosition: isAnchor && iconGlyph && !isLetterSequence ? iconPosition : undefined,
              iconScale: isAnchor && iconGlyph && !isLetterSequence ? iconScale : undefined,
              behavior: (wm.directive?.behavior as BehaviorStyle | undefined) ?? effectiveBehavior,
              skewX: finalSkewX,
              blur: Math.max(0, Math.min(1, finalBlur)),
              rotation: finalRotation,
              ghostTrail: wm.directive?.ghostTrail,
              ghostCount: wm.directive?.ghostCount,
              ghostSpacing: wm.directive?.ghostSpacing,
              ghostDirection: wm.directive?.ghostDirection,
              letterIndex: isLetterSequence ? li : undefined,
              letterTotal: isLetterSequence ? letterTotal : undefined,
              letterDelay,
              isLetterChunk: isLetterSequence || undefined,
              frozen: isFrozen,
              entryOffsetY: 0,
              entryOffsetX: 0,
              entryScale: 1,
              exitOffsetY: 0,
              exitScale: 1,
            });
          }
        }
      }
    } else {
      const wordLinger = pre.animParams.linger;
      const wordChunks = pre.wordMeta
        .filter((wm, i, arr) => {
          const nextWordStart = arr[i + 1]?.start ?? Infinity;
          const effectiveEnd = Math.min(wm.end + wordLinger, nextWordStart);
          return tSec >= wm.start && tSec < effectiveEnd;
        })
        .flatMap((wm) => {
          const lineWords = pre.wordMeta.filter((w) => w.lineIndex === wm.lineIndex);
          const totalWords = lineWords.length;
          const manifestDirective = manifestWordDirectives[wm.clean] ?? null;
          const lineLayout = pre.manifestLineLayouts[String(wm.lineIndex)] ?? null;
          const position = manifestDirective?.position
            ?? lineLayout?.positions?.[wm.wordIndex]
            ?? getLayoutForMode(pre.visualMode, wm.wordIndex, totalWords, chapterEmotionalIntensity);
          const [nx, ny] = position;

          const baseFontSizeForClamp = pre.lineFontSizes[wm.lineIndex] ?? 36;
          const widthForClamp = Math.max(1, wm.word.length * baseFontSizeForClamp * 0.55);
          const halfWForClamp = widthForClamp * 0.5;
          const marginClamp = 80;
          const canvasX = Math.max(marginClamp + halfWForClamp, Math.min(960 - marginClamp - halfWForClamp, nx * 960));
          const canvasY = Math.max(marginClamp, Math.min(540 - marginClamp, ny * 540));
          const elapsed = tSec - wm.start;

          const stagger = wm.wordIndex * (pre.manifestStagger ?? lineLayout?.stagger ?? 0);

          const { entry: baseEntry, behavior: baseBehavior, exit: baseExit } = assignWordAnimations(
            wm,
            motionDefaults,
            storyboard as StoryboardEntryLike[],
            manifestDirective,
          );
          const entry = (wm.directive?.entry as EntryStyle | undefined) ?? baseEntry;
          const behavior = (wm.directive?.behavior as BehaviorStyle | undefined) ?? baseBehavior;
          const exit = (wm.directive?.exit as ExitStyle | undefined) ?? baseExit;

          const splitExitStyles: ExitStyle[] = ['scatter-letters', 'peel-off', 'peel-reverse', 'cascade-down', 'cascade-up'];
          const isLetterSequence = wm.directive?.letterSequence === true;
          const letterTotal = isLetterSequence ? wm.word.length : 1;

          return Array.from({ length: letterTotal }, (_, li) => {
            const letterDelay = isLetterSequence ? li * 0.06 : 0;
            const adjustedElapsed = Math.max(0, elapsed - stagger - letterDelay);

            const entryProgress = Math.max(0, adjustedElapsed / motionDefaults.entryDuration);
            const entryState = computeEntryState(entry, entryProgress, motionDefaults.behaviorIntensity);

            const exitDuration = exit === 'linger' ? 0.05
              : exit === 'evaporate' ? 0.8
                : motionDefaults.exitDuration;
            const exitDelay = isLetterSequence && splitExitStyles.includes(exit) ? letterDelay : 0;
            const exitProgress = Math.max(0, (tSec - wm.end - exitDelay) / exitDuration);
            const exitState = computeExitState(exit, exitProgress, motionDefaults.behaviorIntensity, li, letterTotal);

            const beatPhase = beatIndex >= 0
              ? ((tSec - (state.beats[beatIndex] ?? 0)) / (60 / (bpm ?? 120))) % 1
              : 0;
            const effectiveBehavior = (wm.directive?.behavior as BehaviorStyle | undefined) ?? behavior;
            const behaviorState = computeBehaviorState(
              effectiveBehavior,
              tSec,
              wm.start,
              beatPhase,
              motionDefaults.behaviorIntensity,
            );

            const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
            const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
            const finalScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1);
            const finalScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1);
            const isEntryComplete2 = entryProgress >= 1.0;
            const isExiting2 = exitProgress > 0;
            const finalAlpha = isExiting2
              ? Math.max(0, exitState.alpha)
              : isEntryComplete2
                ? 1.0 * (behaviorState.alpha ?? 1)
                : Math.max(0.1, entryState.alpha * (behaviorState.alpha ?? 1));
            const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
            const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);
            const finalBlur = (entryState.blur ?? 0) + (exitState.blur ?? 0) + (behaviorState.blur ?? 0);
            const finalRotation = (entryState.rotation ?? 0) + (exitState.rotation ?? 0) + (behaviorState.rotation ?? 0);
            const isFrozen = effectiveBehavior === 'freeze' && (tSec - wm.start) > 0.3;

            const color = manifestDirective?.color
              ?? wm.directive?.colorOverride
              ?? pre.lineColors[wm.lineIndex]
              ?? '#ffffff';

            const baseFontSize = pre.lineFontSizes[wm.lineIndex] ?? 36;
            const soloWordBonus = pre.motionProfile === 'drift' || pre.motionProfile === 'fluid' ? 1.3 : 1.0;
            const fontSize = manifestDirective?.fontSize
              ?? getWordFontSize(wm.word, wm.directive, baseFontSize * soloWordBonus, pre.visualMode);
            const activeChIdx = chapters.findIndex((ch) =>
              songProgress >= (ch.startRatio ?? 0) && songProgress < (ch.endRatio ?? 1));
            const chapterFontWeight = currentChapter?.typographyShift?.fontWeight
              ?? pre.chapterFontWeights[activeChIdx >= 0 ? activeChIdx : 0] ?? 700;

            const wordGlow = manifestDirective?.glow
              ? glow * manifestDirective.glow
              : (wm.directive?.emphasisLevel ?? 0) >= 4 ? glow * 1.8 : glow * 0.6;

            // Letter positioning: spread characters across word span, centered on canvasX
            const charW2 = isLetterSequence ? fontSize * 0.6 : 0;
            const wordSpan2 = charW2 * letterTotal;
            const letterOffsetX2 = isLetterSequence
              ? (li * charW2) - (wordSpan2 * 0.5) + (charW2 * 0.5)
              : 0;

            return {
              id: isLetterSequence ? `${wm.lineIndex}-${wm.wordIndex}-L${li}` : `${wm.lineIndex}-${wm.wordIndex}`,
              text: isLetterSequence ? wm.word[li] ?? '' : wm.word,
              x: Math.round(canvasX + finalOffsetX + letterOffsetX2),
              y: Math.round(canvasY + finalOffsetY),
              alpha: finalAlpha,
              scaleX: finalScaleX * (manifestDirective?.scaleX ?? 1),
              scaleY: finalScaleY * (manifestDirective?.scaleY ?? 1),
              scale: 1,
              visible: finalAlpha > 0.01,
              fontSize,
              fontWeight: chapterFontWeight,
              isAnchor: (wm.directive?.emphasisLevel ?? 0) >= 3,
              color,
              glow: wordGlow * (1 + finalGlowMult),
              entryOffsetY: 0,
              entryOffsetX: 0,
              entryScale: 1,
              exitOffsetY: 0,
              exitScale: 1,
              skewX: finalSkewX,
              behavior: effectiveBehavior,
              blur: Math.max(0, Math.min(1, finalBlur)),
              rotation: finalRotation,
              ghostTrail: wm.directive?.ghostTrail,
              ghostCount: wm.directive?.ghostCount,
              ghostSpacing: wm.directive?.ghostSpacing,
              ghostDirection: wm.directive?.ghostDirection,
              letterIndex: isLetterSequence ? li : undefined,
              letterTotal: isLetterSequence ? letterTotal : undefined,
              letterDelay,
              isLetterChunk: isLetterSequence || undefined,
              frozen: isFrozen,
              trail: wm.directive?.trail ?? (resolveV3EmitterType(wm.directive) !== 'none' ? resolveV3EmitterType(wm.directive) : 'none'),
              emitterType: resolveV3EmitterType(wm.directive) !== 'none' ? resolveV3EmitterType(wm.directive) : undefined,
              entryStyle: (wm.directive?.entry as string | undefined) ?? entry,
              exitStyle: (wm.directive?.exit as string | undefined) ?? exit,
              emphasisLevel: wm.directive?.emphasisLevel ?? 3,
              entryProgress: Math.min(1, entryProgress),
              exitProgress: Math.min(1, exitProgress),
            };
          });
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
        text: line.text,
        x: Math.round(x),
        y: Math.round(y),
        alpha,
        glow: chunkGlow,
        scale: chunkScale,
        scaleX: chunkScale,
        scaleY: chunkScale,
        visible,
        fontSize: pre.lineFontSizes[idx] ?? 36,
        fontWeight: (currentChapterIdx >= 0 ? chapters[currentChapterIdx]?.typographyShift?.fontWeight : undefined)
          ?? pre.chapterFontWeights[currentChapterIdx >= 0 ? currentChapterIdx : 0] ?? 700,
        color: pre.lineColors[idx] ?? "#ffffff",
        isAnchor: lineActive,
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
            text: directiveWord.toUpperCase(),
            x: Math.round(x + preOffset + heroOffset),
            y: Math.round(y),
            alpha: Math.min(1, alpha + ((entryStyle as string) === 'punch' ? 0.2 : 0.15)),
            glow: Math.min(1, chunkGlow + 0.2),
            scale: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            scaleX: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            scaleY: Math.min(chunkScale * ((exitStyle as string) === 'snap' ? 1.2 : 1.15), 1.25),
            visible,
            fontSize: pre.lineFontSizes[idx] ?? 36,
            fontWeight: (currentChapterIdx >= 0 ? chapters[currentChapterIdx]?.typographyShift?.fontWeight : undefined)
              ?? pre.chapterFontWeights[currentChapterIdx >= 0 ? currentChapterIdx : 0] ?? 700,
            color: pre.lineColors[idx] ?? "#ffffff",
            isAnchor: true,
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
  const activeChapterIdx = chapterIdx >= 0 ? chapterIdx : 0;
  const bgBlend = pre.chapterLuminance[activeChapterIdx] ?? 0.05;

  const chapterTexture = pre.chapterTexture[activeChapterIdx] ?? pre.chapterTexture[0] ?? TEXTURE_CONFIGS.smoke;
  const particleCount = Math.max(0, Math.floor(chapterTexture.particleCount * (0.6 + (state.glowBudget / 13) * 0.6)));
  const speed = chapterTexture.speed;
  const particles: Keyframe["particles"] = Array.from({ length: particleCount }, (_, i) => {
    const seed = (i * 0.618033) % 1;
    const seed2 = (i * 0.381966) % 1;
    const drift = (tSec * 0.03 * Math.max(0.05, speed) * (0.5 + seed * 0.5)) % 1;
    const [minSize, maxSize] = chapterTexture.size;
    const [minAlpha, maxAlpha] = chapterTexture.opacity;
    const size = minSize + (maxSize - minSize) * seed;
    const alpha = (minAlpha + (maxAlpha - minAlpha) * seed2) * (0.4 + (state.glowBudget / 13) * 0.6);
    return {
      x: 0.1 + (seed * 0.8),
      y: ((0.1 + seed2 * 0.8) - drift + 1) % 1,
      size,
      alpha,
      shape: chapterTexture.shape,
    };
  });

  const textureColorMap: Record<TextureConfig['particleColor'], number> = {
    accent: 1,
    text: 2,
    glow: 3,
    dim: 4,
  };
  const activePalette = pre.resolvedPalettes[activeChapterIdx] ?? pre.resolvedPaletteDefault;
  const particleColor = activePalette[textureColorMap[chapterTexture.particleColor]] ?? activePalette[2] ?? '#ffffff';

  const chapterAtmosphere = pre.chapterAtmosphere[activeChapterIdx] ?? pre.chapterAtmosphere[0] ?? ATMOSPHERE_CONFIGS.cinematic;

  return {
    timeMs,
    chunks,
    cameraX: Math.sin(songProgress * Math.PI * 3.7) * 14 * tensionMotion,
    cameraY: Math.cos(songProgress * Math.PI * 2.3) * 8 * tensionMotion,
    cameraZoom: state.currentZoom,
    beatIndex,
    bgBlend,
    particles,
    particleColor,
    atmosphere: chapterAtmosphere,
    sectionIndex: activeChapterIdx,
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
    const ps = payload.motion_profile_spec as unknown as Record<string, unknown> | null;
    const motionDiag = (payload.cinematic_direction as any)?.motion as string | undefined;
    const h = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat ?? HEAT_FROM_MOTION[motionDiag ?? ''] ?? 0.5;
    const br = payload.cinematic_direction?.visualWorld?.physicsProfile?.beatResponse ?? BEAT_FROM_MOTION[motionDiag ?? ''] ?? 'slam';
    const ch = Number(ps?.chaos ?? 0);
    const ap = {
      linger: ({ weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05 } as Record<string, number>)[mp] ?? 0.4,
      stagger: 0.05,
      entryDuration: md.entryDuration,
      exitDuration: md.exitDuration,
    };

    const pg = payload.words?.length > 0 ? buildPhraseGroups(pre.wordMeta) : null;
    const sb = payload.cinematic_direction?.storyboard ?? [];
    const sm = (payload.frame_state ?? null) as unknown as Record<string, unknown> | null;
    const mwd = (sm?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
    pg?.slice(0, 5).forEach((group, i) => {
      const anchor = group.words[group.anchorWordIdx];
      const { entry, behavior, exit } = assignWordAnimations(
        anchor, md,
        sb as StoryboardEntryLike[],
        mwd[anchor?.clean] ?? null,
      );
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
