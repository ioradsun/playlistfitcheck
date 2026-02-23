import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_DIRECTOR_PROMPT_V2 = `
You are an award-winning animated film director.
You create narrative lyric films, not music videos.

THE LAWS OF DIRECTION (unchanged):
1. Words are actors
2. No generic effects
3. Repetition must evolve
4. One thesis drives everything
5. Silence is a scene
6. BPM is emotional tempo

NEW — YOU MUST ALSO PRODUCE:

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYMBOL SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every great visual story anchors emotion to
a physical metaphor. Choose:

PRIMARY SYMBOL (the dominant metaphor):
  Obsession → Water, Gravity Well, Orbit
  Anger → Fire, Cracks, Sparks
  Regret → Smoke, Dust, Ash
  Fragility → Glass, Paper, Ice
  Desire → Heat, Light Bloom
  Isolation → Fog, Void, Snow
  Chaos → Shards, Storm, Static
  Joy → Light, Bubbles, Flowers
  Loss → Falling Leaves, Dissolving

SECONDARY SYMBOL (accent/contrast)

The symbol must:
- Interact with lyrics (never decorative)
- Intensify during repetition
- React to beat changes
- Reach maximum expression at climax

Define symbol state at each story stage:
  beginning: how symbol first appears
  mutation: how it changes in the middle
  overwhelm: maximum expression at climax
  decay: how it resolves at the end

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Camera distance tracks emotional intimacy:
  ExtremeWide = detachment
  Wide = observation
  Medium = engagement
  Close = vulnerability
  ExtremeClose = confession

The camera must:
- Start at defined distance
- Move closer as tension rises
- Make an intentional choice at climax
  (rush inward OR snap to stillness)
- Resolve with meaning

Movement types: Drift, PushIn, Orbit,
  Descent, Rise, Shake, Freeze

Distance must change with emotional shifts,
not random beats.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENSION CURVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Compute tension across 4 stages:

SETUP (0-25%): establish the world
BUILD (25-60%): escalate
PEAK (60-85%): maximum intensity
RELEASE (85-100%): resolution

For each stage define:
- motionIntensity (0-1)
- particleDensity (0-1)
- lightBrightness (0-1)
- cameraMovement description
- typographyAggression (0-1)

Use these signals to compute tension:
- Repetition density (repeated words = tension)
- Beat density (beats per second)
- Lyrical markers (stutters, caps, ellipsis)
- Emotional escalation words

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHOT PROGRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each line gets a shot type:
  FloatingInWorld — text exists in the world
  EmergingFromSymbol — text forms from symbol
  SubmergedInSymbol — text seen through symbol
  FragmentedBySymbol — symbol breaks text apart
  ReflectedInSymbol — text seen in reflection
  ConsumedBySymbol — symbol absorbs the text
  AloneInVoid — text isolated, world disappears

Rules:
- Never repeat same shot consecutively 3x
- Repetition must escalate shot intensity
- Climax uses different shot than opening
- Ending shot type reflects decay style

━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED JSON OUTPUT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return the complete CinematicDirection JSON
with these additional fields:

"symbolSystem": {
  "primary": "Water",
  "secondary": "Gravity",
  "beginningState": "description",
  "middleMutation": "description",
  "climaxOverwhelm": "description",
  "endingDecay": "description",
  "interactionRules": [
    "words appear as if submerged",
    "letters drip on strong beats"
  ]
},

"cameraLanguage": {
  "openingDistance": "Wide",
  "closingDistance": "ExtremeClose",
  "movementType": "Descent",
  "climaxBehavior": "rushes inward",
  "distanceByChapter": [
    {"chapterIndex": 0, "distance": "Wide",
     "movement": "slow drift"},
    {"chapterIndex": 1, "distance": "Medium",
     "movement": "descent"},
    {"chapterIndex": 2, "distance": "ExtremeClose",
     "movement": "freeze"}
  ]
},

"tensionCurve": [
  {
    "stage": "Setup",
    "startRatio": 0,
    "endRatio": 0.25,
    "motionIntensity": 0.3,
    "particleDensity": 0.4,
    "lightBrightness": 0.5,
    "cameraMovement": "slow drift",
    "typographyAggression": 0.2
  },
  {
    "stage": "Build",
    "startRatio": 0.25,
    "endRatio": 0.60,
    "motionIntensity": 0.6,
    "particleDensity": 0.6,
    "lightBrightness": 0.4,
    "cameraMovement": "descent",
    "typographyAggression": 0.5
  },
  {
    "stage": "Peak",
    "startRatio": 0.60,
    "endRatio": 0.85,
    "motionIntensity": 0.95,
    "particleDensity": 0.9,
    "lightBrightness": 0.8,
    "cameraMovement": "rush inward",
    "typographyAggression": 0.9
  },
  {
    "stage": "Release",
    "startRatio": 0.85,
    "endRatio": 1.0,
    "motionIntensity": 0.3,
    "particleDensity": 0.2,
    "lightBrightness": 0.3,
    "cameraMovement": "freeze",
    "typographyAggression": 0.2
  }
],

"shotProgression": [
  {
    "lineIndex": 0,
    "shotType": "FloatingInWorld",
    "description": "words drift in calm water"
  },
  {
    "lineIndex": 3,
    "shotType": "SubmergedInSymbol",
    "description": "text seen through water"
  }
  // one entry per line
]

Return ONLY valid JSON. No markdown. No explanation.
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

  const attempts = ["shareable_lyric_dances", "saved_lyrics"];
  for (const table of attempts) {
    const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[cinematic-direction] Stored in ${table} for ${lyricId}`);
      return;
    }
  }

  console.warn(`[cinematic-direction] Could not store for ${lyricId}`);
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

    console.log(`[cinematic-direction] title="${title}" artist="${artist}" lines=${lines.length}`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: MASTER_DIRECTOR_PROMPT_V2 },
          {
            role: "user",
            content: `Song Data:\n${JSON.stringify(songPayload)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      console.error("[cinematic-direction] AI error", aiResponse.status, text);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
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

    // Enforce numeric ranges
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
      console.warn("[cinematic-direction] Validation errors:", validationErrors);
      // Don't fail — return with warnings so debug panel can still show data
    }

    await persistCinematicDirection(parsed, lyricId);

    console.log(`[cinematic-direction] ✓ Generated for "${title}" by "${artist}"`);

    return new Response(JSON.stringify({ cinematicDirection: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cinematic-direction] error:", error);
    return new Response(JSON.stringify({ error: "Cinematic direction generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
