/**
 * varietyEngine.ts — Physics + anti-repetition + AI-hint variety selector.
 *
 * Picks per-phrase visual variation across four axes: reveal, composition, bias, exit.
 */

export type RevealStyle = 'instant' | 'stagger_fast' | 'stagger_slow';
export type Composition = 'line' | 'stack' | 'center_word';
export type Bias = 'left' | 'center' | 'right';
export type ExitEffect =
  | 'fade' | 'drift_up' | 'shrink' | 'dissolve' | 'cascade'
  | 'burn' | 'scatter' | 'slam' | 'glitch';

/** Exits owned by variety — gentle, appropriate for default-flow phrases. */
export const GENTLE_EXITS: readonly ExitEffect[] = [
  'fade', 'drift_up', 'shrink', 'dissolve', 'cascade',
] as const;

/** Exits owned by AI — dramatic, appropriate for climax/emphasis phrases. */
export const DRAMATIC_EXITS: readonly ExitEffect[] = [
  'burn', 'scatter', 'slam', 'glitch',
] as const;

/** Per-reveal-style stagger delay in seconds. Drives word entry timing downstream. */
export const STAGGER_DELAY: Record<RevealStyle, number> = {
  instant: 0,
  stagger_fast: 0.12,
  stagger_slow: 0.25,
};

/** Reveal physics: stagger cost as fraction of phrase duration must not exceed budget. */
const REVEAL_BUDGET: Record<RevealStyle, number> = {
  instant: Infinity,
  stagger_fast: 0.50,
  stagger_slow: 0.30,
};

const REVEAL_PREF: readonly RevealStyle[] = ['stagger_slow', 'stagger_fast', 'instant'];
const COMPOSITION_PREF: readonly Composition[] = ['stack', 'line'];
const BIAS_PREF: readonly Bias[] = ['left', 'right', 'center'];

export interface RevealInputs {
  durationSec: number;
  wordCount: number;
}

export interface CompositionInputs {
  wordCount: number;
  durationSec: number;
  aiWantsCenterWord: boolean;
}

export interface BiasInputs {
  composition: Composition;
}

export interface ExitInputs {
  aiClimax: boolean;
  aiDramaticExit?: ExitEffect;
}

interface AxisState {
  reveal: RevealStyle[];
  composition: Composition[];
  bias: Bias[];
  exit: ExitEffect[];
}

function emptyAxisState(): AxisState {
  return { reveal: [], composition: [], bias: [], exit: [] };
}

export class VarietyEngine {
  private states: Map<number, AxisState> = new Map();
  private currentSection = 0;

  setSection(sectionIndex: number): void {
    this.currentSection = sectionIndex;
    if (!this.states.has(sectionIndex)) {
      this.states.set(sectionIndex, emptyAxisState());
    }
  }

  pickReveal(inputs: RevealInputs): RevealStyle {
    const eligible = physicsEligibleReveals(inputs.durationSec, inputs.wordCount);
    const recent = this.recent('reveal');
    const picked = pickFromEligible(REVEAL_PREF, eligible, recent);
    this.commit('reveal', picked);
    return picked;
  }

  pickComposition(inputs: CompositionInputs): Composition {
    if (inputs.wordCount === 1) {
      this.commit('composition', 'center_word');
      return 'center_word';
    }
    if (inputs.aiWantsCenterWord) {
      this.commit('composition', 'center_word');
      return 'center_word';
    }
    const eligible: Composition[] = ['line'];
    if (inputs.wordCount >= 4) eligible.push('stack');
    const recent = this.recent('composition');
    const picked = pickFromEligible(COMPOSITION_PREF, eligible, recent);
    this.commit('composition', picked);
    return picked;
  }

  pickBias(inputs: BiasInputs): Bias {
    if (inputs.composition === 'center_word') {
      this.commit('bias', 'center');
      return 'center';
    }
    const recent = this.recent('bias');
    const picked = pickFromEligible(BIAS_PREF, ['left', 'center', 'right'] as Bias[], recent);
    this.commit('bias', picked);
    return picked;
  }

  pickExit(inputs: ExitInputs): ExitEffect {
    if (inputs.aiClimax && inputs.aiDramaticExit && DRAMATIC_EXITS.includes(inputs.aiDramaticExit)) {
      this.commit('exit', inputs.aiDramaticExit);
      return inputs.aiDramaticExit;
    }
    if (inputs.aiClimax) {
      const recent = this.recent('exit').filter((e) => DRAMATIC_EXITS.includes(e));
      const picked = pickFromEligible(DRAMATIC_EXITS, DRAMATIC_EXITS, recent);
      this.commit('exit', picked);
      return picked;
    }
    const recentGentle = this.recent('exit').filter((e) => GENTLE_EXITS.includes(e));
    const picked = pickFromEligible(GENTLE_EXITS, GENTLE_EXITS, recentGentle);
    this.commit('exit', picked);
    return picked;
  }

  private recent<K extends keyof AxisState>(axis: K): AxisState[K] {
    const s = this.states.get(this.currentSection) ?? emptyAxisState();
    return s[axis];
  }

  private commit<K extends keyof AxisState, V extends AxisState[K][number]>(axis: K, value: V): void {
    if (!this.states.has(this.currentSection)) {
      this.states.set(this.currentSection, emptyAxisState());
    }
    const s = this.states.get(this.currentSection)!;
    (s[axis] as unknown as V[]) = [value, ...(s[axis] as unknown as V[])].slice(0, 2);
  }
}

export function physicsEligibleReveals(durationSec: number, wordCount: number): RevealStyle[] {
  const hops = Math.max(0, wordCount - 1);
  const out: RevealStyle[] = ['instant'];
  if (hops * STAGGER_DELAY.stagger_fast <= durationSec * REVEAL_BUDGET.stagger_fast) out.push('stagger_fast');
  if (hops * STAGGER_DELAY.stagger_slow <= durationSec * REVEAL_BUDGET.stagger_slow) out.push('stagger_slow');
  return out;
}

export function pickFromEligible<T>(
  preferenceOrder: readonly T[],
  eligible: readonly T[],
  recent: readonly T[],
): T {
  const eligSet = new Set(eligible);
  const recentSet = new Set(recent.slice(0, 2));
  for (const v of preferenceOrder) {
    if (eligSet.has(v) && !recentSet.has(v)) return v;
  }
  for (const v of preferenceOrder) {
    if (eligSet.has(v)) return v;
  }
  return eligible[0];
}
