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

// ── Provider: xAI Grok STT ──────────────────────────────────────────────────
async function transcribeGrok(input: ParsedInput): Promise<any> {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY not configured");

  const fd = new FormData();
  fd.append("file", new Blob([input.audio], { type: input.mime }), input.filename);
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
  fd.append("file", new Blob([input.audio], { type: input.mime }), input.filename);
  fd.append("model_id", "scribe_v1");
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
    .map((w: any) => ({
      word: String(w.text ?? w.word ?? "").trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? w.start ?? 0),
    }))
    .filter((w: Word) => w.word.length > 0);

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
    body: input.audio,
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

  const words: Word[] = (result.words || []).map((w: any) => ({
    word: String(w.text ?? "").trim(),
    start: Number(w.start ?? 0) / 1000,
    end: Number(w.end ?? 0) / 1000,
  })).filter((w: Word) => w.word.length > 0);

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

    return json(200, result);
  } catch (e) {
    console.error("[lyric-transcribe] error", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});