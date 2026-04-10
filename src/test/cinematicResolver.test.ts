import { describe, expect, it } from 'vitest';
import { normalizeToken, normalizeCinematicDirection } from '@/engine/cinematicResolver';

describe('cinematicResolver', () => {
  it('normalizeToken strips punctuation and lowercases', () => {
    expect(normalizeToken('Fire!')).toBe('fire');
    expect(normalizeToken("don't")).toBe('dont');
    expect(normalizeToken(null)).toBe('');
  });

  it('normalizeCinematicDirection returns null for invalid input', () => {
    expect(normalizeCinematicDirection(null)).toBeNull();
    expect(normalizeCinematicDirection([])).toBeNull();
    expect(normalizeCinematicDirection({})).toBeNull();
  });

  it('normalizeCinematicDirection converts chapters to sections', () => {
    const raw = {
      chapters: [{ backgroundDirective: 'dark room', mood: 'tense', motion: 'slow' }],
    };
    const result = normalizeCinematicDirection(raw);
    expect(result).not.toBeNull();
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].description).toBe('dark room');
  });

  it('normalizeCinematicDirection passes through valid sections', () => {
    const raw = {
      sections: [{ sectionIndex: 0, description: 'intro' }],
    };
    const result = normalizeCinematicDirection(raw);
    expect(result).not.toBeNull();
    expect(result!.sections[0].description).toBe('intro');
  });
});
