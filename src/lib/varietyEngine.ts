/**
 * varietyEngine.ts — Physics + anti-repetition + AI-hint variety selector.
 *
 * Picks per-phrase visual variation across three axes: reveal, composition, exit.
 */

export type RevealStyle = 'instant' | 'stagger_fast' | 'stagger_slow';
export type Composition = 'line' | 'stack' | 'center_word';
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

export interface RevealInputs {
  durationSec: number;
  wordCount: number;
}

export interface CompositionInputs {
  wordCount: number;
  durationSec: number;
  aiWantsCenterWord: boolean;
}

export interface ExitInputs {
  aiClimax: boolean;
  aiDramaticExit?: ExitEffect;
}

interface AxisState {
  reveal: Map<RevealStyle, number>;
  composition: Map<Composition, number>;
  exit: Map<ExitEffect, number>;
  step: number;
}

function emptyAxisState(): AxisState {
  return {
    reveal: new Map(),
    composition: new Map(),
    exit: new Map(),
    step: 0,
  };
}

export class VarietyEngine {
  private states: Map<number, AxisState> = new Map();
  private currentSection = 0;

  setSection(sectionIndex: number): void {
    this.currentSection = sectionIndex;
  }

  pickReveal(inputs: RevealInputs): RevealStyle {
    const eligible = physicsEligibleReveals(inputs.durationSec, inputs.wordCount);
    return this.pickLRU('reveal', REVEAL_PREF, eligible);
  }

  pickComposition(inputs: CompositionInputs): Composition {
    if (inputs.wordCount === 1 || inputs.aiWantsCenterWord) {
      return this.commit('composition', 'center_word');
    }

    const eligible: Composition[] = ['line'];
    if (inputs.wordCount >= 4) eligible.push('stack');
    return this.pickLRU('composition', COMPOSITION_PREF, eligible);
  }

  pickExit(inputs: ExitInputs): ExitEffect {
    if (inputs.aiClimax && inputs.aiDramaticExit && DRAMATIC_EXITS.includes(inputs.aiDramaticExit)) {
      return this.commit('exit', inputs.aiDramaticExit);
    }
    if (inputs.aiClimax) {
      return this.pickLRU('exit', DRAMATIC_EXITS, DRAMATIC_EXITS);
    }
    return this.pickLRU('exit', GENTLE_EXITS, GENTLE_EXITS);
  }

  private pickLRU<K extends 'reveal' | 'composition' | 'exit', V>(
    axis: K,
    preferenceOrder: readonly V[],
    eligible: readonly V[],
  ): V {
    const state = this.getOrCreateState();
    const usageMap = state[axis] as Map<V, number>;

    const eligSet = new Set(eligible);
    let bestValue: V | null = null;
    let bestStep = Infinity;
    let bestPrefIdx = Infinity;

    for (let i = 0; i < preferenceOrder.length; i += 1) {
      const value = preferenceOrder[i];
      if (!eligSet.has(value)) continue;
      const lastStep = usageMap.get(value) ?? -1;
      if (lastStep < bestStep || (lastStep === bestStep && i < bestPrefIdx)) {
        bestValue = value;
        bestStep = lastStep;
        bestPrefIdx = i;
      }
    }

    if (bestValue === null) {
      for (const value of eligible) {
        const lastStep = usageMap.get(value) ?? -1;
        if (lastStep < bestStep) {
          bestValue = value;
          bestStep = lastStep;
        }
      }
    }

    if (bestValue === null) {
      throw new Error(`pickLRU: no eligible options for axis=${axis}`);
    }

    return this.commit(axis, bestValue);
  }

  private commit<K extends 'reveal' | 'composition' | 'exit', V>(axis: K, value: V): V {
    const state = this.getOrCreateState();
    const usageMap = state[axis] as Map<V, number>;
    usageMap.set(value, state.step);
    state.step += 1;
    return value;
  }

  private getOrCreateState(): AxisState {
    let state = this.states.get(this.currentSection);
    if (!state) {
      state = emptyAxisState();
      this.states.set(this.currentSection, state);
    }
    return state;
  }
}

export function physicsEligibleReveals(durationSec: number, wordCount: number): RevealStyle[] {
  const hops = Math.max(0, wordCount - 1);
  const out: RevealStyle[] = ['instant'];
  if (hops * STAGGER_DELAY.stagger_fast <= durationSec * REVEAL_BUDGET.stagger_fast) out.push('stagger_fast');
  if (hops * STAGGER_DELAY.stagger_slow <= durationSec * REVEAL_BUDGET.stagger_slow) out.push('stagger_slow');
  return out;
}
