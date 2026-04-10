import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = 120000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

function normalizeAbortError(error: unknown, message: string, status = 504) {
  if (error instanceof Error && error.name === "AbortError") {
    return { status, message };
  }
  return error;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.5-flash";
const TYPOGRAPHY_FONT_LIBRARY = `FONT LIBRARY — pick from these exact names:

DISPLAY:
  Bebas Neue — Movie posters. Bold declarations. "I AM HERE." All-caps condensed impact.
  Permanent Marker — Sharpie on a mirror. Bathroom wall poetry. Protest sign urgency.
  Unbounded — Geometric blob display. Album cover energy. Futuristic weight.
  Dela Gothic One — Heavy blackletter energy. Gothic weight. Dark anthems.

CONDENSED:
  Oswald — Tall and tight. News tickers. Campaign posters. Authority with edge.
  Barlow Condensed — Industrial precision. Blueprint energy. Clean but forceful.
  Archivo — Geometric muscle. Tech-forward power. Modern impact.

SANS:
  Montserrat — Reliable workhorse. Use only when nothing else fits.
  Inter — Invisible design. Let the words speak.
  Sora — Soft-edged modern. New-gen energy.
  Rubik — Rounded corners. Friendly weight.
  Nunito — Pillowy soft. Gentle confessions.
  Plus Jakarta Sans — Contemporary warmth and sophistication.
  Bricolage Grotesque — Quirky proportions. Indie character.
  Lexend — Calm clarity. Readability-first.

SERIF:
  Playfair Display — High-contrast editorial drama.
  EB Garamond — Classical literary warmth.
  Cormorant Garamond — Whispered elegance.
  DM Serif Display — Warm editorial confidence.
  Instrument Serif — Refined poetry-forward elegance.
  Bitter — Slab-serif storytelling warmth.

MONO:
  JetBrains Mono — Hacker/system voice.
  Space Mono — Retro-futuristic mission-control voice.

HANDWRITING:
  Caveat — Diary confessions and handwritten intimacy.`;

const TYPOGRAPHY_TASK_GUIDANCE = `TYPOGRAPHY TASK

Choose ONE font from the FONT LIBRARY for this song.
You are choosing the visual voice of the lyrics — not a "pretty font."

Think in terms of:
- genre culture (hip-hop = condensed/display, R&B = serif/sans, indie = handwriting/serif)
- vocal delivery (whispered = light weight serif, belted = black weight display, rapped = condensed)
- whether the typography should narrate, declare, confess, seduce, disrupt, or command

OUTPUT:
  "typographyPlan": {
    "system": "single",
    "primary": "font name from FONT LIBRARY",
    "accent": "",
    "case": "uppercase|sentence",
    "baseWeight": "light|regular|bold|black",
    "heroStyle": "weight-shift|scale-only|none",
    "accentDensity": "low|medium|high",
    "sectionBehavior": {
      "<role>": "<behavior>"
    },
    "reason": "one sentence"
  }

ALWAYS use system "single". Do not use "paired" or "minimal".

HERO STYLES (how emphasis words are treated):
  weight-shift   — hero words get heavier weight of the SAME font. Default choice.
  scale-only     — hero words are slightly larger. No weight change. For sparse tracks.
  none           — no emphasis treatment. Every word equal. For ambient/minimal.

ACCENT DENSITY (how often hero treatment fires):
  low    — max 1 hero word per phrase, 20% of phrases. Restrained. Most songs.
  medium — max 1 hero word per phrase, 40% of phrases. Active.
  high   — max 2 hero words in choruses, 60% of chorus phrases. Energetic.

SECTION BEHAVIOR — how typography performs in each section:
  Map each section role to a behavior keyword. This is how the same font
  feels different across the song — the font is the voice, behavior is the performance.

  Verse behaviors:    restrained | narrative | raw
  Pre-chorus:         lift | tighten | hold
  Chorus:             explode | anthem | contrast
  Bridge:             strip | pivot | float
  Outro:              decay | resolve | linger

  Not every section needs a mapping. Unmapped sections get energy-based defaults.

  What each behavior means visually:
  restrained — regular weight, normal spacing, sentence case. Calm.
  narrative  — regular weight, normal spacing. Storytelling mode.
  raw        — bold weight, tight spacing. Gritty.
  lift       — bold weight, normal spacing. Building.
  tighten    — bold weight, tight spacing. Compressing.
  hold       — regular weight, normal spacing. Suspended.
  explode    — black weight, tight spacing, UPPERCASE. Maximum impact.
  anthem     — black weight, normal spacing, UPPERCASE. Powerful.
  contrast   — bold weight, wide spacing. Dramatic tension.
  strip      — light weight, wide spacing, sentence case. Bare.
  pivot      — regular weight, normal spacing. Transitional.
  float      — light weight, wide spacing. Weightless.
  decay      — light weight, wide spacing. Fading.
  resolve    — regular weight, normal spacing. Settled.
  linger     — light weight, wide spacing. Trailing off.

RULES:
- Prefer strong, distinctive choices. Avoid Montserrat unless nothing else fits.
- The font IS the song's identity. Choose one that feels inevitable for this track.
- Match genre culture. A trap beat needs different typography than a folk ballad.`;

const SCENE_DIRECTION_PROMPT = `
You are a lyric video director. Return JSON only. No markdown. No commentary.

PROCESS — follow these steps in order:

1. LISTEN. If audio is attached, listen to the entire song closely. Pay attention to:
   - The vocal performance: whispered, sung, rapped, screamed
   - The instrumentation: acoustic, electronic, orchestral, stripped-back
   - Energy shifts: where the song builds, drops, peaks, and settles
   - Production: layering, ad-libs, effects, space between sounds

2. TRANSCRIBE. Write down the lyrics you hear in each section. Use the EXACT
   words the artist sings — their specific metaphors, imagery, and language.
   If lyrics are also provided in text, use those as a reference but trust
   what you HEAR for emotional delivery and emphasis.

3. EXTRACT. From the transcribed lyrics, pull out the concrete visual nouns:
   places, objects, actions, weather, time of day, body language. These are
   your scene ingredients. "Burning bridges" = fire + bridge. "3am drive" =
   car + empty road + night. "Crying in the shower" = water + steam + tile.

4. DIRECT. Build one cohesive visual world from those ingredients. Every
   section lives in the same world but shows a different moment — like
   scenes in a film, not slides in a deck. The energy you HEARD in the
   audio drives the intensity of each scene.

OUTPUT SCHEMA:
{
  "description": "one sentence, max 15 words — the visual world in a nutshell",
  "sceneTone": "dark|light|mixed",
  "typographyPlan": {
    "system": "paired|single|minimal",
    "primary": "font name from FONT LIBRARY",
    "accent": "font name from FONT LIBRARY (empty string for single/minimal)",
    "case": "uppercase|sentence",
    "baseWeight": "light|regular|bold|black",
    "heroStyle": "accent-font|weight-shift|scale-only|none",
    "accentDensity": "low|medium|high",
    "sectionBehavior": {
      "<role>": "<behavior>"
    },
    "reason": "one sentence"
  },
  "emotionalArc": "slow-burn|surge|collapse|dawn|eruption",
  "sections": [
    {
      "sectionIndex": 0,
      "description": "one evocative sentence — what the viewer SEES",
      "dominantColor": "#hex",
      "visualMood": "mood",
      "texture": "texture"
    }
  ]
}

MOODS (each drives camera behavior, vignette, and visual intensity):
  intimate — close, warm, shallow depth of field, gentle drift
  anthemic — wide, powerful, sweeping camera, open vignette
  dreamy — soft, floaty, slow motion feel, ethereal glow
  aggressive — sharp, punchy, fast cuts, high contrast
  melancholy — muted, heavy, slow drift, deep vignette
  euphoric — bright, expansive, confetti energy, wide open
  eerie — tense, off-kilter, subtle unease, cool tones
  vulnerable — fragile, intimate, barely moving, raw
  triumphant — bold, rising, golden, victorious energy
  nostalgic — warm grain, faded warmth, gentle sway
  defiant — hard, confrontational, electric edge
  hopeful — lifting, brightening, gentle upward drift
  raw — stripped back, gritty, exposed, documentary feel
  hypnotic — repetitive, pulsing, trance-like loops
  ethereal — weightless, otherworldly, crystalline
  haunted — ghostly, shadowed, smoke and whispers
  celestial — vast, cosmic, starfield expanses
  noir — high contrast, moody shadows, cinematic cool
  rebellious — burning edges, sparks, untamed energy

TEXTURES (particle system overlaid on each section):
  dust, embers, smoke, rain, snow, stars, fireflies, petals,
  ash, crystals, confetti, lightning, bubbles, moths, glare, glitch, fire

VISUAL WORLD RULES:

1. ARTIST DIRECTION IS LAW. If provided, it defines the world. Every section
   lives inside that world. "Late night drive" = every scene is roads, headlights,
   dashboard glow. "Club at 1am" = every scene is strobes, sweat, bass.

2. LYRICS ARE THE BLUEPRINT. If no artist direction is given, the visual world
   comes from what the artist is SAYING, not generic mood. A song about couch
   surfing should show couches, dim apartments, borrowed floors — not waves and
   fog. Extract the literal imagery from the words you heard. Then layer emotion
   on top.

3. ONE WORLD, MANY MOMENTS. Do not create disconnected scenes. Every section
   is the same place at a different moment — like a time-lapse or a camera
   moving through one continuous space. Coherence beats variety.

4. ENERGY DRIVES INTENSITY. The section you HEARD as the quietest gets the
   most muted, intimate visual. The section you HEARD as the loudest gets the
   most vivid, dramatic visual. Match what you heard, not what you assume.

5. THE HOOK IS THE CLIMAX. If you hear a lyric that repeats — a chorus, a
   hook — that section gets the most visually powerful treatment. Maximum
   color saturation, widest framing, boldest texture.

DOMINANT COLOR RULES:
- dominantColor is a TINT DIRECTION — a color gel on a film light. It TINTS
  the scene, not PAINTS it.
- Mid-tone colors only (RGB values 60-180). Never near-black (any channel
  below 30). Never near-white (all channels above 220).
- Color should SHIFT across sections to reinforce the arc.
  Warm (amber/gold) for intimate/nostalgic. Cool (teal/blue) for ethereal/noir.
  Hot (red/crimson) for aggressive/anthemic. Jewel tones for euphoric/dreamy.
- Good: "#4A6B8A" (steel blue), "#7B5A9E" (electric violet), "#C4962E" (rich amber)
- Bad: "#0D0F14" (black), "#1B1026" (too dark), "#FFFFFF" (no direction)

SECTION DESCRIPTION RULES:
- Each description must be UNIQUE and VISUAL — a one-sentence snapshot of what
  the viewer sees in that moment. Not a mood label.
- Good: "Rain streaks across a bus window as city lights blur into long smears of gold"
- Good: "An empty parking lot at 4am, one streetlight buzzing, puddles reflecting nothing"
- Bad: "intimate cinematic landscape"
- Bad: "moody urban environment"
- Ground descriptions in SPECIFIC nouns from the lyrics you heard.

SECTION COUNT:
- If audio sections are provided: one section per audio section. Match count exactly.
- If audio sections are NOT provided: listen to the full song and divide it into 4-8 natural sections (intro, verse, chorus, bridge, outro as appropriate).

${TYPOGRAPHY_FONT_LIBRARY}

${TYPOGRAPHY_TASK_GUIDANCE}
`;

const INSTRUMENTAL_SCENE_DIRECTION_PROMPT = `
You are a visual world director for instrumental music.
Return JSON only. No markdown. No commentary.

PROCESS — follow these steps in order:

1. LISTEN. If audio is attached, listen to the entire track closely. Pay attention to:
   - Instrumentation: what instruments, synths, or samples do you hear
   - Rhythm: driving, floating, syncopated, steady
   - Energy arc: where it builds, peaks, drops, resolves
   - Space: dense and layered vs sparse and minimal

2. NOTE. Write down what you hear in each section: the dominant instrument,
   the energy level, whether it's building or releasing. This is your
   blueprint for visual intensity.

3. DIRECT. Build one cohesive visual world from the track's character.
   A lo-fi beat gets a different world than a cinematic orchestral piece.
   Let the SOUND define the SETTING.

OUTPUT JSON SCHEMA:
{
  "sceneTone": "dark|light|mixed",
  "emotionalArc": "slow-burn|surge|collapse|dawn|eruption",
  "description": "one-sentence world description",
  "typographyPlan": {
    "system": "paired|single|minimal",
    "primary": "font name from FONT LIBRARY",
    "accent": "font name from FONT LIBRARY (empty string for single/minimal)",
    "case": "uppercase|sentence",
    "baseWeight": "light|regular|bold|black",
    "heroStyle": "accent-font|weight-shift|scale-only|none",
    "accentDensity": "low|medium|high",
    "sectionBehavior": { "<role>": "<behavior>" },
    "reason": "one sentence"
  },
  "sections": [
    {
      "sectionIndex": 0,
      "description": "one evocative sentence describing THIS section's visual moment",
      "dominantColor": "#hex — a mid-tone tint direction (RGB 60-180), not near-black or near-white",
      "visualMood": "one of the MOODS below — MUST VARY across sections to create a story arc",
      "texture": "one of the TEXTURES below — MUST CHANGE at least twice across sections"
    }
  ]
}

MOODS: intimate, anthemic, dreamy, aggressive, melancholy, euphoric, eerie,
vulnerable, triumphant, nostalgic, defiant, hopeful, raw, hypnotic, ethereal,
haunted, celestial, noir, rebellious

TEXTURES: dust, embers, smoke, rain, snow, stars, fireflies, petals, ash,
crystals, confetti, lightning, bubbles, moths, glare, glitch, fire

STORYTELLING RULES:

1. VISUAL ARC IS MANDATORY. Each section is a chapter in a visual story.
   - Intro: intimate, vulnerable, or dreamy — establish the world quietly
   - Building: shift to hypnotic, nostalgic, or hopeful — the world wakes up
   - Peak: anthemic, euphoric, aggressive, or triumphant — maximum visual energy
   - Outro: return to intimate or ethereal — the world settles

2. TEXTURE MUST CHANGE across sections. Match texture to energy:
   - Low energy: dust, fireflies, moths, snow, stars
   - Mid energy: smoke, petals, rain, crystals, bubbles
   - High energy: embers, fire, confetti, lightning, glare, glitch

3. If ARTIST DIRECTION is provided, it defines the WORLD. The visual arc
   and texture variation still apply WITHIN that world.

4. dominantColor should shift across sections to reinforce the arc.

5. Each section description must be UNIQUE and VISUAL — a specific snapshot,
   not a mood label.
   Good: "Dust motes spiral in amber floodlight as the first circle forms"
   Bad: "intimate cinematic landscape"

6. SECTION COUNT:
   - If audio sections are provided: one section per audio section. Match count exactly.
   - If audio sections are NOT provided: listen to the full track and divide it into 4-8 natural sections (intro/build/peak/outro).

DOMINANT COLOR RULES:
- dominantColor is a TINT DIRECTION — a color gel on a film light. It TINTS
  the scene, not PAINTS it.
- Mid-tone colors only (RGB values 60-180). Never near-black (any channel
  below 30). Never near-white (all channels above 220).
- Color should SHIFT across sections to reinforce the arc.
- Good: "#4A6B8A" (steel blue), "#7B5A9E" (electric violet), "#C4962E" (rich amber)
- Bad: "#0D0F14" (black), "#1B1026" (too dark), "#FFFFFF" (no direction)

${TYPOGRAPHY_FONT_LIBRARY}

${TYPOGRAPHY_TASK_GUIDANCE}
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
  confidence?: number;
}

interface RequestBody {
  title?: string;
  artist?: string;
  bpm?: number;
  lines?: LyricLine[];
  lyrics?: string;
  lyricId?: string;
  id?: string;
  artist_direction?: string;
  audio_url?: string;
  audioSections?: AudioSectionInput[];
  /** Word-level timestamps from ElevenLabs Scribe */
  words?: Array<{ word: string; start: number; end: number }>;
  mode?: "scene";
  sceneDirection?: Record<string, any>;
  instrumental?: boolean;
}

const ENUMS = {
  sceneTone: ["dark", "light", "mixed"],
  visualMood: [
    "intimate",
    "anthemic",
    "dreamy",
    "aggressive",
    "melancholy",
    "euphoric",
    "eerie",
    "vulnerable",
    "triumphant",
    "nostalgic",
    "defiant",
    "hopeful",
    "raw",
    "hypnotic",
    "ethereal",
    "haunted",
    "celestial",
    "noir",
    "rebellious",
  ],
  texture: ["dust", "embers", "smoke", "rain", "snow", "stars", "fireflies", "petals", "ash", "crystals", "confetti", "lightning", "bubbles", "moths", "glare", "glitch", "fire"],
  emotionalArc: ["slow-burn", "surge", "collapse", "dawn", "eruption"],
} as const;



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



function unwrapNested(obj: Record<string, any>): Record<string, any> {
  // If the AI wrapped everything under a single key, unwrap it
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    const inner = obj[keys[0]];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      // Check if the inner object looks like our expected structure
      if (
        inner.sceneTone ||
        inner.sections ||
        inner.typographyPlan
      ) {
        return inner;
      }
    }
  }
  return obj;
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

// validate() removed — legacy no-mode path deleted
function validateScene(
  raw: Record<string, any>,
  sectionCount: number,
  body: RequestBody,
): ValidationResult {
  const errors: string[] = [];
  const v = { ...raw };

  const DEFAULTS: Record<string, string> = {
    sceneTone: "dark",
    emotionalArc: "slow-burn",
  };
  for (const key of [
    "sceneTone",
    "emotionalArc",
  ] as const) {
    const allowed = ENUMS[key] as readonly string[];
    if (!v[key] || !allowed.includes(v[key])) {
      if (v[key]) errors.push(`Invalid ${key}: "${v[key]}"`);
      v[key] = DEFAULTS[key];
    }
  }

  if (v.typographyPlan && typeof v.typographyPlan === 'object') {
    const tp = v.typographyPlan;
    // SYNC REQUIREMENT: This list must match FONT_MANIFEST in src/lib/typographyManifest.ts.
    // When adding/removing fonts, update BOTH locations.
    const VALID_FONTS = [
      "Bebas Neue", "Permanent Marker", "Unbounded", "Dela Gothic One", "Oswald", "Barlow Condensed",
      "Archivo", "Montserrat", "Inter", "Sora", "Rubik", "Nunito", "Plus Jakarta Sans",
      "Bricolage Grotesque", "Playfair Display", "EB Garamond", "Cormorant Garamond", "DM Serif Display",
      "Instrument Serif", "Bitter", "JetBrains Mono", "Space Mono", "Caveat", "Lexend",
    ];
    tp.system = 'single';
    if (typeof tp.primary !== 'string' || !VALID_FONTS.some((f) => f.toLowerCase() === tp.primary?.toLowerCase())) {
      tp.primary = 'Montserrat';
    }
    if (tp.system !== 'paired') tp.accent = '';
    if (typeof tp.accent === 'string' && tp.accent && !VALID_FONTS.some((f) => f.toLowerCase() === tp.accent?.toLowerCase())) {
      tp.accent = '';
    }
    if (!['uppercase', 'sentence'].includes(tp.case)) tp.case = 'sentence';
    if (!['light', 'regular', 'bold', 'black'].includes(tp.baseWeight)) tp.baseWeight = 'bold';
    if (!['accent-font', 'weight-shift', 'scale-only', 'none'].includes(tp.heroStyle)) {
      tp.heroStyle = tp.system === 'paired' ? 'accent-font' : 'weight-shift';
    }
    if (!['low', 'medium', 'high'].includes(tp.accentDensity)) tp.accentDensity = 'low';
    if (tp.sectionBehavior && typeof tp.sectionBehavior === 'object') {
      const VALID_BEHAVIORS = ['restrained', 'narrative', 'raw', 'lift', 'tighten', 'hold', 'explode', 'anthem', 'contrast', 'strip', 'pivot', 'float', 'decay', 'resolve', 'linger'];
      for (const [key, val] of Object.entries(tp.sectionBehavior)) {
        if (typeof val !== 'string' || !VALID_BEHAVIORS.includes(val)) {
          delete tp.sectionBehavior[key];
        }
      }
    }
  }
  if (typeof v.description === "string")
    v.description = v.description.trim().slice(0, 200);

  if (!Array.isArray(v.sections)) {
    errors.push("sections must be an array");
    v.sections = [];
  } else {
    for (const s of v.sections) {
      if (
        !s.visualMood ||
        !(ENUMS.visualMood as readonly string[]).includes(s.visualMood)
      )
        s.visualMood = "intimate";
      if (
        typeof s.dominantColor !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(s.dominantColor)
      ) {
        const moodColorMap: Record<string, string> = {
          intimate: "#C9A96E",
          anthemic: "#E8632B",
          dreamy: "#B088F9",
          aggressive: "#4FA4D4",
          melancholy: "#2255AA",
          euphoric: "#FFD700",
          eerie: "#00BFA5",
          vulnerable: "#D4618C",
          triumphant: "#FFD700",
          nostalgic: "#A0845C",
          defiant: "#4FA4D4",
          hopeful: "#34D058",
          raw: "#A0A4AC",
          hypnotic: "#B088F9",
          ethereal: "#A8C4E0",
          haunted: "#5A6B7A",
          celestial: "#7B8EC4",
          noir: "#4A5568",
          rebellious: "#C44E2B",
        };
        s.dominantColor = moodColorMap[s.visualMood] || "#C9A96E";
      }
      if (typeof s.description !== "string" || !s.description.trim()) {
        const mood = s.visualMood || "cinematic";
        const sectionLines = (body.lines || []).filter((l: any) => {
          if (typeof l?.start !== "number") return false;
          const startSec =
            typeof s.suggestedStartSec === "number"
              ? s.suggestedStartSec
              : s.startSec;
          const endSec =
            typeof s.suggestedEndSec === "number"
              ? s.suggestedEndSec
              : s.endSec;
          if (typeof startSec !== "number" || typeof endSec !== "number")
            return false;
          return l.start >= startSec - 0.5 && l.start < endSec + 0.5;
        });
        const lyricsExcerpt = sectionLines
          .map((l: any) => l.text || "")
          .join(" ")
          .slice(0, 80);
        s.description = lyricsExcerpt
          ? `${mood} scene: ${lyricsExcerpt}`
          : `${mood} cinematic landscape`;
      }
      if (!s.texture || !(ENUMS.texture as readonly string[]).includes(s.texture)) {
        const moodTextureMap: Record<string, string> = {
          intimate: "fireflies", anthemic: "embers", dreamy: "stars",
          aggressive: "smoke", melancholy: "rain", euphoric: "confetti",
          eerie: "moths", vulnerable: "dust", triumphant: "glare",
          nostalgic: "dust", defiant: "lightning", hopeful: "petals",
          raw: "ash", hypnotic: "fireflies",
          ethereal: "crystals", haunted: "smoke", celestial: "stars",
          noir: "smoke", rebellious: "embers",
        };
        s.texture = moodTextureMap[s.visualMood] || "dust";
      }
      delete s.motion;
      delete s.atmosphere;
      delete s.typography;
      delete s.structuralLabel;
      // Fix sectionIndex to 0-based
      if (typeof s.sectionIndex === 'number' && s.sectionIndex > 0) {
        // Check if AI returned 1-based indices (common: example shows sectionIndex: 0 but AI may start at 1)
        const allIndices = v.sections.map((sec: any) => sec.sectionIndex).filter((n: any) => typeof n === 'number');
        const minIdx = Math.min(...allIndices);
        if (minIdx === 1) {
          // 1-based — will renumber after loop
        }
      }
    }
  }

  // Renumber sectionIndex to 0-based if AI returned 1-based
  if (v.sections.length > 0) {
    const indices = v.sections.map((s: any) => s.sectionIndex).filter((n: any) => typeof n === 'number');
    if (indices.length > 0 && Math.min(...indices) >= 1) {
      for (const s of v.sections) {
        if (typeof s.sectionIndex === 'number') s.sectionIndex -= 1;
      }
    }
    // Ensure sequential 0-based indices regardless
    v.sections.sort((a: any, b: any) => (a.sectionIndex ?? 0) - (b.sectionIndex ?? 0));
    v.sections.forEach((s: any, i: number) => { s.sectionIndex = i; });
  }

  if (sectionCount > 0 && v.sections.length !== sectionCount) {
    while (v.sections.length < sectionCount) {
      const lastIdx = v.sections.length;
      v.sections.push({
        sectionIndex: lastIdx,
        description: `Cinematic scene for section ${lastIdx + 1}`,
        visualMood: "intimate",
        dominantColor: ["#C9A96E", "#4FA4D4", "#D4618C", "#228844", "#B088F9", "#E8632B", "#FFD700", "#00BFA5"][lastIdx % 8],
      });
    }
    if (v.sections.length > sectionCount) {
      v.sections = v.sections.slice(0, sectionCount);
    }
  }

  delete v.storyboard;
  delete v.wordDirectives;

  const FORBIDDEN = [
    "motion",
    "atmosphere",
    "colorHex",
    "physicsProfile",
    "cameraLanguage",
    "tensionCurve",
    "fontSize",
    "position",
    "scaleX",
    "scaleY",
    "color",
    "glow",
    "kineticClass",
    "zoom",
    "driftIntensity",
    "startRatio",
    "endRatio",
    "chapters",
    "visualWorld",
    "beatAlignment",
  ];
  for (const key of FORBIDDEN) delete v[key];

  return { ok: errors.length === 0, errors, value: v };
}


async function callScene(
  apiKey: string,
  userMessage: string,
  sectionCount: number,
  body: RequestBody,
  sceneSystemPrompt: string = SCENE_DIRECTION_PROMPT,
  modelOverride: string = PRIMARY_MODEL,
  audioBase64?: string,
): Promise<Record<string, any>> {
  const userContent = audioBase64
    ? [
        { type: "text", text: userMessage },
        {
          type: "image_url",
          image_url: {
            url: `data:audio/mpeg;base64,${audioBase64}`,
          },
        },
      ]
    : userMessage;

  const messages = [
    { role: "system", content: sceneSystemPrompt },
    { role: "user", content: userContent },
  ];

  const makeRequest = async (model: string) => {
    try {
      return await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            max_completion_tokens: 8000,
          }),
        },
        120000,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[cinematic-direction] scene request timed out for model ${model}`);
        throw {
          status: 504,
          message: `Scene direction AI timed out for model ${model}`,
        };
      }
      throw error;
    }
  };

  let resp: Response;
  try {
    resp = await makeRequest(modelOverride);
  } catch (error: any) {
    const status = error?.status ?? 500;
    if (status === 504 && modelOverride !== FALLBACK_MODEL) {
      console.warn(
        `[cinematic-direction] scene primary model timed out, trying fallback ${FALLBACK_MODEL}`,
      );
      await new Promise((r) => setTimeout(r, 1500));
      resp = await makeRequest(FALLBACK_MODEL);
    } else {
      throw error;
    }
  }

  // If primary model fails with retryable error, try fallback
  if (!resp.ok && (resp.status === 400 || resp.status === 429 || resp.status >= 500)) {
    const errText = await resp.text().catch(() => "");
    console.warn(
      `[cinematic-direction] scene primary model failed (${resp.status}): ${errText.slice(0, 200)}, trying fallback`,
    );
    await new Promise((r) => setTimeout(r, 2000));
    resp = await makeRequest(FALLBACK_MODEL);
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[cinematic-direction] scene AI error", resp.status, text);
    throw {
      status: resp.status,
      message:
        resp.status === 429
          ? "Rate limited"
          : `Scene direction AI failed (HTTP ${resp.status})`,
    };
  }

  const sceneRespText = await resp.text();
  let completion: any;
  try {
    completion = JSON.parse(sceneRespText);
  } catch {
    console.error("[cinematic-direction] scene response not valid JSON, length:", sceneRespText.length, "preview:", sceneRespText.slice(0, 200));
    throw { status: 502, message: "Scene direction AI returned invalid response" };
  }
  const finishReason = completion?.choices?.[0]?.finish_reason;
  const raw = String(completion?.choices?.[0]?.message?.content ?? "");

  if (finishReason === "length") {
    console.warn(
      "[cinematic-direction] scene response truncated (finish_reason=length), raw length:",
      raw.length,
    );
  }

  let parsed = extractJson(raw);

  // If parse failed or response was truncated, retry once
  if (!parsed || finishReason === "length") {
    console.warn(
      "[cinematic-direction] scene first attempt failed to parse or was truncated, retrying. Raw preview:",
      raw.slice(0, 300),
    );

    let retryResp: Response;
    try {
      retryResp = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
              model: modelOverride,
              messages: [
                { role: "system", content: sceneSystemPrompt },
                { role: "user", content: userContent },
                {
                  role: "user",
                  content:
                  'Your previous response was malformed or truncated. Return ONLY valid JSON with "description", "sceneTone", "typographyPlan", "emotionalArc", and "sections" array. Each section needs: sectionIndex (starting at 0), description, dominantColor, visualMood, texture. No markdown.',
              },
            ],
            max_completion_tokens: 8000,
          }),
        },
      );
    } catch (error) {
      throw normalizeAbortError(
        error,
        `Scene direction AI timed out during retry for model ${modelOverride}`,
      );
    }

    if (retryResp.ok) {
      const retryRespText = await retryResp.text();
      let retryCompletion: any;
      try {
        retryCompletion = JSON.parse(retryRespText);
      } catch {
        console.error("[cinematic-direction] scene retry response not valid JSON, preview:", retryRespText.slice(0, 200));
        retryCompletion = null;
      }
      const retryRaw = String(
        retryCompletion?.choices?.[0]?.message?.content ?? "",
      );
      const retryParsed = extractJson(retryRaw);
      if (retryParsed) {
        parsed = retryParsed;
      } else {
        console.error(
          "[cinematic-direction] scene retry also failed to parse. Raw preview:",
          retryRaw.slice(0, 500),
        );
      }
    } else {
      const retryText = await retryResp.text();
      console.error(
        "[cinematic-direction] scene retry request failed:",
        retryResp.status,
        retryText,
      );
    }
  }

  if (!parsed)
    throw { status: 422, message: "Invalid JSON from scene direction AI" };

  const result = validateScene(parsed, sectionCount, body);
  return result.value;
}

/** Fetch custom prompts + models from ai_prompts table, falling back to hardcoded defaults. */
let _promptCache: {
  value: { scenePrompt: string; sceneModel: string };
  expiresAt: number;
} | null = null;
const PROMPT_CACHE_TTL_MS = 60_000;

async function loadCustomPrompts(): Promise<{
  scenePrompt: string;
  sceneModel: string;
}> {
  if (_promptCache && Date.now() < _promptCache.expiresAt) {
    return _promptCache.value;
  }

  const defaults = {
    scenePrompt: SCENE_DIRECTION_PROMPT,
    sceneModel: PRIMARY_MODEL,
  };
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return defaults;

  try {
    const slugs = ["cinematic-scene", "scene-model"];
    const res = await fetchWithTimeout(
      `${sbUrl}/rest/v1/ai_prompts?slug=in.(${slugs.join(",")})&select=slug,prompt`,
      {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      },
      5000,
    );
    if (!res.ok) {
      console.warn("[cinematic-direction] Failed to load custom prompts, using defaults");
      return defaults;
    }

    const rows: Array<{ slug: string; prompt: string }> = await res.json();
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.prompt]));

    const value = {
      scenePrompt: bySlug["cinematic-scene"] || SCENE_DIRECTION_PROMPT,
      sceneModel: bySlug["scene-model"]?.trim() || PRIMARY_MODEL,
    };

    _promptCache = { value, expiresAt: Date.now() + PROMPT_CACHE_TTL_MS };
    return value;
  } catch (e) {
    console.warn("[cinematic-direction] Error loading custom prompts:", e);
    return defaults;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Load custom prompts from admin panel (falls back to hardcoded defaults)
    const customPrompts = await loadCustomPrompts();

    const title = String(body.title ?? "").trim();
    const isInstrumental = !!body.instrumental;
    const artist = String(body.artist ?? "").trim();
    const bpm =
      typeof body.bpm === "number"
        ? body.bpm
        : ((body as any).beat_grid?.bpm ?? 0);

    const lines: LyricLine[] = Array.isArray(body.lines)
      ? body.lines
      : typeof body.lyrics === "string"
        ? body.lyrics
            .split(/\n+/)
            .map((t, i) => ({ text: t.trim(), start: i, end: i + 1 }))
            .filter((l) => l.text)
        : [];

    if (!title || !artist || (!isInstrumental && lines.length === 0 && !body.audio_url)) {
      return new Response(
        JSON.stringify({ error: "title and artist required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (body.mode === "scene") {
      let audioBase64: string | undefined;
      if (body.audio_url && !body.audio_url.startsWith("blob:")) {
        try {
          const audioResp = await fetchWithTimeout(
            body.audio_url,
            { method: "GET" },
            15_000,
          );
          if (!audioResp.ok) {
            throw new Error(`audio fetch failed (${audioResp.status})`);
          }
          const audioBytes = new Uint8Array(await audioResp.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < audioBytes.length; i += chunkSize) {
            binary += String.fromCharCode(
              ...audioBytes.subarray(i, Math.min(i + chunkSize, audioBytes.length)),
            );
          }
          audioBase64 = btoa(binary);
          console.log(
            `[cinematic-direction] attached audio for scene request (${audioBytes.length} bytes, base64 length ${audioBase64.length})`,
          );
        } catch (audioErr) {
          console.warn(
            "[cinematic-direction] failed to fetch audio for multimodal scene request, continuing without audio:",
            audioErr,
          );
        }
      }

      // Build user message for scene mode inline
      const sectionList = (body.audioSections || [])
        .map((s: AudioSectionInput, i: number) => `  Section ${i + 1}: "${s.role || `Section ${i + 1}`}" (${fmt(s.startSec)}–${fmt(s.endSec)}, energy: ${(s.avgEnergy ?? 0).toFixed(2)}, beats/sec: ${(s.beatDensity ?? 0).toFixed(1)})`)
        .join("\n");

      const sceneUserMessage = [
        body.artist_direction
          ? `ARTIST DIRECTION (this is the visual world — treat it as law): "${body.artist_direction}"`
          : "",
        `Song: "${title}" by ${artist}`,
        bpm ? `BPM: ${bpm}` : "",
        lines.length > 0
          ? `\nLyrics:\n${lines.map((l) => l.text).join("\n")}`
          : body.audio_url
          ? "\nNo lyrics text provided."
          : "",
        sectionList ? `\nAudio sections:\n${sectionList}` : "",
      ].filter(Boolean).join("\n");

      const systemPrompt = isInstrumental
        ? INSTRUMENTAL_SCENE_DIRECTION_PROMPT
        : customPrompts.scenePrompt;

      const sceneResult = await callScene(
        apiKey,
        sceneUserMessage,
        body.audioSections?.length ?? 0,
        body,
        systemPrompt,
        customPrompts.sceneModel,
        audioBase64,
      );

      return new Response(JSON.stringify({
        cinematicDirection: sceneResult,
        _meta: {
          model: customPrompts.sceneModel,
          scenePromptSource: systemPrompt === SCENE_DIRECTION_PROMPT
            ? "default"
            : systemPrompt === INSTRUMENTAL_SCENE_DIRECTION_PROMPT
              ? "instrumental"
              : "admin",
          scenePromptLength: systemPrompt.length,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy no-mode path removed — require mode parameter
    return new Response(
      JSON.stringify({ error: "mode parameter required. Use mode: scene" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
