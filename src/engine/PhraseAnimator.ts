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
  computeMotionEntry,
  computeMotionExit,
  type CompiledPhraseGroup,
  type CompiledWord,
} from '@/lib/sceneCompiler';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

/** Mood config subset — only the fields PhraseAnimator needs */
export interface AnimMoodConfig {
  character: MotionCharacter;
  intensity: number;
  entryDuration: number;
  exitDuration: number;
}

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

  // Entry motion result (from computeMotionEntry)
  entry: AnimState;

  // Exit motion result (from computeMotionExit)
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
const CENTER_WORD_SCALE = 1.8; // EXTREME: center_word is huge
const BEAT_NUDGE_BASE = 8; // EXTREME: visible bounce
const BEAT_SCALE_BASE = 1.0; // base scale (1.0 = no beat effect)
const BEAT_SCALE_MULT = 0.08; // EXTREME: visible pulse

// ── Per-mode timing: self-contained, no moodConfig dependency ──
// Each mode type defines its own entry/exit duration and intensity.
// These are tuned for VISIBLE motion at each mode's character.
const MODE_TIMING: Record<string, { entryDur: number; exitDur: number; intensity: number }> = {
  // HORIZONTAL REVEAL: stagger is the entry, but phrase needs time to settle
  horizontal: { entryDur: 0.5, exitDur: 0.35, intensity: 0.8 },
  // VERTICAL STACK: slower reveal, deliberate pacing
  stack:      { entryDur: 0.6, exitDur: 0.4,  intensity: 0.7 },
  // GHOST PREVIEW: whisper fade-in, gentle exit
  ghost:      { entryDur: 0.5, exitDur: 0.4,  intensity: 0.5 },
  // VIBRATE DISSOLVE: bloom entry, no exit (dissolves)
  vibrate:    { entryDur: 0.4, exitDur: 0.0,  intensity: 0.9 },
  // ELEMENTAL WASH: snap in (instant), no exit (decomps)
  wash:       { entryDur: 0.1, exitDur: 0.0,  intensity: 1.0 },
  // IMPACT CUT: snap in, no exit
  impact:     { entryDur: 0.05, exitDur: 0.0, intensity: 1.0 },
  // HORIZ DRIFT variant: longer entry for the rise
  horiz_drift:{ entryDur: 0.6, exitDur: 0.35, intensity: 0.8 },
};

function getModeTiming(presentationMode: string | undefined): { entryDur: number; exitDur: number; intensity: number } | null {
  if (!presentationMode) return null;
  // Extract base mode from variant name (e.g., 'horiz_left' → 'horizontal', 'stack_center' → 'stack')
  if (presentationMode === 'horiz_drift') return MODE_TIMING.horiz_drift;
  if (presentationMode.startsWith('horiz')) return MODE_TIMING.horizontal;
  if (presentationMode.startsWith('stack')) return MODE_TIMING.stack;
  if (presentationMode.startsWith('ghost')) return MODE_TIMING.ghost;
  if (presentationMode.startsWith('vibrate')) return MODE_TIMING.vibrate;
  if (presentationMode.startsWith('wash')) return MODE_TIMING.wash;
  if (presentationMode.startsWith('impact')) return MODE_TIMING.impact;
  return null; // ai_moment or unknown → use moodConfig fallback
}

/** Motion cap for word count — limits motion magnitude for dense phrases */
function motionCap(wordCount: number): number {
  return 1.0; // EXTREME: full motion for all word counts
}

// ─────────────────────────────────────────
// Energy tier → motion character mapping
// ─────────────────────────────────────────

function resolveEntryCharacter(group: CompiledPhraseGroup, moodConfig: AnimMoodConfig): MotionCharacter {
  // Presentation mode specifies entry character directly
  if (group.entryCharacter) {
    return group.entryCharacter as MotionCharacter;
  }
  // Fallback: energyTier mapping (for AI moments without entryCharacter)
  switch (group.energyTier) {
    case 'intimate':
      return 'whisper';
    case 'lift':
      return 'rise';
    case 'impact':
      return 'snap';
    case 'surprise':
      return 'bloom';
    default:
      return moodConfig.character;
  }
}

function resolveExitCharacter(group: CompiledPhraseGroup, moodConfig: AnimMoodConfig): MotionCharacter | 'none' {
  if (group.exitCharacter) {
    return group.exitCharacter as MotionCharacter | 'none';
  }
  switch (group.energyTier) {
    case 'intimate':
      return 'whisper';
    case 'lift':
      return 'drift';
    case 'impact':
      return 'none';
    case 'surprise':
      return 'snap';
    default:
      return moodConfig.character;
  }
}

function resolveMotionIntensity(group: CompiledPhraseGroup, sectionDefault: number): number {
  // Presentation mode: self-contained intensity
  const modeTiming = getModeTiming(group.presentationMode);
  if (modeTiming) return modeTiming.intensity;

  // AI moment fallback
  switch (group.energyTier) {
    case 'intimate':  return 0.3;
    case 'lift':      return sectionDefault * 0.8;
    case 'impact':    return 1.0;
    case 'surprise':  return 0.9;
    default:          return sectionDefault;
  }
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

  // Advance cursor: move forward when next group's entry window begins
  while (cursor < groups.length - 1) {
    const next = groups[cursor + 1];
    const nextEntryPad = next.words.length * (next.staggerDelay ?? 0.05) + 0.2;
    const nextVisStart = next.start - nextEntryPad;
    if (tSec >= nextVisStart) {
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
  moodConfig: AnimMoodConfig,
  beatState: AnimBeatState | null,
  canvasWidth: number,
): PhraseAnimState {
  const { composition, bias, revealStyle, holdClass, energyTier, heroType } = group;

  // ── Group end: extended by holdClass ──
  let groupEnd: number;
  if (holdClass === 'long_emotional') {
    groupEnd = Math.max(nextGroupStart, group.end + 0.8);
  } else {
    groupEnd = nextGroupStart;
  }

  // ── Entry/exit timing: mode-specific or moodConfig fallback ──
  const phraseDuration = Math.max(0.01, group.end - group.start);
  const staggerDelay = group.staggerDelay ?? 0;
  const entryPad = group.words.length * (staggerDelay || 0.05) + 0.2;
  const modeTiming = getModeTiming(group.presentationMode);
  const groupEntryDur = modeTiming
    ? modeTiming.entryDur   // self-contained: mode defines its own timing
    : Math.max(0.3, group.entryDuration ?? moodConfig.entryDuration);
  const groupExitDur = modeTiming
    ? modeTiming.exitDur
    : Math.max(0.25, group.exitDuration ?? moodConfig.exitDuration);
  const timeSinceActivation = tSec - (group.start - entryPad);
  const phraseRemaining = groupEnd - tSec;

  const isEntering = timeSinceActivation >= 0 && timeSinceActivation < groupEntryDur;
  const entryProgress = isEntering
    ? Math.min(1, timeSinceActivation / Math.max(0.01, groupEntryDur))
    : timeSinceActivation >= groupEntryDur
      ? 1
      : 0;

  // ── Motion character from energyTier ──
  const entryCharacter = resolveEntryCharacter(group, moodConfig);
  const exitCharacter = resolveExitCharacter(group, moodConfig);
  const suppressExit = exitCharacter === 'none';
  const motionIntensity = resolveMotionIntensity(group, moodConfig.intensity);
  const pMode = group.presentationMode ?? '';
  const isRevealMode = pMode.startsWith('horiz') || pMode.startsWith('stack');

  const phraseExitDuration = Math.min(groupExitDur, phraseDuration * 0.35);
  const isExiting = !suppressExit && phraseRemaining < phraseExitDuration && phraseRemaining >= 0;
  const exitProgress = isExiting
    ? Math.min(1, 1 - phraseRemaining / Math.max(0.01, phraseExitDuration))
    : 0;

  // ── Compute entry transform ──
  // For reveal modes: suppress phrase-level motion. The per-word stagger IS the entry.
  // For all-at-once modes: phrase-level entry motion plays normally.
  const cap = motionCap(group.words.length);
  let entry: AnimState;
  if (isEntering && !isRevealMode) {
    entry = computeMotionEntry(entryCharacter, entryProgress, motionIntensity);
    entry = {
      ...entry,
      offsetX: entry.offsetX * cap,
      offsetY: entry.offsetY * cap,
      blur: Math.min(0.3, entry.blur),
    };
  } else {
    entry = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }

  // ── Compute exit transform ──
  let exit: AnimState;
  if (isExiting && !suppressExit) {
    exit = computeMotionExit(exitCharacter as MotionCharacter, exitProgress, motionIntensity);
    exit = {
      ...exit,
      offsetX: exit.offsetX * cap,
      offsetY: exit.offsetY * cap,
      blur: Math.min(0.3, exit.blur),
    };
  } else {
    exit = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };
  }

  // ── Bias-driven entry slide ──
  let biasEntryOffsetX = 0;
  if (bias === 'left') biasEntryOffsetX = -canvasWidth * 0.25;  // EXTREME: slides from 25% offscreen
  else if (bias === 'right') biasEntryOffsetX = canvasWidth * 0.25;

  // ── Beat response ──
  const pulse = beatState?.pulse ?? 0;
  const beatNudgeY = pulse * BEAT_NUDGE_BASE;
  const beatScale = BEAT_SCALE_BASE + pulse * BEAT_SCALE_MULT;

  // ── Reveal anchor: mode-aware ──
  const revealAnchor = isRevealMode
    ? group.start                   // stagger begins at first word
    : group.start - entryPad;       // visible during entry motion

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
    entryCharacter,
    exitCharacter,
    motionIntensity,
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

  // ── Spotlight alpha: mode-aware ──
  const mode = phrase.presentationMode ?? '';
  const isRevealMode = mode.startsWith('horiz') || mode.startsWith('stack');
  const isImpactOrWashOrVibrate = mode.startsWith('impact') || mode.startsWith('wash') || mode.startsWith('vibrate');

  let spotlightAlpha: number;
  if (phrase.ghostPreview) {
    // GHOST: all words visible. Active pops. Spoken settles.
    if (wordState === 'active') spotlightAlpha = 1.0;
    else if (wordState === 'spoken') spotlightAlpha = 0.80;
    else spotlightAlpha = 0.20;

  } else if (isRevealMode) {
    // REVEAL: invisible until stagger, then full.
    if (!isRevealed) spotlightAlpha = 0;
    else if (wordState === 'active') spotlightAlpha = 1.0;
    else if (wordState === 'spoken') spotlightAlpha = 0.65;
    else spotlightAlpha = revealProgress;

  } else if (isImpactOrWashOrVibrate) {
    // IMPACT/WASH/VIBRATE: all words fully visible immediately.
    spotlightAlpha = 1.0;

  } else {
    // Fallback (ai_moment, unknown modes)
    if (!isRevealed) {
      spotlightAlpha = 0;
    } else if (wordState === 'upcoming') {
      spotlightAlpha = 0.30 * revealProgress;
    } else {
      spotlightAlpha = revealProgress;
    }
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
    heroScaleMult = 1.0 + Math.max(0, emp - 1) * 0.15;
  }

  // Solo hero offset (center screen)
  let heroOffsetX = 0;
  let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
    heroScaleMult = Math.max(heroScaleMult, 1.3);
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

  // ── ALPHA: mode-aware, no accidental zeroing ──
  let alpha: number;
  const mode = phrase.presentationMode ?? '';
  const isRevealMode = mode.startsWith('horiz') || mode.startsWith('stack');

  if (wordAnim.soloHeroHidden) {
    alpha = 0;

  } else if (isRevealMode) {
    // REVEAL MODES: stagger controls visibility. Words invisible until revealed.
    if (!wordAnim.isRevealed) {
      alpha = 0;
    } else if (wordAnim.wordState === 'active') {
      alpha = 1.0;
    } else if (wordAnim.wordState === 'spoken') {
      alpha = 0.65;
    } else {
      alpha = wordAnim.revealProgress;
    }

  } else if (phrase.ghostPreview) {
    // GHOST: all words visible from start. No revealProgress gate.
    if (phrase.isEntering) {
      const baseAlpha = wordAnim.wordState === 'active' ? 1.0
        : wordAnim.wordState === 'spoken' ? 0.8 : 0.2;
      alpha = phrase.entry.alpha * baseAlpha;
    } else if (phrase.isExiting && !phrase.suppressExit) {
      alpha = phrase.exit.alpha * wordAnim.spotlightAlpha;
    } else {
      alpha = wordAnim.spotlightAlpha;
    }

  } else {
    // IMPACT / WASH / VIBRATE / AI_MOMENT:
    // All words visible. Entry alpha = character's own curve.
    // NO revealProgress multiplication.
    if (phrase.isEntering) {
      alpha = phrase.entry.alpha * wordAnim.spotlightAlpha;
    } else if (phrase.isExiting && !phrase.suppressExit) {
      alpha = phrase.exit.alpha * wordAnim.spotlightAlpha;
    } else {
      alpha = wordAnim.spotlightAlpha;
    }
  }

  alpha = Math.max(0, Math.min(1, alpha));

  // ── SCALE ──
  let scaleX = 1.0;
  let scaleY = 1.0;

  // Composition: center_word boost
  scaleX *= wordAnim.centerWordScale;
  scaleY *= wordAnim.centerWordScale;

  // Entry motion scale (not for reveal modes)
  if (phrase.isEntering && !isRevealMode) {
    scaleX *= phrase.entry.scaleX;
    scaleY *= phrase.entry.scaleY;
  }

  // Exit motion scale
  if (phrase.isExiting && !phrase.suppressExit) {
    scaleX *= phrase.exit.scaleX;
    scaleY *= phrase.exit.scaleY;
  }

  // Hero emphasis
  scaleX *= wordAnim.heroScaleMult;
  scaleY *= wordAnim.heroScaleMult;

  // Beat
  scaleX *= phrase.beatScale;
  scaleY *= phrase.beatScale;

  // ── POSITION OFFSET ──
  let offsetX = 0;
  let offsetY = 0;

  // For reveal modes: no phrase-level entry motion (stagger IS the entry)
  if (!isRevealMode) {
    // Bias entry slide (eases from offset to 0 during entry)
    if (phrase.isEntering && phrase.biasEntryOffsetX !== 0) {
      offsetX += phrase.biasEntryOffsetX * (1 - phrase.entryProgress);
    }

    // Entry motion offset
    if (phrase.isEntering) {
      offsetX += phrase.entry.offsetX;
      offsetY += phrase.entry.offsetY;
    }
  }

  // Exit motion offset (applies to all modes)
  if (phrase.isExiting && !phrase.suppressExit) {
    offsetX += phrase.exit.offsetX;
    offsetY += phrase.exit.offsetY;
  }

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
