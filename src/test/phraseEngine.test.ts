import { describe, it, expect } from 'vitest';
import { buildPhrases, type RawWord } from '@/lib/phraseEngine';

describe('phraseEngine — voice-driven grouping', () => {
  it('splits on breath (silence), not on a fixed word count', () => {
    // Two thoughts separated by a >2s rest should become two phrases.
    const words: RawWord[] = [
      { word: 'hello', start: 0, end: 0.4 },
      { word: 'world', start: 0.45, end: 0.9 },
      { word: 'goodbye', start: 3.0, end: 3.4 }, // 2.1s breath before this
      { word: 'now', start: 3.45, end: 3.9 },
    ];
    const { phrases } = buildPhrases(words);
    expect(phrases).toHaveLength(2);
    expect(phrases[0].text.toLowerCase()).toContain('hello world');
    expect(phrases[1].text.toLowerCase()).toContain('goodbye now');
  });

  it('keeps an unreadably fast run whole as one gestalt burst', () => {
    // 5 words in ~0.6s (>5 wps) — cannot be read individually, so it stays one.
    const words: RawWord[] = [
      { word: 'run', start: 0.0, end: 0.1 },
      { word: 'run', start: 0.12, end: 0.22 },
      { word: 'as', start: 0.24, end: 0.34 },
      { word: 'fast', start: 0.36, end: 0.46 },
      { word: 'go', start: 0.48, end: 0.6 },
    ];
    const { phrases } = buildPhrases(words);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].wordCount).toBe(5);
  });

  it('isolates an earned hero: a held, salient final word gets its own moment', () => {
    const words: RawWord[] = [
      { word: 'hold', start: 0.0, end: 0.3 },
      { word: 'me', start: 0.33, end: 0.5 },
      { word: 'close', start: 0.53, end: 1.6 }, // held ~1.1s → earned solo
    ];
    const { phrases } = buildPhrases(words);
    const last = phrases[phrases.length - 1];
    expect(last.wordCount).toBe(1);
    expect(last.text.toLowerCase()).toContain('close');
    expect(last.composition).toBe('center_word');
  });

  it('does NOT isolate a short function word', () => {
    // Same shape but the final word is a brief stop-word — never a hero.
    const words: RawWord[] = [
      { word: 'hold', start: 0.0, end: 0.3 },
      { word: 'onto', start: 0.33, end: 0.6 },
      { word: 'it', start: 0.63, end: 0.75 }, // short stop-word
    ];
    const { phrases } = buildPhrases(words);
    // Stays as a single readable chunk, not peeled into a solo "it".
    expect(phrases.some((p) => p.wordCount === 1 && p.text.toLowerCase() === 'it')).toBe(false);
  });

  it('locks the refrain: repeated hook lines share one presentation', () => {
    const hook = (t: number): RawWord[] => [
      { word: 'ride', start: t + 0.0, end: t + 0.3 },
      { word: 'or', start: t + 0.33, end: t + 0.5 },
      { word: 'die', start: t + 0.53, end: t + 1.2 },
    ];
    // Two identical hook lines separated by a breath.
    const words: RawWord[] = [...hook(0), ...hook(4)];
    const { phrases } = buildPhrases(words);
    const rideOrDie = phrases.filter((p) => p.text.toLowerCase().includes('die'));
    expect(rideOrDie.length).toBeGreaterThanOrEqual(2);
    const [a, b] = rideOrDie;
    expect(a.composition).toBe(b.composition);
    expect(a.revealStyle).toBe(b.revealStyle);
    expect(a.heroWord).toBe(b.heroWord);
    expect(a.holdClass).toBe(b.holdClass);
  });

  it('preserves original word indices in wordRange (for AI phrase alignment)', () => {
    const words: RawWord[] = [
      { word: 'one', start: 0, end: 0.4 },
      { word: 'two', start: 0.45, end: 0.9 },
      { word: 'three', start: 3.0, end: 3.5 }, // breath before
    ];
    const { phrases } = buildPhrases(words);
    const flatFirst = phrases[0].wordRange[0];
    expect(flatFirst).toBe(0);
    // Last phrase's range should reference the real index of "three" (2).
    expect(phrases[phrases.length - 1].wordRange[1]).toBe(2);
  });
});
