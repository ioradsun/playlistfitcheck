/**
 * PhraseAnimator.ts — Pure animation state computation for the LyricDance engine.
 *
 * This file owns the complete choreography language:
 * - Composition (stack/line/center_word) → how words are revealed
 * - Bias (left/center/right) → entry direction
 * - Reveal (instant/stagger_fast/stagger_slow) → per-word visibility timing
 * - Entry/Exit motion (slam/drift/rise/snap/bloom/whisper) → how phrase arrives/leaves
 * - Hold (short_hit/medium_groove/long_emotional) → how long phrase owns the screen
 *
 * Design principle: alpha is a PRIORITY CHAIN, not a multiplication chain.
 * The motion character's own alpha curve is respected. No more 7-way multiplication.
 */

import {
  type MotionCharacter,
  type AnimState,
  type CompiledPhraseGroup,
  type CompiledWord,
} from '@/lib/sceneCompiler';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

/** Beat state subset */
export interface AnimBeatState {
  pulse: number; // 0..1 beat intensity
  phase: number; // 0..1 position within beat cycle
}

/** Computed per phrase, per frame */
export interface PhraseAnimState {
  // Choreography (from compiled group)
  composition: 'stack' | 'line' | 'center_word';
  bias: 'left' | 'center' | 'right';
  revealStyle: 'instant' | 'stagger_fast' | 'stagger_slow';
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
  energyTier: string;
  heroType: 'word' | 'phrase';

  // Timing
  groupStart: number;
  groupEnd: number; // extended by holdClass
  isEntering: boolean;
  entryProgress: number; // 0→1
  isExiting: boolean;
  exitProgress: number; // 0→1
  suppressExit: boolean; // impact → no exit animation

  // Motion character (from energyTier mapping)
  entryCharacter: MotionCharacter;
  exitCharacter: MotionCharacter | 'none';
  motionIntensity: number;

  // Presentation mode
  presentationMode: string;
  ghostPreview: boolean;      // all words visible at 20% from start
  vibrateOnHold: boolean;     // ramp vibration during hold
  elementalWash: boolean;     // color sweep during hold

  // Entry motion result (identity; kept for compatibility)
  entry: AnimState;

  // Exit motion result (identity; kept for compatibility)
  exit: AnimState;

  // Bias-driven entry slide
  biasEntryOffsetX: number; // px offset at start of entry, eases to 0

  // Beat response (shared for whole phrase)
  beatNudgeY: number;
  beatScale: number;

  // Stagger config
  staggerDelay: number; // seconds between word reveals
  revealAnchor: number; // absolute time when first word reveals
}

/** Computed per word, per frame */
export interface WordAnimState {
  // Reveal (composition-aware stagger gate)
  isRevealed: boolean;
  revealProgress: number; // 0→1 fade-in after reveal time
  wordRevealTime: number; // absolute time this word becomes visible

  // Spotlight
  wordState: 'upcoming' | 'active' | 'spoken';
  spotlightAlpha: number; // 1.0 active/spoken, 0.3 upcoming+revealed, 0 unrevealed

  // Hero
  isHeroWord: boolean;
  effectiveHero: boolean; // true if heroType="phrase" (all words are heroes)
  isSoloHero: boolean; // single-word phrase, hero with long duration
  heroScaleMult: number;
  heroOffsetX: number;
  heroOffsetY: number;
  soloHeroHidden: boolean; // non-solo words hidden when solo hero is active

  // Composition scale boost
  centerWordScale: number; // 1.4 for center_word, 1.0 otherwise

  // Per-word reveal rise (px offset that eases to 0 as word fades in)
  revealRise: number;
}

/** Final render-ready state per word */
export interface ChunkAnimState {
  alpha: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  skewX: number;
  visible: boolean;
}

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const WORD_FADE_SEC = 0.15; // 150ms per-word fade in after stagger reveal
const REVEAL_ANTICIPATION = 0.1; // 100ms before group.start
const CENTER_WORD_SCALE = 1.0; // layout fills viewport — no additional scale needed
const BEAT_NUDGE_BASE = 8; // EXTREME: visible bounce
const BEAT_SCALE_BASE = 1.0; // base scale (1.0 = no beat effect)
const BEAT_SCALE_MULT = 0.08; // EXTREME: visible pulse

// ── Self-contained timing per presentation mode ──
// Each mode defines its own entry/exit duration and intensity.
// Zero dependency on LyricDancePlayer's mood config.
const MODE_TIMING: Record<string, { entryDur: number; exitDur: number; intensity: number; character: MotionCharacter; exitChar: MotionCharacter | 'none' }> = {
  horizontal: { entryDur: 0.5,  exitDur: 0.35, intensity: 0.8, character: 'drift',   exitChar: 'drift' },
  stack:      { entryDur: 0.6,  exitDur: 0.4,  intensity: 0.7, character: 'rise',    exitChar: 'drift' },
  ghost:      { entryDur: 0.5,  exitDur: 0.4,  intensity: 0.5, character: 'whisper', exitChar: 'whisper' },
  vibrate:    { entryDur: 0.4,  exitDur: 0.0,  intensity: 0.9, character: 'bloom',   exitChar: 'none' },
  wash:       { entryDur: 0.1,  exitDur: 0.0,  intensity: 1.0, character: 'snap',    exitChar: 'none' },
  impact:     { entryDur: 0.05, exitDur: 0.0,  intensity: 1.0, character: 'snap',    exitChar: 'none' },
  horiz_drift:{ entryDur: 0.6,  exitDur: 0.35, intensity: 0.8, character: 'rise',    exitChar: 'drift' },
};

// AI moment defaults (no presentation mode card)
const AI_MOMENT_DEFAULTS = {
  entryDur: 0.35,
  exitDur: 0.25,
  intensity: 0.7,
  character: 'drift' as MotionCharacter,
  exitChar: 'drift' as MotionCharacter | 'none',
};

function getModeTiming(presentationMode: string | undefined): typeof AI_MOMENT_DEFAULTS {
  if (!presentationMode || presentationMode === 'ai_moment') return AI_MOMENT_DEFAULTS;
  if (presentationMode === 'horiz_drift') return MODE_TIMING.horiz_drift;
  if (presentationMode.startsWith('horiz')) return MODE_TIMING.horizontal;
  if (presentationMode.startsWith('stack')) return MODE_TIMING.stack;
  if (presentationMode.startsWith('ghost')) return MODE_TIMING.ghost;
  if (presentationMode.startsWith('vibrate')) return MODE_TIMING.vibrate;
  if (presentationMode.startsWith('wash')) return MODE_TIMING.wash;
  if (presentationMode.startsWith('impact')) return MODE_TIMING.impact;
  return AI_MOMENT_DEFAULTS;
}

// ─────────────────────────────────────────
// 1. Resolve active group (cursor logic)
// ─────────────────────────────────────────

/**
 * Find the active phrase group for the current time.
 * O(1) amortized — cursor only moves forward.
 * Never-blank: holds current group until next group's entry window begins.
 */
export function resolveActiveGroup(
  groups: CompiledPhraseGroup[],
  tSec: number,
  cursor: number,
  prevTime: number,
): { activeIdx: number; cursor: number } {
  if (groups.length === 0) return { activeIdx: -1, cursor: 0 };

  // Handle seek (time jumped backward)
  if (tSec < prevTime - 0.5) {
    cursor = 0;
  }

  // Advance cursor strictly from phrase timing data:
  // current phrase remains active through its indexed end time.
  while (cursor < groups.length - 1) {
    const current = groups[cursor];
    if (tSec >= current.end) {
      cursor++;
    } else {
      break;
    }
  }

  return { activeIdx: cursor, cursor };
}

// ─────────────────────────────────────────
// 2. Compute phrase-level animation state
// ─────────────────────────────────────────

/**
 * Compute the phrase-level animation state for the active group.
 * This includes: timing, motion character, entry/exit transforms, beat response, bias direction.
 */
export function computePhraseState(
  group: CompiledPhraseGroup,
  nextGroupStart: number,
  tSec: number,
  beatState: AnimBeatState | null,
  canvasWidth: number,
): PhraseAnimState {
  const { composition, bias, revealStyle, holdClass, energyTier, heroType } = group;

  // ── Group timing: strictly derived from compiled phrase word bounds ──
  // start = first word start, end = last word end
  void nextGroupStart;
  const groupEnd = group.end;

  // ── Timing used for stagger reveal and phrase activation window ──
  const staggerDelay = group.staggerDelay ?? 0;
  const entryPad = group.words.length * (staggerDelay || 0.05) + 0.2;
  // Keep mode timing lookup for forward compatibility and intensity mapping.
  const modeTiming = getModeTiming(group.presentationMode);
  // ── No entry/exit animation. Phrase appears instantly, holds, gets replaced. ──
  const timeSinceActivation = tSec - (group.start - entryPad);
  const phraseRemaining = groupEnd - tSec;
  void timeSinceActivation;
  void phraseRemaining;

  // Stagger reveal still needs timing — words appear one at a time
  const isEntering = false;  // no entry animation
  const isExiting = false;   // no exit animation
  const entryProgress = 1;   // always fully entered
  const exitProgress = 0;    // never exiting
  const suppressExit = true; // suppress all exit

  // Identity transforms — no motion
  const noMotion: AnimState = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  const entry = noMotion;
  const exit = noMotion;
  const biasEntryOffsetX = 0;

  // ── Beat response ──
  const pulse = beatState?.pulse ?? 0;
  // Chorus beat escalation: each return of the chorus hits harder
  const CHORUS_BEAT_SCALE = [1.0, 1.3, 1.6, 2.0];
  const chorusRepeat = group.chorusRepeat ?? 0;
  const beatMultiplier = chorusRepeat > 0
    ? CHORUS_BEAT_SCALE[Math.min(chorusRepeat - 1, 3)]
    : 1.0;
  const beatNudgeY = pulse * BEAT_NUDGE_BASE * beatMultiplier;
  const beatScale = BEAT_SCALE_BASE + pulse * BEAT_SCALE_MULT * beatMultiplier;

  // All words visible from phrase activation (no reveal gating)
  const revealAnchor = group.start - entryPad;

  return {
    composition,
    bias,
    revealStyle,
    holdClass,
    energyTier,
    heroType,
    groupStart: group.start,
    groupEnd,
    isEntering,
    entryProgress,
    isExiting,
    exitProgress,
    suppressExit,
    entryCharacter: (group.entryCharacter ?? 'drift') as MotionCharacter,
    exitCharacter: (group.exitCharacter ?? 'none') as 'none' | MotionCharacter,
    motionIntensity: modeTiming.intensity,
    presentationMode: group.presentationMode ?? 'horiz_center',
    ghostPreview: group.ghostPreview ?? false,
    vibrateOnHold: group.vibrateOnHold ?? false,
    elementalWash: group.elementalWash ?? false,
    entry,
    exit,
    biasEntryOffsetX,
    beatNudgeY,
    beatScale,
    staggerDelay,
    revealAnchor,
  };
}

// ─────────────────────────────────────────
// 3. Compute per-word animation state
// ─────────────────────────────────────────

/**
 * Compute animation state for a single word within the active phrase.
 */
export function computeWordState(
  word: CompiledWord,
  wordIndex: number,
  group: CompiledPhraseGroup,
  phrase: PhraseAnimState,
  tSec: number,
  groupHasActiveSoloHero: boolean,
  canvasWidth: number,
  canvasHeight: number,
): WordAnimState {
  // ── Reveal timing (composition-aware) ──
  let wordRevealTime: number;
  if (phrase.staggerDelay < 0.005) {
    // Instant: all words visible at anchor
    wordRevealTime = phrase.revealAnchor;
  } else {
    // Stagger: per word (line) or per line (stack — each word IS a line)
    wordRevealTime = phrase.revealAnchor + wordIndex * phrase.staggerDelay;
  }

  const isRevealed = tSec >= wordRevealTime;
  const revealProgress = !isRevealed
    ? 0
    : phrase.staggerDelay < 0.005
      ? 1
      : Math.min(1, (tSec - wordRevealTime) / WORD_FADE_SEC);

  // ── Word timing state ──
  const wordStart = word.wordStart ?? group.start;
  const nextWordStart = wordIndex + 1 < group.words.length ? (group.words[wordIndex + 1].wordStart ?? group.end) : group.end;

  let wordState: 'upcoming' | 'active' | 'spoken';
  if (tSec < wordStart) {
    // Before word starts — first word gets 'active' to avoid gray blob
    wordState = wordIndex === 0 && tSec < (group.words[0].wordStart ?? group.start) ? 'active' : 'upcoming';
  } else if (tSec < nextWordStart) {
    wordState = 'active';
  } else {
    wordState = 'spoken';
  }

  // ── Spotlight alpha: simple per-word state ──
  let spotlightAlpha: number;
  if (wordState === 'active') {
    spotlightAlpha = 1.0;
  } else if (wordState === 'spoken') {
    spotlightAlpha = 0.7;
  } else {
    // upcoming
    spotlightAlpha = 0.4;
  }

  // ── Hero detection ──
  const isHeroWord = word.isHeroWord === true;
  const effectiveHero = phrase.heroType === 'phrase' ? true : isHeroWord;
  const heroDuration = word.wordDuration ?? 0;

  // Solo hero: single-word phrases with long hero duration
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && heroDuration >= 0.5;

  // Hidden when another word in the group is soloing
  const soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  // ── Hero scale ──
  const emp = word.emphasisLevel ?? 0;
  let heroScaleMult = 1.0;
  if (effectiveHero && !isSoloHero) {
    heroScaleMult = 1.0 + Math.max(0, emp - 1) * 0.05; // emp5 = 1.20x, emp3 = 1.10x
  }

  // Solo hero offset (center screen)
  let heroOffsetX = 0;
  let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
    heroScaleMult = Math.max(heroScaleMult, 1.15); // solo hero: visible but safe
  }

  // ── Composition scale boost ──
  const centerWordScale = phrase.composition === 'center_word' ? CENTER_WORD_SCALE : 1.0;

  // Per-word micro-animation for reveal modes:
  // Each word rises slightly when it's revealed (the stagger IS the motion)
  let revealRise = 0;
  if (!phrase.ghostPreview && phrase.staggerDelay >= 0.005) {
    // Words rise 15px over their reveal fade
    revealRise = isRevealed ? (1 - revealProgress) * 15 : 15;
  }

  return {
    isRevealed,
    revealProgress,
    wordRevealTime,
    wordState,
    spotlightAlpha,
    isHeroWord,
    effectiveHero,
    isSoloHero,
    heroScaleMult,
    heroOffsetX,
    heroOffsetY,
    soloHeroHidden,
    centerWordScale,
    revealRise,
  };
}

// ─────────────────────────────────────────
// 4. Merge to final chunk animation state
// ─────────────────────────────────────────

/**
 * Compute the final render-ready animation state for a word.
 * Alpha is a PRIORITY CHAIN, not a multiplication chain.
 */
export function computeChunkAnim(
  word: CompiledWord,
  phrase: PhraseAnimState,
  wordAnim: WordAnimState,
): ChunkAnimState {
  // keep signature stable for future word-specific adjustments
  void word;

  // ── ALPHA: simple. Phrase is on screen = words are visible. ──
  // Active word = full brightness. Spoken = slightly dimmed. Upcoming = dimmer.
  // No entry fade, no exit fade. Hero directive decomp handled separately.
  let alpha: number;
  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (wordAnim.wordState === 'active') {
    alpha = 1.0;
  } else if (wordAnim.wordState === 'spoken') {
    alpha = 0.7;
  } else {
    // upcoming — visible but dimmed
    alpha = 0.4;
  }

  alpha = Math.max(0, Math.min(1, alpha));

  // ── SCALE: center_word = no extra scale. Others = hero emphasis. ──
  // fitTextToViewport already sizes center_word to fill 88% of viewport.
  // Adding ANY scale on top causes overflow. Only non-center_word gets hero boost.
  const isCenterWord = wordAnim.centerWordScale > 1.01;
  const emphasisScale = isCenterWord ? 1.0 : wordAnim.heroScaleMult;
  let scaleX = emphasisScale;
  let scaleY = emphasisScale;

  // Beat response scale (subtle pulse on beat)
  scaleX *= phrase.beatScale;
  scaleY *= phrase.beatScale;

  // ── POSITION: no entry/exit motion. Words stay in place. ──
  let offsetX = 0;
  let offsetY = 0;

  // Hero centering offset
  offsetX += wordAnim.heroOffsetX;
  offsetY += wordAnim.heroOffsetY;

  // Beat nudge
  offsetY += phrase.beatNudgeY;

  // Per-word reveal rise (stagger modes only)
  offsetY += wordAnim.revealRise;

  // ── ROTATION / SKEW ──
  let rotation = 0;
  let skewX = 0;
  if (phrase.isEntering) {
    rotation += phrase.entry.rotation;
    skewX += phrase.entry.skewX;
  }
  if (phrase.isExiting && !phrase.suppressExit) {
    rotation += phrase.exit.rotation ?? 0;
    skewX += phrase.exit.skewX ?? 0;
  }


  // ── VIBRATE ON HOLD ──
  if (phrase.vibrateOnHold && !phrase.isEntering && !phrase.isExiting) {
    // holdProgress: how far through the hold are we
    const holdDuration = phrase.groupEnd - phrase.groupStart;
    const holdElapsed = Math.max(0, /* tSec needs to be passed in */ 0);
    void holdDuration;
    void holdElapsed;
    // Note: tSec is not available in computeChunkAnim.
    // The vibrate offset must be computed in evaluateFrame and added to chunk.x/chunk.y.
    // See File 4 below for where this is applied.
  }

  // ── GHOST PREVIEW scale bounce on active ──
  if (phrase.ghostPreview && wordAnim.wordState === 'active') {
    // Quick bounce: 1.0 → 1.08 → 1.0 over ~150ms
    // This needs wordActiveTime which we don't have here.
    // Applied in evaluateFrame — see File 4.
  }
  return {
    alpha,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    rotation,
    skewX,
    visible: alpha > 0.01,
  };
}

// ─────────────────────────────────────────
// 5. Detect solo hero in group
// ─────────────────────────────────────────

/**
 * Check if the active group has a solo hero that should hide other words.
 */
export function detectSoloHero(group: CompiledPhraseGroup, tSec: number): boolean {
  // kept for symmetry with time-dependent detectors
  void tSec;

  if (group.words.length !== 1) return false;
  const word = group.words[0];
  if (!word.isHeroWord) return false;
  const dur = word.wordDuration ?? 0;
  return dur >= 0.5;
}
