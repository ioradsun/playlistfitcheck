import { deriveRevealStyle, type RevealStyle } from "@/lib/revealStyle";

export type RawWord = { word: string; start: number; end: number };

export interface PhraseBlock {
  wordRange: [number, number];
  text: string;
  wordCount: number;
  start: number;
  end: number;
  durationMs: number;
  heroWord: string;
  exitEffect: string;
  composition: 'stack' | 'line' | 'center_word';
  bias: 'left' | 'center' | 'right';
  revealStyle: RevealStyle;
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
}

export interface PhraseEngineResult {
  phrases: PhraseBlock[];
  hookPhrase: string;
  signaturePhrase: string;
  adlibIndices: Set<number>;
}

export interface SectionContext {
  startSec: number;
  endSec: number;
  heroWords: string[];
  avgEnergy?: number;
}

type WordMeta = RawWord & {
  index: number;
  d: number;
  gap: number;
  clean: string;
};

type PhraseDraft = {
  words: WordMeta[];
  durationMs: number;
  startTime: number;
  endTime: number;
  text: string;
  wordCount: number;
};

const MAX_PHRASE_WORDS = 6;
const SOLO_THRESHOLD_MS = 350;
const COLLAPSE_MS = 10;
const PUNCT_END = /[.?!]["']?\s*$/;
const COMMA_END = /,\s*$/;
const VALID_EXIT_EFFECTS = new Set([
  "fade", "drift_up", "shrink", "dissolve",
  "cascade", "scatter", "slam", "glitch", "burn",
]);

export function normalizePhraseText(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function detectCollapsedRuns(
  words: RawWord[],
): { mainWords: Array<RawWord & { index: number }>; adlibIndices: Set<number> } {
  const adlibIndices = new Set<number>();
  let i = 0;
  while (i < words.length) {
    const startMs = Math.round(words[i].start * 1000);
    let j = i;
    while (j + 1 < words.length) {
      const nextStartMs = Math.round(words[j + 1].start * 1000);
      if (Math.abs(nextStartMs - startMs) > COLLAPSE_MS) break;
      j++;
    }

    const clusterSize = j - i + 1;
    if (clusterSize >= 2) {
      for (let k = i; k <= j; k++) adlibIndices.add(k);
      i = j + 1;
      continue;
    }

    const d = Math.round((words[i].end - words[i].start) * 1000);
    const prevD = i > 0 ? Math.round((words[i - 1].end - words[i - 1].start) * 1000) : Infinity;
    const nextD = i < words.length - 1
      ? Math.round((words[i + 1].end - words[i + 1].start) * 1000)
      : Infinity;
    if (d < COLLAPSE_MS && (prevD < COLLAPSE_MS || nextD < COLLAPSE_MS)) {
      adlibIndices.add(i);
    }
    i++;
  }

  const mainWords = words
    .map((w, index) => ({ ...w, index }))
    .filter((w) => !adlibIndices.has(w.index));
  return { mainWords, adlibIndices };
}

export function splitOnPunctuation(words: WordMeta[]): WordMeta[][] {
  const phrases: WordMeta[][] = [];
  let current: WordMeta[] = [];
  for (const word of words) {
    current.push(word);
    if (PUNCT_END.test(word.word)) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);
  return phrases;
}

export function splitOversized(phrase: WordMeta[]): WordMeta[][] {
  if (phrase.length <= MAX_PHRASE_WORDS) return [phrase];

  const splitAt = (idx: number): WordMeta[][] => {
    const left = phrase.slice(0, idx + 1);
    const right = phrase.slice(idx + 1);
    return [...splitOversized(left), ...splitOversized(right)];
  };

  for (let i = 0; i < phrase.length - 1; i++) {
    if (COMMA_END.test(phrase[i].word)) {
      return splitAt(i);
    }
  }

  const mid = phrase.length / 2;
  let bestScore = -Infinity;
  let bestIndex = Math.floor(mid) - 1;
  for (let i = 0; i < phrase.length - 1; i++) {
    const gap = phrase[i].gap;
    const isWeak = phrase[i].clean.length <= 1;
    const hasComma = COMMA_END.test(phrase[i].word);
    const balanceBonus = -Math.abs(i - mid) * 10;
    const score = gap + (isWeak ? -500 : 0) + (hasComma ? 200 : 0) + balanceBonus;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return splitAt(bestIndex);
}

export function applySoloSplits(blocks: PhraseDraft[]): PhraseDraft[] {
  const output: PhraseDraft[] = [];
  for (const block of blocks) {
    const last = block.words[block.words.length - 1];
    if (!last) {
      output.push(block);
      continue;
    }

    const remainingWords = block.words.slice(0, -1);
    const remainingDurationMs = remainingWords.length
      ? Math.round((remainingWords[remainingWords.length - 1].end - remainingWords[0].start) * 1000)
      : 0;
    const canSplit = last.d >= SOLO_THRESHOLD_MS &&
      last.clean.length > 1 &&
      remainingWords.length >= 1 &&
      remainingDurationMs >= SOLO_THRESHOLD_MS;

    if (!canSplit) {
      output.push(block);
      continue;
    }

    output.push({
      words: remainingWords,
      durationMs: remainingDurationMs,
      startTime: remainingWords[0].start,
      endTime: remainingWords[remainingWords.length - 1].end,
      text: normalizePhraseText(remainingWords.map((w) => w.word).join(" ")),
      wordCount: remainingWords.length,
    });
    output.push({
      words: [last],
      durationMs: last.d,
      startTime: last.start,
      endTime: last.end,
      text: normalizePhraseText(last.word),
      wordCount: 1,
    });
  }
  return output;
}

const STOP_WORDS = new Set([
  'i','me','my','we','our','the','a','an','it','its','is','are','was',
  'that','this','how','some','they','you','your','he','she','to','of',
  'in','on','for','so','do','no','and','but','or','just','with','can',
  'im','aint','thats','dont','wont','lets',
]);

export function selectHeroWord(
  block: PhraseDraft,
  sectionHeroWords?: string[],
): { heroWord: string; heroMs: number } {
  const candidates = block.words.filter(w => w.clean.length > 1);
  if (candidates.length === 0) {
    const w = block.words[0];
    return { heroWord: w.clean.toUpperCase().replace(/[^A-Z0-9]/g, ""), heroMs: w.d };
  }

  const scored = candidates.map(w => {
    let score = 0;
    // Section hero match — strongest signal
    if (sectionHeroWords?.some(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === w.clean)) {
      score += 50;
    }
    // Duration bonus, capped
    score += Math.min(w.d / 100, 8);
    // Phrase-final position
    if (w === block.words[block.words.length - 1]) score += 5;
    // Word length proxy (longer words tend to be more meaningful)
    score += Math.min(w.clean.length / 2, 4);
    // Stop-word penalty (not hard block)
    if (STOP_WORDS.has(w.clean)) score -= 15;
    return { word: w, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].word;
  return {
    heroWord: best.clean.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    heroMs: best.d,
  };
}

export function _calcExitEffectTiming(
  block: PhraseDraft,
  nextBlock: PhraseDraft | null,
  prevEffect: string | null,
): string {
  const lastMs = block.words[block.words.length - 1]?.d ?? 0;
  const gapAfterMs = nextBlock ? Math.round((nextBlock.startTime - block.endTime) * 1000) : 2000;
  const wps = block.durationMs > 0 ? block.wordCount / (block.durationMs / 1000) : block.wordCount;
  const isSolo = block.wordCount === 1 && lastMs >= SOLO_THRESHOLD_MS;
  let effect: string;

  if (isSolo) {
    if (lastMs >= 1000) effect = gapAfterMs >= 600 ? "dissolve" : "slam";
    else if (lastMs >= 500) effect = gapAfterMs >= 600 ? "fade" : "burn";
    else effect = gapAfterMs >= 600 ? "drift_up" : "fade";
  } else if (wps >= 5) {
    effect = gapAfterMs < 300 ? "glitch" : "scatter";
  } else if (gapAfterMs >= 1000) {
    effect = "dissolve";
  } else if (gapAfterMs >= 500) {
    effect = "drift_up";
  } else if (lastMs >= 600) {
    effect = "burn";
  } else if (wps <= 2) {
    effect = "drift_up";
  } else {
    effect = "fade";
  }

  if (effect === prevEffect) {
    const fallback: Record<string, string> = {
      slam: "burn",
      burn: "slam",
      dissolve: "fade",
      fade: "dissolve",
      drift_up: "fade",
      glitch: "scatter",
      scatter: "glitch",
    };
    effect = fallback[effect] ?? "fade";
  }
  return VALID_EXIT_EFFECTS.has(effect) ? effect : "fade";
}

const PHRASE_SEMANTIC_PATTERNS: [RegExp, string][] = [
  [/\b(rise|fly|soar|heaven|heavens|sky|ascend|above|higher|up|float|clouds)\b/i, 'drift_up'],
  [/\b(fall|drop|crash|down|decline|descend|collapse|knees|goliath|smash|hit|slam|strike)\b/i, 'slam'],
  [/\b(fire|flame|burn|blaze|gold|platinum|diamond|shine|glow|ignite|inspired)\b/i, 'burn'],
  [/\b(scatter|shatter|break|burst|butterfly|butterflies|pieces|explode|confetti)\b/i, 'scatter'],
  [/\b(fade|ghost|vanish|disappear|dream|sleep|memory|memories|surrender|gone)\b/i, 'dissolve'],
  [/\b(glitch|static|system|digital|corrupt|hack|wire|signal)\b/i, 'glitch'],
];

function phraseSemanticEffect(text: string): string | null {
  for (const [pattern, effect] of PHRASE_SEMANTIC_PATTERNS) {
    if (pattern.test(text)) return effect;
  }
  return null;
}

function energyModifyEffect(effect: string, sectionEnergy: number | undefined): string {
  if (sectionEnergy == null) return effect;
  if (sectionEnergy > 0.7 && (effect === 'fade' || effect === 'dissolve')) return 'burn';
  if (sectionEnergy < 0.3 && (effect === 'slam' || effect === 'glitch')) return 'fade';
  return effect;
}

export function calcExitEffectV2(
  block: PhraseDraft,
  nextBlock: PhraseDraft | null,
  prevEffect: string | null,
  sectionEnergy?: number,
): string {
  // Layer 1: phrase-text semantic scan
  let effect = phraseSemanticEffect(block.text);

  // Layer 2: heroWord semantic scan (if phrase text didn't match)
  if (!effect) {
    const heroClean = block.words.reduce((best, w) =>
      w.d > best.d ? w : best, block.words[0]).clean;
    effect = phraseSemanticEffect(heroClean);
  }

  // Layer 3: energy modifier
  if (effect) {
    effect = energyModifyEffect(effect, sectionEnergy);
  }

  // Layer 4: timing fallback
  if (!effect) {
    effect = _calcExitEffectTiming(block, nextBlock, prevEffect);
  }

  // Layer 5: anti-repeat
  if (effect === prevEffect) {
    const fallback: Record<string, string> = {
      slam: "burn", burn: "slam", dissolve: "fade", fade: "dissolve",
      drift_up: "fade", glitch: "scatter", scatter: "glitch",
    };
    effect = fallback[effect] ?? "fade";
  }

  return VALID_EXIT_EFFECTS.has(effect) ? effect : "fade";
}

export function normalizeHookKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function inferHookPhrase(
  phrases: Array<{ text: string; wordCount: number; start: number; end: number }>,
): string {
  if (!phrases.length) return "";

  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    const key = normalizeHookKey(phrase.text);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let bestText = phrases[0].text;
  let bestScore = -Infinity;

  for (const phrase of phrases) {
    const key = normalizeHookKey(phrase.text);
    const freq = counts.get(key) || 1;
    const duration = Math.max(0, phrase.end - phrase.start);
    const compactness = phrase.wordCount >= 1 && phrase.wordCount <= 4 ? 10 : 0;
    const score = freq * 100 + compactness + duration * 10 + Math.min(phrase.wordCount, 6);

    if (score > bestScore) {
      bestScore = score;
      bestText = phrase.text;
    }
  }

  return bestText;
}

export function inferSignaturePhrase(
  phrases: Array<{ text: string; wordCount: number; start: number; end: number }>,
  sections?: Array<{ startSec: number; endSec: number; peakEnergy?: number; role?: string }>,
): string {
  if (!phrases.length) return "";

  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    const key = normalizeHookKey(phrase.text);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const scored = phrases
    .filter(p => p.text.length > 10 && p.wordCount >= 3)
    .map(p => {
      let score = 0;
      // Identity markers
      if (/[A-Z]-[A-Z]/.test(p.text) || /\b(name|remember|I am|we are|call me|that's a name)\b/i.test(p.text)) {
        score += 15;
      }
      // Uniqueness
      const freq = counts.get(normalizeHookKey(p.text)) || 1;
      if (freq <= 2) score += 12;
      if (freq === 1) score += 5;
      // Emotional intensity
      const section = sections?.find(s => p.start >= s.startSec && p.start < s.endSec);
      score += (section?.peakEnergy ?? 0.5) * 10;
      // Declarative structure
      if (/\b(watch us|we will|we'll|gonna|we are|let's|remember|inspired)\b/i.test(p.text)) {
        score += 8;
      }
      // Verse position
      const role = (section?.role ?? '').toLowerCase();
      if (role.includes('verse') || role.includes('main')) score += 5;
      // Word count sweet spot
      if (p.wordCount >= 5 && p.wordCount <= 10) score += 3;
      return { text: p.text, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.text ?? phrases[0]?.text ?? "";
}

function assignComposition(block: PhraseDraft): 'stack' | 'line' | 'center_word' {
  // Solo word or 2-word phrase with a long hold → center_word (big, centered, impactful)
  if (block.wordCount === 1) return 'center_word';
  if (block.wordCount === 2 && block.durationMs >= 1500) return 'center_word';
  // Long phrases → stack (vertical, intimate, multi-line)
  if (block.wordCount >= 7) return 'stack';
  // Medium-long phrases occasionally stack for variety
  if (block.wordCount >= 5 && block.durationMs >= 2000) return 'stack';
  // Default: line (horizontal, clean)
  return 'line';
}

function assignBias(
  block: PhraseDraft,
  phraseIndex: number,
  composition: string,
): 'left' | 'center' | 'right' {
  // Solo/center_word compositions → always center
  if (composition === 'center_word') return 'center';
  // Stacked compositions → alternate left/right for visual movement
  if (composition === 'stack') {
    return phraseIndex % 2 === 0 ? 'left' : 'right';
  }
  // Line compositions: cycle through center/left/right
  // with center weighted heavier (appears ~50% of the time)
  const cycle = phraseIndex % 5;
  if (cycle === 1) return 'left';
  if (cycle === 3) return 'right';
  return 'center';
}


function assignHoldClass(block: PhraseDraft): 'short_hit' | 'medium_groove' | 'long_emotional' {
  // Very fast → short_hit (punch and go)
  if (block.durationMs < 500) return 'short_hit';
  // Rapid multi-word → short_hit
  const wps = block.wordCount / Math.max(0.1, block.durationMs / 1000);
  if (wps >= 5 && block.durationMs < 1000) return 'short_hit';
  // Solo word with long hold → long_emotional (let it breathe)
  if (block.wordCount === 1 && block.durationMs >= 800) return 'long_emotional';
  // Long phrase → long_emotional
  if (block.durationMs >= 3000) return 'long_emotional';
  // Slow deliberate phrases → long_emotional
  if (block.durationMs >= 1500 && wps < 2) return 'long_emotional';
  // Default: medium_groove
  return 'medium_groove';
}

export function buildPhrases(
  words: RawWord[],
  sectionContext?: SectionContext[],
): PhraseEngineResult {
  if (!words.length) return { hookPhrase: "", signaturePhrase: "", phrases: [], adlibIndices: new Set<number>() };

  const { mainWords, adlibIndices } = detectCollapsedRuns(words);
  if (!mainWords.length) return { hookPhrase: "", signaturePhrase: "", phrases: [], adlibIndices };

  const wordMeta: WordMeta[] = mainWords.map((w, idx) => {
    const next = mainWords[idx + 1];
    return {
      ...w,
      d: Math.round((w.end - w.start) * 1000),
      gap: next ? Math.round((next.start - w.end) * 1000) : 0,
      clean: w.word.toLowerCase().replace(/[^a-z0-9]/g, ""),
    };
  });

  const punctPhrases = splitOnPunctuation(wordMeta);
  const subPhrases = punctPhrases.flatMap((phrase) => splitOversized(phrase));
  const initialBlocks: PhraseDraft[] = subPhrases.filter((p) => p.length > 0).map((p) => ({
    words: p,
    durationMs: Math.round((p[p.length - 1].end - p[0].start) * 1000),
    startTime: p[0].start,
    endTime: p[p.length - 1].end,
    text: normalizePhraseText(p.map((w) => w.word).join(" ")),
    wordCount: p.length,
  }));

  const finalBlocks = applySoloSplits(initialBlocks);
  const phrases: PhraseBlock[] = [];
  const sectionReveals = new Map<number, RevealStyle[]>();
  const sectionIndexForBlock = (block: PhraseDraft): number => {
    if (!sectionContext || sectionContext.length === 0) return 0;
    for (let s = 0; s < sectionContext.length; s++) {
      const sec = sectionContext[s];
      if (block.startTime >= sec.startSec && block.startTime < sec.endSec) {
        return s;
      }
    }
    return Math.max(0, sectionContext.length - 1);
  };

  let prevEffect: string | null = null;
  for (let i = 0; i < finalBlocks.length; i++) {
    const block = finalBlocks[i];
    const next = i < finalBlocks.length - 1 ? finalBlocks[i + 1] : null;

    const secIdx = sectionIndexForBlock(block);
    const recent = sectionReveals.get(secIdx) ?? [];

    // Find which section this phrase belongs to
    const section = sectionContext?.[secIdx] ?? sectionContext?.find(s =>
      block.startTime >= s.startSec && block.startTime < s.endSec
    );
    const sectionHeroes = section?.heroWords ?? [];
    const sectionEnergy = section?.avgEnergy;

    const { heroWord } = selectHeroWord(block, sectionHeroes);
    const exitEffect = calcExitEffectV2(block, next, prevEffect, sectionEnergy);
    prevEffect = exitEffect;
    const startIndex = block.words[0].index;
    const endIndex = block.words[block.words.length - 1].index;
    const composition = assignComposition(block);
    const bias = assignBias(block, i, composition);
    const revealStyle = deriveRevealStyle(block.durationMs / 1000, block.wordCount, recent);
    sectionReveals.set(secIdx, [revealStyle, ...recent].slice(0, 2));
    const holdClass = assignHoldClass(block);
    phrases.push({
      wordRange: [startIndex, endIndex],
      heroWord,
      exitEffect,
      composition,
      bias,
      revealStyle,
      holdClass,
      text: block.text,
      wordCount: block.wordCount,
      start: block.startTime,
      end: block.endTime,
      durationMs: block.durationMs,
    });
  }

  const hookPhrase = inferHookPhrase(phrases);
  const signaturePhrase = inferSignaturePhrase(
    phrases,
    sectionContext?.map(s => ({
      startSec: s.startSec,
      endSec: s.endSec,
      peakEnergy: s.avgEnergy,
      role: undefined,
    })),
  );
  return { hookPhrase, signaturePhrase, phrases, adlibIndices };
}
