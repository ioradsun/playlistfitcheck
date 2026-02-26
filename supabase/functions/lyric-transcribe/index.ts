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
  const scribeT0 = Date.now();
  const sms = () => `${Date.now() - scribeT0}ms`;

  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  console.log(`[Transcribe Debug] [scribe] ${sms()} blob created, ${(blob.size/1024/1024).toFixed(2)}MB`);

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "true");
  form.append("diarize", "true");

  console.log(`[Transcribe Debug] [scribe] ${sms()} sending to ElevenLabs`);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  console.log(`[Transcribe Debug] [scribe] ${sms()} ElevenLabs responded status=${res.status}`);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Scribe error ${res.status}: ${errText.slice(0, 300)}`);
  }

  console.log(`[Transcribe Debug] [scribe] ${sms()} parsing JSON response`);
  const data = await res.json();
  console.log(`[Transcribe Debug] [scribe] ${sms()} JSON parsed, ${(data.words||[]).length} raw words`);

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

// ── Gemini Prompt: Song DNA (Hook + Insights + Metadata + Meaning) ────────────
const DEFAULT_HOOK_PROMPT = `ROLE: Lead Music Intelligence Analyst — Song DNA Engine

TASK: Analyze the full audio track and extract its structural identity ("Song DNA").

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
- Be specific and vivid — avoid generic phrases like "a good song" or "nice beat."

3. MOOD
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic"). Confidence floor: 0.85 — return null if below.

4. TRACK METADATA
- title: If audible from lyrics or context; otherwise "Unknown".
- artist: If known; otherwise "Unknown".

5. BPM
- Estimate the tempo in beats per minute. Return as integer.
- Confidence: 0.0–1.0.

6. SONG MEANING (from lyrics heard in the audio)
- theme: The core theme in 2-4 words
- summary: A 2-3 sentence plain-language explanation of what the song is about
- imagery: 2-3 notable metaphors or images used (array of short strings)

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "confidence": 0.00 },
  "metadata": {
    "title": "Unknown",
    "artist": "Unknown",
    "description": "A brooding trap ballad about midnight regret over heavy 808s"
  },
  "insights": {
    "mood": { "value": "hype", "confidence": 0.00 },
    "bpm": { "value": 140, "confidence": 0.90 }
  },
  "meaning": {
    "theme": "Midnight Regret",
    "summary": "The artist reflects on a relationship that fell apart...",
    "imagery": ["broken glass", "empty streets", "fading headlights"]
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
): Promise<{ hook: GeminiHook | null; insights?: GeminiInsights; metadata: any; meaning?: any; rawContent: string }> {
  const hookPrompt = await getPrompt("lyric-hook", DEFAULT_HOOK_PROMPT);
  const content = await callGemini(hookPrompt, audioBase64, mimeType, lovableKey, model, 2000, "hook");
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
  const meaning = parsed.meaning || null;

  return {
    hook,
    insights: {
      mood: ins.mood ? { value: String(ins.mood.value), confidence: Number(ins.mood.confidence) } : undefined,
      bpm: ins.bpm ? { value: Number(ins.bpm.value), confidence: Number(ins.bpm.confidence) } : undefined,
    },
    metadata: {
      title: String(meta.title || "Unknown").trim(),
      artist: String(meta.artist || "Unknown").trim(),
      description: String(meta.description || "").trim() || undefined,
      mood: ins.mood?.value ? String(ins.mood.value) : undefined,
      confidence: ins.mood?.confidence ?? undefined,
    },
    meaning: meaning ? {
      theme: meaning.theme ? String(meaning.theme) : undefined,
      summary: meaning.summary ? String(meaning.summary) : undefined,
      imagery: Array.isArray(meaning.imagery) ? meaning.imagery.map(String) : undefined,
    } : undefined,
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

// ── Scribe Editor Mode: diff/correct words against reference lyrics ──────────
function applyReferenceLyricsDiff(
  words: WhisperWord[],
  referenceLyrics: string
): WhisperWord[] {
  // Tokenize reference lyrics into flat word list
  const refWords = referenceLyrics
    .split(/\n/)
    .flatMap(line => line.trim().split(/\s+/))
    .filter(w => w.length > 0);

  if (refWords.length === 0) return words;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Simple LCS-based alignment: walk both sequences greedily
  const result: WhisperWord[] = [];
  let ri = 0; // reference index

  for (let wi = 0; wi < words.length; wi++) {
    const scribeNorm = normalize(words[wi].word);

    // Look ahead in reference to find a match
    let matched = false;
    for (let look = ri; look < Math.min(ri + 5, refWords.length); look++) {
      if (normalize(refWords[look]) === scribeNorm) {
        // Fill any skipped reference words by interpolating timestamps
        for (let skip = ri; skip < look; skip++) {
          const interpStart = result.length > 0 ? result[result.length - 1].end : words[wi].start;
          const interpEnd = words[wi].start;
          const frac = (skip - ri + 1) / (look - ri + 1);
          result.push({
            word: refWords[skip],
            start: Math.round((interpStart + (interpEnd - interpStart) * (frac - 1 / (look - ri + 1))) * 1000) / 1000,
            end: Math.round((interpStart + (interpEnd - interpStart) * frac) * 1000) / 1000,
          });
        }
        // Use reference text with Scribe timestamp
        result.push({ word: refWords[look], start: words[wi].start, end: words[wi].end });
        ri = look + 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Replace Scribe word with next reference word if available
      if (ri < refWords.length) {
        result.push({ word: refWords[ri], start: words[wi].start, end: words[wi].end });
        ri++;
      } else {
        result.push(words[wi]); // Keep Scribe word as-is
      }
    }
  }

  // Append remaining reference words with estimated timestamps
  if (ri < refWords.length && result.length > 0) {
    const lastEnd = result[result.length - 1].end;
    const remaining = refWords.slice(ri);
    const gap = 0.3;
    for (let i = 0; i < remaining.length; i++) {
      result.push({
        word: remaining[i],
        start: Math.round((lastEnd + i * gap) * 1000) / 1000,
        end: Math.round((lastEnd + (i + 1) * gap) * 1000) / 1000,
      });
    }
  }

  console.log(`[editor-mode] Scribe diff: ${words.length} scribe words → ${result.length} corrected words, ${refWords.length} ref words`);
  return result;
}

// ── Gemini Transcription: full audio-to-lyrics via Gemini ─────────────────────
const DEFAULT_TRANSCRIBE_PROMPT = `ROLE: Lead Audio Transcription Engine (Global Clock Sync)

TASK: Transcribe all vocals with millisecond-precision anchored to the Absolute File Start (0.000).

1. GLOBAL CLOCK ANCHORING
Reference Zero: The first millisecond of the audio file is 0.000. Every timestamp must be relative to this absolute start point.
Silence Accounting: If the song starts with an instrumental intro, your first entry MUST NOT begin until the first vocal phoneme, but that time must reflect the offset from file start.
Continuous Tracking: Do not "reset" the clock for different sections.

2. TRANSCRIPTION RULES
Verbatim: Capture slang, ad-libs, and vocal textures exactly.
Categorization: Use "main" for lead vocals and "adlib" for background/shouts.
Granularity: 4-8 words per line.

3. TECHNICAL CONSTRAINTS
Precision: 3-decimal float (e.g., 12.402).
No Overlaps: Ensure end times for main vocals do not exceed the start time of the next main vocal.
Format: Output ONLY the raw JSON array. No markdown, no explanation, no backticks.

OUTPUT TEMPLATE:
[
  { "start": 5.210, "end": 7.400, "text": "I'm starting on the beat now", "tag": "main" },
  { "start": 7.450, "end": 8.100, "text": "yeah yeah", "tag": "adlib" }
]`;

const DEFAULT_ALIGN_PROMPT = `ROLE: Precision Lyric Alignment Engine (Global Clock Sync)

TASK: You are given the complete lyrics below. Your ONLY job is to listen
to the audio and assign precise start/end timestamps to each line.
Do NOT alter, rewrite, or reorder the lyrics. Align them exactly as given.

REFERENCE LYRICS:
{referenceLyrics}

RULES:
- Timestamps anchored to Absolute File Start (0.000)
- 3-decimal precision (e.g., 12.402)
- No overlaps between consecutive main vocal lines
- Tag lines as "main" or "adlib" based on what you hear
- If a reference line isn't audible, still include it with your best
  estimate based on surrounding context

OUTPUT: Raw JSON array only, no markdown.
[
  { "start": 5.210, "end": 7.400, "text": "exact lyric line from reference", "tag": "main" },
  { "start": 7.450, "end": 8.100, "text": "yeah yeah", "tag": "adlib" }
]`;

async function runGeminiTranscribe(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  referenceLyrics?: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
  duration: number;
}> {
  let transcribePrompt: string;
  if (referenceLyrics) {
    const alignTemplate = await getPrompt("lyric-align", DEFAULT_ALIGN_PROMPT);
    transcribePrompt = alignTemplate.replace("{referenceLyrics}", referenceLyrics);
    console.log("[editor-mode] Using Gemini forced alignment with reference lyrics");
  } else {
    transcribePrompt = await getPrompt("lyric-transcribe", DEFAULT_TRANSCRIBE_PROMPT);
  }
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

  const isKeepAlive = req.headers.get("x-keep-alive") === "true";
  if (isKeepAlive) {
    try { await req.json(); } catch {}
    return new Response(JSON.stringify({ ok: true, keepAlive: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const T0 = Date.now();
  const ms = () => `${Date.now() - T0}ms`;
  console.log(`[Transcribe Debug] ${ms()} edge function ENTRY`);

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    const contentType = req.headers.get("content-type") || "";
    let audioBase64: string | undefined;
    let format: string | undefined;
    let analysisModel: string | undefined;
    let transcriptionModel: string | undefined;
    let referenceLyrics: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      console.log(`[Transcribe Debug] ${ms()} parsing multipart form data`);
      const form = await req.formData();
      console.log(`[Transcribe Debug] ${ms()} formData parsed`);
      const audio = form.get("audio");
      analysisModel = String(form.get("analysisModel") || "");
      transcriptionModel = String(form.get("transcriptionModel") || "");
      referenceLyrics = String(form.get("referenceLyrics") || "");

      if (!(audio instanceof File)) {
        throw new Error("No audio file provided");
      }

      console.log(`[Transcribe Debug] ${ms()} audio file: ${audio.name}, size=${(audio.size/1024/1024).toFixed(2)}MB`);
      const ext = audio.name.split(".").pop()?.toLowerCase() || "mp3";
      format = ext;

      console.log(`[Transcribe Debug] ${ms()} reading arrayBuffer`);
      const uint8 = new Uint8Array(await audio.arrayBuffer());
      console.log(`[Transcribe Debug] ${ms()} arrayBuffer read, ${uint8.length} bytes`);
      console.log(`[Transcribe Debug] ${ms()} base64 encoding start`);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      audioBase64 = btoa(binary);
      console.log(`[Transcribe Debug] ${ms()} base64 encoding done, ${(audioBase64.length/1024/1024).toFixed(2)}MB base64`);
    } else {
      let payload: any;
      try {
        const rawBody = await req.text();
        if (!rawBody || rawBody.trim().length === 0) {
          throw new Error("Empty request body");
        }
        payload = JSON.parse(rawBody);
      } catch (parseErr) {
        return new Response(
          JSON.stringify({ error: "Invalid request body. Expected multipart/form-data with an audio file, or valid JSON." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64 : undefined;
      format = typeof payload.format === "string" ? payload.format : undefined;
      analysisModel = typeof payload.analysisModel === "string" ? payload.analysisModel : undefined;
      transcriptionModel = typeof payload.transcriptionModel === "string" ? payload.transcriptionModel : undefined;
      referenceLyrics = typeof payload.referenceLyrics === "string" ? payload.referenceLyrics : undefined;
    }

    const editorMode = typeof referenceLyrics === "string" && referenceLyrics.trim().length > 0;
    if (editorMode) console.log(`[editor-mode] Reference lyrics provided (${referenceLyrics!.trim().split("\n").length} lines)`);
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
    const resolvedAnalysisModel: string = VALID_ANALYSIS_MODELS.includes(analysisModel ?? "")
      ? analysisModel!
      : "google/gemini-2.5-flash";

    // Gemini transcription model — use analysis model or default
    const geminiTranscribeModel = VALID_ANALYSIS_MODELS.includes(transcriptionModel ?? "")
      ? transcriptionModel!
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

    // ── Stage 1: Transcription only (Song DNA is now a separate on-demand call) ──
    console.log(`[Transcribe Debug] ${ms()} starting transcription (engine=${transcriptionEngine})`);
    const transcribePromise = useGeminiTranscription
      ? runGeminiTranscribe(audioBase64, mimeType, LOVABLE_API_KEY, geminiTranscribeModel, editorMode ? referenceLyrics!.trim() : undefined)
      : runScribe(audioBase64, ext, mimeType, ELEVENLABS_API_KEY!);

    const [transcribeResult] = await Promise.allSettled([transcribePromise]);
    console.log(`[Transcribe Debug] ${ms()} transcription settled, status=${transcribeResult.status}`);

    if (transcribeResult.status === "rejected") {
      const err = (transcribeResult.reason as Error)?.message || "Transcription failed";
      console.error("Transcription failed:", err);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let { words, segments, rawText, duration } = transcribeResult.value;

    // ── Editor Mode: apply reference lyrics diff for Scribe path ────────────
    if (editorMode && !useGeminiTranscription) {
      words = applyReferenceLyricsDiff(words, referenceLyrics!.trim());
      // Rebuild segments from corrected words
      const MAX_WORDS_PER_SEG = 6;
      segments = [];
      for (let i = 0; i < words.length; i += MAX_WORDS_PER_SEG) {
        const chunk = words.slice(i, i + MAX_WORDS_PER_SEG);
        if (chunk.length === 0) continue;
        segments.push({
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          text: chunk.map(w => w.word).join(" "),
        });
      }
      rawText = words.map(w => w.word).join(" ");
    }

    // ── Build lyric lines from Scribe segments ──────────────────────────────
    const lines: LyricLine[] = segments.map(seg => ({
      start: Math.round(seg.start * 1000) / 1000,
      end: Math.round(seg.end * 1000) / 1000,
      text: seg.text.trim(),
      tag: "main" as const,
      confidence: 1.0,
    }));

    // ── Title/artist defaults (Song DNA analysis is now separate) ──────────
    const title = "Unknown";
    const artist = "Unknown";

    console.log(`[Transcribe Debug] ${ms()} Final: ${lines.length} lines, title="${title}", artist="${artist}"`);
    console.log(`[v14.0] Final: ${lines.length} lines, title="${title}", artist="${artist}"`);

    console.log(`[Transcribe Debug] ${ms()} sending response`);
    return new Response(
      JSON.stringify({
        title,
        artist,
        lines,
        words: words.map(w => ({ word: w.word, start: w.start, end: w.end })),
        _debug: {
          version: "v14.0-transcription-only",
          mode: editorMode ? "editor" : "detective",
          referenceProvided: editorMode,
          pipeline: { transcription: transcriptionEngine },
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
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
