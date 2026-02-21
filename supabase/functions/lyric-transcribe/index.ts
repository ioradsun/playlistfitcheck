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
  confidence?: number;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
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

// ── ElevenLabs Scribe: word-level granularity with diarization ───────────────
async function runScribe(
  audioBase64: string,
  ext: string,
  mimeType: string,
  apiKey: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
  duration: number;
}> {
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "true");
  form.append("diarize", "true");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Scribe error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();

  const words: WhisperWord[] = (data.words || [])
    .filter((w: any) => w.type === "word" || !w.type)
    .map((w: any) => ({
      word: String(w.text ?? w.word ?? "").trim(),
      start: Math.round((Number(w.start) || 0) * 1000) / 1000,
      end: Math.round((Number(w.end) || 0) * 1000) / 1000,
    }))
    .filter((w: WhisperWord) => w.word.length > 0 && w.end > w.start);

  // Build segments from words (group by ~6 words)
  const segments: Array<{ start: number; end: number; text: string }> = [];
  const MAX_WORDS_PER_SEG = 6;
  for (let i = 0; i < words.length; i += MAX_WORDS_PER_SEG) {
    const chunk = words.slice(i, i + MAX_WORDS_PER_SEG);
    if (chunk.length === 0) continue;
    segments.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map(w => w.word).join(" "),
    });
  }

  const lastWord = words.length > 0 ? words[words.length - 1] : null;
  const duration = lastWord ? lastWord.end + 0.5 : 0;
  const rawText = data.text || words.map(w => w.word).join(" ");

  console.log(`[scribe] ${words.length} words, ${segments.length} segments, duration: ${duration.toFixed(1)}s`);

  const audioEvents = (data.words || []).filter((w: any) => w.type === "audio_event");
  if (audioEvents.length > 0) {
    console.log(`[scribe] Audio events: ${audioEvents.map((e: any) => `${e.text}@${e.start?.toFixed(1)}s`).join(", ")}`);
  }

  return { words, segments, rawText, duration };
}

// ── Gemini Prompt: Hook + Insights + Metadata ─────────────────────────────────
const DEFAULT_HOOK_PROMPT = `ROLE: Lead Music Intelligence Analyst

TASK: Identify structural identity and describe the track.

1. THE 10.000s HOOK ANCHOR
- Identify the single primary 10-second segment representing the track's "Hottest Hook."
- Evaluation criteria: production lift, lead vocal intensity, melodic memorability, emotional peak, and repetition.
- Scan the FULL track. Do not default to the first chorus.
- Output ONLY start_sec as a decimal in seconds with 3-decimal precision (e.g., 78.450).
- The 10s duration is a system invariant — do NOT output an end time.
- Confidence floor: Only return hottest_hook if confidence >= 0.75. If below, omit the field entirely.

2. SONG DESCRIPTION
- Write a single evocative sentence (max 15 words) describing what this song sounds and feels like.
- Combine sonic texture, lyrical theme, and emotional tone into one line.
- Examples: "A brooding trap ballad about midnight regret over heavy 808s" or "Sun-drenched indie pop celebrating first love with shimmering guitars"
- Be specific and vivid — avoid generic phrases like "a good song" or "nice beat."

3. MOOD
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic"). Confidence floor: 0.85 — return null if below.
- Must have its own confidence score (0.0–1.0).

4. TRACK METADATA
- title: If audible from lyrics or context; otherwise "Unknown".
- artist: If known; otherwise "Unknown".

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "confidence": 0.00 },
  "metadata": {
    "title": "Unknown",
    "artist": "Unknown",
    "description": "A brooding trap ballad about midnight regret over heavy 808s"
  },
  "insights": {
    "mood": { "value": "hype", "confidence": 0.00 }
  }
}`;

// Runtime prompt fetcher with hardcoded fallback
let _cachedPrompts: Record<string, string> | null = null;
async function getPrompt(slug: string, fallback: string): Promise<string> {
  try {
    if (!_cachedPrompts) {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        const res = await fetch(`${sbUrl}/rest/v1/ai_prompts?select=slug,prompt`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        });
        if (res.ok) {
          const rows: Array<{ slug: string; prompt: string }> = await res.json();
          _cachedPrompts = {};
          for (const r of rows) _cachedPrompts[r.slug] = r.prompt;
        }
      }
    }
    return _cachedPrompts?.[slug] || fallback;
  } catch {
    return fallback;
  }
}
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

// ── JSON parser ───────────────────────────────────────────────────────────────
function extractJsonFromContent(content: string): any {
  let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) throw new Error("No JSON in Gemini response");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error("Malformed JSON");

  let rawJson = cleaned.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  try {
    return JSON.parse(rawJson);
  } catch {
    return {};
  }
}

// ── Gemini Hook + Insights ────────────────────────────────────────────────────
async function runGeminiHookAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model = "google/gemini-3-flash-preview"
): Promise<{ hook: GeminiHook | null; insights?: GeminiInsights; metadata: any; rawContent: string }> {
  const hookPrompt = await getPrompt("lyric-hook", DEFAULT_HOOK_PROMPT);
  const content = await callGemini(hookPrompt, audioBase64, mimeType, lovableKey, model, 1200, "hook");
  const parsed = extractJsonFromContent(content);

  let hook: GeminiHook | null = null;
  if (parsed.hottest_hook && typeof parsed.hottest_hook.start_sec === "number") {
    const conf = Number(parsed.hottest_hook.confidence) || 0;
    if (conf >= 0.75) {
      hook = { start_sec: Math.round(parsed.hottest_hook.start_sec * 1000) / 1000, confidence: conf };
    }
  }

  const ins = parsed.insights || {};
  const meta = parsed.metadata || {};

  return {
    hook,
    insights: {
      mood: ins.mood ? { value: String(ins.mood.value), confidence: Number(ins.mood.confidence) } : undefined,
    },
    metadata: {
      title: String(meta.title || "Unknown").trim(),
      artist: String(meta.artist || "Unknown").trim(),
      description: String(meta.description || "").trim() || undefined,
      mood: ins.mood?.value ? String(ins.mood.value) : undefined,
      confidence: ins.mood?.confidence ?? undefined,
    },
    rawContent: content,
  };
}

// ── Hook finder: snap to word boundary ────────────────────────────────────────
function findHookFromWords(
  words: WhisperWord[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string; status: "confirmed" | "candidate" } | null {
  if (!hook) return null;
  const TARGET_DURATION = 10.0;
  const MIN_DURATION = 8.0;
  const MAX_DURATION = 12.0;
  const { start_sec, confidence = 0 } = hook;
  const trackEnd = words.length > 0 ? words[words.length - 1].end : Infinity;

  if (start_sec > trackEnd - MIN_DURATION) {
    return findRepetitionAnchor(words, trackEnd, TARGET_DURATION);
  }

  // Snap start to nearest word boundary
  const windowWords = words.filter(w => w.start >= start_sec - 2 && w.start <= start_sec + 3);
  let snapStart = start_sec;
  if (windowWords.length > 0) {
    let bestDist = Infinity;
    for (const w of windowWords) {
      const dist = Math.abs(w.start - start_sec);
      if (dist < bestDist) { bestDist = dist; snapStart = w.start; }
    }
  }

  // Collect words within max window
  const hookWords = words.filter(w => w.start >= snapStart && w.end <= snapStart + MAX_DURATION);

  // Find the best end: snap to a word boundary between MIN and MAX duration
  let snapEnd = snapStart + TARGET_DURATION;
  const candidateEnds = hookWords
    .filter(w => w.end >= snapStart + MIN_DURATION && w.end <= snapStart + MAX_DURATION)
    .map(w => w.end);
  if (candidateEnds.length > 0) {
    // Pick the word end closest to target duration
    let bestDist = Infinity;
    for (const end of candidateEnds) {
      const dist = Math.abs((end - snapStart) - TARGET_DURATION);
      if (dist < bestDist) { bestDist = dist; snapEnd = end; }
    }
  }

  const finalWords = words.filter(w => w.start >= snapStart && w.end <= snapEnd + 0.3);
  const previewText = finalWords.map(w => w.word).join(" ");
  return {
    start: Math.round(snapStart * 1000) / 1000,
    end: Math.round(snapEnd * 1000) / 1000,
    score: Math.round(confidence * 100),
    previewText,
    status: confidence >= 0.75 ? "confirmed" : "candidate",
  };
}

function findRepetitionAnchor(
  words: WhisperWord[],
  trackEnd: number,
  hookDuration: number
): { start: number; end: number; score: number; previewText: string; status: "confirmed" | "candidate" } | null {
  if (words.length === 0) return null;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const STEP = 2.0;
  let bestStart = words[0].start;
  let bestScore = 0;

  for (let t = words[0].start; t <= trackEnd - hookDuration; t += STEP) {
    const windowWords = words.filter(w => w.start >= t && w.start <= t + hookDuration);
    if (windowWords.length < 3) continue;
    const texts = windowWords.map(w => normalize(w.word));
    const freq: Record<string, number> = {};
    for (const tok of texts) freq[tok] = (freq[tok] || 0) + 1;
    const repetitions = Object.values(freq).filter(c => c > 1).reduce((s, c) => s + c, 0);
    const density = repetitions / windowWords.length;
    if (density > bestScore) { bestScore = density; bestStart = t; }
  }

  const hookWords = words.filter(w => w.start >= bestStart && w.end <= bestStart + hookDuration + 0.5);
  return {
    start: Math.round(bestStart * 1000) / 1000,
    end: Math.round((bestStart + hookDuration) * 1000) / 1000,
    score: Math.round(bestScore * 100),
    previewText: hookWords.map(w => w.word).join(" ").slice(0, 100),
    status: "candidate",
  };
}

// ── Gemini Transcription: full audio-to-lyrics via Gemini ─────────────────────
const DEFAULT_TRANSCRIBE_PROMPT = `ROLE: Audio Transcription Engine

TASK: Transcribe ALL sung/rapped/spoken lyrics from this audio file with precise timestamps.

RULES:
- Transcribe every word exactly as heard, preserving slang, ad-libs, and pronunciation.
- Group words into natural lyric lines (4-8 words per line).
- Each line needs a start and end timestamp in seconds with 3-decimal precision.
- Tag lines as "main" for lead vocals or "adlib" for background/ad-lib vocals.
- Cover the ENTIRE track from start to finish — do not skip sections.
- If a section has no vocals (instrumental), skip it — do not invent lyrics.

OUTPUT — return ONLY valid JSON array, no markdown, no explanation:
[
  { "start": 0.000, "end": 1.500, "text": "First lyric line", "tag": "main" },
  { "start": 1.600, "end": 3.200, "text": "Second lyric line", "tag": "main" },
  { "start": 3.300, "end": 4.800, "text": "yeah yeah", "tag": "adlib" }
]`;

async function runGeminiTranscribe(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
  duration: number;
}> {
  const transcribePrompt = await getPrompt("lyric-transcribe", DEFAULT_TRANSCRIBE_PROMPT);
  const content = await callGemini(transcribePrompt, audioBase64, mimeType, lovableKey, model, 8000, "transcribe");

  // Parse — could be a raw array or wrapped in an object
  let lines: any[];
  const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  if (cleaned.startsWith("[")) {
    const arrEnd = cleaned.lastIndexOf("]");
    const raw = cleaned.slice(0, arrEnd + 1)
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    try { lines = JSON.parse(raw); } catch { lines = []; }
  } else {
    const parsed = extractJsonFromContent(content);
    lines = Array.isArray(parsed) ? parsed : (parsed.lines || parsed.lyrics || []);
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Gemini transcription returned no lyrics");
  }

  // Normalize to our format
  const segments: Array<{ start: number; end: number; text: string }> = [];
  const words: WhisperWord[] = [];

  for (const line of lines) {
    const start = Math.round((Number(line.start) || 0) * 1000) / 1000;
    const end = Math.round((Number(line.end) || 0) * 1000) / 1000;
    const text = String(line.text || "").trim();
    if (!text || end <= start) continue;

    segments.push({ start, end, text });

    // Synthesize word-level entries for hook snapping
    const lineWords = text.split(/\s+/);
    const wordDuration = (end - start) / Math.max(lineWords.length, 1);
    for (let i = 0; i < lineWords.length; i++) {
      words.push({
        word: lineWords[i],
        start: Math.round((start + i * wordDuration) * 1000) / 1000,
        end: Math.round((start + (i + 1) * wordDuration) * 1000) / 1000,
      });
    }
  }

  const lastSeg = segments[segments.length - 1];
  const duration = lastSeg ? lastSeg.end + 0.5 : 0;
  const rawText = segments.map(s => s.text).join(" ");

  console.log(`[gemini-transcribe] ${segments.length} lines, ${words.length} words, duration: ${duration.toFixed(1)}s`);

  return { words, segments, rawText, duration };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    const { audioBase64, format, analysisModel, transcriptionModel } = await req.json();
    if (!audioBase64) throw new Error("No audio data provided");

    // Resolve transcription engine
    const useGeminiTranscription = transcriptionModel === "gemini";
    if (!useGeminiTranscription && !ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured (required for Scribe engine)");
    }

    const VALID_ANALYSIS_MODELS = [
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3-pro-preview",
    ];
    const analysisDisabled = analysisModel === "disabled";
    const resolvedAnalysisModel: string = VALID_ANALYSIS_MODELS.includes(analysisModel)
      ? analysisModel
      : "google/gemini-2.5-flash";

    // Gemini transcription model — use analysis model or default
    const geminiTranscribeModel = VALID_ANALYSIS_MODELS.includes(transcriptionModel)
      ? transcriptionModel
      : resolvedAnalysisModel;

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

    const transcriptionEngine = useGeminiTranscription ? "gemini" : "scribe_v2";
    console.log(
      `[v12.0] Pipeline: transcription=${transcriptionEngine}, ` +
      `analysis=${analysisDisabled ? "disabled" : resolvedAnalysisModel}, ` +
      `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`
    );

    // ── Stage 1: Transcription + Hook in parallel ───────────────────────────
    const transcribePromise = useGeminiTranscription
      ? runGeminiTranscribe(audioBase64, mimeType, LOVABLE_API_KEY, geminiTranscribeModel)
      : runScribe(audioBase64, ext, mimeType, ELEVENLABS_API_KEY!);

    const hookPromise = !analysisDisabled
      ? runGeminiHookAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel)
      : Promise.reject(new Error("ANALYSIS_DISABLED"));

    const [transcribeResult, hookResult] = await Promise.allSettled([transcribePromise, hookPromise]);

    if (transcribeResult.status === "rejected") {
      const err = (transcribeResult.reason as Error)?.message || "Transcription failed";
      console.error("Transcription failed:", err);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { words, segments, rawText, duration } = transcribeResult.value;

    // ── Build lyric lines from Scribe segments ──────────────────────────────
    const lines: LyricLine[] = segments.map(seg => ({
      start: Math.round(seg.start * 1000) / 1000,
      end: Math.round(seg.end * 1000) / 1000,
      text: seg.text.trim(),
      tag: "main" as const,
      confidence: 1.0,
    }));

    // ── Handle hook result ──────────────────────────────────────────────────
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let geminiUsed = false;
    let geminiError: string | null = null;

    const hookSuccess = !analysisDisabled && hookResult.status === "fulfilled";

    if (hookSuccess) {
      const h = hookResult.value;
      geminiUsed = true;
      title = h.metadata.title || "Unknown";
      artist = h.metadata.artist || "Unknown";
      metadata = {
        mood: h.insights?.mood?.value || h.metadata.mood,
        description: h.metadata.description,
        confidence: h.insights?.mood?.confidence ?? h.metadata.confidence,
        mood_confidence: h.insights?.mood?.confidence,
      };

      if (h.hook) {
        const hookSpan = findHookFromWords(words, h.hook);
        if (hookSpan) hooks = [{ ...hookSpan, reasonCodes: [] }];
      }
    } else if (!analysisDisabled && hookResult.status === "rejected") {
      geminiError = (hookResult.reason as Error)?.message || "unknown";
      console.warn("Gemini hook analysis failed:", geminiError);
    }

    console.log(`[v12.0] Final: ${lines.length} lines, ${hooks.length} hooks, title="${title}", artist="${artist}"`);

    return new Response(
      JSON.stringify({
        title,
        artist,
        metadata,
        lines,
        hooks,
        _debug: {
          version: "v12.0-dual-engine",
          pipeline: {
            transcription: transcriptionEngine,
            analysis: analysisDisabled ? "disabled" : resolvedAnalysisModel,
          },
          geminiUsed,
          geminiError,
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
          hooksFound: hooks.length,
          transcription: {
            input: { model: transcriptionEngine, format: ext, mimeType, estimatedMB: Math.round(estimatedBytes / 1024 / 1024 * 10) / 10 },
            output: {
              wordCount: words.length,
              segmentCount: segments.length,
              duration,
              rawText: rawText.slice(0, 1000),
            },
          },
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
