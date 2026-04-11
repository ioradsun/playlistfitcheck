import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════
// Cinematic Direction v3
//
// Moment-first chain of thought.
//
// AI receives: audio file + section timestamps + optional lyrics + artist direction
// AI processes each moment: transcribe → design → next
// AI picks: description, visualMood, texture per moment. Font + world last.
// Code derives: dominantColor, typographyPlan details, all render enums.
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

const SYSTEM_PROMPT = `You are a music video director. You receive the audio file and a list of timestamped moments.

For each moment, you will:
1. TRANSCRIBE — Write down the lyrics you hear at that timestamp. If vocals are unclear or it is instrumental, describe the sound ("heavy 808s", "acoustic guitar picking", "muffled vocals over trap beat").
2. DESIGN — Based on what you just transcribed, direct the scene.

Process the moments IN ORDER. Each moment is its OWN vignette.
Do not plan ahead. Do not connect moments into one story.
Listen to what the lyrics say RIGHT NOW and build a scene from those specific words.

AFTER all moments are complete, step back and:
- Define the cinematic world that ties these vignettes together.
- Pick ONE font for the entire lyric video, now that you've heard the full song.

Return ONLY valid JSON:

{
  "moments": [
    {
      "transcribedLyrics": "The exact words you hear, or describe the sound if unclear",
      "description": "One sentence: what the viewer SEES — a specific scene, not a mood",
      "visualMood": "one of: intimate, anthemic, dreamy, aggressive, melancholy, euphoric, eerie, vulnerable, triumphant, nostalgic, defiant, hopeful, raw, hypnotic, ethereal, haunted, celestial, noir, rebellious",
      "texture": "one of: dust, embers, smoke, rain, snow, stars, fireflies, petals, ash, crystals, confetti, lightning, bubbles, moths, glare, glitch, fire",
      "heroWords": ["2-5 words from your transcribedLyrics that carry the MEANING of this moment, ALL CAPS"]
    }
  ],
  "world": "The cinematic universe these vignettes live inside — one evocative sentence, 15 words max",
  "font": "One font name from the FONT LIST"
}

FONT LIST:
  Bebas Neue — Movie posters. Bold declarations. All-caps condensed impact.
  Permanent Marker — Sharpie on a mirror. Bathroom wall poetry.
  Unbounded — Geometric blob display. Album cover energy.
  Dela Gothic One — Heavy blackletter. Gothic weight. Dark anthems.
  Oswald — Tall and tight. Campaign posters. Authority with edge.
  Barlow Condensed — Industrial precision. Blueprint energy.
  Archivo — Geometric muscle. Tech-forward power.
  Montserrat — Reliable workhorse. Use only when nothing else fits.
  Inter — Invisible design. Let the words speak.
  Sora — Soft-edged modern. New-gen energy.
  Rubik — Rounded corners. Friendly weight.
  Nunito — Pillowy soft. Gentle confessions.
  Plus Jakarta Sans — Contemporary warmth and sophistication.
  Bricolage Grotesque — Quirky proportions. Indie character.
  Lexend — Calm clarity. Readability-first.
  Playfair Display — High-contrast editorial drama.
  EB Garamond — Classical literary warmth.
  Cormorant Garamond — Whispered elegance.
  DM Serif Display — Warm editorial confidence.
  Instrument Serif — Refined poetry-forward elegance.
  Bitter — Slab-serif storytelling warmth.
  JetBrains Mono — Hacker/system voice.
  Space Mono — Retro-futuristic mission-control voice.
  Caveat — Diary confessions and handwritten intimacy.

RULES FOR "transcribedLyrics":
- Write what you ACTUALLY HEAR. Do not invent lyrics.
- This is your anchor. The description must respond to these words.

RULES FOR "description":
- One sentence. What the viewer SEES. A specific scene grounded in the lyrics.
- Must be a physical image — people, objects, actions, light, weather.
  Good: "Rain streaks across a bus window as city lights blur into long smears of gold"
  Good: "A hand reaches up from dark water, fingers splaying wide"
  Bad: "emotional intimate atmosphere"
  Bad: "dark moody urban environment"

RULES FOR "world":
- Written AFTER all moments. A summary, not a plan.
  Good: "A locked bedroom where intrusive thoughts rattle the door like uninvited guests"
  Good: "The last night of summer, told through hands that can't hold on"
  Bad: "dark emotional landscape"

RULES FOR "font":
- Chosen AFTER all moments. You have heard the full song.
- The font is the voice of the text. It will appear over every scene.
- Think: genre culture, vocal delivery, emotional weight.

RULES FOR "heroWords":
- Pulled directly from your transcribedLyrics for this moment.
- The words that carry the MEANING — nouns and strong verbs, not pronouns or filler.
- "I put a chain on the door" → ["CHAIN", "DOOR"], not ["I", "PUT"]
- ALL CAPS. 2-5 words per moment.

RULES FOR MOMENTS:
- One moment per timestamp provided. Match the count exactly.
- Each moment is its OWN vignette. Do not chain or connect.
- Energy hint shapes scale. Examples: [low], [mid], [high], [mid+rising], [high+falling].
  Low: tight, close, intimate. One object, one light source.
  High: wide, open, overwhelming. Scale up.
  Rising: tension building — leaning forward, gripping tighter, anticipation.
  Falling: release — shoulders dropping, letting go, settling.`;

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

function validate(raw: Record<string, any>, sectionCount: number, body: RequestBody): Record<string, any> {
  // World
  const description =
    typeof raw.world === "string" && raw.world.trim()
      ? raw.world.trim().slice(0, 150)
      : "cinematic scene";

  // Font → build backward-compatible typographyPlan
  let fontName = typeof raw.font === "string" ? raw.font.trim() : "";
  if (!fontName || !VALID_FONTS.some((f) => f.toLowerCase() === fontName.toLowerCase())) {
    fontName = "Montserrat";
  }
  // Normalize casing to match manifest
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

  // Sections
  let sections: any[] = [];
  const moments = Array.isArray(raw.moments) ? raw.moments : [];

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];

    // visualMood
    let visualMood = typeof m?.visualMood === "string" ? m.visualMood.toLowerCase().trim() : "";
    if (!(VALID_MOODS as readonly string[]).includes(visualMood)) visualMood = "intimate";

    // texture
    let texture = typeof m?.texture === "string" ? m.texture.toLowerCase().trim() : "";
    if (!(VALID_TEXTURES as readonly string[]).includes(texture)) {
      texture = MOOD_TEXTURE[visualMood] || "dust";
    }

    // dominantColor — derived from mood, not AI
    const dominantColor = MOOD_COLOR[visualMood] || "#C9A96E";

    // heroWords
    const heroWords = Array.isArray(m?.heroWords)
      ? m.heroWords
          .filter((w: any) => typeof w === "string" && w.trim())
          .map((w: any) => w.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter((w: string) => w.length > 1)
          .slice(0, 5)
      : [];

    // description
    let sectionDescription = typeof m?.description === "string" && m.description.trim()
      ? m.description.trim().slice(0, 200)
      : "";
    if (!sectionDescription) {
      // Fallback: use lyrics from body if available
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
    });
  }

  // Pad or trim to match expected section count
  if (sectionCount > 0) {
    const FALLBACK_COLORS = ["#C9A96E", "#4FA4D4", "#D4618C", "#228844", "#B088F9", "#E8632B", "#FFD700", "#00BFA5"];
    while (sections.length < sectionCount) {
      const idx = sections.length;
      sections.push({
        sectionIndex: idx,
        description: `Cinematic scene for section ${idx + 1}`,
        visualMood: "intimate",
        dominantColor: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
        texture: "dust",
      });
    }
    if (sections.length > sectionCount) {
      sections = sections.slice(0, sectionCount);
    }
  }

  // Renumber sectionIndex sequentially
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
        // Compute delta from previous section for rising/falling
        const prev = i > 0 ? (sections[i - 1].avgEnergy ?? 0) : energy;
        const delta = energy - prev;
        if (delta > 0.08) hint += "+rising";
        else if (delta < -0.08) hint += "+falling";
        return `  Moment ${i + 1} [${hint}]: ${fmt(s.startSec)}–${fmt(s.endSec)}`;
      })
      .join("\n");

    const userMessage = [
      body.artist_direction
        ? `ARTIST DIRECTION (this defines the visual world): "${body.artist_direction}"`
        : "",
      `Song: "${title}" by ${artist}`,
      bpm ? `BPM: ${bpm}` : "",
      isInstrumental ? "This is an instrumental track (no vocals)." : "",
      lines.length > 0 ? `\nLyrics:\n${lines.map((l) => l.text).join("\n")}` : "",
      sectionList ? `\nMoments:\n${sectionList}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // ── Call AI ──
    const rawResult = await callAI(apiKey, userMessage, audioBase64, PRIMARY_MODEL);
    const cinematicDirection = validate(rawResult, sections.length, body);

    console.log(
      `[cinematic-direction] v3 complete: font=${cinematicDirection.typographyPlan.primary}, world="${cinematicDirection.description}", sections=${cinematicDirection.sections.length}`,
    );

    return new Response(
      JSON.stringify({
        cinematicDirection,
        _meta: {
          version: "v3",
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
