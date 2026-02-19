import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Build a multipart/form-data body manually — Deno's FormData loses content-type on blobs */
function buildMultipart(fields: Record<string, string>, file: { name: string; type: string; data: Uint8Array }) {
  const boundary = "----WaveformBoundary" + crypto.randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  parts.push(enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`
  ));
  parts.push(file.data);
  parts.push(enc.encode(`\r\n--${boundary}--\r\n`));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    console.log(`Processing audio: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${format || "mp3"}`);

    // Decode base64 → Uint8Array
    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    // Map format → MIME type (all Whisper-supported formats)
    const mimeMap: Record<string, string> = {
      wav: "audio/wav",
      mp3: "audio/mpeg",
      mpga: "audio/mpeg",
      mpeg: "audio/mpeg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      flac: "audio/flac",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      webm: "audio/webm",
    };
    const ext = (format && mimeMap[format]) ? format : "mp3";
    const mimeType = mimeMap[ext] || "audio/mpeg";

    const { body, contentType } = buildMultipart(
      { model: "whisper-1", response_format: "verbose_json", "timestamp_granularities[]": "segment" },
      { name: `audio.${ext}`, type: mimeType, data: bytes }
    );

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": contentType,
      },
      body,
    });

    if (!whisperRes.ok) {
      const errorText = await whisperRes.text();
      console.error("Whisper API error:", whisperRes.status, errorText);
      if (whisperRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Whisper error ${whisperRes.status}: ${errorText}`);
    }

    const whisperData = await whisperRes.json();
    console.log(`Whisper segments: ${whisperData.segments?.length ?? 0}`);

    const lines = (whisperData.segments ?? []).map((seg: any) => ({
      start: Math.round(seg.start * 10) / 10,
      end: Math.round(seg.end * 10) / 10,
      text: seg.text.trim(),
    })).filter((l: any) => l.text.length > 0);

    return new Response(
      JSON.stringify({ title: "Unknown", artist: "Unknown", lines }),
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
