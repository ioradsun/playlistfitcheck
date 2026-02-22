import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DNA_PROMPT = `ROLE: Universal Music & Physics Orchestrator (v6.0)

TASK: Analyze the full audio track, beat grid, and timestamped lyrics to extract the "Song DNA" and define a deterministic "Physics Spec" for the entire track.

CRITICAL RULES:
- Your response MUST be complete, valid JSON. Do NOT truncate.
- The "hottest_hooks" array MUST contain EXACTLY 2 hook objects. NOT 1. ALWAYS 2. This is the MOST IMPORTANT rule.
- The two hooks MUST be non-overlapping and feel genuinely different from each other.
- The lexicon MUST be TINY: EXACTLY 5-8 line_mods and 3-6 word_marks. NO MORE.
- Do NOT generate a line_mod for every lyric line. Only pick the 5-8 most impactful moments.
- If the song has 100+ lines, you still output ONLY 5-8 line_mods total. This is NON-NEGOTIABLE.

1. TOP 2 HOOK ANCHORS (8–12s Each, Bar-Aligned)

Identify the TWO most distinct, bar-aligned segments representing the track's hottest hooks. They MUST be non-overlapping.

Rules: Each must be 8.000–12.000s, bar-aligned, and capture a production lift without cutting off lyrical phrases. The two hooks should feel genuinely different (e.g. a melodic chorus vs. a rhythmic bridge, or a verse climax vs. a drop).

Evaluation Priority: 1. Production lift, 2. Lyrical repetition, 3. Melodic peak.

Give each hook a short editorial "label" — a 2-4 word evocative name (e.g. "The Drop", "The Confession", "Midnight Surge"). The label should capture the hook's emotional character.

2. SONG IDENTITY & MEANING

Description: One evocative sentence (max 15 words) with sonic texture and emotional descriptors.

Mood: Single dominant emotional driver (e.g., euphoric, brooding).

Meaning: Theme (2–4 words), Summary (2–3 sentences), and Imagery (2–3 physically renderable objects/scenes).

3. PHYSICS SPEC (The Laws of Nature)

Generate a physics_spec object that maps acoustic energy to a visual physics simulation.

System Selection:
- Aggressive/Distorted → fracture (mass: 0.8, brittleness: 0.9)
- Anthemic/Powerful → pressure (mass: 2.0, elasticity: 0.4)
- Melancholic/Slow → breath (mass: 1.2, damping: 0.8)
- Dark/Haunted → combustion (heat: 0.5)
- Smooth/Flowing → orbit (mass: 1.0, elasticity: 0.7)

Material Constants: Assign specific values for mass, elasticity, damping, brittleness, and heat.

4. CREATIVE DICTIONARY (Intelligence Layer — KEEP COMPACT)

Semantic Tags (Max 5): FIRE, ICE, GHOST, MACHINE, HEART, FALL, RISE, WATER, LIGHT, DARK.

Line Mods (Max 8 total): GHOST_FADE, HEAT_SPIKE, FREEZE_2F, RGB_SPLIT_4F.

Word Marks (Max 6 total): POP, SHAKE, GLITCH, GLOW.

5. FULL-LENGTH SCALABILITY (The Pool Rule)

Effect Pool: Provide 4–6 effect_keys.

Logic Seed: Provide an integer logic_seed.

Hook Lock: Lines within the hottest_hook window MUST use the HOOK_FRACTURE effect.

OUTPUT — Valid JSON only, no markdown, no explanation:
{
  "hottest_hooks": [
    { "start_sec": 0.000, "duration_sec": 10.000, "confidence": 0.95, "justification": "...", "label": "The Drop" },
    { "start_sec": 45.000, "duration_sec": 10.000, "confidence": 0.85, "justification": "...", "label": "The Confession" }
  ],
  "description": "...",
  "mood": "...",
  "meaning": {
    "theme": "...",
    "summary": "...",
    "imagery": ["...", "..."]
  },
  "physics_spec": {
    "system": "fracture",
    "params": { "mass": 0.8, "elasticity": 0.5, "damping": 0.6, "brittleness": 0.9, "heat": 0.2 },
    "palette": ["hsl(0, 100%, 50%)", "hsl(240, 100%, 50%)", "hsl(0, 0%, 100%)"],
    "effect_pool": ["SHATTER_IN", "GLITCH_FLASH", "WAVE_SURGE"],
    "logic_seed": 12345,
    "lexicon": {
      "semantic_tags": [{"tag": "FIRE", "strength": 0.8}],
      "line_mods": [{ "t_lyric": 12, "mods": ["HEAT_SPIKE"] }],
      "word_marks": [{ "t_lyric": 12, "wordIndex": 3, "mark": "GLITCH" }]
    }
  }
}`;

const LYRICS_ONLY_PROMPT = `You are a music analyst. Given song lyrics, provide analysis. Return ONLY valid JSON with these keys:
- description: A single evocative sentence (max 15 words) describing what this song sounds and feels like
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic")
- meaning: { theme (2-4 words), summary (2-3 sentences), imagery (array of 2-3 short strings) }

No markdown, no explanation — just JSON.`;

async function getDnaPrompt(): Promise<string> {
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && sbKey) {
      const res = await fetch(`${sbUrl}/rest/v1/ai_prompts?slug=eq.lyric-hook&select=prompt`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].prompt) return rows[0].prompt;
      }
    }
  } catch {}
  return DEFAULT_DNA_PROMPT;
}

/** Try to parse JSON from a potentially messy AI response */
function extractJson(raw: string): any | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;
  let jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
    .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "");
  try { return JSON.parse(jsonStr); } catch { return null; }
}

/** Check if parsed result has the critical fields — requires 2 hooks */
function isComplete(parsed: any, includeHooks: boolean): boolean {
  const hooks = parsed?.hottest_hooks;
  const hasTwoHooks = Array.isArray(hooks) && hooks.length >= 2
    && hooks[0]?.start_sec != null && hooks[1]?.start_sec != null
    && hooks[0]?.label && hooks[1]?.label;
  // Also accept legacy single hook on final fallback (handled elsewhere)
  return !!(
    (!includeHooks || hasTwoHooks) &&
    parsed?.physics_spec?.system &&
    parsed?.physics_spec?.params &&
    Object.keys(parsed.physics_spec.params).length >= 3 &&
    parsed?.mood
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, artist, lyrics, audioBase64, format, beatGrid, includeHooks } = await req.json();
    const hooksEnabled = includeHooks !== false;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;

    let parsed: any;

    if (hasAudio) {
      const mimeMap: Record<string, string> = {
        wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
        flac: "audio/flac", ogg: "audio/ogg", webm: "audio/webm",
      };
      const ext = format && mimeMap[format] ? format : "mp3";
      const mimeType = mimeMap[ext] || "audio/mpeg";

      const userContent: any[] = [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
      ];

      let textInstruction = "";
      if (beatGrid?.bpm) {
        textInstruction += `[Beat Grid Context] Detected BPM: ${beatGrid.bpm} (confidence: ${beatGrid.confidence?.toFixed?.(2) ?? "N/A"}). Use this as ground truth for tempo.\n\n`;
      }
      if (lyrics) {
        textInstruction += hooksEnabled
          ? `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return ONLY the JSON schema specified. MANDATORY: "hottest_hooks" must be an array of EXACTLY 2 hooks, not 1. Each hook needs a unique "label". lexicon.line_mods must have EXACTLY 5-8 entries total.`
          : `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return ONLY the JSON schema specified. DO NOT return any hook fields (no hottest_hook and no hottest_hooks).`; 
      } else {
        textInstruction += hooksEnabled
          ? "Analyze this audio. Return ONLY the JSON schema specified. MANDATORY: \"hottest_hooks\" must be an array of EXACTLY 2 hooks, not 1. Each hook needs a unique \"label\". lexicon.line_mods must have EXACTLY 5-8 entries total."
          : "Analyze this audio. Return ONLY the JSON schema specified. DO NOT return any hook fields (no hottest_hook and no hottest_hooks).";
      }
      userContent.push({ type: "text", text: textInstruction });

      console.log(`[song-dna] Audio mode: ~${(audioBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB, format: ${ext}, beatGrid: ${beatGrid ? `${beatGrid.bpm}bpm` : "none"}`);

      const dnaPrompt = await getDnaPrompt();
      console.log(`[song-dna] Prompt source: ${dnaPrompt.includes("ADAPTIVE HOOK ANCHOR") ? "v2-adaptive" : "v1-legacy"}, length: ${dnaPrompt.length}`);

      // Try up to 2 attempts with increasing token limits
      const attempts = [
        { max_tokens: 4096, model: "google/gemini-2.5-flash" },
        { max_tokens: 6000, model: "google/gemini-2.5-flash" },
      ];

      for (let attempt = 0; attempt < attempts.length; attempt++) {
        const { max_tokens, model } = attempts[attempt];
        console.log(`[song-dna] Attempt ${attempt + 1}: model=${model}, max_tokens=${max_tokens}`);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: dnaPrompt },
              { role: "user", content: userContent },
            ],
            temperature: 0.1,
            max_tokens,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const t = await response.text();
          console.error("AI gateway error:", response.status, t);
          throw new Error("AI gateway error");
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content ?? "";
        const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";

        console.log(`[song-dna] Response length: ${raw.length}, finish_reason: ${finishReason}`);

        parsed = extractJson(raw);

        if (parsed && isComplete(parsed, hooksEnabled)) {
          // Normalize legacy format
          if (hooksEnabled && parsed.hottest_hook && !parsed.hottest_hooks) {
            parsed.hottest_hooks = [parsed.hottest_hook];
          }
          // If AI returned only 1 hook, synthesize a second from a different region
          if (hooksEnabled && Array.isArray(parsed.hottest_hooks) && parsed.hottest_hooks.length === 1) {
            const first = parsed.hottest_hooks[0];
            const firstStart = Number(first.start_sec) || 60;
            const secondStart = firstStart > 60 ? Math.max(firstStart - 40, 10) : firstStart + 30;
            parsed.hottest_hooks.push({
              start_sec: secondStart,
              duration_sec: 10,
              confidence: Math.max((Number(first.confidence) || 0.8) - 0.15, 0.5),
              justification: "Secondary hook region (auto-detected)",
              label: "The Other Side",
            });
            console.log(`[song-dna] Synthesized 2nd hook at ${secondStart}s (1st was at ${firstStart}s)`);
          }
          const firstHook = parsed.hottest_hooks?.[0] || parsed.hottest_hook;
          console.log(`[song-dna] ✓ Complete on attempt ${attempt + 1}: mood=${parsed.mood}, system=${parsed.physics_spec.system}, hook=${firstHook?.start_sec}, hooks=${parsed.hottest_hooks?.length ?? 1}`);
          break;
        }

        // If truncated (finish_reason=length or missing fields), retry with more tokens
        console.warn(`[song-dna] Attempt ${attempt + 1} incomplete (finish_reason=${finishReason}). ${attempt < attempts.length - 1 ? "Retrying..." : "Using partial result."}`);
        console.warn(`[song-dna] Raw ends with: "${raw.slice(-120)}"`);

        if (attempt === attempts.length - 1) {
          // If we got partial data, try to salvage what we can
          if (!parsed) parsed = {};
          
          // Ensure critical fields exist with fallback defaults
          if (!parsed.mood) parsed.mood = "determined";
          if (!parsed.description) parsed.description = "A dynamic track with powerful energy.";
          if (!parsed.meaning) parsed.meaning = { theme: "Expression", summary: "An expressive musical piece.", imagery: ["sound waves", "stage lights"] };
          if (hooksEnabled && !parsed.hottest_hooks && !parsed.hottest_hook) {
            // Estimate hooks as fallback
            parsed.hottest_hooks = [
              { start_sec: 60, duration_sec: 10, confidence: 0.80, justification: "Estimated hook region", label: "The Hook" },
              { start_sec: 90, duration_sec: 10, confidence: 0.70, justification: "Estimated secondary hook", label: "The Bridge" },
            ];
          }
          // Normalize legacy hottest_hook → hottest_hooks array
          if (hooksEnabled && parsed.hottest_hook && !parsed.hottest_hooks) {
            parsed.hottest_hooks = [parsed.hottest_hook];
          }
          // Ensure we always have 2 hooks in salvage path
          if (hooksEnabled && Array.isArray(parsed.hottest_hooks) && parsed.hottest_hooks.length === 1) {
            const first = parsed.hottest_hooks[0];
            const firstStart = Number(first.start_sec) || 60;
            const secondStart = firstStart > 60 ? Math.max(firstStart - 40, 10) : firstStart + 30;
            parsed.hottest_hooks.push({
              start_sec: secondStart,
              duration_sec: 10,
              confidence: Math.max((Number(first.confidence) || 0.8) - 0.15, 0.5),
              justification: "Secondary hook region (auto-detected)",
              label: "The Other Side",
            });
            console.log(`[song-dna] Salvage: synthesized 2nd hook at ${secondStart}s (1st at ${firstStart}s)`);
          }
          if (!parsed.physics_spec || !parsed.physics_spec.system) {
            parsed.physics_spec = {
              system: "pressure",
              params: { mass: 1.5, elasticity: 0.5, damping: 0.6, brittleness: 0.3, heat: 0.4 },
              palette: ["hsl(280, 80%, 60%)", "hsl(320, 90%, 55%)", "hsl(0, 0%, 95%)"],
              effect_pool: ["SHATTER_IN", "GLITCH_FLASH", "WAVE_SURGE", "STATIC_RESOLVE"],
              logic_seed: 42,
              lexicon: { semantic_tags: [{ tag: "RISE", strength: 0.7 }], line_mods: [], word_marks: [] },
            };
          }
          console.log(`[song-dna] Using salvaged/fallback result: mood=${parsed.mood}, system=${parsed.physics_spec.system}, hooks=${parsed.hottest_hooks?.length}`);
        }
      }

      // Final normalization: ensure hottest_hooks array exists
      if (hooksEnabled && parsed?.hottest_hook && !parsed?.hottest_hooks) {
        parsed.hottest_hooks = [parsed.hottest_hook];
      }

      if (!hooksEnabled && parsed) {
        delete parsed.hottest_hook;
        delete parsed.hottest_hooks;
      }

      console.log(`[song-dna] Final result: mood=${parsed?.mood ?? "none"}, hooks=${parsed?.hottest_hooks?.length ?? 0}, system=${parsed?.physics_spec?.system ?? "none"}, params=${JSON.stringify(parsed?.physics_spec?.params ?? {})}`);

    } else {
      // ── Lyrics-only mode ──
      if (!lyrics || typeof lyrics !== "string") {
        return new Response(JSON.stringify({ error: "Missing lyrics or audio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[song-dna] Lyrics-only mode`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: LYRICS_ONLY_PROMPT },
            { role: "user", content: `Song: "${title || "Unknown"}" by ${artist || "Unknown Artist"}${beatGrid?.bpm ? `\n[Beat Grid] BPM: ${beatGrid.bpm}` : ""}\n\nLyrics:\n${lyrics}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      try { parsed = JSON.parse(raw); } catch { parsed = { summary: raw }; }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lyric-analyze error:", e);
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
