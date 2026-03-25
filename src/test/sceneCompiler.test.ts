import { describe, it, expect } from 'vitest';
import { compileScene, type ScenePayload } from '@/lib/sceneCompiler';

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) { this.width = width; this.height = height; }
  getContext() {
    return {
      font: '',
      measureText: (text: string) => ({ width: text.length * 12 }),
    } as OffscreenCanvasRenderingContext2D;
  }
}

(globalThis as any).OffscreenCanvas = (globalThis as any).OffscreenCanvas ?? FakeOffscreenCanvas;

const PAYLOAD: ScenePayload = {
  lines: [{ text: 'we rise up', start: 0, end: 2 } as any],
  words: [
    { word: 'we', start: 0, end: 0.4 },
    { word: 'rise', start: 0.41, end: 0.9 },
    { word: 'up', start: 0.91, end: 1.2 },
  ],
  bpm: 120,
  beat_grid: { bpm: 120, beats: [0, 0.5, 1, 1.5], confidence: 1 },
  motion_profile_spec: { energy: 0.5, density: 0.5 } as any,
  frame_state: null,
  cinematic_direction: { sections: [], chapters: [], storyboard: [], visualWorld: { physicsProfile: { heat: 0.6, beatResponse: 'pulse' } } } as any,
  palette: ['#000000', '#ff0000', '#ffffff'],
  lineBeatMap: [],
  songStart: 0,
  songEnd: 2,
};

describe('sceneCompiler', () => {
  it('compileScene produces valid phrase groups with animation assignments', () => {
    const compiled = compileScene(PAYLOAD);
    expect(compiled.phraseGroups.length).toBeGreaterThan(0);
    for (const group of compiled.phraseGroups) {
      expect(group.words.length).toBeGreaterThan(0);
      for (const word of group.words) {
        expect(word.id).toBeTruthy();
        expect(word.emphasisLevel).toBeGreaterThanOrEqual(0);
        expect(word.baseFontSize).toBeGreaterThan(0);
      }
    }
  });

  it('uses inclusive AI wordRange bounds for phrase start/end timing', () => {
    const payload: ScenePayload = {
      ...PAYLOAD,
      lines: [{ text: 'alpha beta gamma', start: 0, end: 3 } as any],
      words: [
        { word: 'alpha', start: 0.0, end: 0.45 },
        { word: 'beta', start: 0.5, end: 0.9 },
        { word: 'gamma', start: 1.2, end: 1.6 },
      ],
      cinematic_direction: {
        sections: [],
        chapters: [],
        storyboard: [],
        phrases: [
          { wordRange: [0, 1] },
          { wordRange: [2, 2] },
        ],
        visualWorld: { physicsProfile: { heat: 0.6, beatResponse: 'pulse' } },
      } as any,
      songEnd: 3,
    };

    const compiled = compileScene(payload);
    expect(compiled.phraseGroups).toHaveLength(2);
    expect(compiled.phraseGroups[0].start).toBe(0.0);
    expect(compiled.phraseGroups[0].end).toBe(0.9);
    expect(compiled.phraseGroups[1].start).toBe(1.2);
    expect(compiled.phraseGroups[1].end).toBe(1.6);
  });

  it('keeps one-word [x,x] phrase duration from the indexed word timing', () => {
    const payload: ScenePayload = {
      ...PAYLOAD,
      lines: [{ text: 'solo', start: 0, end: 2 } as any],
      words: [
        { word: 'solo', start: 0.8, end: 1.15 },
      ],
      cinematic_direction: {
        sections: [],
        chapters: [],
        storyboard: [],
        phrases: [
          { wordRange: [0, 0] },
        ],
        visualWorld: { physicsProfile: { heat: 0.6, beatResponse: 'pulse' } },
      } as any,
      songEnd: 2,
    };

    const compiled = compileScene(payload);
    expect(compiled.phraseGroups).toHaveLength(1);
    expect(compiled.phraseGroups[0].start).toBe(0.8);
    expect(compiled.phraseGroups[0].end).toBe(1.15);
    expect(compiled.phraseGroups[0].words[0].wordDuration).toBeCloseTo(0.35, 6);
  });

  it('marks repeated hero words by indexed phrase membership, not text matching', () => {
    const payload: ScenePayload = {
      ...PAYLOAD,
      lines: [{ text: 'love enough love', start: 0, end: 3 } as any],
      words: [
        { word: 'love', start: 0.0, end: 0.2 },
        { word: 'enough', start: 0.21, end: 0.45 },
        { word: 'love', start: 0.46, end: 0.7 },
      ],
      cinematic_direction: {
        sections: [],
        chapters: [],
        storyboard: [],
        phrases: [
          { wordRange: [0, 2], heroWord: 'love' },
        ],
        visualWorld: { physicsProfile: { heat: 0.6, beatResponse: 'pulse' } },
      } as any,
      songEnd: 3,
    };

    const compiled = compileScene(payload);
    const heroFlags = compiled.phraseGroups[0].words.map((w) => w.isHeroWord);
    expect(heroFlags).toEqual([true, false, false]);
  });

});
