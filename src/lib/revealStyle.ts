/**
 * revealStyle.ts — Physics-derived reveal style selector.
 *
 * Reveal style (`instant` / `stagger_fast` / `stagger_slow`) controls how words
 * within a phrase appear. Choice is purely a function of phrase timing and
 * anti-repetition history — not AI creative input, not energy labels.
 */

export type RevealStyle = 'instant' | 'stagger_fast' | 'stagger_slow';

/** Per-word stagger delay in seconds, by reveal style. */
export const STAGGER_DELAY: Record<RevealStyle, number> = {
  instant: 0,
  stagger_fast: 0.12,
  stagger_slow: 0.25,
};

/** Physics budget as a fraction of phrase duration. Stagger cost must stay under this. */
const BUDGET: Record<RevealStyle, number> = {
  instant: Infinity,
  stagger_fast: 0.50,
  stagger_slow: 0.30,
};

const PREFERENCE_ORDER: RevealStyle[] = ['stagger_slow', 'stagger_fast', 'instant'];

/** Return the styles whose stagger cost fits within the phrase's time budget. */
export function physicsEligible(durationSec: number, wordCount: number): RevealStyle[] {
  const hops = Math.max(0, wordCount - 1);
  const out: RevealStyle[] = ['instant'];
  if (hops * STAGGER_DELAY.stagger_fast <= durationSec * BUDGET.stagger_fast) out.push('stagger_fast');
  if (hops * STAGGER_DELAY.stagger_slow <= durationSec * BUDGET.stagger_slow) out.push('stagger_slow');
  return out;
}

/**
 * Derive reveal style from physics + anti-repetition.
 *
 * @param durationSec - Phrase on-screen duration in seconds.
 * @param wordCount - Number of words in the phrase.
 * @param recentInSection - Last 2 reveal styles used in this section, most recent first.
 *   Empty array at section start. Callers are responsible for resetting at section boundaries.
 */
export function deriveRevealStyle(
  durationSec: number,
  wordCount: number,
  recentInSection: readonly RevealStyle[],
): RevealStyle {
  const eligible = new Set(physicsEligible(durationSec, wordCount));
  const recent = new Set(recentInSection.slice(0, 2));

  for (const style of PREFERENCE_ORDER) {
    if (eligible.has(style) && !recent.has(style)) return style;
  }
  for (const style of PREFERENCE_ORDER) {
    if (eligible.has(style)) return style;
  }

  return 'instant';
}
