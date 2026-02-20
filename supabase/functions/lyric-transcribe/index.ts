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

interface GeminiAnalysis {
  title: string;
  artist: string;
  metadata: {
    mood?: string;
    bpm_estimate?: number;
    confidence?: number;
    key?: string;
    genre_hint?: string;
  };
  adlib_phrases: string[];   // exact/near-exact words Gemini heard as adlibs
  hook_text: string;         // verbatim lyric text of the hottest hook segment
  hook_score: number;
  hook_reason_codes: string[];
}

// ── Text normalizer for fuzzy matching ───────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")   // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Word-overlap similarity [0..1] between two normalized strings
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

// ── Gemini: text-based analysis (no timestamps!) ──────────────────────────────
async function runGeminiAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string
): Promise<GeminiAnalysis> {
  const prompt = `You are a Music Analysis AI. Listen carefully to this audio track.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "title": "Song title or Unknown",
  "artist": "Artist name or Unknown",
  "metadata": {
    "mood": "one word mood",
    "bpm_estimate": 120,
    "confidence": 0.85,
    "key": "A minor",
    "genre_hint": "Hip-Hop"
  },
  "adlib_phrases": ["exact adlib words you hear", "another adlib phrase"],
  "hook_text": "The exact verbatim lyrics of the single most repeated/impactful hook or chorus",
  "hook_score": 90,
  "hook_reason_codes": ["repetition", "melodic-peak"]
}

RULES:
- adlib_phrases: List the EXACT words/phrases you hear as background vocals, hype words, harmonies, ad-libs (not lead vocal). Max 20 short phrases. If none, use [].
- hook_text: Copy the actual lyrics word-for-word from the most memorable chorus or hook (the part that repeats most). This should be 1-4 lines of lyrics verbatim.
- Do NOT include timestamps anywhere. Text only.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
              text: "Analyze this audio. Return only the JSON.",
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
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

  // Extract JSON
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");

  let rawJson = content.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const parsed = JSON.parse(rawJson);
  return {
    title: String(parsed.title || "Unknown"),
    artist: String(parsed.artist || "Unknown"),
    metadata: parsed.metadata || {},
    adlib_phrases: Array.isArray(parsed.adlib_phrases) ? parsed.adlib_phrases.map(String) : [],
    hook_text: String(parsed.hook_text || ""),
    hook_score: Number(parsed.hook_score) || 80,
    hook_reason_codes: Array.isArray(parsed.hook_reason_codes) ? parsed.hook_reason_codes : [],
  };
}

// ── Tag adlibs by word-matching Gemini phrases against Whisper segments ───────
function tagAdlibsByText(
  whisperSegments: LyricLine[],
  adlibPhrases: string[]
): LyricLine[] {
  if (adlibPhrases.length === 0) return whisperSegments;

  const normalizedPhrases = adlibPhrases.map(normalize).filter(Boolean);

  return whisperSegments.map((seg) => {
    const normSeg = normalize(seg.text);
    // A segment is adlib if it has >60% word overlap with any adlib phrase
    const isAdlib = normalizedPhrases.some((phrase) => wordOverlap(normSeg, phrase) >= 0.6);
    return { ...seg, tag: isAdlib ? "adlib" : "main" };
  });
}

// ── Find hook span in Whisper segments by text matching ───────────────────────
function findHookSpan(
  whisperSegments: LyricLine[],
  hookText: string,
  hookScore: number,
  hookReasonCodes: string[]
): { start: number; end: number; score: number; reasonCodes: string[]; previewText: string } | null {
  if (!hookText || whisperSegments.length === 0) return null;

  const normHook = normalize(hookText);
  const hookWords = normHook.split(" ").filter(Boolean);
  if (hookWords.length === 0) return null;

  // Find the window of Whisper segments whose combined text best matches hook_text
  // Try windows of 1..8 segments
  let bestScore = 0;
  let bestStart = -1;
  let bestEnd = -1;

  for (let i = 0; i < whisperSegments.length; i++) {
    let accumulated = "";
    for (let j = i; j < Math.min(i + 10, whisperSegments.length); j++) {
      accumulated += " " + normalize(whisperSegments[j].text);
      const score = wordOverlap(accumulated.trim(), normHook);
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
        bestEnd = j;
      }
    }
  }

  // Require at least 40% match to call it the hook
  if (bestScore < 0.4 || bestStart === -1) return null;

  const startSeg = whisperSegments[bestStart];
  const endSeg = whisperSegments[bestEnd];

  console.log(`Hook matched: segments ${bestStart}–${bestEnd}, overlap=${bestScore.toFixed(2)}, time=${startSeg.start}–${endSeg.end}`);

  return {
    start: startSeg.start,
    end: endSeg.end,
    score: hookScore,
    reasonCodes: hookReasonCodes,
    previewText: whisperSegments.slice(bestStart, bestEnd + 1).map(s => s.text).join(" ").slice(0, 80),
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

    console.log(`Hybrid pipeline v2 (text-match): ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

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

    // Fix overlaps in Whisper segments
    const whisperSegments = rawSegments.map((seg, i) => {
      if (i < rawSegments.length - 1 && seg.end > rawSegments[i + 1].start) {
        return { ...seg, end: Math.round((rawSegments[i + 1].start - 0.1) * 10) / 10 };
      }
      return seg;
    });

    console.log(`Whisper: ${whisperSegments.length} segments`);

    // Gemini enrichment is best-effort
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let lines: LyricLine[] = whisperSegments;
    let geminiUsed = false;

    if (geminiResult.status === "fulfilled") {
      const g = geminiResult.value;
      geminiUsed = true;
      title = g.title || "Unknown";
      artist = g.artist || "Unknown";

      metadata = {
        mood: String(g.metadata.mood || "").trim() || undefined,
        bpm_estimate: Number(g.metadata.bpm_estimate) || undefined,
        confidence: Math.min(1, Math.max(0, Number(g.metadata.confidence) || 0)) || undefined,
        key: String(g.metadata.key || "").trim() || undefined,
        genre_hint: String(g.metadata.genre_hint || "").trim() || undefined,
      };

      console.log(`Gemini: ${g.adlib_phrases.length} adlib phrases, hook="${g.hook_text.slice(0, 60)}"`);

      // Tag adlibs by word-matching (no timestamps from Gemini)
      lines = tagAdlibsByText(whisperSegments, g.adlib_phrases);

      // Find hook span using text matching against Whisper
      const hookSpan = findHookSpan(whisperSegments, g.hook_text, g.hook_score, g.hook_reason_codes);
      if (hookSpan) hooks = [hookSpan];

    } else {
      const reason = geminiResult.reason?.message || "unknown";
      console.warn("Gemini analysis failed (using Whisper-only):", reason);
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
          model: "whisper-1 + gemini-2.5-flash (text-match v2)",
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
