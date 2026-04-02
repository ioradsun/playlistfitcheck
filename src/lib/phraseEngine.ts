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
}

export interface PhraseEngineResult {
  phrases: PhraseBlock[];
  hookPhrase: string;
  adlibIndices: Set<number>;
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

export function selectHeroWord(block: PhraseDraft): { heroWord: string; heroMs: number } {
  let best = block.words[0];
  for (const word of block.words) {
    const usable = word.clean.length > 1;
    const bestUsable = best.clean.length > 1;
    if (usable && !bestUsable) {
      best = word;
      continue;
    }
    if (usable === bestUsable && word.d > best.d) best = word;
  }
  return {
    heroWord: best.clean.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    heroMs: best.d,
  };
}

export function calcExitEffect(
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

export function buildPhrases(words: RawWord[]): PhraseEngineResult {
  if (!words.length) return { hookPhrase: "", phrases: [], adlibIndices: new Set<number>() };

  const { mainWords, adlibIndices } = detectCollapsedRuns(words);
  if (!mainWords.length) return { hookPhrase: "", phrases: [], adlibIndices };

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
  let prevEffect: string | null = null;
  for (let i = 0; i < finalBlocks.length; i++) {
    const block = finalBlocks[i];
    const next = i < finalBlocks.length - 1 ? finalBlocks[i + 1] : null;
    const { heroWord } = selectHeroWord(block);
    const exitEffect = calcExitEffect(block, next, prevEffect);
    prevEffect = exitEffect;
    const startIndex = block.words[0].index;
    const endIndex = block.words[block.words.length - 1].index;
    phrases.push({
      wordRange: [startIndex, endIndex],
      heroWord,
      exitEffect,
      text: block.text,
      wordCount: block.wordCount,
      start: block.startTime,
      end: block.endTime,
      durationMs: block.durationMs,
    });
  }

  const hookPhrase = inferHookPhrase(phrases);
  return { hookPhrase, phrases, adlibIndices };
}
