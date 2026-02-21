import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sounds_like, feels_like, song_context } = await req.json();

    if (!sounds_like || !feels_like) {
      return new Response(JSON.stringify({ error: "Both sounds_like and feels_like are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const full_sentence = `My music sounds like ${sounds_like} but feels like ${feels_like}`;
    const timestamp = Date.now();
    const slug = `${sounds_like.replace(/\s+/g, "_").toLowerCase()}_${feels_like.replace(/\s+/g, "_").toLowerCase()}_${timestamp}`.slice(0, 80);

    const systemPrompt = `You are a visual identity designer and synesthete. An artist has described their music using a single sentence with two halves. The first half describes what the music sounds like on the surface. The second half describes what it actually feels like underneath. The gap between these two halves is their entire visual identity.

Your job is to translate that gap into a complete ArtistDNA object that will permanently define how every lyric video they make looks and feels.

Do not use generic music aesthetics. Derive everything specifically from the exact words they used. Two artists who describe similar feelings with different words should get meaningfully different results.

You MUST call the generate_artist_dna function with the complete ArtistDNA object. Do not return text — only call the function.`;

    const userPrompt = `ARTIST INPUT:
  sounds_like: "${sounds_like}"
  feels_like: "${feels_like}"
  full_sentence: "${full_sentence}"

${song_context ? `SONG CONTEXT (from the track they just watched):
  bpm: ${song_context.bpm || "unknown"}
  mood: ${song_context.mood || "unknown"}
  physics_system: ${song_context.physics_system || "unknown"}
  hook_lyric: "${song_context.hook_lyric || ""}"
  description: "${song_context.description || ""}"` : ""}

Generate the ArtistDNA now. The fingerprint_id should be: "${slug}"`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_artist_dna",
              description: "Generate the complete ArtistDNA visual identity object",
              parameters: {
                type: "object",
                properties: {
                  fingerprint_id: { type: "string" },
                  typography: {
                    type: "object",
                    properties: {
                      font_family: { type: "string", description: "A specific Google Font name" },
                      font_weight: { type: "number", minimum: 100, maximum: 900 },
                      font_style: { type: "string", enum: ["normal", "italic"] },
                      letter_spacing: { type: "number", description: "px value, negative for compression" },
                      text_transform: { type: "string", enum: ["uppercase", "lowercase", "none"] },
                      layout_bias: { type: "string", enum: ["centered", "stacked", "expanded", "arc"] },
                    },
                    required: ["font_family", "font_weight", "font_style", "letter_spacing", "text_transform", "layout_bias"],
                    additionalProperties: false,
                  },
                  palette: {
                    type: "object",
                    properties: {
                      primary: { type: "string", description: "HSL string like hsl(240, 80%, 50%)" },
                      accent: { type: "string", description: "HSL string" },
                      background_base: { type: "string", description: "The darkest background color" },
                      background_atmosphere: { type: "string", description: "Second background for gradients" },
                      temperature: { type: "string", enum: ["cold", "warm", "split"] },
                    },
                    required: ["primary", "accent", "background_base", "background_atmosphere", "temperature"],
                    additionalProperties: false,
                  },
                  physics_bias: {
                    type: "object",
                    properties: {
                      mass_modifier: { type: "number", minimum: 0.7, maximum: 1.4 },
                      damping_modifier: { type: "number", minimum: 0.7, maximum: 1.4 },
                      heat_modifier: { type: "number", minimum: 0.7, maximum: 1.4 },
                      system_weights: {
                        type: "object",
                        properties: {
                          fracture: { type: "number", minimum: 0, maximum: 1 },
                          pressure: { type: "number", minimum: 0, maximum: 1 },
                          breath: { type: "number", minimum: 0, maximum: 1 },
                          combustion: { type: "number", minimum: 0, maximum: 1 },
                          orbit: { type: "number", minimum: 0, maximum: 1 },
                        },
                        required: ["fracture", "pressure", "breath", "combustion", "orbit"],
                        additionalProperties: false,
                      },
                    },
                    required: ["mass_modifier", "damping_modifier", "heat_modifier", "system_weights"],
                    additionalProperties: false,
                  },
                  background_world: {
                    type: "object",
                    properties: {
                      type: { type: "string", description: "concrete, void, fog, furnace, space, or a custom type" },
                      description: { type: "string", description: "One sentence physical place description" },
                      particle_behavior: { type: "string", enum: ["none", "rising", "falling", "drifting", "orbiting"] },
                      beat_response: { type: "string", description: "What happens on a beat hit" },
                    },
                    required: ["type", "description", "particle_behavior", "beat_response"],
                    additionalProperties: false,
                  },
                  tension_signature: {
                    type: "object",
                    properties: {
                      gap_score: { type: "number", minimum: 0, maximum: 1 },
                      resolution: { type: "string", enum: ["resolves", "never_resolves"] },
                      signature_line: { type: "string", description: "3-6 word evocative phrase" },
                    },
                    required: ["gap_score", "resolution", "signature_line"],
                    additionalProperties: false,
                  },
                },
                required: ["fingerprint_id", "typography", "palette", "physics_bias", "background_world", "tension_signature"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_artist_dna" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a moment" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return a valid tool call");
    }

    const artistDna = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ artist_dna: artistDna }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("artist-fingerprint error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
