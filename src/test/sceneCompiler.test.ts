import { describe, it, expect } from 'vitest';
import { bakeScene, type ScenePayload } from '@/lib/lyricSceneBaker';
import { compileScene } from '@/lib/sceneCompiler';

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

describe('sceneCompiler', () => {
  it('matches baked chunk ids and animation assignments', () => {
    const payload: ScenePayload = {
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

    const compiled = compileScene(payload);
    const baked = bakeScene(payload);
    const bakedIds = new Set(baked.flatMap((f) => f.chunks.map((c) => c.id)));

    for (const group of compiled.phraseGroups) {
      for (const word of group.words) {
        expect(bakedIds.has(word.id)).toBe(true);
        const chunk = baked.flatMap((f) => f.chunks).find((c) => c.id === word.id);
        expect(chunk?.entryStyle).toBe(word.entryStyle);
        expect(chunk?.exitStyle).toBe(word.exitStyle);
        expect(chunk?.behavior).toBe(word.behaviorStyle);
      }
    }
  });
});
