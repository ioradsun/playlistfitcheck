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

const WORD_FADE_SEC = 0.08; // per-word fade-in after stagger reveal
const REVEAL_ANTICIPATION = 0.1; // 100ms before group.start
const CENTER_WORD_SCALE = 1.4;
const BEAT_NUDGE_BASE = 3; // px base beat nudge Y
const BEAT_SCALE_BASE = 1.0; // base scale (1.0 = no beat effect)
const BEAT_SCALE_MULT = 0.04; // max beat scale addition

/** Motion cap for word count — limits motion magnitude for dense phrases */
function motionCap(wordCount: number): number {
  return wordCount > 5 ? 0.5 : wordCount > 3 ? 0.75 : 1.0;
}

// ─────────────────────────────────────────
// Energy tier → motion character mapping
// ─────────────────────────────────────────

function resolveEntryCharacter(energyTier: string, sectionDefault: MotionCharacter): MotionCharacter {
  switch (energyTier) {
    case 'intimate':
      return 'whisper';
    case 'lift':
      return 'rise';
    case 'impact':
      return 'snap';
    case 'surprise':
      return 'bloom';
    case 'groove':
      return sectionDefault;
    default:
      return sectionDefault;
  }
}

function resolveExitCharacter(energyTier: string, sectionDefault: MotionCharacter): MotionCharacter | 'none' {
  switch (energyTier) {
    case 'intimate':
      return 'whisper';
    case 'lift':
      return 'drift';
    case 'impact':
      return 'none'; // no exit — hard cut
    case 'surprise':
      return 'snap';
    case 'groove':
      return sectionDefault;
    default:
      return sectionDefault;
  }
}

function resolveMotionIntensity(energyTier: string, sectionDefault: number): number {
  switch (energyTier) {
    case 'intimate':
      return 0.3;
    case 'lift':
      return sectionDefault * 0.8;
    case 'impact':
      return 1.0;
    case 'surprise':
      return 0.9;
    case 'groove':
      return sectionDefault;
    default:
      return sectionDefault;
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

  // ── Entry/exit timing ──
  const groupEntryDur = group.entryDuration ?? moodConfig.entryDuration;
  const groupExitDur = group.exitDuration ?? moodConfig.exitDuration;
  const phraseDuration = Math.max(0.01, group.end - group.start);
  const staggerDelay = group.staggerDelay ?? 0;
  const entryPad = group.words.length * (staggerDelay || 0.05) + 0.2;
  const timeSinceActivation = tSec - (group.start - entryPad);
  const phraseRemaining = groupEnd - tSec;

  const isEntering = timeSinceActivation >= 0 && timeSinceActivation < groupEntryDur;
  const entryProgress = isEntering
    ? Math.min(1, timeSinceActivation / Math.max(0.01, groupEntryDur))
    : timeSinceActivation >= groupEntryDur
      ? 1
      : 0;

  // ── Motion character from energyTier ──
  const entryCharacter = resolveEntryCharacter(energyTier, moodConfig.character);
  const exitCharacter = resolveExitCharacter(energyTier, moodConfig.character);
  const suppressExit = exitCharacter === 'none';
  const motionIntensity = resolveMotionIntensity(energyTier, moodConfig.intensity);

  const phraseExitDuration = Math.min(groupExitDur, phraseDuration * 0.35);
  const isExiting = !suppressExit && phraseRemaining < phraseExitDuration && phraseRemaining >= 0;
  const exitProgress = isExiting
    ? Math.min(1, 1 - phraseRemaining / Math.max(0.01, phraseExitDuration))
    : 0;

  // ── Compute entry transform ──
  const cap = motionCap(group.words.length);
  let entry: AnimState;
  if (isEntering) {
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
  if (bias === 'left') biasEntryOffsetX = -canvasWidth * 0.12;
  else if (bias === 'right') biasEntryOffsetX = canvasWidth * 0.12;

  // ── Beat response ──
  const pulse = beatState?.pulse ?? 0;
  const beatNudgeY = pulse * BEAT_NUDGE_BASE;
  const beatScale = BEAT_SCALE_BASE + pulse * BEAT_SCALE_MULT;

  // ── Reveal anchor ──
  const revealAnchor = group.start - REVEAL_ANTICIPATION;

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

  // ── Spotlight alpha ──
  let spotlightAlpha: number;
  if (!isRevealed) {
    spotlightAlpha = 0; // not yet revealed — invisible
  } else if (wordState === 'upcoming') {
    spotlightAlpha = 0.3 * revealProgress; // upcoming but revealed — dim, fading in
  } else {
    spotlightAlpha = revealProgress; // active or spoken — full (after reveal fade)
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

  // ── ALPHA: priority chain ──
  let alpha: number;

  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (!wordAnim.isRevealed) {
    alpha = 0;
  } else if (phrase.isEntering) {
    // Motion character's OWN alpha curve. NOT multiplied by phraseAlpha.
    // slam: instant pop. whisper: slow fade. bloom: quick scale-up.
    // The character designs its alpha. We respect it.
    alpha = phrase.entry.alpha * wordAnim.revealProgress * wordAnim.spotlightAlpha;
  } else if (phrase.isExiting && !phrase.suppressExit) {
    alpha = phrase.exit.alpha * wordAnim.spotlightAlpha;
  } else {
    // Active hold — just spotlight
    alpha = wordAnim.spotlightAlpha;
  }

  alpha = Math.max(0, Math.min(1, alpha));

  // ── SCALE ──
  let scaleX = 1.0;
  let scaleY = 1.0;

  // Composition: center_word boost
  scaleX *= wordAnim.centerWordScale;
  scaleY *= wordAnim.centerWordScale;

  // Entry motion scale
  if (phrase.isEntering) {
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

  // Bias entry slide (eases from offset to 0 during entry)
  if (phrase.isEntering && phrase.biasEntryOffsetX !== 0) {
    offsetX += phrase.biasEntryOffsetX * (1 - phrase.entryProgress);
  }

  // Entry motion offset
  if (phrase.isEntering) {
    offsetX += phrase.entry.offsetX;
    offsetY += phrase.entry.offsetY;
  }

  // Exit motion offset
  if (phrase.isExiting && !phrase.suppressExit) {
    offsetX += phrase.exit.offsetX;
    offsetY += phrase.exit.offsetY;
  }

  // Hero centering offset
  offsetX += wordAnim.heroOffsetX;
  offsetY += wordAnim.heroOffsetY;

  // Beat nudge
  offsetY += phrase.beatNudgeY;

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
