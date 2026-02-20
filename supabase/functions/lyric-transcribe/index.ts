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
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface GeminiAdlib {
  start: string;
  end: string;
  text: string;
  tag: string;
  layer?: string;
  confidence?: number;
}

interface GeminiHook {
  start_sec: number;
  end_sec: number;
  transcript: string;
  section_type?: string;
  confidence?: number;
}

interface GeminiAnalysis {
  hottest_hook: GeminiHook | null;
  adlibs: GeminiAdlib[];
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

// ── Parse "MM:SS.mmm" or "HH:MM:SS.mmm" → seconds ───────────────────────────
function parseTimestamp(ts: string): number {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  return parseFloat(ts) || 0;
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

// ── Gemini: audio-first adlib + hook + metadata ───────────────────────────────
async function runGeminiAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model = "google/gemini-3-flash-preview"
): Promise<GeminiAnalysis> {
  const prompt = `You are an audio-first music transcription and commercial analysis engine built for professional SRT/closed caption generation and social media optimization.

Analyze the raw audio file only. Use vocal layering, loudness differences, stereo placement, beat drops, instrument expansion, bass impact changes, energy shifts, structural transitions, repetition patterns, dynamic contrast, melodic lift.

Do NOT rely on assumed lyrics. Do NOT hallucinate unclear words. If uncertain, omit. Prioritize precision over recall.

PART 1 — ADLIB + FILLER DETECTION

Definitions:
- PRIMARY = Main lyrical vocal line carrying meaning in that moment.
- ADLIB = Supporting vocal phrase that is NOT the dominant lyrical line; functions as a background layer, echo, hype callout, or interjection; is short and textural or energy-driven.
- FILLER = Non-lexical vocalization: uh, um, mm, ah, yeah, ayy, huh, etc.

If a vocal phrase is layered, panned, quieter, echoed, or inserted between lines → classify as ADLIB.
If unclear, omit rather than guess.

OUTPUT — TIME-ALIGNED ADLIB EVENTS (STRICT JSON under key "adlibs"):
[
  {
    "start": "MM:SS.mmm",
    "end": "MM:SS.mmm",
    "text": "yeah",
    "tag": "ADLIB",
    "layer": "background|echo|callout|texture",
    "confidence": 0.85
  }
]

Rules:
- Short segments (0.2–2.0s typical)
- Separate repeated instances
- Do not merge distinct adlibs
- Use "[inaudible]" only if clearly present but unintelligible
- Omit instead of hallucinating
- Confidence required for every event
- Max 30 entries

PART 2 — HOTTEST HOOK IDENTIFICATION (A&R STANDARD)

The hottest hook = single strongest continuous 10-second segment with highest combined commercial and replay potential.

Score based on: production lift (beat drop, instrument expansion, bass increase), vocal intensity spike, melodic memorability, repetition strength, emotional peak, crowd/chant potential, loop/replay viability.

Under key "hottest_hook":
{
  "start": "MM:SS.mmm",
  "end": "MM:SS.mmm",
  "transcript": "exact verbatim words heard during that window",
  "section_type": "chorus|drop|refrain|post-chorus|hybrid",
  "confidence": 0.92
}

If no dominant commercial peak exists, set hottest_hook to null.

PART 3 — TRACK METADATA

Using audio analysis (tempo feel, harmonic content, vocal style, energy), estimate under key "metadata":
{
  "title": "Song title if recognisable, else Unknown",
  "artist": "Artist name if recognisable, else Unknown",
  "bpm_estimate": 120,
  "key": "A minor",
  "mood": "hype",
  "genre_hint": "Hip-Hop",
  "confidence": 0.85
}

FINAL OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "adlibs": [...],
  "hottest_hook": {...} or null,
  "metadata": {...}
}`;

  const requestBody = {
    model,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
          { type: "text", text: "Analyze this audio. Return only the JSON with adlibs, hottest_hook, and metadata." },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 3500,
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
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const gwData = await res.json();
  const content = gwData.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("Empty Gemini response");

  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");

  let rawJson = content.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const parsed = JSON.parse(rawJson);

  let hookParsed: GeminiHook | null = null;
  if (parsed.hottest_hook && parsed.hottest_hook.start) {
    const startSec = parseTimestamp(parsed.hottest_hook.start);
    const endSec = parseTimestamp(parsed.hottest_hook.end);
    hookParsed = {
      start_sec: startSec,
      end_sec: endSec > startSec ? endSec : startSec + 10,
      transcript: String(parsed.hottest_hook.transcript || "").trim(),
      section_type: String(parsed.hottest_hook.section_type || "").trim(),
      confidence: Number(parsed.hottest_hook.confidence) || 0,
    };
  }

  const adlibsParsed: GeminiAdlib[] = Array.isArray(parsed.adlibs)
    ? parsed.adlibs.filter((a: any) => a && a.start && a.text)
    : [];

  const meta = parsed.metadata || {};

  return {
    hottest_hook: hookParsed,
    adlibs: adlibsParsed,
    metadata: {
      title: String(meta.title || "Unknown").trim(),
      artist: String(meta.artist || "Unknown").trim(),
      bpm_estimate: Number(meta.bpm_estimate) || undefined,
      key: String(meta.key || "").trim() || undefined,
      mood: String(meta.mood || "").trim() || undefined,
      genre_hint: String(meta.genre_hint || "").trim() || undefined,
      confidence: Math.min(1, Math.max(0, Number(meta.confidence) || 0)) || undefined,
    },
    rawResponseContent: content,
    promptUsed: prompt,
  };
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

// ── Snap adlibs to word boundaries ───────────────────────────────────────────
function extractAdlibsFromWords(lines: LyricLine[], adlibs: GeminiAdlib[], words: WhisperWord[]): LyricLine[] {
  if (adlibs.length === 0 || words.length === 0) return lines;
  const result: LyricLine[] = lines.map(l => ({ ...l }));
  const adlibLines: LyricLine[] = [];

  for (const adlib of adlibs) {
    const adlibStartSec = parseTimestamp(adlib.start);
    const adlibEndSec = parseTimestamp(adlib.end);
    const normAdlibText = normalize(adlib.text);
    const adlibWordTokens = normAdlibText.split(" ").filter(Boolean);
    if (adlibWordTokens.length === 0) continue;

    const windowWords = words.filter(w => w.start >= adlibStartSec - 5 && w.start <= adlibEndSec + 5);
    if (windowWords.length === 0) continue;

    let bestWordIdx = -1, bestScore = 0;
    for (let wi = 0; wi < windowWords.length; wi++) {
      const w = windowWords[wi];
      const normWord = normalize(w.word);
      const firstToken = adlibWordTokens[0];
      const dist = levenshtein(normWord, firstToken);
      const maxLen = Math.max(normWord.length, firstToken.length, 1);
      const textSim = 1 - dist / maxLen;
      const timeDist = Math.abs(w.start - adlibStartSec);
      const timeScore = 1 / (1 + timeDist * 0.5);
      const score = textSim * 0.65 + timeScore * 0.35;
      if (score > bestScore) { bestScore = score; bestWordIdx = wi; }
    }

    if (bestScore < 0.3 || bestWordIdx === -1) continue;

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

    adlibLines.push({
      start: Math.round(startWord.start * 1000) / 1000,
      end: Math.round(endWord.end * 1000) / 1000,
      text: adlib.text,
      tag: "adlib",
    });
  }

  const merged = [...result, ...adlibLines].sort((a, b) => a.start - b.start);
  console.log(`Word-level adlib extraction: ${adlibLines.length} adlibs injected`);
  return merged;
}

// ── Snap hook to word boundaries ──────────────────────────────────────────────
function findHookFromWords(words: WhisperWord[], hook: GeminiHook): { start: number; end: number; score: number; previewText: string } | null {
  if (!hook) return null;
  const { start_sec, end_sec, transcript, confidence } = hook;
  const windowWords = words.filter(w => w.start >= start_sec - 3 && w.end <= end_sec + 3);

  if (windowWords.length === 0) {
    return { start: start_sec, end: end_sec, score: Math.round((confidence || 0.8) * 100), previewText: transcript.slice(0, 80) };
  }

  const hookWords = normalize(transcript).split(" ").filter(Boolean);
  let snapStart = windowWords[0].start;
  let snapEnd = windowWords[windowWords.length - 1].end;

  if (hookWords.length > 0) {
    const firstToken = hookWords[0];
    let bestStartScore = 0, bestStartIdx = 0;
    for (let i = 0; i < windowWords.length; i++) {
      const normWord = normalize(windowWords[i].word);
      const dist = levenshtein(normWord, firstToken);
      const score = 1 - dist / Math.max(normWord.length, firstToken.length, 1);
      if (score > bestStartScore) { bestStartScore = score; bestStartIdx = i; }
    }
    if (bestStartScore >= 0.4) snapStart = windowWords[bestStartIdx].start;

    const lastToken = hookWords[hookWords.length - 1];
    let bestEndScore = 0, bestEndIdx = windowWords.length - 1;
    for (let i = windowWords.length - 1; i >= bestStartIdx; i--) {
      const normWord = normalize(windowWords[i].word);
      const dist = levenshtein(normWord, lastToken);
      const score = 1 - dist / Math.max(normWord.length, lastToken.length, 1);
      if (score > bestEndScore) { bestEndScore = score; bestEndIdx = i; }
    }
    if (bestEndScore >= 0.4 && windowWords[bestEndIdx].end > snapStart) snapEnd = windowWords[bestEndIdx].end;
  }

  const duration = snapEnd - snapStart;
  if (duration > 15) snapEnd = snapStart + 12;
  else if (duration < 4) snapEnd = end_sec;

  return {
    start: Math.round(snapStart * 1000) / 1000,
    end: Math.round(snapEnd * 1000) / 1000,
    score: Math.round((confidence || 0.8) * 100),
    previewText: transcript.slice(0, 80),
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

    // ── Resolve pipeline config ──────────────────────────────────────────────
    // transcriptionModel: "whisper-1" (default) | "gemini"
    const useWhisper = transcriptionModel !== "gemini";

    // analysisModel: a Gemini model string | "disabled"
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
      `Pipeline: transcription=${useWhisper ? "whisper-1" : "gemini-only"}, ` +
      `analysis=${analysisDisabled ? "disabled" : resolvedAnalysisModel}, ` +
      `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`
    );

    // ── Run pipeline stages in parallel ─────────────────────────────────────
    const whisperPromise = useWhisper && OPENAI_API_KEY
      ? runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY)
      : Promise.reject(new Error(useWhisper && !OPENAI_API_KEY ? "OPENAI_API_KEY not set" : "WHISPER_SKIPPED"));

    const geminiPromise = !analysisDisabled
      ? runGeminiAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel)
      : Promise.reject(new Error("ANALYSIS_DISABLED"));

    const [whisperResult, geminiResult] = await Promise.allSettled([whisperPromise, geminiPromise]);

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

    // ── Handle analysis result ───────────────────────────────────────────────
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let lines: LyricLine[] = baseLines;
    let geminiUsed = false;
    let geminiOutput: any = analysisDisabled ? { status: "disabled" } : { status: "not_run" };
    let geminiError: string | null = null;

    if (!analysisDisabled && geminiResult.status === "fulfilled") {
      const g = geminiResult.value;
      geminiUsed = true;
      title = g.metadata.title || "Unknown";
      artist = g.metadata.artist || "Unknown";
      metadata = {
        mood: g.metadata.mood,
        bpm_estimate: g.metadata.bpm_estimate,
        confidence: g.metadata.confidence,
        key: g.metadata.key,
        genre_hint: g.metadata.genre_hint,
      };

      if (useWhisper) {
        // Hybrid: Whisper timing + Gemini semantic tags
        lines = extractAdlibsFromWords(baseLines, g.adlibs, words);
        if (g.hottest_hook) {
          const hookSpan = findHookFromWords(words, g.hottest_hook);
          if (hookSpan) hooks = [{ ...hookSpan, reasonCodes: [] }];
        }
      } else {
        // Gemini-only: use Gemini timestamps directly
        const geminiLines: LyricLine[] = g.adlibs
          .filter(a => a.start && a.text)
          .map(a => ({
            start: parseTimestamp(a.start),
            end: parseTimestamp(a.end),
            text: a.text,
            tag: "adlib" as const,
          }));
        lines = [...baseLines, ...geminiLines].sort((a, b) => a.start - b.start);
        if (g.hottest_hook) {
          hooks = [{
            start: g.hottest_hook.start_sec,
            end: g.hottest_hook.end_sec,
            score: Math.round((g.hottest_hook.confidence || 0.8) * 100),
            previewText: g.hottest_hook.transcript.slice(0, 80),
            reasonCodes: [],
          }];
        }
      }

      geminiOutput = {
        status: "success",
        model: resolvedAnalysisModel,
        rawResponseContent: g.rawResponseContent || "",
        rawResponseLength: (g.rawResponseContent || "").length,
        adlibs: g.adlibs,
        hottest_hook: g.hottest_hook,
        metadata: g.metadata,
        adlibsCount: g.adlibs.length,
      };
    } else if (!analysisDisabled && geminiResult.status === "rejected") {
      const reason = (geminiResult.reason as Error)?.message || "unknown";
      geminiError = reason;
      geminiOutput = { status: "failed", error: reason };
      console.warn("Gemini analysis failed:", reason);
    }

    const adlibCount = lines.filter(l => l.tag === "adlib").length;
    console.log(`Final: ${lines.length} lines (${lines.length - adlibCount} main, ${adlibCount} adlib), ${hooks.length} hooks`);

    return new Response(
      JSON.stringify({
        title,
        artist,
        metadata,
        lines,
        hooks,
        _debug: {
          version: "anchor-align-v6-word",
          pipeline: {
            transcription: useWhisper ? "whisper-1" : "gemini-only",
            analysis: analysisDisabled ? "disabled" : resolvedAnalysisModel,
          },
          geminiUsed,
          geminiError,
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
          adlibLines: adlibCount,
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
