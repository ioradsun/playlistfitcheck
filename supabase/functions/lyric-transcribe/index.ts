import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_PROMPT = `You are a professional lyrics transcription engine. Your job is to transcribe song lyrics from audio with precise timestamps.

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

async function fetchPrompt(): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(
      `${url}/rest/v1/ai_prompts?slug=eq.lyric-transcribe&select=prompt`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = await res.json();
    return rows?.[0]?.prompt || DEFAULT_PROMPT;
  } catch {
    return DEFAULT_PROMPT;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Client sends pre-encoded base64 audio as JSON
    const { audioBase64, format } = await req.json();
    if (!audioBase64) throw new Error("No audio data provided");

    // Rough size check on base64 string (~0.75 bytes per char)
    const estimatedBytes = audioBase64.length * 0.75;
    if (estimatedBytes > 20 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: `File too large (~${(estimatedBytes / 1024 / 1024).toFixed(0)} MB). Max is 20 MB.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing audio: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${format || "mp3"}`);

    const systemPrompt = await fetchPrompt();

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
              { type: "input_audio", input_audio: { data: audioBase64, format: format || "wav" } },
              { type: "text", text: "Transcribe the lyrics from this song with precise timestamps. Return ONLY valid JSON." },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Transcription failed");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

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
