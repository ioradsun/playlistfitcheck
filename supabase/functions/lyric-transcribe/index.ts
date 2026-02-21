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
  duration: number;
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

  const duration = typeof data.duration === "number" ? Math.round(data.duration * 1000) / 1000 : 0;
  console.log(`[whisper] duration field: ${duration}s`);

  return { words, segments, rawText: data.text || "", duration };
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

// ── v9.0 Triptych: Three specialized prompt builders ─────────────────────────

function buildIntroPrompt(anchorWord: string, anchorTs: number): string {
  return `ROLE: Literal Spoken Transcriber (v9.4 Triptych — Lane B)

AUDIO CONTEXT: You are receiving the first ~${Math.ceil(anchorTs + 2)} seconds of the track as a byte-sliced clip.

YOUR MISSION:
1. LITERAL ONLY: Transcribe ONLY what is actually spoken or muttered. If you hear humming, write "[humming]". Do NOT invent dialogue. Do NOT add creative lyrics or generic song phrases.
2. BOUNDARY: The anchor word "${anchorWord}" occurs at exactly ${anchorTs.toFixed(3)}s. You MUST project backward from this anchor. The first human vocal sound is approximately 3-4 seconds into the track — NOT at 0.000s.
3. SILENCE RULE: Any audio before the first vocal onset is instrumental/silence. No dialogue line may start before 1.0s. If you detect onset later than 5.0s, trust your ears.
4. THE ANCHOR: Your LAST line must end at or very near ${anchorTs.toFixed(3)}s. The last word must be "${anchorWord}".
5. PHRASE DENSITY: Max 6 words per line.
6. TAGGING: All intro dialogue = tag "main". Background vocals = tag "adlib".
7. SCHEMA: Every object MUST include ALL keys: start, end, text, tag, isCorrection (false), isFloating (false), confidence (1.0), geminiConflict (null).
8. NO INVENTION: If you are unsure of a word, set confidence to 0.7. Never add words that aren't in the audio.

EXPECTED OUTPUT: 3-8 lines of literal spoken dialogue before the anchor.

OUTPUT — return ONLY valid JSON, no markdown:
{"intro_lines": [{"start": 3.842, "end": 5.210, "text": "example", "tag": "main", "isCorrection": false, "isFloating": false, "confidence": 1.0, "geminiConflict": null}]}`;
}

function buildOutroPrompt(middleCutoff: number, trackEnd: number): string {
  return `ROLE: Outro Recovery Specialist (v9.0 Triptych — Lane C)

TASK: Transcribe ALL vocal events from ${middleCutoff.toFixed(3)}s to the end of the track at ${trackEnd.toFixed(3)}s.

RULES:
1. COMPLETE COVERAGE: You must capture every vocal sound (singing, speaking, ad-libs, echoes, fading vocals) from ${middleCutoff.toFixed(3)}s to ${trackEnd.toFixed(3)}s.
2. TAGGING: Tag all lines as "adlib" since these are outro/tail vocals.
3. PHRASE DENSITY: Outro lines can be longer (8-12 words OK) since these are typically fading/repeating sections.
4. LAST LINE: The end time of your last line must be within 2.0s of ${trackEnd.toFixed(3)}s.
5. SCHEMA: Every object MUST include ALL keys: start, end, text, tag, isCorrection (false), isFloating (false), confidence (1.0), geminiConflict (null).
6. TIMESTAMPS: All timestamps must have 3-decimal precision.
7. EXPECTED OUTPUT: 5-15 lines covering the outro section.

OUTPUT — return ONLY valid JSON, no markdown:
{"outro_lines": [{"start": 181.500, "end": 183.200, "text": "example outro", "tag": "adlib", "isCorrection": false, "isFloating": false, "confidence": 1.0, "geminiConflict": null}]}`;
}

function buildAuditorPrompt(rawText: string, anchorTs: number, middleCutoff: number): string {
  return `ROLE: Word-Level Phonetic Auditor (v9.4 Triptych — Lane D)

TASK: Find phonetic errors in the Whisper text between ${anchorTs.toFixed(3)}s and ${middleCutoff.toFixed(3)}s.

WHISPER TEXT:
${rawText.slice(0, 3000)}

GUARDRAILS:
1. ANCHOR: Do NOT audit anything before ${anchorTs.toFixed(3)}s.
2. SINGLE-WORD ONLY: Your corrections map MUST use single words as keys. Never use phrases.
   INCORRECT: {"I'm a whore": "I'm a boy"}
   CORRECT: {"whore": "boy"}
3. IDIOM GUARD: Do NOT correct common English idioms or phrases (e.g., "pay them no mind", "sit back").
4. CONTRACTION GUARD: Do NOT suggest corrections for words that are parts of contractions (can, don, won, ain, etc.). Unless the ENTIRE contraction is wrong, skip it.
5. HIGH CONFIDENCE ONLY: Only return a swap if you are 95% certain Whisper is acoustically wrong. If unsure, return an empty map.
6. SURGICAL: Only correct actual phonetic/word-sound mismatches (e.g., "whore" should be "boy"). Do NOT correct grammar, punctuation, or stylistic choices.
7. NO TIMESTAMPS: Return ONLY the corrections map.

OUTPUT — return ONLY valid JSON, no markdown:
{"corrections": {}, "count": 0}`;
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

// ── v9.0 Audio byte-slicer: extract time range from base64 audio ──────────────
function sliceAudioBase64(audioBase64: string, totalDuration: number, startSec: number, endSec: number): string {
  // Decode base64 to bytes
  const binaryStr = atob(audioBase64);
  const totalBytes = binaryStr.length;
  const bytesPerSecond = totalBytes / totalDuration;

  // Calculate byte offsets with 1s padding
  const startByte = Math.floor(Math.max(0, startSec - 1.0) * bytesPerSecond);
  const endByte = Math.ceil(Math.min(totalDuration, endSec + 1.0) * bytesPerSecond);

  // Slice and re-encode
  const sliced = binaryStr.slice(startByte, endByte);
  const slicedB64 = btoa(sliced);

  const originalMB = (totalBytes / 1024 / 1024).toFixed(2);
  const slicedMB = (sliced.length / 1024 / 1024).toFixed(2);
  console.log(`[slicer] ${startSec.toFixed(1)}s-${endSec.toFixed(1)}s: ${originalMB}MB → ${slicedMB}MB (${Math.round((1 - sliced.length / totalBytes) * 100)}% reduction)`);

  return slicedB64;
}

// ── v9.0 Triptych Lane B: Intro Patch ─────────────────────────────────────────
async function runGeminiIntro(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  anchorWord: string,
  anchorTs: number
): Promise<{ lines: LyricLine[]; rawContent: string }> {
  const prompt = buildIntroPrompt(anchorWord, anchorTs);
  console.log(`[triptych-intro] Lane B: anchor="${anchorWord}" @ ${anchorTs.toFixed(3)}s`);

  const content = await callGemini(prompt, audioBase64, mimeType, lovableKey, model, 800, "intro");
  const parsed = extractJsonFromContent(content, "intro_lines");

  const lines: LyricLine[] = Array.isArray(parsed.intro_lines)
    ? parsed.intro_lines
        .filter((l: any) => l && typeof l.start === "number" && typeof l.end === "number" && l.text)
        .map((l: any): LyricLine => ({
          start: Math.round(Number(l.start) * 1000) / 1000,
          end: Math.round(Number(l.end) * 1000) / 1000,
          text: String(l.text).trim(),
          tag: l.tag === "adlib" ? "adlib" : "main",
          isFloating: false,
          isOrphaned: false,
          isCorrection: false,
          confidence: l.confidence != null ? Math.min(1, Math.max(0, Number(l.confidence))) : 1.0,
        }))
        .filter((l: LyricLine) => l.end > l.start && l.start > 0.5 && l.text.length > 0)
    : [];

  // Validate: first line must not start at 0.000
  if (lines.length > 0 && lines[0].start < 0.5) {
    console.warn(`[triptych-intro] First line starts at ${lines[0].start}s — suspiciously early, discarding`);
    lines.shift();
  }

  console.log(`[triptych-intro] Lane B result: ${lines.length} intro lines`);
  return { lines, rawContent: content };
}

// ── v9.0 Triptych Lane C: Outro Patch ─────────────────────────────────────────
async function runGeminiOutro(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  middleCutoff: number,
  trackEnd: number
): Promise<{ lines: LyricLine[]; rawContent: string }> {
  const prompt = buildOutroPrompt(middleCutoff, trackEnd);
  console.log(`[triptych-outro] Lane C: ${middleCutoff.toFixed(3)}s to ${trackEnd.toFixed(3)}s`);

  const content = await callGemini(prompt, audioBase64, mimeType, lovableKey, model, 800, "outro");
  const parsed = extractJsonFromContent(content, "outro_lines");

  const HARD_MAX = Math.min(trackEnd + 2.0, 350);

  const lines: LyricLine[] = Array.isArray(parsed.outro_lines)
    ? parsed.outro_lines
        .filter((l: any) => l && typeof l.start === "number" && typeof l.end === "number" && l.text)
        .map((l: any): LyricLine => ({
          start: Math.round(Number(l.start) * 1000) / 1000,
          end: Math.round(Number(l.end) * 1000) / 1000,
          text: String(l.text).trim(),
          tag: "adlib",
          isFloating: false,
          isOrphaned: false,
          isCorrection: false,
          confidence: l.confidence != null ? Math.min(1, Math.max(0, Number(l.confidence))) : 1.0,
        }))
        .filter((l: LyricLine) => l.end > l.start && l.start >= middleCutoff - 1.0 && l.start <= HARD_MAX && l.text.length > 0)
    : [];

  console.log(`[triptych-outro] Lane C result: ${lines.length} outro lines`);
  return { lines, rawContent: content };
}

// ── v9.0 Triptych Lane D: Phonetic Auditor ────────────────────────────────────
async function runGeminiAuditor(
  audioBase64: string,
  mimeType: string,
  lovableKey: string,
  model: string,
  rawText: string,
  anchorTs: number,
  middleCutoff: number
): Promise<{ corrections: Record<string, string>; rawContent: string }> {
  const prompt = buildAuditorPrompt(rawText, anchorTs, middleCutoff);
  console.log(`[triptych-auditor] Lane D: ${anchorTs.toFixed(3)}s to ${middleCutoff.toFixed(3)}s, text length=${rawText.length}`);

  const content = await callGemini(prompt, audioBase64, mimeType, lovableKey, model, 400, "auditor");
  const parsed = extractJsonFromContent(content, "corrections");

  const corrections: Record<string, string> = {};
  if (parsed.corrections && typeof parsed.corrections === "object") {
    for (const [wrong, right] of Object.entries(parsed.corrections)) {
      if (typeof right === "string" && wrong.length > 0 && right.length > 0) {
        corrections[wrong] = right;
      }
    }
  }

  console.log(`[triptych-auditor] Lane D result: ${Object.keys(corrections).length} corrections — ${JSON.stringify(corrections)}`);
  return { corrections, rawContent: content };
}

// ── v9.0 Phrase splitter: break Whisper segments into 6-word max phrases ──────
function splitSegmentIntoPhrases(
  segment: { start: number; end: number; text: string },
  words: WhisperWord[],
  maxWords = 6
): LyricLine[] {
  // Find words that fall within this segment's time range
  const segWords = words.filter(w => w.start >= segment.start - 0.1 && w.end <= segment.end + 0.1);

  if (segWords.length === 0) {
    // No word-level data — use the segment as-is
    return [{
      start: Math.round(segment.start * 1000) / 1000,
      end: Math.round(segment.end * 1000) / 1000,
      text: segment.text.trim(),
      tag: "main",
      isFloating: false,
      isOrphaned: false,
      isCorrection: false,
      confidence: 1.0,
    }];
  }

  const phrases: LyricLine[] = [];
  for (let i = 0; i < segWords.length; i += maxWords) {
    const chunk = segWords.slice(i, i + maxWords);
    if (chunk.length === 0) continue;

    phrases.push({
      start: Math.round(chunk[0].start * 1000) / 1000,
      end: Math.round(chunk[chunk.length - 1].end * 1000) / 1000,
      text: chunk.map(w => w.word).join(" ").trim(),
      tag: "main",
      isFloating: false,
      isOrphaned: false,
      isCorrection: false,
      confidence: 1.0,
    });
  }

  return phrases;
}

// ── v9.0 Stitcher: combine intro + corrected middle + outro (Byte-Sliced) ────
function stitchTriptych(
  introLinesInput: LyricLine[],
  outroLinesInput: LyricLine[],
  corrections: Record<string, string>,
  whisperSegments: Array<{ start: number; end: number; text: string }>,
  whisperWords: WhisperWord[],
  anchorTs: number,
  middleCutoff: number,
  trackEnd: number
): { lines: LyricLine[]; qaCorrections: number } {
  let introLines = [...introLinesInput];
  let outroLines = [...outroLinesInput];
  // 1. Process middle section from Whisper segments
  const middleSegments = whisperSegments.filter(
    seg => seg.start >= anchorTs - 0.1 && seg.end <= middleCutoff + 0.1
  );

  let qaCorrections = 0;
  const middleLines: LyricLine[] = [];

  for (const seg of middleSegments) {
    // Split into phrases first
    const phrases = splitSegmentIntoPhrases(seg, whisperWords);

    // Apply corrections map with contraction-safe regex (v9.2 Production Master)
    for (const phrase of phrases) {
      let text = phrase.text;
      let isCorrection = false;
      let geminiConflict: string | undefined;

      for (const [wrong, right] of Object.entries(corrections)) {
        // Skip multi-word corrections (Lane D should return single words only)
        if (wrong.includes(" ")) {
          console.warn(`[stitcher] Skipping multi-word correction: "${wrong}" → "${right}"`);
          continue;
        }

        const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Pre-filter: skip if the wrong word only exists as part of a contraction
        const contractionCheck = new RegExp(`\\b${escaped}[''\u2019]`, "i");
        const standaloneCheck = new RegExp(`\\b${escaped}\\b`, "i");
        if (contractionCheck.test(text) && !new RegExp(`(?<![\\w''\u2019])${escaped}(?![''\u2019\\w])`, "i").test(text)) {
          continue;
        }

        // Word-boundary regex (punctuation-agnostic)
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        if (regex.test(text)) {
          text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), right);
          isCorrection = true;
          geminiConflict = wrong;
          qaCorrections++;
        }
      }

      middleLines.push({
        ...phrase,
        text,
        isCorrection,
        geminiConflict,
      });
    }
  }

  // 2. Boundary Guard: remove intro lines that overlap with or duplicate the anchor
  if (introLines.length > 0 && middleLines.length > 0) {
    const firstMiddleStart = middleLines[0].start;
    const beforeDedup = introLines.length;
    // Intro lines must END strictly before the first middle line starts
    const dedupedIntro = introLines.filter(l => l.end < anchorTs);
    if (dedupedIntro.length < beforeDedup) {
      console.log(`[stitcher] Boundary guard: removed ${beforeDedup - dedupedIntro.length} overlapping intro lines at ${firstMiddleStart.toFixed(3)}s`);
    }
    introLines = dedupedIntro;
  }

  // 3. Boundary Guard: remove outro lines that overlap with the last middle line
  if (outroLines.length > 0 && middleLines.length > 0) {
    const lastMiddleEnd = middleLines[middleLines.length - 1].end;
    const beforeDedup = outroLines.length;
    const dedupedOutro = outroLines.filter(l => l.start >= lastMiddleEnd - 0.05);
    if (dedupedOutro.length < beforeDedup) {
      console.log(`[stitcher] Boundary guard: removed ${beforeDedup - dedupedOutro.length} overlapping outro lines at ${lastMiddleEnd.toFixed(3)}s`);
    }
    outroLines = dedupedOutro;
  }

  // 4. Combine all three sections
  const allLines = [...introLines, ...middleLines, ...outroLines];

  // 5. Sort by start time
  allLines.sort((a, b) => a.start - b.start);

  // 4. Validate coverage
  const firstStart = allLines.length > 0 ? allLines[0].start : 0;
  const lastEnd = allLines.length > 0 ? allLines[allLines.length - 1].end : 0;
  const coverageGap = trackEnd - lastEnd;

  console.log(`[stitcher] v9.0 stitched: ${allLines.length} total lines (${introLines.length} intro + ${middleLines.length} middle + ${outroLines.length} outro)`);
  console.log(`[stitcher] Coverage: ${firstStart.toFixed(3)}s to ${lastEnd.toFixed(3)}s (trackEnd=${trackEnd.toFixed(3)}s, gap=${coverageGap.toFixed(3)}s)`);

  if (coverageGap > 2.0) {
    console.warn(`[stitcher] WARNING: coverage gap of ${coverageGap.toFixed(3)}s at end of track`);
  }

  return { lines: allLines, qaCorrections };
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
      `[v9.0] Pipeline: transcription=${useWhisper ? "whisper-1" : "gemini-only"}, ` +
      `analysis=${analysisDisabled ? "disabled" : resolvedAnalysisModel} (Triptych Literal-Intro v9.2), ` +
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
      const whisperDuration = whisperResult.value.duration;
      console.log(`Whisper: ${words.length} words, ${segments.length} segments, duration: ${whisperDuration}s`);
    }

    // Use Whisper's reported duration (full audio length) as trackEnd
    const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 0;
    const whisperDuration = useWhisper && whisperResult.status === "fulfilled" ? whisperResult.value.duration : 0;
    const trackEnd = whisperDuration > 0 ? whisperDuration : (lastWordEnd > 0 ? lastWordEnd : 300);
    console.log(`[trackEnd] ${trackEnd.toFixed(3)}s (whisperDuration=${whisperDuration}, lastWordEnd=${lastWordEnd.toFixed(3)})`);

    // ── Stage 2: v9.0 Triptych — Three parallel Gemini lanes (byte-sliced) ──
    let lines: LyricLine[] = [];
    let qaCorrections = 0;
    let ghostsRemoved = 0;
    let triptychDebug: any = {};

    if (!analysisDisabled && useWhisper && whisperResult.status === "fulfilled") {
      const anchorWord = words.length > 0 ? words[0] : null;
      const anchorTs = anchorWord?.start ?? 0;
      const anchorW = anchorWord?.word ?? "unknown";

      // Determine middle cutoff: where Whisper words thin out (last word - small buffer)
      const middleCutoff = lastWordEnd > 10 ? lastWordEnd - 2.0 : lastWordEnd;

      // v9.4: Lane B gets sliced audio (first anchorTs+2s) to reduce ingestion & prevent hallucination
      // Lane C gets sliced audio (outro is self-contained)
      // Lane D gets full audio for phonetic context
      const introAudioB64 = sliceAudioBase64(audioBase64, trackEnd, 0, anchorTs + 2.0);
      const outroAudioB64 = sliceAudioBase64(audioBase64, trackEnd, middleCutoff - 2.0, trackEnd);

      console.log(`[triptych] v9.4: Lane B(sliced 0-${(anchorTs + 2).toFixed(1)}s), Lane C(sliced ${middleCutoff.toFixed(1)}-${trackEnd.toFixed(1)}s), Lane D(full)`);

      const [introResult, outroResult, auditorResult] = await Promise.allSettled([
        runGeminiIntro(introAudioB64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel, anchorW, anchorTs),
        runGeminiOutro(outroAudioB64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel, middleCutoff, trackEnd),
        runGeminiAuditor(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel, rawText, anchorTs, middleCutoff),
      ]);

      // Extract results with graceful fallbacks
      const introLines = introResult.status === "fulfilled" ? introResult.value.lines : [];
      const outroLines = outroResult.status === "fulfilled" ? outroResult.value.lines : [];
      const corrections = auditorResult.status === "fulfilled" ? auditorResult.value.corrections : {};

      if (introResult.status === "rejected") {
        console.warn(`[triptych] Lane B (intro) failed: ${(introResult.reason as Error)?.message}`);
      }
      if (outroResult.status === "rejected") {
        console.warn(`[triptych] Lane C (outro) failed: ${(outroResult.reason as Error)?.message}`);
      }
      if (auditorResult.status === "rejected") {
        console.warn(`[triptych] Lane D (auditor) failed: ${(auditorResult.reason as Error)?.message}`);
      }

      // Stitch the three lanes together
      const stitched = stitchTriptych(
        introLines,
        outroLines,
        corrections,
        segments,
        words,
        anchorTs,
        middleCutoff,
        trackEnd
      );

      lines = stitched.lines;
      qaCorrections = stitched.qaCorrections;

      triptychDebug = {
        laneB: {
          status: introResult.status,
          linesReturned: introLines.length,
          rawLength: introResult.status === "fulfilled" ? introResult.value.rawContent.length : 0,
          error: introResult.status === "rejected" ? (introResult.reason as Error)?.message : null,
        },
        laneC: {
          status: outroResult.status,
          linesReturned: outroLines.length,
          rawLength: outroResult.status === "fulfilled" ? outroResult.value.rawContent.length : 0,
          error: outroResult.status === "rejected" ? (outroResult.reason as Error)?.message : null,
        },
        laneD: {
          status: auditorResult.status,
          correctionsCount: Object.keys(corrections).length,
          corrections,
          rawLength: auditorResult.status === "fulfilled" ? auditorResult.value.rawContent.length : 0,
          error: auditorResult.status === "rejected" ? (auditorResult.reason as Error)?.message : null,
        },
        anchorWord: anchorW,
        anchorTs,
        middleCutoff,
      };

    } else if (analysisDisabled && useWhisper && whisperResult.status === "fulfilled") {
      // Analysis disabled: plain Whisper segments split into phrases
      for (const seg of segments) {
        lines.push(...splitSegmentIntoPhrases(seg, words));
      }
    }

    // ── Handle hook result ───────────────────────────────────────────────────
    let title = "Unknown";
    let artist = "Unknown";
    let metadata: any = undefined;
    let hooks: any[] = [];
    let geminiUsed = false;
    let geminiError: string | null = null;

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
      geminiError = `hook: ${reason}`;
      console.warn("Gemini hook analysis failed:", reason);
    }

    const adlibCount = lines.filter(l => l.tag === "adlib").length;
    const floatingCount = lines.filter(l => l.isFloating).length;
    const orphanedCount = lines.filter(l => l.isOrphaned).length;
    const correctionCount = qaCorrections;

    console.log(`[v9.2] Final: ${lines.length} lines (${lines.length - adlibCount} main, ${adlibCount} adlib, ${correctionCount} qa-corrections), ${hooks.length} hooks`);

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
          version: "anchor-align-v9.4-triptych-literal-bound",
          pipeline: {
            transcription: useWhisper ? "whisper-1" : "gemini-only",
            analysis: analysisDisabled ? "disabled" : resolvedAnalysisModel,
            orchestrator: "v9.4-triptych-literal-bound",
          },
          geminiUsed,
          geminiError,
          triptych: triptychDebug,
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
