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

interface GeminiAdlib {
  start: string;       // "MM:SS.mmm" or "HH:MM:SS.mmm"
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
}

// ── Levenshtein distance for fuzzy matching ───────────────────────────────────
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

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ── Text normalizer ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(" ").filter(Boolean));
  const wordsB = new Set(b.split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.min(wordsA.size, wordsB.size);
}

// ── Whisper: accurate timestamps ──────────────────────────────────────────────
async function runWhisper(
  audioBase64: string,
  ext: string,
  mimeType: string,
  apiKey: string
): Promise<{ segments: LyricLine[]; rawText: string }> {
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
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
  const segments: LyricLine[] = (data.segments || [])
    .map((seg: any) => ({
      start: Math.round((Number(seg.start) || 0) * 10) / 10,
      end: Math.round((Number(seg.end) || 0) * 10) / 10,
      text: String(seg.text ?? "").trim(),
      tag: "main" as const,
    }))
    .filter((l: LyricLine) => l.text.length > 0 && l.end > l.start);

  return { segments, rawText: data.text || "" };
}

// ── Parse "MM:SS.mmm" or "HH:MM:SS.mmm" → seconds ───────────────────────────
function parseTimestamp(ts: string): number {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  return parseFloat(ts) || 0;
}

// ── GPT: transcript-based adlib + hook + metadata ────────────────────────────
async function runGeminiAnalysis(
  _audioBase64: string,
  _mimeType: string,
  lovableKey: string,
  whisperTranscript: string,
  whisperSegmentsJson: string
): Promise<GeminiAnalysis> {
  const prompt = `You are a professional music analysis engine specializing in SRT/closed caption generation and commercial A&R analysis.

You will receive a time-stamped transcript from a song (produced by Whisper speech recognition). Analyze it to identify adlibs, the hottest hook, and track metadata.

TRANSCRIPT SEGMENTS (JSON array with start/end seconds and text):
${whisperSegmentsJson}

FULL TEXT:
${whisperTranscript}

PART 1 — ADLIB + FILLER DETECTION

Definitions:
- PRIMARY = Main lyrical vocal line carrying meaning in that moment.
- ADLIB = Short supporting phrase: background layer, echo, hype callout, interjection, filler (uh, yeah, ayy, mm, huh, etc.)

Look for: very short segments, repeated fillers, interjections that aren't part of the main lyric flow.

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
- Use the segment timestamps from the provided data for start/end
- Max 30 entries, confidence required for every event
- Omit instead of hallucinating

PART 2 — HOTTEST HOOK IDENTIFICATION (A&R STANDARD)

The hottest hook = single strongest continuous ~10-second segment with highest commercial and replay potential.

Score based on: lyrical memorability, repetition, emotional peak, chant potential, loop/replay viability.

Under key "hottest_hook":
{
  "start": "MM:SS.mmm",
  "end": "MM:SS.mmm",
  "transcript": "exact verbatim words during that window",
  "section_type": "chorus|drop|refrain|post-chorus|hybrid",
  "confidence": 0.92
}

If no dominant commercial peak exists, set hottest_hook to null.

PART 3 — TRACK METADATA

Based on lyrical content and style, estimate under key "metadata":
{
  "title": "Song title if recognisable, else Unknown",
  "artist": "Artist name if recognisable, else Unknown",
  "bpm_estimate": null,
  "key": null,
  "mood": "hype",
  "genre_hint": "Hip-Hop",
  "confidence": 0.75
}

FINAL OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "adlibs": [...],
  "hottest_hook": {...} or null,
  "metadata": {...}
}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: "Analyze the transcript above. Return only the JSON with adlibs, hottest_hook, and metadata.",
        },
      ],
      temperature: 0.1,
      max_tokens: 3500,
    }),
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

  console.log(`Gemini response length: ${content.length} chars`);

  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");

  let rawJson = content.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const parsed = JSON.parse(rawJson);

  // Parse hottest_hook
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
  };
}

// ── Find segments near a target time ─────────────────────────────────────────
function findNearSegment(segments: LyricLine[], targetTime: number, windowSec = 15): number[] {
  return segments
    .map((s, i) => ({ i, dist: Math.abs(s.start - targetTime) }))
    .filter(({ dist }) => dist <= windowSec)
    .sort((a, b) => a.dist - b.dist)
    .map(({ i }) => i);
}

// ── Tag adlibs: snap Gemini timestamps to Whisper segments ────────────────────
function tagAdlibsAnchored(segments: LyricLine[], adlibs: GeminiAdlib[]): LyricLine[] {
  if (adlibs.length === 0) return segments;
  const result = segments.map(s => ({ ...s }));

  for (const adlib of adlibs) {
    const adlibStartSec = parseTimestamp(adlib.start);
    const normAdlibText = normalize(adlib.text);

    let bestIdx = -1;
    let bestScore = 0;

    // Strategy 1: time overlap ± 1.5s
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (adlibStartSec < seg.start - 1.5 || adlibStartSec > seg.end + 1.5) continue;
      const timeDist = Math.abs(seg.start - adlibStartSec);
      const normSeg = normalize(seg.text);
      const adlibWords = normAdlibText.split(" ").filter(Boolean);
      const segWords = normSeg.split(" ").filter(Boolean);
      const contained = adlibWords.length > 0 &&
        adlibWords.every(w => segWords.some(sw => levenshtein(sw, w) <= 1));
      const textScore = contained ? 0.9 : Math.max(similarity(normSeg, normAdlibText), wordOverlap(normSeg, normAdlibText));
      const score = textScore * 0.6 + (1 / (1 + timeDist)) * 0.4;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    // Strategy 2: fallback ± 20s window text match
    if (bestIdx === -1) {
      for (const idx of findNearSegment(segments, adlibStartSec, 20)) {
        const normSeg = normalize(segments[idx].text);
        const adlibWords = normAdlibText.split(" ").filter(Boolean);
        const segWords = normSeg.split(" ").filter(Boolean);
        const contained = adlibWords.length > 0 &&
          adlibWords.every(w => segWords.some(sw => levenshtein(sw, w) <= 1));
        const score = contained ? 0.9 : Math.max(similarity(normSeg, normAdlibText), wordOverlap(normSeg, normAdlibText));
        if (score > bestScore && score >= 0.4) { bestScore = score; bestIdx = idx; }
      }
    }

    if (bestIdx !== -1) {
      result[bestIdx].tag = "adlib";
      console.log(`Adlib tagged: seg[${bestIdx}] "${segments[bestIdx].text.slice(0, 40)}" | gemini="${adlib.text}" @${adlibStartSec.toFixed(1)}s score=${bestScore.toFixed(2)}`);
    } else {
      console.log(`Adlib not matched: "${adlib.text}" @${adlibStartSec.toFixed(1)}s`);
    }
  }
  return result;
}

// ── Snap hook to Whisper timestamps ──────────────────────────────────────────
function findHookAnchored(
  segments: LyricLine[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string } | null {
  if (!hook || !hook.transcript) return null;
  const { start_sec, end_sec, transcript } = hook;

  const hookSegments = segments.filter(s => s.start < end_sec + 2 && s.end > start_sec - 2);

  if (hookSegments.length === 0) {
    console.warn(`Hook: no Whisper segments in window ${start_sec}–${end_sec}s, using Gemini times`);
    return { start: start_sec, end: end_sec, score: Math.round((hook.confidence || 0.8) * 100), previewText: transcript.slice(0, 80) };
  }

  const snapStart = hookSegments.reduce((best, s) =>
    Math.abs(s.start - start_sec) < Math.abs(best.start - start_sec) ? s : best);
  const snapEnd = hookSegments.reduce((best, s) =>
    Math.abs(s.end - end_sec) < Math.abs(best.end - end_sec) ? s : best);

  let actualStart = snapStart.start;
  let actualEnd = snapEnd.end;
  const duration = actualEnd - actualStart;

  if (duration > 15) {
    console.warn(`Hook duration ${duration.toFixed(1)}s > 15s, clamping to 12s`);
    actualEnd = actualStart + 12;
  } else if (duration < 4) {
    actualEnd = end_sec;
  }

  console.log(`Hook snapped: ${actualStart.toFixed(1)}s–${actualEnd.toFixed(1)}s (${(actualEnd - actualStart).toFixed(1)}s), conf=${hook.confidence}`);
  return { start: actualStart, end: actualEnd, score: Math.round((hook.confidence || 0.8) * 100), previewText: transcript.slice(0, 80) };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const { audioBase64, format } = await req.json();
    if (!audioBase64) throw new Error("No audio data provided");

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

    console.log(`Anchor & Align v4: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

    // Run Whisper first, then feed transcript to GPT for semantic analysis
    const whisperResult = await runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY).then(r => ({ status: "fulfilled" as const, value: r })).catch(e => ({ status: "rejected" as const, reason: e }));

    if (whisperResult.status === "rejected") {
      const err = whisperResult.reason?.message || "Whisper failed";
      console.error("Whisper failed:", err);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { segments: rawSegmentsEarly, rawText: rawTextEarly } = whisperResult.value;
    const whisperSegmentsEarly = rawSegmentsEarly.map((seg, i) => {
      if (i < rawSegmentsEarly.length - 1 && seg.end > rawSegmentsEarly[i + 1].start) {
        return { ...seg, end: Math.round((rawSegmentsEarly[i + 1].start - 0.1) * 10) / 10 };
      }
      return seg;
    });

    const segmentsJson = JSON.stringify(whisperSegmentsEarly.map(s => ({ start: s.start, end: s.end, text: s.text })));
    const [, geminiResult] = await Promise.allSettled([
      Promise.resolve(whisperResult),
      runGeminiAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, rawTextEarly, segmentsJson),
    ]);

    if (whisperResult.status === "rejected") {
      const err = whisperResult.reason?.message || "Whisper failed";
      console.error("Whisper failed:", err);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { segments: rawSegments, rawText } = whisperResult.value;
    const whisperSegments = rawSegments.map((seg, i) => {
      if (i < rawSegments.length - 1 && seg.end > rawSegments[i + 1].start) {
        return { ...seg, end: Math.round((rawSegments[i + 1].start - 0.1) * 10) / 10 };
      }
      return seg;
    });

    console.log(`Whisper: ${whisperSegments.length} segments`);

    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let lines: LyricLine[] = whisperSegments;
    let geminiUsed = false;

    if (geminiResult.status === "fulfilled") {
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

      console.log(`Gemini: ${g.adlibs.length} adlibs, hook=${g.hottest_hook ? `${g.hottest_hook.start_sec.toFixed(1)}–${g.hottest_hook.end_sec.toFixed(1)}s` : "none"}, bpm=${metadata.bpm_estimate}, key=${metadata.key}`);

      lines = tagAdlibsAnchored(whisperSegments, g.adlibs);

      if (g.hottest_hook) {
        const hookSpan = findHookAnchored(whisperSegments, g.hottest_hook);
        if (hookSpan) hooks = [{ ...hookSpan, reasonCodes: [] }];
      }
    } else {
      const reason = geminiResult.reason?.message || "unknown";
      console.warn("Gemini analysis failed (Whisper-only):", reason);
    }

    const adlibCount = lines.filter(l => l.tag === "adlib").length;
    console.log(`Final: ${lines.length} lines (${lines.length - adlibCount} main, ${adlibCount} adlib), ${hooks.length} hooks, gemini=${geminiUsed}`);

    return new Response(
      JSON.stringify({
        title,
        artist,
        metadata,
        lines,
        hooks,
        _debug: {
          model: "whisper-1 + gemini-3-flash-preview (anchor-align v4)",
          geminiUsed,
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
          whisperSegments: whisperSegments.length,
          rawText: rawText.slice(0, 500),
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
