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

    const systemPrompt = `You are a professional lyrics transcription and analysis engine. Analyze the song audio and return a structured JSON response.

Output ONLY valid JSON, no markdown, no code fences:
{
  "title": "Song title if audible, else Unknown",
  "artist": "Artist name if audible, else Unknown",
  "metadata": {
    "mood": "e.g. melancholic, energetic, uplifting, aggressive, romantic",
    "bpm_estimate": 120,
    "confidence": 0.85,
    "key": "e.g. C major, A minor",
    "genre_hint": "e.g. hip-hop, pop, R&B"
  },
  "lines": [
    { "start": 12.4, "end": 15.8, "text": "Main lyric line", "tag": "main" },
    { "start": 13.0, "end": 14.5, "text": "(ad-lib or background vocal)", "tag": "adlib" }
  ],
  "hooks": [
    { "start": 45.0, "end": 60.0, "score": 92, "reasonCodes": ["repetition", "melodic_peak", "chorus"], "previewText": "First few words of the hook..." }
  ]
}

CRITICAL RULES:
- "tag" must be "main" for lead vocals/primary lyrics, or "adlib" for background vocals, ad-libs, harmonies, or call-and-response
- Ad-libs CAN overlap in time with main lines — this is expected and correct
- Main lines should NOT overlap with other main lines
- timestamps: start and end are floating point seconds, 1 decimal place precision
- hooks: identify 1-4 of the most memorable/catchy sections (chorus, hook, drop). score is 0-100
- metadata.confidence: 0.0-1.0 reflecting how confidently you could transcribe the vocals
- Lines in chronological order by start time
- Skip purely instrumental sections`;

    // Use Lovable AI gateway with Gemini multimodal (inline_data for audio)
    console.log(`Sending audio to Lovable AI gateway: ~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB, format: ${ext}, mime: ${mimeType}`);

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
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${audioBase64}`,
                },
              },
              { type: "text", text: "Transcribe the lyrics from this audio file with precise timestamps. Output only the JSON." },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });

    let content = "";
    if (!gatewayRes.ok) {
      const gwError = await gatewayRes.text();
      console.error("Gateway error:", gatewayRes.status, gwError.slice(0, 300));
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
      throw new Error(`Lovable AI gateway error: ${gatewayRes.status}`);
    }

    const gwData = await gatewayRes.json();
    content = gwData.choices?.[0]?.message?.content || "";
    console.log(`Gateway response length: ${content.length}, finish: ${gwData.choices?.[0]?.finish_reason}`);
    if (!content) {
      console.error("Empty content from gateway. Full response:", JSON.stringify(gwData).slice(0, 500));
      throw new Error("No transcription returned from AI — try again");
    }

    // Parse JSON response
    let parsed: { title?: string; artist?: string; metadata?: any; lines?: any[]; hooks?: any[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      console.error("Failed to parse Gemini response:", content.slice(0, 500));
      throw new Error("Failed to parse transcription response — try again");
    }

    // Sanitize lines — keep tag field, allow adlibs to overlap
    const rawLines = (parsed.lines ?? [])
      .map((l: any) => ({
        start: Math.round((Number(l.start) || 0) * 10) / 10,
        end: Math.round((Number(l.end) || 0) * 10) / 10,
        text: String(l.text ?? "").trim(),
        tag: l.tag === "adlib" ? "adlib" : "main",
      }))
      .filter((l: any) => l.text.length > 0 && l.end > l.start);

    // For main lines only: fix overlaps by clamping end to next main line's start
    const mainLines = rawLines.filter((l: any) => l.tag === "main");
    const adlibLines = rawLines.filter((l: any) => l.tag === "adlib");
    const fixedMain = mainLines.map((l: any, i: number) => {
      if (i < mainLines.length - 1) {
        const nextStart = mainLines[i + 1].start;
        if (l.end > nextStart) return { ...l, end: Math.round((nextStart - 0.1) * 10) / 10 };
      }
      return l;
    });
    const lines = [...fixedMain, ...adlibLines].sort((a: any, b: any) => a.start - b.start);

    // Sanitize hooks
    const hooks = (parsed.hooks ?? []).map((h: any) => ({
      start: Math.round((Number(h.start) || 0) * 10) / 10,
      end: Math.round((Number(h.end) || 0) * 10) / 10,
      score: Math.min(100, Math.max(0, Number(h.score) || 0)),
      reasonCodes: Array.isArray(h.reasonCodes) ? h.reasonCodes : [],
      previewText: String(h.previewText ?? "").trim(),
    })).filter((h: any) => h.end > h.start);

    // Sanitize metadata
    const metadata = parsed.metadata ? {
      mood: String(parsed.metadata.mood || "").trim() || undefined,
      bpm_estimate: Number(parsed.metadata.bpm_estimate) || undefined,
      confidence: Math.min(1, Math.max(0, Number(parsed.metadata.confidence) || 0)) || undefined,
      key: String(parsed.metadata.key || "").trim() || undefined,
      genre_hint: String(parsed.metadata.genre_hint || "").trim() || undefined,
    } : undefined;

    console.log(`Final: ${lines.length} lines (${fixedMain.length} main, ${adlibLines.length} adlib), ${hooks.length} hooks`);

    return new Response(
      JSON.stringify({
        title: parsed.title || "Unknown",
        artist: parsed.artist || "Unknown",
        metadata,
        lines,
        hooks,
        _debug: {
          rawResponse: content,
          rawLines,
          model: "lovable-gateway/gemini-2.5-flash",
          inputBytes: Math.round(estimatedBytes),
          outputLines: lines.length,
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
