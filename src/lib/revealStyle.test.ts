import { describe, it, expect } from 'vitest';
import { deriveRevealStyle, physicsEligible } from './revealStyle';

describe('physicsEligible', () => {
  it('always includes instant', () => {
    expect(physicsEligible(0.1, 20)).toContain('instant');
    expect(physicsEligible(10, 1)).toContain('instant');
  });

  it('allows stagger_fast when hops × 0.12 ≤ duration × 0.5', () => {
    expect(physicsEligible(1.0, 5)).toContain('stagger_fast');
    expect(physicsEligible(1.0, 6)).not.toContain('stagger_fast');
  });

  it('allows stagger_slow when hops × 0.25 ≤ duration × 0.3', () => {
    expect(physicsEligible(2.0, 3)).toContain('stagger_slow');
    expect(physicsEligible(2.0, 4)).not.toContain('stagger_slow');
  });
});

describe('deriveRevealStyle', () => {
  it('picks stagger_slow when eligible and not recent', () => {
    expect(deriveRevealStyle(3.0, 3, [])).toBe('stagger_slow');
  });

  it('picks stagger_fast if stagger_slow is in recent', () => {
    expect(deriveRevealStyle(3.0, 3, ['stagger_slow'])).toBe('stagger_fast');
  });

  it('picks instant if both stagger variants are in recent', () => {
    expect(deriveRevealStyle(3.0, 3, ['stagger_slow', 'stagger_fast'])).toBe('instant');
  });

  it('falls back to instant when no stagger fits physics', () => {
    expect(deriveRevealStyle(0.3, 5, [])).toBe('instant');
  });

  it('accepts repeat if all eligibles are recently used', () => {
    expect(deriveRevealStyle(0.3, 5, ['instant', 'instant'])).toBe('instant');
  });

  it('produces varied sequence over 5 identical phrases', () => {
    const durationSec = 1.2;
    const words = 4;
    const seq: string[] = [];
    let recent: Array<'instant' | 'stagger_fast' | 'stagger_slow'> = [];
    for (let i = 0; i < 5; i++) {
      const r = deriveRevealStyle(durationSec, words, recent);
      seq.push(r);
      recent = [r, ...recent].slice(0, 2);
    }
    for (let i = 2; i < seq.length; i++) {
      expect(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2])).toBe(true);
    }
  });
});
