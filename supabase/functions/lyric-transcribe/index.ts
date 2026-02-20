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

    console.log(`Processing audio via Gemini native API: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}, mime: ${mimeType}`);

    // Use Gemini native REST API for better audio timestamp accuracy
    // The OpenAI-compatible endpoint doesn't map audio timestamps as precisely
    const geminiApiKey = LOVABLE_API_KEY;

    const systemPrompt = `You are a professional lyrics transcription engine. Transcribe the song lyrics from the provided audio with PRECISE timestamps.

CRITICAL TIMING RULES:
- Each timestamp must reflect the EXACT moment in the audio when that lyric begins/ends
- Do NOT guess or estimate — listen carefully and map each line to its actual position
- Timestamps must be monotonically increasing
- The last line's end time should match the approximate end of singing (not necessarily the full track duration)
- Lines should NOT overlap in time

Output ONLY valid JSON, no markdown, no code fences:
{
  "title": "Song title if audible, else Unknown",
  "artist": "Artist name if audible, else Unknown",
  "lines": [
    { "start": 12.4, "end": 15.8, "text": "First lyric line" },
    { "start": 16.0, "end": 19.2, "text": "Second lyric line" }
  ]
}

Rules:
- start and end are floating point seconds, 1 decimal place precision
- Each line = one natural phrase or lyrical sentence
- Skip instrumental sections (no text entries for those)
- Lines in strict chronological order`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64,
              },
            },
            {
              text: systemPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    let content = "";
    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log(`Gemini native response length: ${content.length}`);
    } else {
      const errorText = await geminiRes.text();
      console.warn("Gemini native API failed, falling back to gateway:", geminiRes.status, errorText.slice(0, 200));

      // Fallback: Lovable AI gateway
      const gatewayRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  input_audio: { data: audioBase64, format: ext === "wav" ? "wav" : ext === "ogg" || ext === "oga" ? "ogg" : "mp3" },
                },
                { type: "text", text: "Transcribe the lyrics with precise timestamps." },
              ],
            },
          ],
        }),
      });

      if (!gatewayRes.ok) {
        const gwError = await gatewayRes.text();
        if (gatewayRes.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (gatewayRes.status === 402) {
          return new Response(JSON.stringify({ error: "AI usage limit reached. Add credits in Settings → Workspace → Usage." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`Both Gemini endpoints failed. Gateway: ${gatewayRes.status}`);
      }

      const gwData = await gatewayRes.json();
      content = gwData.choices?.[0]?.message?.content || "";
    }

    // Parse JSON response
    let parsed: { title?: string; artist?: string; lines?: any[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      console.error("Failed to parse Gemini response:", content.slice(0, 500));
      throw new Error("Failed to parse transcription response — try again");
    }

    // Sanitize lines: ensure monotonic timestamps, round to 1dp
    const rawLines = (parsed.lines ?? [])
      .map((l: any) => ({
        start: Math.round((Number(l.start) || 0) * 10) / 10,
        end: Math.round((Number(l.end) || 0) * 10) / 10,
        text: String(l.text ?? "").trim(),
      }))
      .filter((l: any) => l.text.length > 0 && l.end > l.start);

    // Fix overlaps: clamp each line's end to next line's start
    const lines = rawLines.map((l: any, i: number) => {
      if (i < rawLines.length - 1) {
        const nextStart = rawLines[i + 1].start;
        if (l.end > nextStart) {
          return { ...l, end: Math.round((nextStart - 0.1) * 10) / 10 };
        }
      }
      return l;
    });

    console.log(`Final transcription lines: ${lines.length}`);

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
