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
  rooted in the listener's scene
- "mood": 2-3 emotional keywords

OPTIONAL — override song defaults for this section:
- "motion": override
- "texture": override
- "typography": override
- "atmosphere": override

═══════════════════════════════════════
STORYBOARD (sparse)
═══════════════════════════════════════

For 15-25 emotionally significant lines, identify the hero moment.
Each entry:
- "lineIndex": integer (0-based into full lyrics array)
- "heroWord": most significant word on that line (UPPERCASE)
- "entryStyle": from entries list
- "exitStyle": from exits list

═══════════════════════════════════════
WORD DIRECTIVES
═══════════════════════════════════════

For 15-25 emotionally significant words, design semantic animations.
Each directive:
- "word": lowercase
- "emphasisLevel": 1-5
- "entry": from entries list
- "behavior": from behaviors list
- "exit": from exits list

Optional:
- "trail": particle trail
- "ghostTrail": true
- "ghostDirection": "up" | "down" | "left" | "right" | "radial"
- "letterSequence": true
- "visualMetaphor": freeform string

Return JSON only.
`;

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
}

interface SceneContext {
  scene: string;
  label: string;
  timeOfDay: string;
  baseLuminance: "dark" | "medium" | "light";
  colorTemperature: string;
}

interface RequestBody {
  title?: string;
  artist?: string;
  lines?: LyricLine[];
  lyrics?: string;
  lyricId?: string;
  id?: string;
  listenerScene?: string;
  scene_context?: SceneContext | null;
  audioSections?: AudioSectionInput[];
}

const ENUMS = {
  sceneTone: ["dark", "light", "mixed-dawn", "mixed-dusk", "mixed-pulse"],
  atmosphere: ["void", "cinematic", "haze", "split", "grain", "wash", "glass", "clean"],
  motion: ["weighted", "fluid", "elastic", "drift", "glitch"],
  typography: [
    "bold-impact",
    "clean-modern",
    "elegant-serif",
    "raw-condensed",
    "whisper-soft",
    "tech-mono",
    "display-heavy",
    "editorial-light",
  ],
  texture: ["fire", "rain", "snow", "aurora", "smoke", "storm", "dust", "void", "stars", "petals"],
  emotionalArc: ["slow-burn", "surge", "collapse", "dawn", "flatline", "eruption"],
  entries: [
    "slam-down", "punch-in", "explode-in", "snap-in", "rise", "materialize", "breathe-in", "drift-in",
    "drop", "plant", "stomp", "cut-in", "whisper", "bloom", "focus-in", "spin-in", "tumble-in",
  ],
  exits: [
    "shatter", "snap-out", "burn-out", "dissolve", "drift-up", "sink", "cut-out", "vanish", "linger",
    "evaporate", "blur-out", "spin-out", "scatter-letters", "peel-off", "peel-reverse", "cascade-down",
    "cascade-up", "gravity-fall", "soar", "launch", "scatter-fly", "melt", "freeze-crack",
  ],
  behaviors: [
    "pulse", "vibrate", "float", "grow", "contract", "flicker", "orbit", "lean", "none", "freeze", "tilt",
    "pendulum", "pulse-focus",
  ],
  trails: [
    "ember", "frost", "spark-burst", "dust-impact", "light-rays", "gold-coins", "dark-absorb", "motion-trail",
    "memory-orbs", "none",
  ],
} as const;

const DEFAULTS: Record<string, string> = {
  sceneTone: "dark",
  atmosphere: "cinematic",
  motion: "fluid",
  typography: "clean-modern",
  texture: "dust",
  emotionalArc: "slow-burn",
};

interface ValidationResult {
  ok: boolean;
  errors: string[];
  value: Record<string, any>;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildUserMessage(
  title: string,
  artist: string,
  lines: LyricLine[],
  listenerScene: string,
  audioSections?: AudioSectionInput[],
): string {
  let msg = "";

  msg += listenerScene
    ? `Listener scene: "${listenerScene}"\n\n`
    : "Listener scene: not provided. Infer from lyrics.\n\n";

  msg += `Song: ${artist} — ${title}\n\n`;

  if (audioSections && audioSections.length > 0) {
    msg += `SECTIONS (${audioSections.length} sections — boundaries are facts, do not change):\n\n`;
    for (const s of audioSections) {
      msg += `Section ${s.index}: ${fmt(s.startSec)}–${fmt(s.endSec)} | ${s.role}\n`;
      const cap = s.lyrics.slice(0, 8);
      if (cap.length > 0) {
        for (const l of cap) msg += `  "${l.text}"\n`;
        if (s.lyrics.length > 8) msg += `  ... (${s.lyrics.length - 8} more lines)\n`;
      } else {
        msg += "  [instrumental]\n";
      }
      msg += "\n";
    }
  } else {
    msg += `Lyrics (${lines.length} lines):\n`;
    msg += lines.map((l) => l.text).join("\n");
    msg += "\n\n";
  }

  msg += "Return cinematic_direction. JSON only.";
  return msg;
}

function resolveListenerScene(body: RequestBody): string {
  return body.listenerScene?.trim() || body.scene_context?.scene?.trim() || "";
}

function buildScenePrefix(ctx: SceneContext | null | undefined): string {
  if (!ctx) return "";

  const luminanceHint: Record<string, string> = {
    dark: 'Favor sceneTone "dark" or "mixed-dawn".',
    medium: 'sceneTone can be any "mixed-*" variant.',
    light: 'Favor sceneTone "light". Avoid "fire" and "storm" textures.',
  };

  const tempHint: Record<string, string> = {
    warm: "Prefer warm textures: fire, aurora, dust, smoke.",
    cool: "Prefer cool textures: rain, snow, storm, stars.",
    neutral: "Texture is open.",
  };

  return `
SCENE CONTEXT — ground ALL choices in this world.
"${ctx.label}" — ${ctx.scene}
Time: ${ctx.timeOfDay}
${luminanceHint[ctx.baseLuminance] ?? ""}
${tempHint[ctx.colorTemperature] ?? ""}
`;
}

function extractJson(raw: string): Record<string, any> | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
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
      .replace(/[\x00-\x1F\x7F]/g, (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""));

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function validate(raw: Record<string, any>, sectionCount: number): ValidationResult {
  const errors: string[] = [];
  const v = { ...raw };

  for (const key of ["sceneTone", "atmosphere", "motion", "typography", "texture", "emotionalArc"] as const) {
    const allowed = ENUMS[key] as readonly string[];
    if (!allowed.includes(v[key])) {
      errors.push(`Invalid ${key}: "${v[key]}"`);
      v[key] = DEFAULTS[key];
    }
  }

  if (!Array.isArray(v.sections)) {
    errors.push("sections must be an array");
    v.sections = [];
  } else {
    if (v.sections.length !== sectionCount) {
      errors.push(`Expected ${sectionCount} sections, got ${v.sections.length}`);
    }
    for (const s of v.sections) {
      if (typeof s.description !== "string" || !s.description.trim()) {
        errors.push(`Section ${s.sectionIndex}: missing description`);
      }
      for (const field of ["motion", "texture", "typography", "atmosphere"] as const) {
        if (s[field] !== undefined && !(ENUMS[field] as readonly string[]).includes(s[field])) {
          errors.push(`Section ${s.sectionIndex}: invalid ${field} "${s[field]}"`);
          delete s[field];
        }
      }
    }
  }

  if (!Array.isArray(v.storyboard)) {
    errors.push("storyboard must be an array");
    v.storyboard = [];
  } else if (v.storyboard.length < 10 || v.storyboard.length > 30) {
    errors.push(`storyboard has ${v.storyboard.length} entries (want 15-25)`);
  }

  if (!Array.isArray(v.wordDirectives)) {
    if (v.wordDirectives && typeof v.wordDirectives === "object") {
      v.wordDirectives = Object.values(v.wordDirectives);
    } else {
      errors.push("wordDirectives must be an array");
      v.wordDirectives = [];
    }
  }

  if (v.wordDirectives.length < 10 || v.wordDirectives.length > 30) {
    errors.push(`wordDirectives has ${v.wordDirectives.length} entries (want 15-25)`);
  }

  for (const wd of v.wordDirectives) {
    if (wd.entry && !(ENUMS.entries as readonly string[]).includes(wd.entry)) {
      errors.push(`Word "${wd.word}": invalid entry "${wd.entry}"`);
      wd.entry = "materialize";
    }
    if (wd.exit && !(ENUMS.exits as readonly string[]).includes(wd.exit)) {
      errors.push(`Word "${wd.word}": invalid exit "${wd.exit}"`);
      wd.exit = "dissolve";
    }
    if (wd.behavior && !(ENUMS.behaviors as readonly string[]).includes(wd.behavior)) {
      wd.behavior = "none";
    }
    if (wd.trail && !(ENUMS.trails as readonly string[]).includes(wd.trail)) {
      wd.trail = "none";
    }

    if (typeof wd.emphasisLevel === "number") {
      wd.emphasisLevel = Math.min(5, Math.max(1, Math.round(wd.emphasisLevel)));
    } else {
      wd.emphasisLevel = 3;
    }
  }

  const FORBIDDEN = [
    "dominantColor", "colorHex", "physicsProfile", "cameraLanguage", "tensionCurve", "fontSize", "position",
    "scaleX", "scaleY", "color", "glow", "kineticClass", "zoom", "driftIntensity", "startRatio", "endRatio",
    "chapters", "visualWorld", "beatAlignment",
  ];
  for (const key of FORBIDDEN) delete v[key];

  return { ok: errors.length === 0, errors, value: v };
}

async function callWithRetry(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  sectionCount: number,
): Promise<Record<string, any>> {
  const callAI = async (messages: Array<{ role: string; content: string }>) => {
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
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[cinematic-direction] AI error", resp.status, text);
      throw { status: resp.status, message: resp.status === 429 ? "Rate limited" : "AI request failed" };
    }

    const completion = await resp.json();
    const raw = String(completion?.choices?.[0]?.message?.content ?? "");
    const finishReason = completion?.choices?.[0]?.finish_reason ?? "unknown";
    console.log(`[cinematic-direction] AI response: ${raw.length} chars, finish_reason: ${finishReason}`);
    if (finishReason === "length") {
      console.warn("[cinematic-direction] Response truncated by token limit!");
    }
    return extractJson(raw);
  };

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const first = await callAI(messages);
  if (!first) throw { status: 422, message: "Invalid JSON from AI" };

  const result = validate(first, sectionCount);

  // Check for empty creative data — this means the prompt failed
  const missingCreative: string[] = [];
  if (!Array.isArray(result.value.storyboard) || result.value.storyboard.length === 0) {
    missingCreative.push("storyboard has 0 entries (need 15-25)");
  }
  if (!Array.isArray(result.value.wordDirectives) || result.value.wordDirectives.length === 0) {
    missingCreative.push("wordDirectives has 0 entries (need 15-25)");
  }

  const allErrors = [...result.errors, ...missingCreative];

  if (result.ok && missingCreative.length === 0) return result.value;

  console.warn("[cinematic-direction] Errors on first attempt, retrying:", allErrors);
  const retryMessages = [
    ...messages,
    { role: "assistant", content: JSON.stringify(first) },
    {
      role: "user",
      content: `Your response had these errors:\n${allErrors.join("\n")}\n\nFix them and return corrected JSON only. You MUST include 15-25 storyboard entries and 15-25 wordDirectives.`,
    },
  ];

  const second = await callAI(retryMessages);
  if (!second) {
    throw { status: 422, message: `Cinematic direction failed: ${allErrors.join("; ")}` };
  }

  const retryResult = validate(second, sectionCount);

  // Check retry for empty creative data too
  const retryStoryboard = Array.isArray(retryResult.value.storyboard) ? retryResult.value.storyboard.length : 0;
  const retryDirectives = Array.isArray(retryResult.value.wordDirectives) ? retryResult.value.wordDirectives.length : 0;

  if (retryStoryboard === 0 || retryDirectives === 0) {
    console.error(`[cinematic-direction] Retry still empty: ${retryStoryboard} storyboard, ${retryDirectives} wordDirectives`);
    throw {
      status: 422,
      message: `Cinematic direction failed after retry: storyboard=${retryStoryboard}, wordDirectives=${retryDirectives}`,
    };
  }

  console.log(`[cinematic-direction] Retry: ${retryResult.errors.length} errors remaining, ${retryStoryboard} storyboard, ${retryDirectives} wordDirectives`);
  return retryResult.value;
}

async function persist(direction: Record<string, any>, lyricId: string): Promise<void> {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return;

  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const payload = { cinematic_direction: direction };

  for (const table of ["shareable_lyric_dances", "saved_lyrics"]) {
    const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[cinematic-direction] Stored in ${table}`);
      return;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const lyricId = body.lyricId ?? body.id;

    const lines: LyricLine[] = Array.isArray(body.lines)
      ? body.lines
      : typeof body.lyrics === "string"
        ? body.lyrics
          .split(/\n+/)
          .map((t, i) => ({ text: t.trim(), start: i, end: i + 1 }))
          .filter((l) => l.text)
        : [];

    if (!title || !artist || lines.length === 0) {
      return new Response(JSON.stringify({ error: "title, artist, and lines required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listenerScene = resolveListenerScene(body);
    const scenePrefix = buildScenePrefix(body.scene_context);
    const systemPrompt = scenePrefix + CINEMATIC_DIRECTION_PROMPT;
    const userMessage = buildUserMessage(title, artist, lines, listenerScene, body.audioSections);
    const sectionCount = body.audioSections?.length ?? 0;

    console.log(`[cinematic-direction] ${title} by ${artist} | ${lines.length} lines | ${sectionCount} sections`);

    const result = await callWithRetry(apiKey, systemPrompt, userMessage, sectionCount);

    if (lyricId) await persist(result, lyricId);

    return new Response(JSON.stringify({ cinematicDirection: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[cinematic-direction] error:", error);
    return new Response(JSON.stringify({ error: error.message ?? "Generation failed" }), {
      status: error.status ?? 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
