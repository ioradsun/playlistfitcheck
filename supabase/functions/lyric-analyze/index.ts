import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOG = "[song-dna]";

async function fetchPrompt(slug: string, fallback: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data } = await sb.from("ai_prompts").select("prompt").eq("slug", slug).single();
    return data?.prompt || fallback;
  } catch { return fallback; }
}

const DEFAULT_PROMPT = `ROLE: Universal Music & Physics Orchestrator

TASK: Analyze the full audio track, beat grid, and timestamped lyrics to extract the Song DNA, define a deterministic Physics Spec, and describe a uniquely cinematic visual world.

Your response MUST be complete, valid JSON. Do NOT truncate.

OUTPUT — valid JSON only:
{
  "hottest_hooks": [
    { "start_sec": 0.000, "duration_sec": 10.000, "confidence": 0.95, "justification": "...", "label": "The Drop" },
    { "start_sec": 45.000, "duration_sec": 10.000, "confidence": 0.85, "justification": "...", "label": "The Confession" }
  ],
  "description": "One evocative sentence (max 15 words)",
  "mood": "Single dominant emotional driver",
  "world": "A concrete cinematic place sentence",
  "meaning": { "theme": "2-4 words", "summary": "2-3 sentences", "imagery": ["scene1", "scene2"] },
  "physics_spec": {
    "system": "fracture|pressure|breath|combustion|orbit",
    "params": { "mass": 1.2, "elasticity": 0.5, "damping": 0.6, "brittleness": 0.3, "heat": 0.2 },
    "palette": ["#hex", "#hex", "#hex"],
    "effect_pool": ["EFFECT1", "EFFECT2", "EFFECT3", "EFFECT4"],
    "logic_seed": 12345,
    "particleConfig": { "system": "none", "density": 0.3, "speed": 0.4, "opacity": 0.35, "color": "#hex", "beatReactive": false, "foreground": false },
    "typographyProfile": { "fontFamily": "Inter", "fontWeight": 500, "letterSpacing": "0.04em", "textTransform": "none", "lineHeightMultiplier": 1.2, "hasSerif": false, "personality": "RAW TRANSCRIPT" },
    "lexicon": {
      "semantic_tags": [{ "tag": "LIGHT", "strength": 0.8 }],
      "line_mods": [{ "t_lyric": 12, "mods": ["HEAT_SPIKE"] }],
      "word_marks": [{ "t_lyric": 12, "wordIndex": 3, "mark": "GLITCH" }]
    }
  }
}`;

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface AnalyzeRequest {
  title?: string;
  artist?: string;
  lyrics?: string;
  audioBase64?: string;
  format?: string;
  beatGrid?: { bpm?: number; confidence?: number };
  includeHooks?: boolean;
  userSceneDirection?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as AnalyzeRequest;
    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const lyrics = String(body.lyrics ?? "").trim();

    if (!title || !artist || !lyrics) {
      return new Response(JSON.stringify({ error: "title, artist, and lyrics are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch prompt from DB
    const systemPrompt = await fetchPrompt("lyric-hook", DEFAULT_PROMPT);
    const promptSource = systemPrompt !== DEFAULT_PROMPT ? "db" : "v1-legacy";
    console.log(`${LOG} Prompt source: ${promptSource}, length: ${systemPrompt.length}`);

    // Build user message with optional audio
    const userParts: unknown[] = [];
    
    if (body.audioBase64) {
      const audioMB = (body.audioBase64.length * 0.75 / 1024 / 1024).toFixed(1);
      const fmt = body.format || "mp3";
      console.log(`${LOG} Audio mode: ~${audioMB} MB, format: ${fmt}, beatGrid: ${body.beatGrid?.bpm ?? "none"}bpm`);
      userParts.push({
        type: "input_audio",
        input_audio: { data: body.audioBase64, format: fmt },
      });
    }

    let userText = `Title: ${title}\nArtist: ${artist}\n\nLyrics:\n${lyrics}`;
    if (body.beatGrid) {
      userText += `\n\nBeat Grid: ${body.beatGrid.bpm ?? "?"} BPM (confidence: ${body.beatGrid.confidence ?? "?"})`;
    }
    if (body.includeHooks === false) {
      userText += `\n\nSKIP HOOKS — set hottest_hooks to an empty array.`;
    }
    if (body.userSceneDirection) {
      userText += `\n\nDIRECTOR'S NOTE: ${body.userSceneDirection}`;
    }
    userParts.push({ type: "text", text: userText });

    const maxAttempts = 2;
    let maxTokens = 4096;
    let result: Record<string, unknown> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`${LOG} Attempt ${attempt}: model=google/gemini-2.5-flash, max_tokens=${maxTokens}`);
      
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userParts },
          ],
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
      });

      if (!aiResponse.ok) {
        const text = await aiResponse.text();
        console.error(`${LOG} AI error`, aiResponse.status, text);
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "Usage limit reached. Add credits." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${aiResponse.status}`);
      }

      const completion = await aiResponse.json();
      const raw = completion?.choices?.[0]?.message?.content ?? "";
      const finishReason = completion?.choices?.[0]?.finish_reason ?? "unknown";
      console.log(`${LOG} Response length: ${raw.length}, finish_reason: ${finishReason}`);

      const parsed = extractJson(String(raw));
      if (parsed) {
        // Validate completeness
        const mood = typeof parsed.mood === "string" ? parsed.mood : undefined;
        const system = (parsed.physics_spec as Record<string, unknown>)?.system;
        const hooks = Array.isArray(parsed.hottest_hooks) ? parsed.hottest_hooks : [];
        
        console.log(`${LOG} ✓ Complete on attempt ${attempt}: mood=${mood}, system=${system}, hook=${hooks[0]?.start_sec}, hooks=${hooks.length}`);
        result = parsed;
        break;
      }

      // Scale up on truncation
      if (attempt < maxAttempts) {
        maxTokens = Math.min(maxTokens * 2, 12000);
        console.log(`${LOG} Retrying with max_tokens=${maxTokens}`);
      }
    }

    if (!result) {
      // Recovery: return minimal valid result
      result = {
        mood: "Unknown",
        description: "Could not analyze",
        physics_spec: {
          system: "breath",
          params: { mass: 1.0, elasticity: 0.5, damping: 0.6, brittleness: 0.2, heat: 0.3 },
          palette: ["#0a0a1a", "#2c3e50", "#8a2be2"],
          effect_pool: ["FADE_IN", "PULSE", "WAVE_SURGE", "GLITCH_FLASH"],
          logic_seed: Math.floor(Math.random() * 100000),
        },
        hottest_hooks: [],
      };
      console.log(`${LOG} Using recovery defaults`);
    }

    // Extract and normalize result fields
    const physicsSpec = result.physics_spec as Record<string, unknown> | undefined;
    const hooks = (Array.isArray(result.hottest_hooks) ? result.hottest_hooks : []) as Record<string, unknown>[];
    const worldDecision = result.world_decision as Record<string, unknown> | undefined;

    // Merge world_decision into physics_spec if present
    if (worldDecision && physicsSpec) {
      if (worldDecision.backgroundSystem) {
        (physicsSpec as Record<string, unknown>).backgroundSystem = worldDecision.backgroundSystem;
      }
      if (worldDecision.particleConfig) {
        (physicsSpec as Record<string, unknown>).particleConfig = worldDecision.particleConfig;
      }
    }

    const finalResult = {
      mood: result.mood,
      description: result.description,
      meaning: result.meaning,
      world: result.world,
      physics_spec: physicsSpec,
      scene_manifest: result.scene_manifest || result.sceneManifest || null,
      hottest_hooks: hooks,
    };

    console.log(`${LOG} Final result: mood=${finalResult.mood}, hooks=${hooks.length}, system=${physicsSpec?.system}, params=${JSON.stringify(physicsSpec?.params)}`);

    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`${LOG} error:`, error);
    return new Response(JSON.stringify({ error: "Song DNA analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
