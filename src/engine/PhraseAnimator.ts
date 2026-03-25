/**
 * PhraseAnimator.ts — Typewriter reveal + cinematic push-in.
 *
 * All visible text is alpha 1.0. No dimming. No spotlight. No suppression.
 * Stagger reveal = words pop in one by one at full brightness.
 * Ghost preview = all words visible at full brightness from start.
 * Long phrases (>1s) get a slow push-in: 1.0 → 1.02 zoom over duration.
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
  /** 1.0 → 1.02 slow zoom for phrases held >1s */
  pushInScale: number;
}

export interface WordAnimState {
  isRevealed: boolean; revealProgress: number; wordRevealTime: number;
  wordState: 'upcoming' | 'active' | 'spoken'; spotlightAlpha: number;
  isHeroWord: boolean; effectiveHero: boolean; isSoloHero: boolean;
  heroScaleMult: number; heroOffsetX: number; heroOffsetY: number;
  soloHeroHidden: boolean; centerWordScale: number; revealRise: number;
  waveScale: number; ghostPreview: boolean;
  bounceAmplitude: number; heroSuppressionFactor: number;
  heroSuppressed: boolean;
}

export interface ChunkAnimState {
  alpha: number; scaleX: number; scaleY: number;
  offsetX: number; offsetY: number; rotation: number; skewX: number;
  visible: boolean;
}

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
  void nextGroupStart; void canvasWidth; void mp; void beatState;
  const staggerDelay = group.staggerDelay ?? 0;
  const noMotion: AnimState = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, alpha: 1, skewX: 0, glowMult: 0, blur: 0, rotation: 0 };

  // ── Slow push-in for phrases held >1 second ──
  // Like a camera slowly pushing in on the dialogue.
  // 1.0 → 1.02 over the phrase duration. Ease-out (fast start, gentle settle).
  const phraseDur = Math.max(0.01, group.end - group.start);
  let pushInScale = 1.0;
  if (phraseDur >= 1.0) {
    const elapsed = Math.max(0, tSec - group.start);
    const progress = Math.min(1, elapsed / phraseDur);
    // Ease-out: sqrt curve — fast early, settles toward end
    const eased = Math.sqrt(progress);
    pushInScale = 1.0 + eased * 0.02;
  }

  return {
    composition, bias, revealStyle, holdClass, energyTier, heroType,
    groupStart: group.start, groupEnd: group.end,
    isEntering: false, entryProgress: 1, isExiting: false, exitProgress: 0, suppressExit: true,
    entryCharacter: 'drift' as MotionCharacter, exitCharacter: 'none',
    motionIntensity: 0, presentationMode: group.presentationMode ?? 'horiz_center',
    ghostPreview: group.ghostPreview ?? false, vibrateOnHold: false, elementalWash: false,
    entry: noMotion, exit: noMotion, biasEntryOffsetX: 0,
    beatNudgeY: 0, beatScale: 1.0,
    staggerDelay, revealAnchor: group.start,
    pushInScale,
  };
}

// ─── 3. Per-word state ──────────────────────────────────────
export function computeWordState(
  word: CompiledWord, wordIndex: number, group: CompiledPhraseGroup,
  phrase: PhraseAnimState, tSec: number, groupHasActiveSoloHero: boolean,
  canvasWidth: number, canvasHeight: number, mp: MotionProfile, activeHeroWordIndex: number,
): WordAnimState {
  void mp; void activeHeroWordIndex;

  // ── Reveal timing (stagger only — no fade, instant pop) ──
  // Use actual Whisper word timestamp for reveal — exact sync with audio.
  // Ghost preview (staggerDelay=0): all words revealed from group start.
  // Stagger reveal: each word appears at its actual spoken time.
  const wordRevealTime = phrase.staggerDelay < 0.005
    ? phrase.revealAnchor
    : word.wordStart ?? phrase.revealAnchor;
  const isRevealed = tSec >= wordRevealTime;

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

  // ── Hero detection (for solo centering only) ──
  const isHeroWord = word.isHeroWord === true;
  const effectiveHero = phrase.heroType === 'phrase' ? true : isHeroWord;
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && (word.wordDuration ?? 0) >= 0.5;
  const soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  // Solo hero offset (center screen) — no extra scale
  let heroOffsetX = 0; let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
  }

  return {
    isRevealed, revealProgress: isRevealed ? 1 : 0, wordRevealTime,
    wordState, spotlightAlpha: 1.0,
    isHeroWord, effectiveHero, isSoloHero,
    heroScaleMult: 1.0, heroOffsetX, heroOffsetY, soloHeroHidden,
    centerWordScale: 1.0, revealRise: 0,
    waveScale: 1.0, ghostPreview: phrase.ghostPreview,
    bounceAmplitude: 0, heroSuppressionFactor: 1.0,
    heroSuppressed: false,
  };
}

// ─── 4. Final chunk animation ───────────────────────────────
export function computeChunkAnim(
  word: CompiledWord, phrase: PhraseAnimState, wordAnim: WordAnimState,
  beatPhase: number, intensity: number,
): ChunkAnimState {
  void word; void beatPhase; void intensity;

  // ── Alpha: binary. Visible = 1.0. Not visible = 0. ──
  let alpha: number;
  if (wordAnim.soloHeroHidden) {
    alpha = 0;
  } else if (!wordAnim.isRevealed) {
    // Stagger: invisible until reveal time
    // Ghost preview: all words revealed from start (staggerDelay = 0), so this = 0
    alpha = 0;
  } else {
    // Visible = full brightness. Always. No dimming. No spotlight.
    alpha = 1.0;
  }

  // ── Scale: phrase-level push-in only ──
  const scale = phrase.pushInScale;

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
