import type { CinematicDirection, CinematicSection } from "@/types/CinematicDirection";
import { enrichSections } from "@/engine/directionResolvers";
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

const deterministicSign = (seed: number): number => (Math.sin(seed * 127.1 + 311.7) > 0 ? 1 : -1);
export function easeOut(t: number): number { return 1 - Math.pow(1 - t, 3); }
export function easeIn(t: number): number { return Math.pow(t, 3); }
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
}

export type EntryStyle =
  | 'slam-down' | 'punch-in' | 'explode-in' | 'snap-in' | 'shatter-in'
  | 'rise' | 'materialize' | 'breathe-in' | 'drift-in' | 'surface'
  | 'drop' | 'plant' | 'stomp' | 'cut-in'
  | 'whisper' | 'bloom' | 'melt-in' | 'ink-drop'
  | 'fades'
  | 'focus-in' | 'spin-in' | 'tumble-in';

export type BehaviorStyle =
  | 'pulse' | 'vibrate' | 'float' | 'grow' | 'contract'
  | 'flicker' | 'orbit' | 'lean' | 'freeze' | 'tilt' | 'pendulum' | 'pulse-focus' | 'none';

export type ExitStyle =
  | 'shatter' | 'snap-out' | 'burn-out' | 'punch-out'
  | 'dissolve' | 'drift-up' | 'exhale' | 'sink'
  | 'drop-out' | 'cut-out' | 'vanish'
  | 'linger' | 'evaporate' | 'whisper-out'
  | 'fades'
  | 'gravity-fall' | 'soar' | 'launch' | 'scatter-fly'
  | 'melt' | 'freeze-crack'
  | 'scatter-letters' | 'cascade-down' | 'cascade-up'
  | 'blur-out' | 'spin-out' | 'peel-off' | 'peel-reverse';

export interface AnimState {
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

export type VisualMode = 'intimate' | 'cinematic' | 'explosive';
interface WordDirectiveLike { word?: string; kineticClass?: string; colorOverride?: string; emphasisLevel?: number; visualMetaphor?: string; ghostTrail?: boolean; ghostCount?: number; ghostSpacing?: number; ghostDirection?: 'up'|'down'|'left'|'right'|'radial'; letterSequence?: boolean; trail?: string; entry?: string; behavior?: string; exit?: string; }
interface WordMetaEntry { word: string; start: number; end: number; clean: string; directive: WordDirectiveLike | null; lineIndex: number; wordIndex: number; }
export interface PhraseGroup { words: WordMetaEntry[]; start: number; end: number; anchorWordIdx: number; lineIndex: number; groupIndex: number; }
export interface GroupPosition { x: number; y: number; fontSize: number; isAnchor: boolean; isFiller: boolean; }
type StoryboardEntryLike = { lineIndex?: number; entryStyle?: string; exitStyle?: string; heroWord?: string; shotType?: string; iconGlyph?: string; iconStyle?: 'outline'|'filled'|'ghost'; iconPosition?: 'behind'|'above'|'beside'|'replace'; iconScale?: number; };

type ManifestWordDirective = { entryStyle?: EntryStyle; behavior?: BehaviorStyle; exitStyle?: ExitStyle };

const TYPOGRAPHY_PROFILES: Record<string, TypographyProfile> = {
  'bold-impact': { fontFamily: 'Inter', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, heroWeight: 900 },
  'clean-modern': { fontFamily: 'Inter', fontWeight: 600, textTransform: 'none', letterSpacing: 0.2, heroWeight: 700 },
  'elegant-serif': { fontFamily: 'Playfair Display', fontWeight: 500, textTransform: 'none', letterSpacing: 0.15, heroWeight: 700 },
  'raw-condensed': { fontFamily: 'Oswald', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.35, heroWeight: 800 },
  'whisper-soft': { fontFamily: 'Inter', fontWeight: 400, textTransform: 'none', letterSpacing: 0.25, heroWeight: 500 },
  'tech-mono': { fontFamily: 'IBM Plex Mono', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4, heroWeight: 700 },
};

const MOTION_DEFAULTS: Record<MotionProfile, MotionDefaults> = {
  weighted: { entries: ['slam-down', 'drop', 'plant', 'stomp'], behaviors: ['pulse', 'vibrate', 'pulse', 'grow'], exits: ['shatter', 'snap-out', 'burn-out'], entryDuration: 0.1, exitDuration: 0.12, behaviorIntensity: 1.2 },
  fluid: { entries: ['rise', 'materialize', 'breathe-in', 'drift-in'], behaviors: ['float', 'grow', 'float', 'lean'], exits: ['dissolve', 'drift-up', 'linger'], entryDuration: 0.35, exitDuration: 0.4, behaviorIntensity: 0.6 },
  elastic: { entries: ['explode-in', 'punch-in', 'breathe-in'], behaviors: ['pulse', 'orbit', 'pulse', 'float'], exits: ['punch-out', 'snap-out'], entryDuration: 0.15, exitDuration: 0.1, behaviorIntensity: 1.0 },
  drift: { entries: ['whisper', 'surface', 'drift-in', 'bloom'], behaviors: ['float', 'flicker', 'float', 'grow'], exits: ['evaporate', 'linger', 'sink'], entryDuration: 0.5, exitDuration: 0.6, behaviorIntensity: 0.4 },
  glitch: { entries: ['snap-in', 'cut-in', 'shatter-in'], behaviors: ['vibrate', 'flicker', 'vibrate', 'orbit'], exits: ['cut-out', 'snap-out', 'burn-out'], entryDuration: 0.05, exitDuration: 0.06, behaviorIntensity: 1.4 },
};
const EMPHASIS_CURVE: Record<number, number> = { 1: 0.78, 2: 0.92, 3: 1.18, 4: 1.55, 5: 1.95 };
const FILLER_WORDS = new Set(['a','an','the','to','of','and','or','but','in','on','at','for','with','from','by','up','down','is','am','are','was','were','be','been','being','it','its','that','this','these','those','i','you','he','she','we','they']);
const MIN_GROUP_DURATION = 0.4;
const MAX_GROUP_SIZE = 5;

const INTIMATE_LAYOUTS: Record<number, Array<[number, number]>> = {1:[[0.5,0.5]],2:[[0.42,0.48],[0.58,0.52]],3:[[0.38,0.45],[0.5,0.55],[0.62,0.45]],4:[[0.35,0.43],[0.5,0.37],[0.5,0.6],[0.65,0.5]],5:[[0.35,0.4],[0.45,0.58],[0.5,0.35],[0.55,0.58],[0.65,0.4]],6:[[0.35,0.4],[0.45,0.58],[0.5,0.35],[0.55,0.58],[0.65,0.4],[0.5,0.5]]};
const CINEMATIC_LAYOUTS: Record<number, Array<[number, number]>> = {1:[[0.5,0.5]],2:[[0.3,0.45],[0.7,0.55]],3:[[0.25,0.35],[0.5,0.55],[0.75,0.38]],4:[[0.28,0.35],[0.72,0.32],[0.25,0.65],[0.72,0.65]],5:[[0.18,0.38],[0.38,0.65],[0.5,0.3],[0.65,0.65],[0.82,0.38]],6:[[0.2,0.32],[0.5,0.25],[0.8,0.32],[0.22,0.68],[0.5,0.73],[0.78,0.65]]};
const EXPLOSIVE_LAYOUTS: Record<number, Array<[number, number]>> = {1:[[0.5,0.5]],2:[[0.22,0.42],[0.78,0.58]],3:[[0.15,0.35],[0.55,0.65],[0.85,0.3]],4:[[0.15,0.3],[0.82,0.28],[0.18,0.7],[0.8,0.68]],5:[[0.12,0.35],[0.35,0.72],[0.5,0.25],[0.68,0.7],[0.88,0.33]],6:[[0.12,0.28],[0.42,0.18],[0.82,0.25],[0.15,0.72],[0.55,0.8],[0.85,0.7]]};

function isFillerWord(word: string): boolean { return FILLER_WORDS.has(word.replace(/[^a-zA-Z]/g, '').toLowerCase()); }

function getVisualMode(payload: ScenePayload): VisualMode {
  const frameState = payload.frame_state ?? null;
  const manifestMode = (frameState as any)?.visualMode;
  if (manifestMode === 'intimate' || manifestMode === 'cinematic' || manifestMode === 'explosive') return manifestMode;
  const motion = (payload.cinematic_direction as any)?.motion as string | undefined;
  const texture = (payload.cinematic_direction as any)?.texture as string | undefined;
  if (motion === 'weighted' || motion === 'glitch' || texture === 'storm' || texture === 'fire') return 'explosive';
  if (motion === 'drift' || texture === 'petals' || texture === 'snow') return 'intimate';
  return 'cinematic';
}

function resolveMotionProfile(motionField: string | undefined, payload: ScenePayload): MotionProfile {
  if (motionField && motionField in MOTION_DEFAULTS) return motionField as MotionProfile;
  const heat = payload.cinematic_direction?.visualWorld?.physicsProfile?.heat ?? 0.5;
  if (heat > 0.75) return 'weighted';
  if (heat < 0.3) return 'drift';
  return 'fluid';
}
function deriveMotionProfile(payload: ScenePayload): MotionProfile {
  const directMotion = (payload.cinematic_direction as any)?.motion as string | undefined;
  return resolveMotionProfile(directMotion, payload);
}

function findAnchorWord(words: WordMetaEntry[]): number {
  let maxScore = -1; let maxIdx = words.length - 1;
  for (let i = 0; i < words.length; i += 1) {
    const emp = words[i].directive?.emphasisLevel ?? 1;
    const isImpact = words[i].directive?.kineticClass === 'IMPACT';
    const isRising = words[i].directive?.kineticClass === 'RISING';
    const isFiller = isFillerWord(words[i].word);
    const wordLen = words[i].clean.length;
    const score = (emp * 2) + (isImpact ? 6 : 0) + (isRising ? 4 : 0) - (isFiller ? 5 : 0) + (wordLen > 5 ? 2 : 0) + (wordLen > 8 ? 2 : 0);
    if (score > maxScore) { maxScore = score; maxIdx = i; }
  }
  return maxIdx;
}
function mergeShortGroups(groups: PhraseGroup[]): PhraseGroup[] {
  const result: PhraseGroup[] = []; let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    if (g.end - g.start < MIN_GROUP_DURATION && i < groups.length - 1) {
      const next = groups[i + 1];
      if (next.lineIndex === g.lineIndex && (g.words.length + next.words.length) <= MAX_GROUP_SIZE) {
        const mergedWords = [...g.words, ...next.words];
        result.push({ words: mergedWords, start: g.start, end: next.end, anchorWordIdx: findAnchorWord(mergedWords), lineIndex: g.lineIndex, groupIndex: g.groupIndex });
        i += 2; continue;
      }
    }
    result.push(g); i += 1;
  }
  return result;
}
function buildPhraseGroups(wordMeta: WordMetaEntry[]): PhraseGroup[] {
  const lineMap = new Map<number, WordMetaEntry[]>();
  for (const wm of wordMeta) { if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []); lineMap.get(wm.lineIndex)?.push(wm); }
  const groups: PhraseGroup[] = [];
  for (const [lineIdx, words] of lineMap) {
    let current: WordMetaEntry[] = []; let groupIdx = 0;
    const flushGroup = () => { if (!current.length) return; groups.push({ words: [...current], start: current[0].start, end: current[current.length - 1].end, anchorWordIdx: findAnchorWord(current), lineIndex: lineIdx, groupIndex: groupIdx }); groupIdx += 1; current = []; };
    for (let i = 0; i < words.length; i += 1) {
      const wm = words[i]; current.push(wm);
      const duration = current[current.length - 1].end - current[0].start;
      const isNaturalBreak = /[,\.!?;]$/.test(wm.word);
      const isMaxSize = current.length >= MAX_GROUP_SIZE;
      const isLast = i === words.length - 1;
      if (isLast) flushGroup(); else if ((isNaturalBreak || isMaxSize) && duration >= MIN_GROUP_DURATION) flushGroup();
    }
  }
  groups.sort((a, b) => a.start - b.start);
  return mergeShortGroups(groups).map((group) => ({ ...group, end: Math.max(group.end, group.start + MIN_GROUP_DURATION) }));
}

export function getGroupLayout(
  group: PhraseGroup,
  visualMode: VisualMode,
  canvasW: number,
  canvasH: number,
  baseFontSize: number,
  fontWeight: number,
  fontFamily: string,
  measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): GroupPosition[] {
  const count = group.words.length;
  const anchorIdx = group.anchorWordIdx;
  const anchorPositions: Array<[number, number]> = [
    [0.50, 0.42], [0.30, 0.38], [0.70, 0.38],
    [0.35, 0.60], [0.65, 0.60], [0.50, 0.55],
    [0.42, 0.45], [0.58, 0.45], [0.25, 0.50], [0.75, 0.50],
  ];
  const posVariant = anchorPositions[(group.lineIndex * 3 + group.groupIndex * 5) % anchorPositions.length];
  const deterministicSpread = ((group.lineIndex * 0.618033) % 0.2) - 0.1;
  const slotSpacing = canvasW * 0.22;
  const cx = canvasW * (posVariant[0] + (visualMode === 'explosive' ? deterministicSpread : 0)) + (((group as any)._positionSlot ?? 0) * slotSpacing);
  const cy = canvasH * (posVariant[1] + (visualMode === 'explosive' ? deterministicSpread : 0)) + (((group as any)._lineOffset ?? 0));
  const MIN_FONT = 30;
  const getWordWidth = (word: string, fontSize: number) => { const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`; if (measureCtx.font !== fontStr) measureCtx.font = fontStr; return measureCtx.measureText(word).width; };
  const getSpaceWidth = (fontSize: number) => { const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`; if (measureCtx.font !== fontStr) measureCtx.font = fontStr; return measureCtx.measureText(' ').width; };
  if (count === 1) return [{ x: Math.max(80, Math.min(canvasW - 80, cx)), y: Math.round(Math.max(80, Math.min(canvasH - 80, cy))), fontSize: Math.max(MIN_FONT, baseFontSize * 1.2), isAnchor: true, isFiller: isFillerWord(group.words[0].word) }];
  const positions: GroupPosition[] = [];
  const wordFontSizes = group.words.map((wm, i) => i === anchorIdx ? Math.max(MIN_FONT, baseFontSize * (EMPHASIS_CURVE[wm.directive?.emphasisLevel ?? 1] ?? 1.0)) : Math.max(MIN_FONT, isFillerWord(wm.word) ? baseFontSize * 0.72 : baseFontSize * 0.88));
  positions[anchorIdx] = { x: cx, y: Math.round(cy), fontSize: wordFontSizes[anchorIdx], isAnchor: true, isFiller: isFillerWord(group.words[anchorIdx].word) };
  const supportIndices = Array.from({ length: count }, (_, i) => i).filter((i) => i !== anchorIdx);
  if (supportIndices.length) {
    const phraseFontSize = Math.max(MIN_FONT, baseFontSize * 0.82);
    const ww = supportIndices.map((idx) => getWordWidth(group.words[idx].word, phraseFontSize));
    const inter = getSpaceWidth(phraseFontSize);
    const total = ww.reduce((s, w) => s + w, 0) + inter * Math.max(0, supportIndices.length - 1);
    const anchorFontSize = positions[anchorIdx]?.fontSize ?? baseFontSize;
    const phraseY = Math.round(cy + anchorFontSize * 1.25);
    const startX = Math.max(80, Math.min(canvasW - 80 - total, cx - total * 0.5));
    let acc = 0;
    for (let j = 0; j < supportIndices.length; j += 1) {
      const idx = supportIndices[j];
      positions[idx] = { x: startX + acc + ww[j] * 0.5, y: phraseY, fontSize: phraseFontSize, isAnchor: false, isFiller: isFillerWord(group.words[idx].word) };
      acc += ww[j] + inter;
    }
  }
  for (let i = 0; i < positions.length; i += 1) {
    const pos = positions[i];
    const halfW = getWordWidth(group.words[i]?.word ?? '', pos.fontSize) * 0.5;
    pos.x = Math.max(80 + halfW, Math.min(canvasW - 80 - halfW, pos.x));
    pos.y = Math.round(Math.max(80, Math.min(canvasH - 80, pos.y)));
  }
  return positions;
}

export function computeEntryState(style: EntryStyle, progress: number, intensity: number): AnimState {
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
    case 'shatter-in': return { offsetX: (1 - ep) * (30 * deterministicSign(progress * 13.37)), offsetY: (1 - ep) * (20 * deterministicSign(progress * 7.91)), scaleX: 0.8 + ep * 0.2, scaleY: 0.8 + ep * 0.2, alpha: Math.min(1, progress * 4), skewX: (1 - ep) * 5, glowMult: 0, blur: 0, rotation: 0 };
    case 'focus-in': { const focusScale = 1 + (1 - ep) * 0.6; return { offsetX: 0, offsetY: 0, scaleX: focusScale, scaleY: focusScale, alpha: easeOut(Math.min(1, progress * 1.5)), skewX: 0, glowMult: (1 - ep) * 2, blur: (1 - ep) * 1.0, rotation: 0 }; }
    case 'spin-in': { const spin = (1 - ep) * 25; return { offsetX: (1 - ep) * -60, offsetY: 0, scaleX: 0.6 + ep * 0.4, scaleY: 0.6 + ep * 0.4, alpha: easeOut(Math.min(1, progress * 2)), skewX: spin, glowMult: 0, blur: 0, rotation: (1 - ep) * Math.PI * 2 }; }
    case 'tumble-in': { const fallY = (1 - eb) * -80; const tumble = (1 - ep) * 20; return { offsetX: (1 - ep) * 30, offsetY: fallY, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2.5)), skewX: tumble, glowMult: 0, blur: 0, rotation: (1 - ep) * Math.PI }; }
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: easeOut(Math.min(1, progress * 2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }
}
export function computeExitState(style: ExitStyle, progress: number, intensity: number, letterIndex = 0, letterTotal = 1): AnimState {
  const ep = easeIn(Math.min(1, progress)); const ei = easeIn(Math.min(1, progress));
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
    case 'gravity-fall': { const gravity = ep * ep * ep; return { offsetX: Math.sin(progress * 3) * 4, offsetY: gravity * 600, scaleX: 1, scaleY: 1 + ep * 0.15, alpha: 1 - easeIn(Math.min(1, progress * 1.2)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'soar': { const arc = easeIn(ep); return { offsetX: arc * 150, offsetY: -arc * 250, scaleX: 1 - ep * 0.3, scaleY: 1 - ep * 0.3, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: -arc * 8, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'launch': { const thrust = ep * ep; return { offsetX: Math.sin(progress * 12) * 3, offsetY: -thrust * 400, scaleX: 1, scaleY: 1 + ep * 0.2, alpha: 1 - easeIn(Math.min(1, progress * 2)), skewX: 0, glowMult: ep * 0.5, blur: 0, rotation: 0 }; }
    case 'scatter-fly': { const arc = easeIn(ep); return { offsetX: Math.sin(progress * 4) * 80 * arc, offsetY: -arc * 200, scaleX: 1 - ep * 0.5, scaleY: 1 - ep * 0.5, alpha: 1 - ep, skewX: Math.sin(progress * 6) * 12, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'melt': { const drip = easeIn(ep); return { offsetX: Math.sin(progress * 2) * 3, offsetY: drip * 120, scaleX: 1 + ep * 0.3, scaleY: 1 - ep * 0.4, alpha: 1 - easeIn(Math.min(1, progress * 0.9)), skewX: progress * 6, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'freeze-crack': { const hold = progress < 0.7; const breakProgress = hold ? 0 : (progress - 0.7) / 0.3; const bp = easeIn(Math.min(1, breakProgress)); return { offsetX: hold ? 0 : bp * 60 * (progress % 2 < 1 ? 1 : -1), offsetY: hold ? 0 : bp * 40, scaleX: 1, scaleY: 1, alpha: hold ? 1.0 : 1 - bp, skewX: hold ? 0 : bp * 15, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'scatter-letters': { const burst = easeIn(ep); const angle = (progress * 7.3) % (Math.PI * 2); return { offsetX: Math.cos(angle) * burst * 100, offsetY: Math.sin(angle) * burst * 80 + burst * 40, scaleX: 1 - ep * 0.3, scaleY: 1 - ep * 0.3, alpha: 1 - ei, skewX: burst * 20 * Math.sin(angle), glowMult: 0, blur: 0, rotation: ep * (angle > Math.PI ? 0.5 : -0.5) }; }
    case 'cascade-down': { const fall = easeIn(ep); return { offsetX: 0, offsetY: fall * 300, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'cascade-up': { const rise = easeIn(ep); return { offsetX: 0, offsetY: -rise * 300, scaleX: 1, scaleY: 1, alpha: 1 - easeIn(Math.min(1, progress * 1.5)), skewX: 0, glowMult: 0, blur: 0, rotation: 0 }; }
    case 'blur-out': return { offsetX: 0, offsetY: 0, scaleX: 1 + ep * 0.25, scaleY: 1 + ep * 0.25, alpha: 1 - ep, skewX: 0, glowMult: ep * 2, blur: ep * 1.0, rotation: 0 };
    case 'spin-out': return { offsetX: ep * 80, offsetY: 0, scaleX: 1 - ep * 0.4, scaleY: 1 - ep * 0.4, alpha: 1 - ei, skewX: ep * 30, glowMult: 0, blur: 0, rotation: ep * Math.PI * 2 };
    case 'peel-off': return { offsetX: ep * 120, offsetY: ep * -20, scaleX: 1 - ep * 0.2, scaleY: 1, alpha: 1 - ei, skewX: ep * 15, glowMult: 0, blur: 0, rotation: 0 };
    case 'peel-reverse': return { offsetX: -ep * 120, offsetY: ep * -20, scaleX: 1 - ep * 0.2, scaleY: 1, alpha: 1 - ei, skewX: -ep * 15, glowMult: 0, blur: 0, rotation: 0 };
    default: return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1 - ep, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }
}
export function computeBehaviorState(style: BehaviorStyle, tSec: number, wordStart: number, beatPhase: number, intensity: number): Partial<AnimState> {
  switch (style) {
    case 'pulse': { const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.03 * intensity; return { scaleX: 1 + pulse, scaleY: 1 + pulse }; }
    case 'vibrate': return { offsetX: Math.sin(tSec * 18) * 1.2 * intensity };
    case 'float': return { offsetY: Math.sin((tSec - wordStart) * 1.8) * 4 * intensity };
    case 'grow': { const growScale = 1 + Math.min(0.15, (tSec - wordStart) * 0.04) * intensity; return { scaleX: growScale, scaleY: growScale }; }
    case 'contract': { const contractScale = 1 - Math.min(0.1, (tSec - wordStart) * 0.03) * intensity; return { scaleX: contractScale, scaleY: contractScale }; }
    case 'flicker': { const f = Math.sin(tSec * 6) * 0.5 + Math.sin(tSec * 13) * 0.5; return { alpha: 0.88 + f * 0.12 }; }
    case 'orbit': { const angle = (tSec - wordStart) * 1.2; return { offsetX: Math.sin(angle) * 2 * intensity, offsetY: Math.cos(angle) * 1.5 * intensity }; }
    case 'lean': return { skewX: Math.sin((tSec - wordStart) * 0.8) * 4 * intensity };
    case 'freeze': { if ((tSec - wordStart) > 0.3) return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, blur: 0, rotation: 0 }; const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.04 * intensity; return { scaleX: 1 + pulse, scaleY: 1 + pulse }; }
    case 'tilt': return { rotation: Math.sin((tSec - wordStart) * 2) * 0.14 * intensity };
    case 'pendulum': return { rotation: Math.sin((tSec - wordStart) * 0.8) * 0.26 * intensity };
    case 'pulse-focus': { const focusPulse = Math.sin(beatPhase * Math.PI * 2) * 0.3; return { blur: Math.max(0, focusPulse) }; }
    default: return {};
  }
}

function assignWordAnimations(wm: WordMetaEntry, motionDefaults: MotionDefaults, storyboard: StoryboardEntryLike[], manifestDirective: ManifestWordDirective | null): { entry: EntryStyle; behavior: BehaviorStyle; exit: ExitStyle } {
  const storyEntry = storyboard?.[wm.lineIndex];
  const kinetic = wm.directive?.kineticClass ?? null;
  if (manifestDirective?.entryStyle) return { entry: manifestDirective.entryStyle, behavior: manifestDirective.behavior ?? 'none', exit: manifestDirective.exitStyle ?? motionDefaults.exits[0] };
  if (kinetic === 'IMPACT') return { entry: 'slam-down', behavior: 'pulse', exit: 'burn-out' };
  const storyEntryStyle = storyEntry?.entryStyle ?? 'fades';
  const entryMap: Record<string, EntryStyle> = { rises: 'rise', 'slams-in': 'slam-down', 'fractures-in': 'shatter-in', materializes: 'materialize', hiding: 'whisper', cuts: 'snap-in', fades: motionDefaults.entries[1] ?? 'materialize' };
  const exitMap: Record<string, ExitStyle> = { 'dissolves-upward': 'drift-up', 'burns-out': 'burn-out', shatters: 'shatter', lingers: 'linger', fades: motionDefaults.exits[1] ?? 'dissolve' };
  const variationSeed = ((wm.lineIndex ?? 0) * 7 + (wm.wordIndex ?? 0) * 3) % 4;
  return { entry: entryMap[storyEntryStyle] ?? motionDefaults.entries[variationSeed % motionDefaults.entries.length], behavior: motionDefaults.behaviors[variationSeed % motionDefaults.behaviors.length] ?? 'pulse', exit: exitMap[storyEntry?.exitStyle ?? 'fades'] ?? motionDefaults.exits[variationSeed % motionDefaults.exits.length] };
}

type VisualMetaphor = 'ember-burst'|'frost-form'|'lens-focus'|'gravity-drop'|'ascent'|'fracture'|'heartbeat'|'pain-weight'|'isolation'|'convergence'|'shockwave'|'void-absorb'|'radiance'|'gold-rain'|'speed-blur'|'slow-drift'|'power-surge'|'dream-float'|'truth-snap'|'motion-streak';
export type WordEmitterType = 'ember'|'frost'|'spark-burst'|'dust-impact'|'light-rays'|'converge'|'shockwave-ring'|'gold-coins'|'memory-orbs'|'motion-trail'|'dark-absorb'|'none';
interface SemanticEffect { entry: EntryStyle; behavior: BehaviorStyle; exit: ExitStyle; colorOverride: string | null; glowMultiplier: number; scaleX: number; scaleY: number; emitterType: WordEmitterType; alphaMax: number; entryDurationMult: number; fontWeight: number; }
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

export interface CompiledWord { id: string; text: string; clean: string; wordIndex: number; layoutX: number; layoutY: number; baseFontSize: number; entryStyle: EntryStyle; exitStyle: ExitStyle; behaviorStyle: BehaviorStyle; fontWeight: number; fontFamily: string; color: string; hasSemanticColor?: boolean; isAnchor: boolean; isFiller: boolean; emphasisLevel: number; semanticScaleX: number; semanticScaleY: number; semanticAlphaMax: number; semanticGlowMult: number; entryDurationMult: number; emitterType: string; trail: string; iconGlyph?: string; iconStyle?: 'outline' | 'filled' | 'ghost'; iconPosition?: 'behind' | 'above' | 'beside' | 'replace'; iconScale?: number; ghostTrail?: boolean; ghostCount?: number; ghostSpacing?: number; ghostDirection?: string; isLetterChunk?: boolean; letterIndex?: number; letterTotal?: number; letterDelay?: number; }
export interface CompiledPhraseGroup { lineIndex: number; groupIndex: number; anchorWordIdx: number; start: number; end: number; words: CompiledWord[]; staggerDelay: number; entryDuration: number; exitDuration: number; lingerDuration: number; behaviorIntensity: number; }
export interface BeatEvent { time: number; springVelocity: number; glowMax: number; }
export interface CompiledChapter { index: number; startRatio: number; endRatio: number; targetZoom: number; emotionalIntensity: number; typography: { fontFamily: string; fontWeight: number; heroWeight: number; textTransform: string; }; atmosphere: string; }
export interface CompiledScene { phraseGroups: CompiledPhraseGroup[]; songStartSec: number; songEndSec: number; durationSec: number; beatEvents: BeatEvent[]; bpm: number; chapters: CompiledChapter[]; emotionalArc: string; visualMode: VisualMode; baseFontFamily: string; baseFontWeight: number; baseTextTransform: string; palettes: string[][]; animParams: { linger: number; stagger: number; entryDuration: number; exitDuration: number; }; }

const distanceToZoom: Record<string, number> = { 'Wide': 0.82, 'Medium': 1.0, 'Close': 1.15, 'CloseUp': 1.2, 'ExtremeClose': 1.35, 'FloatingInWorld': 0.95 };

function resolveV3Palette(payload: ScenePayload, chapterProgress?: number): string[] {
  if (payload.auto_palettes?.length) {
    if (chapterProgress != null && payload.cinematic_direction?.chapters?.length) {
      const idx = payload.cinematic_direction.chapters.findIndex((c) => chapterProgress >= (c.startRatio ?? 0) && chapterProgress < (c.endRatio ?? 1));
      if (idx >= 0 && payload.auto_palettes[idx]) return payload.auto_palettes[idx];
    }
    return payload.auto_palettes[0];
  }
  return payload.palette;
}

export function compileScene(payload: ScenePayload): CompiledScene {
  const durationSec = Math.max(0.01, payload.songEnd - payload.songStart);
  const rawChapters = (payload.cinematic_direction?.chapters ?? []) as Array<any>;
  const chapters = rawChapters.length > 0 ? rawChapters : enrichSections(payload.cinematic_direction?.sections as CinematicSection[] | undefined);
  const visualMode = getVisualMode(payload);
  const motionProfile = deriveMotionProfile(payload);
  const motionDefaults = MOTION_DEFAULTS[motionProfile];
  const physicsProfile = payload.cinematic_direction?.visualWorld?.physicsProfile;

  const wordDirectives = payload.cinematic_direction?.wordDirectives;
  const directives = new Map<string, WordDirectiveLike>();
  if (Array.isArray(wordDirectives)) for (const d of wordDirectives) directives.set(String(d?.word ?? '').trim().toLowerCase(), d as WordDirectiveLike);
  const words = payload.words ?? [];
  const wordMeta: WordMetaEntry[] = words.map((w) => {
    const clean = w.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const lineIndex = Math.max(0, payload.lines.findIndex((l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? 9999)));
    return { ...w, clean, directive: directives.get(clean) ?? null, lineIndex, wordIndex: 0 };
  });
  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) { lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0; wm.wordIndex = lineWordCounters[wm.lineIndex]++; }

  const phraseGroups = buildPhraseGroups(wordMeta);
  const manifestWordDirectives = ((payload.frame_state as any)?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
  const storyboard = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];

  const WORD_LINGER_BY_PROFILE: Record<string, number> = { weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05 };
  const animParams = { linger: WORD_LINGER_BY_PROFILE[motionProfile] ?? 0.4, stagger: typeof (payload.frame_state as any)?.stagger === 'number' ? (payload.frame_state as any).stagger : 0.05, entryDuration: motionDefaults.entryDuration, exitDuration: motionDefaults.exitDuration };

  const slotEnds: number[] = [];
  for (const group of phraseGroups) {
    const visStart = group.start - animParams.entryDuration - animParams.stagger * group.words.length;
    const visEnd = group.end + animParams.linger + animParams.exitDuration;
    let slot = 0; for (; slot < slotEnds.length; slot += 1) if (visStart >= slotEnds[slot]) break;
    if (slot === slotEnds.length) slotEnds.push(visEnd); else slotEnds[slot] = visEnd;
    (group as any)._positionSlot = slot % 3;
  }

  // ─── Compute _lineOffset: vertical separation for simultaneously-visible lines ───
  {
    const byLine = new Map<number, PhraseGroup[]>();
    for (const group of phraseGroups) {
      const arr = byLine.get(group.lineIndex) ?? [];
      arr.push(group);
      byLine.set(group.lineIndex, arr);
    }
    for (const [, lineGroups] of byLine) {
      for (const g of lineGroups) {
        const t = g.start;
        const visibleLineIndices: number[] = [];
        for (let li = 0; li < payload.lines.length; li++) {
          const line = payload.lines[li];
          if (t >= (line.start ?? 0) && t < (line.end ?? 0)) {
            visibleLineIndices.push(li);
          }
        }
        const visibleCount = Math.max(1, visibleLineIndices.length);
        const lineSpacing = 90;
        const linePos = Math.max(0, visibleLineIndices.indexOf(g.lineIndex));
        (g as any)._lineOffset = (linePos - (visibleCount - 1) * 0.5) * lineSpacing;
      }
    }
  }

  const shotTypeToFontSize: Record<string, number> = {
    Wide: 56,
    Medium: 68,
    Close: 84,
    CloseUp: 96,
    ExtremeClose: 108,
    FloatingInWorld: 64,
  };
  const lineFontSizes = payload.lines.map((_, lineIndex) => {
    const storyEntry = storyboard[lineIndex];
    const shotType = (storyEntry as any)?.shotType ?? 'Medium';
    const baseSizeForShot = shotTypeToFontSize[shotType] ?? 68;
    return baseSizeForShot;
  });
  const measureCanvas = new OffscreenCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d')!;
  const baseTypography = TYPOGRAPHY_PROFILES[((payload.cinematic_direction as any)?.typography as string) ?? 'clean-modern'] ?? TYPOGRAPHY_PROFILES['clean-modern'];
  const compiledGroups: CompiledPhraseGroup[] = phraseGroups.map((group) => {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const lineStory = storyboard[group.lineIndex];
    const positions = getGroupLayout(group, visualMode, 960, 540, lineFontSizes[group.lineIndex] ?? 36, baseTypography.fontWeight, baseTypography.fontFamily, measureCtx);
    const wordsCompiled: CompiledWord[] = group.words.flatMap((wm, wi) => {
      const manifestDirective = manifestWordDirectives[key]?.[wi] ?? null;
      const motion = assignWordAnimations(wm, motionDefaults, storyboard, manifestDirective as ManifestWordDirective | null);
      const semantic = wm.directive?.visualMetaphor ? SEMANTIC_EFFECTS[wm.directive.visualMetaphor as VisualMetaphor] : null;
      const pos = positions[wi];
      const base: CompiledWord = {
        id: `${group.lineIndex}-${group.groupIndex}-${wi}`,
        text: baseTypography.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word,
        clean: wm.clean,
        wordIndex: wi,
        layoutX: pos.x,
        layoutY: pos.y,
        baseFontSize: pos.fontSize,
        entryStyle: semantic?.entry ?? motion.entry,
        exitStyle: semantic?.exit ?? motion.exit,
        behaviorStyle: semantic?.behavior ?? motion.behavior,
        fontWeight: semantic?.fontWeight ?? baseTypography.fontWeight,
        fontFamily: baseTypography.fontFamily,
        color: semantic?.colorOverride ?? resolveV3Palette(payload, ((wm.start + (payload.lines[group.lineIndex]?.end ?? wm.start)) * 0.5 - payload.songStart) / Math.max(0.01, payload.songEnd - payload.songStart))[2] ?? '#ffffff',
        hasSemanticColor: Boolean(semantic?.colorOverride),
        isAnchor: pos.isAnchor,
        isFiller: pos.isFiller,
        emphasisLevel: wm.directive?.emphasisLevel ?? 1,
        semanticScaleX: semantic?.scaleX ?? 1,
        semanticScaleY: semantic?.scaleY ?? 1,
        semanticAlphaMax: semantic?.alphaMax ?? 1,
        semanticGlowMult: semantic?.glowMultiplier ?? 1,
        entryDurationMult: semantic?.entryDurationMult ?? 1,
        emitterType: semantic?.emitterType ?? 'none',
        trail: wm.directive?.trail ?? (semantic?.emitterType ?? 'none'),
        ghostTrail: wm.directive?.ghostTrail,
        ghostCount: wm.directive?.ghostCount,
        ghostSpacing: wm.directive?.ghostSpacing,
        ghostDirection: wm.directive?.ghostDirection,
        iconGlyph: lineStory?.iconGlyph,
        iconStyle: lineStory?.iconStyle,
        iconPosition: lineStory?.iconPosition,
        iconScale: lineStory?.iconScale,
      };
      if (wm.directive?.letterSequence) {
        const letters = wm.word.split('');
        return letters.map((ch, li) => ({ ...base, id: `${group.lineIndex}-${group.groupIndex}-${wi}-L${li}`, text: ch, isLetterChunk: true, letterIndex: li, letterTotal: letters.length, letterDelay: li * 0.012 }));
      }
      return [base];
    });
    return { lineIndex: group.lineIndex, groupIndex: group.groupIndex, anchorWordIdx: group.anchorWordIdx, start: group.start, end: group.end, words: wordsCompiled, staggerDelay: animParams.stagger, entryDuration: animParams.entryDuration, exitDuration: animParams.exitDuration, lingerDuration: animParams.linger, behaviorIntensity: motionDefaults.behaviorIntensity };
  }).sort((a, b) => a.start - b.start);

  // ─── Compile-time collision resolution ───
  // Nudge overlapping groups apart so anchor words don't collide.
  {
    const COL_PADDING = 24;
    const COL_MAX_PASSES = 6;
    interface GroupBBox { groupIdx: number; cx: number; cy: number; halfW: number; halfH: number; priority: number; }
    const bboxes: GroupBBox[] = compiledGroups.map((cg, gi) => {
      const aw = cg.words.find((w) => w.isAnchor) ?? cg.words[0];
      if (!aw) return null!;
      const fontStr = `${aw.fontWeight} ${aw.baseFontSize}px ${aw.fontFamily}`;
      if (measureCtx.font !== fontStr) measureCtx.font = fontStr;
      const textW = measureCtx.measureText(aw.text).width;
      return { groupIdx: gi, cx: aw.layoutX, cy: aw.layoutY, halfW: textW / 2 + COL_PADDING, halfH: aw.baseFontSize * 0.7 + COL_PADDING, priority: aw.emphasisLevel };
    }).filter(Boolean);
    for (let pass = 0; pass < COL_MAX_PASSES; pass++) {
      let hadCollision = false;
      for (let i = 0; i < bboxes.length; i++) {
        for (let j = i + 1; j < bboxes.length; j++) {
          const a = bboxes[i], b = bboxes[j];
          const ag = compiledGroups[a.groupIdx], bg = compiledGroups[b.groupIdx];
          const aVisEnd = ag.end + ag.lingerDuration + ag.exitDuration;
          const bVisStart = bg.start - bg.entryDuration - bg.staggerDelay * bg.words.length;
          if (aVisEnd < bVisStart) continue;
          const bVisEnd = bg.end + bg.lingerDuration + bg.exitDuration;
          const aVisStart = ag.start - ag.entryDuration - ag.staggerDelay * ag.words.length;
          if (bVisEnd < aVisStart) continue;
          const dx = a.cx - b.cx, dy = a.cy - b.cy;
          const overlapX = (a.halfW + b.halfW) - Math.abs(dx);
          const overlapY = (a.halfH + b.halfH) - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          hadCollision = true;
          const moveA = a.priority >= b.priority ? 0.3 : 0.7;
          const moveB = 1 - moveA;
          if (overlapX < overlapY) {
            const sign = dx >= 0 ? 1 : -1;
            a.cx += sign * overlapX * moveA;
            b.cx -= sign * overlapX * moveB;
          } else {
            const sign = dy >= 0 ? 1 : -1;
            a.cy += sign * overlapY * moveA;
            b.cy -= sign * overlapY * moveB;
          }
          a.cx = Math.max(a.halfW + 40, Math.min(960 - a.halfW - 40, a.cx));
          a.cy = Math.max(a.halfH + 40, Math.min(540 - a.halfH - 40, a.cy));
          b.cx = Math.max(b.halfW + 40, Math.min(960 - b.halfW - 40, b.cx));
          b.cy = Math.max(b.halfH + 40, Math.min(540 - b.halfH - 40, b.cy));
        }
      }
      if (!hadCollision) break;
    }
    for (const bbox of bboxes) {
      const cg = compiledGroups[bbox.groupIdx];
      const aw = cg.words.find((w) => w.isAnchor);
      if (!aw) continue;
      const deltaX = bbox.cx - aw.layoutX, deltaY = bbox.cy - aw.layoutY;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
      for (const word of cg.words) { word.layoutX += deltaX; word.layoutY += deltaY; }
    }
  }

  const beats = payload.beat_grid?.beats ?? [];
  const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;
  const heat = physicsProfile?.heat ?? 0.5;
  const beatResponse = physicsProfile?.beatResponse ?? 'pulse';
  const springInit = beatResponse === 'slam' ? 1.8 * heat : 0.8 * heat;
  const glowMax = beatResponse === 'slam' ? 1.2 * heat : 0.6 * heat;
  const beatEvents: BeatEvent[] = beats.map((time) => ({ time, springVelocity: springInit, glowMax }));

  const compiledChapters: CompiledChapter[] = chapters.map((chapter: any, index: number) => ({
    index,
    startRatio: chapter.startRatio ?? 0,
    endRatio: chapter.endRatio ?? 1,
    targetZoom: distanceToZoom[((payload.cinematic_direction?.storyboard?.[index] as any)?.shotType ?? 'Medium')] ?? 1.0,
    emotionalIntensity: chapter.emotionalIntensity ?? 0.5,
    typography: { fontFamily: baseTypography.fontFamily, fontWeight: baseTypography.fontWeight, heroWeight: baseTypography.heroWeight, textTransform: baseTypography.textTransform },
    atmosphere: chapter.atmosphere ?? (payload.cinematic_direction as any)?.atmosphere ?? 'cinematic',
  }));

  const palettes = compiledChapters.map((c) => resolveV3Palette(payload, (c.startRatio + c.endRatio) * 0.5));
  return {
    phraseGroups: compiledGroups,
    songStartSec: payload.songStart,
    songEndSec: payload.songEnd,
    durationSec,
    beatEvents,
    bpm,
    chapters: compiledChapters,
    emotionalArc: ((payload.cinematic_direction as any)?.emotionalArc as string | undefined) ?? 'slow-burn',
    visualMode,
    baseFontFamily: baseTypography.fontFamily,
    baseFontWeight: baseTypography.fontWeight,
    baseTextTransform: baseTypography.textTransform,
    palettes,
    animParams,
  };
}
