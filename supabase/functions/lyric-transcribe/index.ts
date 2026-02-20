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
  text: string;
  preceding_main_phrase: string;
  ballpark_time: number;
}

interface GeminiHook {
  ballpark_start: number;
  ballpark_end: number;
  start_phrase: string;
  end_phrase: string;
  score: number;
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

// ── Gemini: semantic analysis with ballpark pointers ─────────────────────────
async function runGeminiAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string
): Promise<GeminiAnalysis> {
  const prompt = `You are a professional audio engineer and music producer with 20+ years of experience mixing records. You have an expert ear for separating vocal layers — you can clearly distinguish the lead vocal from adlibs, background harmonies, and hype words added in post-production.

Listen carefully to this audio track and analyze it with the precision of someone who has mixed hundreds of albums.

As an audio engineer, you know:
- ADLIBS are secondary vocal layers laid OVER the lead vocal — they are never the main rap or sung line. They include hype words ("yeah", "uh", "ayy", "woo", "let's go"), background harmonies sitting underneath the lead, call-and-response shouts that answer the lead, producer tags, whispered or mumbled overlays, and anything that was clearly added on top in the mix. If the lead rapper/singer is delivering the main line, everything else happening simultaneously is an adlib. DO NOT label lead vocal lines as adlibs. If you are not confident, leave adlibs as [].
- THE HOTTEST HOOK is the chorus or repeated refrain that a listener would sing along to. It must repeat at least twice, carry the highest melodic or emotional energy in the song, likely contain the song title or central phrase, and span 8–20 seconds of continuous lyrics (1–4 lines).

Your ballpark timestamps are used internally as SEARCH POINTERS only — they don't need to be perfectly precise, just close enough to identify the right region. Provide your best estimate.

Return ONLY valid JSON (no markdown, no explanation):
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
  "hottest_hook": {
    "ballpark_start": 32.5,
    "ballpark_end": 45.0,
    "start_phrase": "First 4-5 words of the hook exactly as sung",
    "end_phrase": "Last 4-5 words of the hook exactly as sung",
    "score": 95
  },
  "adlibs": [
    {
      "text": "exact adlib word or phrase",
      "preceding_main_phrase": "last 4-5 words of the main vocal line just before this adlib",
      "ballpark_time": 12.4
    }
  ]
}

RULES:
- hottest_hook: null if no clear hook found. start_phrase and end_phrase must be verbatim words sung, not a description.
- adlibs: exact words of background layers only. preceding_main_phrase is the lead vocal line immediately before it. Max 25 entries. Use [] if none detected.
- ballpark timestamps are estimates only — they just help locate the region.
- No extra text outside the JSON.`;

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
      max_tokens: 2000,
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
  return {
    title: String(parsed.title || "Unknown"),
    artist: String(parsed.artist || "Unknown"),
    metadata: parsed.metadata || {},
    hottest_hook: parsed.hottest_hook || null,
    adlibs: Array.isArray(parsed.adlibs) ? parsed.adlibs : [],
  };
}

// ── Find best matching segment index near a ballpark time ─────────────────────
function findNearSegment(
  segments: LyricLine[],
  ballparkTime: number,
  windowSec = 15
): number[] {
  // Return indices of segments within ±windowSec of ballpark time
  return segments
    .map((s, i) => ({ i, dist: Math.abs(s.start - ballparkTime) }))
    .filter(({ dist }) => dist <= windowSec)
    .sort((a, b) => a.dist - b.dist)
    .map(({ i }) => i);
}

// ── Anchor & Align: Tag adlibs using preceding_main_phrase ───────────────────
function tagAdlibsAnchored(
  segments: LyricLine[],
  adlibs: GeminiAdlib[]
): LyricLine[] {
  if (adlibs.length === 0) return segments;

  const result = segments.map(s => ({ ...s }));

  for (const adlib of adlibs) {
    const normPreceding = normalize(adlib.preceding_main_phrase);
    const normAdlibText = normalize(adlib.text);
    const ballpark = adlib.ballpark_time;

    // Find the segment whose text best matches the preceding_main_phrase
    // Search in a window around ballpark_time
    const windowIndices = findNearSegment(segments, ballpark, 20);
    // Also search globally as fallback
    const allIndices = segments.map((_, i) => i);
    const searchOrder = [...new Set([...windowIndices, ...allIndices])];

    let bestPrecedingIdx = -1;
    let bestPrecedingScore = 0;

    for (const idx of searchOrder) {
      const normSeg = normalize(segments[idx].text);
      // Use both similarity and word overlap for robustness
      const sim = similarity(normSeg, normPreceding);
      const overlap = wordOverlap(normSeg, normPreceding);
      const score = Math.max(sim, overlap);
      if (score > bestPrecedingScore && score >= 0.4) {
        bestPrecedingScore = score;
        bestPrecedingIdx = idx;
      }
    }

    if (bestPrecedingIdx === -1) {
      // Fallback: just use word overlap on adlib text directly
      for (const idx of searchOrder) {
        const normSeg = normalize(segments[idx].text);
        const overlap = wordOverlap(normSeg, normAdlibText);
        if (overlap >= 0.6) {
          result[idx].tag = "adlib";
        }
      }
      continue;
    }

    // Now look at segments immediately after the preceding line for the adlib
    // Check the next 1-3 segments for the adlib text
    for (let offset = 1; offset <= 3; offset++) {
      const checkIdx = bestPrecedingIdx + offset;
      if (checkIdx >= segments.length) break;
      const normSeg = normalize(segments[checkIdx].text);
      const sim = similarity(normSeg, normAdlibText);
      const overlap = wordOverlap(normSeg, normAdlibText);
      if (Math.max(sim, overlap) >= 0.5) {
        result[checkIdx].tag = "adlib";
        console.log(`Adlib tagged: "${segments[checkIdx].text}" (after "${segments[bestPrecedingIdx].text}")`);
        break;
      }
    }
  }

  return result;
}

// ── Anchor & Align: Find hook span using start/end phrases near ballpark ──────
function findHookAnchored(
  segments: LyricLine[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string } | null {
  if (!hook) return null;

  const normStartPhrase = normalize(hook.start_phrase);
  const normEndPhrase = normalize(hook.end_phrase);

  // Find the best matching start segment near ballpark_start
  const startCandidates = findNearSegment(segments, hook.ballpark_start, 20);
  const allIndices = segments.map((_, i) => i);
  const startSearchOrder = [...new Set([...startCandidates, ...allIndices])];

  let bestStartIdx = -1;
  let bestStartScore = 0;

  for (const idx of startSearchOrder) {
    const normSeg = normalize(segments[idx].text);
    const sim = similarity(normSeg, normStartPhrase);
    const overlap = wordOverlap(normSeg, normStartPhrase);
    const score = Math.max(sim, overlap);
    if (score > bestStartScore && score >= 0.35) {
      bestStartScore = score;
      bestStartIdx = idx;
    }
  }

  if (bestStartIdx === -1) {
    console.warn("Hook start phrase not matched in Whisper segments");
    return null;
  }

  // Find the best matching end segment after the start, near ballpark_end
  const endCandidates = findNearSegment(segments, hook.ballpark_end, 20);
  const endSearchOrder = [...new Set([...endCandidates, ...allIndices])];

  let bestEndIdx = bestStartIdx; // default to same segment
  let bestEndScore = 0;

  for (const idx of endSearchOrder) {
    if (idx < bestStartIdx) continue; // end must be after start
    const normSeg = normalize(segments[idx].text);
    const sim = similarity(normSeg, normEndPhrase);
    const overlap = wordOverlap(normSeg, normEndPhrase);
    const score = Math.max(sim, overlap);
    if (score > bestEndScore && score >= 0.35) {
      bestEndScore = score;
      bestEndIdx = idx;
    }
  }

  const startSeg = segments[bestStartIdx];
  const endSeg = segments[bestEndIdx];

  console.log(`Hook anchored: segments ${bestStartIdx}–${bestEndIdx} (${startSeg.start}s–${endSeg.end}s), startScore=${bestStartScore.toFixed(2)}, endScore=${bestEndScore.toFixed(2)}`);

  return {
    start: startSeg.start,
    end: endSeg.end,
    score: hook.score,
    previewText: segments.slice(bestStartIdx, bestEndIdx + 1).map(s => s.text).join(" ").slice(0, 80),
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

    console.log(`Anchor & Align v3: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

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

      console.log(`Gemini: ${g.adlibs.length} adlibs, hook=${g.hottest_hook ? `"${g.hottest_hook.start_phrase.slice(0, 30)}..."` : "none"}`);

      // Anchor & Align: tag adlibs using preceding_main_phrase + Levenshtein
      lines = tagAdlibsAnchored(whisperSegments, g.adlibs);

      // Anchor & Align: find hook using start/end phrases near ballpark
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
          model: "whisper-1 + gemini-2.5-flash (anchor-align v3)",
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
