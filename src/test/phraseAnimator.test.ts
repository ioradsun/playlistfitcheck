import { describe, it, expect } from 'vitest';
import { computePhraseState, resolveActiveGroup } from '@/engine/PhraseAnimator';
import type { CompiledPhraseGroup } from '@/lib/sceneCompiler';

function mkGroup(overrides: Partial<CompiledPhraseGroup>): CompiledPhraseGroup {
  return {
    lineIndex: 0,
    groupIndex: 0,
    anchorWordIdx: 0,
    start: 0,
    end: 1,
    words: [
      {
        id: 'w0',
        text: 'a',
        clean: 'a',
        wordIndex: 0,
        layoutX: 0,
        layoutY: 0,
        baseFontSize: 48,
        layoutWidth: 10,
        wordStart: 0,
        wordDuration: 0.5,
        fontWeight: 600,
        fontFamily: 'sans',
        isHeroWord: false,
        isAnchor: true,
        color: '#fff',
        hasSemanticColor: false,
        isFiller: false,
        emphasisLevel: 1,
      },
    ],
    staggerDelay: 0.12,
    entryDuration: 0.2,
    exitDuration: 0.2,
    lingerDuration: 0.2,
    behaviorIntensity: 1,
    composition: 'line',
    bias: 'center',
    heroType: 'word',
    revealStyle: 'instant',
    holdClass: 'medium_groove',
    energyTier: 'groove',
    ...overrides,
  };
}

describe('PhraseAnimator timing', () => {
  it('does not activate next phrase before current phrase end time', () => {
    const groups = [
      mkGroup({ start: 0, end: 1, groupIndex: 0, words: [mkGroup({}).words[0], { ...mkGroup({}).words[0], id: 'w1', wordIndex: 1 }] }),
      mkGroup({ start: 1.05, end: 1.5, groupIndex: 1 }),
    ];

    const atEarlyTime = resolveActiveGroup(groups, 0.75, 0, 0.74);
    expect(atEarlyTime.activeIdx).toBe(0);

    const afterEnd = resolveActiveGroup(groups, 1.01, 0, 1.0);
    expect(afterEnd.activeIdx).toBe(1);
  });

  it('uses group.end as phrase end (not next group start)', () => {
    const group = mkGroup({ start: 2.0, end: 2.8, holdClass: 'long_emotional' });
    const state = computePhraseState(group, 2.3, 2.5, null, 1080);
    expect(state.groupStart).toBe(2.0);
    expect(state.groupEnd).toBe(2.8);
  });
});
