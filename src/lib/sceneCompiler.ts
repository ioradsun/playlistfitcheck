import type { CinematicDirection, CinematicSection, CinematicPhrase } from "@/types/CinematicDirection";
import { enrichSections } from "@/engine/directionResolvers";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { FrameRenderState } from "@/engine/presetDerivation";
import { getSemanticOverride } from "@/engine/SemanticAnimMapper";
import { fitTextToViewport, type MeasureContext } from "@/engine/textLayout";
import {
  deriveAllSectionMods,
  derivePhraseMotionBudget,
  deriveSongMotionIdentity,
  type PhraseMotionBudget,
  type SectionMotionMod,
  type SongMotionIdentity,
} from "@/engine/MotionIdentity";
import { getEffectTier } from "@/engine/timeTiers";
import { beatSnapWords } from "@/engine/beatSnapWords";

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
interface WordDirectiveLike { word?: string; kineticClass?: string; colorOverride?: string; emphasisLevel?: number; visualMetaphor?: string; ghostTrail?: boolean; ghostCount?: number; ghostSpacing?: number; ghostDirection?: 'up'|'down'|'left'|'right'|'radial'; letterSequence?: boolean; trail?: string; entry?: string; behavior?: string; exit?: string; heroPresentation?: string; isolation?: boolean; }
interface WordMetaEntry { word: string; start: number; end: number; clean: string; directive: WordDirectiveLike | null; lineIndex: number; wordIndex: number; }
export interface PhraseGroup { words: WordMetaEntry[]; start: number; end: number; anchorWordIdx: number; lineIndex: number; groupIndex: number; }
type StoryboardEntryLike = { lineIndex?: number; entryStyle?: string; exitStyle?: string; heroWord?: string; shotType?: string; iconGlyph?: string; iconStyle?: 'outline'|'filled'|'ghost'; iconPosition?: 'behind'|'above'|'beside'|'replace'; iconScale?: number; };

type ManifestWordDirective = { entryStyle?: EntryStyle; behavior?: BehaviorStyle; exitStyle?: ExitStyle };

const TYPOGRAPHY_PROFILES: Record<string, TypographyProfile> = {
  'bold-impact': { fontFamily: 'Oswald', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, heroWeight: 900 },
  'clean-modern': { fontFamily: 'Montserrat', fontWeight: 600, textTransform: 'none', letterSpacing: 0.2, heroWeight: 700 },
  'elegant-serif': { fontFamily: 'Playfair Display', fontWeight: 500, textTransform: 'none', letterSpacing: 0.15, heroWeight: 700 },
  'raw-condensed': { fontFamily: 'Barlow Condensed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.35, heroWeight: 800 },
  'whisper-soft': { fontFamily: 'Nunito', fontWeight: 400, textTransform: 'none', letterSpacing: 0.25, heroWeight: 500 },
  'tech-mono': { fontFamily: 'JetBrains Mono', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4, heroWeight: 700 },
  'display-heavy': { fontFamily: 'Bebas Neue', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, heroWeight: 800 },
  'editorial-light': { fontFamily: 'Cormorant Garamond', fontWeight: 400, textTransform: 'none', letterSpacing: 0.1, heroWeight: 600 },
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


function isFillerWord(word: string): boolean { return FILLER_WORDS.has(word.replace(/[^a-zA-Z]/g, '').toLowerCase()); }

function getVisualMode(_payload: ScenePayload): VisualMode {
  return 'cinematic'; // scattered layouts removed — fitTextToViewport handles all positioning
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
/**
 * Build phrase groups from AI-provided phrases OR fallback to mechanical grouping.
 *
 * AI phrases are grouped by meaning + timing (the AI sees the full lyrics and
 * understands which words form a complete thought). When available, they produce
 * much more natural grouping than the mechanical punctuation/word-count splitter.
 *
 * Fallback: if no AI phrases are available (old cached data, missing field),
 * the mechanical grouper still runs — same behavior as before Phase 5.
 */
function buildPhraseGroups(wordMeta: WordMetaEntry[], aiPhrases?: CinematicPhrase[]): PhraseGroup[] {
  // ── Try AI phrases first ──
  if (aiPhrases && aiPhrases.length > 0) {
    const groups: PhraseGroup[] = [];
    let groupIdx = 0;

    // Build line→wordMeta mapping for fast lookup
    const lineMap = new Map<number, WordMetaEntry[]>();
    for (const wm of wordMeta) {
      if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []);
      lineMap.get(wm.lineIndex)!.push(wm);
    }

    for (const phrase of aiPhrases) {
      const lineWords = lineMap.get(phrase.lineIndex);
      if (!lineWords || lineWords.length === 0) continue;

      const [startIdx, endIdx] = phrase.wordRange;
      // Clamp indices to valid range
      const safeStart = Math.max(0, Math.min(startIdx, lineWords.length - 1));
      const safeEnd = Math.max(safeStart, Math.min(endIdx, lineWords.length - 1));

      const phraseWords = lineWords.slice(safeStart, safeEnd + 1);
      if (phraseWords.length === 0) continue;

      groups.push({
        words: phraseWords,
        start: phraseWords[0].start,
        end: phraseWords[phraseWords.length - 1].end,
        anchorWordIdx: findAnchorWord(phraseWords),
        lineIndex: phrase.lineIndex,
        groupIndex: groupIdx,
      });
      groupIdx++;
    }

    if (groups.length > 0) {
      groups.sort((a, b) => a.start - b.start);

      // Check for ungrouped words — if AI missed some, append them as extra groups
      const groupedWordIds = new Set<string>();
      for (const g of groups) {
        for (const w of g.words) {
          groupedWordIds.add(`${w.lineIndex}-${w.wordIndex}`);
        }
      }

      const ungrouped: WordMetaEntry[] = [];
      for (const wm of wordMeta) {
        if (!groupedWordIds.has(`${wm.lineIndex}-${wm.wordIndex}`)) {
          ungrouped.push(wm);
        }
      }

      if (ungrouped.length > 0) {
        // Group ungrouped words using mechanical fallback
        const fallbackGroups = mechanicalGrouping(ungrouped);
        for (const fg of fallbackGroups) {
          fg.groupIndex = groupIdx++;
          groups.push(fg);
        }
        groups.sort((a, b) => a.start - b.start);
      }

      // Enforce minimum duration
      return groups.map(g => ({
        ...g,
        end: Math.max(g.end, g.start + MIN_GROUP_DURATION),
      }));
    }
  }

  // ── Fallback: mechanical grouping (same as original) ──
  return mechanicalGrouping(wordMeta);
}

/**
 * Mechanical phrase grouping — splits at punctuation and MAX_GROUP_SIZE.
 * Used as fallback when AI phrases aren't available.
 */
function mechanicalGrouping(wordMeta: WordMetaEntry[]): PhraseGroup[] {
  const lineMap = new Map<number, WordMetaEntry[]>();
  for (const wm of wordMeta) {
    if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []);
    lineMap.get(wm.lineIndex)!.push(wm);
  }
  const groups: PhraseGroup[] = [];
  for (const [lineIdx, words] of lineMap) {
    let current: WordMetaEntry[] = [];
    let groupIdx = 0;
    const flushGroup = () => {
      if (!current.length) return;
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
      if (isLast) flushGroup();
      else if ((isNaturalBreak || isMaxSize) && duration >= MIN_GROUP_DURATION) flushGroup();
    }
  }
  groups.sort((a, b) => a.start - b.start);
  return mergeShortGroups(groups).map((group) => ({
    ...group,
    end: Math.max(group.end, group.start + MIN_GROUP_DURATION),
  }));
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
const _EMPTY_ANIM: Partial<AnimState> = {};

export function computeBehaviorState(style: BehaviorStyle, tSec: number, wordStart: number, beatPhase: number, intensity: number): Partial<AnimState> {
  if (style === 'none') return _EMPTY_ANIM;
  if (style === 'pulse') {
    const pulse = Math.sin(beatPhase * Math.PI * 2) * 0.03 * intensity;
    return { scaleX: 1 + pulse, scaleY: 1 + pulse };
  }
  switch (style) {
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
    default: return _EMPTY_ANIM;
  }
}

function phraseAnimDurations(wordCount: number, durationMs: number): { entryDuration: number; exitDuration: number; linger: number; stagger: number } {
  const tier = getEffectTier(durationMs);
  const density = wordCount / Math.max(0.25, durationMs / 1000);
  const tierBase = {
    flash: { entryDuration: 0.08, exitDuration: 0.07, linger: 0.04, stagger: 0.018 },
    quick: { entryDuration: 0.11, exitDuration: 0.09, linger: 0.07, stagger: 0.022 },
    normal: { entryDuration: 0.16, exitDuration: 0.12, linger: 0.12, stagger: 0.028 },
    held: { entryDuration: 0.2, exitDuration: 0.16, linger: 0.18, stagger: 0.034 },
    sustained: { entryDuration: 0.26, exitDuration: 0.2, linger: 0.24, stagger: 0.04 },
  }[tier];
  const densityClamp = Math.max(0.72, Math.min(1.15, 1.08 - density * 0.07));
  return {
    entryDuration: tierBase.entryDuration * densityClamp,
    exitDuration: tierBase.exitDuration * densityClamp,
    linger: tierBase.linger,
    stagger: tierBase.stagger,
  };
}

function snapToBeat(timeSec: number, beats: number[]): number {
  if (beats.length === 0) return timeSec;
  let best = beats[0];
  let minDist = Math.abs(best - timeSec);
  for (let i = 1; i < beats.length; i += 1) {
    const dist = Math.abs(beats[i] - timeSec);
    if (dist < minDist) {
      minDist = dist;
      best = beats[i];
    }
  }
  return minDist <= 0.08 ? best : timeSec;
}

function assignWordAnimations(wm: WordMetaEntry, motionDefaults: MotionDefaults, storyboard: Map<number, StoryboardEntryLike>, manifestDirective: ManifestWordDirective | null): { entry: EntryStyle; behavior: BehaviorStyle; exit: ExitStyle } {
  if (manifestDirective?.entryStyle) {
    return { entry: manifestDirective.entryStyle, behavior: manifestDirective.behavior ?? 'none', exit: manifestDirective.exitStyle ?? motionDefaults.exits[0] };
  }

  const wd = wm.directive;
  if (wd?.entry) {
    return {
      entry: (wd.entry as EntryStyle) ?? motionDefaults.entries[0],
      behavior: (wd.behavior as BehaviorStyle) ?? 'none',
      exit: (wd.exit as ExitStyle) ?? motionDefaults.exits[0],
    };
  }

  const semanticAnim = getSemanticOverride(wm.clean);
  if (semanticAnim && (semanticAnim.entry || semanticAnim.exit || semanticAnim.behavior)) {
    return {
      entry: (semanticAnim.entry as EntryStyle) ?? motionDefaults.entries[0],
      behavior: (semanticAnim.behavior as BehaviorStyle) ?? 'none',
      exit: (semanticAnim.exit as ExitStyle) ?? motionDefaults.exits[0],
    };
  }

  const storyEntry = storyboard.get(wm.lineIndex);
  if (storyEntry?.entryStyle) {
    const v1EntryMap: Record<string, EntryStyle> = { rises: 'rise', 'slams-in': 'slam-down', 'fractures-in': 'shatter-in', materializes: 'materialize', hiding: 'whisper', cuts: 'snap-in', fades: motionDefaults.entries[1] ?? 'materialize' };
    const v1ExitMap: Record<string, ExitStyle> = { 'dissolves-upward': 'drift-up', 'burns-out': 'burn-out', shatters: 'shatter', lingers: 'linger', fades: motionDefaults.exits[1] ?? 'dissolve' };
    const entry = v1EntryMap[storyEntry.entryStyle] ?? (storyEntry.entryStyle as EntryStyle);
    const exit = v1ExitMap[storyEntry.exitStyle ?? 'fades'] ?? (storyEntry.exitStyle as ExitStyle) ?? motionDefaults.exits[0];
    return { entry, behavior: motionDefaults.behaviors[0] ?? 'pulse', exit };
  }

  const emphasis = wm.directive?.emphasisLevel ?? (isFillerWord(wm.word) ? 0 : 1);
  if (emphasis >= 5) return { entry: 'explode-in', behavior: 'pulse', exit: 'shatter' };
  if (emphasis >= 4) return { entry: 'slam-down', behavior: 'grow', exit: 'snap-out' };
  if (emphasis >= 3) return { entry: 'punch-in', behavior: 'pulse', exit: 'punch-out' };
  if (emphasis <= 0) return { entry: 'cut-in', behavior: 'none', exit: 'cut-out' };

  const variationSeed = ((wm.lineIndex ?? 0) * 7 + (wm.wordIndex ?? 0) * 3) % 4;
  return {
    entry: motionDefaults.entries[variationSeed % motionDefaults.entries.length],
    behavior: motionDefaults.behaviors[variationSeed % motionDefaults.behaviors.length] ?? 'pulse',
    exit: motionDefaults.exits[variationSeed % motionDefaults.exits.length],
  };
}

export type WordEmitterType = 'ember'|'frost'|'spark-burst'|'dust-impact'|'light-rays'|'converge'|'shockwave-ring'|'gold-coins'|'memory-orbs'|'motion-trail'|'dark-absorb'|'none';

export interface CompiledWord { id: string; text: string; clean: string; wordIndex: number; layoutX: number; layoutY: number; baseFontSize: number; wordStart: number; entryStyle: EntryStyle; exitStyle: ExitStyle; behaviorStyle: BehaviorStyle; fontWeight: number; fontFamily: string; color: string; hasSemanticColor?: boolean; isHeroWord?: boolean; heroPresentation?: string; isAnchor: boolean; isFiller: boolean; emphasisLevel: number; wordDuration: number; semanticScaleX: number; semanticScaleY: number; semanticAlphaMax: number; semanticGlowMult: number; entryDurationMult: number; emitterType: string; trail: string; iconGlyph?: string; iconStyle?: 'outline' | 'filled' | 'ghost'; iconPosition?: 'behind' | 'above' | 'beside' | 'replace'; iconScale?: number; ghostTrail?: boolean; ghostCount?: number; ghostSpacing?: number; ghostDirection?: string; isLetterChunk?: boolean; letterIndex?: number; letterTotal?: number; letterDelay?: number; }
export interface CompiledPhraseGroup { lineIndex: number; groupIndex: number; anchorWordIdx: number; start: number; end: number; words: CompiledWord[]; staggerDelay: number; entryDuration: number; exitDuration: number; lingerDuration: number; behaviorIntensity: number; motionBudget?: PhraseMotionBudget; }
export interface BeatEvent { time: number; springVelocity: number; glowMax: number; }
export interface CompiledChapter { index: number; startRatio: number; endRatio: number; targetZoom: number; emotionalIntensity: number; typography: { fontFamily: string; fontWeight: number; heroWeight: number; textTransform: string; }; atmosphere: string; }
export interface CompiledScene { phraseGroups: CompiledPhraseGroup[]; songStartSec: number; songEndSec: number; durationSec: number; beatEvents: BeatEvent[]; bpm: number; chapters: CompiledChapter[]; emotionalArc: string; visualMode: VisualMode; baseFontFamily: string; baseFontWeight: number; baseTextTransform: string; palettes: string[][]; animParams: { linger: number; stagger: number; entryDuration: number; exitDuration: number; }; songMotion: SongMotionIdentity; sectionMods: SectionMotionMod[]; }

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

export function compileScene(payload: ScenePayload, options?: { viewportWidth?: number; viewportHeight?: number }): CompiledScene {
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
  // B-11: Validate word timing — skip words with start >= end or negative timestamps
  const rawWords = payload.words ?? [];
  const words = rawWords.filter(w => {
    if (w.start < 0 || w.end < 0 || w.start >= w.end) return false;
    return true;
  });
  const wordMeta: WordMetaEntry[] = words.map((w) => {
    const clean = w.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const lineIndex = Math.max(0, payload.lines.findIndex((l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? Infinity)));
    return { ...w, clean, directive: directives.get(clean) ?? null, lineIndex, wordIndex: 0 };
  });
  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) { lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0; wm.wordIndex = lineWordCounters[wm.lineIndex]++; }

  // ═══ BEAT-SNAP: align word timestamps to beat grid ═══
  // Whisper timestamps are acoustically accurate (when mouth opens).
  // Beat grid is perceptually accurate (when the audience feels the beat).
  // Snapping words to beats makes lyrics feel performed, not transcribed.
  // After this, words + camera + beat bars all fire from the same grid.
  const beats = payload.beat_grid?.beats ?? [];
  if (beats.length > 0) {
    const snapped = beatSnapWords(
      wordMeta.map(wm => ({ word: wm.word, start: wm.start, end: wm.end })),
      beats,
    );
    for (let i = 0; i < wordMeta.length && i < snapped.length; i++) {
      wordMeta[i].start = snapped[i].start;
      wordMeta[i].end = snapped[i].end;
    }
  }

  const aiPhrases = (payload.cinematic_direction as any)?.phrases as CinematicPhrase[] | undefined;
  const phraseGroups = buildPhraseGroups(wordMeta, aiPhrases);
  const manifestWordDirectives = ((payload.frame_state as any)?.wordDirectives ?? {}) as Record<string, ManifestWordDirective>;
  const storyboardRaw = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];
  // Convert to map keyed by lineIndex — the raw array is sparse (15-25 entries for a 40-line song)
  const storyboard = new Map<number, StoryboardEntryLike>();
  for (const entry of storyboardRaw) {
    if (typeof entry.lineIndex === 'number') {
      storyboard.set(entry.lineIndex, entry);
    }
  }

  const WORD_LINGER_BY_PROFILE: Record<string, number> = { weighted: 0.15, fluid: 0.55, elastic: 0.2, drift: 0.8, glitch: 0.05 };
  const globalPhraseDur = phraseAnimDurations(Math.max(1, phraseGroups[0]?.words.length ?? 1), Math.max(250, Math.round(durationSec * 250)));
  const animParams = {
    linger: WORD_LINGER_BY_PROFILE[motionProfile] ?? globalPhraseDur.linger,
    stagger: typeof (payload.frame_state as any)?.stagger === 'number' ? (payload.frame_state as any).stagger : globalPhraseDur.stagger,
    entryDuration: Math.min(motionDefaults.entryDuration, globalPhraseDur.entryDuration),
    exitDuration: Math.min(motionDefaults.exitDuration, globalPhraseDur.exitDuration),
  };

  const slotEnds: number[] = [];
  for (const group of phraseGroups) {
    const groupDur = phraseAnimDurations(group.words.length, Math.round((group.end - group.start) * 1000));
    const visStart = group.start - groupDur.entryDuration - groupDur.stagger * group.words.length;
    const visEnd = group.end + Math.max(animParams.linger, groupDur.linger) + groupDur.exitDuration;
    let slot = 0; for (; slot < slotEnds.length; slot += 1) if (visStart >= slotEnds[slot]) break;
    if (slot === slotEnds.length) slotEnds.push(visEnd); else slotEnds[slot] = visEnd;
    (group as any)._positionSlot = slot % 3;
  }


  const baseTypography = TYPOGRAPHY_PROFILES[((payload.cinematic_direction as any)?.typography as string) ?? 'clean-modern'] ?? TYPOGRAPHY_PROFILES['clean-modern'];

  // Create measurement context
  let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (typeof document !== 'undefined') {
    const domCanvas = document.createElement('canvas');
    domCanvas.width = 1;
    domCanvas.height = 1;
    const ctx = domCanvas.getContext('2d');
    if (ctx) {
      measureCtx = ctx;
    } else {
      const oc = new OffscreenCanvas(1, 1);
      measureCtx = oc.getContext('2d')!;
    }
  } else {
    const oc = new OffscreenCanvas(1, 1);
    measureCtx = oc.getContext('2d')!;
  }

  // Prime the canvas with the font
  measureCtx.font = `${baseTypography.fontWeight} 48px "${baseTypography.fontFamily}", sans-serif`;
  measureCtx.measureText('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');

  // Viewport info for portrait-aware layout
  const vw = options?.viewportWidth ?? 960;
  const vh = options?.viewportHeight ?? 540;
  const isPortrait = vh > vw;

  // ═══ RESPONSIVE: compile in actual viewport dimensions ═══
  // Positions and font sizes are FINAL pixel values — no scaling at render time.
  // On resize, the scene recompiles with the new dimensions.
  const REF_W = vw;
  const REF_H = vh;
  // fitTextToViewport auto-selects maxLines based on aspect ratio internally
  // No override needed — let it use its default.
  const layoutMaxLines = undefined;

  // Pre-compute layout for each group using fitTextToViewport
  const groupLayouts = new Map<string, { fontSize: number; positions: Array<{ x: number; y: number; width: number }> }>();

  for (const group of phraseGroups) {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const groupWords = group.words.map(wm =>
      baseTypography.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word
    );

    const hasHero = group.words.some(wm =>
      (wm.directive?.emphasisLevel ?? 1) >= 4 ||
      wm.directive?.isolation === true ||
      storyboard.get(group.lineIndex)?.heroWord?.toLowerCase() === wm.clean
    );

    const layout = fitTextToViewport(
      measureCtx as MeasureContext,
      groupWords,
      REF_W,
      REF_H,
      baseTypography.fontFamily,
      baseTypography.fontWeight,
      {
        ...(layoutMaxLines !== undefined ? { maxLines: layoutMaxLines } : {}),
        textTransform: 'none', // already transformed above
        hasHeroWord: hasHero,
      },
    );

    groupLayouts.set(key, {
      fontSize: layout.fontSize,
      positions: layout.wordPositions.map(wp => ({ x: wp.x, y: wp.y, width: wp.width })),
    });
  }

  const chapterBeats = payload.beat_grid?.beats ?? [];
  const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;

  const compiledChapters: CompiledChapter[] = chapters.map((chapter: any, index: number) => ({
    index,
    startRatio: chapter.startRatio ?? 0,
    endRatio: chapter.endRatio ?? 1,
    targetZoom: distanceToZoom[((payload.cinematic_direction?.storyboard?.[index] as any)?.shotType ?? 'Medium')] ?? 1.0,
    emotionalIntensity: chapter.emotionalIntensity ?? 0.5,
    typography: { fontFamily: baseTypography.fontFamily, fontWeight: baseTypography.fontWeight, heroWeight: baseTypography.heroWeight, textTransform: baseTypography.textTransform },
    atmosphere: chapter.atmosphere ?? (payload.cinematic_direction as any)?.atmosphere ?? 'cinematic',
  }));

  const analysis = (payload.beat_grid as any)?._analysis ?? null;
  const songMotion = deriveSongMotionIdentity(bpm, analysis, beats);
  const sectionMods = deriveAllSectionMods(analysis, compiledChapters, durationSec);

  for (const group of phraseGroups) {
    const phraseDurMs = Math.round((group.end - group.start) * 1000);
    (group as any)._motionBudget = derivePhraseMotionBudget(group.words.length, phraseDurMs);
  }

  const compiledGroups: CompiledPhraseGroup[] = phraseGroups.map((group) => {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const lineStory = storyboard.get(group.lineIndex);
    const groupDur = phraseAnimDurations(group.words.length, Math.round((group.end - group.start) * 1000));
    const groupLayout = groupLayouts.get(key);
    const positions = groupLayout?.positions ?? [];
    const groupFontSize = groupLayout?.fontSize ?? 56;
    const wordsCompiled: CompiledWord[] = group.words.flatMap((wm, wi) => {
      const manifestDirective = manifestWordDirectives[key]?.[wi] ?? null;
      const motion = assignWordAnimations(wm, motionDefaults, storyboard, manifestDirective as ManifestWordDirective | null);
      const semantic = null; // visualMetaphor removed — entry/exit/behavior derived from emphasisLevel
      // ═══ Semantic auto-map: word meaning → color/glow (the word IS the directive) ═══
      const autoSemantic = getSemanticOverride(wm.clean);
      const pos = positions[wi] ?? { x: REF_W / 2, y: REF_H / 2, width: 40 };
      const base: CompiledWord = {
        id: `${group.lineIndex}-${group.groupIndex}-${wi}`,
        text: baseTypography.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word,
        clean: wm.clean || wm.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        wordIndex: wi,
        layoutX: pos.x,
        layoutY: pos.y,
        baseFontSize: groupFontSize,
        wordStart: snapToBeat(wm.start, beats),
        entryStyle: semantic?.entry ?? motion.entry,
        exitStyle: semantic?.exit ?? motion.exit,
        behaviorStyle: semantic?.behavior ?? motion.behavior,
        fontWeight: semantic?.fontWeight ?? baseTypography.fontWeight,
        fontFamily: baseTypography.fontFamily,
        color: semantic?.colorOverride ?? autoSemantic?.colorOverride ?? resolveV3Palette(payload, ((wm.start + (payload.lines[group.lineIndex]?.end ?? wm.start)) * 0.5 - payload.songStart) / Math.max(0.01, payload.songEnd - payload.songStart))[2] ?? '#ffffff',
        hasSemanticColor: Boolean(semantic?.colorOverride || autoSemantic?.colorOverride),
        isHeroWord: (wm.directive?.emphasisLevel ?? 1) >= 4
          || (wm.directive as any)?.isolation === true
          || (lineStory?.heroWord && wm.clean === lineStory.heroWord.toLowerCase().replace(/[^a-z0-9]/g, '')),
        heroPresentation: undefined, // removed — isolation handled by separate flag
        isAnchor: wi === group.anchorWordIdx,
        isFiller: isFillerWord(wm.word),
        emphasisLevel: wm.directive?.emphasisLevel ?? 1,
        wordDuration: Math.max(0, wm.end - wm.start),
        semanticScaleX: semantic?.scaleX ?? 1,
        semanticScaleY: semantic?.scaleY ?? 1,
        semanticAlphaMax: semantic?.alphaMax ?? 1,
        semanticGlowMult: semantic?.glowMultiplier ?? autoSemantic?.glowMult ?? 1,
        entryDurationMult: semantic?.entryDurationMult ?? 1,
        emitterType: semantic?.emitterType ?? 'none',
        trail: wm.directive?.trail ?? (semantic?.emitterType ?? 'none'),
        ghostTrail: undefined,
        ghostCount: undefined,
        ghostSpacing: undefined,
        ghostDirection: undefined,
        iconGlyph: undefined,
        iconStyle: undefined,
        iconPosition: undefined,
        iconScale: undefined,
      };
      return [base];
    });
    return { lineIndex: group.lineIndex, groupIndex: group.groupIndex, anchorWordIdx: group.anchorWordIdx, start: group.start, end: group.end, words: wordsCompiled, staggerDelay: groupDur.stagger, entryDuration: groupDur.entryDuration, exitDuration: groupDur.exitDuration, lingerDuration: Math.max(animParams.linger, groupDur.linger), behaviorIntensity: motionDefaults.behaviorIntensity, motionBudget: (group as any)._motionBudget ?? undefined };
  }).sort((a, b) => a.start - b.start);

  const heat = physicsProfile?.heat ?? 0.5;
  const beatResponse = physicsProfile?.beatResponse ?? 'pulse';
  const springInit = beatResponse === 'slam' ? 1.8 * heat : 0.8 * heat;
  const glowMax = beatResponse === 'slam' ? 1.2 * heat : 0.6 * heat;
  const beatEvents: BeatEvent[] = beats.map((time) => ({ time, springVelocity: springInit, glowMax }));



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
    songMotion,
    sectionMods,
  };
}

// ─── Types migrated from lyricSceneBaker.ts (deleted — sceneCompiler is the canonical pipeline) ───

interface AtmosphereConfig {
  vignetteStrength: number;
  blurAmount: number;
  grainOpacity: number;
  tintStrength: number;
  overlayType: 'none' | 'frost' | 'gradient-wash' | 'split-mask';
}

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
