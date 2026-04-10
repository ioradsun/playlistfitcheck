import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v3
//
// Moment-first chain of thought.
//
// AI receives: audio file + section timestamps + optional artist direction
// AI processes each moment: transcribe → design → next
// Font is one family for the whole video, chosen last.
// Each moment gets fontStyle (weight/case/spacing) for typographic performance.
// Particle is per-moment. Client resolves global particle.
// World is written last as a summary.
// AI does NOT: pick colors, moods, or any render enum
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
const SYSTEM_PROMPT = `You are a music video director. You receive the audio file and a list of timestamped moments.

For each moment, you will:
1. TRANSCRIBE — Write down the lyrics you hear at that timestamp. If unclear, describe the sound.
2. DESIGN — Based on what you just transcribed, direct the scene.

Process the moments IN ORDER. Each moment is its OWN vignette.
Do not plan ahead. Do not connect moments into one story.
Listen to what the lyrics say RIGHT NOW and build a scene from those specific words.

AFTER all moments are complete, step back and:
- Define the cinematic world that ties these vignettes together.
- Pick ONE font family for the entire lyric video.

Return ONLY valid JSON in this exact shape:

{
  "moments": [
    {
      "transcribedLyrics": "The exact words you hear. If vocals are unclear, describe the instruments and energy.",
      "action": "One sentence: what is physically happening? A person doing something, not a mood.",
      "see": "One sentence: what the camera sees. A shot description, not an atmosphere.",
      "nouns": ["2-4 concrete objects visible in this shot"],
      "heroWords": ["2-5 emotionally charged words from your transcribedLyrics, ALL CAPS"],
      "fontStyle": {
        "weight": "light | regular | bold | black",
        "case": "uppercase | lowercase | mixed",
        "spacing": "tight | normal | wide"
      },
      "particle": "One element from the PARTICLE LIST that fits this moment"
    }
  ],
  "world": "The cinematic universe these vignettes live inside — one evocative sentence, 15 words max",
  "font": "One font family from the FONT LIST for the entire lyric video"
}

PARTICLE LIST:
dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, moths, glare, glitch, fire

FONT LIST — pick ONE. Do not use fonts outside this list:
  BOLD / HIGH-IMPACT: Bebas Neue, Anton, Oswald, Archivo Black, Big Shoulders Display, Teko, Rajdhani
  CLEAN / MODERN: Space Grotesk, Montserrat, Inter, Poppins, DM Sans, Outfit, Sora
  ELEGANT / CINEMATIC: Playfair Display, DM Serif Display, Cormorant Garamond, Libre Baskerville, Lora, Crimson Text
  WARM / NOSTALGIC: Merriweather, Source Serif 4, Alegreya, Fraunces
  ETHEREAL / FLOATING: Cormorant, Raleway, Cinzel, Josefin Sans, Quicksand
  RAW / CONDENSED: Barlow Condensed, Fjalla One, Pathway Extreme, Saira Condensed
  DISPLAY / EXPRESSIVE: Fredoka, Comfortaa, Baloo 2, Righteous, Rubik

RULES FOR "transcribedLyrics":
- Write what you ACTUALLY HEAR. Do not invent lyrics.
- If you can't make out words, write what the music sounds like:
  "heavy 808s with muffled vocals" or "acoustic guitar, female voice, can't parse words"
- This is your anchor. Everything else in this moment comes from these words.

RULES FOR "action":
- A physical verb. Someone is DOING something.
  Good: "He pulls the cap off his head and holds it against his chest"
  Good: "She slides her phone across the table, screen lit with a goodbye text"
  Good: "A hand reaches up from dark water, fingers splaying wide"
  Bad: "The atmosphere feels heavy with emotion"
  Bad: "A sense of loss permeates the space"

RULES FOR "see":
- A camera shot, not a feeling.
  Good: "Close-up on his hands gripping the folded diploma, knuckles white"
  Good: "Wide shot of the parking lot emptying, one car left with headlights on"
  Bad: "moody cinematic atmosphere"
  Bad: "dark emotional environment"

RULES FOR "font":
- Chosen AFTER all moments are designed. You have heard the full song.
- Pick ONE family from the FONT LIST whose personality matches the lyrics.
- The font family is the voice. It stays constant for the entire video.

RULES FOR "fontStyle":
- Each moment gets its own styling within the chosen font family.
- The font family stays the same. The feeling changes through styling.
- Treat each moment like a different performance of the same voice.
  Quiet/intimate moments → light weight, lowercase, wide spacing
  Aggressive/anthemic moments → black weight, uppercase, tight spacing
  Neutral/mid-energy moments → regular weight, mixed case, normal spacing
  Rising tension → bold weight, uppercase, tight spacing
  Falling/release → light weight, lowercase, wide spacing

RULES FOR "world":
- Written AFTER all moments are designed. It is a summary, not a plan.
- One evocative sentence describing the visual universe these scenes share.
  Good: "A locked bedroom where intrusive thoughts rattle the door like uninvited guests"
  Good: "The last night of summer, told through hands that can't hold on"
  Bad: "dark emotional landscape"
  Bad: "cinematic urban world"

RULES FOR MOMENTS:
- One moment per timestamp provided. Match the count exactly.
- Each moment is its OWN vignette. Do not chain or connect moments.
- The energy hint — [low], [mid], [high], [rising], [falling] — shapes scale:
  Low: tight, close, intimate. One object, one light source.
  High: wide, open, overwhelming. Scale up.
  Rising: tension building — leaning forward, gripping tighter.
  Falling: release — shoulders dropping, letting go.

RULES FOR "heroWords":
- Pulled directly from your transcribedLyrics.
- The most concrete, imageable words — nouns and strong verbs, not pronouns or filler.
- ALL CAPS. 2-5 words.`;

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

interface FontStyle {
  weight: string;
  case: string;
  spacing: string;
}

interface AIResponse {
  world: string;
  font: string;
  moments: Array<{
    transcribedLyrics: string;
    action: string;
    see: string;
    nouns: string[];
    heroWords?: string[];
    fontStyle?: FontStyle;
    particle: string;
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

const VALID_WEIGHTS = ["light", "regular", "bold", "black"] as const;
const VALID_CASES = ["uppercase", "lowercase", "mixed"] as const;
const VALID_SPACINGS = ["tight", "normal", "wide"] as const;

function validateFontStyle(raw: any): FontStyle {
  const weight = VALID_WEIGHTS.includes(raw?.weight) ? raw.weight : "regular";
  const fontCase = VALID_CASES.includes(raw?.case) ? raw.case : "mixed";
  const spacing = VALID_SPACINGS.includes(raw?.spacing) ? raw.spacing : "normal";
  return { weight, case: fontCase, spacing };
}

function validate(
  raw: Record<string, any>,
  sectionCount: number,
): AIResponse {
  // World — AI writes this after all moments
  const world =
    typeof raw.world === "string" && raw.world.trim()
      ? raw.world.trim().slice(0, 150)
      : "cinematic scene";

  // Font — AI picks one after hearing everything
  let font = typeof raw.font === "string" ? raw.font.trim() : "";
  if (!font || font.length < 2 || font.length > 60) font = "Montserrat";

  let moments: AIResponse["moments"] = [];

  if (Array.isArray(raw.moments)) {
    moments = raw.moments.map((m: any) => {
      // Particle
      let particle = String(m?.particle ?? "").toLowerCase().trim();
      if (!VALID_PARTICLES.includes(particle as any)) particle = "dust";

      return {
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
        fontStyle: m?.fontStyle ? validateFontStyle(m.fontStyle) : { weight: "regular", case: "mixed", spacing: "normal" },
        particle,
      };
    });
  }

  // Pad or trim to match section count
  if (sectionCount > 0) {
    while (moments.length < sectionCount) {
      moments.push({
        transcribedLyrics: "instrumental / unclear",
        action: `Scene ${moments.length + 1} continues`,
        see: `Scene ${moments.length + 1}`,
        nouns: moments[0]?.nouns?.slice(0, 2) ?? [],
        fontStyle: { weight: "regular", case: "mixed", spacing: "normal" },
        particle: "dust",
      });
    }
    if (moments.length > sectionCount) {
      moments = moments.slice(0, sectionCount);
    }
  }

  return { world, font, moments };
}


function toClientShape(result: AIResponse, sections: AudioSectionInput[]) {
  // Particle: duration-weighted frequency
  const particleWeights = new Map<string, number>();
  for (let i = 0; i < result.moments.length; i++) {
    const dur = sections[i] ? sections[i].endSec - sections[i].startSec : 10;
    const p = result.moments[i].particle;
    particleWeights.set(p, (particleWeights.get(p) ?? 0) + dur);
  }
  let globalParticle = "dust";
  let bestWeight = -1;
  for (const [p, w] of particleWeights) {
    if (w > bestWeight) {
      bestWeight = w;
      globalParticle = p;
    }
  }

  return {
    world: result.world,
    particle: globalParticle,
    font: result.font,

    sections: result.moments.map((moment, i) => {
      return {
        sectionIndex: i,
        description: moment.action,
        see: moment.see,
        transcribedLyrics: moment.transcribedLyrics,
        nouns: moment.nouns,
        heroWords: moment.heroWords?.length ? moment.heroWords : null,
        fontStyle: moment.fontStyle ?? null,
        particle: moment.particle,
        startSec: sections[i]?.startSec ?? i * 10,
        endSec: sections[i]?.endSec ?? (i + 1) * 10,
        // Placeholders — client derives from energy analysis
        visualMood: "intimate",
        dominantColor: "#C9A96E",
        texture: moment.particle,
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
      `[cinematic-direction] v3 complete: font=${validated.font}, world="${validated.world}", moments=${validated.moments.length}`,
    );

    return new Response(
      JSON.stringify({
        cinematicDirection,
        _meta: {
          version: "v3",
          model: PRIMARY_MODEL,
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
