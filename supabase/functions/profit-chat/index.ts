import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_CHAT_PROMPT = `You are ProFit Strategy Chat. You must produce short, structured, tier-aware responses. You must not ramble. You must not brainstorm endlessly. You must give a recommendation, justification tied to signals, a checklist, pitfalls, and end with one action-focused question.

Output MUST be valid JSON matching this schema:
{
  "recommendation": string,
  "whyTierFit": string[],
  "nextSteps": string[],
  "pitfalls": string[],
  "nextActionQuestion": string
}

Return ONLY valid JSON, no markdown fences, no extra text.`;

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, blueprint, artistData, chatHistory } = await req.json();
    if (!message || !blueprint || !artistData) {
      return new Response(JSON.stringify({ error: "message, blueprint, and artistData are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const contextMessages = (chatHistory || []).slice(-10).map((m: any) => ({
      role: m.role,
      content: m.role === "assistant" && m.structured
        ? JSON.stringify(m.structured)
        : m.content,
    }));

    const userPrompt = `Context Blueprint:
${JSON.stringify({ tier: blueprint.tier, scorecard: blueprint.scorecard, topMoves: blueprint.topMoves?.map((m: any) => m.title), singleROIFocus: blueprint.singleROIFocus }, null, 2)}

Artist signals:
${JSON.stringify(artistData.signals, null, 2)}

Artist: ${artistData.name} | Genres: ${(artistData.genres || []).join(", ")}

User request:
${message}`;

    const CHAT_SYSTEM_PROMPT = await fetchPrompt("profit-chat", DEFAULT_CHAT_PROMPT);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...contextMessages,
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again in a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResp.json();
    let text = aiData.choices?.[0]?.message?.content || "";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let structured;
    try {
      structured = JSON.parse(text);
    } catch {
      // Fallback: return as plain text
      structured = {
        recommendation: text,
        whyTierFit: [],
        nextSteps: [],
        pitfalls: [],
        nextActionQuestion: "What would you like to focus on next?",
      };
    }

    return new Response(JSON.stringify(structured), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("profit-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
