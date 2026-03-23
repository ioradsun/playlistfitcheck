/**
 * timeTiers.ts — Time-budget gating for visual effects.
 *
 * If there isn't enough screen time to see it, don't render it.
 * A word on screen for 150ms cannot show fire particles.
 * A word held for 1200ms can have full elemental treatment.
 */

export type EffectTier = 'flash' | 'quick' | 'normal' | 'held' | 'sustained';

/**
 * Determine what effects a word can receive based on its screen duration.
 *
 * @param durationMs - Word duration in milliseconds (word.end - word.start)
 */
export function getEffectTier(durationMs: number): EffectTier {
  if (durationMs < 140) return 'flash';
  if (durationMs < 350) return 'quick';
  if (durationMs < 700) return 'normal';
  if (durationMs < 1000) return 'held';
  return 'sustained';
}

/** Can this tier show elemental particle effects? */
export function canShowElemental(tier: EffectTier): boolean {
  return tier === 'normal' || tier === 'held' || tier === 'sustained';
}

/** Can this tier show hero glow (shadow blur)? */
export function canShowHeroGlow(tier: EffectTier): boolean {
  return tier !== 'flash';
}

/** Get particle density multiplier based on duration tier.
 *  Scales how many particles the elemental effect spawns. */
export function getParticleDensity(tier: EffectTier): number {
  switch (tier) {
    case 'normal': return 0.5;    // subtle: fewer, shorter-lived particles
    case 'held': return 0.8;      // moderate
    case 'sustained': return 1.0; // full treatment
    default: return 0;
  }
}

/** Get hero glow blur cap based on tier.
 *  Higher tier = more visible glow allowed. */
export function getGlowCap(tier: EffectTier): number {
  switch (tier) {
    case 'flash': return 0;
    case 'quick': return 4;
    case 'normal': return 8;
    case 'held': return 14;
    case 'sustained': return 20;
  }
}
