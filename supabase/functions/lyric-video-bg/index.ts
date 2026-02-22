import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BackgroundSystem =
  | "fracture"
  | "pressure"
  | "breath"
  | "static"
  | "burn"
  | "void";

interface SceneManifest {
  world: string;
  backgroundSystem: BackgroundSystem | string;
  lightSource: string;
  tension: number;
  palette: [string, string, string] | string[];
  coreEmotion: string;
}

const LYRIC_VIDEO_NEGATIVE_PROMPT = [
  "abstract",
  "geometric shapes",
  "particle effects",
  "smoke wisps",
  "gradient background",
  "bokeh balls",
  "lens flare",
  "glowing orbs",
  "digital art",
  "illustration",
  "cartoon",
  "anime",
  "painting",
  "watercolor",
  "text",
  "words",
  "typography",
  "letters",
  "human faces",
  "portraits",
  "generic music video aesthetic",
  "stock photo",
  "oversaturated",
  "HDR",
  "Instagram filter",
].join(", ");

const iconicFrameInstruction = `
COMPOSITION: This image must have one clear visual anchor —
a single element that the eye goes to first.
Examples: a lit window in darkness, a single chair,
a door at the end of a corridor, light falling on a specific surface.
The rest of the frame supports this anchor without competing with it.
The lyric text will appear in the upper portion —
the anchor should be in the lower third.
`.trim();

function enhanceWorldDescription(
  world: string,
  manifest: SceneManifest,
): string {
  const worldText = typeof world === "string" ? world.trim() : "";

  const physicalNouns = [
    "kitchen",
    "room",
    "street",
    "field",
    "floor",
    "wall",
    "window",
    "door",
    "road",
    "bridge",
    "water",
    "forest",
    "building",
    "stage",
    "corridor",
    "parking",
    "rooftop",
    "basement",
    "church",
    "bar",
    "alley",
  ];

  const hasPhysicalPlace = physicalNouns.some((noun) =>
    worldText.toLowerCase().includes(noun),
  );

  if (hasPhysicalPlace && worldText.split(/\s+/).length > 6) {
    return worldText;
  }

  const systemToPlace: Record<string, string[]> = {
    fracture: [
      "abandoned building mid-demolition",
      "concrete stairwell with cracked walls",
      "glass-strewn floor after impact",
    ],
    pressure: [
      "narrow underground corridor",
      "low-ceiling industrial room",
      "basement with exposed pipes",
    ],
    breath: [
      "open field at dusk, tall grass moving",
      "lakeside at dawn, mist on water",
      "rooftop at night, city below",
    ],
    static: [
      "empty fluorescent-lit office at 2am",
      "clinical white hallway, no movement",
      "sterile room with one chair",
    ],
    burn: [
      "fire escape with city below at night",
      "room lit only by candles",
      "industrial space with molten light",
    ],
    void: [
      "empty theater after everyone has left",
      "dark room with one distant light source",
      "end of a pier at night, water below",
    ],
  };

  const options = systemToPlace[manifest.backgroundSystem] || [
    "atmospheric environment",
  ];
  const fallback = options[Math.floor(Math.random() * options.length)];

  return worldText ? `${fallback} — ${worldText}` : fallback;
}

function buildCinematicImagePrompt(
  manifest: SceneManifest,
  userDirection?: string,
): string {
  const systemCinema: Record<string, string> = {
    fracture:
      "environment shows signs of structural stress or breaking apart, cracks in surfaces, things mid-collapse, frozen moment of destruction",
    pressure:
      "scene feels compressed, low ceilings or close walls, weight visible in the atmosphere, dense air",
    breath:
      "scene has gentle natural movement, fabric stirring, water surface, leaves, something alive and slow",
    static:
      "scene is perfectly still, clinical, no movement, like a surveillance photo or forensic documentation",
    burn: "light source is fire or extreme heat, embers, something smoldering, light from below or within",
    void: "scene dissolves into darkness at the edges, central subject barely visible, everything peripheral disappears",
  };

  const lightCinema: Record<string, string> = {
    "cold below":
      "lighting from below, cold color temperature, upward shadows, eerie and disorienting",
    "harsh overhead":
      "single overhead source, hard shadows straight down, interrogation-room quality, no fill light",
    "flickering left":
      "light source from left frame, unstable, suggests candle or damaged fluorescent, motion in light",
    "golden hour":
      "warm directional light at low angle, long shadows, amber color cast, cinematic warmth",
    fluorescent:
      "flat overhead fluorescent, sickly color cast, no shadows, institutional, clinical",
    neon: "colored neon practical lights in scene, colored shadows, wet surfaces reflecting light",
    moonlight:
      "cold blue-white directional source, night exterior, high contrast, silver highlights",
    "stage spotlight":
      "single hard spotlight from above, everything else black, theatrical, performative isolation",
  };

  const tensionToCamera = (tension: number): string => {
    if (tension < 0.25)
      return "static camera, no movement implied, meditative stillness";
    if (tension < 0.5)
      return "slight camera drift suggested, gentle instability";
    if (tension < 0.75)
      return "handheld quality, subtle shake, urgency in framing";
    return "extreme angle or distorted perspective, maximum visual tension";
  };

  const sceneInstruction =
    systemCinema[manifest.backgroundSystem] || "atmospheric and evocative";
  const lightInstruction =
    lightCinema[manifest.lightSource] || `${manifest.lightSource} lighting`;
  const cameraInstruction = tensionToCamera(manifest.tension);

  const [deepTone = "#111111", midTone = "#444444", lightAccent = "#dddddd"] =
    manifest.palette || [];

  const paletteInstruction = `Color palette strictly limited to: deep tones of ${deepTone}, mid tones of ${midTone}, light accents of ${lightAccent}. No colors outside this palette.`;

  return `
Cinematic still frame. Film photography aesthetic.

SCENE: ${manifest.world}

LIGHTING: ${lightInstruction}

ATMOSPHERE: ${sceneInstruction}

CAMERA: ${cameraInstruction}

${paletteInstruction}

TECHNICAL REQUIREMENTS FOR LYRIC VIDEO USE:
- No text, typography, or writing of any kind in the image
- No human faces (environment only, people as distant silhouettes maximum)
- No watermarks or logos
- Dark enough that white text reads clearly over the entire image
- Strongest visual weight in the lower third — upper two-thirds must be relatively clear for lyrics
- Shallow depth of field preferred — sharp subject, soft background
- Film grain texture, not digital clean
- Aspect ratio content: 16:9 landscape orientation
- The image should feel like it was taken, not generated

EMOTIONAL ANCHOR: ${manifest.coreEmotion}

${userDirection ? `ARTIST DIRECTION: ${userDirection}` : ""}

Style: cinematic photography, not illustration, not abstract art, not AI aesthetic. A real place that exists in the world of this song.
  `.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestUrl = new URL(req.url);
    const { manifest, userDirection } = await req.json();

    if (!manifest || typeof manifest !== "object") {
      return new Response(JSON.stringify({ error: "manifest is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneManifest: SceneManifest = {
      world: String(manifest.world || ""),
      backgroundSystem: String(manifest.backgroundSystem || "void"),
      lightSource: String(manifest.lightSource || "moonlight"),
      tension: Number.isFinite(Number(manifest.tension))
        ? Number(manifest.tension)
        : 0.5,
      palette: Array.isArray(manifest.palette)
        ? manifest.palette
        : ["#111111", "#333333", "#f5f5f5"],
      coreEmotion: String(manifest.coreEmotion || "brooding"),
    };

    const enhancedWorld = enhanceWorldDescription(
      sceneManifest.world,
      sceneManifest,
    );
    const fullPrompt = [
      buildCinematicImagePrompt(
        { ...sceneManifest, world: enhancedWorld },
        userDirection,
      ),
      iconicFrameInstruction,
      `Avoid: ${LYRIC_VIDEO_NEGATIVE_PROMPT}`,
    ].join("\n\n");

    if (requestUrl.searchParams.get("preview") === "true") {
      return new Response(
        JSON.stringify({
          prompt: fullPrompt,
          negativePrompt: LYRIC_VIDEO_NEGATIVE_PROMPT,
          world: enhancedWorld,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: fullPrompt,
            },
          ],
          modalities: ["image", "text"],
          negative_prompt: LYRIC_VIDEO_NEGATIVE_PROMPT,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, try again shortly" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const images = data.choices?.[0]?.message?.images;
    let imageUrl: string | null = null;

    if (Array.isArray(images) && images.length > 0) {
      imageUrl = images[0]?.image_url?.url ?? null;
    }

    if (!imageUrl) {
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.startsWith("data:image")) {
        imageUrl = content;
      }
    }

    if (!imageUrl) {
      console.error(
        "Could not extract image from response:",
        JSON.stringify(data).slice(0, 500),
      );
      throw new Error("No image generated");
    }

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lyric-video-bg error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
