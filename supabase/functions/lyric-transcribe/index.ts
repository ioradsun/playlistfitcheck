import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPrompt(slug: string, fallback: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data } = await sb.from("ai_prompts").select("prompt").eq("slug", slug).single();
    return data?.prompt || fallback;
  } catch { return fallback; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    if (!audioFile) throw new Error("No audio file provided");

    // Reject files over 25MB to avoid CPU/memory limits
    const MAX_SIZE = 25 * 1024 * 1024;
    if (audioFile.size > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large. Please use an MP3 under 25MB (WAV files are very large — convert to MP3 first)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert audio to base64 using built-in btoa (chunked to avoid stack overflow)
    const audioBuffer = await audioFile.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const audioBase64 = btoa(binary);

    // Determine MIME type
    const mimeType = audioFile.type || "audio/mpeg";

    const defaultLyricPrompt = `You are a professional lyrics transcription engine. Your job is to transcribe song lyrics from audio with precise timestamps.

CRITICAL RULES:
1. Transcribe ONLY the sung/spoken lyrics — no descriptions of instrumentals or sounds
2. Output MUST be valid JSON — no markdown, no code blocks, no extra text
3. Each line should be a natural lyric line (not individual words)
4. Timestamps must be in seconds (decimal, e.g. 14.2)
5. If you cannot detect lyrics (instrumental track), return {"lines": [], "title": "Unknown", "artist": "Unknown"}
6. Estimate a reasonable end_time for each line (typically 2-5 seconds after start)

Output this exact JSON structure:
{
  "title": "detected or 'Unknown'",
  "artist": "detected or 'Unknown'",
  "lines": [
    {"start": 0.0, "end": 3.5, "text": "First lyric line"},
    {"start": 3.5, "end": 7.2, "text": "Second lyric line"}
  ]
}`;

    const systemPrompt = await fetchPrompt("lyric-transcribe", defaultLyricPrompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: mimeType.includes("wav") ? "wav" : "mp3",
                },
              },
              {
                type: "text",
                text: "Transcribe the lyrics from this song with precise timestamps. Return ONLY valid JSON.",
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Transcription failed. If using a WAV file, try converting to MP3 first.");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON from the AI response (strip markdown code blocks if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const lyrics = JSON.parse(cleanContent);

    return new Response(JSON.stringify(lyrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lyric-transcribe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
