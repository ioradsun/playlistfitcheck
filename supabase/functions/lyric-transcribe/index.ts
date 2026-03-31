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
  speaker_id?: string;
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

function isRetryableHttpError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /error\s5\d{2}/i.test(error.message);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 2000,
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries || !isRetryableHttpError(error)) throw error;
      console.warn(`[Pipeline] lyric-transcribe retry ${i + 1}/${retries}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable retry state");
}

function buildSegmentsFromWords(
  words: Array<{ word: string; start: number; end: number }>
): Array<{ start: number; end: number; text: string }> {
  if (words.length === 0) return [];

  const segments: Array<{ start: number; end: number; text: string }> = [];
  let segStart = 0;

  for (let i = 0; i < words.length; i++) {
    const isLast = i === words.length - 1;
    let shouldSplit = isLast;

    if (!isLast) {
      const gapMs = Math.round((words[i + 1].start - words[i].end) * 1000);
      const wordCount = i - segStart + 1;
      // Hard split on breath (300ms+ gap)
      if (gapMs >= 300) shouldSplit = true;
      // Soft split on pause (150ms+) when enough words have accumulated
      else if (gapMs >= 150 && wordCount >= 3) shouldSplit = true;
      // Safety ceiling — never let a segment exceed 6 words
      else if (wordCount >= 6) shouldSplit = true;
    }

    if (shouldSplit) {
      const chunk = words.slice(segStart, i + 1);
      segments.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        text: chunk.map(w => w.word).join(" "),
      });
      segStart = i + 1;
    }
  }

  return segments;
}

/**
 * Clamp word end times so no word bleeds into the next word's onset.
 * Scribe assigns silence gaps to the preceding word, producing durations
 * like 17s for a single word on slow/held performances.
 * Max legitimate word duration: 3.0s. Anything beyond that gets clamped
 * to nextWord.start - 0.05, or start + 3.0 for the last word.
 */
function normalizeWordDurations(
  words: WhisperWord[]
): WhisperWord[] {
  if (words.length === 0) return words;
  const MAX_WORD_DURATION = 3.0;
  const result = words.map(w => ({ ...w }));

  for (let i = 0; i < result.length; i++) {
    const w = result[i];
    const next = result[i + 1];
    const duration = w.end - w.start;

    if (next) {
      // If end overshoots next word's start, clamp it
      if (w.end > next.start - 0.01) {
        w.end = Math.max(w.start + 0.05, next.start - 0.05);
      }
      // If duration exceeds max, cap at next word start regardless
      if (duration > MAX_WORD_DURATION) {
        w.end = next.start - 0.05;
      }
    } else {
      // Last word: cap at max duration
      if (duration > MAX_WORD_DURATION) {
        w.end = w.start + MAX_WORD_DURATION;
      }
    }
  }

  return result;
}

// ── ElevenLabs Scribe: word-level granularity with diarization ───────────────
async function runScribe(
  audioBytes: Uint8Array,
  ext: string,
  mimeType: string,
  apiKey: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
  duration: number;
  rawWordsFull: any[];
}> {
  const scribeT0 = Date.now();
  const sms = () => `${Date.now() - scribeT0}ms`;

  const blob = new Blob([new Uint8Array(audioBytes.buffer as ArrayBuffer)], { type: mimeType });
  

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

  // DEBUG: log first 3 raw words to see what Scribe actually returns
  console.log("[Scribe] Raw word sample:", JSON.stringify((data.words || []).slice(0, 3)));

  // Log raw word fields from first 3 words to check for speaker_id, type, etc.
  const rawSample = (data.words || []).slice(0, 3).map((w: any) => Object.keys(w));
  console.log("[Scribe] raw word keys sample:", JSON.stringify(rawSample));

  const words: WhisperWord[] = (data.words || [])
    .filter((w: any) => w.type === "word" || !w.type)
    .map((w: any) => ({
      word: String(w.text ?? w.word ?? "").trim(),
      start: Math.round((Number(w.start) || 0) * 1000) / 1000,
      end: Math.round((Number(w.end) || 0) * 1000) / 1000,
      ...(w.speaker_id ? { speaker_id: String(w.speaker_id) } : {}),
    }))
    .filter((w: WhisperWord) => w.word.length > 0 && w.end >= w.start);

  // Capture full raw words before any stripping (all original fields from provider)
  const rawWordsFull = (data.words || []);

  const segments = buildSegmentsFromWords(words);

  const lastWord = words.length > 0 ? words[words.length - 1] : null;
  const duration = lastWord ? lastWord.end + 0.5 : 0;
  const rawText = data.text || words.map(w => w.word).join(" ");


  return { words, segments, rawText, duration, rawWordsFull };
}

// ── AssemblyAI: word-level transcription with polling ─────────────────────────
async function runAssemblyAI(
  audioBytes: Uint8Array,
  ext: string,
  mimeType: string,
  apiKey: string
): Promise<{
  words: WhisperWord[];
  segments: Array<{ start: number; end: number; text: string }>;
  rawText: string;
  duration: number;
  rawWordsFull: any[];
}> {
  // Step 1: Upload audio
  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream",
    },
    body: audioBytes as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`AssemblyAI upload error ${uploadRes.status}: ${errText.slice(0, 300)}`);
  }
  const { upload_url } = await uploadRes.json();

  // Step 2: Create transcript
  const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_models: ["universal-3-pro"],
    }),
  });
  if (!transcriptRes.ok) {
    const errText = await transcriptRes.text();
    throw new Error(`AssemblyAI transcript error ${transcriptRes.status}: ${errText.slice(0, 300)}`);
  }
  const { id: transcriptId } = await transcriptRes.json();

  // Step 3: Poll until complete (max ~5 min)
  const MAX_POLLS = 60;
  const POLL_INTERVAL = 5000;
  let result: any = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { authorization: apiKey },
    });
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`AssemblyAI poll error ${pollRes.status}: ${errText.slice(0, 300)}`);
    }
    result = await pollRes.json();
    if (result.status === "completed") break;
    if (result.status === "error") throw new Error(`AssemblyAI transcription failed: ${result.error || "unknown"}`);
  }
  if (!result || result.status !== "completed") {
    throw new Error("AssemblyAI transcription timed out");
  }

  // Convert AssemblyAI words (ms timestamps) to our format (seconds)
  const words: WhisperWord[] = (result.words || []).map((w: any) => ({
    word: String(w.text || "").trim(),
    start: Math.round((Number(w.start) / 1000) * 1000) / 1000,
    end: Math.round((Number(w.end) / 1000) * 1000) / 1000,
  })).filter((w: WhisperWord) => w.word.length > 0 && w.end > w.start);

  const segments = buildSegmentsFromWords(words);

  const lastWord = words.length > 0 ? words[words.length - 1] : null;
  const duration = lastWord ? lastWord.end + 0.5 : 0;
  const rawText = result.text || words.map(w => w.word).join(" ");

  return { words, segments, rawText, duration, rawWordsFull: [] };
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
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function applyReferenceLyricsDiff(
  words: WhisperWord[],
  referenceLyrics: string
): WhisperWord[] {
  const refWords = referenceLyrics
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  if (words.length === 0 || refWords.length === 0) return words;

  const wordNorms = words.map((w) => normalizeWord(w.word));
  const refNorms = refWords.map((w) => normalizeWord(w));

  const m = words.length;
  const n = refWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Number.POSITIVE_INFINITY));
  const from: string[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(""));
  dp[0][0] = 0;

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      const current = dp[i][j];
      if (!Number.isFinite(current)) continue;

      // a = keep transcription word
      if (i + 1 <= m) {
        const cost = current + 4;
        if (cost < dp[i + 1][j]) {
          dp[i + 1][j] = cost;
          from[i + 1][j] = "a";
        }
      }

      // b = skip reference word
      if (j + 1 <= n) {
        const cost = current + 2;
        if (cost < dp[i][j + 1]) {
          dp[i][j + 1] = cost;
          from[i][j + 1] = "b";
        }
      }

      // c = 1:1 mapping
      if (i + 1 <= m && j + 1 <= n) {
        const alignCost = editDistance(wordNorms[i], refNorms[j]);
        const cost = current + alignCost;
        if (cost < dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = cost;
          from[i + 1][j + 1] = "c";
        }
      }

      // d = 1:2 mapping
      if (i + 1 <= m && j + 2 <= n) {
        const refJoin = refNorms[j] + refNorms[j + 1];
        const alignCost = editDistance(wordNorms[i], refJoin);
        const cost = current + alignCost;
        if (cost < dp[i + 1][j + 2]) {
          dp[i + 1][j + 2] = cost;
          from[i + 1][j + 2] = "d";
        }
      }

      // e = 2:1 mapping
      if (i + 2 <= m && j + 1 <= n) {
        const transcribedJoin = wordNorms[i] + wordNorms[i + 1];
        const alignCost = editDistance(transcribedJoin, refNorms[j]);
        const cost = current + alignCost;
        if (cost < dp[i + 2][j + 1]) {
          dp[i + 2][j + 1] = cost;
          from[i + 2][j + 1] = "e";
        }
      }
    }
  }

  const ops: Array<{ op: string; ti?: number; ri?: number }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const step = from[i][j];
    if (step === "a") {
      ops.push({ op: "keep", ti: i - 1 });
      i -= 1;
    } else if (step === "b") {
      ops.push({ op: "skip_r", ri: j - 1 });
      j -= 1;
    } else if (step === "c") {
      ops.push({ op: "1:1", ti: i - 1, ri: j - 1 });
      i -= 1;
      j -= 1;
    } else if (step === "d") {
      ops.push({ op: "1:2", ti: i - 1, ri: j - 2 });
      i -= 1;
      j -= 2;
    } else if (step === "e") {
      ops.push({ op: "2:1", ti: i - 2, ri: j - 1 });
      i -= 2;
      j -= 1;
    } else {
      // Fallback for safety if DP path is unexpectedly incomplete.
      if (i > 0) {
        ops.push({ op: "keep", ti: i - 1 });
        i -= 1;
      } else {
        ops.push({ op: "skip_r", ri: j - 1 });
        j -= 1;
      }
    }
  }
  ops.reverse();

  const result: WhisperWord[] = [];

  for (const op of ops) {
    if (op.op === "keep") {
      result.push({ ...words[op.ti!] });
      continue;
    }

    if (op.op === "skip_r") {
      continue;
    }

    if (op.op === "1:1") {
      const ti = op.ti!;
      const ri = op.ri!;
      const transcribedNorm = wordNorms[ti];
      const referenceNorm = refNorms[ri];
      const maxLen = Math.max(transcribedNorm.length, referenceNorm.length);
      const sim = maxLen === 0 ? 1 : 1 - editDistance(transcribedNorm, referenceNorm) / maxLen;
      if (sim >= 0.6) {
        result.push({ ...words[ti], word: refWords[ri] });
      } else {
        result.push({ ...words[ti] });
      }
      continue;
    }

    if (op.op === "1:2") {
      const ti = op.ti!;
      const ri = op.ri!;
      const transcribedNorm = wordNorms[ti];
      const referenceNorm = refNorms[ri] + refNorms[ri + 1];
      const maxLen = Math.max(transcribedNorm.length, referenceNorm.length);
      const sim = maxLen === 0 ? 1 : 1 - editDistance(transcribedNorm, referenceNorm) / maxLen;
      const w = words[ti];

      if (sim >= 0.5) {
        const mid = Math.round(((w.start + w.end) / 2) * 1000) / 1000;
        result.push({ word: refWords[ri], start: w.start, end: mid });
        result.push({ word: refWords[ri + 1], start: mid, end: w.end });
      } else {
        result.push({ ...w });
      }
      continue;
    }

    if (op.op === "2:1") {
      const ti = op.ti!;
      const ri = op.ri!;
      const transcribedNorm = wordNorms[ti] + wordNorms[ti + 1];
      const referenceNorm = refNorms[ri];
      const maxLen = Math.max(transcribedNorm.length, referenceNorm.length);
      const sim = maxLen === 0 ? 1 : 1 - editDistance(transcribedNorm, referenceNorm) / maxLen;
      if (sim >= 0.5) {
        result.push({
          word: refWords[ri],
          start: words[ti].start,
          end: words[ti + 1].end,
        });
      } else {
        result.push({ ...words[ti] });
        result.push({ ...words[ti + 1] });
      }
    }
  }

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
  rawWordsFull: any[];
}> {
  const content = await callGemini(DEFAULT_TRANSCRIBE_PROMPT, audioBase64, mimeType, lovableKey, model, 8000, "transcribe");

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

  

  return { words, segments, rawText, duration, rawWordsFull: [] };
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
  

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    const contentType = req.headers.get("content-type") || "";
    let audioBase64: string | undefined;
    let audioRawBytes: Uint8Array | undefined; // raw bytes — avoids base64 round-trip for Scribe
    let format: string | undefined;
    let analysisModel: string | undefined;
    let transcriptionModel: string | undefined;
    let referenceLyrics: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      analysisModel = String(form.get("analysisModel") || "");
      transcriptionModel = String(form.get("transcriptionModel") || "");
      referenceLyrics = String(form.get("referenceLyrics") || "");

      if (!(audio instanceof File)) {
        throw new Error("No audio file provided");
      }

      
      const ext = audio.name.split(".").pop()?.toLowerCase() || "mp3";
      format = ext;

      audioRawBytes = new Uint8Array(await audio.arrayBuffer());
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

      // URL-based path: fetch audio from storage (same datacenter, ~1s)
      if (typeof payload.audioUrl === "string" && payload.audioUrl.length > 0) {
        
        const audioResp = await fetch(payload.audioUrl);
        if (!audioResp.ok) {
          throw new Error(`Failed to fetch audio from storage: ${audioResp.status}`);
        }
        audioRawBytes = new Uint8Array(await audioResp.arrayBuffer());
        
      } else {
        audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64 : undefined;
      }

      format = typeof payload.format === "string" ? payload.format : undefined;
      analysisModel = typeof payload.analysisModel === "string" ? payload.analysisModel : undefined;
      transcriptionModel = typeof payload.transcriptionModel === "string" ? payload.transcriptionModel : undefined;
      referenceLyrics = typeof payload.referenceLyrics === "string" ? payload.referenceLyrics : undefined;
    }

    const editorMode = typeof referenceLyrics === "string" && referenceLyrics.trim().length > 0;
    
    if (!audioBase64 && !audioRawBytes) throw new Error("No audio data provided");

    // Resolve transcription engine
    const useGeminiTranscription = transcriptionModel === "gemini";
    const useAssemblyAI = transcriptionModel === "assemblyai";
    const ASSEMBLYAI_API_KEY = useAssemblyAI ? Deno.env.get("ASSEMBLYAI_API_KEY") : undefined;
    if (useAssemblyAI && !ASSEMBLYAI_API_KEY) {
      throw new Error("ASSEMBLYAI_API_KEY is not configured");
    }
    if (!useGeminiTranscription && !useAssemblyAI && !ELEVENLABS_API_KEY) {
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

    // Ensure we have raw bytes (decode from base64 only if needed)
    if (!audioRawBytes && audioBase64) {
      const binaryStr = atob(audioBase64);
      audioRawBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) audioRawBytes[i] = binaryStr.charCodeAt(i);
    }

    const estimatedBytes = audioRawBytes ? audioRawBytes.length : (audioBase64 ? audioBase64.length * 0.75 : 0);
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

    const transcriptionEngine = useAssemblyAI ? "assemblyai" : useGeminiTranscription ? "gemini" : "scribe_v2";

    // ── Stage 1: Transcription ──
    let transcribePromise: Promise<{ words: WhisperWord[]; segments: Array<{ start: number; end: number; text: string }>; rawText: string; duration: number; rawWordsFull: any[] }>;

    if (useAssemblyAI) {
      transcribePromise = withRetry(
        () => runAssemblyAI(audioRawBytes!, ext, mimeType, ASSEMBLYAI_API_KEY!),
      );
    } else if (useGeminiTranscription) {
      // Gemini needs base64 — encode only here
      if (!audioBase64 && audioRawBytes) {
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < audioRawBytes.length; i += chunkSize) {
          binary += String.fromCharCode(...audioRawBytes.subarray(i, i + chunkSize));
        }
        audioBase64 = btoa(binary);
      }
      transcribePromise = withRetry(
        () =>
          runGeminiTranscribe(
            audioBase64!,
            mimeType,
            LOVABLE_API_KEY,
            geminiTranscribeModel,
          ),
      );
    } else {
      // Scribe: raw bytes, no base64 needed
      transcribePromise = withRetry(
        () => runScribe(audioRawBytes!, ext, mimeType, ELEVENLABS_API_KEY!),
      );
    }

    const [transcribeResult] = await Promise.allSettled([transcribePromise]);
    

    if (transcribeResult.status === "rejected") {
      const err = (transcribeResult.reason as Error)?.message || "Transcription failed";
      
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let { words, segments, rawText, duration, rawWordsFull } = transcribeResult.value as any;
    // Normalize word durations — clamp Scribe's silence-bleed artifacts
    words = normalizeWordDurations(words);

    // ── Editor Mode: apply reference lyrics diff for all transcription engines ─
    if (editorMode) {
      words = applyReferenceLyricsDiff(words, referenceLyrics!.trim());
      // Rebuild segments from corrected words
      segments = buildSegmentsFromWords(words);
      rawText = words.map((w: any) => w.word).join(" ");
    }

    // ── Build lyric lines from Scribe segments ──────────────────────────────
    const lines: LyricLine[] = segments.map((seg: any) => ({
      start: Math.round(seg.start * 1000) / 1000,
      end: Math.round(seg.end * 1000) / 1000,
      text: seg.text.trim(),
      tag: "main" as const,
      confidence: 1.0,
    }));

    // ── Title/artist defaults (Song DNA analysis is now separate) ──────────
    const title = "Unknown";
    const artist = "Unknown";

    return new Response(
      JSON.stringify({
        title,
        artist,
        lines,
        words: words.map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          ...(w.speaker_id ? { speaker_id: w.speaker_id } : {}),
        })),
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
              normalizedWordCount: words.filter(w => w.end - w.start <= 3.0).length,
              segmentCount: segments.length,
              duration,
              rawText: rawText.slice(0, 1000),
              rawWords: rawWordsFull || [],
            },
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
