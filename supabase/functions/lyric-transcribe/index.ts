// lyric-transcribe — routes audio to ElevenLabs Scribe, AssemblyAI, or xAI Grok STT
// based on the admin setting `site_copy.copy_json.features.lyric_transcription_model`.
//
// Accepts EITHER:
//   - JSON: { audioUrl: string, format?: string, referenceLyrics?: string }
//   - multipart/form-data with field "audio" (File) and optional "referenceLyrics"
//
// Returns: {
//   lines: Array<{ start: number; end: number; text: string }>,
//   words: Array<{ word: string; start: number; end: number }>,
//   title?: string, artist?: string, hooks?: any, metadata?: any,
//   transcription: "scribe_v2" | "grok" | "assemblyai",
//   _debug?: any
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type ProviderId = "scribe" | "grok" | "assemblyai";

interface ParsedInput {
  audio: Uint8Array;
  filename: string;
  mime: string;
  referenceLyrics?: string;
}

// ── Provider selection ──────────────────────────────────────────────────────
async function resolveProvider(): Promise<ProviderId> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .maybeSingle();
    const v = (data?.copy_json as any)?.features?.lyric_transcription_model;
    if (v === "grok" || v === "scribe" || v === "assemblyai") return v;
  } catch (e) {
    console.error("[lyric-transcribe] provider lookup failed", e);
  }
  return "scribe";
}

// ── Input parsing (accepts JSON URL or multipart) ───────────────────────────
async function parseInput(req: Request): Promise<ParsedInput> {
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    const body = await req.json();
    const audioUrl: string | undefined = body.audioUrl;
    if (!audioUrl) throw new Error("audioUrl required");
    const fmt = (body.format || "webm").toLowerCase();
    const resp = await fetch(audioUrl);
    if (!resp.ok) throw new Error(`fetch audio failed: ${resp.status}`);
    const buf = new Uint8Array(await resp.arrayBuffer());
    return {
      audio: buf,
      filename: `audio.${fmt}`,
      mime: resp.headers.get("content-type") || `audio/${fmt}`,
      referenceLyrics: body.referenceLyrics,
    };
  }

  // multipart fallback
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) throw new Error("audio file required");
  const buf = new Uint8Array(await file.arrayBuffer());
  const ref = form.get("referenceLyrics");
  return {
    audio: buf,
    filename: file.name || "audio.webm",
    mime: file.type || "audio/webm",
    referenceLyrics: typeof ref === "string" ? ref : undefined,
  };
}

// ── Shared output shape ─────────────────────────────────────────────────────
interface Word { word: string; start: number; end: number }
interface Line { start: number; end: number; text: string }

/**
 * Non-speech audio event tokens emitted by transcription models that must
 * not enter the lyric word stream. Scribe emits `[singing]`, `[music]`,
 * `[applause]`, etc. with type="audio_event" and sometimes emits
 * parenthesized variants like `(music)` as type="word".
 *
 * Returns true when the token should be dropped.
 */
function isAudioEventToken(raw: unknown, text: string): boolean {
  const r = raw as { type?: string } | null | undefined;
  if (r?.type === "audio_event") return true;
  const t = text.trim();
  if (!t) return true;
  // Bracketed or parenthesized non-lyric markers: (music), [singing], {crowd}
  if (/^[\(\[\{].*[\)\]\}]$/.test(t)) return true;
  return false;
}

function wordsToLines(words: Word[], maxGap = 0.7, maxWords = 12): Line[] {
  if (!words.length) return [];
  const lines: Line[] = [];
  let buf: Word[] = [];
  const flush = () => {
    if (!buf.length) return;
    lines.push({
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      text: buf.map((w) => w.word).join(" ").replace(/\s+([,.!?])/g, "$1"),
    });
    buf = [];
  };
  for (const w of words) {
    if (buf.length) {
      const gap = w.start - buf[buf.length - 1].end;
      if (gap > maxGap || buf.length >= maxWords || /[.!?]$/.test(buf[buf.length - 1].word)) {
        flush();
      }
    }
    buf.push(w);
  }
  flush();
  return lines;
}

// ── Reference-lyrics alignment ───────────────────────────────────────────────
// When the user pastes the real lyrics alongside the audio, keep the
// transcription's word-level TIMING but replace the (often wrong) transcribed
// TEXT with the pasted lyrics. Anchor words are matched with a longest-common-
// subsequence pass on normalized text; unmatched reference words receive
// interpolated timings between their surrounding anchors.

function normForMatch(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface RefToken { text: string; norm: string; lineIndex: number }

function parseReferenceLyrics(reference: string): RefToken[] {
  const tokens: RefToken[] = [];
  let lineIndex = 0;
  for (const raw of reference.split(/\r?\n/)) {
    const line = raw.trim();
    // Skip blank lines and section markers like [Chorus] / (Verse 2).
    if (!line || /^[([{].*[)\]}]$/.test(line)) continue;
    let added = false;
    for (const part of line.split(/\s+/)) {
      const norm = normForMatch(part);
      if (!norm) continue; // punctuation-only token
      tokens.push({ text: part, norm, lineIndex });
      added = true;
    }
    if (added) lineIndex++;
  }
  return tokens;
}

function lcsMatchPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length;
  if (!n || !m) return [];
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i], next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Distribute reference words [from, to) evenly across the [left, right] time span.
function fillRange(out: Word[], from: number, to: number, left: number, right: number): void {
  const count = to - from;
  if (count <= 0) return;
  const step = Math.max(0, right - left) / (count + 1);
  for (let k = 0; k < count; k++) {
    out[from + k].start = left + step * (k + 1);
    out[from + k].end = left + step * (k + 2);
  }
}

function alignReferenceToWords(
  reference: string,
  transWords: Word[],
): { words: Word[]; lines: Line[] } | null {
  const tokens = parseReferenceLyrics(reference);
  if (!tokens.length || !transWords.length) return null;

  const out: Word[] = tokens.map((t) => ({ word: t.text, start: 0, end: 0 }));
  const refNorm = tokens.map((t) => t.norm);
  const transNorm = transWords.map((w) => normForMatch(w.word));

  // Cap the DP for pathological inputs; fall back to even distribution.
  const tooLarge = refNorm.length * transNorm.length > 6_000_000;
  const pairs = tooLarge ? [] : lcsMatchPairs(refNorm, transNorm);

  if (!pairs.length) {
    fillRange(out, 0, out.length, transWords[0].start, transWords[transWords.length - 1].end);
  } else {
    // Anchors: matched reference words take the transcription word's timing.
    for (const [ri, tj] of pairs) {
      out[ri].start = transWords[tj].start;
      out[ri].end = transWords[tj].end;
    }
    const anchors = pairs.map((p) => p[0]);
    const first = anchors[0];
    if (first > 0) {
      fillRange(out, 0, first, Math.max(0, out[first].start - 0.4 * first), out[first].start);
    }
    for (let a = 0; a < anchors.length - 1; a++) {
      const from = anchors[a], to = anchors[a + 1];
      if (to - from > 1) fillRange(out, from + 1, to, out[from].end, out[to].start);
    }
    const last = anchors[anchors.length - 1];
    if (last < out.length - 1) {
      const tail = out.length - 1 - last;
      fillRange(out, last + 1, out.length, out[last].end, out[last].end + 0.4 * tail);
    }
  }

  // Enforce finite, non-negative, non-decreasing timings.
  let prevEnd = 0;
  for (const w of out) {
    let s = Number.isFinite(w.start) ? w.start : prevEnd;
    let e = Number.isFinite(w.end) ? w.end : s;
    if (s < 0) s = 0;
    if (s < prevEnd) s = prevEnd;
    if (e < s) e = s;
    w.start = s; w.end = e; prevEnd = e;
  }

  // Lines follow the pasted lyric line breaks.
  const lines: Line[] = [];
  let buf: Word[] = [];
  let curLine = tokens[0].lineIndex;
  const flushLine = () => {
    if (!buf.length) return;
    lines.push({
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      text: buf.map((w) => w.word).join(" "),
    });
    buf = [];
  };
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].lineIndex !== curLine) { flushLine(); curLine = tokens[k].lineIndex; }
    buf.push(out[k]);
  }
  flushLine();

  return { words: out, lines };
}

// ── Provider: xAI Grok STT ──────────────────────────────────────────────────
async function transcribeGrok(input: ParsedInput): Promise<any> {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY not configured");

  const fd = new FormData();
  fd.append("file", new Blob([input.audio as BufferSource], { type: input.mime }), input.filename);
  fd.append("model", "grok-stt");
  fd.append("response_format", "verbose_json");

  const resp = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Grok STT ${resp.status}: ${text.slice(0, 300)}`);
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Grok STT returned non-JSON"); }

  // Normalize: { text, duration, words: [{ word, start, end }] }
  const words: Word[] = Array.isArray(data.words)
    ? data.words.map((w: any) => ({
        word: String(w.word ?? w.text ?? "").trim(),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? w.start ?? 0),
      })).filter((w: Word) => w.word.length > 0)
    : [];

  const lines = wordsToLines(words);
  return {
    lines,
    words,
    transcription: "grok",
    _debug: { provider: "grok", duration: data.duration, word_count: words.length },
  };
}

// ── Provider: ElevenLabs Scribe v2 ──────────────────────────────────────────
async function transcribeScribe(input: ParsedInput): Promise<any> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");

  const fd = new FormData();
  fd.append("file", new Blob([input.audio as BufferSource], { type: input.mime }), input.filename);
  fd.append("model_id", "scribe_v2");
  fd.append("timestamps_granularity", "word");

  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: fd,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Scribe ${resp.status}: ${text.slice(0, 300)}`);
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Scribe returned non-JSON"); }

  const rawWords = Array.isArray(data.words) ? data.words : [];
  const words: Word[] = rawWords
    .filter((w: any) => w.type !== "spacing")
    .filter((w: any) => !isAudioEventToken(w, String(w.text ?? w.word ?? "")))
    .map((w: any) => ({
      word: String(w.text ?? w.word ?? "").trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? w.start ?? 0),
    }))
    .filter((w: Word) => w.word.length > 0 && !isAudioEventToken(null, w.word));

  const lines = wordsToLines(words);
  return {
    lines,
    words,
    transcription: "scribe_v2",
    _debug: { provider: "scribe", language: data.language_code, word_count: words.length },
  };
}

// ── Provider: AssemblyAI universal-3-pro ────────────────────────────────────
async function transcribeAssembly(input: ParsedInput): Promise<any> {
  const key = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!key) throw new Error("ASSEMBLYAI_API_KEY not configured");

  // 1. Upload
  const upload = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: key, "content-type": "application/octet-stream" },
    body: input.audio as BodyInit,
  });
  if (!upload.ok) throw new Error(`AssemblyAI upload ${upload.status}`);
  const { upload_url } = await upload.json();

  // 2. Submit
  const submit = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speech_model: "universal" }),
  });
  if (!submit.ok) throw new Error(`AssemblyAI submit ${submit.status}`);
  const job = await submit.json();

  // 3. Poll
  let result: any;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${job.id}`, {
      headers: { authorization: key },
    });
    result = await poll.json();
    if (result.status === "completed") break;
    if (result.status === "error") throw new Error(`AssemblyAI: ${result.error}`);
  }
  if (result?.status !== "completed") throw new Error("AssemblyAI timed out");

  const words: Word[] = (result.words || [])
    .map((w: any) => ({
      word: String(w.text ?? "").trim(),
      start: Number(w.start ?? 0) / 1000,
      end: Number(w.end ?? 0) / 1000,
    }))
    .filter((w: Word) => w.word.length > 0 && !isAudioEventToken(null, w.word));

  const lines = wordsToLines(words);
  return {
    lines,
    words,
    transcription: "assemblyai",
    _debug: { provider: "assemblyai", language: result.language_code, word_count: words.length },
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const [provider, input] = await Promise.all([resolveProvider(), parseInput(req)]);
    console.log(`[lyric-transcribe] provider=${provider} bytes=${input.audio.byteLength} mime=${input.mime}`);

    let result: any;
    if (provider === "grok") {
      try {
        result = await transcribeGrok(input);
      } catch (e) {
        console.error("[lyric-transcribe] Grok failed, falling back to Scribe", e);
        result = await transcribeScribe(input);
        result._debug = { ...(result._debug || {}), grok_fallback: String(e) };
      }
    } else if (provider === "assemblyai") {
      result = await transcribeAssembly(input);
    } else {
      result = await transcribeScribe(input);
    }

    // ── Reference-lyrics override ──
    // Keep the transcription's timing, but use the pasted lyrics for the actual
    // word text so the on-screen words are always correct. Applies to whichever
    // provider ran above.
    if (input.referenceLyrics && input.referenceLyrics.trim()) {
      const aligned = alignReferenceToWords(input.referenceLyrics, result.words as Word[]);
      if (aligned && aligned.words.length) {
        result.words = aligned.words;
        result.lines = aligned.lines;
        result._debug = {
          ...(result._debug || {}),
          reference_lyrics: true,
          reference_word_count: aligned.words.length,
        };
      }
    }

    return json(200, result);
  } catch (e) {
    console.error("[lyric-transcribe] error", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});