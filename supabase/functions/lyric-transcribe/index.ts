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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { audioBase64, format } = await req.json();
    if (!audioBase64) throw new Error("No audio data provided");

    const estimatedBytes = audioBase64.length * 0.75;
    if (estimatedBytes > 25 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: `File too large (~${(estimatedBytes / 1024 / 1024).toFixed(0)} MB). Max is 25 MB.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map format → MIME type
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

    console.log(`Processing audio via Gemini: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

    const systemPrompt = `You are a professional lyrics transcription engine. Your job is to transcribe song lyrics from audio with precise timing. Return ONLY valid JSON — no markdown, no code fences, no explanation.

Output format:
{
  "title": "Unknown",
  "artist": "Unknown",
  "lines": [
    { "start": 0.0, "end": 3.2, "text": "Line of lyrics here" },
    ...
  ]
}

Rules:
- Each line should be a meaningful lyrical phrase or sentence, not individual words
- start and end are timestamps in seconds, rounded to 1 decimal place
- Omit empty/silent sections
- If you cannot determine title/artist from the audio, use "Unknown"
- Lines must be in chronological order`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: ext === "mp3" || ext === "mpga" || ext === "mpeg" ? "mp3"
                    : ext === "wav" ? "wav"
                    : ext === "ogg" || ext === "oga" ? "ogg"
                    : ext === "flac" ? "flac"
                    : ext === "webm" ? "webm"
                    : "mp3",
                },
              },
              {
                type: "text",
                text: "Please transcribe the lyrics from this audio file with timestamps for each line.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Gemini error ${response.status}: ${errorText}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed: { title?: string; artist?: string; lines?: any[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      console.error("Failed to parse Gemini response:", content);
      throw new Error("Failed to parse transcription response");
    }

    const lines = (parsed.lines ?? [])
      .map((l: any) => ({
        start: Math.round((l.start ?? 0) * 10) / 10,
        end: Math.round((l.end ?? 0) * 10) / 10,
        text: String(l.text ?? "").trim(),
      }))
      .filter((l: any) => l.text.length > 0);

    console.log(`Gemini transcription lines: ${lines.length}`);

    return new Response(
      JSON.stringify({ title: parsed.title || "Unknown", artist: parsed.artist || "Unknown", lines }),
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
