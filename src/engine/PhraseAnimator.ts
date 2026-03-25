/**
 * PhraseAnimator.ts — Alpha spotlight engine.
 *
 * Text doesn't move. Text is the anchor. Alpha is the only emphasis tool.
 * Active word = brightest. Hero = room goes quiet + 5% breath. Beat = background only.
 */
import { type MotionCharacter, type AnimState, type CompiledPhraseGroup, type CompiledWord } from '@/lib/sceneCompiler';
import type { MotionProfile } from '@/engine/IntensityRouter';

export interface AnimBeatState { pulse: number; phase: number; }

export interface PhraseAnimState {
  composition: 'stack' | 'line' | 'center_word';
  bias: 'left' | 'center' | 'right';
  revealStyle: 'instant' | 'stagger_fast' | 'stagger_slow';
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
  energyTier: string; heroType: 'word' | 'phrase';
  groupStart: number; groupEnd: number;
  isEntering: boolean; entryProgress: number;
  isExiting: boolean; exitProgress: number; suppressExit: boolean;
  entryCharacter: MotionCharacter; exitCharacter: MotionCharacter | 'none';
  motionIntensity: number; presentationMode: string;
  ghostPreview: boolean; vibrateOnHold: boolean; elementalWash: boolean;
  entry: AnimState; exit: AnimState; biasEntryOffsetX: number;
  beatNudgeY: number; beatScale: number;
  staggerDelay: number; revealAnchor: number;
}

export interface WordAnimState {
  isRevealed: boolean; revealProgress: number; wordRevealTime: number;
  wordState: 'upcoming' | 'active' | 'spoken'; spotlightAlpha: number;
  isHeroWord: boolean; effectiveHero: boolean; isSoloHero: boolean;
  heroScaleMult: number; heroOffsetX: number; heroOffsetY: number;
  soloHeroHidden: boolean; centerWordScale: number; revealRise: number;
  waveScale: number; ghostPreview: boolean;
  bounceAmplitude: number; heroSuppressionFactor: number;
  /** True when a hero word is active and this word should dim */
  heroSuppressed: boolean;
}

export interface ChunkAnimState {
  alpha: number; scaleX: number; scaleY: number;
  offsetX: number; offsetY: number; rotation: number; skewX: number;
  visible: boolean;
}

const WORD_FADE_SEC = 0.15;

// ─── 1. Resolve active group ────────────────────────────────
export function resolveActiveGroup(
  groups: CompiledPhraseGroup[], tSec: number, cursor: number, prevTime: number,
): { activeIdx: number; cursor: number } {
  if (groups.length === 0) return { activeIdx: -1, cursor: 0 };
  if (tSec < prevTime - 0.5) cursor = 0;
  while (cursor < groups.length - 1) { if (tSec >= groups[cursor + 1].start) cursor++; else break; }
  return { activeIdx: cursor, cursor };
}

// ─── 2. Phrase state ────────────────────────────────────────
export function computePhraseState(
  group: CompiledPhraseGroup, nextGroupStart: number, tSec: number,
  beatState: AnimBeatState | null, canvasWidth: number, mp: MotionProfile,
): PhraseAnimState {
  const { composition, bias, revealStyle, holdClass, energyTier, heroType } = group;
  void nextGroupStart; void canvasWidth; void mp; void beatState; void tSec;
  const staggerDelay = group.staggerDelay ?? 0;
  const noMotion: AnimState = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };

  // No text motion. Beat lives in background only.
  return {
    composition, bias, revealStyle, holdClass, energyTier, heroType,
    groupStart: group.start, groupEnd: group.end,
    isEntering: false, entryProgress: 1, isExiting: false, exitProgress: 0, suppressExit: true,
    entryCharacter: 'drift' as MotionCharacter, exitCharacter: 'none',
    motionIntensity: 0, presentationMode: group.presentationMode ?? 'horiz_center',
    ghostPreview: group.ghostPreview ?? false, vibrateOnHold: false, elementalWash: false,
    entry: noMotion, exit: noMotion, biasEntryOffsetX: 0,
    beatNudgeY: 0,   // no Y motion on text
    beatScale: 1.0,  // no scale pulse on text
    staggerDelay, revealAnchor: group.start,
  };
}

// ─── 3. Per-word state ──────────────────────────────────────
export function computeWordState(
  word: CompiledWord, wordIndex: number, group: CompiledPhraseGroup,
  phrase: PhraseAnimState, tSec: number, groupHasActiveSoloHero: boolean,
  canvasWidth: number, canvasHeight: number, mp: MotionProfile, activeHeroWordIndex: number,
): WordAnimState {
  // ── Reveal timing ──
  const wordRevealTime = phrase.staggerDelay < 0.005
    ? phrase.revealAnchor
    : phrase.revealAnchor + wordIndex * phrase.staggerDelay;
  const isRevealed = tSec >= wordRevealTime;
  const revealProgress = !isRevealed ? 0
    : phrase.staggerDelay < 0.005 ? 1
    : Math.min(1, (tSec - wordRevealTime) / WORD_FADE_SEC);

  // ── Word timing state ──
  const wordStart = word.wordStart ?? group.start;
  const nextWordStart = wordIndex + 1 < group.words.length
    ? (group.words[wordIndex + 1].wordStart ?? group.end) : group.end;
  let wordState: 'upcoming' | 'active' | 'spoken';
  if (tSec < wordStart) {
    wordState = wordIndex === 0 && tSec < (group.words[0].wordStart ?? group.start) ? 'active' : 'upcoming';
  } else if (tSec < nextWordStart) {
    wordState = 'active';
  } else {
    wordState = 'spoken';
  }

  // ── Hero detection ──
  const isHeroWord = word.isHeroWord === true;
  const effectiveHero = phrase.heroType === 'phrase' ? true : isHeroWord;
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && (word.wordDuration ?? 0) >= 0.5;
  const soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  // ── Hero scale: gentle bell curve breath ──
  // Smooth sine half-wave over the word's duration + 150ms tail.
  // Rises gradually, peaks at center, falls gradually. Never snaps.
  let heroScaleMult = 1.0;
  if (effectiveHero && !isSoloHero) {
    const heroDurSec = Math.max(0.1, nextWordStart - wordStart);
    // Extend the breath 150ms past the word end for smooth descent
    const breathWindow = heroDurSec + 0.15;
    const elapsed = tSec - wordStart;

    if (elapsed >= 0 && elapsed < breathWindow) {
      const t = elapsed / breathWindow;
      // Sine half-wave: gradual rise, peak near center, gradual fall
      const bell = Math.sin(t * Math.PI);
      heroScaleMult = 1.0 + bell * 0.04 * mp.textHeroMult;
    }
  }

  // Solo hero offset (center screen)
  let heroOffsetX = 0; let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
    heroScaleMult = Math.max(heroScaleMult, 1.15);
  }

  const centerWordScale = phrase.composition === 'center_word' ? 1.0 : 1.0;

  // ── Hero suppression: room goes quiet ──
  // Hero suppression only dims UPCOMING words. Active and spoken stay at 1.0.
  const heroSuppressed = activeHeroWordIndex >= 0
    && wordIndex !== activeHeroWordIndex
    && wordState === 'upcoming';

  return {
    isRevealed, revealProgress, wordRevealTime,
    wordState, spotlightAlpha: 1.0,
    isHeroWord, effectiveHero, isSoloHero,
    heroScaleMult, heroOffsetX, heroOffsetY, soloHeroHidden,
    centerWordScale, revealRise: 0, // no position shift on reveal
    waveScale: 1.0, // no wave scale
    ghostPreview: phrase.ghostPreview,
    bounceAmplitude: 0, // no bounce
    heroSuppressionFactor: 1.0, // unused now
    heroSuppressed,
  };
}

// ─── 4. Final chunk animation: alpha + hero breath ──────────
export function computeChunkAnim(
  word: CompiledWord, phrase: PhraseAnimState, wordAnim: WordAnimState,
  beatPhase: number, intensity: number,
): ChunkAnimState {
  void word; void beatPhase; void intensity; void phrase;

  // ── Alpha: the ONLY emphasis tool ──
  let alpha: number;
  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (!wordAnim.isRevealed) {
    // Unrevealed: invisible, or faint ghost if preview mode
    alpha = wordAnim.ghostPreview ? 0.12 : 0;
  } else if (wordAnim.wordState === 'active') {
    // Spotlight: brightest thing on screen. NEVER suppressed.
    alpha = 1.0;
  } else if (wordAnim.wordState === 'spoken') {
    // Already said: stays bright. NEVER suppressed. Eyes move forward.
    alpha = 1.0;
  } else if (wordAnim.heroSuppressed) {
    // Upcoming + hero active: room goes quiet
    alpha = 0.25;
  } else {
    // Upcoming: waiting to be spoken
    alpha = 0.35;
  }

  // Reveal fade-in
  if (wordAnim.isRevealed && wordAnim.revealProgress < 1.0) {
    alpha *= wordAnim.revealProgress;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  // ── Scale: only hero breath (1.0 → 1.05) ──
  const scale = wordAnim.heroScaleMult;

  return {
    alpha,
    scaleX: scale,
    scaleY: scale,
    offsetX: wordAnim.heroOffsetX,
    offsetY: wordAnim.heroOffsetY,
    rotation: 0, skewX: 0,
    visible: alpha > 0.01,
  };
}

// ─── 5. Helpers ─────────────────────────────────────────────
export function detectSoloHero(group: CompiledPhraseGroup, tSec: number): boolean {
  void tSec;
  if (group.words.length !== 1) return false;
  return group.words[0].isHeroWord === true && (group.words[0].wordDuration ?? 0) >= 0.5;
}

export function findActiveHeroWordIndex(group: CompiledPhraseGroup, tSec: number): number {
  for (let i = 0; i < group.words.length; i++) {
    const w = group.words[i];
    if (!w.isHeroWord) continue;
    const ws = w.wordStart ?? group.start;
    const ns = i + 1 < group.words.length ? (group.words[i + 1].wordStart ?? group.end) : group.end;
    if (tSec >= ws && tSec < ns) return i;
  }
  return -1;
}
