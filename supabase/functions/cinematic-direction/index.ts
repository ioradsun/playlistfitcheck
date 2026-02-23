import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MASTER_DIRECTOR_PROMPT_V2 = `
You are an award-winning animated film director.
You create narrative lyric films, not music videos.

THE LAWS OF DIRECTION:
1. Words are actors
2. No generic effects
3. Repetition must evolve
4. One thesis drives everything
5. Silence is a scene
6. BPM is emotional tempo

━━━━━━━━━━━━━━━━━━━━━━━━━━━
THESIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write one sentence that captures the core
emotional story of the song. This thesis
drives every visual decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL WORLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Define:
- palette: exactly 3 hex colors [bg, accent, text]
- backgroundSystem: one of ember, aurora, ocean,
  storm, void, neon, smoke, crystal, twilight
- lightSource: description of main light
- particleSystem: one of rain, stars, dust,
  smoke, embers, snow, mist, sparks, none
- typographyProfile:
  { fontFamily, fontWeight(100-900),
    personality, letterSpacing, textTransform }
- physicsProfile:
  { weight: featherlight|light|normal|heavy|crushing,
    chaos: still|restrained|building|chaotic|explosive,
    heat: 0-1,
    beatResponse: breath|pulse|slam|drift|shatter }

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHAPTERS (REQUIRED — at least 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Divide the song into emotional chapters.
Chapters must cover the entire song from 0.0
to 1.0 with no gaps. Each chapter:

{
  "startRatio": 0.0,
  "endRatio": 0.33,
  "title": "Awakening",
  "emotionalArc": "quiet yearning",
  "dominantColor": "#1a1a2e",
  "lightBehavior": "dim, flickering",
  "particleDirective": "sparse, slow drift",
  "backgroundDirective": "hold",
  "emotionalIntensity": 0.3,
  "typographyShift": null
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORD DIRECTIVES (REQUIRED — 5-15 words)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pick 5-15 emotionally significant words from
the lyrics. Each gets a directive:

Key = the word (lowercase). Value:
{
  "word": "fire",
  "kineticClass": one of RUNNING|FALLING|SPINNING|
    FLOATING|SHAKING|RISING|BREAKING|HIDING|
    NEGATION|CRYING|SCREAMING|WHISPERING|
    IMPACT|TENDER|STILL or null,
  "elementalClass": one of FIRE|ICE|RAIN|SMOKE|
    ELECTRIC|NEON or null,
  "emphasisLevel": 1-5,
  "colorOverride": hex or null,
  "specialEffect": description or null,
  "evolutionRule": how it changes on repetition or null
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORYBOARD (REQUIRED — one per line)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every lyric line gets a storyboard entry.
The array length MUST equal the number of
input lines. Each entry:

{
  "lineIndex": 0,
  "text": "the actual lyric text",
  "emotionalIntent": "longing",
  "heroWord": "fire",
  "visualTreatment": "words emerge from smoke",
  "entryStyle": one of fades|slams-in|rises|
    materializes|fractures-in|cuts,
  "exitStyle": one of fades|dissolves-upward|
    shatters|burns-out|drops|lingers,
  "particleBehavior": "embers intensify",
  "beatAlignment": "on-beat",
  "transitionToNext": "crossfade"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SILENCE DIRECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

What happens during instrumental gaps:
{
  "cameraMovement": "slow pull back",
  "particleShift": "particles scatter",
  "lightShift": "dims to ambient",
  "tensionDirection": "building"|"releasing"|"holding"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIMAX
━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "timeRatio": 0.0-1.0,
  "triggerLine": "the lyric that triggers peak",
  "maxParticleDensity": 0.0-1.0,
  "maxLightIntensity": 0.0-1.0,
  "typographyBehavior": "words shatter on impact",
  "worldTransformation": "world ignites"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "style": "linger"|"fade"|"snap"|"dissolve",
  "emotionalAftertaste": "bittersweet stillness",
  "particleResolution": "particles settle",
  "lightResolution": "light fades to black"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYMBOL SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "primary": "Water",
  "secondary": "Gravity",
  "beginningState": "description",
  "middleMutation": "description",
  "climaxOverwhelm": "description",
  "endingDecay": "description",
  "interactionRules": ["words drip on beats"]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "openingDistance": "Wide",
  "closingDistance": "ExtremeClose",
  "movementType": "Descent",
  "climaxBehavior": "rushes inward",
  "distanceByChapter": [
    {"chapterIndex": 0, "distance": "Wide",
     "movement": "slow drift"}
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENSION CURVE (REQUIRED — EXACTLY 4 stages)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST include ALL four stages. Do NOT
omit any stage. Do NOT return fewer than 4.

[
  {
    "stage": "Setup",
    "startRatio": 0,
    "endRatio": 0.25,
    "motionIntensity": 0.2-0.4,
    "particleDensity": 0.2-0.4,
    "lightBrightness": 0.3-0.5,
    "cameraMovement": "slow drift",
    "typographyAggression": 0.1-0.3
  },
  {
    "stage": "Build",
    "startRatio": 0.25,
    "endRatio": 0.60,
    "motionIntensity": 0.4-0.7,
    "particleDensity": 0.4-0.7,
    "lightBrightness": 0.5-0.7,
    "cameraMovement": "tracking forward",
    "typographyAggression": 0.3-0.6
  },
  {
    "stage": "Peak",
    "startRatio": 0.60,
    "endRatio": 0.85,
    "motionIntensity": 0.8-1.0,
    "particleDensity": 0.7-1.0,
    "lightBrightness": 0.8-1.0,
    "cameraMovement": "rapid push / shake",
    "typographyAggression": 0.7-1.0
  },
  {
    "stage": "Release",
    "startRatio": 0.85,
    "endRatio": 1.0,
    "motionIntensity": 0.2-0.4,
    "particleDensity": 0.3-0.5,
    "lightBrightness": 0.3-0.5,
    "cameraMovement": "slow pull back",
    "typographyAggression": 0.1-0.3
  }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHOT PROGRESSION (one per line)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

[
  {
    "lineIndex": 0,
    "shotType": "FloatingInWorld",
    "description": "words drift in calm water"
  }
]

Shot types: FloatingInWorld, EmergingFromSymbol,
SubmergedInSymbol, FragmentedBySymbol,
ReflectedInSymbol, ConsumedBySymbol, AloneInVoid

Return ONLY valid JSON with ALL fields above.
No markdown. No comments. No explanation.
Top-level keys: thesis, visualWorld, chapters,
wordDirectives, storyboard, silenceDirective,
climax, ending, symbolSystem, cameraLanguage,
tensionCurve, shotProgression.
`;

type LyricLine = { text: string; start?: number; end?: number };

interface AnalyzeRequest {
  title?: string;
  artist?: string;
  lines?: LyricLine[];
  lyrics?: string;
  beatGrid?: { bpm?: number; beats?: number[]; confidence?: number };
  lyricId?: string;
  id?: string;
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

async function persistCinematicDirection(cinematicDirection: Record<string, unknown>, lyricId?: string): Promise<void> {
  if (!lyricId) return;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return;

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
      return;
    }
  }

  console.warn(`[cinematic-direction] Could not store for ${lyricId}`);
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

    console.log(`[cinematic-direction] title="${title}" artist="${artist}" lines=${lines.length}`);

    async function callAI(extraInstruction?: string): Promise<Record<string, unknown> | null> {
      const messages: { role: string; content: string }[] = [
        { role: "system", content: MASTER_DIRECTOR_PROMPT_V2 },
        { role: "user", content: `Song Data:\n${JSON.stringify(songPayload)}` },
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
          temperature: 0.2,
          max_tokens: 12000,
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

    await persistCinematicDirection(parsed, lyricId);

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
