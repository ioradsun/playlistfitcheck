/**
 * MotionGrammar — shape functions that define how words move for each DancePattern.
 *
 * Each grammar is a pure function:
 *   (phase, barPhase, energy, compileHeight) → { dX, dY, dScale }
 *
 * - phase:   0-1 within current beat (from BeatState.phase)
 * - barPhase: 0-1 within current bar (derived from beatIndex % 4 + phase)
 * - energy:  0-1 continuous energy (from BeatState.energy)
 * - compileHeight: canvas height in px (for amplitude scaling)
 *
 * Returns:
 * - dX: horizontal pixel offset to add to word position
 * - dY: vertical pixel offset to add to word position (negative = up)
 * - dScale: scale multiplier to add to word scale (0 = no change, 0.05 = 5% larger)
 *
 * RULES:
 * - No React. No hooks. No side effects. No imports from components.
 * - Every function is pure: same inputs → same outputs.
 * - All amplitudes are proportional to compileHeight (not hardcoded pixels).
 */

import type { DancePattern } from '@/engine/DanceClassifier';

export interface DanceMotion {
  /** Horizontal offset in pixels */
  dX: number;
  /** Vertical offset in pixels (negative = upward) */
  dY: number;
  /** Scale additive (0 = no change, 0.05 = 5% larger) */
  dScale: number;
}

export interface GrammarInput {
  /** 0-1 phase within current beat (0 = on beat, 1 = just before next) */
  phase: number;
  /** 0-1 phase within current bar (0 = bar start, 1 = bar end) */
  barPhase: number;
  /** Which beat within the bar: 0, 1, 2, or 3 */
  barBeat: number;
  /** 0-1 continuous energy level */
  energy: number;
  /** Canvas height in pixels (compile space, typically 540) */
  compileHeight: number;
  /** Is this beat a downbeat (beat 0 of bar)? */
  isDownbeat: boolean;
}

const TAU = Math.PI * 2;

function bounce(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.04;
  const e = g.energy;
  const p = g.phase;

  const dY = -amp * (1 - p) * (1 - p) * e;
  const dX = amp * 0.15 * Math.sin(g.barPhase * TAU) * e;
  const dScale = 0.03 * (1 - p) * (1 - p) * e;

  return { dX, dY, dScale };
}

function groove(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.035;
  const e = g.energy;
  const p = g.phase;
  const backbeat = (g.barBeat === 1 || g.barBeat === 3) ? 1.4 : 0.7;

  const dY = -amp * Math.pow(1 - p, 1.5) * e * backbeat;
  const dX = amp * 0.25 * Math.sin((g.barPhase + 0.125) * TAU) * e;
  const dScale = 0.015 * (1 - p) * e * backbeat;

  return { dX, dY, dScale };
}

function sway(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.035;
  const e = g.energy;

  const dX = amp * Math.sin(g.barPhase * Math.PI) * e;
  const dY = amp * 0.3 * Math.sin(g.barPhase * TAU) * e;
  const dScale = 0.02 * Math.sin(g.barPhase * TAU) * e;

  return { dX, dY, dScale };
}

function slam(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.055;
  const e = g.energy;
  const p = g.phase;

  const dY = -amp * Math.max(0, 1 - p * 1.15) * e;
  const dX = 0;
  const dScale = 0.05 * Math.max(0, 1 - p * 1.5) * e;

  return { dX, dY, dScale };
}

function pulse(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.018;
  const e = g.energy;
  const p = g.phase;

  const dY = -amp * (1 - p) * (1 - p) * e;
  const dX = 0;
  const dScale = 0.07 * (1 - p) * (1 - p) * e;

  return { dX, dY, dScale };
}

function drift(g: GrammarInput): DanceMotion {
  const amp = g.compileHeight * 0.022;
  const e = Math.max(0.3, g.energy);

  const dY = amp * (Math.sin(g.barPhase * Math.PI) * 0.6 + Math.sin(g.barPhase * Math.PI * 3) * 0.2) * e;
  const dX = amp * Math.cos(g.barPhase * TAU) * 0.4 * e;
  const dScale = 0.01 * Math.sin(g.barPhase * TAU) * e;

  return { dX, dY, dScale };
}

const GRAMMAR_MAP: Record<DancePattern, (g: GrammarInput) => DanceMotion> = {
  bounce,
  groove,
  sway,
  slam,
  pulse,
  drift,
};

export function computeDanceMotion(pattern: DancePattern, input: GrammarInput): DanceMotion {
  const fn = GRAMMAR_MAP[pattern] ?? bounce;
  return fn(input);
}

export function crossfadeDanceMotion(
  from: DancePattern,
  to: DancePattern,
  t: number,
  input: GrammarInput,
): DanceMotion {
  if (t <= 0) return computeDanceMotion(from, input);
  if (t >= 1) return computeDanceMotion(to, input);
  const a = computeDanceMotion(from, input);
  const b = computeDanceMotion(to, input);
  const inv = 1 - t;
  return {
    dX: a.dX * inv + b.dX * t,
    dY: a.dY * inv + b.dY * t,
    dScale: a.dScale * inv + b.dScale * t,
  };
}
