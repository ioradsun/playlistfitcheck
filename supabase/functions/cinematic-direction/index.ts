import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v3
//
// AI directs. Code renders. Audio grounds.
//
// AI receives: audio file + section timestamps + optional artist direction
// AI returns: world + protagonist + particle + font + narrative moments
// AI listens to audio and transcribes before designing (chain-of-thought)
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
const SYSTEM_PROMPT = `You are a music video director. Your job is to create a literal, narrative short film from this song.

You are NOT a set designer. Do not build empty rooms. Do not describe atmospheres.
You ARE a director. There is a protagonist. Things happen. The story moves forward.

STEP 1 — LISTEN AND TRANSCRIBE
You are receiving the actual audio file. Listen to it closely.
For each timestamp moment, your FIRST task is to write down the lyrics you hear in "transcribedLyrics".
If vocals are distorted, layered, or it is an instrumental section, describe what the music sounds like
(e.g., "heavy distorted guitar riff" or "muffled vocals over a trap beat, can't make out words").
Your scene design MUST be based on what you transcribe. Do not guess. Do not use generic moods.

STEP 2 — CAST AND LOCATE
Define one protagonist and one world based on the full story of the lyrics.
The protagonist is whoever the lyrics come from. Give them a situation, not a label.
The world is the specific physical place this story happens — not a genre, not a vibe.
  Good protagonist: "A senior on his last night before everyone scatters"
  Good world: "A high school auditorium after the ceremony, half the chairs already folded"
  Bad: "emotional journey through loss"
  Bad: "cinematic dark world"

STEP 3 — DIRECT EACH MOMENT
For each timestamp, direct a scene from the short film.
The protagonist is DOING something — not standing in a mood.
The camera is LOOKING at something specific — not floating in atmosphere.
The moments form a continuous story. If the protagonist is at a podium in Moment 3,
they cannot be in a car in Moment 4 unless they walked out and got in.

Return ONLY valid JSON in this exact shape:

{
  "world": "the specific place this story happens — 15 words max",
  "protagonist": "who the main character is and their situation — 12 words max",
  "particle": "default ambient element from the PARTICLE LIST",
  "font": "one Google Font family name that fits the story's tone",
  "moments": [
    {
      "transcribedLyrics": "Write the exact lyrics you hear at this timestamp. If unclear, describe the sound.",
      "action": "One sentence: what is the protagonist physically doing RIGHT NOW? Not feeling — doing.",
      "see": "One sentence: what the camera sees — the shot composition, not the mood.",
      "nouns": ["2-4 concrete objects visible in this shot"],
      "heroWords": ["2-5 emotionally charged words from your transcribedLyrics, ALL CAPS"],
      "particle": "override from PARTICLE LIST if this moment demands it, otherwise omit"
    }
  ]
}

PARTICLE LIST:
dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, moths, glare, glitch, fire

RULES FOR "action":
- Must be a physical verb. The protagonist IS DOING something.
  Good: "He pulls the cap off his head and holds it against his chest, staring at the empty seats"
  Good: "She slides her phone across the table toward him, screen lit with a goodbye text"
  Good: "He raises a red cup toward the circle of friends, none of them making eye contact"
  Bad: "The atmosphere feels heavy with emotion"
  Bad: "A sense of loss permeates the space"
  Bad: "Intimate emotional energy fills the room"

RULES FOR "see":
- What the camera physically sees. A shot description, not a feeling.
  Good: "Close-up on his hands gripping the folded diploma, knuckles white"
  Good: "Wide shot of the parking lot emptying out, one car left with its headlights on"
  Good: "Over-the-shoulder shot as she walks away down the corridor, not looking back"
  Bad: "moody cinematic atmosphere"
  Bad: "emotional intimate environment"

RULES FOR "world":
- One specific place. Paintable. Filmable. Not a concept.
  Good: "A high school auditorium after graduation, half the chairs already folded up"
  Good: "The parking lot behind a community college at 11 PM, one streetlight buzzing"
  Bad: "urban emotional landscape"
  Bad: "minimalist black stage with geometric lights"

RULES FOR "font":
- A real Google Font family name. What typeface belongs on this film's poster?
  Elegant/intimate → Cormorant Garamond, Playfair Display, DM Serif Display
  Raw/urban → Space Grotesk, Bebas Neue, Oswald, Anton
  Warm/nostalgic → Libre Baskerville, Lora, DM Serif Text
  Ethereal → Cormorant, Raleway, Cinzel
  High-energy → Archivo Black, Anton, Big Shoulders Display
  Playful/warm → Fredoka, Comfortaa, Baloo 2
  These are examples, not limits. Pick any real Google Font that fits.

RULES FOR STORY CONTINUITY:
- The moments form ONE continuous story. Not separate scenes.
- If the protagonist is at a graduation podium in Moment 3, they walk off the stage in Moment 4 — they don't teleport to a beach.
- Each moment advances the story. Something changes: position, action, who they're looking at, what they're holding.
- The energy hint — [low], [mid], [high], [rising], [falling] — shapes the intensity, not the location.
  Low energy: quiet, close, still — but the protagonist is still THERE doing something.
  High energy: big gesture, fast motion, crowd, volume.
  Rising: tension building in the body — leaning forward, gripping tighter, walking faster.
  Falling: release — shoulders dropping, sitting down, letting go.

RULES FOR "heroWords":
- Pulled directly from your transcribedLyrics for that moment.
- The most concrete, imageable words — nouns and strong verbs, not pronouns or filler.
- ALL CAPS. 2-5 words per moment.

RULES FOR "transcribedLyrics":
- Write what you ACTUALLY HEAR in the audio at this timestamp.
- Do not invent lyrics. If you can't hear clearly, say so: "unclear vocals over heavy bass".
- This is your anchor. Your "action" and "heroWords" must come from these words.`;

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
  protagonist: string;
  particle: string;
  font: string;
  moments: Array<{
    transcribedLyrics: string;
    action: string;
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
      ? raw.world.trim().slice(0, 120)
      : "cinematic scene";

  // Protagonist
  const protagonist =
    typeof raw.protagonist === "string" && raw.protagonist.trim()
      ? raw.protagonist.trim().slice(0, 100)
      : "the singer";

  // Particle
  let particle = String(raw.particle ?? "").toLowerCase().trim();
  if (!VALID_PARTICLES.includes(particle as any)) {
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
      transcribedLyrics:
        typeof m?.transcribedLyrics === "string" && m.transcribedLyrics.trim()
          ? m.transcribedLyrics.trim().slice(0, 300)
          : "instrumental / unclear",
      action:
        typeof m?.action === "string" && m.action.trim()
          ? m.action.trim().slice(0, 250)
          : typeof m?.see === "string" && m.see.trim()
            ? m.see.trim().slice(0, 250)
            : "cinematic scene",
      see:
        typeof m?.see === "string" && m.see.trim()
          ? m.see.trim().slice(0, 200)
          : typeof m?.action === "string" && m.action.trim()
            ? m.action.trim().slice(0, 200)
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
        transcribedLyrics: "instrumental / unclear",
        action: `Scene ${moments.length + 1} continues`,
        see: `Scene ${moments.length + 1} of ${world}`,
        nouns: moments[0]?.nouns?.slice(0, 2) ?? [],
      });
    }
    if (moments.length > sectionCount) {
      moments = moments.slice(0, sectionCount);
    }
  }

  return { world, protagonist, particle, font, moments };
}

// ── Transform to client contract ─────────────────────────────
// In v2, mood/color/texture/typography are code-derived on the client.

function toClientShape(result: AIResponse, sections: AudioSectionInput[]) {
  return {
    world: result.world,
    protagonist: result.protagonist,
    particle: result.particle,
    font: result.font,

    sections: result.moments.map((moment, i) => {
      let texture = result.particle;
      if (moment.particle && VALID_PARTICLES.includes(moment.particle as any)) {
        texture = moment.particle;
      }

      return {
        sectionIndex: i,
        description: moment.action,
        see: moment.see,
        transcribedLyrics: moment.transcribedLyrics,
        nouns: moment.nouns,
        heroWords: moment.heroWords?.length ? moment.heroWords : null,
        startSec: sections[i]?.startSec ?? i * 10,
        endSec: sections[i]?.endSec ?? (i + 1) * 10,
        // Placeholders — client derives from energy analysis
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
      `[cinematic-direction] v3 complete: particle=${validated.particle}, world="${validated.world}", protagonist="${validated.protagonist}", moments=${validated.moments.length}`,
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
