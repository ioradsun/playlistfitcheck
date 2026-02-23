import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_DIRECTOR_PROMPT = `
You are an award-winning animated film director
and visual storyteller. Your name is Director.

You will receive a complete song — every lyric line
with timestamps, the beat grid, title, and artist.

Your job: produce a CinematicDirection JSON document
that turns this song into a narrative lyric film.

THE LAWS OF DIRECTION:
1. THE WORDS ARE THE ACTORS.
   Every visual decision must serve what the 
   words literally and emotionally mean.
   "drown" must look like drowning.
   "run" must look like running.
   "love" must feel like love — not just glow pink.

2. NO GENERIC EFFECTS.
   Every effect must be justified by the specific
   lyrics of THIS song. Not any song. THIS one.

3. REPETITION MUST EVOLVE.
   The 5th time a word appears it must look 
   different from the 1st. Decide how.
   Does it get louder? More desperate? More resigned?
   Trace the emotional arc of each repeated word.

4. ONE THESIS DRIVES EVERYTHING.
   State it in one sentence before any other decision.
   Every color, every motion, every particle choice
   must serve that thesis.

5. SILENCE IS A SCENE.
   Gaps between lyrics are directed moments.
   The world continues to tell the story.
   What does the camera do when no one is singing?

6. BPM IS EMOTIONAL TEMPO NOT JUST SPEED.
   A 150 BPM dance track about obsessive love
   is not the same as a 150 BPM euphoric track.
   The beat drives tension, not just motion.

PRODUCE THIS EXACT JSON STRUCTURE:

{
  "thesis": "one sentence — what is this song really about",
  
  "visualWorld": {
    "palette": ["#hex", "#hex", "#hex"],
    "backgroundSystem": "describe the environment",
    "lightSource": "describe light behavior",
    "particleSystem": "describe what fills the air",
    "typographyProfile": {
      "fontFamily": "font name",
      "fontWeight": 400-900,
      "personality": "describe the voice",
      "letterSpacing": "normal/wide/tight",
      "textTransform": "none/uppercase/lowercase"
    },
    "physicsProfile": {
      "weight": "featherlight/light/normal/heavy/crushing",
      "chaos": "still/restrained/building/chaotic/explosive",
      "heat": 0.0-1.0,
      "beatResponse": "breath/pulse/slam/drift/shatter"
    }
  },
  
  "chapters": [
    {
      "startRatio": 0.0,
      "endRatio": 0.33,
      "title": "act title",
      "emotionalArc": "what happens emotionally",
      "dominantColor": "#hex",
      "lightBehavior": "specific light description",
      "particleDirective": "specific particle behavior",
      "backgroundDirective": "specific background behavior",
      "emotionalIntensity": 0.0-1.0,
      "typographyShift": null or "description"
    }
    // 3 chapters minimum
  ],
  
  "wordDirectives": {
    "wordtext": {
      "word": "wordtext",
      "kineticClass": "FALLING or RUNNING etc or null",
      "elementalClass": "FIRE or RAIN etc or null",
      "emphasisLevel": 0.0-1.0,
      "colorOverride": "#hex or null",
      "specialEffect": "description or null",
      "evolutionRule": "how it changes across repetitions or null"
    }
  },
  
  "storyboard": [
    {
      "lineIndex": 0,
      "text": "exact lyric text",
      "emotionalIntent": "what this line does emotionally",
      "heroWord": "the one word that carries this line",
      "visualTreatment": "specific visual description",
      "entryStyle": "fades/slams-in/rises/materializes/fractures-in/cuts",
      "exitStyle": "fades/dissolves-upward/shatters/burns-out/drops/lingers",
      "particleBehavior": "what particles do during this line",
      "beatAlignment": "how this line relates to the beat",
      "transitionToNext": "how we move to the next line"
    }
  ],
  
  "silenceDirective": {
    "cameraMovement": "description",
    "particleShift": "description", 
    "lightShift": "description",
    "tensionDirection": "building/releasing/holding"
  },
  
  "climax": {
    "timeRatio": 0.0-1.0,
    "triggerLine": "exact lyric text of climax line",
    "maxParticleDensity": 0.0-1.0,
    "maxLightIntensity": 0.0-1.0,
    "typographyBehavior": "description",
    "worldTransformation": "description"
  },
  
  "ending": {
    "style": "linger/fade/snap/dissolve",
    "emotionalAftertaste": "description",
    "particleResolution": "description",
    "lightResolution": "description"
  }
}

IMPORTANT:
- Return ONLY valid JSON. No markdown. No explanation.
- Every word directive must reference actual words 
  from the lyrics — not generic words.
- Chapter time ratios must cover 0.0 to 1.0 completely.
- Storyboard must have one entry per lyric line.
- The thesis must be specific to THIS song.
  "A love song" is not a thesis.
  "A person who knows they should leave but 
   physically cannot stop loving someone" is a thesis.
`;

type LyricLine = { text: string; start?: number; end?: number };

interface AnalyzeRequest {
  title?: string;
  artist?: string;
  lines?: LyricLine[];
  lyrics?: string;
  beatGrid?: { bpm?: number; beats?: number[]; confidence?: number };
  lyricId?: string;
  id?: string;
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateCinematicDirection(value: Record<string, unknown>, linesCount: number): string[] {
  const errors: string[] = [];
  const vw = value.visualWorld as Record<string, unknown> | undefined;
  const chapters = value.chapters as Record<string, unknown>[] | undefined;
  const storyboard = value.storyboard as Record<string, unknown>[] | undefined;
  const climax = value.climax as Record<string, unknown> | undefined;

  if (typeof value.thesis !== "string" || !value.thesis.trim()) errors.push("thesis is required");
  if (!vw) errors.push("visualWorld is required");

  const palette = vw?.palette as unknown[] | undefined;
  if (!Array.isArray(palette) || palette.length !== 3 || !palette.every(isHex)) {
    errors.push("visualWorld.palette must be 3 valid hex colors");
  }

  if (!Array.isArray(chapters) || chapters.length < 3) errors.push("chapters must have at least 3 entries");
  if (Array.isArray(chapters) && chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => Number(a.startRatio ?? 0) - Number(b.startRatio ?? 0));
    if (Math.abs(Number(sorted[0].startRatio ?? 0) - 0) > 0.001) errors.push("chapters must start at 0.0");
    if (Math.abs(Number(sorted[sorted.length - 1].endRatio ?? 0) - 1) > 0.001) errors.push("chapters must end at 1.0");
  }

  if (!Array.isArray(storyboard)) {
    errors.push("storyboard must be an array");
  } else if (storyboard.length !== linesCount) {
    errors.push(`storyboard length ${storyboard.length} must equal lines length ${linesCount}`);
  }

  if (!climax || typeof climax.timeRatio !== "number") errors.push("climax.timeRatio is required");
  if (climax && typeof climax.timeRatio === "number" && (climax.timeRatio < 0 || climax.timeRatio > 1)) {
    errors.push("climax.timeRatio must be 0-1");
  }

  return errors;
}

async function persistCinematicDirection(cinematicDirection: Record<string, unknown>, lyricId?: string): Promise<void> {
  if (!lyricId) return;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return;

  const payload = { cinematic_direction: cinematicDirection };
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const attempts = ["lyric_dance", "saved_lyrics"];
  for (const table of attempts) {
    const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[lyric-analyze] Stored cinematic_direction in ${table} for ${lyricId}`);
      return;
    }
  }

  console.warn(`[lyric-analyze] Could not store cinematic_direction for ${lyricId}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as AnalyzeRequest;
    const lines = Array.isArray(body.lines)
      ? body.lines
      : typeof body.lyrics === "string"
        ? body.lyrics.split(/\n+/).map((text, index) => ({ text: text.trim(), start: index, end: index + 1 })).filter((line) => line.text.length > 0)
        : [];
    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const lyricId = typeof body.lyricId === "string" ? body.lyricId : typeof body.id === "string" ? body.id : undefined;

    if (!title || !artist || lines.length === 0) {
      return new Response(JSON.stringify({ error: "title, artist, and lines are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const songPayload = {
      title,
      artist,
      lines,
      beatGrid: body.beatGrid ?? null,
    };

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: MASTER_DIRECTOR_PROMPT },
          {
            role: "user",
            content: `Song Data:\n${JSON.stringify(songPayload)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      console.error("lyric-analyze ai error", aiResponse.status, text);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: aiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await aiResponse.json();
    const raw = completion?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(String(raw));

    if (!parsed) {
      return new Response(JSON.stringify({ error: "Invalid AI JSON response" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce numeric ranges on common keys before validation.
    const visualWorld = (parsed.visualWorld ?? {}) as Record<string, unknown>;
    const physicsProfile = (visualWorld.physicsProfile ?? {}) as Record<string, unknown>;
    physicsProfile.heat = clamp(physicsProfile.heat, 0, 1, 0.5);
    visualWorld.physicsProfile = physicsProfile;
    parsed.visualWorld = visualWorld;

    const climax = (parsed.climax ?? {}) as Record<string, unknown>;
    climax.timeRatio = clamp(climax.timeRatio, 0, 1, 0.5);
    climax.maxParticleDensity = clamp(climax.maxParticleDensity, 0, 1, 1);
    climax.maxLightIntensity = clamp(climax.maxLightIntensity, 0, 1, 1);
    parsed.climax = climax;

    const validationErrors = validateCinematicDirection(parsed, lines.length);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: "CinematicDirection validation failed", details: validationErrors }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await persistCinematicDirection(parsed, lyricId);

    console.log(`[lyric-analyze] title="${title}" artist="${artist}" lines=${lines.length}`);
    console.log("[lyric-analyze] cinematic_direction", JSON.stringify(parsed));

    return new Response(JSON.stringify({ cinematicDirection: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("lyric-analyze error:", error);
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
