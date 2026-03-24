import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

const CINEMATIC_DIRECTION_PROMPT = `(deprecated — use mode: "scene" + mode: "words")`;

const SCENE_DIRECTION_PROMPT = `
You are a film director designing the visual world for a lyric video.

You will receive:
1. Song lyrics with timestamps
2. Audio-detected sections with roles
3. A listener scene — the emotional seed

THE LISTENER SCENE IS YOUR ANCHOR.
Root ALL section descriptions in this world.
If none is provided, infer one from the lyrics.

Return ONLY valid JSON. No markdown.

═══════════════════════════════════════
SONG IDENTITY
═══════════════════════════════════════

REQUIRED:
- "description": single evocative sentence (max 15 words) — what this song sounds/feels like
- "mood": single dominant emotional word

OPTIONAL:
- "meaning": { "theme": string, "summary": string, "imagery": [strings] }

PRESETS:
- "sceneTone": "dark" | "light" | "mixed"
- "typography": "bold-impact" | "clean-modern" | "elegant-serif" | "raw-condensed" | "whisper-soft" | "tech-mono" | "display-heavy" | "editorial-light"
- "texture": "fire" | "rain" | "snow" | "smoke" | "dust" | "stars" | "glare"
- "emotionalArc": "slow-burn" | "surge" | "collapse" | "dawn" | "eruption"

═══════════════════════════════════════
SECTIONS
═══════════════════════════════════════

For EACH section:
- "sectionIndex": integer
- "description": vivid 1-sentence scene rooted in the listener's world
- "visualMood": "intimate" | "anthemic" | "dreamy" | "aggressive" | "melancholy" | "euphoric" | "eerie" | "vulnerable" | "triumphant" | "nostalgic" | "defiant" | "hopeful" | "raw" | "hypnotic"
- "dominantColor": bold hex (#RRGGBB), unique per section

OPTIONAL per section:
- "texture": override song default
- "atmosphereState": "still" | "drifting" | "falling" | "swirling"

Return JSON only.
`;

const WORD_DIRECTION_PROMPT = `
You are a shot designer for a cinematic lyric video.

Each phrase = one screen. Words appear together, animate together, exit together.
The viewer sees one phrase at a time, then it's replaced by the next.

You will receive a word stream, one word per line:
  w  0  Tell               180ms
  w  1  me,                200ms  [BREATH 300ms]
  w  2  is                 150ms
  w  4  soul               250ms
  w  6  sale?              320ms  [BREATH 400ms]

HARD RULES:
  1. A phrase NEVER crosses a [BREATH] marker. Breaths are walls.
  2. Max 6 words per phrase.
  3. Every w-number belongs to exactly one phrase. No gaps, no overlaps.
  4. heroWord must be an EXACT word from that phrase. Copy it from the stream.

PHRASING:
  Group words into shots that feel like film cuts.
  Alternate between punch (1-2 words) and flow (3-4 words).
  5-6 word phrases are fine for fast sections but shouldn't dominate.
  Avoid 3+ consecutive phrases of the same size.
  When lyrics repeat (chorus/hook), use the SAME grouping pattern each time.
  Split at meaning boundaries, not mid-phrase.
  "Heaven on Earth" is one unit. "ain't touchin'" is one unit. Don't break them.

HERO WORD:
  The most concrete, imageable word in the phrase.
  Prefer nouns and strong verbs over pronouns, connectors, or filler.
  If a phrase is 1 word, that word is the hero.

WORD DIRECTIVES:
  Tag emotionally significant words:
    "word": lowercase
    "emphasisLevel": 1-5
    "elementalClass": FIRE | WATER | FROST | SMOKE | ELECTRIC
    "isolation": true (word >=700ms, gets its own screen)

  Semantic literalism: if it burns -> FIRE, drowns -> WATER,
  freezes -> FROST, fades -> SMOKE, electrifies -> ELECTRIC.

  Time gates: emphasisLevel 4-5 needs >=350ms. elementalClass needs >=140ms.
  isolation needs >=700ms. Skip words under 140ms.

OUTPUT FORMAT:
  { "phrases": [{ "wordRange": [start, end], "heroWord": "WORD" }, ...],
    "wordDirectives": [{ "word": "soul", "emphasisLevel": 3 }, ...] }

Return ONLY valid JSON. No markdown.
`;

interface LyricLine {
  text: string;
  start?: number;
  end?: number;
}

interface AudioSectionInput {
  index: number;
  startSec: number;
  endSec: number;
  role: string;
  avgEnergy: number;
  beatDensity: number;
  lyrics: Array<{ text: string; lineIndex: number }>;
  confidence?: number;
}

interface SceneContext {
  scene: string;
  label: string;
  timeOfDay: string;
  baseLuminance: "dark" | "medium" | "light";
  colorTemperature: string;
}

interface RequestBody {
  title?: string;
  artist?: string;
  bpm?: number;
  lines?: LyricLine[];
  lyrics?: string;
  lyricId?: string;
  id?: string;
  listenerScene?: string;
  scene_context?: SceneContext | null;
  audioSections?: AudioSectionInput[];
  /** Word-level timestamps from Whisper — used for held-word hero detection */
  words?: Array<{ word: string; start: number; end: number }>;
  mode?: "scene" | "words";
  sceneDirection?: Record<string, any>;
}

const ENUMS = {
  sceneTone: ["dark", "light", "mixed"],
  typography: [
    "bold-impact",
    "clean-modern",
    "elegant-serif",
    "raw-condensed",
    "whisper-soft",
    "tech-mono",
    "display-heavy",
    "editorial-light",
  ],
  visualMood: [
    "intimate",
    "anthemic",
    "dreamy",
    "aggressive",
    "melancholy",
    "euphoric",
    "eerie",
    "vulnerable",
    "triumphant",
    "nostalgic",
    "defiant",
    "hopeful",
    "raw",
    "hypnotic",
  ],
  texture: ["fire", "rain", "snow", "smoke", "dust", "stars", "glare"],
  emotionalArc: ["slow-burn", "surge", "collapse", "dawn", "eruption"],
  elementalClass: ["FIRE", "WATER", "FROST", "SMOKE", "ELECTRIC"],
  atmosphereState: ["still", "drifting", "falling", "swirling"],
} as const;

const LYRIC_FILLER = new Set([
  "the",
  "a",
  "an",
  "in",
  "on",
  "at",
  "to",
  "of",
  "and",
  "or",
  "but",
  "is",
  "it",
  "as",
  "for",
  "with",
  "from",
  "by",
  "than",
  "i",
  "me",
  "my",
  "im",
  "mine",
  "myself",
  "you",
  "your",
  "yours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "we",
  "us",
  "our",
  "they",
  "them",
  "their",
  "be",
  "been",
  "was",
  "were",
  "am",
  "are",
  "got",
  "get",
  "do",
  "did",
  "dont",
  "have",
  "has",
  "had",
  "can",
  "cant",
  "will",
  "wont",
  "ill",
  "ive",
  "oh",
  "yeah",
  "yo",
  "uh",
  "um",
  "ah",
  "ooh",
  "hey",
  "wow",
  "nah",
  "yah",
  "aye",
  "mmm",
  "huh",
  "woo",
  "la",
  "na",
  "da",
  "that",
  "this",
  "its",
  "those",
  "these",
  "what",
  "where",
  "who",
  "how",
  "when",
  "which",
  "so",
  "if",
  "up",
  "out",
  "not",
  "no",
  "just",
  "like",
  "all",
  "too",
  "very",
  "real",
  "bout",
  "some",
]);
interface HeldWord {
  word: string;
  clean: string;
  durationMs: number;
  songPosition: number;
}
function extractHeldWords(
  words: Array<{ word: string; start: number; end: number }>,
  songStart: number,
  songEnd: number,
): { heldWords: HeldWord[]; medianMs: number; totalCount: number } {
  const songDur = Math.max(0.01, songEnd - songStart);
  const durations: number[] = [];
  const held: HeldWord[] = [];
  for (const w of words) {
    const dur = w.end - w.start;
    durations.push(dur);
    if (dur < 0.5) continue;
    const clean = w.word.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (!clean || clean.length < 2) continue;
    if (LYRIC_FILLER.has(clean)) continue;
    held.push({
      word: w.word,
      clean,
      durationMs: Math.round(dur * 1000),
      songPosition: (w.start - songStart) / songDur,
    });
  }
  const byClean = new Map<string, HeldWord>();
  for (const hw of held) {
    const existing = byClean.get(hw.clean);
    if (!existing || hw.durationMs > existing.durationMs)
      byClean.set(hw.clean, hw);
  }
  const deduped = [...byClean.values()].sort(
    (a, b) => a.songPosition - b.songPosition,
  );
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.2;
  return {
    heldWords: deduped,
    medianMs: Math.round(median * 1000),
    totalCount: words.length,
  };
}
function formatHeldWordsBlock(
  words: Array<{ word: string; start: number; end: number }>,
  lines: LyricLine[],
): string {
  if (!words || words.length === 0) return "";
  const songStart = lines[0]?.start ?? 0;
  const songEnd = lines[lines.length - 1]?.end ?? 1;
  const { heldWords, medianMs } = extractHeldWords(words, songStart, songEnd);
  if (heldWords.length === 0) return "";
  const entries = heldWords.map(
    (hw) =>
      `  "${hw.clean}" — ${hw.durationMs}ms (${(hw.songPosition * 100).toFixed(0)}% into song)`,
  );
  return `
═══════════════════════════════════════
HELD WORDS — artist vocal emphasis
═══════════════════════════════════════

These words were held ≥500ms by the artist (median word is ${medianMs}ms).
Long duration = deliberate artistic emphasis. These are your PRIMARY hero candidates.
Every held word below should get a wordDirective unless truly low-impact in context.

${entries.join("\n")}

Map duration to emphasisLevel:
  ≥1500ms → emphasisLevel 5 (the artist REALLY held this)
  1000-1499ms → emphasisLevel 4
  700-999ms → emphasisLevel 3
  500-699ms → emphasisLevel 2

You may add up to 5 additional short words if narratively critical (title words, emotional peaks).
`;
}

interface WordSegment {
  startIdx: number;
  endIdx: number;
}

interface ValidationResult {
  ok: boolean;
  errors: string[];
  value: Record<string, any>;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// buildUserMessage() removed — legacy no-mode path deleted
function preSegmentAtBreaths(
  words: Array<{ word: string; start: number; end: number }>,
  breathThresholdMs: number = 300,
): WordSegment[] {
  if (!words || words.length === 0) return [];

  const segments: WordSegment[] = [];
  let segStart = 0;

  for (let i = 0; i < words.length; i++) {
    const isLast = i === words.length - 1;
    let shouldSplit = isLast;

    if (!isLast) {
      const gapMs = Math.round((words[i + 1].start - words[i].end) * 1000);
      if (gapMs >= breathThresholdMs) shouldSplit = true;
    }

    if (shouldSplit) {
      const segWords = words.slice(segStart, i + 1);
      const durationMs = Math.round(
        (segWords[segWords.length - 1].end - segWords[0].start) * 1000,
      );

      // Find internal pauses (≥150ms gaps within the segment)
      const pauses: Array<{ afterWordIdx: number; gapMs: number }> = [];
      for (let j = 0; j < segWords.length - 1; j++) {
        const gap = Math.round((segWords[j + 1].start - segWords[j].end) * 1000);
        if (gap >= 150) {
          pauses.push({ afterWordIdx: segStart + j, gapMs: gap });
        }
      }

      segments.push({
        startIdx: segStart,
        endIdx: i,
        words: segWords,
        durationMs,
        wordCount: segWords.length,
        pauses,
      });

      segStart = i + 1;
    }
  }

  return segments;
}

/**
 * Hard-enforce phrase rules that the AI can't be trusted with:
 * - Max 6 words per phrase
 * - Min duration floors
 * Splits oversized phrases at the largest internal gap.
 */
function enforcePhraseLimits(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
  maxWords: number = 6,
): Array<{ wordRange: [number, number]; heroWord?: string }> {
  const result: Array<{ wordRange: [number, number]; heroWord?: string }> = [];

  for (const phrase of phrases) {
    const [start, end] = phrase.wordRange;
    const count = end - start + 1;

    if (count <= maxWords) {
      result.push(phrase);
      continue;
    }

    // Split at the largest gap within this phrase
    let bestSplitIdx = start + Math.floor(count / 2); // fallback: midpoint
    let bestGap = -1;

    for (let i = start; i < end; i++) {
      if (i + 1 >= words.length) continue;
      const gap = words[i + 1].start - words[i].end;
      if (gap > bestGap) {
        bestGap = gap;
        bestSplitIdx = i;
      }
    }

    // Split into two halves at the largest gap
    const firstHalf: typeof phrase = {
      wordRange: [start, bestSplitIdx],
      heroWord: phrase.heroWord,
    };
    const secondHalf: typeof phrase = {
      wordRange: [bestSplitIdx + 1, end],
    };

    // Recursively enforce on each half
    result.push(...enforcePhraseLimits([firstHalf], words, maxWords));
    result.push(...enforcePhraseLimits([secondHalf], words, maxWords));
  }

  return result;
}

/**
 * Split words with isolation: true out of multi-word phrases into solo phrases.
 * These words deserve their own screen moment — the solo hero system centers them.
 * If they stay inside a multi-word phrase, they cause show-hide-show flicker.
 */
function splitIsolatedWords(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
  wordDirectives: Array<{ word?: string; isolation?: boolean }>,
): Array<{ wordRange: [number, number]; heroWord?: string }> {
  // Build a set of isolated word stems
  const isolationSet = new Set<string>();
  for (const wd of wordDirectives) {
    if (wd.isolation && wd.word) {
      isolationSet.add(wd.word.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  }
  if (isolationSet.size === 0) return phrases;

  const result: Array<{ wordRange: [number, number]; heroWord?: string }> = [];

  for (const phrase of phrases) {
    const [start, end] = phrase.wordRange;

    // Already a single-word phrase — keep as-is
    if (start === end) {
      result.push(phrase);
      continue;
    }

    // Scan for isolated words in this phrase
    let segStart = start;
    for (let i = start; i <= end; i++) {
      if (i >= words.length) continue;
      const clean = words[i].word.toLowerCase().replace(/[^a-z0-9]/g, "");
      const durMs = Math.round((words[i].end - words[i].start) * 1000);

      if (isolationSet.has(clean) && durMs >= 350) {
        // Push words before the isolated word as their own phrase
        if (i > segStart) {
          result.push({
            wordRange: [segStart, i - 1],
            heroWord: phrase.heroWord,
          });
        }
        // Push the isolated word as a solo phrase
        result.push({
          wordRange: [i, i],
          heroWord: words[i].word.toUpperCase().replace(/[^A-Z0-9'.,-]/g, ""),
        });
        segStart = i + 1;
      }
    }

    // Push remaining words after the last isolated word
    if (segStart <= end) {
      result.push({
        wordRange: [segStart, end],
        heroWord: phrase.heroWord,
      });
    }
  }

  return result;
}

/**
 * Ensure every word belongs to exactly one phrase.
 * Fills gaps left by the AI with mechanical phrases.
 */
function fillPhraseGaps(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string }>,
  totalWords: number,
): Array<{ wordRange: [number, number]; heroWord?: string }> {
  if (totalWords === 0) return phrases;

  // Sort by start index
  const sorted = [...phrases].sort((a, b) => a.wordRange[0] - b.wordRange[0]);
  const result: Array<{ wordRange: [number, number]; heroWord?: string }> = [];
  let nextExpected = 0;

  for (const phrase of sorted) {
    const [start, end] = phrase.wordRange;
    // Fill gap before this phrase
    if (start > nextExpected) {
      result.push({ wordRange: [nextExpected, start - 1] });
    }
    result.push(phrase);
    nextExpected = end + 1;
  }

  // Fill gap after last phrase
  if (nextExpected < totalWords) {
    result.push({ wordRange: [nextExpected, totalWords - 1] });
  }

  return result;
}

/**
 * Validate existing heroWords against the phrase range, then fill missing
 * heroWords with the longest-duration word in the phrase.
 * Every phrase needs a heroWord for accent color highlighting.
 */
function fillMissingHeroWords(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
): void {
  for (const phrase of phrases) {
    // Validate heroWord actually exists in this phrase's word range.
    if (phrase.heroWord) {
      const heroClean = phrase.heroWord.toLowerCase().replace(/[^a-z0-9]/g, "");
      let found = false;

      for (
        let i = phrase.wordRange[0];
        i <= phrase.wordRange[1] && i < words.length;
        i++
      ) {
        const wordClean = words[i].word.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (wordClean === heroClean) {
          found = true;
          break;
        }
      }

      if (!found) {
        phrase.heroWord = undefined;
      }
    }

    if (!phrase.heroWord) {
      let longest = "";
      let longestDur = 0;

      for (
        let i = phrase.wordRange[0];
        i <= phrase.wordRange[1] && i < words.length;
        i++
      ) {
        const dur = words[i].end - words[i].start;
        if (dur > longestDur) {
          longestDur = dur;
          longest = words[i].word;
        }
      }

      if (longest) {
        phrase.heroWord = longest.toUpperCase().replace(/[^A-Z0-9'.,-]/g, "");
      }
    }
  }
}

/**
 * Merge orphan single-word phrases (< 350ms) into adjacent phrases.
 * Single-word phrases are only valid for impact exclamations (≥ 350ms).
 * Filler words, articles, and line-boundary artifacts get absorbed.
 */
function mergeOrphanPhrases(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
): Array<{ wordRange: [number, number]; heroWord?: string }> {
  const sorted = [...phrases].sort((a, b) => a.wordRange[0] - b.wordRange[0]);

  for (let i = sorted.length - 1; i >= 0; i--) {
    const phrase = sorted[i];
    const count = phrase.wordRange[1] - phrase.wordRange[0] + 1;
    if (count > 1) continue;

    const wordIdx = phrase.wordRange[0];
    if (wordIdx >= words.length) continue;

    const durMs = Math.round((words[wordIdx].end - words[wordIdx].start) * 1000);
    if (durMs >= 350) continue;

    if (i > 0 && sorted[i - 1].wordRange[1] === phrase.wordRange[0] - 1) {
      sorted[i - 1].wordRange[1] = phrase.wordRange[1];
      sorted.splice(i, 1);
    } else if (
      i < sorted.length - 1 &&
      sorted[i + 1].wordRange[0] === phrase.wordRange[1] + 1
    ) {
      sorted[i + 1].wordRange[0] = phrase.wordRange[0];
      sorted.splice(i, 1);
    }
  }

  return sorted;
}

function buildWordUserMessage(
  title: string,
  artist: string,
  lines: LyricLine[],
  sceneDirection: Record<string, any>,
  words?: Array<{ word: string; start: number; end: number }>,
  bpm?: number,
): string {
  let msg = "";

  msg += `Song: ${artist} — ${title}\n`;
  if (bpm && bpm > 0) msg += `BPM: ${Math.round(bpm)}\n`;
  msg += "\n";

  msg += `SCENE DIRECTION (harmonize with this):\n`;
  msg += `sceneTone: ${sceneDirection.sceneTone || "dark"}\n`;
  msg += `emotionalArc: ${sceneDirection.emotionalArc || "slow-burn"}\n`;
  if (Array.isArray(sceneDirection.sections)) {
    for (const s of sceneDirection.sections) {
      msg += `  Section ${s.sectionIndex}: ${s.visualMood || "?"} (${s.dominantColor || "?"})\n`;
    }
  }
  msg += "\n";

  if (words && words.length > 0) {
    msg += `WORD STREAM (one word per line):\n`;
    msg += `Use the w-numbers for wordRange. [BREATH] = phrase boundary.\n\n`;

    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const durMs = Math.round((w.end - w.start) * 1000);
      const pad = String(wi).padStart(3, " ");
      const wordPad = w.word.padEnd(18, " ");
      let line = `  w${pad}  ${wordPad} ${durMs}ms`;

      // Gap to next word
      if (wi < words.length - 1) {
        const gapMs = Math.round((words[wi + 1].start - w.end) * 1000);
        if (gapMs >= 300) {
          line += `  [BREATH ${gapMs}ms]`;
        } else if (gapMs >= 150) {
          line += `  [pause ${gapMs}ms]`;
        }
      }

      msg += line + "\n";
    }
    msg += "\n";

    // Held words block
    const heldBlock = formatHeldWordsBlock(words, lines);
    if (heldBlock) msg += heldBlock + "\n";
  } else {
    for (let i = 0; i < lines.length; i++) {
      msg += `[${i}] "${lines[i].text}"\n`;
    }
    msg += "\n";
  }

  msg += "Return JSON only: { phrases: [...], wordDirectives: [...] }";
  return msg;
}

function resolveListenerScene(body: RequestBody): string {
  return body.listenerScene?.trim() || body.scene_context?.scene?.trim() || "";
}

function buildScenePrefix(ctx: SceneContext | null | undefined): string {
  if (!ctx) return "";

  const luminanceHint: Record<string, string> = {
    dark: 'Favor sceneTone "dark" or "mixed-dawn".',
    medium: 'sceneTone can be any "mixed-*" variant.',
    light: 'Favor sceneTone "light". Avoid "fire" and "storm" textures.',
  };

  const tempHint: Record<string, string> = {
    warm: "Prefer warm textures: fire, aurora, dust, smoke.",
    cool: "Prefer cool textures: rain, snow, storm, stars.",
    neutral: "Texture is open.",
  };

  return `
SCENE CONTEXT — ground ALL choices in this world.
"${ctx.label}" — ${ctx.scene}
Time: ${ctx.timeOfDay}
${luminanceHint[ctx.baseLuminance] ?? ""}
${tempHint[ctx.colorTemperature] ?? ""}
`;
}

function unwrapNested(obj: Record<string, any>): Record<string, any> {
  // If the AI wrapped everything under a single key, unwrap it
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    const inner = obj[keys[0]];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      // Check if the inner object looks like our expected structure
      if (
        inner.sceneTone ||
        inner.storyboard ||
        inner.wordDirectives ||
        inner.sections
      ) {
        return inner;
      }
    }
  }
  return obj;
}

function extractJson(raw: string): Record<string, any> | null {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);

  try {
    return unwrapNested(JSON.parse(cleaned));
  } catch {
    cleaned = cleaned
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F]/g, (ch) =>
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : "",
      );

    try {
      return unwrapNested(JSON.parse(cleaned));
    } catch {
      return null;
    }
  }
}

// validate() removed — legacy no-mode path deleted
function validateScene(
  raw: Record<string, any>,
  sectionCount: number,
  body: RequestBody,
): ValidationResult {
  const errors: string[] = [];
  const v = { ...raw };

  const DEFAULTS: Record<string, string> = {
    sceneTone: "dark",
    typography: "clean-modern",
    texture: "dust",
    emotionalArc: "slow-burn",
  };
  for (const key of [
    "sceneTone",
    "typography",
    "texture",
    "emotionalArc",
  ] as const) {
    const allowed = ENUMS[key] as readonly string[];
    if (!allowed.includes(v[key])) {
      errors.push(`Invalid ${key}: "${v[key]}"`);
      v[key] = DEFAULTS[key];
    }
  }

  if (typeof v.description === "string")
    v.description = v.description.trim().slice(0, 200);
  if (typeof v.mood === "string") v.mood = v.mood.trim().toLowerCase();
  if (v.meaning && typeof v.meaning === "object") {
    v.meaning = {
      theme:
        typeof v.meaning.theme === "string"
          ? v.meaning.theme.trim()
          : undefined,
      summary:
        typeof v.meaning.summary === "string"
          ? v.meaning.summary.trim()
          : undefined,
      imagery: Array.isArray(v.meaning.imagery)
        ? v.meaning.imagery.map(String).slice(0, 5)
        : undefined,
    };
  }

  if (!Array.isArray(v.sections)) {
    errors.push("sections must be an array");
    v.sections = [];
  } else {
    for (const s of v.sections) {
      if (
        !s.visualMood ||
        !(ENUMS.visualMood as readonly string[]).includes(s.visualMood)
      )
        s.visualMood = "intimate";
      if (
        typeof s.dominantColor !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(s.dominantColor)
      ) {
        const moodColorMap: Record<string, string> = {
          intimate: "#C9A96E",
          anthemic: "#E8632B",
          dreamy: "#B088F9",
          aggressive: "#4FA4D4",
          melancholy: "#2255AA",
          euphoric: "#FFD700",
          eerie: "#00BFA5",
          vulnerable: "#D4618C",
          triumphant: "#FFD700",
          nostalgic: "#A0845C",
          defiant: "#4FA4D4",
          hopeful: "#34D058",
          raw: "#A0A4AC",
          hypnotic: "#B088F9",
        };
        s.dominantColor = moodColorMap[s.visualMood] || "#C9A96E";
      }
      if (typeof s.description !== "string" || !s.description.trim()) {
        const mood = s.visualMood || "cinematic";
        const sectionLines = (body.lines || []).filter((l: any) => {
          if (typeof l?.start !== "number") return false;
          const startSec =
            typeof s.suggestedStartSec === "number"
              ? s.suggestedStartSec
              : s.startSec;
          const endSec =
            typeof s.suggestedEndSec === "number"
              ? s.suggestedEndSec
              : s.endSec;
          if (typeof startSec !== "number" || typeof endSec !== "number")
            return false;
          return l.start >= startSec - 0.5 && l.start < endSec + 0.5;
        });
        const lyricsExcerpt = sectionLines
          .map((l: any) => l.text || "")
          .join(" ")
          .slice(0, 80);
        s.description = lyricsExcerpt
          ? `${mood} scene: ${lyricsExcerpt}`
          : `${mood} cinematic landscape`;
      }
      if (
        s.texture !== undefined &&
        !(ENUMS.texture as readonly string[]).includes(s.texture)
      )
        delete s.texture;
      if (
        s.atmosphereState !== undefined &&
        !(ENUMS.atmosphereState as readonly string[]).includes(
          s.atmosphereState,
        )
      )
        delete s.atmosphereState;
      delete s.motion;
      delete s.atmosphere;
      delete s.typography;
      delete s.structuralLabel;
    }
  }

  if (sectionCount > 0 && v.sections.length !== sectionCount) {
    while (v.sections.length < sectionCount) {
      const lastIdx = v.sections.length;
      v.sections.push({
        sectionIndex: lastIdx,
        description: `Cinematic scene for section ${lastIdx + 1}`,
        visualMood: "intimate",
        dominantColor: ["#C9A96E", "#4FA4D4", "#D4618C", "#228844", "#B088F9", "#E8632B", "#FFD700", "#00BFA5"][lastIdx % 8],
      });
    }
    if (v.sections.length > sectionCount) {
      v.sections = v.sections.slice(0, sectionCount);
    }
  }

  delete v.storyboard;
  delete v.wordDirectives;

  const FORBIDDEN = [
    "motion",
    "atmosphere",
    "colorHex",
    "physicsProfile",
    "cameraLanguage",
    "tensionCurve",
    "fontSize",
    "position",
    "scaleX",
    "scaleY",
    "color",
    "glow",
    "kineticClass",
    "zoom",
    "driftIntensity",
    "startRatio",
    "endRatio",
    "chapters",
    "visualWorld",
    "beatAlignment",
  ];
  for (const key of FORBIDDEN) delete v[key];

  return { ok: errors.length === 0, errors, value: v };
}

function validateWords(
  raw: Record<string, any>,
  words?: Array<{ word: string; start: number; end: number }>,
): ValidationResult {
  const errors: string[] = [];
  const v = { ...raw };

  // Phrases
  if (!Array.isArray(v.phrases)) v.phrases = [];
  for (const p of v.phrases) {
    // lineIndex no longer required — phrases use global wordRange
    if (!Array.isArray(p.wordRange) || p.wordRange.length !== 2) {
      p.wordRange = [0, 0];
    }
    // Ensure indices are numbers
    p.wordRange[0] =
      typeof p.wordRange[0] === "number"
        ? Math.max(0, Math.round(p.wordRange[0]))
        : 0;
    p.wordRange[1] =
      typeof p.wordRange[1] === "number"
        ? Math.max(p.wordRange[0], Math.round(p.wordRange[1]))
        : p.wordRange[0];
    if (p.heroWord && typeof p.heroWord !== "string") delete p.heroWord;
  }

  // Storyboard — backward compat
  if (!Array.isArray(v.storyboard)) v.storyboard = [];
  for (const entry of v.storyboard) {
    delete entry.shotType;
    delete entry.entryStyle;
    delete entry.exitStyle;
  }

  // Word directives
  if (!Array.isArray(v.wordDirectives)) {
    if (v.wordDirectives && typeof v.wordDirectives === "object") {
      v.wordDirectives = Object.values(v.wordDirectives);
    } else {
      v.wordDirectives = [];
    }
  }

  // Word duration lookup
  const wordDurMap = new Map<string, number>();
  if (words) {
    for (const w of words) {
      const clean = w.word.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (clean) {
        const dur = Math.round((w.end - w.start) * 1000);
        const existing = wordDurMap.get(clean);
        if (!existing || dur > existing) wordDurMap.set(clean, dur);
      }
    }
  }

  for (const wd of v.wordDirectives) {
    if (typeof wd.emphasisLevel === "number") {
      wd.emphasisLevel = Math.min(5, Math.max(1, Math.round(wd.emphasisLevel)));
    } else {
      wd.emphasisLevel = 2;
    }
    if (
      wd.elementalClass &&
      !(ENUMS.elementalClass as readonly string[]).includes(wd.elementalClass)
    )
      delete wd.elementalClass;
    if (wd.elementalClass === "none") delete wd.elementalClass;

    // Time-gate only
    const clean = (wd.word || "").replace(/[^a-zA-Z]/g, "").toLowerCase();
    const dur = wordDurMap.get(clean) ?? 999;
    if (dur < 140) {
      wd.emphasisLevel = 1;
      delete wd.elementalClass;
      delete wd.isolation;
    }
    if (dur < 350) {
      delete wd.elementalClass;
      if (wd.emphasisLevel > 3) wd.emphasisLevel = 3;
      delete wd.isolation;
    }
    if (dur < 700 && wd.isolation) delete wd.isolation;

    for (const f of [
      "entry",
      "exit",
      "behavior",
      "trail",
      "ghostTrail",
      "ghostDirection",
      "letterSequence",
      "visualMetaphor",
      "heroPresentation",
      "kineticClass",
      "colorOverride",
    ]) {
      delete (wd as any)[f];
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      phrases: v.phrases,
      storyboard: v.storyboard,
      wordDirectives: v.wordDirectives,
    },
  };
}

async function callScene(
  apiKey: string,
  scenePrefix: string,
  userMessage: string,
  sectionCount: number,
  body: RequestBody,
  sceneSystemPrompt: string = SCENE_DIRECTION_PROMPT,
): Promise<Record<string, any>> {
  const messages = [
    { role: "system", content: scenePrefix + sceneSystemPrompt },
    { role: "user", content: userMessage },
  ];

  const makeRequest = (model: string) =>
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

  let resp = await makeRequest(PRIMARY_MODEL);

  // If primary model fails with retryable error, try fallback
  if (!resp.ok && (resp.status === 429 || resp.status >= 500)) {
    const errText = await resp.text().catch(() => "");
    console.warn(
      `[cinematic-direction] scene primary model failed (${resp.status}): ${errText.slice(0, 100)}, trying fallback`,
    );
    await new Promise((r) => setTimeout(r, 2000));
    resp = await makeRequest(FALLBACK_MODEL);
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[cinematic-direction] scene AI error", resp.status, text);
    throw {
      status: resp.status,
      message:
        resp.status === 429
          ? "Rate limited"
          : `Scene direction AI failed (HTTP ${resp.status})`,
    };
  }

  const completion = await resp.json();
  const finishReason = completion?.choices?.[0]?.finish_reason;
  const raw = String(completion?.choices?.[0]?.message?.content ?? "");

  if (finishReason === "length") {
    console.warn(
      "[cinematic-direction] scene response truncated (finish_reason=length), raw length:",
      raw.length,
    );
  }

  let parsed = extractJson(raw);

  // If parse failed or response was truncated, retry once
  if (!parsed || finishReason === "length") {
    console.warn(
      "[cinematic-direction] scene first attempt failed to parse or was truncated, retrying. Raw preview:",
      raw.slice(0, 300),
    );

    const retryResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PRIMARY_MODEL,
          messages: [
            { role: "system", content: scenePrefix + sceneSystemPrompt },
            { role: "user", content: userMessage },
            {
              role: "user",
              content:
                "Your previous response was malformed or truncated. Return ONLY valid JSON with sceneTone, typography, texture, emotionalArc, and sections array. No markdown. No explanation.",
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
          max_tokens: 4000,
        }),
      },
    );

    if (retryResp.ok) {
      const retryCompletion = await retryResp.json();
      const retryRaw = String(
        retryCompletion?.choices?.[0]?.message?.content ?? "",
      );
      const retryParsed = extractJson(retryRaw);
      if (retryParsed) {
        parsed = retryParsed;
      } else {
        console.error(
          "[cinematic-direction] scene retry also failed to parse. Raw preview:",
          retryRaw.slice(0, 500),
        );
      }
    } else {
      const retryText = await retryResp.text();
      console.error(
        "[cinematic-direction] scene retry request failed:",
        retryResp.status,
        retryText,
      );
    }
  }

  if (!parsed)
    throw { status: 422, message: "Invalid JSON from scene direction AI" };

  const result = validateScene(parsed, sectionCount, body);
  return result.value;
}

async function callWords(
  apiKey: string,
  title: string,
  artist: string,
  lines: LyricLine[],
  sceneDirection: Record<string, any>,
  words?: Array<{ word: string; start: number; end: number }>,
  bpm?: number,
  wordSystemPrompt: string = WORD_DIRECTION_PROMPT,
): Promise<Record<string, any>> {
  const wordMessage = buildWordUserMessage(
    title,
    artist,
    lines,
    sceneDirection,
    words,
    bpm,
  );

  const callWordAI = async (
    messages: Array<{ role: string; content: string }>,
  ) => {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PRIMARY_MODEL,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 6000,
        }),
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[cinematic-direction] words AI error", resp.status, text);
      throw {
        status: resp.status,
        message:
          resp.status === 429
            ? "Rate limited"
            : "Word direction AI request failed",
      };
    }

    const completion = await resp.json();
    const finishReason = completion?.choices?.[0]?.finish_reason;
    const raw = String(completion?.choices?.[0]?.message?.content ?? "");

    if (finishReason === "length") {
      console.warn(
        "[cinematic-direction] words response truncated (finish_reason=length), raw length:",
        raw.length,
      );
    }

    return { raw, finishReason };
  };

  const messages = [
    { role: "system", content: wordSystemPrompt },
    { role: "user", content: wordMessage },
  ];

  // First attempt
  const { raw, finishReason } = await callWordAI(messages);
  let parsed = extractJson(raw);

  // If parse failed or response was truncated, retry once
  if (!parsed || finishReason === "length") {
    console.warn(
      "[cinematic-direction] words first attempt failed to parse or was truncated, retrying. Raw preview:",
      raw.slice(0, 300),
    );

    const retryMessages = [
      ...messages,
      {
        role: "user",
        content:
          'Your previous response was malformed or truncated. Return ONLY valid JSON: { "phrases": [...], "wordDirectives": [...] }. No markdown. No explanation.',
      },
    ];

    const { raw: retryRaw } = await callWordAI(retryMessages);
    const retryParsed = extractJson(retryRaw);

    if (retryParsed) {
      parsed = retryParsed;
    } else if (!parsed) {
      console.error(
        "[cinematic-direction] words retry also failed. Raw preview:",
        retryRaw.slice(0, 500),
      );
      throw {
        status: 422,
        message: "Invalid JSON from word direction AI after retry",
      };
    }
  }

  const result = validateWords(parsed, words);

  // Server-side enforcement pipeline (order matters)
  if (words && Array.isArray(result.value.phrases)) {
    // 1. Hard cap: split any phrase over 6 words
    result.value.phrases = enforcePhraseLimits(result.value.phrases, words, 6);
    // 2. Split isolated words into their own solo phrases
    const wordDirs = Array.isArray(result.value.wordDirectives)
      ? result.value.wordDirectives
      : [];
    result.value.phrases = splitIsolatedWords(result.value.phrases, words, wordDirs);
    // 3. Merge orphan single-word phrases (< 350ms) — isolated words survive (≥350ms)
    result.value.phrases = mergeOrphanPhrases(result.value.phrases, words);
    // 4. Fill gaps
    result.value.phrases = fillPhraseGaps(result.value.phrases, words.length);
    // 5. Validate + fill heroWords
    fillMissingHeroWords(result.value.phrases, words);
  }

  if (
    !Array.isArray(result.value.phrases) ||
    result.value.phrases.length === 0 ||
    !Array.isArray(result.value.wordDirectives) ||
    result.value.wordDirectives.length === 0
  ) {
    throw {
      status: 422,
      message: "Word direction returned empty phrases or wordDirectives",
    };
  }

  return result.value;
}

// callWithRetry() removed — legacy no-mode path deleted
async function persist(
  direction: Record<string, any>,
  lyricId: string,
): Promise<void> {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return;

  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const payload = { cinematic_direction: direction };

  for (const table of ["shareable_lyric_dances", "saved_lyrics"]) {
    const res = await fetch(
      `${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) {
      return;
    }
  }
}

/** Fetch custom prompts from ai_prompts table, falling back to hardcoded defaults. */
async function loadCustomPrompts(): Promise<{
  fullPrompt: string;
  scenePrompt: string;
  wordPrompt: string;
}> {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) {
    return {
      fullPrompt: CINEMATIC_DIRECTION_PROMPT,
      scenePrompt: SCENE_DIRECTION_PROMPT,
      wordPrompt: WORD_DIRECTION_PROMPT,
    };
  }

  try {
    const slugs = ["cinematic-direction", "cinematic-scene", "cinematic-words"];
    const res = await fetch(
      `${sbUrl}/rest/v1/ai_prompts?slug=in.(${slugs.join(",")})&select=slug,prompt`,
      {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      },
    );
    if (!res.ok) {
      console.warn("[cinematic-direction] Failed to load custom prompts, using defaults");
      return {
        fullPrompt: CINEMATIC_DIRECTION_PROMPT,
        scenePrompt: SCENE_DIRECTION_PROMPT,
        wordPrompt: WORD_DIRECTION_PROMPT,
      };
    }

    const rows: Array<{ slug: string; prompt: string }> = await res.json();
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.prompt]));

    return {
      fullPrompt: bySlug["cinematic-direction"] || CINEMATIC_DIRECTION_PROMPT,
      scenePrompt: bySlug["cinematic-scene"] || SCENE_DIRECTION_PROMPT,
      wordPrompt: bySlug["cinematic-words"] || WORD_DIRECTION_PROMPT,
    };
  } catch (e) {
    console.warn("[cinematic-direction] Error loading custom prompts:", e);
    return {
      fullPrompt: CINEMATIC_DIRECTION_PROMPT,
      scenePrompt: SCENE_DIRECTION_PROMPT,
      wordPrompt: WORD_DIRECTION_PROMPT,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Load custom prompts from admin panel (falls back to hardcoded defaults)
    const customPrompts = await loadCustomPrompts();

    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const bpm =
      typeof body.bpm === "number"
        ? body.bpm
        : ((body as any).beat_grid?.bpm ?? 0);
    const lyricId = body.lyricId ?? body.id;

    const lines: LyricLine[] = Array.isArray(body.lines)
      ? body.lines
      : typeof body.lyrics === "string"
        ? body.lyrics
            .split(/\n+/)
            .map((t, i) => ({ text: t.trim(), start: i, end: i + 1 }))
            .filter((l) => l.text)
        : [];

    if (!title || !artist || lines.length === 0) {
      return new Response(
        JSON.stringify({ error: "title, artist, and lines required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const listenerScene = resolveListenerScene(body);
    const scenePrefix = buildScenePrefix(body.scene_context);

    if (body.mode === "scene") {
      // Build user message for scene mode inline
      const sectionList = (body.audioSections || [])
        .map((s: any, i: number) => `  Section ${i + 1}: "${s.label || `Section ${i + 1}`}" (${fmt(s.start)}–${fmt(s.end)})`)
        .join("\n");
      const sceneUserMessage = [
        `Song: "${title}" by ${artist}`,
        bpm ? `BPM: ${bpm}` : "",
        listenerScene ? `Listener scene: ${listenerScene}` : "",
        `\nLyrics:\n${lines.map((l) => l.text).join("\n")}`,
        sectionList ? `\nAudio sections:\n${sectionList}` : "",
      ].filter(Boolean).join("\n");

      const sceneResult = await callScene(
        apiKey,
        scenePrefix,
        sceneUserMessage,
        body.audioSections?.length ?? 0,
        body,
        customPrompts.scenePrompt,
      );

      return new Response(JSON.stringify({ cinematicDirection: sceneResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "words") {
      if (!body.sceneDirection) {
        return new Response(
          JSON.stringify({ error: "sceneDirection required for mode=words" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const wordResult = await callWords(
        apiKey,
        title,
        artist,
        lines,
        body.sceneDirection,
        body.words,
        bpm,
        customPrompts.wordPrompt,
      );

      return new Response(JSON.stringify({ cinematicDirection: wordResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy no-mode path removed — require mode parameter
    return new Response(
      JSON.stringify({ error: "mode parameter required. Use mode: scene or mode: words" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[cinematic-direction] error:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "Generation failed" }),
      {
        status: error.status ?? 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
