import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Decode base64 → binary → Uint8Array for FormData
    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Whisper requires a proper file extension it recognises.
    // WAV and MP3 are universally supported; treat m4a as mp3 (already compressed/decoded).
    const ext = format === "wav" ? "wav" : "mp3";
    const mimeType = ext === "wav" ? "audio/wav" : "audio/mpeg";
    const audioBlob = new Blob([bytes], { type: mimeType });
    const audioFile = new File([audioBlob], `audio.${ext}`, { type: mimeType });

    // Call Whisper with verbose_json to get segment-level timestamps
    const formData = new FormData();
    formData.append("file", audioFile, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
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

    // Map Whisper segments → our lyric line format
    const lines = (whisperData.segments ?? []).map((seg: any) => ({
      start: Math.round(seg.start * 10) / 10,
      end: Math.round(seg.end * 10) / 10,
      text: seg.text.trim(),
    })).filter((l: any) => l.text.length > 0);

    // Attempt to detect title/artist from full text (best-effort)
    const title = "Unknown";
    const artist = "Unknown";

    return new Response(
      JSON.stringify({ title, artist, lines }),
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
