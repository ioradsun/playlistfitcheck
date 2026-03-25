/**
 * PhraseAnimator.ts — Micro-bounce animation engine.
 *
 * ONE animation for all text: scale pulse + Y dip on every beat.
 * The ONLY thing that varies is amplitude.
 *
 * Three tiers:
 *   Normal word: 1.5% scale pulse, 1.5px Y dip
 *   Hero word: 4-12% scale pulse (duration-aware), 2-4px Y dip
 *   Suppressed neighbor: amplitude dampened when hero is active
 *
 * The hero feels big not because it moves MORE but because
 * everything around it moves LESS.
 */

import {
  type MotionCharacter,
  type AnimState,
  type CompiledPhraseGroup,
  type CompiledWord,
} from '@/lib/sceneCompiler';
import type { MotionProfile } from '@/engine/IntensityRouter';

// ─── Types ───────────────────────────────────────────────────

export interface AnimBeatState {
  pulse: number;
  phase: number;
}

export interface PhraseAnimState {
  composition: 'stack' | 'line' | 'center_word';
  bias: 'left' | 'center' | 'right';
  revealStyle: 'instant' | 'stagger_fast' | 'stagger_slow';
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
  energyTier: string;
  heroType: 'word' | 'phrase';
  groupStart: number;
  groupEnd: number;
  isEntering: boolean;
  entryProgress: number;
  isExiting: boolean;
  exitProgress: number;
  suppressExit: boolean;
  entryCharacter: MotionCharacter;
  exitCharacter: MotionCharacter | 'none';
  motionIntensity: number;
  presentationMode: string;
  ghostPreview: boolean;
  vibrateOnHold: boolean;
  elementalWash: boolean;
  entry: AnimState;
  exit: AnimState;
  biasEntryOffsetX: number;
  beatNudgeY: number;
  beatScale: number;
  staggerDelay: number;
  revealAnchor: number;
}

export interface WordAnimState {
  isRevealed: boolean;
  revealProgress: number;
  wordRevealTime: number;
  wordState: 'upcoming' | 'active' | 'spoken';
  spotlightAlpha: number;
  isHeroWord: boolean;
  effectiveHero: boolean;
  isSoloHero: boolean;
  heroScaleMult: number;
  heroOffsetX: number;
  heroOffsetY: number;
  soloHeroHidden: boolean;
  centerWordScale: number;
  revealRise: number;
  waveScale: number;
  ghostPreview: boolean;
  /** 0→1 — micro-bounce amplitude multiplier for this word */
  bounceAmplitude: number;
  /** 0→1 — how much this word is suppressed by a nearby active hero */
  heroSuppressionFactor: number;
}

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

// ─── Constants ───────────────────────────────────────────────

const WORD_FADE_SEC = 0.15;
const REVEAL_RISE_PX = 6;
const CENTER_WORD_SCALE = 1.0;

// Micro-bounce constants
const BASE_BOUNCE_SCALE = 0.015;   // 1.5% scale pulse for normal words
const BASE_BOUNCE_Y = 1.5;         // 1.5px Y dip for normal words
const BEAT_NUDGE_MAX = 4;          // hard clamp on Y travel

// ─── 1. Resolve active group ────────────────────────────────

export function resolveActiveGroup(
  groups: CompiledPhraseGroup[],
  tSec: number,
  cursor: number,
  prevTime: number,
): { activeIdx: number; cursor: number } {
  if (groups.length === 0) return { activeIdx: -1, cursor: 0 };
  if (tSec < prevTime - 0.5) cursor = 0;
  while (cursor < groups.length - 1) {
    if (tSec >= groups[cursor + 1].start) cursor++;
    else break;
  }
  return { activeIdx: cursor, cursor };
}

// ─── 2. Compute phrase state ────────────────────────────────

export function computePhraseState(
  group: CompiledPhraseGroup,
  nextGroupStart: number,
  tSec: number,
  beatState: AnimBeatState | null,
  canvasWidth: number,
  mp: MotionProfile,
): PhraseAnimState {
  const { composition, bias, revealStyle, holdClass, energyTier, heroType } = group;
  void nextGroupStart;

  const staggerDelay = group.staggerDelay ?? 0;
  const noMotion: AnimState = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };

  // ── Micro-bounce: head-nod Y nudge ──
  const rawPulse = beatState?.pulse ?? 0;
  const phase = beatState?.phase ?? 0;
  const pulse = Math.pow(Math.max(0, Math.min(1, rawPulse)), 0.6);
  // Asymmetric nod: fast attack on downbeat, slow float back up
  const nodCurve = Math.pow(Math.max(0, 1 - phase), 2.5);
  const chorusRepeat = (group as any).chorusRepeat ?? 0;
  const chorusMult = chorusRepeat > 0 ? [1.0, 1.15, 1.3, 1.45][Math.min(chorusRepeat - 1, 3)] : 1.0;
  const nodMult = mp.textNodMult;
  const beatNudgeY = Math.min(
    BEAT_NUDGE_MAX * nodMult,
    pulse * nodCurve * 2.0 * chorusMult * nodMult,
  );
  const beatScale = Math.min(1.015, 1.0 + pulse * 0.008 * chorusMult * nodMult);

  return {
    composition, bias, revealStyle, holdClass, energyTier, heroType,
    groupStart: group.start,
    groupEnd: group.end,
    isEntering: false, entryProgress: 1,
    isExiting: false, exitProgress: 0, suppressExit: true,
    entryCharacter: 'drift' as MotionCharacter,
    exitCharacter: 'none',
    motionIntensity: 0.7,
    presentationMode: group.presentationMode ?? 'horiz_center',
    ghostPreview: group.ghostPreview ?? false,
    vibrateOnHold: false,  // vibrate removed — micro-bounce replaces it
    elementalWash: false,  // wash removed
    entry: noMotion, exit: noMotion,
    biasEntryOffsetX: 0,
    beatNudgeY, beatScale,
    staggerDelay,
    revealAnchor: group.start,
  };
}

// ─── 3. Compute per-word state ──────────────────────────────

export function computeWordState(
  word: CompiledWord,
  wordIndex: number,
  group: CompiledPhraseGroup,
  phrase: PhraseAnimState,
  tSec: number,
  groupHasActiveSoloHero: boolean,
  canvasWidth: number,
  canvasHeight: number,
  mp: MotionProfile,
  activeHeroWordIndex: number,
): WordAnimState {
  // ── Reveal timing ──
  let wordRevealTime: number;
  if (phrase.staggerDelay < 0.005) {
    wordRevealTime = phrase.revealAnchor;
  } else {
    wordRevealTime = phrase.revealAnchor + wordIndex * phrase.staggerDelay;
  }
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

  const spotlightAlpha = wordState === 'active' ? 1.0 : wordState === 'spoken' ? 1.0 : 0.5;

  // ── Hero detection ──
  const isHeroWord = word.isHeroWord === true;
  const effectiveHero = phrase.heroType === 'phrase' ? true : isHeroWord;
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && (word.wordDuration ?? 0) >= 0.5;
  const soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  // ── Hero scale: duration-aware ──
  const emp = word.emphasisLevel ?? 0;
  let heroScaleMult = 1.0;
  if (effectiveHero && !isSoloHero) {
    const heroDurSec = Math.max(0.05, nextWordStart - wordStart);
    const heroProgress = Math.max(0, Math.min(1, (tSec - wordStart) / heroDurSec));

    let heroPeak: number;
    let heroRampFrac: number;
    if (heroDurSec < 0.5) { heroPeak = 1.06; heroRampFrac = 0.4; }
    else if (heroDurSec < 1.0) { heroPeak = 1.12; heroRampFrac = 0.5; }
    else { heroPeak = 1.18; heroRampFrac = 0.6; }

    const empMult = 0.5 + Math.min(1, Math.max(0, emp - 1) * 0.25);
    const targetScale = 1.0 + (heroPeak - 1.0) * empMult * mp.textHeroMult;

    let envelope: number;
    if (heroProgress <= 0) envelope = 0;
    else if (heroProgress < heroRampFrac) {
      const rampT = heroProgress / heroRampFrac;
      envelope = 1 - Math.pow(1 - rampT, 2.5);
    } else if (heroProgress < 0.85) envelope = 1.0;
    else {
      const settleT = (heroProgress - 0.85) / 0.15;
      envelope = 1.0 - settleT * 0.3;
    }
    heroScaleMult = 1.0 + (targetScale - 1.0) * Math.max(0, envelope);
  }

  // Solo hero offset
  let heroOffsetX = 0;
  let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
    heroScaleMult = Math.max(heroScaleMult, 1.35);
  }

  const centerWordScale = phrase.composition === 'center_word' ? CENTER_WORD_SCALE : 1.0;

  // ── Reveal rise ──
  let revealRise = 0;
  if (!phrase.ghostPreview && phrase.staggerDelay >= 0.005) {
    revealRise = isRevealed ? (1 - revealProgress) * REVEAL_RISE_PX : REVEAL_RISE_PX;
  }

  // ── Wave scale ──
  const wordMid = (wordStart + nextWordStart) / 2;
  const wordHalfDur = Math.max(0.05, (nextWordStart - wordStart) / 2);
  const bleedZone = wordHalfDur + 0.15;
  const dist = Math.abs(tSec - wordMid);
  const proximity = Math.max(0, 1 - dist / bleedZone);
  const eased = proximity * proximity * (3 - 2 * proximity);
  const waveScale = 1.0 + eased * 0.10 * mp.textWaveMult;

  // ── Micro-bounce amplitude ──
  // Hero words get bigger bounce. Duration determines how big.
  let bounceAmplitude = BASE_BOUNCE_SCALE; // normal word: 1.5%
  if (effectiveHero && wordState === 'active') {
    const heroDurSec = Math.max(0.05, nextWordStart - wordStart);
    if (heroDurSec < 0.5) bounceAmplitude = 0.04;
    else if (heroDurSec < 1.0) bounceAmplitude = 0.08;
    else bounceAmplitude = 0.12;
  }

  // ── Hero suppression field ──
  // When a hero word is active, neighbors get dampened.
  // The hero feels big because everything around it moves LESS.
  let heroSuppressionFactor = 1.0;
  if (activeHeroWordIndex >= 0 && wordIndex !== activeHeroWordIndex) {
    const wordDist = Math.abs(wordIndex - activeHeroWordIndex);
    // Adjacent: 0.3x. 2 away: 0.65x. 3+: 1.0x (no suppression)
    heroSuppressionFactor = Math.min(1.0, 0.3 + (wordDist - 1) * 0.35);
  }

  return {
    isRevealed, revealProgress, wordRevealTime,
    wordState, spotlightAlpha,
    isHeroWord, effectiveHero, isSoloHero,
    heroScaleMult, heroOffsetX, heroOffsetY, soloHeroHidden,
    centerWordScale, revealRise, waveScale,
    ghostPreview: phrase.ghostPreview,
    bounceAmplitude,
    heroSuppressionFactor,
  };
}

// ─── 4. Final chunk animation ───────────────────────────────

export function computeChunkAnim(
  word: CompiledWord,
  phrase: PhraseAnimState,
  wordAnim: WordAnimState,
  beatPhase: number,
  intensity: number,
): ChunkAnimState {
  void word;

  // ── Alpha: reveal-gated ──
  let alpha: number;
  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (!wordAnim.isRevealed) {
    alpha = wordAnim.ghostPreview ? 0.15 : 0;
  } else if (wordAnim.wordState === 'active') {
    alpha = 1.0;
  } else if (wordAnim.wordState === 'spoken') {
    alpha = 1.0;
  } else {
    alpha = 0.5; // upcoming
  }
  if (wordAnim.isRevealed && wordAnim.revealProgress < 1.0) {
    alpha *= wordAnim.revealProgress;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  // ── Micro-bounce: one curve, amplitude varies ──
  const beatAttack = Math.pow(Math.max(0, 1 - beatPhase), 2.5);
  const amp = wordAnim.bounceAmplitude * intensity * wordAnim.heroSuppressionFactor;
  const bounce = beatAttack * amp;

  // ── Scale: hero emphasis + wave + bounce ──
  const isCenterWord = wordAnim.centerWordScale > 1.01;
  const emphasisScale = isCenterWord ? 1.0 : wordAnim.heroScaleMult;
  const waveScale = isCenterWord ? 1.0 : wordAnim.waveScale;
  let scaleX = emphasisScale * waveScale * (1.0 + bounce);
  let scaleY = emphasisScale * waveScale * (1.0 + bounce);
  scaleX *= phrase.beatScale;
  scaleY *= phrase.beatScale;

  // ── Position: hero offset + beat nod + reveal rise + bounce dip ──
  let offsetX = wordAnim.heroOffsetX;
  let offsetY = wordAnim.heroOffsetY
    + phrase.beatNudgeY
    + wordAnim.revealRise
    - bounce * 100; // converts 0.015 scale → ~1.5px dip
  offsetY = Math.max(-12, Math.min(12, offsetY));

  return {
    alpha, scaleX, scaleY, offsetX, offsetY,
    rotation: 0, skewX: 0,
    visible: alpha > 0.01,
  };
}

// ─── 5. Detect solo hero ────────────────────────────────────

export function detectSoloHero(group: CompiledPhraseGroup, tSec: number): boolean {
  void tSec;
  if (group.words.length !== 1) return false;
  const word = group.words[0];
  if (!word.isHeroWord) return false;
  return (word.wordDuration ?? 0) >= 0.5;
}

// ─── 6. Find active hero word in phrase ─────────────────────

export function findActiveHeroWordIndex(group: CompiledPhraseGroup, tSec: number): number {
  for (let i = 0; i < group.words.length; i++) {
    const w = group.words[i];
    if (!w.isHeroWord) continue;
    const ws = w.wordStart ?? group.start;
    const nextWs = i + 1 < group.words.length
      ? (group.words[i + 1].wordStart ?? group.end) : group.end;
    if (tSec >= ws && tSec < nextWs) return i;
  }
  return -1;
}
