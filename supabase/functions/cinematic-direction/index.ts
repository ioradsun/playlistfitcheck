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

const SYSTEM_PROMPT = `You are a music video director. You receive the full lyrics and a list of timestamped moments for a song.

Your job has 3 phases:

PHASE 1 — WORLD INFERENCE
Read ALL the lyrics first. Before designing any moment, answer:
- What is this song about?
- What is the central metaphor, setting, or visual world?
- What is the emotional arc from start to finish?

PHASE 2 — MOMENT DESIGN
For each timestamped moment, design a scene that:
- Lives INSIDE the world you inferred in Phase 1
- Anchors to at least one concrete image, action, or symbol from the lyrics at that timestamp
- Matches its position in the emotional arc

PHASE 3 — SELF-CHECK
Before returning, verify:
- Does every moment belong to the same world?
- Does every moment connect visibly to the lyric?
- Does the sequence follow the emotional arc?
- Are any heroWords filler words (I, the, some, how)?
- Are any descriptions abstract commentary instead of visual scenes?
- Are colors monotone without purpose?
If any check fails, revise before returning.

Return ONLY valid JSON:

{
  "world": "one sentence describing the cinematic universe, max 15 words",
  "centralMetaphor": "short noun phrase naming the governing image or setting",
  "emotionalArc": ["3 to 6 emotional beats in song order"],
  "font": "one font name from the FONT LIST",
  "moments": [
    {
      "lyricSpan": "the lyric text at this timestamp (from the provided lyrics)",
      "arcBeat": "which emotionalArc beat this moment belongs to",
      "description": "one sentence — what the viewer SEES",
      "heroWords": ["1 to 3 ALL CAPS words that carry visual or emotional weight"],
      "visualMood": "one of: ${VALID_MOODS.join(', ')}",
      "texture": "one of: ${VALID_TEXTURES.join(', ')}",
      "dominantColor": "#RRGGBB — this moment's primary emotional color",
      "accentColor": "#RRGGBB — secondary highlight color"
    }
  ]
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

RULES (in priority order):

RULE 1 — WORLD COHERENCE
All moments must belong to the same world.
The world is a governing universe, not a mandatory prop.
Not every frame must show the main object.
But no frame may belong to a different universe.

RULE 2 — LYRIC ANCHORING
Each moment must include at least one concrete lyric-derived image, action, or symbol.
The scene may be symbolic. It may not ignore the lyric.
Good: lyrics say "butterflies" → glass butterflies scatter off a coaster car
Bad: lyrics say "butterflies" → chrome headphones vibrate on velvet

RULE 3 — EMOTIONAL PROGRESSION
The sequence must follow the emotional arc.
Early moments = setup. Middle = intensification. Late = resolution or transformation.

RULE 4 — VISUAL CLARITY
Descriptions must say what the viewer literally sees.
Good: "A chrome car climbs through low clouds, track curving into open sky"
Bad: "A feeling of tension builds in the atmosphere"

RULE 5 — HERO DISCIPLINE
heroWords must be meaningful — nouns and strong verbs, not pronouns or filler.
"I put a chain on the door" → ["CHAIN", "DOOR"], not ["I", "PUT"]

RULE 6 — COLOR SUPPORTS ARC
Colors should reinforce emotional progression across the song.
Different emotional beats should have perceptibly different color temperatures.

RULES FOR "world":
Written in Phase 1 before any moments. Summary of the cinematic universe.
Good: "A futuristic roller coaster ascending through storm clouds and memory"
Bad: "Dark emotional landscape"

RULES FOR "centralMetaphor":
Short noun phrase. The governing image.
Good: "futuristic roller coaster" / "collapsing boxing arena" / "underwater cathedral"
Bad: "emotional journey through memories" / "this song is about life"

RULES FOR "description":
One sentence. Physical image — people, objects, actions, light.
Must be grounded in the lyric at this timestamp.
Must live inside the world.

RULES FOR "heroWords":
From the lyric at this timestamp.
Words that carry MEANING — nouns and strong verbs.
ALL CAPS. 1-3 words per moment.

RULES FOR MOMENTS:
One moment per timestamp provided. Match the count exactly.
Each moment lives inside the world. Scenes vary but the universe is consistent.
Energy hint shapes scale:
  Low: tight, close, intimate. One object, one light source.
  High: wide, open, overwhelming. Scale up.
  Rising: tension building, leaning forward.
  Falling: release, settling, letting go.`;

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

function validateColor(hex: string, fallbackMood: string): string {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return MOOD_COLOR[fallbackMood] || "#C9A96E";
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000 / 255;
  if (luminance < 0.12 || luminance > 0.85) {
    return MOOD_COLOR[fallbackMood] || "#C9A96E";
  }
  return hex;
}

function validate(raw: Record<string, any>, sectionCount: number, body: RequestBody): Record<string, any> {
  // ── World-level fields (new in v4) ──
  const description =
    typeof raw.world === "string" && raw.world.trim()
      ? raw.world.trim().slice(0, 150)
      : "cinematic scene";

  const centralMetaphor =
    typeof raw.centralMetaphor === "string" && raw.centralMetaphor.trim()
      ? raw.centralMetaphor.trim().slice(0, 100)
      : null;

  const emotionalArc = Array.isArray(raw.emotionalArc)
    ? raw.emotionalArc
        .filter((b: any) => typeof b === "string" && b.trim())
        .map((b: any) => b.trim().toLowerCase())
        .slice(0, 6)
    : [];

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

  // ── Sections (from model "moments") ──
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

    // dominantColor — MODEL proposes, validator constrains (no more static override)
    const dominantColor = validateColor(m?.dominantColor, visualMood);

    // accentColor — new field
    const accentColor = validateColor(m?.accentColor, visualMood);

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
      const sectionLines = (body.lines || []).filter((l: any) => {
        if (typeof l?.start !== "number") return false;
        const sec = body.audioSections?.[i];
        if (!sec) return false;
        return l.start >= sec.startSec - 0.5 && l.start < sec.endSec + 0.5;
      });
      const excerpt = sectionLines.map((l: any) => l.text || "").join(" ").slice(0, 80);
      sectionDescription = excerpt ? `${visualMood} scene: ${excerpt}` : `${visualMood} cinematic landscape`;
    }

    // lyricSpan — new field
    const lyricSpan = typeof m?.lyricSpan === "string" ? m.lyricSpan.trim().slice(0, 300) : "";

    // arcBeat — new field, must be from emotionalArc
    let arcBeat = typeof m?.arcBeat === "string" ? m.arcBeat.trim().toLowerCase() : "";
    if (emotionalArc.length > 0 && !emotionalArc.includes(arcBeat)) {
      // Assign based on position in sequence
      const arcIdx = Math.min(Math.floor((i / Math.max(1, moments.length)) * emotionalArc.length), emotionalArc.length - 1);
      arcBeat = emotionalArc[arcIdx] || "";
    }

    sections.push({
      sectionIndex: i,
      description: sectionDescription,
      visualMood,
      dominantColor,
      accentColor,
      texture,
      lyricSpan,
      arcBeat,
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
      sections.push({
        sectionIndex: idx,
        description: `Cinematic scene for section ${idx + 1}`,
        visualMood: "intimate",
        dominantColor: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
        accentColor: FALLBACK_COLORS[(idx + 1) % FALLBACK_COLORS.length],
        texture: "dust",
        lyricSpan: "",
        arcBeat: emotionalArc.length > 0 ? emotionalArc[Math.min(idx, emotionalArc.length - 1)] : "",
      });
    }
    if (sections.length > sectionCount) {
      sections = sections.slice(0, sectionCount);
    }
  }

  sections.forEach((s: any, i: number) => {
    s.sectionIndex = i;
  });

  return { description, centralMetaphor, emotionalArc, typographyPlan, sections };
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
