import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a music marketing strategist who identifies a song's emotional positioning for social media.

A song's empowerment promise is NOT what it's about — it's what it DOES for the listener.
People share songs because the song gives them language, identity, permission, relief, or power for something they feel but can't fully express.

Six empowerment buckets:
1. Helps you feel something safely
2. Helps you say something you couldn't say
3. Helps you leave something behind
4. Helps you become a new version of yourself
5. Helps you feel seen in a very specific life moment
6. Turns pain, confusion, desire, loneliness, or ambition into meaning

Emotional movement: every strong song moves listener from one state to another.
Examples: confused→clear, rejected→worthy, heartbroken→detached, invisible→powerful, stuck→free

Return exactly 3 social media caption hooks. Rules:
- Never use genre labels — name the MOMENT instead
- Be ruthlessly specific about who this is for
- Max 50 characters per hook (HARD LIMIT — count every character, every space). This must fit on one line of a mobile card. If you exceed 50 characters, you have failed. Short hooks go viral; long hooks get scrolled past.
- Write like a music fan, not a marketer. Specific > general. Short > long.
  "for when you stop pretending you're fine" beats "for when you're driving home and finally stop pretending you're fine."
  The shorter version is sharper, more shareable, and fits one line.
- Use lowercase. Hooks are captions, not headlines.
- Each hook uses a different formula:
  1. "this is the song for when…" (scene — paint the moment)
  2. "pov: you finally…" (identity shift — what changes)
  3. "not a song. a soundtrack for…" (reframe — elevate the meaning)

Return ONLY valid JSON, no markdown, no preamble.`;

function extractJson(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.search(/[\{\[]/);
  const jsonEnd = cleaned.lastIndexOf(jsonStart !== -1 && cleaned[jsonStart] === "[" ? "]" : "}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in response");
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { songTitle, lyricsText, emotionalArc, sceneTone, chorusText, meaning } = await req.json();
    if (!lyricsText) {
      return new Response(JSON.stringify({ error: "lyricsText required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userPrompt = `Song: "${songTitle || "Untitled"}"
${emotionalArc ? `Emotional arc: ${emotionalArc}` : ""}
${sceneTone ? `Tone: ${sceneTone}` : ""}
${chorusText ? `Chorus: ${chorusText}` : ""}
${meaning?.theme ? `Theme: ${meaning.theme}` : ""}
${meaning?.summary ? `Summary: ${meaning.summary}` : ""}

Lyrics:
${lyricsText}

Return JSON:
{
  "emotionalJob": "one sentence — what does this song DO for the listener",
  "fromState": "listener's state before the song (3–6 words)",
  "toState": "listener's state after the song (3–6 words)",
  "promise": "the empowerment promise in one crisp line",
  "hooks": ["hook1", "hook2", "hook3"]
}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        temperature: 0.7,
        reasoning: { effort: "none" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("[empowerment-promise] gateway error:", res.status, txt);
      if (res.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Payment required: Lovable AI credits are exhausted",
            code: "payment_required",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ error: `AI gateway error (${res.status})` }), {
        status: res.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await res.json();
    const raw = result.choices?.[0]?.message?.content ?? "";

    if (!raw) {
      console.error("[empowerment-promise] empty AI response");
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = extractJson(raw);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[empowerment-promise] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
