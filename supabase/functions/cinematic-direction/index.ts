import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v2
//
// AI classifies. Code selects. Audio modulates.
//
// AI receives: audio file + section timestamps + optional artist direction
// AI returns:  character + world + particle + per-moment visuals
// AI does NOT: pick fonts, colors, moods, textures, or any render enum
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

// ── Song character vocabulary ────────────────────────────────
// Typographic personalities, not genres.
// Maps to genreFit[] in client's FONT_MANIFEST.
const SONG_CHARACTERS = [
  "hard-rap", "hype-anthem", "punk-energy", "electronic-drive",
  "melodic-rap", "pop-hook", "indie-float", "afro-groove",
  "slow-romantic-rnb", "acoustic-bare", "dark-mood", "ambient-drift",
  "spoken-word", "gospel-soul", "lo-fi-chill",
] as const;

type SongCharacter = (typeof SONG_CHARACTERS)[number];

const VALID_PARTICLES = [
  "dust", "embers", "smoke", "rain", "snow", "stars", "fireflies",
  "petals", "ash", "crystals", "confetti", "lightning", "moths",
  "glare", "glitch", "fire",
] as const;

// ── The prompt (~300 tokens) ─────────────────────────────────
const SYSTEM_PROMPT = `You direct lyric videos. Listen to this song. Return JSON only.

{
  "character": "one tag from the CHARACTER LIST",
  "world": "the visual universe in 12 words or fewer",
  "particle": "the default ambient element from the PARTICLE LIST",
  "moments": [
    {
      "see": "what the camera SEES — one specific visual sentence",
      "nouns": ["2-4 concrete objects visible in the scene"],
      "particle": "override from PARTICLE LIST if this moment's scene demands it, otherwise omit"
    }
  ]
}

CHARACTER LIST (pick the closest match to what you hear):
hard-rap, hype-anthem, punk-energy, electronic-drive, melodic-rap, pop-hook,
indie-float, afro-groove, slow-romantic-rnb, acoustic-bare, dark-mood,
ambient-drift, spoken-word, gospel-soul, lo-fi-chill

PARTICLE LIST:
dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, moths, glare, glitch, fire

RULES:
- Listen to the full song before responding.
- "character" describes the song's personality from its sound and lyrics. Not its genre label.
- "world" is ONE place. Every moment lives in that same world.
- "particle" at the top level is the default ambient element present throughout the world. Rain for a rainy world. Embers for a fiery one. Dust for a desert.
- Each moment SHOULD include its own "particle" — the element in the air for THAT scene. Different scenes have different atmospheres, like shots in a film. A cemetery gate has smoke. A marble angel has moths. A candlelit tomb has fire. A foggy valley has ash. Pick the particle that fits what the camera sees in each moment. If a moment's particle is the same as the default, you can omit it, but don't be afraid of variety.
- "see" describes what a camera physically sees. Not a mood. Not adjectives.
  Good: "Phone screen lighting up on an empty passenger seat"
  Good: "Rain streaking across a bus window, city lights smearing into gold"
  Good: "Empty parking lot at 4am, one streetlight buzzing, puddles reflecting nothing"
  Bad: "intimate emotional cinematic atmosphere"
  Bad: "moody urban environment with dark tones"
- "nouns" are physical things visible in the scene, grounded in the lyrics you hear.
- One moment per timestamp section provided. Match the count exactly.
- All moments must feel like shots from the same film, not different planets.`;

// ── Types ────────────────────────────────────────────────────

interface AudioSectionInput {
  index: number;
  startSec: number;
  endSec: number;
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
  character: SongCharacter;
  world: string;
  particle: string;
  moments: Array<{
    see: string;
    nouns: string[];
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
  // Character
  let character = String(raw.character ?? "").toLowerCase().trim() as SongCharacter;
  if (!SONG_CHARACTERS.includes(character)) {
    const match = SONG_CHARACTERS.find(
      (c) => character.includes(c) || c.includes(character),
    );
    character = (match ?? "melodic-rap") as SongCharacter;
  }

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

  return { character, world, particle, moments };
}

// ── Transform to client contract ─────────────────────────────
// In v2, mood/color/texture/typography are code-derived on the client.

function toClientShape(result: AIResponse, sections: AudioSectionInput[]) {
  return {
    character: result.character,
    world: result.world,
    particle: result.particle,

    sections: result.moments.map((moment, i) => {
      let texture = result.particle;
      if (moment.particle && VALID_PARTICLES.includes(moment.particle as any)) {
        texture = moment.particle;
      }

      return {
        sectionIndex: i,
        description: moment.see,
        nouns: moment.nouns,
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
    }));

    const momentList =
      sections.length > 0
        ? sections
            .map((s, i) => `  Moment ${i + 1}: ${fmt(s.startSec)}–${fmt(s.endSec)}`)
            .join("\n")
        : "";

    const userMessage = [
      body.artist_direction
        ? `ARTIST DIRECTION (this defines the world): "${body.artist_direction}"`
        : "",
      `Song: "${title}" by ${artist}`,
      body.instrumental ? "This is an instrumental track (no vocals)." : "",
      momentList ? `\nMoments at these timestamps:\n${momentList}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // ── Call AI ──
    const rawResult = await callAI(apiKey, userMessage, audioBase64, PRIMARY_MODEL);
    const validated = validate(rawResult, sections.length);
    const cinematicDirection = toClientShape(validated, sections);

    console.log(
      `[cinematic-direction] v2 complete: character=${validated.character}, particle=${validated.particle}, world="${validated.world}", moments=${validated.moments.length}`,
    );

    return new Response(
      JSON.stringify({
        cinematicDirection,
        _meta: {
          version: "v2",
          model: PRIMARY_MODEL,
          character: validated.character,
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
