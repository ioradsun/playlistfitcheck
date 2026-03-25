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
  spotlightAlpha: number; // 1.0 active/spoken, 0.5 upcoming+revealed, 0 unrevealed

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

  /** Smooth 0→1→0 proximity wave for active word emphasis */
  waveScale: number;
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
const BEAT_NUDGE_BASE = 2.0; // subtle nod — person nodding to the beat, not bouncing
const BEAT_SCALE_BASE = 1.0; // base scale (1.0 = no beat effect)
const BEAT_SCALE_MULT = 0.008; // near-zero pulse expansion — nod is positional, not scale
const BEAT_RESPONSE_DAMPING_EXPONENT = 0.6; // softer damping for gentler nod curve
const BEAT_NUDGE_MAX = 3; // tight clamp — nod is 1-3px, never more
const BEAT_SCALE_MAX = 1.015; // barely perceptible scale pulse
const REVEAL_RISE_PX = 8; // reduced per-word rise during stagger reveal (was 15)
const WORD_OFFSET_Y_MAX = 12; // safety clamp for total vertical offset in readable range

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

  // Advance cursor: swap to next phrase when its first word starts.
  // No early entry — the current phrase holds until replaced.
  while (cursor < groups.length - 1) {
    const next = groups[cursor + 1];
    if (tSec >= next.start) {
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

  // ── Timing used for phrase activation window ──
  const staggerDelay = group.staggerDelay ?? 0;
  // Keep mode timing lookup for forward compatibility and intensity mapping.
  const modeTiming = getModeTiming(group.presentationMode);
  // ── No entry/exit animation. Phrase appears instantly, holds, gets replaced. ──
  const timeSinceActivation = tSec - group.start;
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
  const rawPulse = beatState?.pulse ?? 0;
  const phase = beatState?.phase ?? 0;
  const pulse = Math.pow(Math.max(0, Math.min(1, rawPulse)), BEAT_RESPONSE_DAMPING_EXPONENT);

  // ── Head-nod curve: fast attack on downbeat, slow float back up ──
  // phase=0 is the downbeat. Nod snaps down quickly, returns slowly.
  // pow(1-phase, 2.5) gives sharp attack at phase=0, gentle decay toward phase=1.
  const nodCurve = Math.pow(Math.max(0, 1 - phase), 2.5);

  // Chorus escalation: each chorus return nods slightly harder (capped)
  const CHORUS_BEAT_SCALE = [1.0, 1.15, 1.3, 1.45];
  const chorusRepeat = group.chorusRepeat ?? 0;
  const beatMultiplier = chorusRepeat > 0
    ? CHORUS_BEAT_SCALE[Math.min(chorusRepeat - 1, 3)]
    : 1.0;

  // Nod = pulse gates whether we nod at all, nodCurve shapes the motion
  const beatNudgeY = Math.min(BEAT_NUDGE_MAX, pulse * nodCurve * BEAT_NUDGE_BASE * beatMultiplier);
  const beatScale = Math.min(BEAT_SCALE_MAX, BEAT_SCALE_BASE + pulse * BEAT_SCALE_MULT * beatMultiplier);

  // All words visible from phrase start
  const revealAnchor = group.start;

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
    spotlightAlpha = 1.0;
  } else {
    // upcoming — visible but dimmed
    spotlightAlpha = 0.5;
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

  // ── Hero scale (wave-based for multi-word phrases) ──
  const emp = word.emphasisLevel ?? 0;
  let heroScaleMult = 1.0;
  if (effectiveHero && !isSoloHero) {
    // Use the same wave proximity as active word emphasis.
    // Hero emphasis scales with the wave — peaks when the word is being spoken,
    // gently ramps for neighbors. Maintains spacing because neighborPushOffsets
    // in LyricDancePlayer reads heroScaleMult each frame.
    const heroWordStart = word.wordStart ?? group.start;
    const heroNextStart = wordIndex + 1 < group.words.length
      ? (group.words[wordIndex + 1].wordStart ?? group.end)
      : group.end;
    const heroMid = (heroWordStart + heroNextStart) / 2;
    const heroHalfDur = Math.max(0.05, (heroNextStart - heroWordStart) / 2);
    const heroBleed = heroHalfDur + 0.2;
    const heroDist = Math.abs(tSec - heroMid);
    const heroProx = Math.max(0, 1 - heroDist / heroBleed);
    const heroEased = heroProx * heroProx * (3 - 2 * heroProx);
    heroScaleMult = 1.0 + heroEased * Math.max(0, emp - 1) * 0.12;
  }

  // Solo hero offset (center screen)
  let heroOffsetX = 0;
  let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
    heroScaleMult = Math.max(heroScaleMult, 1.35);
  }

  // ── Composition scale boost ──
  const centerWordScale = phrase.composition === 'center_word' ? CENTER_WORD_SCALE : 1.0;

  // Per-word micro-animation for reveal modes:
  // Each word rises slightly when it's revealed (the stagger IS the motion)
  let revealRise = 0;
  if (!phrase.ghostPreview && phrase.staggerDelay >= 0.005) {
    // Reduced rise keeps stagger readable and less jumpy.
    revealRise = isRevealed ? (1 - revealProgress) * REVEAL_RISE_PX : REVEAL_RISE_PX;
  }

  // ── Wave scale: smooth gaussian-like swell centered on word's active window ──
  // Instead of hard snap (active=big, spoken=small), compute a continuous
  // proximity value that peaks when the word is being spoken and gently
  // ramps up/down for neighboring words. Feels like a wave gliding across.
  const wordStartTime = word.wordStart ?? group.start;
  const nextWordStartTime = wordIndex + 1 < group.words.length
    ? (group.words[wordIndex + 1].wordStart ?? group.end)
    : group.end;
  const wordMid = (wordStartTime + nextWordStartTime) / 2;
  const wordHalfDur = Math.max(0.05, (nextWordStartTime - wordStartTime) / 2);
  // Bleed zone: wave influence extends 60% into neighboring words
  const bleedZone = wordHalfDur + 0.15;
  const dist = Math.abs(tSec - wordMid);
  const proximity = Math.max(0, 1 - dist / bleedZone);
  // Smoothstep for organic ease-in/ease-out
  const eased = proximity * proximity * (3 - 2 * proximity);
  // Scale range: 1.0 (rest) → 1.10 (active peak). Subtle bump, not jarring.
  const waveScale = 1.0 + eased * 0.10;

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
    waveScale,
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
  // Active/spoken words = full brightness. Upcoming words = dimmed.
  // No entry fade, no exit fade. Hero directive decomp handled separately.
  let alpha: number;
  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (wordAnim.wordState === 'active') {
    alpha = 1.0;
  } else if (wordAnim.wordState === 'spoken') {
    alpha = 1.0;
  } else {
    // upcoming — visible but dimmed, not yet spoken
    alpha = 0.5;
  }

  alpha = Math.max(0, Math.min(1, alpha));

  // ── SCALE: center_word = no extra scale. Others = hero emphasis. ──
  // fitTextToViewport already sizes center_word to fill 88% of viewport.
  // Adding ANY scale on top causes overflow. Only non-center_word gets hero boost.
  const isCenterWord = wordAnim.centerWordScale > 1.01;
  const emphasisScale = isCenterWord ? 1.0 : wordAnim.heroScaleMult;
  // Wave scale: smooth time-based swell (computed in computeWordState)
  const waveScale = isCenterWord ? 1.0 : wordAnim.waveScale;
  let scaleX = emphasisScale * waveScale;
  let scaleY = emphasisScale * waveScale;

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
  // Clamp the final vertical travel so beat + reveal cannot destabilize readability.
  offsetY = Math.max(-WORD_OFFSET_Y_MAX, Math.min(WORD_OFFSET_Y_MAX, offsetY));

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
