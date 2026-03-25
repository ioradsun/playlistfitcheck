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

  const isHeroWord = word.isHeroWord === true;
  const isOnlyWordInPhrase = group.words.length === 1;
  const isSoloHero = isOnlyWordInPhrase && isHeroWord && (word.wordDuration ?? 0) >= 0.5;
  const soloHeroHidden = !isSoloHero && groupHasActiveSoloHero;

  let heroOffsetX = 0; let heroOffsetY = 0;
  if (isSoloHero) {
    heroOffsetX = canvasWidth / 2 - word.layoutX;
    heroOffsetY = canvasHeight / 2 - word.layoutY;
  }

  return {
    wordState,
    waveScale: wordState === 'active' ? 1.06 : 1.0,
    isSoloHero,
    soloHeroHidden,
    heroOffsetX,
    heroOffsetY,
  };
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
