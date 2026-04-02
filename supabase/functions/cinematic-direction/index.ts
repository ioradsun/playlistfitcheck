import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = 120000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function normalizeAbortError(error: unknown, message: string, status = 504) {
  if (error instanceof Error && error.name === "AbortError") {
    return { status, message };
  }
  return error;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

const SCENE_DIRECTION_PROMPT = `
You are a lyric video director. Return JSON only. No markdown. No commentary.

OUTPUT SCHEMA:
{
  "description": "one sentence, max 15 words",
  "sceneTone": "dark|light|mixed",
  "fontProfile": {
    "force": "low|medium|high",
    "intimacy": "low|medium|high",
    "polish": "raw|clean|elegant",
    "theatricality": "low|medium|high",
    "era": "timeless|modern|futuristic"
  },
  "emotionalArc": "slow-burn|surge|collapse|dawn|eruption",
  "sections": [
    {
      "sectionIndex": 0,
      "description": "one evocative sentence",
      "dominantColor": "#hex",
      "visualMood": "mood",
      "texture": "texture"
    }
  ]
}

MOODS: intimate, anthemic, dreamy, aggressive, melancholy, euphoric, eerie,
vulnerable, triumphant, nostalgic, defiant, hopeful, raw, hypnotic, ethereal,
haunted, celestial, noir, rebellious

TEXTURES: dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, bubbles, moths, glare, glitch, fire

VISUAL WORLD RULES:
1. If ARTIST DIRECTION is provided, treat it as law — it defines the visual
   world. Build every section inside that world.

2. If no ARTIST DIRECTION is provided, read the lyrics closely and extract
   the specific objects, places, actions, and characters named in the words.
   Build the visual world around those literal elements first — then layer
   in emotional mood. A song about couch surfing should show couches, dim
   apartments, borrowed floors, and distant stages. Do not substitute generic
   mood imagery (waves, neon, fog) for the actual content of the lyrics.

3. Build one cohesive visual world across all sections. Do not force visual
   variety — coherence is more important than uniqueness.

4. Color should reflect peak emotion, not just setting.
   Luminance > 40% for lift/triumph. Dark for dread/isolation.

5. One section per audio section provided. Match section count exactly.
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
  /** Word-level timestamps from ElevenLabs Scribe */
  words?: Array<{ word: string; start: number; end: number }>;
  mode?: "scene" | "words";
  sceneDirection?: Record<string, any>;
}

const ENUMS = {
  sceneTone: ["dark", "light", "mixed"],
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

const MAX_PHRASE_WORDS = 6;
const SOLO_THRESHOLD_MS = 350;
const COLLAPSE_MS = 10;
const PUNCT_END = /[.?!]["'"']?\s*$/;
const COMMA_END = /,\s*$/;
const VALID_EXIT_EFFECTS = new Set([
  "fade", "drift_up", "shrink", "dissolve",
  "cascade", "scatter", "slam", "glitch", "burn",
]);

type RawWord = { word: string; start: number; end: number };
type WordMeta = RawWord & {
  index: number;
  d: number;
  gap: number;
  clean: string;
};
type PhraseBlock = {
  words: WordMeta[];
  durationMs: number;
  startTime: number;
  endTime: number;
  text: string;
  wordCount: number;
};

function detectCollapsedRuns(
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

function splitOnPunctuation(words: WordMeta[]): WordMeta[][] {
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

function splitOversized(phrase: WordMeta[]): WordMeta[][] {
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

function applySoloSplits(blocks: PhraseBlock[]): PhraseBlock[] {
  const output: PhraseBlock[] = [];
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

function selectHeroWord(block: PhraseBlock): { heroWord: string; heroMs: number } {
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

function calcExitEffect(
  block: PhraseBlock,
  nextBlock: PhraseBlock | null,
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

function normalizeHookKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function buildDeterministicPhrases(
  words: RawWord[],
  _lines: LyricLine[],
): { hookPhrase: string; phrases: Array<{ wordRange: [number, number]; heroWord: string; exitEffect: string; text: string; wordCount: number; start: number; end: number }>; chorusText?: string } {
  void _lines;
  if (!words.length) return { hookPhrase: "", phrases: [] };

  const { mainWords } = detectCollapsedRuns(words);
  if (!mainWords.length) return { hookPhrase: "", phrases: [] };

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
  const initialBlocks: PhraseBlock[] = subPhrases.filter((p) => p.length > 0).map((p) => ({
    words: p,
    durationMs: Math.round((p[p.length - 1].end - p[0].start) * 1000),
    startTime: p[0].start,
    endTime: p[p.length - 1].end,
    text: normalizePhraseText(p.map((w) => w.word).join(" ")),
    wordCount: p.length,
  }));

  const finalBlocks = applySoloSplits(initialBlocks);
  const phrases: Array<{ wordRange: [number, number]; heroWord: string; exitEffect: string; text: string; wordCount: number; start: number; end: number }> = [];
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
    });
  }
  const hookPhrase = inferHookPhrase(phrases);
  return { hookPhrase, phrases };
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

  const makeRequest = async (model: string) => {
    try {
      return await fetchWithTimeout(
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
            max_completion_tokens: 8000,
          }),
        },
        120000,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[cinematic-direction] scene request timed out for model ${model}`);
        throw {
          status: 504,
          message: `Scene direction AI timed out for model ${model}`,
        };
      }
      throw error;
    }
  };

  let resp: Response;
  try {
    resp = await makeRequest(modelOverride);
  } catch (error: any) {
    const status = error?.status ?? 500;
    if (status === 504 && modelOverride !== FALLBACK_MODEL) {
      console.warn(
        `[cinematic-direction] scene primary model timed out, trying fallback ${FALLBACK_MODEL}`,
      );
      await new Promise((r) => setTimeout(r, 1500));
      resp = await makeRequest(FALLBACK_MODEL);
    } else {
      throw error;
    }
  }

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

  const sceneRespText = await resp.text();
  let completion: any;
  try {
    completion = JSON.parse(sceneRespText);
  } catch {
    console.error("[cinematic-direction] scene response not valid JSON, length:", sceneRespText.length, "preview:", sceneRespText.slice(0, 200));
    throw { status: 502, message: "Scene direction AI returned invalid response" };
  }
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

    let retryResp: Response;
    try {
      retryResp = await fetchWithTimeout(
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
            max_completion_tokens: 8000,
          }),
        },
      );
    } catch (error) {
      throw normalizeAbortError(
        error,
        `Scene direction AI timed out during retry for model ${modelOverride}`,
      );
    }

    if (retryResp.ok) {
      const retryRespText = await retryResp.text();
      let retryCompletion: any;
      try {
        retryCompletion = JSON.parse(retryRespText);
      } catch {
        console.error("[cinematic-direction] scene retry response not valid JSON, preview:", retryRespText.slice(0, 200));
        retryCompletion = null;
      }
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

function callWords(
  lines: LyricLine[],
  words?: Array<{ word: string; start: number; end: number }>,
): Record<string, any> {
  return words?.length
    ? buildDeterministicPhrases(words, lines)
    : { hookPhrase: "", phrases: [] };
}

/** Fetch custom prompts + models from ai_prompts table, falling back to hardcoded defaults. */
let _promptCache: {
  value: { scenePrompt: string; sceneModel: string };
  expiresAt: number;
} | null = null;
const PROMPT_CACHE_TTL_MS = 60_000;

async function loadCustomPrompts(): Promise<{
  scenePrompt: string;
  sceneModel: string;
}> {
  if (_promptCache && Date.now() < _promptCache.expiresAt) {
    return _promptCache.value;
  }

  const defaults = {
    scenePrompt: SCENE_DIRECTION_PROMPT,
    sceneModel: PRIMARY_MODEL,
  };
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return defaults;

  try {
    const slugs = ["cinematic-scene", "scene-model", "analysis-model"];
    const res = await fetchWithTimeout(
      `${sbUrl}/rest/v1/ai_prompts?slug=in.(${slugs.join(",")})&select=slug,prompt`,
      {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      },
      5000,
    );
    if (!res.ok) {
      console.warn("[cinematic-direction] Failed to load custom prompts, using defaults");
      return defaults;
    }

    const rows: Array<{ slug: string; prompt: string }> = await res.json();
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.prompt]));

    // Separate model slugs for scene vs words, with legacy analysis-model fallback
    const legacyModel = bySlug["analysis-model"]?.trim() || PRIMARY_MODEL;
    const value = {
      scenePrompt: bySlug["cinematic-scene"] || SCENE_DIRECTION_PROMPT,
      sceneModel: bySlug["scene-model"]?.trim() || legacyModel,
    };

    _promptCache = { value, expiresAt: Date.now() + PROMPT_CACHE_TTL_MS };
    return value;
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
        .map((s: AudioSectionInput, i: number) => `  Section ${i + 1}: "${s.role || `Section ${i + 1}`}" (${fmt(s.startSec)}–${fmt(s.endSec)}, energy: ${(s.avgEnergy ?? 0).toFixed(2)}, beats/sec: ${(s.beatDensity ?? 0).toFixed(1)})`)
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
        customPrompts.sceneModel,
      );

      return new Response(JSON.stringify({
        cinematicDirection: sceneResult,
        _meta: {
          model: customPrompts.sceneModel,
          scenePromptSource: customPrompts.scenePrompt === SCENE_DIRECTION_PROMPT ? "default" : "admin",
          scenePromptLength: customPrompts.scenePrompt.length,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "words") {
      const wordResult = callWords(lines, body.words);

      return new Response(JSON.stringify({
        cinematicDirection: wordResult,
        _meta: { mode: "deterministic_v3" },
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
