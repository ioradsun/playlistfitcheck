import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PROMPTS: Record<string, string> = {
  "7day": "Create a detailed 7-day execution plan with specific daily tasks.",
  "30day": "Create a detailed 30-day execution plan organized by week.",
  "streams": "Create a focused plan to maximize streaming revenue and growth.",
  "live": "Create a focused plan to build and monetize live performance opportunities.",
  "services": "Create a focused plan to monetize music services (features, production, ghost-writing, mixing, etc.).",
  "digital": "Create a focused plan to create and sell digital products (sample packs, presets, courses, templates).",
  "aggressive": "Create an aggressive high-intensity growth plan that prioritizes speed and bold moves.",
  "lowrisk": "Create a conservative low-risk plan that prioritizes stability and sustainable income.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { variantType, blueprint, artistData } = await req.json();
    if (!variantType || !blueprint || !artistData) {
      return new Response(JSON.stringify({ error: "variantType, blueprint, and artistData required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const focusPrompt = PLAN_PROMPTS[variantType];
    if (!focusPrompt) {
      return new Response(JSON.stringify({ error: "Invalid variant type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are ProFit, a revenue strategist for independent artists. Based on the artist's existing blueprint and signals, generate a focused plan variant. Be analytical, tier-aware, data-justified. No fluff. No invented numbers.

Output MUST be valid JSON with this schema:
{
  "title": string,
  "summary": string (2-3 sentences),
  "tasks": [{ "day": string, "task": string, "category": string, "priority": "high"|"medium"|"low" }],
  "keyMetrics": [string],
  "expectedOutcome": string
}

Return ONLY valid JSON, no markdown.`;

    const userPrompt = `${focusPrompt}

Artist: ${artistData.name} | Tier: ${blueprint.tier?.name} | Genres: ${(artistData.genres || []).join(", ")}

Blueprint context:
- Top moves: ${blueprint.topMoves?.map((m: any) => m.title).join(", ")}
- Scorecard: ${blueprint.scorecard?.map((s: any) => `${s.pillar}: ${s.score}/10`).join(", ")}
- Single ROI Focus: ${blueprint.singleROIFocus?.focus}

Signals: ${JSON.stringify(artistData.signals)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResp.json();
    let text = aiData.choices?.[0]?.message?.content || "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let plan;
    try {
      plan = JSON.parse(text);
    } catch {
      throw new Error("AI returned invalid plan format");
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("profit-focus-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
