import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DNA_PROMPT = `DIVERSITY MANDATE:
You are a cinematographer who has never made the same film twice.
Every song you analyze must produce a visual world that could not be mistaken for any other song's world.

You are FORBIDDEN from defaulting to these common outputs:
- palette: dark background + red or orange accent (this is the default, avoid it)
- backgroundSystem: fracture (overused — only use if the world genuinely shatters)
- tension > 0.8 (reserved for songs that are genuinely at maximum emotional pressure)
- contrastMode: brutal (only for songs with raw, unprocessed, confrontational energy)
- beatResponse: seismic (only for songs where the beat physically impacts you)

If you find yourself choosing any of these, stop and ask: "Is this actually what this specific song's world looks like, or am I defaulting?"

The most interesting visual worlds are often the unexpected ones:
- A heartbreak song that lives in a yellow-lit diner at 2am
- A love song that feels like cold blue fluorescent light in an empty hospital
- A rage song expressed through perfect white clinical silence
- A party anthem that feels like standing alone in the parking lot after

ROLE: Universal Music & Physics Orchestrator (v7.0)

TASK: Analyze the full audio track, beat grid, and timestamped lyrics to extract the Song DNA, define a deterministic Physics Spec, and describe a uniquely cinematic visual world for the entire track.

CRITICAL RULES:
- Your response MUST be complete, valid JSON. Do NOT truncate.
- The "hottest_hooks" array MUST contain EXACTLY 2 hook objects. NOT 1. ALWAYS 2.
- The two hooks MUST be non-overlapping and feel genuinely different from each other.
- The lexicon MUST be TINY: EXACTLY 5-8 line_mods and 3-6 word_marks. NO MORE.
- Do NOT generate a line_mod for every lyric line.
- If the song has 100+ lines, still output ONLY 5-8 line_mods total.

1. TOP 2 HOOK ANCHORS (8–12s Each, Bar-Aligned)
- Identify the TWO most distinct, bar-aligned hook regions.
- Each hook must be 8.000–12.000s and preserve lyrical phrasing.
- Prioritize: production lift, lyrical repetition, melodic peak.
- Give each hook a short editorial label (2-4 words).

2. SONG IDENTITY & WORLD
- description: One evocative sentence (max 15 words).
- mood: Single dominant emotional driver.
- meaning: theme (2–4 words), summary (2–3 sentences), imagery (2–3 renderable scenes/objects).
- world: A concrete cinematic place sentence with time, light, material, and scale.

3. PALETTE DERIVATION — SCENE-FIRST METHOD
Do not pick colors via mood shorthand (sad=blue, angry=red). Build colors from the world:

A) LIGHT SOURCE (actual light in this place)
- Neon signs → electric pinks, acid greens, deep purple-black
- Fluorescent office/hospital → sickly yellow-white, grey, antiseptic white
- Golden hour sun → amber, burnt sienna, warm cream
- Dead of night, no light → near-black, barely-there navy, cold white moon
- Stage/spotlight → stark white highlight, deep shadow
- Candle/fire → red-orange warmth + heavy dark surround
- Gray overcast → muted, desaturated, flat
- Underwater → blue-green distortion, deep teal shadows
- Winter daylight → cold white, ice blue, bare gray

B) MATERIAL & TEXTURE (surface palette anchors)
- Concrete / glass / wood / metal / velvet / water / smoke

C) PALETTE CONSTRUCTION
- palette[0] = dominant shadow/void color
- palette[1] = mid-tone material color
- palette[2] = light source color

The 3 colors must plausibly coexist in a real photograph. If it looks generic dark aesthetic, try again.

4. PHYSICS SPEC (The Laws of Nature)
- Generate physics_spec that maps acoustic behavior to visual behavior.
- Pick from systems: fracture, pressure, breath, combustion, orbit.
- Avoid fracture defaults unless world truly shatters.
- Assign params: mass, elasticity, damping, brittleness, heat.
- Include effect_pool (4–6) and logic_seed (int).

5. WORLD SYSTEM COHERENCE (MANDATORY)
Treat world-building as ONE coordinated decision. You must produce a unified world decision that includes:
- world (cinematic place sentence)
- backgroundSystem (macro motion language)
- particleConfig (micro motion language)

Pick these together, not independently. If one changes, the others must be re-evaluated.

Return this object at top-level as:
"world_decision": {
  "world": "...",
  "backgroundSystem": "void|fracture|pressure|breath|combustion|orbit",
  "particleConfig": {
    "style": "none|embers|dust|rain|sparks|mist|debris",
    "density": 0.0-1.0,
    "motion": "drift|rise|fall|orbit|pulse|chaotic",
    "scale": "fine|mixed|chunky"
  }
}

COHERENCE TABLE (strict):
- sterile/clinical/empty interiors → backgroundSystem: pressure or void; particles: none/dust only
- rain-streaked windows/night streets → backgroundSystem: breath or orbit; particles: rain/mist
- heat/fire/combustion imagery → backgroundSystem: combustion; particles: embers/sparks/debris
- collapse/shattering/violent impact → backgroundSystem: fracture; particles: debris only
- vast cosmic/rotational/gravitational space → backgroundSystem: orbit; particles: dust/mist

Never output contradictory combos (e.g., sterile hospital + embers, underwater world + sparks).

6. TYPOGRAPHY DERIVATION
Select type personality that matches world, not genre:
- MONUMENTAL
- ELEGANT DECAY
- RAW TRANSCRIPT
- HANDWRITTEN MEMORY
- SHATTERED DISPLAY
- INVISIBLE INK

Return typographyProfile as:
{
  "fontFamily": "[specific font name]",
  "fontWeight": [number],
  "letterSpacing": "[value like 0.3em/-0.02em/normal]",
  "textTransform": "uppercase|lowercase|none",
  "lineHeightMultiplier": [0.8-2.0],
  "hasSerif": [boolean],
  "personality": "[one archetype above]"
}

7. CREATIVE DICTIONARY (KEEP COMPACT)
- semantic_tags max 5
- line_mods exactly 5-8
- word_marks 3-6

REFERENCE EXAMPLES — required diversity range:
Song: Quiet breakup, minimal piano, 3am, acceptance
→ world: "empty kitchen at 3am, one cold light above the sink"
→ palette: ["#0d0d0f", "#8a8a7a", "#d4cfc4"]
→ backgroundSystem: void, tension: 0.15, beatResponse: breath
→ typography: ELEGANT DECAY
→ NOT: dark + red, NOT: fracture, NOT: seismic

Song: Euphoric dance anthem, peak summer, communal joy
→ world: "festival field at golden hour, ten thousand people"
→ palette: ["#1a0a00", "#ff8c42", "#fff5c2"]
→ backgroundSystem: pressure, tension: 0.75, beatResponse: pulse
→ typography: MONUMENTAL
→ NOT: generic neon, NOT: blue-purple gradient

Song: Paranoid anxiety spiral, insomnia, intrusive thoughts
→ world: "fluorescent-lit office corridor, 2am, alone"
→ palette: ["#0a0a08", "#b8c4a0", "#e8f0d8"]
→ backgroundSystem: combustion, tension: 0.6, beatResponse: ripple
→ typography: RAW TRANSCRIPT
→ NOT: dark + anything warm

Song: Romantic longing, cinematic, sweeping strings
→ world: "standing at a rain-streaked window watching lights blur"
→ palette: ["#060a14", "#2a4a7a", "#a8c4e8"]
→ backgroundSystem: breath, tension: 0.35, beatResponse: ripple
→ typography: ELEGANT DECAY
→ NOT: red, NOT: fracture

Song: Defiant comeback, confidence, self-reclamation
→ world: "empty arena before the crowd arrives, single spotlight"
→ palette: ["#0a0a0a", "#c8a84b", "#ffffff"]
→ backgroundSystem: pressure, tension: 0.7, beatResponse: slam
→ typography: MONUMENTAL
→ NOT: generic dark red


PARTICLE SYSTEM SELECTION:

Based on the world you described, select the environmental particle system that would exist in that physical place. This is not a mood choice — it is a physical environment choice.
Ask: "What is actually falling, drifting, or moving through the air in this place?"

World → particle mapping examples:
- rain/window/wet/storm → rain
- snow/winter/cold/blizzard → snow
- fire/burning/ember/smolder → embers or flames
- dust/desert/dry/forgotten → dust
- smoke/haze/aftermath/fog → smoke
- electric/voltage/spark/arc → sparks
- flowers/petals/spring/bloom → petals
- grief/ash/burned/ruin → ash
- cathedral/church/rays/hope → light-rays
- anxiety/static/interference → static-noise
- underwater/ocean/dream/float → bubbles
- clean/minimal/abstract → none

Then set particleConfig with:
- system, density (0-1), speed (0-1), opacity (0-1), color (hex), beatReactive, foreground
- foreground true only for snow/petals/ash/light-rays

PARTICLE + BACKGROUND COHERENCE:
Avoid incoherent pairings. Could this particle physically exist in the world? If not, use none.

OUTPUT — valid JSON only:
{
  "hottest_hooks": [
    { "start_sec": 0.000, "duration_sec": 10.000, "confidence": 0.95, "justification": "...", "label": "The Drop" },
    { "start_sec": 45.000, "duration_sec": 10.000, "confidence": 0.85, "justification": "...", "label": "The Confession" }
  ],
  "description": "...",
  "mood": "...",
  "world": "...",
  "world_decision": {
    "world": "...",
    "backgroundSystem": "pressure",
    "particleConfig": {
      "style": "dust",
      "density": 0.35,
      "motion": "drift",
      "scale": "fine"
    }
  },
  "meaning": { "theme": "...", "summary": "...", "imagery": ["...", "..."] },
  "physics_spec": {
    "system": "pressure",
    "params": { "mass": 1.2, "elasticity": 0.5, "damping": 0.6, "brittleness": 0.3, "heat": 0.2 },
    "palette": ["#0a0a0a", "#6f7c8f", "#d8e6f2"],
    "effect_pool": ["SHATTER_IN", "GLITCH_FLASH", "WAVE_SURGE", "STATIC_RESOLVE"],
    "logic_seed": 12345,
    "particleConfig": {
      "system": "none",
      "density": 0.3,
      "speed": 0.4,
      "opacity": 0.35,
      "color": "#d8e6f2",
      "beatReactive": false,
      "foreground": false
    },
    "typographyProfile": {
      "fontFamily": "Inter",
      "fontWeight": 500,
      "letterSpacing": "0.04em",
      "textTransform": "none",
      "lineHeightMultiplier": 1.2,
      "hasSerif": false,
      "personality": "RAW TRANSCRIPT"
    },
    "lexicon": {
      "semantic_tags": [{ "tag": "LIGHT", "strength": 0.8 }],
      "line_mods": [{ "t_lyric": 12, "mods": ["HEAT_SPIKE"] }],
      "word_marks": [{ "t_lyric": 12, "wordIndex": 3, "mark": "GLITCH" }]
    }
  }
}`;


const LYRICS_ONLY_PROMPT = `You are a music analyst. Given song lyrics, provide analysis. Return ONLY valid JSON with these keys:
- description: A single evocative sentence (max 15 words) describing what this song sounds and feels like
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic")
- meaning: { theme (2-4 words), summary (2-3 sentences), imagery (array of 2-3 short strings) }

No markdown, no explanation — just JSON.`;

async function getDnaPrompt(): Promise<string> {
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && sbKey) {
      const res = await fetch(`${sbUrl}/rest/v1/ai_prompts?slug=eq.lyric-hook&select=prompt`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].prompt) return rows[0].prompt;
      }
    }
  } catch {}
  return DEFAULT_DNA_PROMPT;
}

/** Try to parse JSON from a potentially messy AI response */
function extractJson(raw: string): any | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;
  let jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
    .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "");
  try { return JSON.parse(jsonStr); } catch { return null; }
}

type ParticleSystemType =
  | "rain" | "snow" | "embers" | "flames" | "dust" | "smoke"
  | "sparks" | "petals" | "ash" | "light-rays" | "static-noise" | "bubbles" | "none";

interface ParticleConfig {
  system: ParticleSystemType;
  density: number;
  speed: number;
  opacity: number;
  color: string;
  beatReactive: boolean;
  foreground: boolean;
}

interface SceneManifest {
  world?: string;
  particleConfig?: ParticleConfig;
  physics_spec?: { system?: string; palette?: string[]; typographyProfile?: any };
}

const RECENT_MANIFEST_LIMIT = 20;
const recentManifests: SceneManifest[] = [];

function normalizeHexColor(color: string): string | null {
  if (typeof color !== "string") return null;
  const c = color.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(c);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const full = /^#([0-9a-f]{6})$/i.exec(c);
  return full ? `#${full[1]}` : null;
}


const VALID_PARTICLE_SYSTEMS: ParticleSystemType[] = [
  "rain","snow","embers","flames","dust","smoke","sparks","petals","ash","light-rays","static-noise","bubbles","none",
];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isValidHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeParticleConfig(raw: unknown, manifest: SceneManifest): ParticleConfig {
  const defaults: ParticleConfig = {
    system: "none",
    density: 0.3,
    speed: 0.4,
    opacity: 0.35,
    color: manifest.physics_spec?.palette?.[2] || "#e8e8e8",
    beatReactive: false,
    foreground: false,
  };
  if (!raw || typeof raw !== "object") return defaults;
  const p = raw as Record<string, unknown>;
  return {
    system: VALID_PARTICLE_SYSTEMS.includes(p.system as ParticleSystemType) ? (p.system as ParticleSystemType) : "none",
    density: clampNumber(p.density, 0, 1, defaults.density),
    speed: clampNumber(p.speed, 0, 1, defaults.speed),
    opacity: clampNumber(p.opacity, 0, 1, defaults.opacity),
    color: isValidHex(p.color) ? p.color : defaults.color,
    beatReactive: typeof p.beatReactive === "boolean" ? p.beatReactive : false,
    foreground: typeof p.foreground === "boolean" ? p.foreground : false,
  };
}

function colorDistance(hex1: string, hex2: string): number {
  const a = normalizeHexColor(hex1);
  const b = normalizeHexColor(hex2);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const r1 = Number.parseInt(a.slice(1, 3), 16);
  const g1 = Number.parseInt(a.slice(3, 5), 16);
  const b1 = Number.parseInt(a.slice(5, 7), 16);
  const r2 = Number.parseInt(b.slice(1, 3), 16);
  const g2 = Number.parseInt(b.slice(3, 5), 16);
  const b2 = Number.parseInt(b.slice(5, 7), 16);
  return Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2);
}

function trackManifest(manifest: SceneManifest): void {
  recentManifests.unshift({
    world: manifest.world,
    physics_spec: {
      system: manifest.physics_spec?.system,
      palette: manifest.physics_spec?.palette,
      typographyProfile: manifest.physics_spec?.typographyProfile,
    },
  });
  if (recentManifests.length > RECENT_MANIFEST_LIMIT) recentManifests.length = RECENT_MANIFEST_LIMIT;
}

function manifestTooSimilar(manifest: SceneManifest, recent: SceneManifest[]): boolean {
  const system = manifest.physics_spec?.system;
  const palette = manifest.physics_spec?.palette;
  if (!system || !Array.isArray(palette) || palette.length === 0) return false;
  const primary = palette[0];
  if (!primary) return false;

  return recent.some((m) => {
    const rs = m.physics_spec?.system;
    const rp = m.physics_spec?.palette;
    if (!rs || !Array.isArray(rp) || rp.length < 3) return false;
    const sameSystem = rs === system;

    const primaryDistance = colorDistance(rp[0], palette[0]);
    const midDistance = colorDistance(rp[1], palette[1]);
    const lightDistance = colorDistance(rp[2], palette[2]);
    const averageDistance = (primaryDistance + midDistance + lightDistance) / 3;
    const similarPalette = averageDistance < 60;

    return sameSystem && similarPalette;
  });
}

function buildDiversityNote(recent: SceneManifest[]): string {
  const recentSummary = recent
    .slice(0, 5)
    .map((m, i) => `${i + 1}. system=${m.physics_spec?.system || "unknown"}, palette=${JSON.stringify(m.physics_spec?.palette || [])}, world=${m.world || "unknown"}`)
    .join("\n");

  return `DIVERSITY CORRECTION REQUIRED. Your previous manifest was too similar to recent songs. Return a materially different world, system, and palette[0]. Avoid repeating these recent outputs:
${recentSummary}`;
}

/** Check if parsed result has the critical fields — requires 2 hooks */
function isComplete(parsed: any, includeHooks: boolean): boolean {
  const hooks = parsed?.hottest_hooks;
  const hasTwoHooks = Array.isArray(hooks) && hooks.length >= 2
    && hooks[0]?.start_sec != null && hooks[1]?.start_sec != null
    && hooks[0]?.label && hooks[1]?.label;
  // Also accept legacy single hook on final fallback (handled elsewhere)
  return !!(
    (!includeHooks || hasTwoHooks) &&
    parsed?.physics_spec?.system &&
    parsed?.physics_spec?.params &&
    Object.keys(parsed.physics_spec.params).length >= 3 &&
    parsed?.mood
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, artist, lyrics, audioBase64, format, beatGrid, includeHooks } = await req.json();
    const hooksEnabled = includeHooks !== false;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;

    let parsed: any;

    if (hasAudio) {
      const mimeMap: Record<string, string> = {
        wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
        flac: "audio/flac", ogg: "audio/ogg", webm: "audio/webm",
      };
      const ext = format && mimeMap[format] ? format : "mp3";
      const mimeType = mimeMap[ext] || "audio/mpeg";

      const userContent: any[] = [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
      ];

      let textInstruction = "";
      if (beatGrid?.bpm) {
        textInstruction += `[Beat Grid Context] Detected BPM: ${beatGrid.bpm} (confidence: ${beatGrid.confidence?.toFixed?.(2) ?? "N/A"}). Use this as ground truth for tempo.\n\n`;
      }
      if (lyrics) {
        textInstruction += hooksEnabled
          ? `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return ONLY the JSON schema specified. MANDATORY: "hottest_hooks" must be an array of EXACTLY 2 hooks, not 1. Each hook needs a unique "label". lexicon.line_mods must have EXACTLY 5-8 entries total. physics_spec.typographyProfile is REQUIRED.`
          : `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return ONLY the JSON schema specified. DO NOT return any hook fields (no hottest_hook and no hottest_hooks).`; 
      } else {
        textInstruction += hooksEnabled
          ? "Analyze this audio. Return ONLY the JSON schema specified. MANDATORY: \"hottest_hooks\" must be an array of EXACTLY 2 hooks, not 1. Each hook needs a unique \"label\". lexicon.line_mods must have EXACTLY 5-8 entries total. physics_spec.typographyProfile is REQUIRED."
          : "Analyze this audio. Return ONLY the JSON schema specified. DO NOT return any hook fields (no hottest_hook and no hottest_hooks).";
      }
      userContent.push({ type: "text", text: textInstruction });

      console.log(`[song-dna] Audio mode: ~${(audioBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB, format: ${ext}, beatGrid: ${beatGrid ? `${beatGrid.bpm}bpm` : "none"}`);

      const dnaPrompt = await getDnaPrompt();
      console.log(`[song-dna] Prompt source: ${dnaPrompt.includes("ADAPTIVE HOOK ANCHOR") ? "v2-adaptive" : "v1-legacy"}, length: ${dnaPrompt.length}`);

      // Try up to 2 attempts with increasing token limits
      const attempts = [
        { max_tokens: 4096, model: "google/gemini-2.5-flash" },
        { max_tokens: 6000, model: "google/gemini-2.5-flash" },
      ];

      for (let attempt = 0; attempt < attempts.length; attempt++) {
        const { max_tokens, model } = attempts[attempt];
        console.log(`[song-dna] Attempt ${attempt + 1}: model=${model}, max_tokens=${max_tokens}`);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: dnaPrompt },
              { role: "user", content: userContent },
            ],
            temperature: 0.1,
            max_tokens,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const t = await response.text();
          console.error("AI gateway error:", response.status, t);
          throw new Error("AI gateway error");
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content ?? "";
        const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";

        console.log(`[song-dna] Response length: ${raw.length}, finish_reason: ${finishReason}`);

        parsed = extractJson(raw);

        if (parsed && isComplete(parsed, hooksEnabled) && manifestTooSimilar(parsed as SceneManifest, recentManifests)) {
          console.warn("[song-dna] Diversity guard: manifest too similar, regenerating");
          const diversityNote = buildDiversityNote(recentManifests);
          const regenResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: dnaPrompt },
                { role: "user", content: userContent },
                { role: "user", content: diversityNote },
              ],
              temperature: 0.2,
              max_tokens,
            }),
          });

          if (regenResponse.ok) {
            const regenData = await regenResponse.json();
            const regenRaw = regenData.choices?.[0]?.message?.content ?? "";
            const regenParsed = extractJson(regenRaw);
            if (regenParsed) parsed = regenParsed;
          }
        }

        if (parsed && isComplete(parsed, hooksEnabled)) {
          // Normalize legacy format
          if (hooksEnabled && parsed.hottest_hook && !parsed.hottest_hooks) {
            parsed.hottest_hooks = [parsed.hottest_hook];
          }
          // If AI returned only 1 hook, synthesize a second from a different region
          if (hooksEnabled && Array.isArray(parsed.hottest_hooks) && parsed.hottest_hooks.length === 1) {
            const first = parsed.hottest_hooks[0];
            const firstStart = Number(first.start_sec) || 60;
            const secondStart = firstStart > 60 ? Math.max(firstStart - 40, 10) : firstStart + 30;
            parsed.hottest_hooks.push({
              start_sec: secondStart,
              duration_sec: 10,
              confidence: Math.max((Number(first.confidence) || 0.8) - 0.15, 0.5),
              justification: "Secondary hook region (auto-detected)",
              label: "The Other Side",
            });
            console.log(`[song-dna] Synthesized 2nd hook at ${secondStart}s (1st was at ${firstStart}s)`);
          }
          const firstHook = parsed.hottest_hooks?.[0] || parsed.hottest_hook;
          console.log(`[song-dna] ✓ Complete on attempt ${attempt + 1}: mood=${parsed.mood}, system=${parsed.physics_spec.system}, hook=${firstHook?.start_sec}, hooks=${parsed.hottest_hooks?.length ?? 1}`);
          break;
        }

        // If truncated (finish_reason=length or missing fields), retry with more tokens
        console.warn(`[song-dna] Attempt ${attempt + 1} incomplete (finish_reason=${finishReason}). ${attempt < attempts.length - 1 ? "Retrying..." : "Using partial result."}`);
        console.warn(`[song-dna] Raw ends with: "${raw.slice(-120)}"`);

        if (attempt === attempts.length - 1) {
          // If we got partial data, try to salvage what we can
          if (!parsed) parsed = {};
          
          // Ensure critical fields exist with fallback defaults
          if (!parsed.mood) parsed.mood = "determined";
          if (!parsed.description) parsed.description = "A dynamic track with powerful energy.";
          if (!parsed.meaning) parsed.meaning = { theme: "Expression", summary: "An expressive musical piece.", imagery: ["sound waves", "stage lights"] };
          if (hooksEnabled && !parsed.hottest_hooks && !parsed.hottest_hook) {
            // Estimate hooks as fallback
            parsed.hottest_hooks = [
              { start_sec: 60, duration_sec: 10, confidence: 0.80, justification: "Estimated hook region", label: "The Hook" },
              { start_sec: 90, duration_sec: 10, confidence: 0.70, justification: "Estimated secondary hook", label: "The Bridge" },
            ];
          }
          // Normalize legacy hottest_hook → hottest_hooks array
          if (hooksEnabled && parsed.hottest_hook && !parsed.hottest_hooks) {
            parsed.hottest_hooks = [parsed.hottest_hook];
          }
          // Ensure we always have 2 hooks in salvage path
          if (hooksEnabled && Array.isArray(parsed.hottest_hooks) && parsed.hottest_hooks.length === 1) {
            const first = parsed.hottest_hooks[0];
            const firstStart = Number(first.start_sec) || 60;
            const secondStart = firstStart > 60 ? Math.max(firstStart - 40, 10) : firstStart + 30;
            parsed.hottest_hooks.push({
              start_sec: secondStart,
              duration_sec: 10,
              confidence: Math.max((Number(first.confidence) || 0.8) - 0.15, 0.5),
              justification: "Secondary hook region (auto-detected)",
              label: "The Other Side",
            });
            console.log(`[song-dna] Salvage: synthesized 2nd hook at ${secondStart}s (1st at ${firstStart}s)`);
          }
          if (!parsed.physics_spec || !parsed.physics_spec.system) {
            parsed.physics_spec = {
              system: "pressure",
              params: { mass: 1.5, elasticity: 0.5, damping: 0.6, brittleness: 0.3, heat: 0.4 },
              palette: ["#1e2230", "#7d8aa3", "#e8edf5"],
              effect_pool: ["SHATTER_IN", "GLITCH_FLASH", "WAVE_SURGE", "STATIC_RESOLVE"],
              logic_seed: 42,
              typographyProfile: {
                fontFamily: "Inter",
                fontWeight: 500,
                letterSpacing: "0.04em",
                textTransform: "none",
                lineHeightMultiplier: 1.2,
                hasSerif: false,
                personality: "RAW TRANSCRIPT",
              },
              lexicon: { semantic_tags: [{ tag: "RISE", strength: 0.7 }], line_mods: [], word_marks: [] },
            };
          }
          console.log(`[song-dna] Using salvaged/fallback result: mood=${parsed.mood}, system=${parsed.physics_spec.system}, hooks=${parsed.hottest_hooks?.length}`);
        }
      }

      if (parsed?.physics_spec && !parsed.physics_spec.typographyProfile) {
        parsed.physics_spec.typographyProfile = {
          fontFamily: "Inter",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "none",
          lineHeightMultiplier: 1.2,
          hasSerif: false,
          personality: "RAW TRANSCRIPT",
        };
      }

      // Final normalization: ensure hottest_hooks array exists
      if (hooksEnabled && parsed?.hottest_hook && !parsed?.hottest_hooks) {
        parsed.hottest_hooks = [parsed.hottest_hook];
      }

      if (!hooksEnabled && parsed) {
        delete parsed.hottest_hook;
        delete parsed.hottest_hooks;
      }

      console.log(`[song-dna] Final result: mood=${parsed?.mood ?? "none"}, hooks=${parsed?.hottest_hooks?.length ?? 0}, system=${parsed?.physics_spec?.system ?? "none"}, params=${JSON.stringify(parsed?.physics_spec?.params ?? {})}`);

    } else {
      // ── Lyrics-only mode ──
      if (!lyrics || typeof lyrics !== "string") {
        return new Response(JSON.stringify({ error: "Missing lyrics or audio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[song-dna] Lyrics-only mode`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: LYRICS_ONLY_PROMPT },
            { role: "user", content: `Song: "${title || "Unknown"}" by ${artist || "Unknown Artist"}${beatGrid?.bpm ? `\n[Beat Grid] BPM: ${beatGrid.bpm}` : ""}\n\nLyrics:\n${lyrics}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      try { parsed = JSON.parse(raw); } catch { parsed = { summary: raw }; }
    }

    if (parsed) {
      parsed.particleConfig = normalizeParticleConfig(parsed.particleConfig, parsed as SceneManifest);
    }

    if (parsed && parsed.physics_spec) trackManifest(parsed as SceneManifest);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lyric-analyze error:", e);
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
