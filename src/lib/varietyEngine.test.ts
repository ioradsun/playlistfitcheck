import { describe, it, expect } from 'vitest';
import {
  VarietyEngine,
  physicsEligibleReveals,
  GENTLE_EXITS,
  DRAMATIC_EXITS,
} from './varietyEngine';

describe('physicsEligibleReveals', () => {
  it('always includes instant', () => {
    expect(physicsEligibleReveals(0.1, 20)).toContain('instant');
  });

  it('includes stagger_fast when cost fits', () => {
    expect(physicsEligibleReveals(1.0, 5)).toContain('stagger_fast');
    expect(physicsEligibleReveals(1.0, 6)).not.toContain('stagger_fast');
  });

  it('includes stagger_slow when cost fits', () => {
    expect(physicsEligibleReveals(2.0, 3)).toContain('stagger_slow');
    expect(physicsEligibleReveals(2.0, 4)).not.toContain('stagger_slow');
  });
});

describe('VarietyEngine reveal', () => {
  it('uses all physics-eligible reveals before repeating', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      seen.add(v.pickReveal({ durationSec: 6, wordCount: 8 }));
    }
    expect(seen.size).toBe(3);
  });

  it('accepts repeat when physics forces it', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    for (let i = 0; i < 5; i += 1) {
      const picked = v.pickReveal({ durationSec: 0.3, wordCount: 5 });
      expect(picked).toBe('instant');
    }
  });

  it('resets history per section', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const a = v.pickReveal({ durationSec: 3.0, wordCount: 2 });
    v.setSection(1);
    const b = v.pickReveal({ durationSec: 3.0, wordCount: 2 });
    expect(a).toBe('stagger_slow');
    expect(b).toBe('stagger_slow');
  });
});

describe('VarietyEngine composition', () => {
  it('forces center_word when AI flags it', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    expect(v.pickComposition({ wordCount: 3, durationSec: 2, aiWantsCenterWord: true })).toBe('center_word');
  });

  it('forces center_word for single-word phrases', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    expect(v.pickComposition({ wordCount: 1, durationSec: 2, aiWantsCenterWord: false })).toBe('center_word');
  });

  it('rotates line and stack for regular phrases', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const a = v.pickComposition({ wordCount: 5, durationSec: 2, aiWantsCenterWord: false });
    const b = v.pickComposition({ wordCount: 5, durationSec: 2, aiWantsCenterWord: false });
    expect(a).not.toBe(b);
  });

  it('uses line-only for short phrases where stack is not eligible', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const p = v.pickComposition({ wordCount: 2, durationSec: 1, aiWantsCenterWord: false });
    expect(p).toBe('line');
  });
});

describe('VarietyEngine exit', () => {
  it('uses AI dramatic suggestion on climax phrase', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    expect(v.pickExit({ aiClimax: true, aiDramaticExit: 'burn' })).toBe('burn');
  });

  it('rotates dramatics when climax without specific suggestion', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const a = v.pickExit({ aiClimax: true });
    const b = v.pickExit({ aiClimax: true });
    expect(DRAMATIC_EXITS).toContain(a);
    expect(DRAMATIC_EXITS).toContain(b);
    expect(a).not.toBe(b);
  });

  it('uses every gentle option before repeating any', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const seen = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      seen.add(v.pickExit({ aiClimax: false }));
    }
    expect(seen.size).toBe(5);
  });

  it('cycles cleanly through the full pool on repeat', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const picks: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      picks.push(v.pickExit({ aiClimax: false }));
    }
    expect(new Set(picks.slice(0, 5)).size).toBe(5);
    expect(new Set(picks.slice(5, 10)).size).toBe(5);
  });

  it('rejects non-dramatic AI suggestion on climax', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const picked = v.pickExit({ aiClimax: true, aiDramaticExit: 'fade' as any });
    expect(DRAMATIC_EXITS).toContain(picked);
    expect(picked).not.toBe('fade');
  });

  it('resets history on setSection', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    v.pickExit({ aiClimax: false });
    v.setSection(1);
    const firstPickSection1 = v.pickExit({ aiClimax: false });
    expect(firstPickSection1).toBe('fade');
  });

  it('only yields gentle exits for non-climax phrases', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    for (let i = 0; i < 8; i += 1) {
      expect(GENTLE_EXITS).toContain(v.pickExit({ aiClimax: false }));
    }
  });
});
