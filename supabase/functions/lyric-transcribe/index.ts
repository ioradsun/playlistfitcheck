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
  const blob = new Blob([new Uint8Array(audioBytes.buffer as ArrayBuffer)], { type: mimeType });
  

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "true");
  form.append("diarize", "true");
  form.append("language_code", "eng");

  
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

  const allWords = data.words || [];
  const audioEvents = allWords.filter((w: any) => w.type === "audio_event");
  const speechWords = allWords.filter((w: any) => w.type === "word" || !w.type);
  console.log(`[Scribe] Total tokens: ${allWords.length}, speech: ${speechWords.length}, audio_events: ${audioEvents.length}`);
  if (speechWords.length === 0 && audioEvents.length > 0) {
    console.warn("[Scribe] Only audio_events returned — no speech detected. Events:", audioEvents.map((e: any) => e.text).join(", "));
  }

  const words: WhisperWord[] = speechWords
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

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    const contentType = req.headers.get("content-type") || "";
    let audioBase64: string | undefined;
    let audioRawBytes: Uint8Array | undefined; // raw bytes — avoids base64 round-trip for Scribe
    let format: string | undefined;
    let referenceLyrics: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
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
      referenceLyrics = typeof payload.referenceLyrics === "string" ? payload.referenceLyrics : undefined;
    }

    const editorMode = typeof referenceLyrics === "string" && referenceLyrics.trim().length > 0;
    
    if (!audioBase64 && !audioRawBytes) throw new Error("No audio data provided");

    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

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

    const transcriptionEngine = "scribe_v2";

    // ── Stage 1: Transcription ──
    const transcribePromise = withRetry(
      () => runScribe(audioRawBytes!, ext, mimeType, ELEVENLABS_API_KEY),
    );

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
              normalizedWordCount: words.filter((w: any) => w.end - w.start <= 3.0).length,
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
