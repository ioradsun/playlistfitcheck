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
        expect(word.entryStyle).toBeTruthy();
        expect(word.exitStyle).toBeTruthy();
        expect(word.behaviorStyle).toBeTruthy();
      }
    }
  });

});
