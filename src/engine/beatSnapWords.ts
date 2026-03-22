/**
 * beatSnapWords — post-process Scribe word timestamps against the beat grid.
 *
 * Scribe returns acoustically accurate timestamps — when the vocalist's mouth
 * opened. But the audience perceives word timing relative to the beat grid,
 * not the absolute clock. A word 60ms before the beat *feels* early even
 * though it's correct. Snapping to the beat makes lyrics feel performed
 * rather than transcribed.
 *
 * Rules:
 *   Hard snap  (≤ HARD_MS):  move directly onto the beat
 *   Soft pull  (≤ SOFT_MS):  lerp 65% toward the beat
 *   Leave alone (> SOFT_MS): timestamp is genuinely between beats, keep it
 *
 * Only the word START is snapped — end is adjusted proportionally so
 * word duration is preserved (prevents zero-length or overlapping words).
 *
 * Pure function — no side effects, deterministic output.
 */

export interface SnapWord {
  word: string;
  start: number;
  end: number;
}

const HARD_MS = 80;
const SOFT_MS = 160;
const SOFT_LERP = 0.65;

export function beatSnapWords(words: SnapWord[], beats: number[]): SnapWord[] {
  if (!words.length || !beats.length) return words;

  const sortedBeats = [...beats].sort((a, b) => a - b);

  return words.map((w) => {
    const nearest = findNearestBeat(w.start, sortedBeats);
    if (nearest === null) return w;

    const distMs = Math.abs(w.start - nearest) * 1000;
    const duration = w.end - w.start;

    let newStart: number;

    if (distMs <= HARD_MS) {
      newStart = nearest;
    } else if (distMs <= SOFT_MS) {
      newStart = w.start + (nearest - w.start) * SOFT_LERP;
    } else {
      return w;
    }

    newStart = Math.round(newStart * 1000) / 1000;
    const newEnd = Math.round((newStart + duration) * 1000) / 1000;

    return { ...w, start: newStart, end: newEnd };
  });
}

function findNearestBeat(tSec: number, beats: number[]): number | null {
  if (beats.length === 0) return null;
  if (beats.length === 1) return beats[0];

  let lo = 0;
  let hi = beats.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < tSec) lo = mid + 1;
    else hi = mid;
  }

  const after = beats[lo];
  const before = lo > 0 ? beats[lo - 1] : null;

  if (before === null) return after;
  return Math.abs(after - tSec) <= Math.abs(before - tSec) ? after : before;
}
