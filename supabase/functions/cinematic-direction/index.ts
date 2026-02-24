import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_DIRECTOR_PROMPT_V2 = `
You are a film director designing a cinematic lyric video.

You will receive song lyrics and audio analysis data. Your job is to SELECT visual presets from constrained menus, assign icons to key lyric lines, and choose semantic animations for important words.

You may NOT invent colors, styles, effects, glyph names, or any values not listed below.
Return ONLY valid JSON. No markdown. No explanation. No preamble.

═══════════════════════════════════════
SECTION 1 — WORLD SELECTION (7 picks)
═══════════════════════════════════════

Pick exactly one value for each of these 7 dimensions.

SCENE TONE — controls light/dark foundation:
  "dark"         — moody, cinematic, dark backgrounds
  "light"        — bright, airy, daylit
  "mixed-dawn"   — dark → dark → light (sunrise arc, hope ending)
  "mixed-dusk"   — light → light → dark (descent arc, heavy ending)
  "mixed-pulse"  — dark → light → dark (brief hope, return to weight)

ATMOSPHERE — controls background image treatment:
  "void"       — near-black/white, text floats in space
  "cinematic"  — standard filmic crush + vignette
  "haze"       — dreamy soft focus, blurred background
  "split"      — image on one half, solid color on other
  "grain"      — film grain overlay, analog texture
  "wash"       — heavy color tint toward palette color
  "glass"      — frosted glass effect, modern
  "clean"      — minimal overlay, image-forward

PALETTE — locked color set (MUST match tone):
  Dark palettes:  "cold-gold", "warm-ember", "ice-blue", "midnight-rose", "neon-green", "storm-grey", "blood-red", "lavender-dream", "earth-brown"
  Light palettes: "pure-white", "soft-cream", "sky-blue", "sunset-pink", "spring-green"

MOTION — text animation cadence:
  "weighted"  — heavy, impactful, hip-hop/trap
  "fluid"     — smooth, flowing, R&B/soul
  "elastic"   — bouncy, energetic, pop
  "drift"     — slow, contemplative, ambient/lo-fi
  "glitch"    — choppy, digital, electronic

TYPOGRAPHY — font and style:
  "bold-impact"      — Oswald, uppercase, power
  "clean-modern"     — Montserrat, neutral, pop
  "elegant-serif"    — Playfair Display, soulful, ballad
  "raw-condensed"    — Barlow Condensed, gritty, indie
  "whisper-soft"     — Nunito, gentle, dreamy
  "tech-mono"        — JetBrains Mono, futuristic, electronic
  "display-heavy"    — Bebas Neue, statement, anthem
  "editorial-light"  — Cormorant Garamond, poetic, intimate

TEXTURE — dominant particle/sim layer:
  "fire", "rain", "snow", "aurora", "smoke", "storm", "dust", "void", "stars", "petals"

EMOTIONAL ARC — how intensity evolves over the song:
  "slow-burn"  — gradual build, restrained → tension → peak
  "surge"      — high energy early, bigger climax
  "collapse"   — starts intense, ends minimal
  "dawn"       — dark to light transition, hope ending
  "flatline"   — intentionally monotone, ambient, meditative
  "eruption"   — quiet start, explodes Act 2, Act 3 rides energy

COMPATIBILITY RULES:
- If sceneTone is "dark", palette MUST be from the Dark list
- If sceneTone is "light", palette MUST be from the Light list
- If sceneTone is "light", texture should NOT be "fire" or "storm"
- "mixed-*" tones can use any palette

═══════════════════════════════════════
SECTION 2 — CHAPTERS (exactly 3)
═══════════════════════════════════════

Provide exactly 3 chapters. These drive the AI background image generation.

Each chapter has:
- "act": 1, 2, or 3
- "startRatio": float (Act 1: 0.0, Act 2: 0.25, Act 3: 0.75)
- "endRatio": float (Act 1: 0.25, Act 2: 0.75, Act 3: 1.0)
- "description": a vivid 1-sentence scene for the background image
- "mood": 2-3 emotional keywords

Chapter descriptions should paint a SCENE, not describe effects.
  GOOD: "Empty highway at 3am, headlights cutting through fog"
  BAD:  "Dark moody atmosphere with particles"
  GOOD: "Golden sunlight pouring through a cracked church window"
  BAD:  "Warm tones with spiritual energy"

═══════════════════════════════════════
SECTION 3 — STORYBOARD (sparse, icons only)
═══════════════════════════════════════

The storyboard is SPARSE. Only include entries for lines that need an icon OR a special heroWord callout. Do NOT include an entry for every lyric line.

Target: 15-25 storyboard entries out of all lyric lines.

Each storyboard entry has:
- "lineIndex": integer (0-based index into the lyrics array)
- "heroWord": the most emotionally significant word on that line (UPPERCASE)
- "entryStyle": pick from entries list below
- "exitStyle": pick from exits list below

OPTIONAL per entry (include when assigning an icon):
- "iconGlyph": pick from glyphs list below
- "iconStyle": "ghost" | "outline" | "filled"
- "iconPosition": "behind" | "above" | "beside" | "replace"
- "iconScale": number (default 2.0, range 1.5-3.0)

ENTRY STYLES:
  slam-down, punch-in, explode-in, snap-in, rise, materialize,
  breathe-in, drift-in, drop, plant, stomp, cut-in, whisper, bloom,
  focus-in, spin-in, tumble-in

EXIT STYLES:
  shatter, snap-out, burn-out, dissolve, drift-up, sink, cut-out,
  vanish, linger, evaporate, blur-out, spin-out,
  scatter-letters, peel-off, peel-reverse, cascade-down, cascade-up

——— ICON RULES ———

Assign iconGlyph to 10-15 storyboard entries spread across the song.
Icons are visual metaphors — they tell the story alongside the lyrics.

AVAILABLE GLYPHS (use ONLY these names):
  fire, water-drop, lightning, snowflake, sun, moon, star, cloud,
  rain, wind, leaf, flower, tree, mountain, wave, heart, broken-heart,
  eye, hand-open, hand-fist, crown, skull, wings, feather, diamond,
  clock, hourglass, lock, key, chain, anchor, compass, arrow-up,
  arrow-down, spiral, infinity, music-note, microphone, speaker,
  headphones, camera, film, book, pen, brush, palette, mask, mirror,
  door, window, house, car, road, bridge, city, globe, flag, sword,
  shield, torch, candle, smoke, ghost, shadow, sparkle, burst, ripple,
  orbit, target, crosshair, fingerprint, dna, atom, pill, coin

Do NOT invent glyph names. Any name not in this list will fail to render.

ICON POSITION DISTRIBUTION:
- "behind" — atmospheric mood icon behind the word. ~45% of icons.
  Use iconStyle: "ghost", iconScale: 2.0-3.0
- "above" — annotation floating above the word. ~28% of icons.
  Use iconStyle: "outline", iconScale: 1.5-2.0
- "beside" — companion next to the word. ~17% of icons.
  Use iconStyle: "outline", iconScale: 1.5-2.0
- "replace" — icon REPLACES text entirely. 1-2 max per song.
  Use iconStyle: "filled", iconScale: 2.0-2.5

ICON COVERAGE:
- Every act MUST have at least 3 icons
- Spread icons across the full song — do not cluster them
- Choose lines where a visual symbol amplifies emotional meaning
- If the song has fewer than 30 lines, aim for 10 icons minimum
- If the song has 30+ lines, aim for 12-15 icons

═══════════════════════════════════════
SECTION 4 — WORD DIRECTIVES (semantic animation)
═══════════════════════════════════════

For 15-25 emotionally or visually significant words across the song,
choose animations that make the word's LITERAL MEANING visible.

If the word means upward motion → it should move up.
If the word means destruction → it should break apart.
If the word means cold → it should trail frost.
If the word means clarity → it should sharpen from blur.
If the word means spinning → it should rotate.
If the word means echo → it should leave ghost copies.
If the word means frozen → it should stop dead.

Let the word tell you what it needs.

Each word directive has:
- "word": the word (lowercase)
- "emphasisLevel": 1-5 (1=subtle, 5=showstopper)
- "entry": pick from entry styles list above
- "behavior": pick from behaviors list below
- "exit": pick from exit styles list above

OPTIONAL per word:
- "trail": particle trail effect (see list below)
- "ghostTrail": true — leaves fading echo copies (2-4 words max per song)
- "ghostDirection": "up" | "down" | "left" | "right" | "radial"
- "letterSequence": true — letters animate individually (3-5 words max per song)
- "visualMetaphor": freeform string describing the intended visual

BEHAVIORS:
  pulse, vibrate, float, grow, contract, flicker, orbit, lean, none,
  freeze, tilt, pendulum, pulse-focus

TRAILS:
  ember, frost, spark-burst, dust-impact, light-rays, gold-coins,
  dark-absorb, motion-trail, memory-orbs, none

MODIFIER RULES:
- ghostTrail: for echo, repeat, reverb, haunt, voices, forever, again (2-4 per song)
- letterSequence: for break, shatter, split, count, crumble, apart, scatter (3-5 per song)
- freeze behavior: for freeze, stop, still, stuck, trapped, numb (1-2 per song)
- Choose animations by what the word MEANS, not how loud it is
- Abstract emotional words (love, truth, hope) → use emphasisLevel + visualMetaphor
- Concrete action words (fly, crash, burn, freeze) → use semantic entry/exit/trail
- Not every word needs a trail. Most need "none" or omit the field.

═══════════════════════════════════════
SECTION 5 — OUTPUT SCHEMA
═══════════════════════════════════════

Return this exact JSON structure. All top-level keys are required.

{
  "sceneTone": "dark",
  "atmosphere": "cinematic",
  "palette": "cold-gold",
  "motion": "fluid",
  "typography": "clean-modern",
  "texture": "rain",
  "emotionalArc": "slow-burn",

  "chapters": [
    {
      "act": 1,
      "startRatio": 0.0,
      "endRatio": 0.25,
      "description": "Empty rain-soaked street, single streetlight, puddles reflecting amber",
      "mood": "isolated, heavy, still"
    },
    {
      "act": 2,
      "startRatio": 0.25,
      "endRatio": 0.75,
      "description": "Inside a moving car, rain on windshield, blurred city lights passing",
      "mood": "restless, searching, momentum"
    },
    {
      "act": 3,
      "startRatio": 0.75,
      "endRatio": 1.0,
      "description": "Standing on a rooftop at dawn, rain stopping, first light breaking through clouds",
      "mood": "release, clarity, resolve"
    }
  ],

  "storyboard": [
    {
      "lineIndex": 0,
      "heroWord": "RAIN",
      "entryStyle": "rise",
      "exitStyle": "dissolve",
      "iconGlyph": "rain",
      "iconStyle": "ghost",
      "iconPosition": "behind",
      "iconScale": 2.5
    },
    {
      "lineIndex": 5,
      "heroWord": "ROAD",
      "entryStyle": "drift-in",
      "exitStyle": "evaporate",
      "iconGlyph": "road",
      "iconPosition": "beside",
      "iconStyle": "outline",
      "iconScale": 2.0
    },
    {
      "lineIndex": 12,
      "heroWord": "HEART",
      "entryStyle": "materialize",
      "exitStyle": "shatter"
    }
  ],

  "wordDirectives": {
    "rain": {
      "word": "rain",
      "emphasisLevel": 4,
      "entry": "rise",
      "behavior": "float",
      "exit": "dissolve",
      "trail": "frost",
      "visualMetaphor": "gravity-drop"
    },
    "shatter": {
      "word": "shatter",
      "emphasisLevel": 5,
      "entry": "explode-in",
      "behavior": "vibrate",
      "exit": "scatter-letters",
      "trail": "spark-burst",
      "letterSequence": true
    },
    "echo": {
      "word": "echo",
      "emphasisLevel": 3,
      "entry": "materialize",
      "behavior": "float",
      "exit": "evaporate",
      "trail": "none",
      "ghostTrail": true,
      "ghostDirection": "radial"
    }
  }
}

VALIDATION:
- sceneTone, atmosphere, palette, motion, typography, texture, emotionalArc are ALL required strings
- chapters array MUST have exactly 3 entries
- storyboard array MUST have 15-25 entries
- storyboard MUST include iconGlyph on at least 10 entries
- wordDirectives MUST have 15-25 entries
- All enum values MUST be from the lists above — do NOT invent values
- Do NOT include fields named: beatAlignment, emotionalIntent, visualTreatment, particleBehavior, transitionToNext, dominantColor, colorHex, physicsProfile, cameraLanguage, tensionCurve
- If you include ANY of those forbidden fields, the output is INVALID

Return JSON only. No markdown fences. No explanation.
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
    palette: [
      "cold-gold", "warm-ember", "ice-blue", "midnight-rose", "neon-green",
      "storm-grey", "blood-red", "lavender-dream", "earth-brown",
      "pure-white", "soft-cream", "sky-blue", "sunset-pink", "spring-green",
    ],
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
    palette: "cold-gold",
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

  const DARK_PALETTES = ["cold-gold", "warm-ember", "ice-blue", "midnight-rose", "neon-green", "storm-grey", "blood-red", "lavender-dream", "earth-brown"];
  const LIGHT_PALETTES = ["pure-white", "soft-cream", "sky-blue", "sunset-pink", "spring-green"];

  if (raw.sceneTone === "dark" && !DARK_PALETTES.includes(raw.palette)) {
    console.warn(`[CINEMATIC] Palette "${raw.palette}" incompatible with dark tone — falling back to "cold-gold"`);
    raw.palette = "cold-gold";
  }
  if (raw.sceneTone === "light" && !LIGHT_PALETTES.includes(raw.palette)) {
    console.warn(`[CINEMATIC] Palette "${raw.palette}" incompatible with light tone — falling back to "soft-cream"`);
    raw.palette = "soft-cream";
  }

  if (raw.sceneTone === "light" && ["fire", "storm"].includes(raw.texture)) {
    console.warn(`[CINEMATIC] Texture "${raw.texture}" incompatible with light tone — falling back to "dust"`);
    raw.texture = "dust";
  }

  const VALID_GLYPHS = new Set([
    "fire", "water-drop", "lightning", "snowflake", "sun", "moon", "star", "cloud",
    "rain", "wind", "leaf", "flower", "tree", "mountain", "wave", "heart", "broken-heart",
    "eye", "hand-open", "hand-fist", "crown", "skull", "wings", "feather", "diamond",
    "clock", "hourglass", "lock", "key", "chain", "anchor", "compass", "arrow-up",
    "arrow-down", "spiral", "infinity", "music-note", "microphone", "speaker",
    "headphones", "camera", "film", "book", "pen", "brush", "palette", "mask", "mirror",
    "door", "window", "house", "car", "road", "bridge", "city", "globe", "flag", "sword",
    "shield", "torch", "candle", "smoke", "ghost", "shadow", "sparkle", "burst", "ripple",
    "orbit", "target", "crosshair", "fingerprint", "dna", "atom", "pill", "coin",
  ]);

  if (Array.isArray(raw.storyboard)) {
    for (const entry of raw.storyboard) {
      if (entry.iconGlyph && !VALID_GLYPHS.has(entry.iconGlyph)) {
        console.warn(`[CINEMATIC] Invalid iconGlyph: "${entry.iconGlyph}" on line ${entry.lineIndex} — removing`);
        delete entry.iconGlyph;
        delete entry.iconStyle;
        delete entry.iconPosition;
        delete entry.iconScale;
      }
    }
  }

  const storyboard = raw.storyboard ?? [];
  const iconCount = storyboard.filter((s: any) => s.iconGlyph).length;
  const wordCount = Object.keys(raw.wordDirectives ?? {}).length;
  console.log(`[CINEMATIC] Storyboard: ${storyboard.length} entries, ${iconCount} icons, ${wordCount} word directives`);
  if (iconCount < 5) {
    console.warn(`[CINEMATIC] WARNING: Only ${iconCount} icons — expected 10-15`);
  }

  return raw;
}

function validateCinematicDirection(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ["sceneTone", "atmosphere", "palette", "motion", "typography", "texture", "emotionalArc"];
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

async function persistCinematicDirection(cinematicDirection: Record<string, unknown>, lyricId?: string): Promise<boolean> {
  if (!lyricId) return false;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return false;

  const payloadWithColumns = {
    scene_tone: cinematicDirection.sceneTone,
    atmosphere: cinematicDirection.atmosphere,
    palette: cinematicDirection.palette,
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

    async function callAI(): Promise<Record<string, unknown> | null> {
      const messages: { role: string; content: string }[] = [
        { role: "system", content: scenePrefix + MASTER_DIRECTOR_PROMPT_V2 },
        { role: "user", content: `Song: ${artist} — ${title}\nLyrics (${lines.length} lines):\n${lines.map((line) => line.text).join("\n")}\n\nCreate the cinematic_direction. 3 acts. Be decisive. JSON only.\n\nREMINDER: You MUST assign iconGlyph to at least 10 storyboard entries spread across all 3 chapters. Each chapter needs at least 3 icons. Use position "behind"/"above"/"beside"/"replace" and style "ghost"/"outline"/"filled". This is mandatory.` },
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
