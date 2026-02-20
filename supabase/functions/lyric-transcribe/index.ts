import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ── Gemini: enrichment (adlib ranges, hook, metadata, title/artist) ───────────
async function runGeminiEnrichment(
  audioBase64: string,
  mimeType: string,
  lovableKey: string
): Promise<{
  title: string;
  artist: string;
  metadata: any;
  adlib_ranges: { start: number; end: number }[];
  hooks: any[];
}> {
  const enrichPrompt = `ROLE: You are a Music Structure AI. The audio has already been transcribed by Whisper — you do NOT need to re-transcribe it.

YOUR TASKS:
1. ADLIB DETECTION — Listen for background vocals, hype words, harmonies, shouts that are NOT the lead vocal/rap. Return their time ranges as "adlib_ranges".
2. HOTTEST HOOK — Identify the single most impactful repetitive segment (8–20 seconds). Criteria: melodic peak, highest energy, title repetition.
3. METADATA — Detect title, artist name (if audible), mood, BPM estimate, musical key, genre hint.

STRICT JSON OUTPUT ONLY — no markdown, no preamble:
{
  "title": "Detected Title or Unknown",
  "artist": "Detected Artist or Unknown",
  "metadata": {
    "mood": "string",
    "bpm_estimate": 0,
    "confidence": 0.0,
    "key": "string",
    "genre_hint": "string"
  },
  "adlib_ranges": [
    { "start": 0.0, "end": 0.0 }
  ],
  "hooks": [
    { "start": 0.0, "end": 0.0, "score": 95, "reasonCodes": ["repetition", "melodic-peak"], "previewText": "First words of hook..." }
  ]
}

If there are no adlibs, return "adlib_ranges": [].
Return only ONE hook — the hottest one.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: enrichPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${audioBase64}` },
            },
            {
              type: "text",
              text: "Analyze this audio for adlib ranges, the hottest hook, and metadata. Output only the JSON.",
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
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

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Gemini response");
  return JSON.parse(jsonMatch[0]);
}

// ── Merge: apply Gemini enrichment onto Whisper segments ─────────────────────
function mergeResults(
  whisperSegments: LyricLine[],
  gemini: Awaited<ReturnType<typeof runGeminiEnrichment>>
): LyricLine[] {
  const adlibRanges = (gemini.adlib_ranges || []).map((r: any) => ({
    start: Number(r.start) || 0,
    end: Number(r.end) || 0,
  }));

  return whisperSegments.map((seg) => {
    const mid = (seg.start + seg.end) / 2;
    const isAdlib = adlibRanges.some((r) => mid >= r.start && mid <= r.end);
    return { ...seg, tag: isAdlib ? "adlib" : "main" };
  });
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

    console.log(`Hybrid pipeline: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

    // ── Fire both in parallel ────────────────────────────────────────────────
    const [whisperResult, geminiResult] = await Promise.allSettled([
      runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY),
      runGeminiEnrichment(audioBase64, mimeType, LOVABLE_API_KEY),
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
      metadata = g.metadata ? {
        mood: String(g.metadata.mood || "").trim() || undefined,
        bpm_estimate: Number(g.metadata.bpm_estimate) || undefined,
        confidence: Math.min(1, Math.max(0, Number(g.metadata.confidence) || 0)) || undefined,
        key: String(g.metadata.key || "").trim() || undefined,
        genre_hint: String(g.metadata.genre_hint || "").trim() || undefined,
      } : undefined;
      hooks = (g.hooks || []).map((h: any) => ({
        start: Math.round((Number(h.start) || 0) * 10) / 10,
        end: Math.round((Number(h.end) || 0) * 10) / 10,
        score: Math.min(100, Math.max(0, Number(h.score) || 0)),
        reasonCodes: Array.isArray(h.reasonCodes) ? h.reasonCodes : [],
        previewText: String(h.previewText ?? "").trim(),
      })).filter((h: any) => h.end > h.start);
      lines = mergeResults(whisperSegments, g);
      console.log(`Gemini: ${(g.adlib_ranges || []).length} adlib ranges, ${hooks.length} hooks`);
    } else {
      const reason = geminiResult.reason?.message || "unknown";
      console.warn("Gemini enrichment failed (using Whisper-only):", reason);
      if (reason === "RATE_LIMIT") {
        console.warn("Gemini rate limited — adlibs and hooks will be empty");
      }
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
          model: "whisper-1 + gemini-2.5-flash (hybrid)",
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
