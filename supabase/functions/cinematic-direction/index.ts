import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEMATIC_DIRECTION_PROMPT = `
You are a film director designing a cinematic lyric video.

You will receive:
1. Song lyrics organized into SECTIONS with timestamps and roles
   (computed from audio — these boundaries are facts, do not change them)
2. A listener scene — where the listener is when they hear this song

Your job:
- Design a visual world for each section
- Pick presets from the menus below
- Identify hero words and design their animations

THE LISTENER SCENE IS YOUR ANCHOR.
It is the emotional seed for everything you design.
Section descriptions should expand their world cinematically.
If no listener scene is provided, infer one from the lyrics.

You may NOT invent values outside the menus below.
Return ONLY valid JSON. No markdown. No explanation.

═══════════════════════════════════════
SONG DEFAULTS (6 picks)
═══════════════════════════════════════

Pick one value for each. These apply to every section unless overridden.

SCENE TONE:
  "dark"         — moody, cinematic
  "light"        — bright, airy
  "mixed-dawn"   — dark start → light ending (hope)
  "mixed-dusk"   — light start → dark ending (weight)
  "mixed-pulse"  — dark → light → dark (brief hope)

  Guide: predominantly heavy → "dark". Bright → "light".
  Emotional arc → use "mixed-*". Listener scene influences this.

ATMOSPHERE:
  "void"       — near-black, text floats in space
  "cinematic"  — filmic crush + vignette
  "haze"       — dreamy soft focus
  "split"      — image on one half, solid on other
  "grain"      — film grain, analog
  "wash"       — heavy color tint
  "glass"      — frosted glass, modern
  "clean"      — minimal overlay, image-forward

MOTION:
  "weighted"  — heavy, impactful
  "fluid"     — smooth, flowing
  "elastic"   — bouncy, energetic
  "drift"     — slow, contemplative
  "glitch"    — choppy, digital

TYPOGRAPHY:
  "bold-impact"      — Oswald, uppercase, power
  "clean-modern"     — Montserrat, neutral
  "elegant-serif"    — Playfair Display, soulful
  "raw-condensed"    — Barlow Condensed, gritty
  "whisper-soft"     — Nunito, gentle
  "tech-mono"        — JetBrains Mono, futuristic
  "display-heavy"    — Bebas Neue, statement
  "editorial-light"  — Cormorant Garamond, poetic

TEXTURE:
  "fire", "rain", "snow", "aurora", "smoke",
  "storm", "dust", "void", "stars", "petals"

EMOTIONAL ARC:
  "slow-burn"  — gradual build
  "surge"      — high early, bigger climax
  "collapse"   — intense start, minimal end
  "dawn"       — dark to light
  "flatline"   — monotone, meditative
  "eruption"   — quiet start, explodes mid-song

═══════════════════════════════════════
SECTIONS
═══════════════════════════════════════

You receive N sections. For EACH section, return:

REQUIRED:
- "sectionIndex": integer (must match the input section index)
- "description": vivid 1-sentence scene for background image generation,
  rooted in the listener's scene. Paint a SCENE, not effects.
    GOOD: "Rain-streaked windshield, blurred taillights ahead, wipers mid-sweep"
    BAD:  "Dark moody atmosphere with rain particles"
- "mood": 2-3 emotional keywords

OPTIONAL — override song defaults for this section:
- "motion": override
- "texture": override
- "typography": override
- "atmosphere": override

Only override when the emotional shift demands it.
Verses can stay on defaults. Choruses might shift to heavier motion.
Bridges might shift typography or texture. Don't override everything.

═══════════════════════════════════════
STORYBOARD (sparse)
═══════════════════════════════════════

For 15-25 emotionally significant lines, identify the hero moment.
NOT every line. Only lines with visual/emotional weight.

Each entry:
- "lineIndex": integer (0-based into full lyrics array)
- "heroWord": most significant word on that line (UPPERCASE)
- "entryStyle": from entries list
- "exitStyle": from exits list

ENTRIES:
  slam-down, punch-in, explode-in, snap-in, rise, materialize,
  breathe-in, drift-in, drop, plant, stomp, cut-in, whisper, bloom,
  focus-in, spin-in, tumble-in

EXITS:
  shatter, snap-out, burn-out, dissolve, drift-up, sink, cut-out,
  vanish, linger, evaporate, blur-out, spin-out,
  scatter-letters, peel-off, peel-reverse, cascade-down, cascade-up,
  gravity-fall, soar, launch, scatter-fly, melt, freeze-crack

═══════════════════════════════════════
WORD DIRECTIVES
═══════════════════════════════════════

For 15-25 emotionally significant words, design semantic animations.
Make the word's MEANING visible:

  upward motion → moves up
  destruction → breaks apart
  cold → trails frost
  spinning → rotates
  echo → ghost copies

EXIT matching:
  rain, fall, tears       → gravity-fall + letterSequence
  fly, wings, free        → soar
  rise, escape, blast     → launch
  break, scatter          → scatter-fly + letterSequence
  melt, drip              → melt
  freeze, ice, numb       → freeze-crack
  crash, shatter          → shatter or scatter-letters
  smoke, whisper          → drift-up or evaporate
  drown, sink, heavy      → sink or cascade-down

Each directive:
- "word": lowercase
- "emphasisLevel": 1-5 (1=subtle, 5=showstopper)
- "entry": from entries list
- "behavior": from behaviors list
- "exit": from exits list

Optional:
- "trail": particle trail
- "ghostTrail": true (2-4 per song, for echo/repeat/haunt words)
- "ghostDirection": "up" | "down" | "left" | "right" | "radial"
- "letterSequence": true (3-5 per song, always pair with semantic exit)
- "visualMetaphor": freeform string

BEHAVIORS:
  pulse, vibrate, float, grow, contract, flicker, orbit, lean,
  none, freeze, tilt, pendulum, pulse-focus

TRAILS:
  ember, frost, spark-burst, dust-impact, light-rays, gold-coins,
  dark-absorb, motion-trail, memory-orbs, none

═══════════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════════

{
  "sceneTone": "dark",
  "atmosphere": "cinematic",
  "motion": "weighted",
  "typography": "bold-impact",
  "texture": "smoke",
  "emotionalArc": "slow-burn",

  "sections": [
    {
      "sectionIndex": 0,
      "description": "Empty highway shoulder at 3am, hazard lights pulsing orange in fog",
      "mood": "isolated, numb"
    },
    {
      "sectionIndex": 1,
      "description": "Hands gripping the steering wheel, knuckles white, dashboard glow on skin",
      "mood": "tense, building",
      "texture": "dust"
    },
    {
      "sectionIndex": 2,
      "description": "Headlights cutting through a wall of rain, everything blurred by speed",
      "mood": "desperate, release",
      "motion": "glitch",
      "texture": "storm",
      "typography": "display-heavy"
    }
  ],

  "storyboard": [
    { "lineIndex": 0, "heroWord": "ALONE", "entryStyle": "materialize", "exitStyle": "dissolve" },
    { "lineIndex": 8, "heroWord": "DROWNING", "entryStyle": "drop", "exitStyle": "sink" }
  ],

  "wordDirectives": [
    {
      "word": "drowning",
      "emphasisLevel": 5,
      "entry": "drop",
      "behavior": "float",
      "exit": "sink",
      "trail": "frost",
      "letterSequence": true,
      "visualMetaphor": "letters sinking below an invisible waterline"
    },
    {
      "word": "fire",
      "emphasisLevel": 4,
      "entry": "explode-in",
      "behavior": "pulse",
      "exit": "burn-out",
      "trail": "ember"
    }
  ]
}

VALIDATION:
- sceneTone, atmosphere, motion, typography, texture, emotionalArc: required strings from menus
- sections: one entry per input section, each with sectionIndex + description + mood
- storyboard: 15-25 entries
- wordDirectives: array of 15-25 entries
- All enum values from the menus above only
- Do NOT include: dominantColor, colorHex, physicsProfile, cameraLanguage,
  tensionCurve, fontSize, position, scaleX, scaleY, color, glow,
  kineticClass, zoom, driftIntensity, startRatio, endRatio,
  chapters, visualWorld, beatAlignment

Return JSON only.
`;


type LyricLine = { text: string; start?: number; end?: number };

interface SceneContext {
  scene: string;
  label: string;
  timeOfDay: string;
  baseLuminance: 'dark' | 'medium' | 'light';
  colorTemperature: string;
  textStyle: 'light' | 'dark';
  fluxPromptSuffix?: string;
}

interface AudioSectionInput {
  index: number;
  startSec: number;
  endSec: number;
  durationSec?: number;
  avgEnergy?: number;
  peakEnergy?: number;
  energyDelta?: number;
  spectralCharacter?: string;
  beatDensity?: number;
  role?: string;
  lyrics?: Array<{ text?: string; startSec?: number; endSec?: number; lineIndex?: number }>;
  hasLyricRepetition?: boolean;
}

interface AnalyzeRequest {
  title?: string;
  artist?: string;
  lines?: LyricLine[];
  lyrics?: string;
  beatGrid?: { bpm?: number; beats?: number[]; confidence?: number };
  beatGridSummary?: { bpm?: number; confidence?: number; totalBeats?: number };
  songSignature?: {
    bpm?: number;
    durationSec?: number;
    tempoStability?: number;
    rmsMean?: number;
    rmsVariance?: number;
    spectralCentroidHz?: number;
    lyricDensity?: number | null;
  };
  audioSections?: AudioSectionInput[];
  lyricId?: string;
  id?: string;
  scene_context?: SceneContext | null;
  listenerScene?: string;
  systemPromptOverride?: string;
}

function extractJson(raw: string): Record<string, unknown> | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);

  // First attempt: direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fix common AI issues: trailing commas, JS comments, control chars
    cleaned = cleaned
      .replace(/\/\/[^\n]*/g, "")              // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "")        // block comments
      .replace(/,\s*([}\]])/g, "$1")           // trailing commas
      .replace(/[\x00-\x1F\x7F]/g, (ch) =>    // control characters
        ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""
      );
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // Truncation recovery: close unclosed brackets/braces
      const openBraces = (cleaned.match(/{/g) || []).length;
      const closeBraces = (cleaned.match(/}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/\]/g) || []).length;

      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        console.warn("[cinematic-direction] Detected truncated JSON, attempting recovery");
        // Remove trailing partial value (after last comma or colon)
        let repaired = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*[^}\]]*$/, "");
        // Close remaining brackets/braces
        const needBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;
        const needBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
        for (let i = 0; i < needBrackets; i++) repaired += "]";
        for (let i = 0; i < needBraces; i++) repaired += "}";
        // Clean trailing commas again after surgery
        repaired = repaired.replace(/,\s*([}\]])/g, "$1");
        try {
          return JSON.parse(repaired);
        } catch (e3) {
          console.error("[cinematic-direction] Recovery also failed:", (e3 as Error).message);
        }
      }

      console.error("[cinematic-direction] JSON parse failed after cleaning:", (e2 as Error).message);
      console.error("[cinematic-direction] First 500 chars:", cleaned.slice(0, 500));
      return null;
    }
  }
}

function validateAndCleanGeminiOutput(raw: Record<string, any>): Record<string, any> {
  if (Array.isArray(raw.storyboard)) {
    const FORBIDDEN_FIELDS = [
      "beatAlignment", "emotionalIntent", "visualTreatment",
      "particleBehavior", "transitionToNext", "dominantColor",
      "colorHex", "physicsProfile", "cameraLanguage", "tensionCurve", "text",
      "iconGlyph", "iconStyle", "iconPosition", "iconScale", "visualWorld",
    ];

    for (const entry of raw.storyboard) {
      for (const field of FORBIDDEN_FIELDS) {
        delete entry[field];
      }
    }
  }

  const VALID = {
    sceneTone: ["dark", "light", "mixed-dawn", "mixed-dusk", "mixed-pulse"],
    atmosphere: ["void", "cinematic", "haze", "split", "grain", "wash", "glass", "clean"],
    motion: ["weighted", "fluid", "elastic", "drift", "glitch"],
    typography: [
      "bold-impact", "clean-modern", "elegant-serif", "raw-condensed",
      "whisper-soft", "tech-mono", "display-heavy", "editorial-light",
    ],
    texture: ["fire", "rain", "snow", "aurora", "smoke", "storm", "dust", "void", "stars", "petals"],
    emotionalArc: ["slow-burn", "surge", "collapse", "dawn", "flatline", "eruption"],
  };

  const DEFAULTS: Record<string, string> = {
    sceneTone: "dark",
    atmosphere: "cinematic",
    motion: "fluid",
    typography: "clean-modern",
    texture: "dust",
    emotionalArc: "slow-burn",
  };

  for (const [key, validValues] of Object.entries(VALID)) {
    if (!validValues.includes(raw[key])) {
      console.warn(`[CINEMATIC] Invalid ${key}: "${raw[key]}" — falling back to "${DEFAULTS[key]}"`);
      raw[key] = DEFAULTS[key];
    }
  }


  const storyboard = raw.storyboard ?? [];
  const wordCount = Object.keys(raw.wordDirectives ?? {}).length;
  console.log(`[CINEMATIC] Storyboard: ${storyboard.length} entries, ${wordCount} word directives`);

  return raw;
}

function validateCinematicDirection(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ["sceneTone", "atmosphere", "motion", "typography", "texture", "emotionalArc"];
  for (const key of required) {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      errors.push(`${key} is required`);
    }
  }

  const chapters = value.chapters as unknown[];
  if (!Array.isArray(chapters) || chapters.length !== 3) errors.push("chapters must have exactly 3 entries");

  const storyboard = value.storyboard as unknown[];
  if (!Array.isArray(storyboard) || storyboard.length < 15 || storyboard.length > 25) {
    errors.push("storyboard must have 15-25 entries");
  }

  const wordDirectives = value.wordDirectives as Record<string, unknown> | undefined;
  const wordDirectiveCount = Object.keys(wordDirectives ?? {}).length;
  if (wordDirectiveCount < 15 || wordDirectiveCount > 25) {
    errors.push("wordDirectives must have 15-25 entries");
  }

  return errors;
}


function groupSectionsToChapters(cinematicDirection: Record<string, unknown>, sections: AudioSectionInput[], durationSec: number): void {
  const rawChapters = Array.isArray(cinematicDirection.chapters) ? cinematicDirection.chapters as Record<string, unknown>[] : [];
  if (!rawChapters.length || !sections.length) return;

  const sortedSections = [...sections]
    .filter((section) => Number.isFinite(section.startSec) && Number.isFinite(section.endSec))
    .sort((a, b) => a.startSec - b.startSec);
  if (!sortedSections.length) return;

  const chapterCount = rawChapters.length;
  const byIndex = new Map(sortedSections.map((section) => [section.index, section] as const));
  const grouped = rawChapters.map((chapter, chapterIndex) => {
    const requested = Array.isArray((chapter as any).sectionIndices)
      ? ((chapter as any).sectionIndices as number[]).filter((n) => Number.isFinite(n))
      : [];

    let sectionSlice: AudioSectionInput[];
    if (requested.length > 0) {
      const resolved = requested
        .map((idx) => byIndex.get(idx))
        .filter((section): section is AudioSectionInput => Boolean(section))
        .sort((a, b) => a.startSec - b.startSec);
      const contiguous = resolved.every((section, idx) => idx === 0 || (resolved[idx - 1].index + 1 === section.index));
      sectionSlice = contiguous && resolved.length > 0 ? resolved : [];
    } else {
      sectionSlice = [];
    }

    if (sectionSlice.length === 0) {
      const startIdx = Math.floor((chapterIndex * sortedSections.length) / chapterCount);
      const endExclusive = Math.floor(((chapterIndex + 1) * sortedSections.length) / chapterCount);
      sectionSlice = sortedSections.slice(startIdx, Math.max(startIdx + 1, endExclusive));
    }

    const sectionIndices = sectionSlice.map((section) => section.index).filter((n) => Number.isFinite(n));
    const startSec = sectionSlice[0]?.startSec ?? 0;
    const endSec = sectionSlice[sectionSlice.length - 1]?.endSec ?? durationSec;
    const totalDuration = durationSec > 0 ? durationSec : 1;

    return {
      ...chapter,
      sectionIndices,
      startSec,
      endSec,
      startRatio: startSec / totalDuration,
      endRatio: endSec / totalDuration,
    };
  });

  cinematicDirection.chapters = grouped;

  const climax = cinematicDirection.climax as Record<string, unknown> | undefined;
  if (climax && typeof climax === "object") {
    const climaxRatio = typeof climax.timeRatio === "number" ? climax.timeRatio : 0.65;
    climax.timeSec = Math.max(0, Math.min(durationSec, climaxRatio * (durationSec || 0)));
  }
}

async function persistCinematicDirection(cinematicDirection: Record<string, unknown>, lyricId?: string): Promise<boolean> {
  if (!lyricId) return false;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return false;

  const payloadWithColumns = {
    scene_tone: cinematicDirection.sceneTone,
    atmosphere: cinematicDirection.atmosphere,
    motion: cinematicDirection.motion,
    typography: cinematicDirection.typography,
    texture: cinematicDirection.texture,
    emotional_arc: cinematicDirection.emotionalArc,
    cinematic_direction: {
      chapters: cinematicDirection.chapters,
      storyboard: cinematicDirection.storyboard,
      wordDirectives: cinematicDirection.wordDirectives,
    },
  };
  const payloadJsonOnly = { cinematic_direction: cinematicDirection };
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const attempts = ["shareable_lyric_dances", "saved_lyrics"];
  for (const table of attempts) {
    for (const [label, payload] of [["columns", payloadWithColumns], ["json", payloadJsonOnly]] as const) {
      const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(`[cinematic-direction] Stored in ${table} (${label}) for ${lyricId}`);
        return true;
      }
    }
  }

  console.warn(`[cinematic-direction] Could not store for ${lyricId}`);
  return false;
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

    const sceneCtx = body.scene_context;
    const luminanceToTone: Record<string, string> = {
      dark: 'sceneTone should be "dark" or "mixed-dawn". Favor lower luminance chapters.',
      medium: 'sceneTone can be "mixed-dawn", "mixed-dusk", or "mixed-pulse".',
      light: 'sceneTone should be "light". texture should NOT be "fire" or "storm".',
    };
    const temperatureToTexture: Record<string, string> = {
      warm: 'Prefer warm textures: "fire", "aurora", "dust", "smoke".',
      cool: 'Prefer cool textures: "rain", "snow", "storm", "stars".',
      neutral: 'Texture is open — pick what fits the scene.',
    };
    const scenePrefix = sceneCtx ? `
SCENE CONTEXT — the user described WHERE they experience this song.
Ground ALL visual choices in this world. This is the film's LOCATION.

"${sceneCtx.label}" — ${sceneCtx.scene}
Time of day: ${sceneCtx.timeOfDay}

RULES FROM SCENE:
- ${luminanceToTone[sceneCtx.baseLuminance] ?? luminanceToTone.dark}
- ${temperatureToTexture[sceneCtx.colorTemperature] ?? temperatureToTexture.neutral}
- Chapter descriptions MUST place us IN this scene. If the user said "beach at sunset",
  your chapters describe the sand, the water, the sky — not abstract "moody atmosphere".
- atmosphere should match the scene's visual quality (outdoor haze → "haze", night city → "cinematic", bright day → "clean")
` : 'SCENE CONTEXT — not specified. Use the lyrics to infer the visual world.\n';

    // Derive listener scene from explicit param, scene_context, or fallback
    const listenerSceneRaw = body.listenerScene?.trim() || sceneCtx?.scene?.trim() || '';
    const listenerScenePrefix = listenerSceneRaw
      ? `Listener scene: "${listenerSceneRaw}"\n`
      : `Listener scene: not provided. Infer from lyrics and emotional tone.\n`;

    console.log(`[cinematic-direction] title="${title}" artist="${artist}" lines=${lines.length} listenerScene="${listenerSceneRaw || 'none'}" scene=${sceneCtx?.scene ?? 'none'}`);

    async function callAI(): Promise<Record<string, unknown> | null> {
      const systemContent = body.systemPromptOverride
        ? scenePrefix + "\n\n" + body.systemPromptOverride
        : scenePrefix + CINEMATIC_DIRECTION_PROMPT;
      const messages: { role: string; content: string }[] = [
        { role: "system", content: systemContent },
        { role: "user", content: `${listenerScenePrefix}Song: ${artist} — ${title}\nLyrics (${lines.length} lines):\n${lines.map((line) => line.text).join("\n")}\n\nAudio sections (fixed timing, cannot be split/merged/retimed):\n${JSON.stringify(body.audioSections ?? [])}\n\nIf audio sections exist, chapters must group adjacent section indices and preserve section timing exactly. Do not invent new sections.\n\nSong signature summary:\n${JSON.stringify(body.songSignature ?? {})}\nBeat grid summary:\n${JSON.stringify(body.beatGridSummary ?? body.beatGrid ?? {})}\n\nCreate the cinematic_direction. 3 acts. Be decisive. JSON only.` },
      ];
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          response_format: { type: "json_object" },
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("[cinematic-direction] AI error", resp.status, text);
        if (resp.status === 429) {
          throw { status: 429, message: "Rate limit exceeded, please try again later." };
        }
        if (resp.status === 402) {
          throw { status: 402, message: "Usage limit reached. Add credits in Settings → Workspace → Usage." };
        }
        throw { status: 500, message: "AI request failed" };
      }

      const completion = await resp.json();
      const rawContent = completion?.choices?.[0]?.message?.content ?? "";
      return extractJson(String(rawContent));
    }

    let parsed: Record<string, unknown> | null = null;

    try {
      parsed = await callAI();
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message ?? "AI request failed" }), {
        status: e.status ?? 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed) {
      return new Response(JSON.stringify({ error: "Invalid AI JSON response" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    parsed = validateAndCleanGeminiOutput(parsed as Record<string, any>);

    const sections = Array.isArray(body.audioSections) ? body.audioSections : [];
    const inferredDuration = Number(body.songSignature?.durationSec ?? sections[sections.length - 1]?.endSec ?? lines[lines.length - 1]?.end ?? 0);
    if (sections.length > 0) {
      groupSectionsToChapters(parsed, sections, inferredDuration);
    }

    if (Array.isArray(parsed.wordDirectives)) {
      const obj: Record<string, unknown> = {};
      for (const entry of parsed.wordDirectives as Record<string, unknown>[]) {
        const w = String(entry.word ?? "").toLowerCase().trim();
        if (w) obj[w] = entry;
      }
      parsed.wordDirectives = obj;
    } else if (!parsed.wordDirectives || typeof parsed.wordDirectives !== "object") {
      parsed.wordDirectives = {};
    }

    const validationErrors = validateCinematicDirection(parsed);
    if (validationErrors.length > 0) {
      console.warn("[cinematic-direction] Validation errors:", validationErrors);
      // Don't fail — return with warnings so debug panel can still show data
    }

    const saved = await persistCinematicDirection(parsed, lyricId);
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
