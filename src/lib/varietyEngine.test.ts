import { describe, it, expect } from 'vitest';
import {
  VarietyEngine,
  physicsEligibleReveals,
  pickFromEligible,
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

describe('pickFromEligible', () => {
  it('prefers the first eligible not in recent', () => {
    expect(pickFromEligible(['a', 'b', 'c'], ['a', 'b', 'c'], ['a'])).toBe('b');
  });

  it('falls back to preference order if all eligibles are recent', () => {
    expect(pickFromEligible(['a', 'b'], ['a', 'b'], ['a', 'b'])).toBe('a');
  });

  it('respects eligibility even if preferred is not eligible', () => {
    expect(pickFromEligible(['a', 'b'], ['b'], [])).toBe('b');
  });
});

describe('VarietyEngine reveal', () => {
  it('rotates through styles over 5 phrases with all eligible', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const seq: string[] = [];
    for (let i = 0; i < 5; i++) {
      seq.push(v.pickReveal({ durationSec: 3.0, wordCount: 2 }));
    }
    for (let i = 2; i < seq.length; i++) {
      expect(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2])).toBe(true);
    }
  });

  it('accepts repeat when physics forces it', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    for (let i = 0; i < 5; i++) {
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

describe('VarietyEngine bias', () => {
  it('always returns center regardless of composition', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    expect(v.pickBias({ composition: 'line' })).toBe('center');
    expect(v.pickBias({ composition: 'stack' })).toBe('center');
    expect(v.pickBias({ composition: 'center_word' })).toBe('center');
  });

  it('returns center consistently across many phrases', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const seq: string[] = [];
    for (let i = 0; i < 6; i++) {
      seq.push(v.pickBias({ composition: 'line' }));
    }
    expect(new Set(seq)).toEqual(new Set(['center']));
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

  it('rotates gentle exits for non-climax phrases', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const seq: string[] = [];
    for (let i = 0; i < 6; i++) {
      seq.push(v.pickExit({ aiClimax: false }));
    }
    for (const e of seq) expect(GENTLE_EXITS).toContain(e as any);
    for (let i = 2; i < seq.length; i++) {
      expect(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2])).toBe(true);
    }
  });

  it('rejects non-dramatic AI suggestion on climax', () => {
    const v = new VarietyEngine();
    v.setSection(0);
    const picked = v.pickExit({ aiClimax: true, aiDramaticExit: 'fade' as any });
    expect(DRAMATIC_EXITS).toContain(picked);
    expect(picked).not.toBe('fade');
  });
});
