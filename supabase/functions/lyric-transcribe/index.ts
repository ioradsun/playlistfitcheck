import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    if (!audioFile) throw new Error("No audio file provided");

    // Convert audio to base64
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);

    // Determine MIME type
    const mimeType = audioFile.type || "audio/mpeg";

    const systemPrompt = `You are a professional lyrics transcription engine. Your job is to transcribe song lyrics from audio with precise timestamps.

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
      throw new Error(`AI gateway error: ${response.status}`);
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
