import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v2
//
// AI classifies. Code selects. Audio modulates.
//
// AI receives: audio file + section timestamps + optional artist direction
// AI returns: world + particle + font + per-moment visuals
// AI does NOT: pick colors, moods, textures, or any render enum
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

const VALID_PARTICLES = [
  "dust", "embers", "smoke", "rain", "snow", "stars", "fireflies",
  "petals", "ash", "crystals", "confetti", "lightning", "moths",
  "glare", "glitch", "fire",
] as const;

// ── The prompt (~300 tokens) ─────────────────────────────────
const SYSTEM_PROMPT = `You are a visual set designer for a music lyric video.

Your job is not to describe the music — it is to build the world the lyrics will dance inside.
Think of yourself as the person who designs the stage before the performance begins.
The lyrics are the performance. Your sets are what the audience sees behind them.

STEP 1 — LISTEN AND TRANSCRIBE
Before designing anything, listen to the full song. Follow the lyrics closely.
Understand the story being told: who is speaking, what happened, what they feel, where it ends.
The lyrics are your script. The moments you design must serve that story.

STEP 2 — DESIGN THE WORLD
Choose one world — a single visual universe this whole song lives inside.
It should feel like it was always there, waiting for these lyrics.
Be specific. Be surprising. Avoid the obvious.

STEP 3 — SET EACH STAGE
For each timestamp moment provided, design the specific set — what is physically present right now.
Each moment should grow from the one before it, like scenes in a short film.
The world does not restart between moments. It deepens, shifts, reveals.
Let the energy level guide the scale: quiet moments are intimate and close, high-energy moments open up.
Let the lyrics guide the imagery: what the singer is saying at that moment should be visible in the set.

Return only valid JSON in this exact shape:

{
  "world": "the visual universe in 12 words or fewer — be specific, not generic",
  "particle": "the default ambient element from the PARTICLE LIST",
  "font": "one Google Font family name that matches the song's energy and mood",
  "moments": [
    {
      "see": "one sentence: what is physically on stage right now — what the camera sees",
      "nouns": ["2-4 concrete objects visible in this scene, pulled from the lyrics"],
      "heroWords": ["2-5 words — the emotionally charged or lyrically significant words in this moment, all caps"],
      "particle": "override from PARTICLE LIST if this moment's atmosphere demands it, otherwise omit"
    }
  ]
}

PARTICLE LIST:
dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, moths, glare, glitch, fire

RULES FOR "see":
- One sentence. What the camera physically sees. No mood words. No adjectives like "moody" or "cinematic."
- It must be something that could actually be built on a stage or filmed on a set.
- It should feel like it belongs to the lyrics playing at that moment.
- It should feel different from the moment before — the set evolved, the light shifted, something changed.
  Good: "A pay phone off the hook, receiver swinging, fluorescent light flickering overhead"
  Good: "Rooftop at golden hour, city sprawl below, one lawn chair facing nowhere"
  Good: "Bathtub full of black water, single candle on the ledge, moths circling the flame"
  Bad: "emotional intimate atmosphere"
  Bad: "dark moody urban environment"

RULES FOR "world":
- One place. Specific enough to paint. Not a genre, not a vibe.
  Good: "Late-night laundromat on the edge of a city that forgot you"
  Good: "Abandoned carnival frozen in the last week of summer"
  Bad: "urban emotional landscape"
  Bad: "cinematic dark world"

RULES FOR "font":
- A real Google Font family name. Look at your world description and ask:
  what typeface belongs on the poster for this film?
  Elegant/intimate worlds → Cormorant Garamond, Playfair Display, DM Serif Display
  Raw/urban worlds → Space Grotesk, Bebas Neue, Oswald, Anton
  Warm/nostalgic worlds → Libre Baskerville, Lora, DM Serif Text
  Ethereal/drifting worlds → Cormorant, Raleway, Cinzel
  High-energy/kinetic worlds → Archivo Black, Anton, Big Shoulders Display
  Playful/warm worlds → Fredoka, Comfortaa, Baloo 2
  These are examples, not limits. Pick any real Google Font that fits the world.

RULES FOR MOMENTS:
- One moment per timestamp provided. Match the count exactly.
- Each moment is its own scene. Do NOT chain or build from the previous moment.
  The world sets the tone. The lyrics set the image.
- For each moment, listen to what the lyrics are literally saying at that timestamp
  and let those words drive the visual. If the lyric says "Nissan spinning" — show a car.
  If the lyric says "flying to our private island" — show open sky and water.
  The set should feel like a direct visual response to the words, not a continuation of the previous shot.
- Read the energy hint — [low], [mid], [high], [rising], [falling] — and let it shape the scale.
  Low energy: tight, close, intimate. One object. One light source.
  High energy: wide, open, overwhelming. Scale up.
  Rising: tension building — the set has anticipation in it.
  Falling: release — the set is opening up or settling.
- "heroWords" are pulled from the lyrics at that timestamp.
  They should correspond to the most concrete, imageable words in the lyric — not abstractions.`;

// ── Types ────────────────────────────────────────────────────

interface AudioSectionInput {
  index: number;
  startSec: number;
  endSec: number;
  /** "low" | "mid" | "high" | "rising" | "falling" */
  energyHint?: string;
}

interface RequestBody {
  title?: string;
  artist?: string;
  artist_direction?: string;
  audio_url?: string;
  audioSections?: AudioSectionInput[];
  instrumental?: boolean;
  mode?: "scene";
}

interface AIResponse {
  world: string;
  particle: string;
  font: string;
  moments: Array<{
    see: string;
    nouns: string[];
    heroWords?: string[];
    particle?: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 120000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extractJson(raw: string): Record<string, any> | null {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F]/g, (ch) =>
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : "",
      );
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

// ── Validation ───────────────────────────────────────────────

function validate(
  raw: Record<string, any>,
  sectionCount: number,
): AIResponse {
  // World
  const world =
    typeof raw.world === "string" && raw.world.trim()
      ? raw.world.trim().slice(0, 100)
      : "cinematic scene";

  // Particle
  let particle = String(raw.particle ?? "").toLowerCase().trim();
  if (!VALID_PARTICLES.includes(particle as any)) {
    // Infer from world keywords
    const wl = world.toLowerCase();
    if (/rain|storm|drizzle|wet|puddle/.test(wl)) particle = "rain";
    else if (/fire|flame|burn|ember/.test(wl)) particle = "embers";
    else if (/snow|ice|frost|winter|cold/.test(wl)) particle = "snow";
    else if (/smoke|haze|fog|mist|club/.test(wl)) particle = "smoke";
    else if (/star|sky|night|moon|cosmic/.test(wl)) particle = "stars";
    else if (/forest|field|meadow|summer/.test(wl)) particle = "fireflies";
    else if (/flower|petal|garden|bloom/.test(wl)) particle = "petals";
    else particle = "dust";
  }

  // Font
  let font = typeof raw.font === "string" ? raw.font.trim() : "";
  if (!font || font.length < 2 || font.length > 60) {
    font = "Montserrat";
  }

  // Moments
  let moments: AIResponse["moments"] = [];
  if (Array.isArray(raw.moments)) {
    moments = raw.moments.map((m: any) => ({
      see:
        typeof m?.see === "string" && m.see.trim()
          ? m.see.trim().slice(0, 200)
          : "cinematic scene",
      nouns: Array.isArray(m?.nouns)
        ? m.nouns.filter((n: any) => typeof n === "string").slice(0, 6)
        : [],
      heroWords: Array.isArray(m?.heroWords)
        ? m.heroWords
            .filter((w: any) => typeof w === "string" && w.trim())
            .map((w: any) => w.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
            .filter((w: string) => w.length > 1)
            .slice(0, 5)
        : undefined,
      particle:
        typeof m?.particle === "string" ? m.particle.trim().toLowerCase() : undefined,
    }));
  }

  // Pad or trim to match section count
  if (sectionCount > 0) {
    while (moments.length < sectionCount) {
      moments.push({
        see: `Scene ${moments.length + 1} of ${world}`,
        nouns: moments[0]?.nouns?.slice(0, 2) ?? [],
      });
    }
    if (moments.length > sectionCount) {
      moments = moments.slice(0, sectionCount);
    }
  }

  return { world, particle, font, moments };
}

// ── Transform to client contract ─────────────────────────────
// In v2, mood/color/texture/typography are code-derived on the client.

function toClientShape(result: AIResponse, sections: AudioSectionInput[]) {
  return {
    world: result.world,
    particle: result.particle,
    font: result.font,

    sections: result.moments.map((moment, i) => {
      let texture = result.particle;
      if (moment.particle && VALID_PARTICLES.includes(moment.particle as any)) {
        texture = moment.particle;
      }

      return {
        sectionIndex: i,
        description: moment.see,
        nouns: moment.nouns,
        heroWords: moment.heroWords?.length ? moment.heroWords : null,
        startSec: sections[i]?.startSec ?? i * 10,
        endSec: sections[i]?.endSec ?? (i + 1) * 10,
        // Placeholders — client derives from energy analysis in v2
        visualMood: "intimate",
        dominantColor: "#C9A96E",
        texture,
      };
    }),
  };
}

// ── Main AI call ─────────────────────────────────────────────

async function callAI(
  apiKey: string,
  userMessage: string,
  audioBase64: string | undefined,
  model: string,
): Promise<Record<string, any>> {
  const userContent = audioBase64
    ? [
        { type: "text", text: userMessage },
        {
          type: "image_url",
          image_url: { url: `data:audio/mpeg;base64,${audioBase64}` },
        },
      ]
    : userMessage;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const makeRequest = async (m: string): Promise<Response> => {
    const resp = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: m, messages, max_completion_tokens: 4000 }),
      },
      120000,
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[cinematic-direction] AI error ${resp.status}: ${text.slice(0, 200)}`);
      throw {
        status: resp.status,
        message: resp.status === 429 ? "Rate limited" : `AI failed (${resp.status})`,
      };
    }
    return resp;
  };

  // Try primary, fallback on retryable errors
  let resp: Response;
  try {
    resp = await makeRequest(model);
  } catch (error: any) {
    const status = error?.status ?? 500;
    if (model !== FALLBACK_MODEL && (status === 429 || status >= 500)) {
      console.warn(`[cinematic-direction] primary failed (${status}), trying fallback`);
      await new Promise((r) => setTimeout(r, 1500));
      resp = await makeRequest(FALLBACK_MODEL);
    } else {
      throw error;
    }
  }

  const completion = await resp.json();
  const raw = String(completion?.choices?.[0]?.message?.content ?? "");
  let parsed = extractJson(raw);

  // Retry once if parse failed
  if (!parsed) {
    console.warn("[cinematic-direction] parse failed, retrying. Preview:", raw.slice(0, 300));
    try {
      const retryResp = await makeRequest(model);
      const retryCompletion = await retryResp.json();
      const retryRaw = String(retryCompletion?.choices?.[0]?.message?.content ?? "");
      parsed = extractJson(retryRaw);
    } catch {
      // Swallow retry failure
    }
    if (!parsed) {
      throw { status: 422, message: "AI returned invalid JSON after retry" };
    }
  }

  return parsed;
}

// ── Serve ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();

    if (!title || !artist) {
      return new Response(
        JSON.stringify({ error: "title and artist required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.mode !== "scene") {
      return new Response(
        JSON.stringify({ error: "mode parameter required. Use mode: scene" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch audio for multimodal ──
    let audioBase64: string | undefined;
    if (body.audio_url && !body.audio_url.startsWith("blob:")) {
      try {
        const audioResp = await fetchWithTimeout(body.audio_url, { method: "GET" }, 15_000);
        if (!audioResp.ok) throw new Error(`audio fetch failed (${audioResp.status})`);
        const audioBytes = new Uint8Array(await audioResp.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < audioBytes.length; i += chunkSize) {
          binary += String.fromCharCode(
            ...audioBytes.subarray(i, Math.min(i + chunkSize, audioBytes.length)),
          );
        }
        audioBase64 = btoa(binary);
        console.log(`[cinematic-direction] audio attached (${audioBytes.length} bytes)`);
      } catch (err) {
        console.warn("[cinematic-direction] audio fetch failed, continuing without:", err);
      }
    }

    // ── Build user message ──
    const sections = (body.audioSections ?? []).map((s, i) => ({
      index: s.index ?? i,
      startSec: s.startSec,
      endSec: s.endSec,
      energyHint: s.energyHint,
    }));

    const momentList =
      sections.length > 0
        ? sections
            .map((s, i) => {
              const hint = s.energyHint ? ` [${s.energyHint}]` : "";
              return `  Moment ${i + 1}${hint}: ${fmt(s.startSec)}–${fmt(s.endSec)}`;
            })
            .join("\n")
        : "";

    const userMessage = [
      body.artist_direction
        ? `ARTIST DIRECTION (this defines the world): "${body.artist_direction}"`
        : "",
      `Song: "${title}" by ${artist}`,
      body.instrumental ? "This is an instrumental track (no vocals)." : "",
      momentList
        ? `\nFor each moment, listen to the lyrics at that exact timestamp and let them drive the image. Each moment is independent — do not build on the previous one.\n\nMoments:\n${momentList}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // ── Call AI ──
    const rawResult = await callAI(apiKey, userMessage, audioBase64, PRIMARY_MODEL);
    const validated = validate(rawResult, sections.length);
    const cinematicDirection = toClientShape(validated, sections);

    console.log(
      `[cinematic-direction] v2 complete: particle=${validated.particle}, world="${validated.world}", moments=${validated.moments.length}`,
    );

    return new Response(
      JSON.stringify({
        cinematicDirection,
        _meta: {
          version: "v2",
          model: PRIMARY_MODEL,
          particle: validated.particle,
          momentCount: validated.moments.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[cinematic-direction] error:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "Generation failed" }),
      {
        status: error.status ?? 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
