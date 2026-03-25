/**
 * PhraseAnimator.ts — Simplest possible lyric engine.
 *
 * All words visible at alpha 1.0. No reveal. No stagger. No dimming.
 * Traveling wave scale = reading cursor. Beat nod syncs with background. Push-in for long holds.
 */
import { type CompiledPhraseGroup, type CompiledWord } from '@/lib/sceneCompiler';
import type { MotionProfile } from '@/engine/IntensityRouter';

export interface PhraseAnimState {
  groupStart: number;
  groupEnd: number;
  heroType: 'word' | 'phrase';
  pushInScale: number;
}

export interface WordAnimState {
  wordState: 'upcoming' | 'active' | 'spoken';
  waveScale: number;
  isSoloHero: boolean;
  soloHeroHidden: boolean;
  heroOffsetX: number;
  heroOffsetY: number;
}

export interface ChunkAnimState {
  alpha: number; scaleX: number; scaleY: number;
  offsetX: number; offsetY: number; rotation: number; skewX: number;
  visible: boolean;
}

export interface AnimBeatState { pulse: number; phase: number; }

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
  void nextGroupStart;
  void beatState;
  void canvasWidth;
  void mp;

  const phraseDur = Math.max(0.01, group.end - group.start);
  let pushInScale = 1.0;
  if (phraseDur >= 1.0) {
    const elapsed = Math.max(0, tSec - group.start);
    const progress = Math.min(1, elapsed / phraseDur);
    pushInScale = 1.0 + Math.sqrt(progress) * 0.02;
  }

  return {
    groupStart: group.start,
    groupEnd: group.end,
    heroType: group.heroType ?? 'word',
    pushInScale,
  };
}

// ─── 3. Per-word state ──────────────────────────────────────
export function computeWordState(
  word: CompiledWord, wordIndex: number, group: CompiledPhraseGroup,
  tSec: number, groupHasActiveSoloHero: boolean,
  canvasWidth: number, canvasHeight: number,
): WordAnimState {
  const state: WordAnimState = {
    wordState: 'upcoming',
    waveScale: 1.0,
    isSoloHero: false,
    soloHeroHidden: false,
    heroOffsetX: 0,
    heroOffsetY: 0,
  };
  computeWordStateInto(
    word, wordIndex, group, tSec, groupHasActiveSoloHero, canvasWidth, canvasHeight, state,
  );
  return state;
}


/** Write word state into pre-allocated target — zero allocation per call */
export function computeWordStateInto(
  word: CompiledWord, wordIndex: number, group: CompiledPhraseGroup,
  tSec: number, groupHasActiveSoloHero: boolean,
  canvasWidth: number, canvasHeight: number,
  target: WordAnimState,
): void {
  const wordStart = word.wordStart ?? group.start;
  const nextWordStart = wordIndex + 1 < group.words.length
    ? (group.words[wordIndex + 1].wordStart ?? group.end) : group.end;

  let wordState: 'upcoming' | 'active' | 'spoken';
  if (tSec < wordStart) {
    wordState = wordIndex === 0 ? 'active' : 'upcoming';
  } else if (tSec < nextWordStart) {
    wordState = 'active';
  } else {
    wordState = 'spoken';
  }

  // ── Active word envelope: fast attack, hold, gentle release ──
  // Attack starts 80ms before wordStart so peak arrives on time.
  // Release takes 120ms after word ends — no snap-off.
  const ATTACK_SEC = 0.08;
  const RELEASE_SEC = 0.12;
  const rampStart = wordStart - ATTACK_SEC;
  const rampEnd = nextWordStart;

  let envelope = 0;
  if (tSec >= rampStart && tSec < wordStart) {
    // Anticipation: ramp 0→1 over 80ms (ease-in: accelerating)
    const t = (tSec - rampStart) / ATTACK_SEC;
    envelope = t * t;
  } else if (tSec >= wordStart && tSec < rampEnd) {
    // Active: hold at peak
    envelope = 1.0;
  } else if (tSec >= rampEnd && tSec < rampEnd + RELEASE_SEC) {
    // Release: decay 1→0 over 120ms (ease-out: decelerating)
    const t = 1.0 - (tSec - rampEnd) / RELEASE_SEC;
    envelope = t * t;
  }
  const waveScale = 1.0 + envelope * 0.06;

  const isHeroWord = word.isHeroWord === true;
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && (word.wordDuration ?? 0) >= 0.5;

  target.wordState = wordState;
  target.waveScale = waveScale;
  target.isSoloHero = isSoloHero;
  target.soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  if (isSoloHero) {
    target.heroOffsetX = canvasWidth / 2 - word.layoutX;
    target.heroOffsetY = canvasHeight / 2 - word.layoutY;
  } else {
    target.heroOffsetX = 0;
    target.heroOffsetY = 0;
  }
}

// ─── 4. Final chunk animation ───────────────────────────────
export function computeChunkAnim(
  phrase: PhraseAnimState, wordAnim: WordAnimState,
): ChunkAnimState {
  const alpha = wordAnim.soloHeroHidden ? 0 : 1.0;
  const scale = wordAnim.waveScale * phrase.pushInScale;

  return {
    alpha,
    scaleX: scale, scaleY: scale,
    offsetX: wordAnim.heroOffsetX, offsetY: wordAnim.heroOffsetY,
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
