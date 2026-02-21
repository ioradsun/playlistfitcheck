import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DNA_PROMPT = `ROLE: Universal Music & Physics Orchestrator (v6.0)

TASK: Analyze the full audio track, beat grid, and timestamped lyrics to extract the "Song DNA" and define a deterministic "Physics Spec" for the entire track.

1. ADAPTIVE HOOK ANCHOR (8–12s, Bar-Aligned)

Identify the single primary bar-aligned segment representing the track's definitive "Hottest Hook."

Rules: Must be 8.000–12.000s, bar-aligned, and capture the peak production lift without cutting off lyrical phrases.

Evaluation Priority: 1. Production lift, 2. Lyrical repetition, 3. Melodic peak.

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

4. CREATIVE DICTIONARY (Intelligence Layer)

Scan the full song lyrics and assign modifiers from the strict dictionary below.

Semantic Tags (Max 5): FIRE, ICE, GHOST, MACHINE, HEART, FALL, RISE, WATER, LIGHT, DARK.

Line Mods (Per-line overrides): GHOST_FADE (opacity/blur), HEAT_SPIKE (heat boost), FREEZE_2F (velocity lock), RGB_SPLIT_4F (glitch).

Word Marks (Max 6 total for song): POP (scale), SHAKE (vibration), GLITCH (jitter), GLOW (bloom).

5. FULL-LENGTH SCALABILITY (The Pool Rule)

To support a full-song visualizer without JSON bloat:

Effect Pool: Provide 4–6 effect_keys matching the song's arc (e.g., SHATTER_IN, TUNNEL_RUSH, PULSE_BLOOM).

Logic Seed: Provide an integer logic_seed. The engine uses this to procedurally sequence the pool across all lyrics.

Hook Lock: The lines within the hottest_hook window MUST use the HOOK_FRACTURE effect.

OUTPUT — Valid JSON only, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "duration_sec": 10.000, "confidence": 0.00, "justification": "..." },
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

// Runtime prompt fetcher — checks ai_prompts table, falls back to hardcoded default
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, artist, lyrics, audioBase64, format, beatGrid } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;

    let parsed: any;

    if (hasAudio) {
      // ── Audio + Lyrics mode: full Song DNA via Gemini with audio ──
      const mimeMap: Record<string, string> = {
        wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
        flac: "audio/flac", ogg: "audio/ogg", webm: "audio/webm",
      };
      const ext = format && mimeMap[format] ? format : "mp3";
      const mimeType = mimeMap[ext] || "audio/mpeg";

      const userContent: any[] = [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
      ];

      // Build text instruction with optional beat grid context
      let textInstruction = "";
      if (beatGrid?.bpm) {
        textInstruction += `[Beat Grid Context] Detected BPM: ${beatGrid.bpm} (confidence: ${beatGrid.confidence?.toFixed?.(2) ?? "N/A"}). Use this as ground truth for tempo.\n\n`;
      }
      if (lyrics) {
        textInstruction += `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return only the JSON schema specified.`;
      } else {
        textInstruction += "Analyze this audio. Return only the JSON schema specified.";
      }
      userContent.push({ type: "text", text: textInstruction });

      console.log(`[song-dna] Audio mode: ~${(audioBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB, format: ${ext}, beatGrid: ${beatGrid ? `${beatGrid.bpm}bpm` : "none"}`);

      const dnaPrompt = await getDnaPrompt();
      console.log(`[song-dna] Prompt source: ${dnaPrompt.includes("ADAPTIVE HOOK ANCHOR") ? "v2-adaptive" : "v1-legacy"}, length: ${dnaPrompt.length}`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: dnaPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          max_tokens: 2000,
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

      // Robust JSON extraction
      let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error("No JSON in response");
      let jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
        .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
        .replace(/[\x00-\x1F\x7F]/g, ""); // strip control chars

      try { parsed = JSON.parse(jsonStr); } catch { parsed = {}; }

      // Detect truncation: if physics_spec.params is missing, log warning
      const hasParams = parsed?.physics_spec?.params && Object.keys(parsed.physics_spec.params).length > 0;
      if (!hasParams) {
        console.warn("[song-dna] WARNING: physics_spec.params missing or empty — possible truncation");
        console.warn(`[song-dna] Raw response length: ${raw.length}, ends with: "${raw.slice(-100)}"`);
      }

      console.log(`[song-dna] Audio analysis complete: mood=${parsed.mood}, hook=${parsed.hottest_hook?.start_sec ?? "none"}, duration=${parsed.hottest_hook?.duration_sec ?? "none"}, conf=${parsed.hottest_hook?.confidence ?? "none"}, system=${parsed.physics_spec?.system ?? "none"}, params=${JSON.stringify(parsed.physics_spec?.params ?? {})}`);
      console.log(`[song-dna] Raw AI response: ${raw.slice(0, 500)}`);

    } else {
      // ── Lyrics-only mode: text analysis ──
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
