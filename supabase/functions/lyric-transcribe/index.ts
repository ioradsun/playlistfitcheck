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
  isFloating?: boolean;
  isOrphaned?: boolean;
  geminiConflict?: string;
  confidence?: number;
  isCorrection?: boolean;
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

// ── Gemini Prompt: Hook + Insights + Metadata ─────────────────────────────────
const GEMINI_HOOK_PROMPT = `ROLE: Lead Music Intelligence Analyst

TASK: Identify structural identity and production metadata.

1. THE 10.000s HOOK ANCHOR
- Identify the single primary 10-second segment representing the track's "Hottest Hook."
- Evaluation criteria: production lift, lead vocal intensity, melodic memorability, emotional peak, and repetition.
- Scan the FULL track. Do not default to the first chorus.
- Output ONLY start_sec as a decimal in seconds with 3-decimal precision (e.g., 78.450).
- The 10s duration is a system invariant — do NOT output an end time.
- Confidence floor: Only return hottest_hook if confidence >= 0.75. If below, omit the field entirely.

2. PRODUCTION INSIGHTS
- bpm: Estimated beats per minute as an integer. Confidence floor: 0.85 — return null if below.
- key: Musical key (e.g., "F#m", "Bb", "C major"). Confidence floor: 0.85 — return null if below.
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic"). Confidence floor: 0.85 — return null if below.
- Each field must have its own confidence score (0.0–1.0). If confidence for a field is < 0.85, set the value to null.

3. TRACK METADATA
- title: If audible from lyrics or context; otherwise "Unknown".
- artist: If known; otherwise "Unknown".
- genre_hint: Best-guess genre (e.g., "hip-hop", "r&b", "pop").

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "confidence": 0.00 },
  "metadata": {
    "title": "Unknown",
    "artist": "Unknown",
    "genre_hint": ""
  },
  "insights": {
    "bpm": { "value": 88, "confidence": 0.00 },
    "key": { "value": "F#m", "confidence": 0.00 },
    "mood": { "value": "hype", "confidence": 0.00 }
  }
}`;

// ── v5.7: Universal Acoustic Orchestrator Prompt (Universal Hierarchy) ────────
function buildOrchestratorPrompt(
  whisperWords: WhisperWord[],
  whisperSegments: Array<{ start: number; end: number; text: string }>,
  whisperRawText: string,
  trackEnd: number
): string {
  const wordsJson = JSON.stringify(whisperWords.slice(0, 500));
  const segmentsJson = JSON.stringify(whisperSegments.slice(0, 80));

  const anchorWord = whisperWords.length > 0 ? whisperWords[0] : null;
  const anchorTs = anchorWord?.start.toFixed(3) ?? "0.000";
  const anchorW = anchorWord?.word ?? "unknown";
  // Second Whisper word gives a second calibration reference for cadence verification
  const anchorWord2 = whisperWords.length > 1 ? whisperWords[1] : null;
  const anchorTs2 = anchorWord2?.start.toFixed(3) ?? "0.000";
  const anchorW2 = anchorWord2?.word ?? "unknown";

  return `ROLE: Universal Acoustic Orchestrator (v5.7 Universal Hierarchy)

You are simultaneously hearing the raw audio AND receiving the Whisper timing grid. Your mission is to produce a perfect, production-ready merged_lines array.

=== WHISPER TIMING GRID ===
WHISPER_RAW_TEXT: ${whisperRawText.slice(0, 2000)}

WHISPER_WORDS (word-level timing skeleton):
${wordsJson}

WHISPER_SEGMENTS (sentence-level boundaries):
${segmentsJson}

TRACK_END: ${trackEnd.toFixed(3)}s

=== PATH 1: HIERARCHICAL LEAD DETECTION (Execute This First) ===
You must classify every vocal event based on its role in the mix — not by whether Whisper captured it.

THE LEAD SIGNAL RULE:
  - If a vocal is the PRIMARY or ONLY signal playing in a given time block, tag it as tag: "main".
  - This applies to Intro dialogue, spoken word, and any restored signal that has no concurrent lead vocal.
  - A vocal does not need to be in WHISPER_SEGMENTS to be tag: "main". If it is the dominant voice, it is main.

THE BACKGROUND SIGNAL RULE:
  - tag: "adlib" is reserved for echoes, background harmonies, textures, and simultaneous SECONDARY vocals.
  - "Adlib" means: a distinct, concurrent vocal that exists ALONGSIDE a main signal at the same timestamp.
  - If there is no overlapping main line, the signal is main by default.

FLOATING STATUS:
  - Any line you restore that was NOT in the original WHISPER_SEGMENTS must be marked isFloating: true.
  - This tells the UI the line is AI-restored rather than Whisper-confirmed.

=== PATH 2: ABSOLUTE TEMPORAL CALIBRATION ===
Synchronize the intro/outro timeline by calculating backward from the first Whisper anchor.

TEMPORAL NORTH STAR: "${anchorW}" at ${anchorTs}s (Whisper master clock — immovable).
SECONDARY REFERENCE:  "${anchorW2}" at ${anchorTs2}s (cadence verification).

THE SILENCE GUARD:
  - DO NOT assume intro dialogue starts at 0.000s.
  - Detect the exact millisecond the FIRST spoken word in the file begins.

THE BACKWARD CALCULATION:
  1. LISTEN: Detect the acoustic onset of "${anchorW}" in the raw audio. Call this T_acoustic_anchor.
  2. DETECT: For each intro phrase, detect its acoustic onset. Call each T_acoustic_i.
  3. MEASURE: relative_gap_i = T_acoustic_anchor − T_acoustic_i
  4. PROJECT: t_final_i = ${anchorTs} − relative_gap_i

PRECISION MANDATE:
  - Use 3-decimal precision (e.g., 3.082s). NEVER rounded numbers (e.g., 3.0s, 5.0s).
  - Evenly-spaced timestamps (e.g., 0.0, 2.14, 4.28) = linear estimation = hallucination. Reject them.

VALIDATION: Detect "${anchorW2}" acoustically. Apply backward formula. Result must match ${anchorTs2}s ± 0.050s.

CONTINUITY RULE: The final Intro chip's end timestamp MUST be ≤ ${anchorTs}s.

SCOPE: Backward calculation applies ONLY to isFloating/isOrphaned lines. Main lyric lines ALWAYS use WHISPER_SEGMENTS timestamps verbatim.

=== PATH 3: SURGICAL CONFLICT RESOLUTION & GHOST PRUNING ===

CONFLICT RESOLUTION:
  - Audit every main lyric segment in WHISPER_SEGMENTS against the raw audio.
  - If Whisper is wrong (e.g., "whore" → "boy", "range" → "rain"), replace only the incorrect word.
  - Keep Whisper's EXACT start/end timestamps. Never move them.
  - isCorrection: true.
  - geminiConflict = ONLY the single word that was replaced (e.g., "range"). NOT the corrected word. NOT the sentence. One word only.
  - qaCorrections += 1 per swap.

GHOST KILLER:
  - A Ghost is a background vocal whose text is identical to a concurrent main line (±500ms), same voice layer.
  - Physically delete Ghosts. Do not include them under any tag.
  - ghostsRemoved += 1 per deletion.

DENSITY PRESERVATION — Outro/Bridge Overlap:
  - NEVER flatten concurrent voices into one line.
  - If multiple distinct voices overlap, output EACH as a separate entry — use tag: "main" for the lead, tag: "adlib" for backgrounds.
  - Outro echoes that are distinct from the lead get tag: "adlib", isFloating: true.

=== OUTPUT RULES ===
- COMPLETE merged_lines: every WHISPER_SEGMENTS main line (corrected if needed) + all restored floating lines + all legitimate adlibs.
- Maximum 80 total lines.
- ALL timestamps: numeric seconds, 3-decimal precision. NEVER MM:SS format.
- Hard boundary: discard any line with start > ${Math.min(189.3, trackEnd + 1.0).toFixed(3)}s.
- Sort ascending by start.
- qaCorrections = exact swaps in Path 3.
- ghostsRemoved = exact deletions in Path 3.
- JSON ROBUSTNESS: Every array element except the last MUST have a trailing comma. Final element must NOT.

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "merged_lines": [
    {
      "start": 0.000,
      "end": 0.000,
      "text": "...",
      "tag": "main",
      "isOrphaned": false,
      "isFloating": false,
      "isCorrection": false,
      "geminiConflict": null,
      "confidence": 0.98
    }
  ],
  "qaCorrections": 0,
  "ghostsRemoved": 0
}`;
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

// ── Robust JSON parser with truncation recovery ───────────────────────────────
function extractJsonFromContent(content: string, fallbackKey = "merged_lines"): any {
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");
  let rawJson = content.slice(jsonStart, jsonEnd + 1);
  rawJson = rawJson
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  function safeParseJson(s: string): any {
    try {
      return JSON.parse(s);
    } catch (_e1) {
      let fixed = s.replace(/,\s*$/, "").trim();
      try {
        return JSON.parse(fixed);
      } catch (_e2) {
        const lastComplete = fixed.lastIndexOf("}");
        if (lastComplete !== -1) {
          fixed = fixed.slice(0, lastComplete + 1);
          const openBracket = fixed.lastIndexOf("[");
          const closeBracket = fixed.lastIndexOf("]");
          if (openBracket > closeBracket) fixed += "]";
          let depth = 0;
          for (const ch of fixed) { if (ch === "{") depth++; else if (ch === "}") depth--; }
          if (depth > 0) fixed += "}".repeat(depth);
          try {
            const recovered = JSON.parse(fixed);
            console.warn(`[safeParseJson] Recovered truncated JSON — partial data restored`);
            return recovered;
          } catch (_e3) {
            console.warn(`[safeParseJson] JSON unrecoverable — returning empty`);
            return { [fallbackKey]: [] };
          }
        }
        return { [fallbackKey]: [] };
      }
    }
  }

  return safeParseJson(rawJson);
}

// ── Gemini Call 1: Hook + Insights + Metadata ─────────────────────────────────
async function runGeminiHookAnalysis(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model = "google/gemini-3-flash-preview"
): Promise<{ hook: GeminiHook | null; insights?: GeminiInsights; metadata: any; rawContent: string }> {
  const content = await callGemini(GEMINI_HOOK_PROMPT, audioBase64, mimeType, lovableKey, model, 1200, "hook");
  const parsed = extractJsonFromContent(content, "hottest_hook");

  let hook: GeminiHook | null = null;
  if (parsed.hottest_hook && typeof parsed.hottest_hook.start_sec === "number") {
    const conf = Number(parsed.hottest_hook.confidence) || 0;
    if (conf >= 0.75) {
      hook = { start_sec: Math.round(parsed.hottest_hook.start_sec * 1000) / 1000, confidence: conf };
    } else {
      console.log(`[hook] Hook confidence ${conf.toFixed(2)} < 0.75 — omitted`);
    }
  }

  const ins = parsed.insights || {};
  const meta = parsed.metadata || {};

  return {
    hook,
    insights: {
      bpm: ins.bpm ? { value: Number(ins.bpm.value), confidence: Number(ins.bpm.confidence) } : undefined,
      key: ins.key ? { value: String(ins.key.value), confidence: Number(ins.key.confidence) } : undefined,
      mood: ins.mood ? { value: String(ins.mood.value), confidence: Number(ins.mood.confidence) } : undefined,
    },
    metadata: {
      title: String(meta.title || "Unknown").trim(),
      artist: String(meta.artist || "Unknown").trim(),
      bpm_estimate: ins.bpm?.value ? Number(ins.bpm.value) : undefined,
      key: ins.key?.value ? String(ins.key.value) : undefined,
      mood: ins.mood?.value ? String(ins.mood.value) : undefined,
      genre_hint: String(meta.genre_hint || "").trim() || undefined,
      confidence: ins.mood?.confidence ?? ins.bpm?.confidence ?? undefined,
    },
    rawContent: content,
  };
}

// ── v5.0 Gemini Call 2: Universal Acoustic Orchestrator ───────────────────────
async function runGeminiOrchestrator(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  whisperWords: WhisperWord[],
  whisperSegments: Array<{ start: number; end: number; text: string }>,
  whisperRawText: string,
  trackEnd: number
): Promise<{ lines: LyricLine[]; qaCorrections: number; ghostsRemoved: number; rawContent: string }> {
  const prompt = buildOrchestratorPrompt(whisperWords, whisperSegments, whisperRawText, trackEnd);

  console.log(`[orchestrator] v5.7 sending ${whisperWords.length} words, ${whisperSegments.length} segments to Gemini (hierarchy anchor: "${whisperWords[0]?.word ?? "none"}" @ ${whisperWords[0]?.start.toFixed(3) ?? "0"}s, secondary: "${whisperWords[1]?.word ?? "none"}" @ ${whisperWords[1]?.start.toFixed(3) ?? "0"}s)`);

  const content = await callGemini(prompt, audioBase64, mimeType, lovableKey, model, 6000, "orchestrator");
  const parsed = extractJsonFromContent(content, "merged_lines");

  const HARD_MAX_BOUNDARY = Math.min(189.3, trackEnd + 1.0);

  const rawLines: LyricLine[] = Array.isArray(parsed.merged_lines)
    ? parsed.merged_lines
        .filter((l: any) => l && typeof l.start === "number" && typeof l.end === "number" && l.text)
        .map((l: any): LyricLine => ({
          start: Math.round(Number(l.start) * 1000) / 1000,
          end: Math.round(Number(l.end) * 1000) / 1000,
          text: String(l.text).trim(),
          tag: l.tag === "adlib" ? "adlib" : "main",
          isOrphaned: Boolean(l.isOrphaned),
          isFloating: Boolean(l.isFloating),
          isCorrection: Boolean(l.isCorrection),
          geminiConflict: l.geminiConflict ? String(l.geminiConflict) : undefined,
          confidence: l.confidence != null ? Math.min(1, Math.max(0, Number(l.confidence))) : undefined,
        }))
        .filter((l: LyricLine) => l.end > l.start && l.start <= HARD_MAX_BOUNDARY && l.text.length > 0)
    : [];

  // Sort by start time
  rawLines.sort((a, b) => a.start - b.start);

  const qaCorrections = typeof parsed.qaCorrections === "number" ? parsed.qaCorrections : rawLines.filter(l => l.isCorrection).length;
  const ghostsRemoved = typeof parsed.ghostsRemoved === "number" ? parsed.ghostsRemoved : 0;

  console.log(`[orchestrator] v5.5 result: ${rawLines.length} lines (${rawLines.filter(l => l.tag === "main").length} main, ${rawLines.filter(l => l.tag === "adlib").length} adlib, ${rawLines.filter(l => l.isOrphaned).length} orphaned, ${qaCorrections} qa-corrections, ${ghostsRemoved} ghosts-removed)`);

  return { lines: rawLines, qaCorrections, ghostsRemoved, rawContent: content };
}

// ── Hook finder: snap to Whisper word boundary ────────────────────────────────
function findHookFromWords(
  words: WhisperWord[],
  hook: GeminiHook
): { start: number; end: number; score: number; previewText: string; status: "confirmed" | "candidate" } | null {
  if (!hook) return null;

  const HOOK_DURATION = 10.000;
  const { start_sec, confidence = 0 } = hook;

  const trackEnd = words.length > 0 ? words[words.length - 1].end : Infinity;

  if (start_sec > trackEnd || start_sec > trackEnd - HOOK_DURATION) {
    console.log(`[hook] Discarding hook @ ${start_sec.toFixed(3)}s — in last 10s or beyond track end (${trackEnd.toFixed(3)}s). Falling back to repetition anchor.`);
    return findRepetitionAnchor(words, trackEnd, HOOK_DURATION);
  }

  if (confidence < 0.75) {
    return {
      start: start_sec,
      end: Math.round((start_sec + HOOK_DURATION) * 1000) / 1000,
      score: Math.round(confidence * 100),
      previewText: "",
      status: "candidate",
    };
  }

  const windowWords = words.filter(w => w.start >= start_sec - 2 && w.start <= start_sec + 3);
  let snapStart = start_sec;

  if (windowWords.length > 0) {
    let bestDist = Infinity;
    for (const w of windowWords) {
      const dist = Math.abs(w.start - start_sec);
      if (dist < bestDist) { bestDist = dist; snapStart = w.start; }
    }
  }

  const hookWords = words.filter(w => w.start >= snapStart && w.end <= snapStart + HOOK_DURATION + 0.5);
  const previewText = hookWords.map(w => w.word).join(" ").slice(0, 100);
  const snapEnd = Math.round((snapStart + HOOK_DURATION) * 1000) / 1000;

  return {
    start: Math.round(snapStart * 1000) / 1000,
    end: snapEnd,
    score: Math.round(confidence * 100),
    previewText,
    status: "confirmed",
  };
}

function findRepetitionAnchor(
  words: WhisperWord[],
  trackEnd: number,
  hookDuration: number
): { start: number; end: number; score: number; previewText: string; status: "confirmed" | "candidate" } | null {
  if (words.length === 0) return null;

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }

  const STEP = 2.0;
  let bestStart = words[0].start;
  let bestScore = 0;

  for (let t = words[0].start; t <= trackEnd - hookDuration; t += STEP) {
    const windowWords = words.filter(w => w.start >= t && w.start <= t + hookDuration);
    if (windowWords.length < 3) continue;
    const texts = windowWords.map(w => normalize(w.word));
    const freq: Record<string, number> = {};
    for (const tok of texts) { freq[tok] = (freq[tok] || 0) + 1; }
    const repetitions = Object.values(freq).filter(c => c > 1).reduce((s, c) => s + c, 0);
    const density = repetitions / windowWords.length;
    if (density > bestScore) { bestScore = density; bestStart = t; }
  }

  const hookWords = words.filter(w => w.start >= bestStart && w.end <= bestStart + hookDuration + 0.5);
  const previewText = hookWords.map(w => w.word).join(" ").slice(0, 100);

  console.log(`[hook] Repetition anchor selected @ ${bestStart.toFixed(3)}s (density=${bestScore.toFixed(2)})`);
  return {
    start: Math.round(bestStart * 1000) / 1000,
    end: Math.round((bestStart + hookDuration) * 1000) / 1000,
    score: Math.round(bestScore * 100),
    previewText,
    status: "candidate",
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

    const useWhisper = transcriptionModel !== "gemini";

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
      `[v5.5] Pipeline: transcription=${useWhisper ? "whisper-1" : "gemini-only"}, ` +
      `analysis=${analysisDisabled ? "disabled" : resolvedAnalysisModel} (Universal Acoustic Orchestrator v5.5 Temporal Resonance), ` +
      `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`
    );

    // ── Stage 1: Whisper + Hook in parallel ──────────────────────────────────
    const whisperPromise = useWhisper && OPENAI_API_KEY
      ? runWhisper(audioBase64, ext, mimeType, OPENAI_API_KEY)
      : Promise.reject(new Error(useWhisper && !OPENAI_API_KEY ? "OPENAI_API_KEY not set" : "WHISPER_SKIPPED"));

    const hookPromise = !analysisDisabled
      ? runGeminiHookAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel)
      : Promise.reject(new Error("ANALYSIS_DISABLED"));

    const [whisperResult, hookResult] = await Promise.allSettled([whisperPromise, hookPromise]);

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

    const trackEnd = words.length > 0 ? words[words.length - 1].end : 300;

    // ── Stage 2: Gemini Orchestrator (audio + Whisper JSON) ──────────────────
    let lines: LyricLine[] = [];
    let qaCorrections = 0;
    let ghostsRemoved = 0;
    let orchestratorRawContent = "";
    let orchestratorError: string | null = null;

    if (!analysisDisabled && useWhisper && whisperResult.status === "fulfilled") {
      try {
        const orchResult = await runGeminiOrchestrator(
          audioBase64,
          mimeType,
          LOVABLE_API_KEY,
          resolvedAnalysisModel,
          words,
          segments,
          rawText,
          trackEnd
        );
        lines = orchResult.lines;
        qaCorrections = orchResult.qaCorrections;
        ghostsRemoved = orchResult.ghostsRemoved;
        orchestratorRawContent = orchResult.rawContent;
      } catch (orchErr) {
        orchestratorError = (orchErr as Error)?.message || "Orchestrator failed";
        console.error("[orchestrator] Failed:", orchestratorError);
        // Fallback: build plain lines from Whisper segments only
        lines = segments.map(seg => ({
          start: Math.round(seg.start * 1000) / 1000,
          end: Math.round(seg.end * 1000) / 1000,
          text: seg.text,
          tag: "main" as const,
        }));
      }
    } else if (!analysisDisabled && !useWhisper) {
      // Gemini-only mode: no Whisper, orchestrator not applicable
      lines = [];
    } else if (analysisDisabled && useWhisper && whisperResult.status === "fulfilled") {
      // Analysis disabled: plain Whisper segments
      lines = segments.map(seg => ({
        start: Math.round(seg.start * 1000) / 1000,
        end: Math.round(seg.end * 1000) / 1000,
        text: seg.text,
        tag: "main" as const,
      }));
    }

    // ── Handle hook result ───────────────────────────────────────────────────
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let geminiUsed = false;
    let geminiError: string | null = orchestratorError;

    const hookSuccess = !analysisDisabled && hookResult.status === "fulfilled";

    if (hookSuccess) {
      const h = hookResult.value;
      geminiUsed = true;
      title = h.metadata.title || "Unknown";
      artist = h.metadata.artist || "Unknown";
      metadata = {
        mood: h.insights?.mood?.value || h.metadata.mood,
        bpm_estimate: h.insights?.bpm?.value || h.metadata.bpm_estimate,
        confidence: h.insights?.mood?.confidence ?? h.metadata.confidence,
        key: h.insights?.key?.value || h.metadata.key,
        genre_hint: h.metadata.genre_hint,
        bpm_confidence: h.insights?.bpm?.confidence,
        key_confidence: h.insights?.key?.confidence,
        mood_confidence: h.insights?.mood?.confidence,
      };

      const resolvedHook: GeminiHook | null = h.hook;
      if (resolvedHook && useWhisper) {
        const hookSpan = findHookFromWords(words, resolvedHook);
        if (hookSpan) hooks = [{ ...hookSpan, reasonCodes: [] }];
      } else if (resolvedHook) {
        const HOOK_DURATION = 10.000;
        hooks = [{
          start: resolvedHook.start_sec,
          end: Math.round((resolvedHook.start_sec + HOOK_DURATION) * 1000) / 1000,
          score: Math.round((resolvedHook.confidence || 0.75) * 100),
          previewText: "",
          reasonCodes: [],
          status: "confirmed",
        }];
      }
    } else if (!analysisDisabled && hookResult.status === "rejected") {
      const reason = (hookResult.reason as Error)?.message || "unknown";
      geminiError = `hook: ${reason}${orchestratorError ? `; orchestrator: ${orchestratorError}` : ""}`;
      console.warn("Gemini hook analysis failed:", reason);
    }

    const adlibCount = lines.filter(l => l.tag === "adlib").length;
    const floatingCount = lines.filter(l => l.isFloating).length;
    const orphanedCount = lines.filter(l => l.isOrphaned).length;
    const correctionCount = qaCorrections;

    console.log(`[v5.5] Final: ${lines.length} lines (${lines.length - adlibCount} main, ${adlibCount} adlib, ${floatingCount} floating, ${orphanedCount} orphaned, ${correctionCount} qa-corrections, ${ghostsRemoved} ghosts-removed), ${hooks.length} hooks`);

    const whisperOutput = useWhisper && whisperResult.status === "fulfilled" ? {
      wordCount: words.length,
      segmentCount: segments.length,
      rawText: rawText.slice(0, 1000),
      words: words.slice(0, 80),
      segments: segments.slice(0, 30),
    } : { status: useWhisper ? "failed" : "skipped" };

    return new Response(
      JSON.stringify({
        title,
        artist,
        metadata,
        lines,
        hooks,
        _debug: {
          version: "anchor-align-v5.7-universal-hierarchy",
          pipeline: {
            transcription: useWhisper ? "whisper-1" : "gemini-only",
            analysis: analysisDisabled ? "disabled" : resolvedAnalysisModel,
            orchestrator: "v5.5-universal-acoustic-orchestrator-temporal-resonance",
          },
          geminiUsed,
          geminiError,
          orchestratorError,
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
          adlibLines: adlibCount,
          floatingAdlibs: floatingCount,
          orphanedLines: orphanedCount,
          qaCorrections: correctionCount,
          ghostsRemoved,
          mainLines: lines.length - adlibCount,
          hooksFound: hooks.length,
          whisper: {
            input: { model: useWhisper ? "whisper-1" : "skipped", format: ext, mimeType, estimatedMB: Math.round(estimatedBytes / 1024 / 1024 * 10) / 10 },
            output: whisperOutput,
          },
          gemini: {
            input: { model: analysisDisabled ? "disabled" : resolvedAnalysisModel, mimeType },
            output: {
              hook: {
                status: hookSuccess ? "success" : "failed",
                rawLength: hookSuccess ? hookResult.value.rawContent.length : 0,
              },
              orchestrator: {
                status: orchestratorError ? "failed" : "success",
                rawLength: orchestratorRawContent.length,
                linesReturned: lines.length,
              },
            },
          },
          merged: { totalLines: lines.length, mainLines: lines.length - adlibCount, adlibLines: adlibCount, qaCorrections: correctionCount, ghostsRemoved, hooks, title, artist, metadata, allLines: lines },
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
