import { describe, expect, it } from 'vitest';
import { computeBeatSpine, isExactHeroTokenMatch, resolveCinematicState } from '@/engine/cinematicResolver';

describe('cinematicResolver', () => {
  it('merges defaults + sections + storyboard + word directives', () => {
    const direction: any = {
      songDefaults: { entryStyle: 'fades', typography: 'clean' },
      typography: 'global',
      atmosphere: 'haze',
      sections: [{ sectionIndex: 0, motion: 'rises', texture: 'dust', atmosphere: 'grain', startSec: 0, endSec: 2 }],
      storyboard: [{ lineIndex: 0, heroWord: 'Fire', entryStyle: 'cuts', exitStyle: 'drops', typography: 'serif' }],
      wordDirectives: [{ word: 'fire', emphasisLevel: 4, behavior: 'pulse', ghostTrail: true, ghostDirection: 'left', letterSequence: true }],
    };
    const lines = [{ start: 0, end: 1, text: 'we fire up' }];
    const resolved = resolveCinematicState(direction, lines, 4);
    expect(resolved.lineSettings[0].entryStyle).toBe('cuts');
    expect(resolved.lineSettings[0].typography).toBe('serif');
    expect(resolved.wordSettings.fire.ghostTrail).toBe(true);
    expect(resolved.wordSettings.fire.pulseAmp).toBeGreaterThan(0.02);
  });

  it('computes beat pulse around nearest beat', () => {
    const spine = computeBeatSpine(1.0, { bpm: 120, beats: [0.5, 1.0, 1.5] }, { lookAheadSec: 0, pulseWidth: 0.08 });
    expect(spine.beatPulse).toBeGreaterThan(0.95);
    expect(spine.beatPhase).toBeLessThan(0.1);
  });

  it('hero token matching is exact and normalized', () => {
    expect(isExactHeroTokenMatch('Fire!', 'fire')).toBe(true);
    expect(isExactHeroTokenMatch('firelight', 'fire')).toBe(false);
  });
});
