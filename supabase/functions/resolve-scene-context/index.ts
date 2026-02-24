import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are a cinematographer and music video director.
An artist has described where and when they listen to a song.
Map their description to a precise visual scene context for a lyric video.

Return ONLY valid JSON matching this exact schema:
{
  "baseLuminance": "light" | "dark" | "medium",
  "colorTemperature": "warm" | "cool" | "neutral",
  "timeOfDay": "dawn" | "morning" | "afternoon" | "dusk" | "night",
  "backgroundOpacity": 0.3 to 0.6,
  "crushOpacity": 0.25 to 0.75,
  "textStyle": "light" | "dark",
  "fluxPromptSuffix": "cinematic photography description of this scene for image generation",
  "moodSummary": "one sentence describing the visual world",
  "sourceDescription": "the original artist description verbatim"
}

RULES:
- baseLuminance drives everything: light = bright backgrounds, dark text. dark = dark backgrounds, white text.
- fluxPromptSuffix must be evocative and specific — describe what a camera would see
- Night scenes: dark, crushOpacity 0.65-0.75
- Day/outdoor scenes: light or medium, crushOpacity 0.25-0.45
- Indoor intimate scenes: dark or medium, warm color temperature
- High energy scenes: higher backgroundOpacity (0.5-0.6)
- Quiet emotional scenes: lower backgroundOpacity (0.3-0.4)

Examples:
"driving home late at night after a long shift"
→ dark, cool, night, crush 0.72, suffix "wet city streets at night, streetlights reflecting on asphalt, empty highway, tired amber glow, cinematic"

"morning run at sunrise, feeling alive"
→ light, warm, dawn, crush 0.28, suffix "early morning golden light, open road, soft mist, hopeful sunrise, cinematic wide shot"

"laying in bed thinking about her"
→ dark, warm, night, crush 0.68, suffix "dark bedroom, single lamp, soft shadows, intimate and still, cinematic close"

"pregame hype with the boys"
→ medium, warm, night, crush 0.45, suffix "bright indoor lights, energy, crowd of friends, motion blur, electric atmosphere"`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json();
    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Description too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.5,
        max_tokens: 512,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const txt = await response.text();
      console.error("AI gateway error:", status, txt);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    // Ensure sourceDescription is set
    parsed.sourceDescription = description.trim();

    // Clamp numeric values
    parsed.backgroundOpacity = Math.max(0.3, Math.min(0.6, Number(parsed.backgroundOpacity) || 0.35));
    parsed.crushOpacity = Math.max(0.25, Math.min(0.75, Number(parsed.crushOpacity) || 0.55));

    // Validate enums
    if (!["light", "dark", "medium"].includes(parsed.baseLuminance)) parsed.baseLuminance = "dark";
    if (!["warm", "cool", "neutral"].includes(parsed.colorTemperature)) parsed.colorTemperature = "neutral";
    if (!["dawn", "morning", "afternoon", "dusk", "night"].includes(parsed.timeOfDay)) parsed.timeOfDay = "night";
    if (!["light", "dark"].includes(parsed.textStyle)) {
      parsed.textStyle = parsed.baseLuminance === "light" ? "dark" : "light";
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resolve-scene-context error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
