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

// Adlib from Gemini strict JSON array
interface GeminiAdlib {
  start: string;       // "00:12.400" or "00:00:12.400"
  end: string;
  text: string;
  tag: string;         // "ADLIB"
  layer?: string;
  confidence?: number;
}

interface GeminiHook {
  start_sec: number;
  end_sec: number;
  transcript: string;   // verbatim words Gemini heard
  section_type?: string;
  confidence?: number;
}

interface GeminiAnalysis {
  hottest_hook: GeminiHook | null;
  adlibs: GeminiAdlib[];
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

// Similarity [0..1] — 1 = perfect match
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

// Word-overlap [0..1]
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

// ── Parse "MM:SS.mmm" or "HH:MM:SS.mmm" timestamp strings → seconds ──────────
function parseTimestamp(ts: string): number {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 2) {
    // MM:SS.mmm
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    // HH:MM:SS.mmm
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(ts) || 0;
}

// ── Gemini: audio-first adlib detection + 10-second hottest hook ──────────────
async function runGeminiAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string
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

OUTPUT — TIME-ALIGNED ADLIB EVENTS (STRICT JSON):

Return only a valid JSON array under the key "adlibs":
{
  "adlibs": [
    {
      "start": "MM:SS.mmm",
      "end": "MM:SS.mmm",
      "text": "yeah",
      "tag": "ADLIB",
      "layer": "background|echo|callout|texture",
      "confidence": 0.85
    }
  ]
}

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

Under the key "hottest_hook", return:
{
  "hottest_hook": {
    "start": "MM:SS.mmm",
    "end": "MM:SS.mmm",
    "transcript": "exact verbatim words heard during that window",
    "section_type": "chorus|drop|refrain|post-chorus|hybrid",
    "confidence": 0.92
  }
}

If no dominant 10-second commercial peak exists, set hottest_hook to null.

FINAL OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "adlibs": [...],
  "hottest_hook": {...} or null
}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${audioBase64}` },
            },
            {
              type: "text",
              text: "Analyze this audio. Return only the JSON with adlibs array and hottest_hook.",
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 3000,
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

  // Extract JSON from response
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

  return {
    hottest_hook: hookParsed,
    adlibs: adlibsParsed,
  };
}

// ── Find best matching segment index near a given time ────────────────────────
function findNearSegment(
  segments: LyricLine[],
  targetTime: number,
  windowSec = 15
): number[] {
  return segments
    .map((s, i) => ({ i, dist: Math.abs(s.start - targetTime) }))
    .filter(({ dist }) => dist <= windowSec)
    .sort((a, b) => a.dist - b.dist)
    .map(({ i }) => i);
}

// ── Tag adlibs: Gemini gives us precise timestamps, snap to nearest Whisper segment ──
function tagAdlibsAnchored(
  segments: LyricLine[],
  adlibs: GeminiAdlib[]
): LyricLine[] {
  if (adlibs.length === 0) return segments;

  const result = segments.map(s => ({ ...s }));

  for (const adlib of adlibs) {
    const adlibStartSec = parseTimestamp(adlib.start);
    const normAdlibText = normalize(adlib.text);

    // Strategy 1: find segment whose time window overlaps Gemini's adlib timestamp
    // A Whisper segment "contains" the adlib if adlibStartSec falls within [seg.start, seg.end]
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const timeOverlap = adlibStartSec >= seg.start - 1.5 && adlibStartSec <= seg.end + 1.5;
      if (!timeOverlap) continue;

      // Score by time proximity + text match
      const timeDist = Math.abs(seg.start - adlibStartSec);
      const normSeg = normalize(seg.text);
      const adlibWords = normAdlibText.split(" ").filter(Boolean);
      const segWords = normSeg.split(" ").filter(Boolean);
      const contained = adlibWords.length > 0 &&
        adlibWords.every(w => segWords.some(sw => levenshtein(sw, w) <= 1));
      const textScore = contained ? 0.9 : Math.max(
        similarity(normSeg, normAdlibText),
        wordOverlap(normSeg, normAdlibText)
      );
      const timeScore = 1 / (1 + timeDist);
      const score = textScore * 0.6 + timeScore * 0.4;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // Strategy 2: if no time overlap, find closest segment with text match in ±20s window
    if (bestIdx === -1) {
      const windowIndices = findNearSegment(segments, adlibStartSec, 20);
      for (const idx of windowIndices) {
        const normSeg = normalize(segments[idx].text);
        const adlibWords = normAdlibText.split(" ").filter(Boolean);
        const segWords = normSeg.split(" ").filter(Boolean);
        const contained = adlibWords.length > 0 &&
          adlibWords.every(w => segWords.some(sw => levenshtein(sw, w) <= 1));
        const score = contained ? 0.9 : Math.max(
          similarity(normSeg, normAdlibText),
          wordOverlap(normSeg, normAdlibText)
        );
        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestIdx = idx;
        }
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

// ── Build hook from Gemini's transcript snapped to Whisper timestamps ─────────
function findHookAnchored(
  segments: LyricLine[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string } | null {
  if (!hook || !hook.transcript) return null;

  const { start_sec, end_sec, transcript } = hook;

  // Use Gemini's timestamps directly as the primary source (they're now explicit)
  // Find the Whisper segments that overlap the hook window [start_sec, end_sec]
  const hookSegments = segments.filter(s =>
    s.start < end_sec + 2 && s.end > start_sec - 2
  );

  if (hookSegments.length === 0) {
    // No Whisper segments overlap — use Gemini times directly
    console.warn(`Hook: no Whisper segments in window ${start_sec}–${end_sec}s, using Gemini times`);
    return {
      start: start_sec,
      end: end_sec,
      score: Math.round((hook.confidence || 0.8) * 100),
      previewText: transcript.slice(0, 80),
    };
  }

  // Snap start to the Whisper segment closest to start_sec
  const snapStart = hookSegments.reduce((best, s) =>
    Math.abs(s.start - start_sec) < Math.abs(best.start - start_sec) ? s : best
  );

  // Snap end: the last Whisper segment that ends before end_sec + 3s tolerance
  const snapEnd = hookSegments.reduce((best, s) =>
    Math.abs(s.end - end_sec) < Math.abs(best.end - end_sec) ? s : best
  );

  let actualStart = snapStart.start;
  let actualEnd = snapEnd.end;

  // Duration guard: 6–15s
  const duration = actualEnd - actualStart;
  if (duration > 15) {
    console.warn(`Hook duration ${duration.toFixed(1)}s > 15s, clamping to 12s from start`);
    actualEnd = actualStart + 12;
  } else if (duration < 4) {
    // Too short — extend to end_sec
    actualEnd = end_sec;
  }

  console.log(`Hook snapped: ${actualStart.toFixed(1)}s–${actualEnd.toFixed(1)}s (${(actualEnd - actualStart).toFixed(1)}s), conf=${hook.confidence}`);

  return {
    start: actualStart,
    end: actualEnd,
    score: Math.round((hook.confidence || 0.8) * 100),
    previewText: transcript.slice(0, 80),
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // ── Fire both in parallel ────────────────────────────────────────────────
    const [whisperResult, geminiResult] = await Promise.allSettled([
      runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY),
      runGeminiAnalysis(audioBase64, mimeType, LOVABLE_API_KEY),
    ]);

    // Whisper is required
    if (whisperResult.status === "rejected") {
      const err = whisperResult.reason?.message || "Whisper failed";
      console.error("Whisper failed:", err);
      return new Response(
        JSON.stringify({ error: `Transcription failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { segments: rawSegments, rawText } = whisperResult.value;

    // Fix overlapping segments
    const whisperSegments = rawSegments.map((seg, i) => {
      if (i < rawSegments.length - 1 && seg.end > rawSegments[i + 1].start) {
        return { ...seg, end: Math.round((rawSegments[i + 1].start - 0.1) * 10) / 10 };
      }
      return seg;
    });

    console.log(`Whisper: ${whisperSegments.length} segments`);

    let hooks: any[] = [];
    let lines: LyricLine[] = whisperSegments;
    let geminiUsed = false;

    if (geminiResult.status === "fulfilled") {
      const g = geminiResult.value;
      geminiUsed = true;

      console.log(`Gemini: ${g.adlibs.length} adlibs, hook=${g.hottest_hook ? `${g.hottest_hook.start_sec.toFixed(1)}–${g.hottest_hook.end_sec.toFixed(1)}s` : "none"}`);

      // Anchor adlibs: snap Gemini timestamps to Whisper segments
      lines = tagAdlibsAnchored(whisperSegments, g.adlibs);

      // Anchor hook
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
        lines,
        hooks,
        _debug: {
          model: "whisper-1 + gemini-2.5-flash (anchor-align v4)",
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
