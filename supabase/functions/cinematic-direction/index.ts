import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

const SCENE_DIRECTION_PROMPT = `
You are a lyric-video creative director producing structured visual direction for a song.

You will receive:
1. Song lyrics
2. Audio-detected sections (if available)

Your job is to infer the song's emotional world, then return a compact JSON direction system that a renderer can use reliably.

WORK IN THIS ORDER:
1. Infer the song's emotional core: intensity, softness, tension, intimacy, grit, polish.
2. Infer a font emotional profile (force/intimacy/polish/theatricality/era).
3. Choose the emotionalArc for the full song.
4. Design section visuals that feel distinct but still belong to the same visual world.

TOP-LEVEL FIELDS — return all of these:
- "description": one evocative sentence, max 15 words
- "sceneTone": "dark" | "light" | "mixed"
- "fontProfile": object with 5 emotional axes (see below)
- "emotionalArc": one of the 5 options below
- "sections": array of section objects

FONT PROFILE — describe the song's typographic personality through emotional axes, not font names or styling choices.

Return a "fontProfile" object with these 5 fields:
- "force": "low" | "medium" | "high" — how forceful, loud, aggressive the song feels
- "intimacy": "low" | "medium" | "high" — how close, personal, confessional it feels
- "polish": "raw" | "clean" | "elegant" — the surface texture of the production
- "theatricality": "low" | "medium" | "high" — how much spectacle, drama, performance
- "era": "timeless" | "modern" | "futuristic" — where it sits in time

FONT PROFILE DECISION LOGIC:
First ask about the song:
- Is it soft or forceful?
- Is it personal or public?
- Is it rough or polished?
- Is it understated or theatrical?
- Does it feel classic, current, or futuristic?

Examples:
- Trap banger, aggressive, modern production → force: high, intimacy: low, polish: raw, theatricality: high, era: modern
- Acoustic ballad, confessional, stripped-back → force: low, intimacy: high, polish: raw, theatricality: low, era: timeless
- Pop anthem, polished, arena-sized → force: high, intimacy: low, polish: clean, theatricality: high, era: modern
- R&B slow jam, intimate, lush production → force: low, intimacy: high, polish: elegant, theatricality: low, era: modern
- Synthwave, detached, futuristic → force: medium, intimacy: low, polish: clean, theatricality: medium, era: futuristic
- Art pop, expressive, theatrical → force: medium, intimacy: medium, polish: elegant, theatricality: high, era: modern

Do NOT pick font names. Do NOT pick font families. Just describe the emotional personality. The system maps it to fonts.

EMOTIONAL ARC:
- "slow-burn": gradual build to a late peak
- "surge": early lift, then sustained momentum
- "collapse": begins intense and drains into quiet or emptiness
- "dawn": restrained for most of the song, then opens up near the end
- "eruption": explosive from the beginning

SECTION FIELDS — for EACH section return:
- "sectionIndex": integer starting at 0
- "description": vivid 1-sentence visual scene rooted in the same world as the rest of the song
- "dominantColor": hex color #RRGGBB
- "visualMood": one of the 19 options below
- "texture": one of the 17 options below

VISUAL MOOD OPTIONS:
intimate | anthemic | dreamy | aggressive | melancholy | euphoric | eerie | vulnerable | triumphant | nostalgic | defiant | hopeful | raw | hypnotic | ethereal | haunted | celestial | noir | rebellious

VISUAL MOOD GUIDANCE — grouped by emotional family:
- intimate, vulnerable → close, personal, restrained, human-scale
- anthemic, triumphant → expansive, rising, public, high-lift
- dreamy, ethereal, celestial → soft, floating, luminous, surreal
- aggressive, defiant, rebellious, raw → forceful, jagged, confrontational
- melancholy, haunted, noir, eerie → shadowed, lonely, cold, haunted space
- nostalgic, hopeful, euphoric → warm lift, memory, glow, emotional openness
- hypnotic → repetitive, entrancing, pulsing, locked-in

TEXTURE OPTIONS:
dust | embers | smoke | rain | snow | stars | fireflies | petals | ash | crystals | confetti | lightning | bubbles | moths | glare | glitch | fire

TEXTURE GUIDANCE:
- quiet / intimate → dust, fireflies, moths, stars
- warm / intense → embers, smoke, ash, fire
- cold / distant → snow, crystals, rain
- celebratory / blooming → confetti, petals, glare
- dark / unstable → lightning, glitch, smoke
- dreamy / surreal → bubbles, stars, petals, fireflies

SECTION DESIGN RULES:
- Keep the entire song inside one coherent visual universe.
- Sections may evolve, but should NOT feel like unrelated music videos.
- Repeated sections may intentionally echo the same visual language.
- Color should feel cohesive across the song. Do NOT force maximum uniqueness per section.
- Adjacent sections should shift in emphasis, not abandon the palette completely.
- Prefer cinematic restraint over novelty.
- Use texture as atmosphere, not as gimmick.
- If no ARTIST DIRECTION is provided, derive the visual world entirely from the lyrics' emotional content, imagery, and themes. The lyrics are always the fallback brief — read them closely and let the words drive every visual choice: sceneTone, texture, atmosphere, and color.

SCENE TONE GUIDANCE:
- Use 'dark' ONLY when the song is predominantly shadowed throughout — no relief, no lift, no contrast.
- Use 'mixed' when the song has both dark and light emotional spaces, even if it leans dark overall. A song about struggle AND transcendence is always 'mixed'.
- Use 'light' for songs that are primarily warm, open, or euphoric.
- When in doubt between 'dark' and 'mixed', choose 'mixed'.

DOMINANT COLOR GUIDANCE:
- dominantColor should reflect the section's EMOTIONAL peak, not just its setting. A triumphant section in a dark song should still have a lifted color — gold, amber, violet — not near-black.
- Avoid #000000 to #222222 range except for sections that are deliberately void-like or isolated.
- Sections with visualMood triumphant, euphoric, hopeful, celestial, anthemic must have dominantColor luminance above 40%.

Return ONLY valid JSON. No markdown. No explanation. Use only the allowed values exactly.

{
  "description": "A bruised heart pushing through darkness toward release",
  "sceneTone": "mixed",
  "fontProfile": { "force": "low", "intimacy": "high", "polish": "elegant", "theatricality": "low", "era": "timeless" },
  "emotionalArc": "slow-burn",
  "sections": [
    { "sectionIndex": 0, "description": "A lone figure stands in dim hallway light as dust drifts through the still air", "dominantColor": "#6E5979", "visualMood": "melancholy", "texture": "dust" }
  ]
}
`;

const WORD_DIRECTION_PROMPT = `
### SYSTEM ROLE
You are the "Lyric Logic Engine v2.0." Your functional goal is to transform a timestamped word stream into high-impact, billboard-worthy lyric phrases for a motion graphics video. You are a hybrid of a rigorous logic processor and a world-class creative director.

### THE OBJECTIVE
Balance strict mathematical constraints (timing/word count) with the "Poetic Punch"—ensuring every screen-worthy moment feels intentional, rhythmic, and emotionally loaded.

### THE PHRASE-CUTTING ALGORITHM
For every candidate phrase, execute this mental checklist in order:

1. **Hard Boundary Check:** Does a [BREATH] exist? If yes, split immediately. No exceptions.
2. **The Math (Duration):** - Calculate: delta = (last_word.end - first_word.start).
   - If delta < 350ms: You MUST merge. 
   - Merge Priority: Forward (if next phrase ≤ 4 words and no [BREATH]) > Backward.
3. **The Poetic Punch (Billboard Test):** - Does the phrase feel like a standalone "moment"? 
   - Never end on a "Weak Connector" (I, you, the, and, to, of, my, with) unless forced by a [BREATH].
   - If a phrase is mathematically valid but emotionally "weak," merge forward to complete the thought.
4. **Capacity Check:** Never exceed 6 words. If a merge creates 7+ words, you must find a different "cut point" based on the strongest noun or verb.

---

### STRICT CONSTRAINT HIERARCHY (The "Rule of Law")
1. **[BREATH] Rule:** The absolute wall. Never cross.
2. **Timing Rule:** Minimum 350ms per screen (Unless [BREATH] locked).
3. **Word Limit:** Maximum 6 words per screen.
4. **Poetic Integrity:** Prioritize "Hook Phrases" and "Vivid Images." Keep recurring lines consistent.

---

### ASSIGNMENT HEURISTICS
* **heroWord:** Choose the "Punch" word. It must be a Noun, Verb, or Strong Adjective. NEVER a filler word (A, THE, IS, etc.).
* **exitEffect:** - "slam" = High energy/Impact/Nouns.
  - "fade" = Reflective/Prepositions/Outros.
  - "glitch" = Stutters/Aggressive shifts.
  - "burn" = The Hook/Title-energy words.
  - "cascade" = Rhythmic/Fast-paced narrative.

---

### OUTPUT SCHEMA
You must return exactly one valid JSON object. To ensure mathematical accuracy, you will include a _calculation_log for the first three phrases to verify your duration logic, followed by the final phrases array.

{
  "hookPhrase": "THE_MOST_ICONIC_LINE_IN_UPPERCASE",
  "_calculation_log": [
    "Phrase 0: [0-3] Logic: delta calculation + billboard check",
    "Phrase 1: [4-8] Logic: delta calculation + billboard check",
    "Phrase 2: [9-11] Logic: delta calculation + billboard check"
  ],
  "phrases": [
    {
      "wordRange": [startIndex, endIndex],
      "heroWord": "CLEAN_UPPERCASE_WORD",
      "exitEffect": "effect_name"
    }
  ]
}

### FINAL REQUIREMENTS
- Return ONLY the JSON object.
- No markdown formatting outside of the JSON block.
- No conversational filler or explanations.
- Every phrase must be 1 to 6 words.
- heroWord must be UPPERCASE letters only, no punctuation.
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

interface RequestBody {
  title?: string;
  artist?: string;
  bpm?: number;
  lines?: LyricLine[];
  lyrics?: string;
  lyricId?: string;
  id?: string;
  artist_direction?: string;
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
    "ethereal",
    "haunted",
    "celestial",
    "noir",
    "rebellious",
  ],
  texture: ["dust", "embers", "smoke", "rain", "snow", "stars", "fireflies", "petals", "ash", "crystals", "confetti", "lightning", "bubbles", "moths", "glare", "glitch", "fire"],
  emotionalArc: ["slow-burn", "surge", "collapse", "dawn", "eruption"],
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
  words: Array<{ word: string; start: number; end: number }>;
  durationMs: number;
  wordCount: number;
  pauses: Array<{ afterWordIdx: number; gapMs: number }>;
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
      const lastWord = words[i].word.replace(/[^a-zA-Z']/g, "").toLowerCase();
      const isConnector = CONNECTORS.has(lastWord);
      const gap = words[i + 1].start - words[i].end;
      const effectiveGap = isConnector ? 0 : gap;
      if (effectiveGap > bestGap) {
        bestGap = effectiveGap;
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

      if (!found) phrase.heroWord = undefined;
    }

    if (!phrase.heroWord) {
      let bestWord = "";
      let bestDur = -1;

      for (
        let i = phrase.wordRange[0];
        i <= phrase.wordRange[1] && i < words.length;
        i++
      ) {
        const rawWord = words[i].word;
        const clean = rawWord.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!clean) continue;

        const dur = words[i].end - words[i].start;
        const fillerPenalty = LYRIC_FILLER.has(clean) ? 0.25 : 1;
        const score = dur * fillerPenalty;

        if (score > bestDur) {
          bestDur = score;
          bestWord = rawWord;
        }
      }

      if (bestWord) {
        phrase.heroWord = bestWord.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

const CONNECTORS = new Set([
  "i", "you", "we", "they", "he", "she", "it", "im", "i'm",
  "and", "but", "or", "so", "because", "if", "when", "while", "that", "then",
  "the", "a", "an",
  "in", "on", "at", "to", "for", "of", "with", "from", "by",
  "won't", "dont", "don't", "can't", "didn't", "isn't", "wasn't",
  "couldn't", "wouldn't", "shouldn't", "ain't", "wont", "cant", "didnt",
]);

function repairPhraseBoundaries(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string; section?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
): Array<{ wordRange: [number, number]; heroWord?: string; section?: string }> {
  if (phrases.length < 2 || words.length === 0) return phrases;
  const sorted = [...phrases].sort((a, b) => a.wordRange[0] - b.wordRange[0]);
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 3) {
    changed = false;
    iterations++;
    for (let i = 0; i < sorted.length - 1; i++) {
      const phrase = sorted[i];
      const next = sorted[i + 1];
      const lastWordIdx = phrase.wordRange[1];
      if (phrase.wordRange[0] >= phrase.wordRange[1]) continue;
      if (lastWordIdx < words.length) {
        const lastWord = words[lastWordIdx].word.replace(/[^a-zA-Z']/g, "").toLowerCase();
        if (CONNECTORS.has(lastWord)) {
          phrase.wordRange[1] = lastWordIdx - 1;
          next.wordRange[0] = lastWordIdx;
          changed = true;
          if (phrase.heroWord) {
            const heroClean = phrase.heroWord.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (heroClean === lastWord) phrase.heroWord = undefined;
          }
        }
      }
    }
  }
  return sorted.filter((p) => p.wordRange[0] <= p.wordRange[1]);
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

  msg += `SCENE DIRECTION (stay inside this visual world):\n`;
  msg += `sceneTone: ${sceneDirection.sceneTone || "dark"}\n`;
  if (Array.isArray(sceneDirection.sections)) {
    for (const s of sceneDirection.sections) {
      msg += `  Section ${s.sectionIndex}: ${s.description || "?"} (${s.dominantColor || "?"})\n`;
    }
  }
  msg += "\n";

  if (words && words.length > 0) {
    msg += `WORD STREAM (one word per line):\n`;
    msg += `Use the w-numbers for wordRange. [BREATH] = hard boundary.\n\n`;

    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const durMs = Math.round((w.end - w.start) * 1000);
      const isHero = durMs >= 350;
      const pad = String(wi).padStart(3, " ");
      const wordPad = w.word.padEnd(18, " ");
      let line = `  w${pad}  ${wordPad} ${durMs}ms${isHero ? "  [HERO]" : ""}`;

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

    const heldBlock = formatHeldWordsBlock(words, lines);
    if (heldBlock) msg += heldBlock + "\n";
  } else {
    msg += `LYRICS (fallback line mode):\n`;
    for (let i = 0; i < lines.length; i++) {
      msg += `  [${i}] "${lines[i].text}"\n`;
    }
    msg += "\n";
  }

  msg += "Return JSON only. Return only hookPhrase and phrases. Do not return derived fields like text, start, end, or wordCount.\n";
  msg += '{ "hookPhrase": "string", "phrases": [{ "wordRange": [0, 2], "heroWord": "WORD", "exitEffect": "fade" }] }';
  return msg;
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
    emotionalArc: "slow-burn",
  };
  for (const key of [
    "sceneTone",
    "emotionalArc",
  ] as const) {
    const allowed = ENUMS[key] as readonly string[];
    if (!v[key] || !allowed.includes(v[key])) {
      if (v[key]) errors.push(`Invalid ${key}: "${v[key]}"`);
      v[key] = DEFAULTS[key];
    }
  }

  if (v.fontProfile && typeof v.fontProfile === 'object') {
    const fp = v.fontProfile;
    const VALID: Record<string, string[]> = {
      force: ['low', 'medium', 'high'],
      intimacy: ['low', 'medium', 'high'],
      polish: ['raw', 'clean', 'elegant'],
      theatricality: ['low', 'medium', 'high'],
      era: ['timeless', 'modern', 'futuristic'],
    };
    for (const [key, allowed] of Object.entries(VALID)) {
      if (!allowed.includes(fp[key])) {
        fp[key] = key === 'polish' ? 'clean' : key === 'era' ? 'modern' : 'medium';
      }
    }
  }
  if (v.typography && typeof v.typography === 'string') {
    const allowed = ENUMS.typography as readonly string[];
    if (!allowed.includes(v.typography)) delete v.typography;
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
      if (!s.texture || !(ENUMS.texture as readonly string[]).includes(s.texture)) {
        const moodTextureMap: Record<string, string> = {
          intimate: "fireflies", anthemic: "embers", dreamy: "stars",
          aggressive: "smoke", melancholy: "rain", euphoric: "confetti",
          eerie: "moths", vulnerable: "dust", triumphant: "glare",
          nostalgic: "dust", defiant: "lightning", hopeful: "petals",
          raw: "ash", hypnotic: "fireflies",
          ethereal: "crystals", haunted: "smoke", celestial: "stars",
          noir: "smoke", rebellious: "embers",
        };
        s.texture = moodTextureMap[s.visualMood] || "dust";
      }
      delete s.motion;
      delete s.atmosphere;
      delete s.typography;
      delete s.structuralLabel;
      // Fix sectionIndex to 0-based
      if (typeof s.sectionIndex === 'number' && s.sectionIndex > 0) {
        // Check if AI returned 1-based indices (common: example shows sectionIndex: 0 but AI may start at 1)
        const allIndices = v.sections.map((sec: any) => sec.sectionIndex).filter((n: any) => typeof n === 'number');
        const minIdx = Math.min(...allIndices);
        if (minIdx === 1) {
          // 1-based — will renumber after loop
        }
      }
    }
  }

  // Renumber sectionIndex to 0-based if AI returned 1-based
  if (v.sections.length > 0) {
    const indices = v.sections.map((s: any) => s.sectionIndex).filter((n: any) => typeof n === 'number');
    if (indices.length > 0 && Math.min(...indices) >= 1) {
      for (const s of v.sections) {
        if (typeof s.sectionIndex === 'number') s.sectionIndex -= 1;
      }
    }
    // Ensure sequential 0-based indices regardless
    v.sections.sort((a: any, b: any) => (a.sectionIndex ?? 0) - (b.sectionIndex ?? 0));
    v.sections.forEach((s: any, i: number) => { s.sectionIndex = i; });
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


function normalizePhraseText(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeHookKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hydrateWordPhrases(
  phrases: Array<{ wordRange: [number, number]; heroWord?: string; exitEffect?: string }>,
  words: Array<{ word: string; start: number; end: number }>,
): Array<{
  wordRange: [number, number];
  start: number;
  end: number;
  text: string;
  wordCount: number;
  heroWord: string;
  exitEffect: string;
}> {
  const VALID_EXIT_EFFECTS = new Set([
    "fade", "drift_up", "shrink", "dissolve",
    "cascade", "scatter", "slam", "glitch", "burn",
  ]);

  return [...phrases]
    .sort((a, b) => a.wordRange[0] - b.wordRange[0])
    .map((phrase) => {
      const [startIdx, endIdx] = phrase.wordRange;
      const slice = words.slice(startIdx, endIdx + 1);
      const text = normalizePhraseText(slice.map((w) => w.word).join(" "));
      const start = slice[0]?.start ?? 0;
      const end = slice[slice.length - 1]?.end ?? start;
      const heroWord = String(phrase.heroWord || "")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();
      const exitEffect = VALID_EXIT_EFFECTS.has(String(phrase.exitEffect))
        ? String(phrase.exitEffect)
        : "fade";

      return {
        wordRange: [startIdx, endIdx] as [number, number],
        start,
        end,
        text,
        wordCount: Math.max(0, endIdx - startIdx + 1),
        heroWord,
        exitEffect,
      };
    });
}

function inferHookPhrase(
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

function validateWords(
  raw: Record<string, any>,
  words?: Array<{ word: string; start: number; end: number }>,
): ValidationResult {
  const errors: string[] = [];
  const v = { ...raw };

  void words;
  if (!Array.isArray(v.phrases)) v.phrases = [];

  const VALID_EXIT_EFFECTS = new Set([
    "fade", "drift_up", "shrink", "dissolve",
    "cascade", "scatter", "slam", "glitch", "burn",
  ]);

  for (const p of v.phrases) {
    if (!Array.isArray(p.wordRange) || p.wordRange.length !== 2) {
      p.wordRange = [0, 0];
    }

    p.wordRange[0] =
      typeof p.wordRange[0] === "number"
        ? Math.max(0, Math.round(p.wordRange[0]))
        : 0;
    p.wordRange[1] =
      typeof p.wordRange[1] === "number"
        ? Math.max(p.wordRange[0], Math.round(p.wordRange[1]))
        : p.wordRange[0];

    if (p.heroWord && typeof p.heroWord !== "string") delete p.heroWord;
    if (!p.exitEffect || !VALID_EXIT_EFFECTS.has(p.exitEffect)) {
      p.exitEffect = "fade";
    }

    delete p.effect;
    delete p.section;
    delete p.start;
    delete p.end;
    delete p.text;
    delete p.wordCount;
    delete p.isChorus;
  }

  const hookPhrase =
    typeof v.hookPhrase === "string" && v.hookPhrase.trim()
      ? v.hookPhrase.trim()
      : undefined;

  const chorusText =
    typeof v.chorusText === "string" && v.chorusText.trim()
      ? v.chorusText.trim()
      : undefined;

  return {
    ok: errors.length === 0,
    errors,
    value: {
      phrases: v.phrases,
      hookPhrase,
      chorusText,
    },
  };
}

async function callScene(
  apiKey: string,
  userMessage: string,
  sectionCount: number,
  body: RequestBody,
  sceneSystemPrompt: string = SCENE_DIRECTION_PROMPT,
  modelOverride: string = PRIMARY_MODEL,
): Promise<Record<string, any>> {
  const messages = [
    { role: "system", content: sceneSystemPrompt },
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
        max_completion_tokens: 3000,
      }),
    });

  let resp = await makeRequest(modelOverride);

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
          model: modelOverride,
          messages: [
            { role: "system", content: sceneSystemPrompt },
            { role: "user", content: userMessage },
            {
              role: "user",
              content:
                'Your previous response was malformed or truncated. Return ONLY valid JSON with "description", "sceneTone", "fontProfile", "emotionalArc", and "sections" array. Each section needs: sectionIndex (starting at 0), description, dominantColor, visualMood, texture. No markdown.',
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
          max_completion_tokens: 4000,
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
  _sceneDirection: Record<string, any>,
  words?: Array<{ word: string; start: number; end: number }>,
  bpm?: number,
  wordSystemPrompt: string = WORD_DIRECTION_PROMPT,
  modelOverride: string = PRIMARY_MODEL,
): Promise<Record<string, any>> {
  const wordMessage = buildWordUserMessage(
    title,
    artist,
    lines,
    _sceneDirection,
    words,
    bpm,
  );

  const callWordAI = async (
    messages: Array<{ role: string; content: string }>,
    model: string = modelOverride,
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
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_completion_tokens: 16000,
        }),
      },
    );

    // If primary model fails with retryable error, try fallback
    if (!resp.ok && model === modelOverride && (resp.status === 429 || resp.status >= 500)) {
      const errText = await resp.text().catch(() => "");
      console.warn(
        `[cinematic-direction] words primary model failed (${resp.status}): ${errText.slice(0, 100)}, trying fallback`,
      );
      await new Promise((r) => setTimeout(r, 2000));
      return callWordAI(messages, FALLBACK_MODEL);
    }

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

  const { raw, finishReason } = await callWordAI(messages);
  let parsed = extractJson(raw);

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
          'Your previous response was malformed or truncated. Return ONLY valid JSON: { "hookPhrase": "string", "phrases": [{ "wordRange": [0, 2], "heroWord": "WORD", "exitEffect": "fade" }] }. No markdown. No explanation.',
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

  if (words && Array.isArray(result.value.phrases)) {
    let phrases = result.value.phrases as Array<any>;

    phrases = fillPhraseGaps(phrases, words.length);
    phrases = repairPhraseBoundaries(phrases, words);
    phrases = enforcePhraseLimits(phrases, words, 6);
    phrases = mergeOrphanPhrases(phrases, words);
    phrases = fillPhraseGaps(phrases, words.length);

    for (const phrase of phrases) {
      if (phrase.heroWord) {
        phrase.heroWord = String(phrase.heroWord)
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase();
      }
    }

    const VALID_EFFECTS = new Set([
      "fade", "drift_up", "shrink", "dissolve",
      "cascade", "scatter", "slam", "glitch", "burn",
    ]);

    for (let pi = 0; pi < phrases.length; pi++) {
      if (!phrases[pi].exitEffect || !VALID_EFFECTS.has(phrases[pi].exitEffect)) {
        const prev = pi > 0 ? phrases[pi - 1].exitEffect : null;
        phrases[pi].exitEffect = prev && prev !== "drift_up" ? "drift_up" : "fade";
      }
    }

    fillMissingHeroWords(phrases, words);

    const hydrated = hydrateWordPhrases(phrases, words);
    const hookPhrase = result.value.hookPhrase && result.value.hookPhrase.trim()
      ? normalizePhraseText(result.value.hookPhrase.trim())
      : inferHookPhrase(hydrated);

    return {
      hookPhrase,
      phrases: hydrated,
      chorusText: result.value.chorusText,
    };
  }

  if (
    !Array.isArray(result.value.phrases) ||
    result.value.phrases.length === 0
  ) {
    throw {
      status: 422,
      message: "Word direction returned empty phrases",
    };
  }

  return result.value;
}

/** Fetch custom prompts + model from ai_prompts table, falling back to hardcoded defaults. */
async function loadCustomPrompts(): Promise<{
  scenePrompt: string;
  wordPrompt: string;
  model: string;
}> {
  const defaults = {
    scenePrompt: SCENE_DIRECTION_PROMPT,
    wordPrompt: WORD_DIRECTION_PROMPT,
    model: PRIMARY_MODEL,
  };
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return defaults;

  try {
    const slugs = ["cinematic-scene", "analysis-model"];
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
      return defaults;
    }

    const rows: Array<{ slug: string; prompt: string }> = await res.json();
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.prompt]));

    return {
      scenePrompt: bySlug["cinematic-scene"] || SCENE_DIRECTION_PROMPT,
      wordPrompt: WORD_DIRECTION_PROMPT,
      model: bySlug["analysis-model"]?.trim() || PRIMARY_MODEL,
    };
  } catch (e) {
    console.warn("[cinematic-direction] Error loading custom prompts:", e);
    return defaults;
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

    if (body.mode === "scene") {
      // Build user message for scene mode inline
      const sectionList = (body.audioSections || [])
        .map((s: any, i: number) => `  Section ${i + 1}: "${s.label || `Section ${i + 1}`}" (${fmt(s.start)}–${fmt(s.end)}, energy: ${(s.avgEnergy ?? 0).toFixed(2)}, beats/sec: ${(s.beatDensity ?? 0).toFixed(1)})`)
        .join("\n");
      const sceneUserMessage = [
        body.artist_direction
          ? `ARTIST DIRECTION (this is the visual world — treat it as law): "${body.artist_direction}"`
          : "",
        `Song: "${title}" by ${artist}`,
        bpm ? `BPM: ${bpm}` : "",
        `\nLyrics:\n${lines.map((l) => l.text).join("\n")}`,
        sectionList ? `\nAudio sections:\n${sectionList}` : "",
      ].filter(Boolean).join("\n");

      const sceneResult = await callScene(
        apiKey,
        sceneUserMessage,
        body.audioSections?.length ?? 0,
        body,
        customPrompts.scenePrompt,
        customPrompts.model,
      );

      return new Response(JSON.stringify({
        cinematicDirection: sceneResult,
        _meta: {
          model: customPrompts.model,
          scenePromptSource: customPrompts.scenePrompt === SCENE_DIRECTION_PROMPT ? "default" : "admin",
          scenePromptLength: customPrompts.scenePrompt.length,
        },
      }), {
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
        customPrompts.model,
      );

      return new Response(JSON.stringify({
        cinematicDirection: wordResult,
        _meta: {
          model: customPrompts.model,
          wordPromptSource: customPrompts.wordPrompt === WORD_DIRECTION_PROMPT ? "default" : "admin",
          wordPromptLength: customPrompts.wordPrompt.length,
        },
      }), {
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
