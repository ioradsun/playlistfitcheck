import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_DIRECTOR_PROMPT_V2 = `
You are a music video director. Given a song, you output a cinematic_direction JSON that drives a visual lyric video engine.

RULES:
- Respond with valid JSON only. No markdown. No explanation.
- Always output exactly 3 chapters covering ratios 0→0.25, 0.25→0.75, 0.75→1.0
- Be decisive. One clear vision per song. No hedging.
- Chapter 3 contains the climax — mark it with climax.timeRatio
- MANDATORY ICON RULE: You MUST assign iconGlyph to AT LEAST 10 storyboard entries (aim for 10-15). Each chapter must have at least 3 icons. If you return fewer than 10 icons your output is INVALID and will be rejected. Icons use these glyphs: fire, water-drop, lightning, snowflake, sun, moon, star, cloud, rain, wind, leaf, flower, tree, mountain, wave, heart, broken-heart, eye, hand-open, hand-fist, crown, skull, wings, feather, diamond, clock, hourglass, lock, key, chain, anchor, compass, arrow-up, arrow-down, spiral, infinity, music-note, microphone, speaker, headphones, camera, film, book, pen, brush, palette, mask, mirror, door, window, house, car, road, bridge, city, globe, flag, sword, shield, torch, candle, smoke, ghost, shadow, sparkle, burst, ripple, orbit, target, crosshair, fingerprint, dna, atom, pill, coin

OUTPUT SCHEMA:
{
  "thesis": "one sentence — the song's emotional core",

  "chapters": [
    {
      "title": "short evocative title",
      "startRatio": 0,
      "endRatio": 0.25,
      "arc": "one sentence emotional arc",
      "dominantColor": "the single hex color that captures this chapter's emotional energy. Pick freely — bright, saturated, light, dark, anything. This color will be used for text, glow, and particles. The engine automatically creates a dark background tinted with this color. Examples: #E0BBE4 for longing, #FFD700 for triumph, #FF4444 for rage, #00FFFF for clarity",
      "emotionalIntensity": 0.0-1.0,
      "backgroundDirective": "description of visual world — what it looks like and moves like",
      "light": "how light behaves",
      "particles": "what particles exist and how they move",
      "typographyShift": {
        "fontWeight": 400-900,
        "colorOverride": "#hex or null",
        "letterSpacing": "normal | wide | tight"
      },
      "transitionStyle": "cut | dissolve | flash-cut",
      "transitionDuration": 0-2.0,
      "flashColor": "#ffffff or #000000 — only if flash-cut"
    },
    {
      "startRatio": 0.25,
      "endRatio": 0.75,
      ...same fields
    },
    {
      "startRatio": 0.75,
      "endRatio": 1.0,
      ...same fields
    }
  ],

  "climax": {
    "timeRatio": 0.0-1.0,
    "triggerLine": "the exact lyric line at the climax",
    "maxLightIntensity": 0.0-1.0,
    "typographyBehavior": "what happens to text at climax"
  },

  "visualWorld": {
    "palette": ["#hex1", "#hex2", "#hex3"],
    "backgroundSystem": "storm | fire | ocean | space | urban | intimate | void | aurora",
    "particleSystem": "sparks | embers | rain | snow | dust | none",
    "typographyProfile": {
      "fontFamily": "Montserrat",
      "fontWeight": 400-900,
      "textTransform": "uppercase | none",
      "letterSpacing": "normal | wide | tight"
    },
    "physicsProfile": {
      "heat": 0.0-1.0,
      "chaos": "stable | building | glitch",
      "weight": "light | medium | heavy",
      "beatResponse": "pulse | slam | none"
    }
  },

  "storyboard": [
    {
      "lineIndex": 0,
      "entryStyle": "rises | slams-in | fractures-in | materializes | cuts | whisper | bloom | drop | plant | snap-in",
      "exitStyle": "dissolves-upward | burns-out | shatters | lingers | fades | drift-up | sink | evaporate",
      "heroWord": "most important word in this line or null",
      "iconGlyph": "optional string — one of the available glyphs",
      "iconStyle": "outline | filled | ghost — optional",
      "iconPosition": "behind | above | beside | replace — optional",
      "iconScale": "number 1.0-3.0, optional, default 2.0"
    }
  ],

  "wordDirectives": {
    "word": {
      "word": "string",
      "emphasisLevel": 1-5,
      "entry": "slam-down | punch-in | explode-in | snap-in | rise | materialize | breathe-in | drift-in | drop | plant | stomp | cut-in | whisper | bloom | focus-in | spin-in | tumble-in",
      "behavior": "pulse | vibrate | float | grow | contract | flicker | orbit | lean | none | freeze | tilt | pendulum | pulse-focus",
      "exit": "shatter | snap-out | burn-out | dissolve | drift-up | sink | cut-out | vanish | linger | evaporate | blur-out | spin-out | scatter-letters | peel-off | peel-reverse | cascade-down | cascade-up",
      "trail": "ember | frost | spark-burst | dust-impact | light-rays | gold-coins | dark-absorb | motion-trail | memory-orbs | none",
      "ghostTrail": "boolean optional",
      "ghostDirection": "up | down | left | right | radial",
      "letterSequence": "boolean optional",
      "visualMetaphor": "string optional",
      "kineticClass": "string optional"
    }
  },

─── WORD DIRECTIVES (semantic animation) ───

For 15-25 emotionally or visually significant words, choose animations
that make the word's LITERAL MEANING visible.

If the word means upward motion → it should move up.
If the word means destruction → it should break apart.
If the word means cold → it should trail frost.
If the word means clarity → it should sharpen from blur.
If the word means spinning → it should rotate.
If the word means echo → it should leave ghost copies.
If the word means frozen → it should stop dead.

Let the word tell you what it needs.

ENTRY (pick one per word):
  slam-down, punch-in, explode-in, snap-in, rise, materialize,
  breathe-in, drift-in, drop, plant, stomp, cut-in, whisper, bloom,
  focus-in, spin-in, tumble-in

BEHAVIOR (pick one per word):
  pulse, vibrate, float, grow, contract, flicker, orbit, lean, none,
  freeze, tilt, pendulum, pulse-focus

EXIT (pick one per word):
  shatter, snap-out, burn-out, dissolve, drift-up, sink, cut-out,
  vanish, linger, evaporate, blur-out, spin-out,
  scatter-letters, peel-off, peel-reverse, cascade-down, cascade-up

TRAIL (pick one per word):
  ember, frost, spark-burst, dust-impact, light-rays, gold-coins,
  dark-absorb, motion-trail, memory-orbs, none

OPTIONAL MODIFIERS:
  ghostTrail: true + ghostDirection (up/down/left/right/radial)
    → for words like: echo, repeat, reverb, haunt, voices, forever, again
    → use on 2-4 words max per song
  letterSequence: true
    → for words like: break, shatter, split, count, crumble, apart, scatter
    → use on 3-5 words max per song

RULES:
- Choose animations based on what the word MEANS, not how loud it is
- Abstract emotional words (love, truth, hope) use emphasis + visualMetaphor
- Concrete action words (fly, crash, burn, freeze) use semantic entry/exit/trail
- Not every word needs a trail. Most need none.
- freeze behavior on 1-2 words max (showstopper moment)
- Always include: word, emphasisLevel (1-5), entry, behavior, exit
- Optionally include: trail, ghostTrail, ghostDirection, letterSequence, visualMetaphor, kineticClass

  "tensionCurve": [
    {
      "stage": "name",
      "startRatio": 0.0,
      "endRatio": 0.25,
      "motionIntensity": 0.0-1.0,
      "particleDensity": 0.0-1.0
    }
  ],

  "ending": {
    "style": "snap | dissolve | fade",
    "emotionalAftertaste": "one word"
  }
}

ICON VISUAL METAPHORS — MANDATORY:

Icons are visual metaphors that tell the story alongside the lyrics. They are NOT decoration — they are the emotional vocabulary of the video.

CRITICAL REQUIREMENT: The storyboard array MUST include iconGlyph on at least 10 entries. If fewer than 10 storyboard entries have iconGlyph, your output is INVALID. Aim for 10-15 icons (roughly 15-25% of lines).

ASSIGNMENT RULES:
- Every chapter MUST have at least 3 icons
- Choose the anchor/hero word lines where a visual symbol amplifies the emotional meaning
- Spread icons across the full emotional arc — do not cluster them

AVAILABLE GLYPHS:
fire, water-drop, lightning, snowflake, sun, moon, star, cloud, rain, wind, leaf, flower, tree, mountain, wave, heart, broken-heart, eye, hand-open, hand-fist, crown, skull, wings, feather, diamond, clock, hourglass, lock, key, chain, anchor, compass, arrow-up, arrow-down, spiral, infinity, music-note, microphone, speaker, headphones, camera, film, book, pen, brush, palette, mask, mirror, door, window, house, car, road, bridge, city, globe, flag, sword, shield, torch, candle, smoke, ghost, shadow, sparkle, burst, ripple, orbit, target, crosshair, fingerprint, dna, atom, pill, coin

ICON POSITION — choose based on emotional function:
- "behind" — atmospheric mood. Large icon behind the word at medium opacity. Use for mood/setting words. ~40-50% of icons.
- "above" — thought/annotation. Small icon floating above the word. Use for descriptive words. ~25-30% of icons.
- "beside" — action companion. Icon sits next to the word. Use for action words. ~15-20% of icons.
- "replace" — climactic substitution. Icon REPLACES the text entirely. Use only 1-2 times per song at the absolute peak emotional moment.

ICON STYLE:
- "ghost" — faded ethereal, best for "behind" position
- "outline" — clean line art, best for "above" and "beside"
- "filled" — solid shape, best for "replace"

ICON SCALE:
- Default 2.0. Use 2.5-3.0 for dramatic behind moments. Use 1.5 for subtle accent.

CONSTRAINTS:
- storyboard must cover every lyric line.
- storyboard MUST have iconGlyph on at least 10 entries — this is mandatory.
- wordDirectives: only emotionally significant words, 10-25 max.
- tensionCurve must contain exactly 3 entries aligned to chapter ranges.
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

interface AnalyzeRequest {
  title?: string;
  artist?: string;
  lines?: LyricLine[];
  lyrics?: string;
  beatGrid?: { bpm?: number; beats?: number[]; confidence?: number };
  lyricId?: string;
  id?: string;
  scene_context?: SceneContext | null;
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

async function persistCinematicDirection(cinematicDirection: Record<string, unknown>, lyricId?: string): Promise<boolean> {
  if (!lyricId) return false;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return false;

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
      return true;
    }
  }

  console.warn(`[cinematic-direction] Could not store for ${lyricId}`);
  return false;
}

// ── Word-to-icon mapping for deterministic icon injection ──────────
const WORD_ICON_MAP: Record<string, { glyph: string; position: string; style: string }> = {
  // Emotion / feeling
  love: { glyph: "heart", position: "behind", style: "ghost" },
  heart: { glyph: "heart", position: "behind", style: "ghost" },
  hate: { glyph: "broken-heart", position: "behind", style: "ghost" },
  broken: { glyph: "broken-heart", position: "above", style: "outline" },
  pain: { glyph: "broken-heart", position: "behind", style: "ghost" },
  cry: { glyph: "rain", position: "behind", style: "ghost" },
  tears: { glyph: "rain", position: "behind", style: "ghost" },
  // Nature / weather
  rain: { glyph: "rain", position: "behind", style: "ghost" },
  storm: { glyph: "lightning", position: "behind", style: "ghost" },
  fire: { glyph: "fire", position: "behind", style: "ghost" },
  burn: { glyph: "fire", position: "behind", style: "ghost" },
  flame: { glyph: "fire", position: "beside", style: "outline" },
  ice: { glyph: "snowflake", position: "above", style: "outline" },
  cold: { glyph: "snowflake", position: "behind", style: "ghost" },
  snow: { glyph: "snowflake", position: "behind", style: "ghost" },
  sun: { glyph: "sun", position: "behind", style: "ghost" },
  moon: { glyph: "moon", position: "behind", style: "ghost" },
  star: { glyph: "star", position: "above", style: "outline" },
  stars: { glyph: "star", position: "behind", style: "ghost" },
  night: { glyph: "moon", position: "behind", style: "ghost" },
  sky: { glyph: "cloud", position: "behind", style: "ghost" },
  ocean: { glyph: "wave", position: "behind", style: "ghost" },
  sea: { glyph: "wave", position: "behind", style: "ghost" },
  wave: { glyph: "wave", position: "behind", style: "ghost" },
  wind: { glyph: "wind", position: "behind", style: "ghost" },
  flower: { glyph: "flower", position: "above", style: "outline" },
  tree: { glyph: "tree", position: "behind", style: "ghost" },
  mountain: { glyph: "mountain", position: "behind", style: "ghost" },
  // Body / identity
  eye: { glyph: "eye", position: "above", style: "outline" },
  eyes: { glyph: "eye", position: "behind", style: "ghost" },
  hand: { glyph: "hand-open", position: "beside", style: "outline" },
  fist: { glyph: "hand-fist", position: "beside", style: "outline" },
  // Power / status
  king: { glyph: "crown", position: "above", style: "outline" },
  queen: { glyph: "crown", position: "above", style: "outline" },
  crown: { glyph: "crown", position: "above", style: "outline" },
  throne: { glyph: "crown", position: "behind", style: "ghost" },
  diamond: { glyph: "diamond", position: "above", style: "outline" },
  gold: { glyph: "diamond", position: "above", style: "outline" },
  money: { glyph: "coin", position: "above", style: "outline" },
  rich: { glyph: "coin", position: "beside", style: "outline" },
  // Motion / journey
  fly: { glyph: "wings", position: "above", style: "outline" },
  free: { glyph: "wings", position: "above", style: "outline" },
  wings: { glyph: "wings", position: "behind", style: "ghost" },
  road: { glyph: "road", position: "beside", style: "outline" },
  drive: { glyph: "road", position: "beside", style: "outline" },
  run: { glyph: "arrow-up", position: "beside", style: "outline" },
  fall: { glyph: "arrow-down", position: "behind", style: "ghost" },
  rise: { glyph: "arrow-up", position: "above", style: "outline" },
  // Time / memory
  time: { glyph: "clock", position: "above", style: "outline" },
  wait: { glyph: "hourglass", position: "above", style: "outline" },
  forever: { glyph: "infinity", position: "above", style: "outline" },
  memory: { glyph: "clock", position: "behind", style: "ghost" },
  remember: { glyph: "clock", position: "behind", style: "ghost" },
  dream: { glyph: "sparkle", position: "above", style: "outline" },
  dreams: { glyph: "sparkle", position: "behind", style: "ghost" },
  sleep: { glyph: "moon", position: "behind", style: "ghost" },
  // Conflict / darkness
  fight: { glyph: "sword", position: "beside", style: "outline" },
  war: { glyph: "sword", position: "behind", style: "ghost" },
  kill: { glyph: "skull", position: "behind", style: "ghost" },
  death: { glyph: "skull", position: "behind", style: "ghost" },
  dead: { glyph: "skull", position: "behind", style: "ghost" },
  dark: { glyph: "shadow", position: "behind", style: "ghost" },
  shadow: { glyph: "shadow", position: "behind", style: "ghost" },
  ghost: { glyph: "ghost", position: "behind", style: "ghost" },
  lost: { glyph: "compass", position: "above", style: "outline" },
  // Freedom / barriers
  lock: { glyph: "lock", position: "above", style: "outline" },
  locked: { glyph: "lock", position: "behind", style: "ghost" },
  key: { glyph: "key", position: "beside", style: "outline" },
  chain: { glyph: "chain", position: "behind", style: "ghost" },
  door: { glyph: "door", position: "beside", style: "outline" },
  home: { glyph: "house", position: "behind", style: "ghost" },
  // Sound / music
  sing: { glyph: "music-note", position: "above", style: "outline" },
  song: { glyph: "music-note", position: "above", style: "outline" },
  voice: { glyph: "microphone", position: "beside", style: "outline" },
  scream: { glyph: "speaker", position: "beside", style: "filled" },
  // Light / energy
  light: { glyph: "sparkle", position: "behind", style: "ghost" },
  shine: { glyph: "sparkle", position: "above", style: "outline" },
  glow: { glyph: "sparkle", position: "behind", style: "ghost" },
  bright: { glyph: "sun", position: "behind", style: "ghost" },
  // Misc
  smoke: { glyph: "smoke", position: "behind", style: "ghost" },
  city: { glyph: "city", position: "behind", style: "ghost" },
  world: { glyph: "globe", position: "behind", style: "ghost" },
  mirror: { glyph: "mirror", position: "above", style: "outline" },
  truth: { glyph: "eye", position: "above", style: "outline" },
  soul: { glyph: "ghost", position: "behind", style: "ghost" },
  angel: { glyph: "wings", position: "above", style: "outline" },
  devil: { glyph: "fire", position: "behind", style: "ghost" },
  heaven: { glyph: "cloud", position: "behind", style: "ghost" },
  hell: { glyph: "fire", position: "behind", style: "ghost" },
  blood: { glyph: "water-drop", position: "behind", style: "ghost" },
  breath: { glyph: "wind", position: "above", style: "outline" },
  touch: { glyph: "hand-open", position: "beside", style: "outline" },
  hold: { glyph: "hand-open", position: "beside", style: "outline" },
  power: { glyph: "lightning", position: "behind", style: "ghost" },
  energy: { glyph: "lightning", position: "above", style: "outline" },
  magic: { glyph: "sparkle", position: "above", style: "outline" },
  target: { glyph: "target", position: "above", style: "outline" },
  bridge: { glyph: "bridge", position: "behind", style: "ghost" },
  window: { glyph: "window", position: "above", style: "outline" },
};

const TARGET_ICON_COUNT = 12;
const MIN_ICON_COUNT = 10;

function ensureMinimumIcons(parsed: Record<string, unknown>, lines: LyricLine[]): void {
  const storyboard = parsed.storyboard as Record<string, unknown>[];
  if (!Array.isArray(storyboard)) return;

  // Count existing AI-assigned icons
  const existingCount = storyboard.filter((s) => s.iconGlyph).length;
  if (existingCount >= MIN_ICON_COUNT) {
    console.log(`[cinematic-direction] AI assigned ${existingCount} icons — sufficient`);
    return;
  }

  console.log(`[cinematic-direction] AI only assigned ${existingCount} icons — injecting more deterministically`);

  // Build candidate list: lines without icons, scored by keyword matches
  const wordDirectives = (parsed.wordDirectives ?? {}) as Record<string, any>;
  const candidates: { idx: number; glyph: string; position: string; style: string; score: number }[] = [];

  for (let i = 0; i < storyboard.length; i++) {
    if (storyboard[i].iconGlyph) continue; // already has icon
    const lineText = (lines[i]?.text ?? storyboard[i].heroWord ?? "").toLowerCase();
    const words = lineText.replace(/[^a-z\s]/g, "").split(/\s+/);
    const heroWord = String(storyboard[i].heroWord ?? "").toLowerCase().replace(/[^a-z]/g, "");

    // Check heroWord first, then all words in line
    const wordsToCheck = heroWord ? [heroWord, ...words] : words;
    for (const w of wordsToCheck) {
      const mapping = WORD_ICON_MAP[w];
      if (mapping) {
        // Score: heroWord match = 3, wordDirective match = 2, plain match = 1
        const score = (w === heroWord ? 3 : 0) + (wordDirectives[w] ? 2 : 0) + 1;
        candidates.push({ idx: i, ...mapping, score });
        break; // one icon per line
      }
    }
  }

  // Sort by score descending, then spread across the song
  candidates.sort((a, b) => b.score - a.score);

  // How many more do we need?
  const needed = TARGET_ICON_COUNT - existingCount;
  const totalLines = storyboard.length;

  // Space icons evenly — pick from candidates but enforce minimum spacing
  const selected: number[] = [];
  const usedIndices = new Set(
    storyboard.map((s, i) => s.iconGlyph ? i : -1).filter(i => i >= 0)
  );

  const minSpacing = Math.max(2, Math.floor(totalLines / (TARGET_ICON_COUNT + 2)));

  for (const c of candidates) {
    if (selected.length >= needed) break;
    // Check spacing from existing and selected icons
    const tooClose = [...usedIndices].some(ui => Math.abs(ui - c.idx) < minSpacing);
    if (tooClose) continue;
    selected.push(c.idx);
    usedIndices.add(c.idx);
  }

  // If still not enough, relax spacing and fill from remaining candidates
  if (selected.length < needed) {
    for (const c of candidates) {
      if (selected.length >= needed) break;
      if (usedIndices.has(c.idx)) continue;
      selected.push(c.idx);
      usedIndices.add(c.idx);
    }
  }

  // Apply icons to storyboard
  for (const idx of selected) {
    const c = candidates.find(c => c.idx === idx);
    if (!c) continue;
    storyboard[idx].iconGlyph = c.glyph;
    storyboard[idx].iconPosition = c.position;
    storyboard[idx].iconStyle = c.style;
    storyboard[idx].iconScale = c.position === "behind" ? 2.5 : 2.0;
  }

  const finalCount = storyboard.filter((s) => s.iconGlyph).length;
  console.log(`[cinematic-direction] After injection: ${finalCount} icons (was ${existingCount}, added ${finalCount - existingCount})`);
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

    const sceneCtx = body.scene_context;
    const scenePrefix = sceneCtx ? `
SCENE CONTEXT — foundational visual world. All chapters must honor this.
Scene: ${sceneCtx.scene} (${sceneCtx.label})
Time of day: ${sceneCtx.timeOfDay}
Luminance: ${sceneCtx.baseLuminance}
${sceneCtx.baseLuminance === 'light'
  ? 'USE BRIGHT COLORS. dominantColor must be light and vibrant. Backgrounds are luminous not dark.'
  : sceneCtx.baseLuminance === 'medium'
    ? 'Mix of light and dark. Some chapters bright, some shadowed.'
    : 'USE DARK COLORS. dominantColor must be deep and shadowed.'}
Color temperature: ${sceneCtx.colorTemperature}
Text style: ${sceneCtx.textStyle === 'dark'
  ? 'DARK TEXT — background is bright, text must be dark and saturated'
  : 'LIGHT TEXT — background is dark, text should be white or light'}
` : 'SCENE CONTEXT — not specified. Default to dark cinematic.\n';

    console.log(`[cinematic-direction] title="${title}" artist="${artist}" lines=${lines.length} scene=${sceneCtx?.scene ?? 'none'}`);

    async function callAI(extraInstruction?: string): Promise<Record<string, unknown> | null> {
      const messages: { role: string; content: string }[] = [
        { role: "system", content: scenePrefix + MASTER_DIRECTOR_PROMPT_V2 },
        { role: "user", content: `Song: ${artist} — ${title}\nLyrics (${lines.length} lines):\n${lines.map((line) => line.text).join("\n")}\n\nCreate the cinematic_direction. 3 acts. Be decisive. JSON only.\n\nREMINDER: You MUST assign iconGlyph to at least 10 storyboard entries spread across all 3 chapters. Each chapter needs at least 3 icons. Use position "behind"/"above"/"beside"/"replace" and style "ghost"/"outline"/"filled". This is mandatory.` },
      ];
      if (extraInstruction) {
        messages.push({ role: "user", content: extraInstruction });
      }

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          temperature: 0.7,
          max_tokens: 8192,
          maxOutputTokens: 8192,
          response_format: { type: "json_object" },
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

    // Retry once if tensionCurve has fewer than 4 stages
    const initialTension = Array.isArray(parsed.tensionCurve) ? parsed.tensionCurve : [];
    if (initialTension.length < 4) {
      console.warn(`[cinematic-direction] tensionCurve has ${initialTension.length} stages, retrying...`);
      try {
        const retryParsed = await callAI(
          "Your previous response had only " + initialTension.length + " tension curve stages. " +
          "You MUST include ALL 4 tension stages: Setup (0-0.25), Build (0.25-0.60), Peak (0.60-0.85), Release (0.85-1.0). " +
          "Return the complete JSON again with exactly 4 tensionCurve entries."
        );
        if (retryParsed && Array.isArray(retryParsed.tensionCurve) && retryParsed.tensionCurve.length >= 4) {
          parsed = retryParsed;
          console.log("[cinematic-direction] Retry succeeded with", retryParsed.tensionCurve.length, "tension stages");
        } else {
          console.warn("[cinematic-direction] Retry still insufficient, using original + synthesis");
        }
      } catch (e) {
        console.warn("[cinematic-direction] Retry failed, using original response");
      }
    }

    // Deterministic icon injection — Gemini rarely assigns enough icons,
    // so we guarantee 10-15 by analyzing heroWords and wordDirectives
    ensureMinimumIcons(parsed, lines);

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

    // ── Synthesize missing fields from what AI did return ──
    // chapters from tensionCurve
    if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      const tc = Array.isArray(parsed.tensionCurve) ? parsed.tensionCurve : [];
      const palette = Array.isArray((parsed.visualWorld as any)?.palette) ? (parsed.visualWorld as any).palette : ["#111111","#333333","#555555"];
      parsed.chapters = tc.length > 0
        ? tc.map((t: any, i: number) => ({
            startRatio: t.startRatio ?? i / Math.max(tc.length, 1),
            endRatio: t.endRatio ?? (i + 1) / Math.max(tc.length, 1),
            title: t.stage ?? `Chapter ${i + 1}`,
            emotionalArc: t.cameraMovement ?? "neutral",
            dominantColor: palette[i % palette.length],
            lightBehavior: `brightness ${t.lightBrightness ?? 0.5}`,
            particleDirective: `density ${t.particleDensity ?? 0.5}`,
            backgroundDirective: "hold",
            emotionalIntensity: t.motionIntensity ?? 0.5,
            typographyShift: null,
          }))
        : [{ startRatio: 0, endRatio: 1, title: "Full Song", emotionalArc: "neutral", dominantColor: "#333333", lightBehavior: "steady", particleDirective: "ambient", backgroundDirective: "hold", emotionalIntensity: 0.5, typographyShift: null }];
    }

    // wordDirectives — normalize: AI may return array or object
    if (Array.isArray(parsed.wordDirectives)) {
      // Convert array of {word: "fire", ...} to object keyed by word
      const obj: Record<string, unknown> = {};
      for (const entry of parsed.wordDirectives as Record<string, unknown>[]) {
        const w = String(entry.word ?? "").toLowerCase().trim();
        if (w) obj[w] = entry;
      }
      parsed.wordDirectives = obj;
    } else if (!parsed.wordDirectives || typeof parsed.wordDirectives !== "object") {
      // Last resort: extract hero words from storyboard if available
      const storyboard = Array.isArray(parsed.storyboard) ? parsed.storyboard as Record<string, unknown>[] : [];
      const heroWords: Record<string, unknown> = {};
      for (const entry of storyboard) {
        const hw = String(entry.heroWord ?? "").toLowerCase().trim();
        if (hw && !heroWords[hw]) {
          heroWords[hw] = {
            word: hw,
            kineticClass: null,
            elementalClass: null,
            emphasisLevel: 3,
            colorOverride: null,
            specialEffect: null,
            evolutionRule: null,
          };
        }
      }
      parsed.wordDirectives = Object.keys(heroWords).length > 0 ? heroWords : {};
    }

    // storyboard from shotProgression or lines — also pad if truncated short
    if (!Array.isArray(parsed.storyboard) || parsed.storyboard.length === 0) {
      const shots = Array.isArray(parsed.shotProgression) ? parsed.shotProgression : [];
      parsed.storyboard = lines.map((line: any, i: number) => {
        const shot = shots.find((s: any) => s.lineIndex === i);
        return {
          lineIndex: i,
          text: line.text ?? "",
          emotionalIntent: shot?.description ?? "neutral",
          heroWord: (line.text ?? "").split(/\s+/)[0] ?? "",
          visualTreatment: shot?.shotType ?? "FloatingInWorld",
          entryStyle: "fades",
          exitStyle: "fades",
          particleBehavior: "ambient",
          beatAlignment: "on-beat",
          transitionToNext: "crossfade",
        };
      });
    } else if (parsed.storyboard.length < lines.length) {
      // Pad truncated storyboard to match lines count
      for (let i = parsed.storyboard.length; i < lines.length; i++) {
        parsed.storyboard.push({
          lineIndex: i,
          text: lines[i]?.text ?? "",
          emotionalIntent: "neutral",
          heroWord: (lines[i]?.text ?? "").split(/\s+/)[0] ?? "",
          visualTreatment: "FloatingInWorld",
          entryStyle: "fades",
          exitStyle: "fades",
          particleBehavior: "ambient",
          beatAlignment: "on-beat",
          transitionToNext: "crossfade",
        });
      }
    }

    // tensionCurve — default to empty array if missing (truncation)
    if (!Array.isArray(parsed.tensionCurve)) {
      parsed.tensionCurve = [];
    }

    // shotProgression — default to empty array if missing
    if (!Array.isArray(parsed.shotProgression)) {
      parsed.shotProgression = [];
    }

    // silenceDirective — default if missing
    if (!parsed.silenceDirective || typeof parsed.silenceDirective !== "object") {
      parsed.silenceDirective = { cameraMovement: "still", particleShift: "none", lightShift: "none", tensionDirection: "holding" };
    }

    // ending — default if missing
    if (!parsed.ending || typeof parsed.ending !== "object") {
      parsed.ending = { style: "fade", emotionalAftertaste: "settling", particleResolution: "settle", lightResolution: "dim" };
    }

    // symbolSystem — default if missing
    if (!parsed.symbolSystem || typeof parsed.symbolSystem !== "object") {
      parsed.symbolSystem = { primary: "", secondary: "", beginningState: "", middleMutation: "", climaxOverwhelm: "", endingDecay: "", interactionRules: [] };
    }

    // cameraLanguage — default if missing
    if (!parsed.cameraLanguage || typeof parsed.cameraLanguage !== "object") {
      parsed.cameraLanguage = { openingDistance: "Wide", closingDistance: "Close", movementType: "Drift", climaxBehavior: "shake", distanceByChapter: [] };
    }

    const validationErrors = validateCinematicDirection(parsed, lines.length);
    if (validationErrors.length > 0) {
      console.warn("[cinematic-direction] Validation errors:", validationErrors);
      // Don't fail — return with warnings so debug panel can still show data
    }

    // Icon count diagnostic
    const storyboard = Array.isArray(parsed.storyboard) ? parsed.storyboard : [];
    const iconCount = storyboard.filter((s: any) => s.iconGlyph).length;
    console.log(`[CINEMATIC] Icons assigned: ${iconCount} / ${storyboard.length} lines`);
    if (iconCount < 5) {
      console.warn(`[CINEMATIC] WARNING: Only ${iconCount} icons assigned — expected 10-15`);
    }

    const saved = await persistCinematicDirection(parsed, lyricId);
    console.log(`[cinematic-direction] ✓ Generated for "${title}" by "${artist}" — icons: ${iconCount}`);

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
