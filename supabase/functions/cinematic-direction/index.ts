import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v4
//
// World-first scaffold. Flash-optimized.
//
// Model generates: world, font, description, heroWords, visualMood, texture, dominantColor.
// Code derives: typographyPlan (from font), accentColor (from palette pipeline).
// Model THINKS about emotional arc but does not output it — zero downstream consumers.
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

// ── Valid enums ──────────────────────────────────────────────

const VALID_MOODS = [
  "intimate", "anthemic", "dreamy", "aggressive", "melancholy", "euphoric",
  "eerie", "vulnerable", "triumphant", "nostalgic", "defiant", "hopeful",
  "raw", "hypnotic", "ethereal", "haunted", "celestial", "noir", "rebellious",
] as const;

const VALID_TEXTURES = [
  "dust", "embers", "smoke", "rain", "snow", "stars", "fireflies", "petals",
  "ash", "crystals", "confetti", "lightning", "bubbles", "moths", "glare", "glitch", "fire",
] as const;

// SYNC REQUIREMENT: Must match FONT_MANIFEST in src/lib/typographyManifest.ts
const VALID_FONTS = [
  "Bebas Neue", "Permanent Marker", "Unbounded", "Dela Gothic One", "Oswald",
  "Barlow Condensed", "Archivo", "Montserrat", "Inter", "Sora", "Rubik",
  "Nunito", "Plus Jakarta Sans", "Bricolage Grotesque", "Playfair Display",
  "EB Garamond", "Cormorant Garamond", "DM Serif Display", "Instrument Serif",
  "Bitter", "JetBrains Mono", "Space Mono", "Caveat", "Lexend",
] as const;

// Server-side block on stop-words reaching the client.
// Without this, a bad heroWord like "THE" would score +50 in the
// client-side selectHeroWord via section-hero match, overriding the
// stop-word penalty and getting picked as the rendered hero.
const BANNED_HERO_WORDS = new Set([
  "THE","A","AN","OF","TO","FOR","AT","BY","ON","IN","FROM","WITH",
  "I","ME","MY","WE","US","OUR","YOU","HE","SHE","HIS","HER","IT","ITS","THEY","THEM","THEIR",
  "IS","ARE","WAS","WERE","BE","BEEN","AM",
  "AND","OR","BUT","SO","THAT","THIS","THESE","THOSE",
  "IM","THATS","DONT","WONT","AINT","LETS","IVE","YOURE","THEYRE",
]);

const MOOD_COLOR: Record<string, string> = {
  intimate: "#C9A96E", anthemic: "#E8632B", dreamy: "#B088F9",
  aggressive: "#4FA4D4", melancholy: "#2255AA", euphoric: "#FFD700",
  eerie: "#00BFA5", vulnerable: "#D4618C", triumphant: "#FFD700",
  nostalgic: "#A0845C", defiant: "#4FA4D4", hopeful: "#34D058",
  raw: "#A0A4AC", hypnotic: "#B088F9", ethereal: "#A8C4E0",
  haunted: "#5A6B7A", celestial: "#7B8EC4", noir: "#4A5568", rebellious: "#C44E2B",
};

const MOOD_TEXTURE: Record<string, string> = {
  intimate: "fireflies", anthemic: "embers", dreamy: "stars",
  aggressive: "smoke", melancholy: "rain", euphoric: "confetti",
  eerie: "moths", vulnerable: "dust", triumphant: "glare",
  nostalgic: "dust", defiant: "lightning", hopeful: "petals",
  raw: "ash", hypnotic: "fireflies", ethereal: "crystals",
  haunted: "smoke", celestial: "stars", noir: "smoke", rebellious: "embers",
};

// ── The prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a music video director.

STEP 1: Read all the lyrics. Identify the song's central visual world — one setting, metaphor, or universe that every scene will live inside. Think about the emotional arc (setup → tension → resolution) but do not output it separately.

STEP 2: For each timestamped moment, write one scene description inside that world, grounded in the lyrics at that timestamp.

Return ONLY valid JSON:

{
  "world": "one sentence, the cinematic universe of the song, max 15 words",
  "font": "one font from the FONT LIST below",
  "moments": [
    {
      "description": "one sentence — what the viewer SEES. Concrete, physical, grounded in the lyric.",
      "heroWords": ["1-3 ALL CAPS words from the lyric that carry visual or emotional weight. No filler (I, the, some, how, we, they)."],
      "visualMood": "one of: ${VALID_MOODS.join(', ')}",
      "texture": "one of: ${VALID_TEXTURES.join(', ')}",
      "dominantColor": "#RRGGBB — emotional color for this moment"
    }
  ]
}

FONT LIST (pick the one that matches the song's energy):
  Bebas Neue — bold movie poster | Permanent Marker — raw sharpie | Unbounded — album cover display
  Dela Gothic One — dark gothic weight | Oswald — tall authority | Barlow Condensed — industrial precision
  Archivo — tech muscle | Montserrat — clean default | Inter — invisible, words only
  Sora — soft modern | Rubik — rounded friendly | Nunito — pillowy soft
  Plus Jakarta Sans — warm contemporary | Bricolage Grotesque — indie quirky | Lexend — calm clarity
  Playfair Display — editorial drama | EB Garamond — literary warmth | Cormorant Garamond — whispered elegance
  DM Serif Display — editorial confidence | Instrument Serif — poetry elegance | Bitter — slab storytelling
  JetBrains Mono — hacker voice | Space Mono — retro-futuristic | Caveat — handwritten diary

RULES:
1. WORLD COHERENCE — Every moment belongs to the same world. The world is a universe, not a single prop. Scenes vary but the universe is consistent. No frame may belong to a different universe.
2. LYRIC ANCHORING — Every scene includes at least one image, action, or symbol from the lyrics at that timestamp. Symbolic is fine. Ignoring the lyric is not.
3. VISUAL CLARITY — Describe what the viewer literally sees. No abstract commentary. "A chrome car climbs through low clouds" not "a feeling of tension."
4. COLOR ARC — Colors should progress across the song. Different emotional beats need different color temperatures.
5. COLOR MATCHES MOOD — The dominantColor hex MUST sit in the color family of the visualMood. See COLOR FAMILIES below. Picking an in-family shade is more important than picking a "creative" one.
6. TEXTURE VARIETY — Across the whole song, try to use different textures per section. Repetition is boring. Match texture to mood but vary it where multiple sections share a mood.
7. HERO WORDS ARE CONTENT WORDS — heroWords must be concrete nouns, action verbs, or vivid adjectives. NEVER articles, prepositions, pronouns, or auxiliaries. Banned forever: THE, A, AN, OF, TO, FOR, AT, BY, IT, IS, I, MY, WE, HIS, HER, HOW, WHEN, BE, BEEN, WAS, ARE.

COLOR FAMILIES (pick a shade from the family — never outside it):
  aggressive → blood reds, deep reds, neon reds (#B0002A, #FF1744, #8B0000). Never pink or candy-red.
  anthemic → fiery oranges, amber, orange-reds (#E8632B, #FF4500, #FFB347).
  intimate → warm ambers, firelight, deep warm reds (#C9A96E, #8B3A3A, #D87C59). Never saddle brown.
  dreamy → soft lavenders, pastel pinks, pale sky blues (#B088F9, #FFB3D9, #A8C4E0).
  melancholy → muted blue-greys, steel blues, slate (#3D4E6C, #5A6B7A, #4A5A7A). Never saturated corporate blue.
  euphoric → golds, peaches, bright warm yellows (#FFD700, #FF8A00, #FFE5B4).
  eerie → desaturated green-greys, sickly yellow-greens, deep violets (#2A3D35, #6B5D34, #4B3A5A). Never mint or teal.
  vulnerable → dusty roses, plums, muted lavenders (#D4618C, #B88DA7, #A8809E).
  triumphant → golds, bright oranges, warm creams (#FFD700, #E8632B, #F5DEB3).
  nostalgic → sepia, tan, warm browns (#A0845C, #D2B48C, #8B7355).
  defiant → bold blues or saturated reds (#4FA4D4, #FF0000, #000080).
  hopeful → greens, soft yellows, sky blues (#34D058, #F5E050, #A8D8EA).
  raw → concrete greys, slate, neutral mid-greys (#A0A4AC, #6C757D, #808080). Always low saturation.
  hypnotic → deep violets, indigos, midnight blues (#4B0082, #6B21A8, #1A1F5C). Never gold or yellow.
  ethereal → mist blues, lavender mists, pale whites (#A8C4E0, #E0BBE4, #F5F5F5).
  haunted → pale slates, dim greys, muted blues (#5A6B7A, #2C3E50, #4A4A4A).
  celestial → periwinkles, midnight blues, deep indigos (#7B8EC4, #2C3E50, #4B0082).
  noir → charcoals, blue-blacks, smoky greys (#4A5568, #2D3748, #1A202C). Low saturation.
  rebellious → rusts, aggressive oranges, dark reds (#C44E2B, #FF4500, #8B0000).

EXCEPTION: if the scene has a specific in-world light source that dominates (a red exit sign, a green neon bar glow), you may pick that light's color regardless of mood — but only then.

One moment per timestamp. Match the count exactly.
Energy hints: low = tight/close, high = wide/overwhelming, rising = leaning forward, falling = letting go.`;

// ── Types ────────────────────────────────────────────────────

interface LyricLine {
  text: string;
  start?: number;
  end?: number;
}

interface AudioSectionInput {
  index: number;
  startSec: number;
  endSec: number;
  role: string;
  avgEnergy: number;
  beatDensity: number;
  lyrics: Array<{ text: string; lineIndex: number }>;
  confidence?: number;
}

interface RequestBody {
  title?: string;
  artist?: string;
  bpm?: number;
  lines?: LyricLine[];
  lyrics?: string;
  artist_direction?: string;
  audio_url?: string;
  audioSections?: AudioSectionInput[];
  words?: Array<{ word: string; start: number; end: number }>;
  mode?: "scene";
  instrumental?: boolean;
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

function unwrapNested(obj: Record<string, any>): Record<string, any> {
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    const inner = obj[keys[0]];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      if (inner.moments || inner.sections || inner.world) {
        return inner;
      }
    }
  }
  return obj;
}

function extractJson(raw: string): Record<string, any> | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    return unwrapNested(JSON.parse(cleaned));
  } catch {
    cleaned = cleaned
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F]/g, (ch) =>
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : "",
      );
    try {
      return unwrapNested(JSON.parse(cleaned));
    } catch {
      return null;
    }
  }
}

// ── Validate + transform to client contract ──────────────────

// Acceptable HSL bounds per mood. hRanges can have multiple arcs (red wraps 360°→0°).
// sMin/sMax = saturation range; lMin/lMax = lightness range.
type MoodHslBounds = {
  hRanges: Array<[number, number]>;
  sMin: number; sMax: number;
  lMin: number; lMax: number;
};

const MOOD_HSL: Record<string, MoodHslBounds> = {
  aggressive: { hRanges: [[345, 360], [0, 15]], sMin: 0.5, sMax: 1.0, lMin: 0.2, lMax: 0.55 },
  anthemic:   { hRanges: [[15, 45]],            sMin: 0.55, sMax: 1.0, lMin: 0.4, lMax: 0.65 },
  intimate:   { hRanges: [[15, 45]],            sMin: 0.3, sMax: 0.8,  lMin: 0.3, lMax: 0.65 },
  dreamy:     { hRanges: [[260, 360]],          sMin: 0.25, sMax: 0.75, lMin: 0.55, lMax: 0.85 },
  melancholy: { hRanges: [[200, 240]],          sMin: 0.1, sMax: 0.45, lMin: 0.3, lMax: 0.55 },
  euphoric:   { hRanges: [[35, 55]],            sMin: 0.6, sMax: 1.0,  lMin: 0.45, lMax: 0.75 },
  eerie: { hRanges: [[60, 180], [250, 300]], sMin: 0.05, sMax: 0.45, lMin: 0.15, lMax: 0.5 },
  vulnerable: { hRanges: [[320, 360], [0, 20]], sMin: 0.2, sMax: 0.6, lMin: 0.4, lMax: 0.7 },
  triumphant: { hRanges: [[30, 55]], sMin: 0.55, sMax: 1.0, lMin: 0.45, lMax: 0.75 },
  nostalgic: { hRanges: [[20, 45]], sMin: 0.2, sMax: 0.55, lMin: 0.3, lMax: 0.65 },
  defiant: { hRanges: [[200, 240], [0, 15]], sMin: 0.5, sMax: 1.0, lMin: 0.25, lMax: 0.6 },
  hopeful: { hRanges: [[80, 150]], sMin: 0.3, sMax: 0.9, lMin: 0.45, lMax: 0.75 },
  raw: { hRanges: [[0, 360]], sMin: 0.0, sMax: 0.2, lMin: 0.3, lMax: 0.7 },
  hypnotic: { hRanges: [[240, 290]], sMin: 0.4, sMax: 1.0, lMin: 0.2, lMax: 0.55 },
  ethereal: { hRanges: [[200, 280]], sMin: 0.1, sMax: 0.5, lMin: 0.6, lMax: 0.9 },
  haunted: { hRanges: [[200, 240]], sMin: 0.05, sMax: 0.35, lMin: 0.25, lMax: 0.55 },
  celestial: { hRanges: [[220, 270]], sMin: 0.3, sMax: 0.8, lMin: 0.25, lMax: 0.65 },
  noir: { hRanges: [[200, 240]], sMin: 0.05, sMax: 0.3, lMin: 0.15, lMax: 0.4 },
  rebellious: { hRanges: [[0, 30]], sMin: 0.5, sMax: 1.0, lMin: 0.3, lMax: 0.6 },
};

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hueInRanges(h: number, ranges: Array<[number, number]>): boolean {
  for (const [lo, hi] of ranges) {
    if (h >= lo && h <= hi) return true;
  }
  return false;
}

function validateColor(hex: string, fallbackMood: string): string {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return MOOD_COLOR[fallbackMood] || "#C9A96E";
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Tier 1: luminance bound — keep readable behind text
  const luminance = (r * 299 + g * 587 + b * 114) / 1000 / 255;
  if (luminance < 0.12 || luminance > 0.85) {
    return MOOD_COLOR[fallbackMood] || "#C9A96E";
  }

  // Tier 2: color-family check — hue + saturation + lightness must match the mood
  const bounds = MOOD_HSL[fallbackMood];
  if (!bounds) return hex; // unknown mood — accept

  const [h, s, l] = rgbToHsl(r, g, b);
  const inFamily =
    hueInRanges(h, bounds.hRanges) &&
    s >= bounds.sMin && s <= bounds.sMax &&
    l >= bounds.lMin && l <= bounds.lMax;

  if (inFamily) return hex;

  console.warn(
    `[cinematic-direction] color ${hex} out of family for mood "${fallbackMood}" ` +
    `(h=${h.toFixed(0)} s=${s.toFixed(2)} l=${l.toFixed(2)}); snapping to ${MOOD_COLOR[fallbackMood]}`
  );
  return MOOD_COLOR[fallbackMood] || "#C9A96E";
}

function validate(raw: Record<string, any>, sectionCount: number, body: RequestBody): Record<string, any> {
  // ── World ──
  const description =
    typeof raw.world === "string" && raw.world.trim()
      ? raw.world.trim().slice(0, 150)
      : "cinematic scene";

  // ── Font → typographyPlan ──
  let fontName = typeof raw.font === "string" ? raw.font.trim() : "";
  if (!fontName || !VALID_FONTS.some((f) => f.toLowerCase() === fontName.toLowerCase())) {
    fontName = "Montserrat";
  }
  const matched = VALID_FONTS.find((f) => f.toLowerCase() === fontName.toLowerCase());
  if (matched) fontName = matched;

  const typographyPlan = {
    system: "single",
    primary: fontName,
    accent: "",
    case: "sentence",
    baseWeight: "bold",
    heroStyle: "weight-shift",
    accentDensity: "low",
    sectionBehavior: {},
  };

  // ── Sections ──
  let sections: any[] = [];
  const moments = Array.isArray(raw.moments) ? raw.moments : [];

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];

    // visualMood
    let visualMood = typeof m?.visualMood === "string" ? m.visualMood.toLowerCase().trim() : "";
    if (!(VALID_MOODS as readonly string[]).includes(visualMood)) visualMood = "intimate";

    // texture — model proposes, fallback to mood lookup
    let texture = typeof m?.texture === "string" ? m.texture.toLowerCase().trim() : "";
    if (!(VALID_TEXTURES as readonly string[]).includes(texture)) {
      texture = MOOD_TEXTURE[visualMood] || "dust";
    }

    // dominantColor — model proposes, validator constrains
    const dominantColor = validateColor(m?.dominantColor, visualMood);

    // heroWords
    const heroWords = Array.isArray(m?.heroWords)
      ? Array.from(new Set(
          m.heroWords
            .filter((w: any) => typeof w === "string" && w.trim())
            .map((w: any) => w.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
            .filter((w: string) => w.length > 1 && !BANNED_HERO_WORDS.has(w))
        )).slice(0, 5)
      : [];

    // description
    let sectionDescription = typeof m?.description === "string" && m.description.trim()
      ? m.description.trim().slice(0, 200)
      : "";
    if (!sectionDescription) {
      const sectionLines = (body.lines || []).filter((l: any) => {
        if (typeof l?.start !== "number") return false;
        const sec = body.audioSections?.[i];
        if (!sec) return false;
        return l.start >= sec.startSec - 0.5 && l.start < sec.endSec + 0.5;
      });
      const excerpt = sectionLines.map((l: any) => l.text || "").join(" ").slice(0, 80);
      sectionDescription = excerpt ? `${visualMood} scene: ${excerpt}` : `${visualMood} cinematic landscape`;
    }

    sections.push({
      sectionIndex: i,
      description: sectionDescription,
      visualMood,
      dominantColor,
      texture,
      ...(heroWords.length > 0 ? { heroWords } : {}),
      ...(body.audioSections?.[i]
        ? {
            startSec: body.audioSections[i].startSec,
            endSec: body.audioSections[i].endSec,
          }
        : {}),
    });
  }

  // Pad or trim to match expected section count
  if (sectionCount > 0) {
    const FALLBACK_COLORS = ["#C9A96E", "#4FA4D4", "#D4618C", "#228844", "#B088F9", "#E8632B", "#FFD700", "#00BFA5"];
    while (sections.length < sectionCount) {
      const idx = sections.length;
      const mood = "intimate";
      sections.push({
        sectionIndex: idx,
        description: `Cinematic scene for section ${idx + 1}`,
        visualMood: mood,
        dominantColor: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
        texture: MOOD_TEXTURE[mood] || "dust",
      });
    }
    if (sections.length > sectionCount) {
      sections = sections.slice(0, sectionCount);
    }
  }

  // ── Texture variety enforcement ──
  // No single texture should dominate. Cap per-texture usage at ceil(n/3).
  // Check cap BEFORE counting; replace when over.
  if (sections.length > 3) {
    const maxPerTexture = Math.ceil(sections.length / 3);
    const textureCounts: Record<string, number> = {};

    for (const sec of sections) {
      if ((textureCounts[sec.texture] ?? 0) >= maxPerTexture) {
        const replacement = (VALID_TEXTURES as readonly string[]).find(
          (t) => t !== sec.texture && (textureCounts[t] ?? 0) < maxPerTexture,
        );
        if (replacement) sec.texture = replacement;
      }
      textureCounts[sec.texture] = (textureCounts[sec.texture] ?? 0) + 1;
    }
  }

  sections.forEach((s: any, i: number) => {
    s.sectionIndex = i;
  });

  return { description, typographyPlan, sections };
}

// ── AI call ──────────────────────────────────────────────────

async function callAI(
  apiKey: string,
  userMessage: string,
  audioBase64: string | undefined,
  model: string,
): Promise<Record<string, any>> {
  const userContent = audioBase64
    ? [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: `data:audio/mpeg;base64,${audioBase64}` } },
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

  // Primary → fallback on retryable errors
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

  // Retry once on parse failure
  if (!parsed) {
    console.warn("[cinematic-direction] parse failed, retrying. Preview:", raw.slice(0, 300));
    try {
      const retryResp = await makeRequest(model);
      const retryCompletion = await retryResp.json();
      const retryRaw = String(retryCompletion?.choices?.[0]?.message?.content ?? "");
      parsed = extractJson(retryRaw);
    } catch {
      /* swallow */
    }
    if (!parsed) throw { status: 422, message: "AI returned invalid JSON after retry" };
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
    const bpm = typeof body.bpm === "number" ? body.bpm : 0;
    const isInstrumental = !!body.instrumental;

    const lines: LyricLine[] = Array.isArray(body.lines)
      ? body.lines
      : typeof body.lyrics === "string"
        ? body.lyrics
            .split(/\n+/)
            .map((t, i) => ({ text: t.trim(), start: i, end: i + 1 }))
            .filter((l) => l.text)
        : [];

    if (!title || !artist) {
      return new Response(JSON.stringify({ error: "title and artist required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        if (!audioResp.ok) throw new Error(`audio fetch ${audioResp.status}`);
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
    const sections = body.audioSections ?? [];
    const sectionList = sections
      .map((s, i) => {
        const energy = s.avgEnergy ?? 0;
        let hint = energy < 0.35 ? "low" : energy > 0.65 ? "high" : "mid";
        const prev = i > 0 ? (sections[i - 1].avgEnergy ?? 0) : energy;
        const delta = energy - prev;
        if (delta > 0.08) hint += "+rising";
        else if (delta < -0.08) hint += "+falling";

        const role = s.role ? ` (${s.role})` : "";
        const sectionLyrics = Array.isArray(s.lyrics) && s.lyrics.length > 0
          ? s.lyrics.map((l) => l.text).join(" ").slice(0, 200)
          : "";
        const lyricLine = sectionLyrics
          ? `\n    Lyrics: "${sectionLyrics}"`
          : "\n    [instrumental]";

        return `  Moment ${i + 1} [${hint}]${role}: ${fmt(s.startSec)}–${fmt(s.endSec)}${lyricLine}`;
      })
      .join("\n\n");

    const userMessage = [
      body.artist_direction
        ? `ARTIST DIRECTION (this defines the visual world): "${body.artist_direction}"`
        : "",
      `Song: "${title}" by ${artist}`,
      bpm ? `BPM: ${bpm}` : "",
      isInstrumental ? "This is an instrumental track (no vocals)." : "",
      lines.length > 0 ? `\nFull lyrics (read first to understand the whole song):\n${lines.map((l) => l.text).join("\n")}` : "",
      sectionList ? `\nMoments to design:\n${sectionList}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // ── Call AI ──
    const rawResult = await callAI(apiKey, userMessage, audioBase64, PRIMARY_MODEL);
    const cinematicDirection = validate(rawResult, sections.length, body);

    console.log(
      `[cinematic-direction] v4 complete: font=${cinematicDirection.typographyPlan.primary}, world="${cinematicDirection.description}", sections=${cinematicDirection.sections.length}`,
    );

    return new Response(
      JSON.stringify({
        cinematicDirection,
        _meta: {
          version: "v4",
          model: PRIMARY_MODEL,
          momentCount: cinematicDirection.sections.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[cinematic-direction] error:", error);
    return new Response(JSON.stringify({ error: error.message ?? "Generation failed" }), {
      status: error.status ?? 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
