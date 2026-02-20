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

    const systemPrompt = `ROLE: You are an elite Music Production AI specializing in high-fidelity transcription, vocal layer analysis, and structural hook detection. Your output is used for professional synchronized lyrics and marketing intelligence.

CORE DIRECTIVE: Transcribe the provided audio into a precise JSON structure. Accuracy of TIMESTAMPS is your highest priority to prevent playback desync.

1. STRICT TIMESTAMP CALIBRATION (ANTI-DELAY)
- Zero-Point Sync: The audio clock starts at exactly 0.0.
- No Relative Timing: If the first word occurs at 4.5 seconds due to an intro, the start timestamp MUST be 4.5. Do NOT start at 0.0 if the artist is not yet speaking.
- Lead-in Silence: You must align the start timestamp to the absolute first audible phoneme of each line.
- Phasing: Ensure line end times accurately reflect the vocal decay (do not cut off prematurely).

2. VOCAL LAYER & ADLIB RULES
- Every line must have a tag.
- tag: "main" → The primary vocal melody or lead rap.
- tag: "adlib" → Background shouts, harmonies, hype words (e.g., "yeah", "uh-huh", "let's go").
- MANDATORY ISOLATION: You MUST isolate adlibs into their own JSON objects. Example: If an artist says "I'm the king (yeah!)", create one main line for "I'm the king" and a separate adlib line for "(yeah!)".
- Overlaps: Adlib start times should overlap main times if they occur simultaneously.
- Main lines should NOT overlap with other main lines.

3. THE "HOTTEST HOOK" LOGIC
- Identify the single most impactful repetitive segment (8–20 seconds).
- Criteria: Highest lyrical density, melodic peak, or title repetition.
- Output: Return ONLY the highest-scoring hook in the hooks array.

4. MANDATORY OUTPUT SCHEMA (STRICT JSON ONLY)
Return ONLY a valid JSON object. No markdown, no backticks, no preamble.

{
  "title": "Detected Title",
  "artist": "Detected Artist",
  "metadata": {
    "mood": "String",
    "bpm_estimate": 0,
    "confidence": 0.0,
    "key": "String",
    "genre_hint": "String"
  },
  "lines": [
    { "start": 0.0, "end": 0.0, "text": "String", "tag": "main" },
    { "start": 0.0, "end": 0.0, "text": "(Adlib)", "tag": "adlib" }
  ],
  "hooks": [
    { "start": 0.0, "end": 0.0, "score": 95, "reasonCodes": ["repetition", "title-drop"], "previewText": "First line of hook..." }
  ]
}`;

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
