import {
  VarietyEngine,
  DRAMATIC_EXITS,
  type RevealStyle,
  type Composition,
  type ExitEffect,
} from "@/lib/varietyEngine";

export type RawWord = { word: string; start: number; end: number };

export interface PhraseBlock {
  wordRange: [number, number];
  text: string;
  wordCount: number;
  start: number;
  end: number;
  durationMs: number;
  heroWord: string;
  exitEffect: ExitEffect;
  composition: 'stack' | 'line' | 'center_word';
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

const SOLO_THRESHOLD_MS = 350;
const COLLAPSE_MS = 10;
const COMMA_END = /,\s*$/;

// ─── Grouping model: edit to the voice, size to the clock ───────────────────
// (see buildPhrases — laws 2/3/4/6 of the presentation design)
const BREATH_GAP_MIN_MS = 250;   // a silence this long is at least a micro-breath
const BREATH_GAP_FACTOR = 2.5;   // ...or this multiple of the local median gap
const BREATH_GAP_HARD_MS = 900;  // an unambiguous rest — always a boundary
const READ_WPS = 3.0;            // comfortable read-along rate (viewer also hears it)
const GESTALT_WPS = 5.0;         // faster than this is unreadable → show as one burst
const MIN_SHOW_MS = 450;         // never create a chunk shown for less than this
const GROUP_HARD_CAP = 7;        // Miller ceiling; the time budget usually binds first

// Words that must never END a chunk — connective tissue that needs its noun/verb.
const TRAILING_BAN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'from', 'with', 'my', 'your', 'his', 'her', 'their', 'our',
  'is', 'are', 'was', 'were', 'been', 'be',
]);
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

// Common words that rarely earn hero status. Scored with a penalty in the
// fallback pool only — a stop-word can still win if the phrase has nothing else.
// NOTE: prepositional particles (up, down, out, off, over, under, through)
// and wh-words (when, why, where) are DELIBERATELY EXCLUDED — they can be
// emphatic song heroes ("turn it UP!", "get OUT", "WHEN you were mine").
const STOP_WORDS = new Set([
  // pronouns — subject + object + possessive
  'i','me','my','we','us','our','you','your',
  'he','him','his','she','her','it','its','they','them','their',
  // articles + determiners
  'the','a','an','this','that',
  // auxiliaries + verbs-of-being
  'is','are','was','were','be','been','am','being',
  'do','does','did','doing',
  'have','has','had','having',
  'can','could','will','would','should','may','might',
  // small prepositions (excluding particle forms)
  'to','of','in','on','at','by','for','from','with',
  // conjunctions + fillers
  'and','or','but','so','as','than','just','very','really',
  'some','no','not',
  // cleaned contractions
  'im','aint','thats','dont','wont','lets','didnt','isnt','wasnt',
  'weve','youre','theyre','ive','shes','hes',
  // kept from original
  'how',
]);

// Absolute block — never hero words under any circumstances.
// Stripped from the candidate pool entirely, before scoring.
const HARD_BAN = new Set([
  'the','a','an','of',
]);

export function selectHeroWord(
  block: PhraseDraft,
  sectionHeroWords?: string[],
): { heroWord: string; heroMs: number } {
  // Filter to candidates: at least 2 chars AND not HARD_BAN.
  const allNonTrivial = block.words.filter((w) => w.clean.length > 1);
  const candidates = allNonTrivial.filter((w) => !HARD_BAN.has(w.clean));

  // Pathological: every non-trivial word is HARD_BAN (phrase is just "the of").
  // Scan the full words list for any non-banned word before giving up entirely.
  if (candidates.length === 0) {
    const fallback = block.words.find((w) => !HARD_BAN.has(w.clean)) ?? block.words[0];
    return {
      heroWord: fallback.clean.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      heroMs: fallback.d,
    };
  }

  // Prefer content words outright. Only fall back to stop-words if the phrase
  // has NO content words — in which case all candidates in the pool are stop-words
  // and a uniform penalty would cancel, so we omit it.
  const contentWords = candidates.filter((w) => !STOP_WORDS.has(w.clean));
  const pool = contentWords.length > 0 ? contentWords : candidates;

  const phraseLast = block.words[block.words.length - 1];

  const scored = pool.map((w) => {
    let score = 0;
    // Section hero match — strongest signal
    if (sectionHeroWords?.some((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === w.clean)) {
      score += 50;
    }
    // Duration bonus, capped
    score += Math.min(w.d / 100, 8);
    // Phrase-final position
    if (w === phraseLast) score += 5;
    // Word-length proxy
    score += Math.min(w.clean.length / 2, 4);
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

/**
 * Returns a dramatic exit suggestion IF the phrase text or hero semantically suggests one.
 * Returns null for phrases with no dramatic semantic signal.
 */
function semanticDramaticExit(block: PhraseDraft, sectionEnergy?: number): ExitEffect | null {
  let effect = phraseSemanticEffect(block.text);
  if (!effect) {
    const heroClean = block.words.reduce(
      (best, w) => (w.d > best.d ? w : best),
      block.words[0],
    ).clean;
    effect = phraseSemanticEffect(heroClean);
  }
  if (effect && sectionEnergy !== undefined) {
    effect = energyModifyEffect(effect, sectionEnergy);
  }
  if (effect && (DRAMATIC_EXITS as readonly string[]).includes(effect)) {
    return effect as ExitEffect;
  }
  return null;
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

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Collapse gap-smeared word runs BEFORE grouping (mirrors the render-side pass
// in sceneCompiler). Without this, interpolated words each holding several
// seconds make a breath group span 10s+ and the budget can't split it. See
// sceneCompiler.repackSmearedRuns for the full rationale.
const SMEAR_MAX_SUNG = 1.6;
const SMEAR_FLOW_GAP = 0.3;
const SMEAR_NAT_SLOT = 0.34;
function repackSmearedRuns(words: RawWord[]): RawWord[] {
  const out = words.map((w) => ({ ...w }));
  const stretched = (w: RawWord) => w.end - w.start > SMEAR_MAX_SUNG;
  let i = 0;
  while (i < out.length) {
    if (!stretched(out[i])) { i++; continue; }
    let b = i;
    while (b + 1 < out.length && stretched(out[b + 1]) && out[b + 1].start - out[b].end < SMEAR_FLOW_GAP) b++;
    const anchor = b + 1 < out.length && out[b + 1].start - out[b].end < SMEAR_FLOW_GAP ? out[b + 1] : null;
    if (anchor) {
      const prevEnd = i > 0 ? out[i - 1].end : 0;
      let end = anchor.start;
      for (let k = b; k >= i; k--) {
        let start = end - SMEAR_NAT_SLOT;
        if (start < prevEnd) start = Math.max(prevEnd, end - 0.05);
        if (start >= end) start = Math.max(0, end - 0.05);
        out[k].start = start; out[k].end = end; end = start;
      }
    }
    i = b + 1;
  }
  return out;
}

const spanMs = (ws: WordMeta[]) =>
  Math.round((ws[ws.length - 1].end - ws[0].start) * 1000);

/**
 * Law 2 — One breath, one thought. Split the word stream wherever the silence
 * between words exceeds a breath threshold, adaptive to the local tempo. This
 * replaces punctuation as the primary boundary: the ear parses on breath, and
 * lyric transcripts punctuate unreliably.
 */
function splitOnBreaths(words: WordMeta[]): WordMeta[][] {
  if (words.length <= 1) return words.length ? [words] : [];
  const gaps = words.slice(0, -1).map((w) => w.gap);
  const threshold = Math.max(BREATH_GAP_MIN_MS, median(gaps) * BREATH_GAP_FACTOR);
  const groups: WordMeta[][] = [];
  let cur: WordMeta[] = [words[0]];
  for (let i = 1; i < words.length; i++) {
    // Adaptive threshold catches tempo-relative breaths; the hard cap catches
    // unambiguous rests even when few words make the median unreliable.
    if (words[i - 1].gap > threshold || words[i - 1].gap > BREATH_GAP_HARD_MS) {
      groups.push(cur);
      cur = [];
    }
    cur.push(words[i]);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Law 3 — The clock rules the chunk. Duration is the referee:
 *  • too fast to read  → keep whole as a gestalt burst (viewer reads the shape)
 *  • fits the budget   → keep whole
 *  • otherwise         → split at the strongest internal seam and recurse,
 *                        never stranding a function word, never below the floor.
 */
function fitBudget(group: WordMeta[]): WordMeta[][] {
  if (group.length <= 1) return [group];
  const durSec = spanMs(group) / 1000;
  const wps = group.length / Math.max(0.1, durSec);
  if (wps > GESTALT_WPS) return [group]; // Case B: unreadable fast run → one burst

  const budget = Math.max(1, Math.floor(durSec * READ_WPS));
  const cap = Math.min(GROUP_HARD_CAP, budget);
  if (group.length <= cap) return [group]; // Case A-keep / Case C (held, few words)

  // Strongest seam that leaves both sides readable (≥ floor) and unstranded.
  // Split on grammatical grain, not just balance: prefer breaking BEFORE a new
  // clause/line. The transcript capitalizes line/sentence starts, so a
  // capitalized content word is a strong "new thought begins here" signal —
  // e.g. "…treat you right | Get no goodbyes" instead of "…you right Get | no".
  const mid = (group.length - 1) / 2;
  const startsClause = (w: WordMeta) =>
    /^[A-Z]/.test(w.word) && w.clean.length > 1 && !STOP_WORDS.has(w.clean);
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < group.length - 1; i++) {
    if (spanMs(group.slice(0, i + 1)) < MIN_SHOW_MS) continue;
    if (spanMs(group.slice(i + 1)) < MIN_SHOW_MS) continue;
    const strands = TRAILING_BAN.has(group[i].clean);
    const hasComma = COMMA_END.test(group[i].word);
    const newClauseNext = startsClause(group[i + 1]); // break lands a fresh line
    const score = group[i].gap
      + (newClauseNext ? 400 : 0)
      + (hasComma ? 250 : 0)
      + (strands ? -1000 : 0)
      - Math.abs(i - mid) * 8;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx < 0) return [group]; // no clean cut → whole beats strobing
  return [
    ...fitBudget(group.slice(0, bestIdx + 1)),
    ...fitBudget(group.slice(bestIdx + 1)),
  ];
}

/**
 * Law 4 — Earn the isolation. A word deserves its own moment only if it is a
 * content word, prosodically peaked (held, or landing on a downbeat), and has
 * time to land. Cheap stop-words never qualify, so isolation stays meaningful.
 */
function isEarnedSolo(w: WordMeta, siblings: WordMeta[], beats?: number[]): boolean {
  if (w.clean.length < 2 || STOP_WORDS.has(w.clean)) return false;
  const med = median(siblings.map((s) => s.d)) || w.d;
  // Held relative to the line, with a floor low enough to catch rhyme landings
  // (e.g. a ~520ms final word) that the ear registers as the phrase's arrival.
  const held = w.d >= Math.max(500, med * 1.5);
  const onDownbeat = !!beats?.some((b) => Math.abs(b - w.start) <= 0.08);
  const enoughTime = w.d >= MIN_SHOW_MS;
  return enoughTime && (held || onDownbeat);
}

/**
 * Peel an earned hero at a chunk's trailing edge into its own moment, so it
 * truly stands alone on screen rather than merely being emphasized in place.
 * Only the last word is peeled — isolating a middle word fragments the thought.
 */
function extractSoloHeroes(chunks: WordMeta[][], beats?: number[]): WordMeta[][] {
  const out: WordMeta[][] = [];
  for (const chunk of chunks) {
    if (chunk.length >= 2) {
      const last = chunk[chunk.length - 1];
      const rest = chunk.slice(0, -1);
      if (isEarnedSolo(last, chunk, beats)
        && spanMs(rest) >= MIN_SHOW_MS
        && last.d >= MIN_SHOW_MS) {
        out.push(rest, [last]);
        continue;
      }
    }
    out.push(chunk);
  }
  return out;
}

/**
 * Law 6 — Lock the refrain. A recurring hook must look identical every time so
 * repetition compounds into memory. Force every occurrence of the same short
 * line to share one presentation (composition, reveal, hero, hold).
 */
function lockRefrains(phrases: PhraseBlock[]): void {
  const byKey = new Map<string, PhraseBlock[]>();
  for (const p of phrases) {
    if (p.wordCount > 6) continue;
    const key = normalizeHookKey(p.text);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(p);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // Canonical = the longest-held occurrence (the most deliberate performance).
    const canon = group.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    for (const p of group) {
      p.composition = canon.composition;
      p.revealStyle = canon.revealStyle;
      p.heroWord = canon.heroWord;
      p.holdClass = canon.holdClass;
    }
  }
}

/**
 * Group words into display phrases by editing to the voice, not to punctuation:
 *   1. breath groups (law 2)      — split on silence, the ear's own boundary
 *   2. reading budget (law 3)     — duration decides keep / sub-split / gestalt
 *   3. earned solo heroes (law 4) — isolate a peaked, salient content word
 *   4. refrain lock (law 6)       — recurring hooks presented identically
 * `beats` (downbeat times, seconds) is optional; when absent, downbeat-based
 * isolation is simply inactive.
 */
export function buildPhrases(
  words: RawWord[],
  sectionContext?: SectionContext[],
  beats?: number[],
): PhraseEngineResult {
  if (!words.length) return { hookPhrase: "", signaturePhrase: "", phrases: [], adlibIndices: new Set<number>() };

  // De-smear interpolated timings first so grouping sees when words are sung,
  // not the padded gap. Preserves count/order, so wordRange indices are intact.
  const cleanedWords = repackSmearedRuns(words);
  const { mainWords, adlibIndices } = detectCollapsedRuns(cleanedWords);
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

  // Segment to the voice: breath groups → reading budget → earned solo heroes.
  const breathGroups = splitOnBreaths(wordMeta);
  const budgeted = breathGroups.flatMap((g) => fitBudget(g));
  const chunks = extractSoloHeroes(budgeted, beats);
  const finalBlocks: PhraseDraft[] = chunks.filter((p) => p.length > 0).map((p) => ({
    words: p,
    durationMs: Math.round((p[p.length - 1].end - p[0].start) * 1000),
    startTime: p[0].start,
    endTime: p[p.length - 1].end,
    text: normalizePhraseText(p.map((w) => w.word).join(" ")),
    wordCount: p.length,
  }));
  const phrases: PhraseBlock[] = [];
  const variety = new VarietyEngine();

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

  for (let i = 0; i < finalBlocks.length; i++) {
    const block = finalBlocks[i];

    const secIdx = sectionIndexForBlock(block);
    variety.setSection(secIdx);
    const section = sectionContext?.[secIdx] ?? sectionContext?.find(
      (s) => block.startTime >= s.startSec && block.startTime < s.endSec,
    );
    const sectionHeroes = section?.heroWords ?? [];
    const sectionEnergy = section?.avgEnergy;

    const { heroWord } = selectHeroWord(block, sectionHeroes);

    // A lone word is inherently a center moment. It reads as a climax when it's
    // held or lands on a downbeat (the isolation was already earned upstream in
    // extractSoloHeroes; here we judge it against absolutes, not against itself).
    const soloWord = block.wordCount === 1 ? block.words[0] : null;
    const onDownbeat = !!(soloWord && beats?.some((b) => Math.abs(b - soloWord.start) <= 0.08));
    const earnedSolo = !!soloWord && (block.durationMs >= 600 || onDownbeat);

    const aiWantsCenterWord = block.wordCount === 1 ||
      (block.wordCount === 2 && block.durationMs >= 1500);

    const aiDramaticExit = semanticDramaticExit(block, sectionEnergy);
    const aiClimax = aiDramaticExit !== null || earnedSolo ||
      (sectionEnergy !== undefined && sectionEnergy >= 0.8 && block.wordCount <= 4);

    const durationSec = block.durationMs / 1000;

    const revealStyle: RevealStyle = variety.pickReveal({
      durationSec,
      wordCount: block.wordCount,
    });
    const composition: Composition = variety.pickComposition({
      wordCount: block.wordCount,
      durationSec,
      aiWantsCenterWord,
    });
    const exitEffect: ExitEffect = variety.pickExit({
      aiClimax,
      aiDramaticExit: aiDramaticExit ?? undefined,
    });

    const startIndex = block.words[0].index;
    const endIndex = block.words[block.words.length - 1].index;
    const holdClass = assignHoldClass(block);

    phrases.push({
      wordRange: [startIndex, endIndex],
      heroWord,
      exitEffect,
      composition,
      revealStyle,
      holdClass,
      text: block.text,
      wordCount: block.wordCount,
      start: block.startTime,
      end: block.endTime,
      durationMs: block.durationMs,
    });
  }

  // Recurring hooks look identical every time, so repetition builds memory.
  lockRefrains(phrases);

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
