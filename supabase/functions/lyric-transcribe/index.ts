import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag: "main" | "adlib";
  isFloating?: boolean;      // v2.2: adlib has no Whisper word match within ±1.5s
  geminiConflict?: string;   // v2.2: Gemini text differs significantly from Whisper text
  confidence?: number;       // v2.2: per-adlib confidence from Gemini
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface GeminiAdlib {
  text: string;
  start: number;  // seconds (v2.2 raw numeric from Gemini)
  end: number;
  layer?: string;
  confidence?: number;
}

interface GeminiHook {
  start_sec: number;
  confidence?: number;
}

interface GeminiInsights {
  bpm?: { value: number; confidence: number };
  key?: { value: string; confidence: number };
  mood?: { value: string; confidence: number };
}

interface GeminiAnalysis {
  hottest_hook: GeminiHook | null;
  adlibs: GeminiAdlib[];
  insights?: GeminiInsights;
  metadata: {
    title?: string;
    artist?: string;
    bpm_estimate?: number;
    key?: string;
    mood?: string;
    genre_hint?: string;
    confidence?: number;
  };
  rawResponseContent?: string;
  promptUsed?: string;
}

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Token overlap similarity (0–1) between two strings */
function tokenOverlap(a: string, b: string): number {
  const tokA = normalize(a).split(" ").filter(Boolean);
  const tokB = normalize(b).split(" ").filter(Boolean);
  if (!tokA.length || !tokB.length) return 0;
  let matches = 0;
  for (const t of tokA) {
    if (tokB.some(bt => {
      const dist = levenshtein(t, bt);
      return 1 - dist / Math.max(t.length, bt.length, 1) >= 0.7;
    })) matches++;
  }
  return matches / Math.max(tokA.length, tokB.length);
}

// ── Whisper: word-level granularity ──────────────────────────────────────────
async function runWhisper(
  audioBase64: string,
  ext: string,
  mimeType: string,
  apiKey: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
}> {
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();

  const words: WhisperWord[] = (data.words || [])
    .map((w: any) => ({
      word: String(w.word ?? "").trim(),
      start: Math.round((Number(w.start) || 0) * 1000) / 1000,
      end: Math.round((Number(w.end) || 0) * 1000) / 1000,
    }))
    .filter((w: WhisperWord) => w.word.length > 0 && w.end > w.start);

  const segments = (data.segments || [])
    .map((seg: any) => ({
      start: Math.round((Number(seg.start) || 0) * 10) / 10,
      end: Math.round((Number(seg.end) || 0) * 10) / 10,
      text: String(seg.text ?? "").trim(),
    }))
    .filter((s: any) => s.text.length > 0 && s.end > s.start);

  return { words, segments, rawText: data.text || "" };
}

// ── Gemini Prompt: Macro-Structural (Hook + Metadata) ────────────────────────
const GEMINI_HOOK_PROMPT = `ROLE: Lead Musicologist

TASK: Analyze this audio track for macro-structure and track DNA only.

CRITICAL CONSTRAINT: You must COMPLETELY IGNORE all background vocals, adlibs, harmonies, hype vocals, and secondary layers. Your attention is locked exclusively on the PRIMARY lead vocal and the track's musical production.

1. THE 10.000s HOOK ANCHOR
- Identify the single primary 10-second region that represents the track's core hook or chorus.
- Evaluation criteria: production lift, lead vocal intensity, melodic memorability, emotional peak, and repetition.
- Output ONLY start_sec as a decimal in seconds with 3-decimal precision (e.g., 78.450).
- The 10s duration is a system invariant — do NOT output an end time.
- Only output hottest_hook if confidence >= 0.75. If below, omit the field entirely.
- Scan the FULL track. Do not default to the first chorus.

2. TRACK DNA
- bpm: Estimated beats per minute as an integer.
- key: Musical key (e.g., "F#m", "Bb", "C major").
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic").
- title: If audible from lyrics or context; otherwise "Unknown".
- artist: If known; otherwise "Unknown".
- genre_hint: Best-guess genre (e.g., "hip-hop", "r&b", "pop").
- Each field must have its own confidence score (0.0–1.0).

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "confidence": 0.00 },
  "insights": {
    "bpm": { "value": 88, "confidence": 0.00 },
    "key": { "value": "F#m", "confidence": 0.00 },
    "mood": { "value": "hype", "confidence": 0.00 }
  },
  "metadata": {
    "title": "Unknown",
    "artist": "Unknown",
    "genre_hint": ""
  }
}`;

// ── Gemini Prompt: Adlib Auditor (Hyper-Sensitive, Full-Track Scan) ───────────
const GEMINI_ADLIB_PROMPT = `ROLE: Lead Vocal Alignment Engineer — Adlib Auditor

TASK: Conduct an exhaustive scan of every secondary vocal layer in this audio. The lead vocal melody has already been fully transcribed by a separate system — do NOT re-transcribe it.

STRICT EXCLUSION RULE:
- If a word or phrase is part of the primary lead vocal melodic line, DO NOT include it.
- You are hunting ONLY for: background vocals, hype vocals, call-and-response interjections, ad-libs, harmonies underneath the lead, echo repeats, and atmospheric vocal textures.

FULL-TRACK SCAN REQUIREMENT:
- You MUST scan from 0:00 to the very last second of the audio. Do not stop early.
- Pay EXTREME attention to the window between 2:30 and the end of the track. Outro sections frequently contain dense background layers that AI systems miss.
- The end of the track is equally important as the beginning.

ADLIB TAXONOMY:
- "callout": Short exclamations or interjections ("yeah", "ayy", "uh", "okay", "let's go") — typically 0.2–1.5s
- "echo": A repeat or echo of a lead vocal phrase, slightly offset in time — typically 0.3–2.5s
- "background": Sustained harmonies or stacked background vocals — typically 1.0–6.0s
- "texture": Atmospheric vocal sounds, hums, breaths with melodic intent — typically 0.5–3.0s

PRECISION RULES:
- Timestamps: Output start and end in SECONDS as a decimal with 3-decimal precision (e.g., 169.340). NOT MM:SS format.
- Omit over Guess: If a vocal is unclear, use [inaudible] or omit. Ignore noise < 0.150s unless confidence >= 0.95.
- Confidence: Provide a 0.0–1.0 score per event. Include only events with confidence >= 0.6.
- Separate EVERY instance: Even if the same text appears 10 times, each occurrence is a unique event with its own timestamp.
- No output limit: Return every event you find. Completeness is the primary directive.

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "adlibs": [
    { "text": "yeah", "start": 0.000, "end": 0.000, "layer": "callout", "confidence": 0.00 }
  ]
}`;

// ── Shared: call Gemini gateway ───────────────────────────────────────────────
async function callGemini(
  systemPrompt: string,
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  maxTokens = 2500,
  label = "gemini"
): Promise<string> {
  const requestBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
          { type: "text", text: "Analyze this audio. Return only the JSON schema specified." },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDIT_LIMIT");
    throw new Error(`Gemini (${label}) error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const gwData = await res.json();
  const content = gwData.choices?.[0]?.message?.content || "";
  if (!content) throw new Error(`Empty Gemini response (${label})`);
  return content;
}

function extractJsonFromContent(content: string): any {
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");
  let rawJson = content.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return JSON.parse(rawJson);
}

// ── Gemini Call 1: Hook + Insights + Metadata ─────────────────────────────────
async function runGeminiHookAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model = "google/gemini-3-flash-preview"
): Promise<{ hook: GeminiHook | null; insights?: GeminiInsights; metadata: GeminiAnalysis["metadata"]; rawContent: string }> {
  const content = await callGemini(GEMINI_HOOK_PROMPT, audioBase64, mimeType, lovableKey, model, 1200, "hook");
  const parsed = extractJsonFromContent(content);

  let hook: GeminiHook | null = null;
  if (parsed.hottest_hook && typeof parsed.hottest_hook.start_sec === "number") {
    const conf = Number(parsed.hottest_hook.confidence) || 0;
    if (conf >= 0.75) {
      hook = { start_sec: Math.round(parsed.hottest_hook.start_sec * 1000) / 1000, confidence: conf };
    } else {
      console.log(`[hook] Hook confidence ${conf.toFixed(2)} < 0.75 — omitted`);
    }
  }

  const ins = parsed.insights || {};
  const meta = parsed.metadata || {};

  return {
    hook,
    insights: {
      bpm: ins.bpm ? { value: Number(ins.bpm.value), confidence: Number(ins.bpm.confidence) } : undefined,
      key: ins.key ? { value: String(ins.key.value), confidence: Number(ins.key.confidence) } : undefined,
      mood: ins.mood ? { value: String(ins.mood.value), confidence: Number(ins.mood.confidence) } : undefined,
    },
    metadata: {
      title: String(meta.title || "Unknown").trim(),
      artist: String(meta.artist || "Unknown").trim(),
      bpm_estimate: ins.bpm?.value ? Number(ins.bpm.value) : undefined,
      key: ins.key?.value ? String(ins.key.value) : undefined,
      mood: ins.mood?.value ? String(ins.mood.value) : undefined,
      genre_hint: String(meta.genre_hint || "").trim() || undefined,
      confidence: ins.mood?.confidence ?? ins.bpm?.confidence ?? undefined,
    },
    rawContent: content,
  };
}

// ── Gemini Call 2: Adlibs only ────────────────────────────────────────────────
async function runGeminiAdlibAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model = "google/gemini-3-flash-preview"
): Promise<{ adlibs: GeminiAdlib[]; rawContent: string }> {
  const content = await callGemini(GEMINI_ADLIB_PROMPT, audioBase64, mimeType, lovableKey, model, 2500, "adlib");
  const parsed = extractJsonFromContent(content);

  const adlibs: GeminiAdlib[] = Array.isArray(parsed.adlibs)
    ? parsed.adlibs
        .filter((a: any) => a && typeof a.start === "number" && a.text && a.text !== "[inaudible]")
        .map((a: any) => ({
          text: String(a.text).trim(),
          start: Math.round(Number(a.start) * 1000) / 1000,
          end: Math.round(Number(a.end) * 1000) / 1000,
          layer: a.layer,
          confidence: Math.min(1, Math.max(0, Number(a.confidence) || 0)),
        }))
        .filter((a: GeminiAdlib) => a.end > a.start && a.confidence >= 0.6)
    : [];

  console.log(`[adlib] Parsed ${adlibs.length} adlibs from Gemini`);
  return { adlibs, rawContent: content };
}

// ── Build lines from Whisper segments ────────────────────────────────────────
function buildLinesFromSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  _words: WhisperWord[]
): LyricLine[] {
  if (segments.length === 0) return [];
  const GAP_THRESHOLD = 0.5;
  const lines: LyricLine[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    let end = seg.end;
    if (nextSeg && seg.end > nextSeg.start) {
      end = Math.round((nextSeg.start - 0.05) * 1000) / 1000;
    }
    const gap = nextSeg ? nextSeg.start - end : 0;
    if (gap > GAP_THRESHOLD) console.log(`Gap ${gap.toFixed(2)}s between seg[${i}] and seg[${i + 1}]`);
    lines.push({ start: Math.round(seg.start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: seg.text, tag: "main" });
  }
  return lines;
}

// ── v2.2 Global Timebase Guard ────────────────────────────────────────────────
/**
 * Calculate the median offset between Gemini adlib timestamps and nearest Whisper words,
 * using only high-confidence adlibs (>= 0.9). If the absolute median exceeds 0.150s,
 * shift all Gemini adlib timestamps by -globalOffset to align AI clock with Whisper clock.
 */
function computeGlobalOffset(adlibs: GeminiAdlib[], words: WhisperWord[]): number {
  if (words.length === 0) return 0;
  const highConf = adlibs.filter(a => (a.confidence ?? 0) >= 0.9);
  if (highConf.length === 0) return 0;

  const deltas: number[] = [];
  for (const adlib of highConf) {
    let nearest: WhisperWord | null = null;
    let nearestDist = Infinity;
    for (const w of words) {
      const dist = Math.abs(w.start - adlib.start);
      if (dist < nearestDist) { nearestDist = dist; nearest = w; }
    }
    if (nearest && nearestDist <= 5.0) {
      deltas.push(adlib.start - nearest.start);
    }
  }

  if (deltas.length === 0) return 0;
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  console.log(`Global timebase: ${deltas.length} reference points, median offset = ${median.toFixed(3)}s`);
  return Math.abs(median) > 0.150 ? median : 0;
}

// ── v2.2 Adlib extraction with Token-Overlap Floating Logic ──────────────────
function extractAdlibsFromWords(
  lines: LyricLine[],
  adlibs: GeminiAdlib[],
  words: WhisperWord[],
  globalOffset: number
): LyricLine[] {
  if (adlibs.length === 0 || words.length === 0) return lines;
  const result: LyricLine[] = lines.map(l => ({ ...l }));
  const adlibLines: LyricLine[] = [];

  // Pre-build main segment text windows for ghost-adlib de-duplication
  // Source A: build a lookup of main-line Whisper text spans
  const mainSegments = lines
    .filter(l => l.tag === "main")
    .map(l => {
      const spanWords = words.filter(w => w.start >= l.start - 0.1 && w.end <= l.end + 0.1);
      return { start: l.start, end: l.end, text: spanWords.map(w => w.word).join(" ") };
    });

  let ghostCount = 0;

  for (const adlib of adlibs) {
    // Apply global timebase correction
    const correctedStart = Math.round((adlib.start - globalOffset) * 1000) / 1000;
    const correctedEnd = Math.round((adlib.end - globalOffset) * 1000) / 1000;

    const normAdlibText = normalize(adlib.text);
    const adlibWordTokens = normAdlibText.split(" ").filter(Boolean);
    if (adlibWordTokens.length === 0) continue;

    // ── Ghost-Adlib De-Duplication ─────────────────────────────────────────
    // Source C de-dup: if this adlib text overlaps >= 0.9 with the Whisper main vocal
    // text at the same time window, it is a re-transcription of the lead vocal — discard.
    const overlappingMain = mainSegments.find(s =>
      correctedStart < s.end + 0.5 && correctedEnd > s.start - 0.5
    );
    if (overlappingMain) {
      const ghostScore = tokenOverlap(adlib.text, overlappingMain.text);
      if (ghostScore >= 0.9) {
        ghostCount++;
        console.log(`[ghost-dedup] Discarding "${adlib.text}" @ ${correctedStart.toFixed(3)}s — overlap ${ghostScore.toFixed(2)} with main`);
        continue;
      }
    }

    // ── Token-Overlap Floating Logic ──────────────────────────────────────
    // Check if any Whisper word within ±1.5s has a normalized token overlap >= 0.6
    const nearbyWords = words.filter(w => Math.abs(w.start - correctedStart) <= 1.5);
    const hasWordMatch = nearbyWords.some(w => {
      const overlap = tokenOverlap(adlib.text, w.word);
      return overlap >= 0.6;
    });
    const isFloating = !hasWordMatch;

    // ── Find best Whisper word match for snapping ──────────────────────
    const windowWords = words.filter(w => w.start >= correctedStart - 5 && w.start <= correctedEnd + 5);

    let snapStart = correctedStart;
    let snapEnd = correctedEnd;
    let geminiConflict: string | undefined;

    if (windowWords.length > 0) {
      let bestWordIdx = -1, bestScore = 0;
      for (let wi = 0; wi < windowWords.length; wi++) {
        const w = windowWords[wi];
        const normWord = normalize(w.word);
        const firstToken = adlibWordTokens[0];
        const dist = levenshtein(normWord, firstToken);
        const maxLen = Math.max(normWord.length, firstToken.length, 1);
        const textSim = 1 - dist / maxLen;
        const timeDist = Math.abs(w.start - correctedStart);
        const timeScore = 1 / (1 + timeDist * 0.5);
        const score = textSim * 0.65 + timeScore * 0.35;
        if (score > bestScore) { bestScore = score; bestWordIdx = wi; }
      }

      if (bestScore >= 0.3 && bestWordIdx !== -1) {
        const startWord = windowWords[bestWordIdx];
        let endWord = startWord;
        if (adlibWordTokens.length > 1) {
          let tokenIdx = 1;
          for (let wi = bestWordIdx + 1; wi < windowWords.length && tokenIdx < adlibWordTokens.length; wi++) {
            const w = windowWords[wi];
            const normWord = normalize(w.word);
            const token = adlibWordTokens[tokenIdx];
            const dist = levenshtein(normWord, token);
            const maxLen = Math.max(normWord.length, token.length, 1);
            if (1 - dist / maxLen >= 0.5) { endWord = w; tokenIdx++; }
          }
        }
        snapStart = Math.round(startWord.start * 1000) / 1000;
        snapEnd = Math.round(endWord.end * 1000) / 1000;

        // Detect text conflict: Gemini text vs Whisper text differs significantly
        const whisperText = windowWords
          .filter(w => w.start >= startWord.start - 0.1 && w.end <= endWord.end + 0.1)
          .map(w => w.word).join(" ");
        const overlap = tokenOverlap(adlib.text, whisperText);
        if (overlap < 0.5 && whisperText.trim()) {
          geminiConflict = whisperText.trim();
        }
      }
    }

    adlibLines.push({
      start: snapStart,
      end: snapEnd,
      text: adlib.text,
      tag: "adlib",
      isFloating,
      geminiConflict,
      confidence: adlib.confidence,
    });

    if (isFloating) {
      console.log(`Floating adlib (no Whisper match): "${adlib.text}" @ ${correctedStart.toFixed(3)}s`);
    }
  }

  const merged = [...result, ...adlibLines].sort((a, b) => a.start - b.start);
  const floatingCount = adlibLines.filter(l => l.isFloating).length;
  const conflictCount = adlibLines.filter(l => l.geminiConflict).length;
  console.log(`[v2.3] Adlib merge: ${adlibs.length} raw → ${ghostCount} ghost-deduped → ${adlibLines.length} kept (${floatingCount} floating, ${conflictCount} conflicts), offset=${globalOffset.toFixed(3)}s`);
  return merged;
}

// ── v2.2 Hook Invariant: start_sec + fixed 10.000s duration ──────────────────
function findHookFromWords(
  words: WhisperWord[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string; status: "confirmed" | "candidate" } | null {
  if (!hook) return null;

  const HOOK_DURATION = 10.000; // Absolute invariant — never override
  const { start_sec, confidence = 0 } = hook;

  // Confidence gate — if below 0.75 this is already filtered in Gemini parsing
  // but double-check here for safety
  if (confidence < 0.75) {
    return {
      start: start_sec,
      end: Math.round((start_sec + HOOK_DURATION) * 1000) / 1000,
      score: Math.round(confidence * 100),
      previewText: "",
      status: "candidate",
    };
  }

  // Snap to nearest Whisper word boundary
  const windowWords = words.filter(w => w.start >= start_sec - 2 && w.start <= start_sec + 3);
  let snapStart = start_sec;

  if (windowWords.length > 0) {
    // Find the word closest to the given start_sec
    let bestDist = Infinity;
    for (const w of windowWords) {
      const dist = Math.abs(w.start - start_sec);
      if (dist < bestDist) { bestDist = dist; snapStart = w.start; }
    }
  }

  // Gather preview text from words in the 10s window (Whisper-sourced)
  const hookWords = words.filter(w => w.start >= snapStart && w.end <= snapStart + HOOK_DURATION + 0.5);
  const previewText = hookWords.map(w => w.word).join(" ").slice(0, 100);

  const snapEnd = Math.round((snapStart + HOOK_DURATION) * 1000) / 1000;

  return {
    start: Math.round(snapStart * 1000) / 1000,
    end: snapEnd,
    score: Math.round(confidence * 100),
    previewText,
    status: "confirmed",
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const { audioBase64, format, transcriptionModel, analysisModel } = await req.json();
    if (!audioBase64) throw new Error("No audio data provided");

    const useWhisper = transcriptionModel !== "gemini";

    const VALID_ANALYSIS_MODELS = [
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3-pro-preview",
    ];
    const analysisDisabled = analysisModel === "disabled";
    const resolvedAnalysisModel: string = VALID_ANALYSIS_MODELS.includes(analysisModel)
      ? analysisModel
      : "google/gemini-3-flash-preview";

    const estimatedBytes = audioBase64.length * 0.75;
    if (estimatedBytes > 25 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: `File too large (~${(estimatedBytes / 1024 / 1024).toFixed(0)} MB). Max is 25 MB.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeMap: Record<string, string> = {
      wav: "audio/wav", mp3: "audio/mpeg", mpga: "audio/mpeg", mpeg: "audio/mpeg",
      m4a: "audio/mp4", mp4: "audio/mp4", flac: "audio/flac", ogg: "audio/ogg",
      oga: "audio/ogg", webm: "audio/webm",
    };
    const ext = (format && mimeMap[format]) ? format : "mp3";
    const mimeType = mimeMap[ext] || "audio/mpeg";

    console.log(
      `[v2.3] Pipeline: transcription=${useWhisper ? "whisper-1" : "gemini-only"}, ` +
      `analysis=${analysisDisabled ? "disabled" : resolvedAnalysisModel} (2 parallel calls: hook + adlib), ` +
      `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`
    );

    // ── Run all three stages in parallel ─────────────────────────────────────
    const whisperPromise = useWhisper && OPENAI_API_KEY
      ? runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY)
      : Promise.reject(new Error(useWhisper && !OPENAI_API_KEY ? "OPENAI_API_KEY not set" : "WHISPER_SKIPPED"));

    const hookPromise = !analysisDisabled
      ? runGeminiHookAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel)
      : Promise.reject(new Error("ANALYSIS_DISABLED"));

    const adlibPromise = !analysisDisabled
      ? runGeminiAdlibAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel)
      : Promise.reject(new Error("ANALYSIS_DISABLED"));

    const [whisperResult, hookResult, adlibResult] = await Promise.allSettled([
      whisperPromise,
      hookPromise,
      adlibPromise,
    ]);

    // ── Handle transcription result ──────────────────────────────────────────
    let words: WhisperWord[] = [];
    let segments: Array<{ start: number; end: number; text: string }> = [];
    let rawText = "";

    if (useWhisper) {
      if (whisperResult.status === "rejected") {
        const err = (whisperResult.reason as Error)?.message || "Whisper failed";
        console.error("Whisper failed:", err);
        return new Response(
          JSON.stringify({ error: `Transcription failed: ${err}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      ({ words, segments, rawText } = whisperResult.value);
      console.log(`Whisper: ${words.length} words, ${segments.length} segments`);
    }

    const whisperOutput = useWhisper && whisperResult.status === "fulfilled" ? {
      wordCount: words.length,
      segmentCount: segments.length,
      rawText: rawText.slice(0, 1000),
      words: words.slice(0, 80),
      segments: segments.slice(0, 30),
    } : { status: useWhisper ? "failed" : "skipped" };

    const baseLines = useWhisper ? buildLinesFromSegments(segments, words) : [];

    // ── Handle analysis results ───────────────────────────────────────────────
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let lines: LyricLine[] = baseLines;
    let geminiUsed = false;
    let geminiError: string | null = null;
    let globalOffset = 0;

    const hookSuccess = !analysisDisabled && hookResult.status === "fulfilled";
    const adlibSuccess = !analysisDisabled && adlibResult.status === "fulfilled";

    // Metadata/insights always come from hook call (less token pressure = more accurate)
    if (hookSuccess) {
      const h = hookResult.value;
      geminiUsed = true;
      title = h.metadata.title || "Unknown";
      artist = h.metadata.artist || "Unknown";
      metadata = {
        mood: h.insights?.mood?.value || h.metadata.mood,
        bpm_estimate: h.insights?.bpm?.value || h.metadata.bpm_estimate,
        confidence: h.insights?.mood?.confidence ?? h.metadata.confidence,
        key: h.insights?.key?.value || h.metadata.key,
        genre_hint: h.metadata.genre_hint,
        bpm_confidence: h.insights?.bpm?.confidence,
        key_confidence: h.insights?.key?.confidence,
        mood_confidence: h.insights?.mood?.confidence,
      };
    } else if (!analysisDisabled && hookResult.status === "rejected") {
      const reason = (hookResult.reason as Error)?.message || "unknown";
      geminiError = `hook: ${reason}`;
      console.warn("Gemini hook analysis failed:", reason);
    }

    if (adlibResult.status === "rejected" && !analysisDisabled) {
      const reason = (adlibResult.reason as Error)?.message || "unknown";
      geminiError = geminiError ? `${geminiError}; adlib: ${reason}` : `adlib: ${reason}`;
      console.warn("Gemini adlib analysis failed:", reason);
    }

    const resolvedAdlibs: GeminiAdlib[] = adlibSuccess ? adlibResult.value.adlibs : [];
    const resolvedHook: GeminiHook | null = hookSuccess ? hookResult.value.hook : null;

    if (useWhisper) {
      // ── v2.2: Compute Global Timebase Guard ──────────────────────────────
      globalOffset = computeGlobalOffset(resolvedAdlibs, words);
      if (Math.abs(globalOffset) > 0.150) {
        console.log(`Applying global timebase correction: ${globalOffset.toFixed(3)}s`);
      }

      // Hybrid: Whisper timing + Gemini adlib semantic tags
      lines = extractAdlibsFromWords(baseLines, resolvedAdlibs, words, globalOffset);

      // ── v2.2: Hook Invariant — 10s fixed, confidence-gated ───────────────
      if (resolvedHook) {
        const hookSpan = findHookFromWords(words, resolvedHook);
        if (hookSpan) hooks = [{ ...hookSpan, reasonCodes: [] }];
      }
    } else if (geminiUsed) {
      // Gemini-only: use timestamps directly
      const geminiLines: LyricLine[] = resolvedAdlibs.map(a => ({
        start: a.start,
        end: a.end,
        text: a.text,
        tag: "adlib" as const,
        confidence: a.confidence,
      }));
      lines = [...baseLines, ...geminiLines].sort((a, b) => a.start - b.start);
      if (resolvedHook) {
        const HOOK_DURATION = 10.000;
        hooks = [{
          start: resolvedHook.start_sec,
          end: Math.round((resolvedHook.start_sec + HOOK_DURATION) * 1000) / 1000,
          score: Math.round((resolvedHook.confidence || 0.75) * 100),
          previewText: "",
          reasonCodes: [],
          status: "confirmed",
        }];
      }
    }

    const geminiOutput = analysisDisabled ? { status: "disabled" } : {
      status: hookSuccess || adlibSuccess ? "success" : "failed",
      model: resolvedAnalysisModel,
      hook: {
        status: hookSuccess ? "success" : "failed",
        rawLength: hookSuccess ? hookResult.value.rawContent.length : 0,
        result: resolvedHook,
      },
      adlibs: {
        status: adlibSuccess ? "success" : "failed",
        rawLength: adlibSuccess ? adlibResult.value.rawContent.length : 0,
        count: resolvedAdlibs.length,
        results: resolvedAdlibs,
      },
      globalOffset,
    };

    const adlibCount = lines.filter(l => l.tag === "adlib").length;
    const floatingCount = lines.filter(l => l.isFloating).length;
    const conflictCount = lines.filter(l => l.geminiConflict).length;
    console.log(`[v2.3] Final: ${lines.length} lines (${lines.length - adlibCount} main, ${adlibCount} adlib, ${floatingCount} floating, ${conflictCount} conflicts), ${hooks.length} hooks | hook=${hookSuccess} adlib=${adlibSuccess}`);

    return new Response(
      JSON.stringify({
        title,
        artist,
        metadata,
        lines,
        hooks,
        _debug: {
          version: "anchor-align-v2.3-split",
          pipeline: {
            transcription: useWhisper ? "whisper-1" : "gemini-only",
            analysis: analysisDisabled ? "disabled" : resolvedAnalysisModel,
          },
          geminiUsed,
          geminiError,
          globalOffset,
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
          adlibLines: adlibCount,
          floatingAdlibs: floatingCount,
          conflictAdlibs: conflictCount,
          mainLines: lines.length - adlibCount,
          hooksFound: hooks.length,
          whisper: {
            input: { model: useWhisper ? "whisper-1" : "skipped", format: ext, mimeType, estimatedMB: Math.round(estimatedBytes / 1024 / 1024 * 10) / 10 },
            output: whisperOutput,
          },
          gemini: {
            input: { model: analysisDisabled ? "disabled" : resolvedAnalysisModel, mimeType },
            output: geminiOutput,
          },
          merged: { totalLines: lines.length, mainLines: lines.length - adlibCount, adlibLines: adlibCount, hooks, title, artist, metadata, allLines: lines },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("lyric-transcribe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
