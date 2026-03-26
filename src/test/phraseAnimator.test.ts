import { describe, it, expect } from 'vitest';
import { computeChunkAnim, computePhraseState, computeWordState, resolveActiveGroup } from '@/engine/PhraseAnimator';
import type { CompiledPhraseGroup } from '@/lib/sceneCompiler';
import type { MotionProfile } from '@/engine/IntensityRouter';

const defaultMp: MotionProfile = {
  intensity: 0.5,
  bgPulseAmplitude: 0.03,
  cameraBeatMult: 0,
  textSyncFraction: 0,
  particleDensityMult: 1.0,
  particleSpeedMult: 1.0,
};

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
    // computePhraseState(group, nextGroupStart, prevGroupEnd, tSec, beatState, canvasWidth, mp)
    const state = computePhraseState(group, Infinity, 0, 2.3, null, 1080, defaultMp);
    expect(state.groupStart).toBe(2.0);
    expect(state.groupEnd).toBe(2.8);
  });

  it('returns valid push-in scale for active phrase', () => {
    const group = mkGroup({});
    const state = computePhraseState(group, Infinity, 0, 0.4, { pulse: 1, phase: 0 }, 1080, defaultMp);

    // pushInScale should be close to 1.0 during active phrase
    expect(state.pushInScale).toBeGreaterThanOrEqual(1.0);
    expect(state.pushInScale).toBeLessThanOrEqual(1.05);
  });

  it('clamps total word vertical offset after contributions', () => {
    const group = mkGroup({ staggerDelay: 0.12 });
    // computePhraseState(group, nextGroupStart, prevGroupEnd, tSec, beatState, canvasWidth, mp)
    const phraseState = computePhraseState(group, Infinity, 0, 0.05, { pulse: 1, phase: 0 }, 1080, defaultMp);
    // computeWordState(word, wordIndex, group, tSec, groupHasActiveSoloHero, canvasWidth, canvasHeight)
    const wordState = computeWordState(group.words[0], 0, group, 0.05, false, 1080, 1920);
    // computeChunkAnim(phrase, wordAnim)
    const chunk = computeChunkAnim(phraseState, wordState);

    expect(chunk.offsetY).toBeLessThanOrEqual(12);
    expect(chunk.offsetY).toBeGreaterThanOrEqual(-12);
  });
});
