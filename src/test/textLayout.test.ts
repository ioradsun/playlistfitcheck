/**
 * textLayout.test.ts — Tests for the first-principles text layout engine.
 *
 * Tests cover: sizing, wrapping, centering, responsiveness across aspect ratios,
 * slot non-overlap, timing assignments, edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  fitTextToViewport,
  computeSlots,
  assignGroupToSlot,
  type MeasureContext,
} from '@/engine/textLayout';

// ─── Mock context ───────────────────────────────────────────────────────────
// Approximates proportional font at ~0.55em per character (Montserrat-like)

function mockCtx(charWidthRatio = 0.55): MeasureContext {
  let currentSize = 48;
  return {
    set font(f: string) {
      const match = f.match(/(\d+)px/);
      if (match) currentSize = Number(match[1]);
    },
    get font() { return `600 ${currentSize}px "Montserrat"`; },
    measureText(text: string) {
      return { width: text.length * currentSize * charWidthRatio };
    },
  };
}

// ─── fitTextToViewport ──────────────────────────────────────────────────────

describe('fitTextToViewport', () => {

  // ── Basic sizing ──

  it('returns empty layout for empty words', () => {
    const result = fitTextToViewport(mockCtx(), [], 1920, 1080, 'Montserrat', 600);
    expect(result.lines).toHaveLength(0);
    expect(result.wordPositions).toHaveLength(0);
    expect(result.fontSize).toBeGreaterThanOrEqual(16);
  });

  it('single word fills aggressively', () => {
    const result = fitTextToViewport(mockCtx(), ['FIRE'], 1920, 1080, 'Montserrat', 600);
    expect(result.lines).toHaveLength(1);
    expect(result.fontSize).toBeGreaterThan(80);
    // Single word should be BIG
    const wp = result.wordPositions[0];
    expect(wp.width).toBeGreaterThan(200);
  });

  it('fontSize never below minimum', () => {
    const result = fitTextToViewport(mockCtx(), ['superlongwordthatwontfit'], 100, 50, 'Montserrat', 600, { minFontPx: 14 });
    expect(result.fontSize).toBeGreaterThanOrEqual(14);
  });

  // ── Wrapping ──

  it('long phrase wraps into multiple lines at 16:9', () => {
    const words = 'I can feel the fire burning deep inside my soul tonight'.split(' ');
    const result = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.wordPositions).toHaveLength(words.length);
  });

  it('wrapping is balanced — lines are similar width', () => {
    const words = ['I', 'can', 'feel', 'the', 'fire', 'burning'];
    const ctx = mockCtx();
    const result = fitTextToViewport(ctx, words, 1920, 1080, 'Montserrat', 600);
    if (result.lines.length >= 2) {
      // Measure line widths
      const lineWidths = result.lines.map(line => {
        ctx.font = `600 ${result.fontSize}px "Montserrat"`;
        return ctx.measureText(line).width;
      });
      const maxW = Math.max(...lineWidths);
      const minW = Math.min(...lineWidths);
      // Lines should be within 2× of each other (balanced, not greedy)
      expect(maxW / Math.max(1, minW)).toBeLessThan(2.5);
    }
  });

  // ── Responsiveness ──

  it('portrait 9:16 — wraps and uses height for big text', () => {
    const words = 'some are sellin high some are buying low'.split(' ');
    const slots = computeSlots(1080, 1920);
    const result = fitTextToViewport(mockCtx(), words, 1080, 1920, 'Montserrat', 600, {
      slot: slots[1], // active slot
    });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.fontSize).toBeGreaterThanOrEqual(16);
    // Text should use the portrait height — more lines, bigger font than squeezing onto one line
    expect(result.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('portrait phone (375×667) — still readable', () => {
    const words = 'I can feel the fire burning inside'.split(' ');
    const slots = computeSlots(375, 667);
    const result = fitTextToViewport(mockCtx(), words, 375, 667, 'Montserrat', 600, {
      slot: slots[1],
    });
    expect(result.fontSize).toBeGreaterThanOrEqual(16);
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('ultra-compact (187×333) — hits floor but still works', () => {
    const words = 'some are sellin high'.split(' ');
    const slots = computeSlots(187, 333);
    const result = fitTextToViewport(mockCtx(), words, 187, 333, 'Montserrat', 600, {
      slot: slots[1],
    });
    expect(result.fontSize).toBeGreaterThanOrEqual(16);
  });

  it('square 1:1 — works without branching', () => {
    const words = 'god know some are sellin high'.split(' ');
    const result = fitTextToViewport(mockCtx(), words, 1080, 1080, 'Montserrat', 600);
    expect(result.fontSize).toBeGreaterThanOrEqual(16);
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });

  // ── Centering ──

  it('text is horizontally centered', () => {
    const result = fitTextToViewport(mockCtx(), ['hello', 'world'], 1000, 500, 'Montserrat', 600);
    // Find the bounding box of all word positions
    const xs = result.wordPositions.map(wp => wp.x);
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
    // Average X should be near canvas center
    expect(Math.abs(avgX - 500)).toBeLessThan(200);
  });

  it('text is vertically centered in slot', () => {
    const slots = computeSlots(1920, 1080);
    const activeSlot = slots[1];
    const result = fitTextToViewport(mockCtx(), ['hello'], 1920, 1080, 'Montserrat', 600, {
      slot: activeSlot,
    });
    const ys = result.wordPositions.map(wp => wp.y);
    const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
    // Should be near slot center
    expect(Math.abs(avgY - activeSlot.yCenter)).toBeLessThan(activeSlot.height / 2);
  });

  // ── Edge safety ──

  it('words never extend past canvas edges', () => {
    const words = 'this is a really long phrase that needs many words'.split(' ');
    const result = fitTextToViewport(mockCtx(), words, 400, 300, 'Montserrat', 600);
    for (const wp of result.wordPositions) {
      const leftEdge = wp.x - wp.width / 2;
      const rightEdge = wp.x + wp.width / 2;
      expect(leftEdge).toBeGreaterThanOrEqual(-10); // small tolerance for rounding
      expect(rightEdge).toBeLessThanOrEqual(410);
    }
  });

  // ── Hero headroom ──

  it('hero word indices reserve extra horizontal space', () => {
    const words = ['feel', 'the', 'FIRE', 'burning'];
    const normal = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600);
    const withHero = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600, {
      heroWordIndices: [2],
      heroScaleBoost: 1.15,
    });
    expect(withHero.fontSize).toBeLessThanOrEqual(normal.fontSize);
    // With hero headroom, font might be slightly smaller or wrapping might differ
    // The key guarantee: word positions still fit within canvas
    for (const wp of withHero.wordPositions) {
      expect(wp.x - wp.width / 2).toBeGreaterThanOrEqual(-10);
      expect(wp.x + wp.width / 2).toBeLessThanOrEqual(1930);
    }
  });

  // ── Text transform ──

  it('uppercase transform applied to output', () => {
    const result = fitTextToViewport(mockCtx(), ['hello', 'world'], 1920, 1080, 'Montserrat', 600, {
      textTransform: 'uppercase',
    });
    // Words may be on one or two lines — check all word texts are uppercase
    expect(result.wordPositions[0].text).toBe('HELLO');
    expect(result.wordPositions[1].text).toBe('WORLD');
    // Every line string should be uppercase
    for (const line of result.lines) {
      expect(line).toBe(line.toUpperCase());
    }
  });

  // ── Source index mapping ──

  it('sourceIndex maps back to input word array', () => {
    const words = ['one', 'two', 'three', 'four', 'five'];
    const result = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600);
    const indices = result.wordPositions.map(wp => wp.sourceIndex).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  // ── Slot sizing ──

  it('text in enter slot is smaller than active slot', () => {
    const words = 'feel the fire burning'.split(' ');
    const slots = computeSlots(1920, 1080);
    const active = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600, {
      slot: slots[1],
    });
    const enter = fitTextToViewport(mockCtx(), words, 1920, 1080, 'Montserrat', 600, {
      slot: slots[2],
    });
    // Enter slot is shorter → font should be smaller or equal
    expect(enter.fontSize).toBeLessThanOrEqual(active.fontSize);
  });
});

// ─── computeSlots ───────────────────────────────────────────────────────────

describe('computeSlots', () => {

  it('returns 3 non-overlapping slots for 16:9', () => {
    const slots = computeSlots(1920, 1080);
    expect(slots).toHaveLength(3);
    // Non-overlapping
    expect(slots[0].yBottom).toBeLessThanOrEqual(slots[1].yTop + 0.5);
    expect(slots[1].yBottom).toBeLessThanOrEqual(slots[2].yTop + 0.5);
    // All within canvas
    expect(slots[0].yTop).toBeGreaterThanOrEqual(0);
    expect(slots[2].yBottom).toBeLessThanOrEqual(1080);
    // Active is biggest
    expect(slots[1].height).toBeGreaterThan(slots[0].height);
    expect(slots[1].height).toBeGreaterThan(slots[2].height);
  });

  it('returns 3 non-overlapping slots for 9:16', () => {
    const slots = computeSlots(1080, 1920);
    expect(slots).toHaveLength(3);
    expect(slots[0].yBottom).toBeLessThanOrEqual(slots[1].yTop + 0.5);
    expect(slots[1].yBottom).toBeLessThanOrEqual(slots[2].yTop + 0.5);
    expect(slots[1].height).toBeGreaterThan(slots[0].height);
  });

  it('active slot is generous — at least 55% of canvas height', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080], [375, 667]]) {
      const slots = computeSlots(w, h);
      expect(slots[1].height / h).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('handles tiny viewport', () => {
    const slots = computeSlots(187, 333);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.height).toBeGreaterThan(0);
    }
  });

  it('slots are ordered top to bottom', () => {
    const slots = computeSlots(1920, 1080);
    expect(slots[0].yCenter).toBeLessThan(slots[1].yCenter);
    expect(slots[1].yCenter).toBeLessThan(slots[2].yCenter);
  });

  it('no two slots share any vertical pixel', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [375, 667]]) {
      const slots = computeSlots(w, h);
      // Exit bottom must be ≤ active top
      expect(slots[0].yBottom).toBeLessThanOrEqual(slots[1].yTop + 0.01);
      // Active bottom must be ≤ enter top
      expect(slots[1].yBottom).toBeLessThanOrEqual(slots[2].yTop + 0.01);
    }
  });
});

// ─── assignGroupToSlot ──────────────────────────────────────────────────────

describe('assignGroupToSlot', () => {
  const slots = computeSlots(1920, 1080);

  it('returns null before entry window', () => {
    expect(assignGroupToSlot(10, 15, 0.5, 0.5, 8, slots)).toBeNull();
  });

  it('returns null after exit window', () => {
    expect(assignGroupToSlot(10, 15, 0.5, 0.5, 16, slots)).toBeNull();
  });

  it('returns enter slot during entry', () => {
    const result = assignGroupToSlot(10, 15, 0.5, 0.5, 9.75, slots);
    expect(result).not.toBeNull();
    expect(result!.slotId).toBe(2);
    expect(result!.alpha).toBeGreaterThan(0);
    expect(result!.alpha).toBeLessThan(1);
  });

  it('returns active slot during active period', () => {
    const result = assignGroupToSlot(10, 15, 0.5, 0.5, 12, slots);
    expect(result).not.toBeNull();
    expect(result!.slotId).toBe(1);
    expect(result!.alpha).toBe(1.0);
    expect(result!.scale).toBe(1.0);
  });

  it('returns exit slot during exit', () => {
    const result = assignGroupToSlot(10, 15, 0.5, 0.5, 15.25, slots);
    expect(result).not.toBeNull();
    expect(result!.slotId).toBe(0);
    expect(result!.alpha).toBeGreaterThan(0);
    expect(result!.alpha).toBeLessThan(1);
  });

  it('alpha increases during entry', () => {
    const early = assignGroupToSlot(10, 15, 1.0, 0.5, 9.1, slots);
    const mid = assignGroupToSlot(10, 15, 1.0, 0.5, 9.5, slots);
    const late = assignGroupToSlot(10, 15, 1.0, 0.5, 9.9, slots);
    expect(early!.alpha).toBeLessThan(mid!.alpha);
    expect(mid!.alpha).toBeLessThan(late!.alpha);
  });

  it('alpha decreases during exit', () => {
    const early = assignGroupToSlot(10, 15, 0.5, 1.0, 15.1, slots);
    const mid = assignGroupToSlot(10, 15, 0.5, 1.0, 15.5, slots);
    const late = assignGroupToSlot(10, 15, 0.5, 1.0, 15.9, slots);
    expect(early!.alpha).toBeGreaterThan(mid!.alpha);
    expect(mid!.alpha).toBeGreaterThan(late!.alpha);
  });

  it('active at exact start time', () => {
    const result = assignGroupToSlot(10, 15, 0.5, 0.5, 10, slots);
    expect(result!.slotId).toBe(1);
    expect(result!.alpha).toBe(1.0);
  });

  it('active at exact end time', () => {
    const result = assignGroupToSlot(10, 15, 0.5, 0.5, 15, slots);
    expect(result!.slotId).toBe(1);
    expect(result!.alpha).toBe(1.0);
  });

  it('entry uses eased alpha (not linear)', () => {
    // At 50% through entry, eased alpha should be > 0.5 (ease-out cubic)
    const mid = assignGroupToSlot(10, 15, 1.0, 0.5, 9.5, slots);
    expect(mid!.alpha).toBeGreaterThan(0.5);
  });

  it('two consecutive phrases never share a slot at the same time', () => {
    // Phrase A: 10-13, Phrase B: 13-16, both with 0.5s entry/exit
    const slotA = assignGroupToSlot(10, 13, 0.5, 0.5, 13.25, slots); // A exiting
    const slotB = assignGroupToSlot(13, 16, 0.5, 0.5, 13.25, slots); // B active

    if (slotA && slotB) {
      // A is in exit slot (0), B is in active slot (1) — different slots
      expect(slotA.slotId).not.toBe(slotB.slotId);
    }
  });
});
