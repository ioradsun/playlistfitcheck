import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SectionInput {
  sectionIndex: number;
  description: string;
  visualMood?: string;
  mood?: string;
  atmosphere?: string;
  texture?: string;
  motion?: string;
  lyrics?: string;
  dominantColor?: string;
}

interface RequestBody {
  lyric_dance_id: string;
  force?: boolean;
}

// Color palette seeds per section index — ensures visual variety even with similar descriptions
const SECTION_COLOR_SEEDS = [
  "moonlit deep ocean blues with bioluminescent teal accents",
  "volcanic crimson glow against obsidian darkness",
  "violet nebula light bleeding through smoke and haze",
  "emerald forest canopy with shafts of golden dawn light",
  "arctic aurora borealis reflecting off frozen chrome",
  "neon magenta city rain on dark wet pavement",
  "burnt desert sunset with indigo mountain silhouettes",
  "deep jade temple interior with floating dust motes in amber light",
  "blood moon rising over a silver mist valley",
  "electric storm clouds lit from within by copper lightning",
  "underwater cathedral with shifting turquoise caustics",
  "abandoned carnival at dusk with rusted gold ferris wheel light",
];

// Visual mood → image generation style hints
const MOOD_IMAGE_STYLE: Record<string, string> = {
  intimate:
    "ultra dark exposure, warm amber lighting, shallow depth of field, soft shadows",
  anthemic:
    "vivid colors, dramatic lighting, wide cinematic shot, high contrast",
  dreamy:
    "soft focus, warm golden light, ethereal glow, hazy atmosphere, blown highlights",
  aggressive:
    "cold blue steel tones, harsh contrast, gritty, sharp shadows, dark",
  melancholy:
    "muted desaturated colors, overcast cool light, rain-soaked, foggy",
  euphoric:
    "bright warm light, golden hour, lens flare, vivid saturated colors, radiant",
  eerie:
    "dark teal green tint, cold fluorescent light, unsettling shadows, fog",
  vulnerable:
    "warm soft light, intimate close framing, gentle shadows, dusty film grain",
  triumphant:
    "golden dramatic light, bold contrast, wide heroic framing, rich warm tones",
  nostalgic:
    "warm sepia tones, vintage film grain, soft sunlight, faded memories",
  defiant:
    "cold high contrast, dramatic side lighting, sharp edges, bold shadows",
  hopeful: "dawn light, warm gradient sky, soft bright exposure, gentle rays",
  raw: "ungraded neutral, harsh direct light, gritty documentary feel, high grain",
  hypnotic:
    "deep saturated colors, slow gradient, mysterious lighting, tilt-shift bokeh",
};

function buildImagePrompt(
  section: SectionInput,
  totalSections: number,
): string {
  const parts: string[] = ["Cinematic background scene"];

  // Core description
  const description = section.description?.trim();
  if (description) {
    parts.push(description);
  }

  // Visual mood drives the entire image style
  const visualMood = section.visualMood?.trim()?.toLowerCase();
  const moodStyle = visualMood ? MOOD_IMAGE_STYLE[visualMood] : null;
  if (moodStyle) {
    parts.push(moodStyle);
  }

  // Fallback mood/atmosphere for context
  const mood = section.mood?.trim();
  const atmosphere = section.atmosphere?.trim();
  if (!moodStyle && mood) parts.push(`${mood} mood`);
  if (atmosphere && atmosphere !== mood) parts.push(`${atmosphere} atmosphere`);

  // Texture for visual style
  const texture = section.texture?.trim();
  if (texture) parts.push(`${texture} texture`);

  // Lyrics excerpt for thematic grounding (first ~60 chars)
  const lyrics = section.lyrics?.trim();
  if (lyrics) {
    const excerpt =
      lyrics.length > 60
        ? lyrics.slice(0, 60).replace(/\s+\S*$/, "...")
        : lyrics;
    parts.push(`evoking the feeling of "${excerpt}"`);
  }

  // If we have almost nothing, add a unique fallback
  if (!description && !moodStyle && !mood && !atmosphere && !lyrics) {
    parts.push("moody cinematic abstract environment");
  }

  // Color seed for guaranteed visual variety
  const colorSeed =
    SECTION_COLOR_SEEDS[section.sectionIndex % SECTION_COLOR_SEEDS.length];
  parts.push(colorSeed);

  if (section.dominantColor) {
    parts.push(`primary color accent: ${section.dominantColor}`);
  }

  // Section position awareness
  if (section.sectionIndex === 0) {
    parts.push("opening establishing shot");
  } else if (section.sectionIndex === totalSections - 1) {
    parts.push("closing finale atmosphere");
  }

  // Base quality — no longer forcing "ultra dark" on every image
  parts.push(
    "wide cinematic shot, no people, no text, no faces, photorealistic, film grain, 1920x1080 landscape aspect ratio, 16:9",
  );

  const prompt = parts.join(", ");
  if (!description) {
    // No description for section — using visualMood/color seed
  }
  return prompt;
}

async function generateImage(
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[section-images] AI gateway error ${resp.status}: ${text}`);
    return null;
  }

  const data = await resp.json();
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    console.error("[section-images] No image in response");
    return null;
  }

  return imageUrl;
}

async function triggerPreviewPrecompute(
  sbUrl: string,
  sbKey: string,
  lyricDanceId: string,
): Promise<void> {
  try {
    const resp = await fetch(`${sbUrl}/functions/v1/precompute-dance-preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dance_id: lyricDanceId }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(
        `[section-images] preview precompute failed ${resp.status}: ${text}`,
      );
    }
  } catch (error) {
    console.error(
      "[section-images] preview precompute invocation failed",
      error,
    );
  }
}

async function uploadBase64ToStorage(
  supabase: any,
  base64DataUri: string,
  path: string,
): Promise<string | null> {
  const match = base64DataUri.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/,
  );
  if (!match) {
    console.error("[section-images] Invalid base64 data URI format");
    return null;
  }

  const mimeType = `image/${match[1]}`;
  const base64Data = match[2];

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("lyric-backgrounds")
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '31536000', // 1 year — images are immutable (cache-busted by timestamp in filename)
    });

  if (error) {
    console.error(
      `[section-images] Storage upload error for ${path}:`,
      error.message,
    );
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("lyric-backgrounds")
    .getPublicUrl(path);
  return urlData?.publicUrl ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid or empty JSON body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { lyric_dance_id, force } = body;

    if (!lyric_dance_id) {
      return new Response(
        JSON.stringify({ error: "lyric_dance_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!sbUrl || !sbKey) throw new Error("Supabase env vars not configured");

    const supabase = createClient(sbUrl, sbKey);

    const { data: danceRow, error: danceError } = await supabase
      .from("shareable_lyric_dances")
      .select("cinematic_direction, section_images, lyrics, words")
      .eq("id", lyric_dance_id)
      .maybeSingle();

    if (danceError || !danceRow) {
      throw new Error(`Could not load lyric dance ${lyric_dance_id}`);
    }

    const existingImages = danceRow?.section_images;
    if (
      !force &&
      Array.isArray(existingImages) &&
      existingImages.length > 0 &&
      existingImages.every((url: string) => !!url)
    ) {
      await triggerPreviewPrecompute(sbUrl, sbKey, lyric_dance_id);
      return new Response(
        JSON.stringify({
          success: true,
          cached: true,
          section_images: existingImages,
          urls: existingImages,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cinematicDirection = danceRow?.cinematic_direction;
    const lines = Array.isArray(danceRow?.lyrics) ? danceRow.lyrics : [];

    const rawSections = Array.isArray(cinematicDirection?.sections)
      ? cinematicDirection.sections
      : [];

    const sections: SectionInput[] = rawSections
      .map((section: any, idx: number) => {
        const sectionIndex = Number.isFinite(section?.sectionIndex)
          ? Number(section.sectionIndex)
          : idx;

        // Extract lyrics for this section's time range
        let sectionLyrics = "";
        if (section?.startSec != null && section?.endSec != null) {
          const sectionLines = lines.filter(
            (l: any) =>
              l?.start != null &&
              l?.end != null &&
              l.start >= section.startSec - 0.5 &&
              l.start < section.endSec + 0.5,
          );
          sectionLyrics = sectionLines
            .map((l: any) => l.text || "")
            .join(" ")
            .slice(0, 120);
        }

        const rawDesc = typeof section?.description === "string" ? section.description.trim() : "";
        // Fallback: if cinematic direction has no description, synthesize one from lyrics + mood
        const fallbackDesc = rawDesc || (sectionLyrics
          ? `Musical scene inspired by: "${sectionLyrics.slice(0, 80)}"`
          : `Section ${sectionIndex + 1} of the song`);

        return {
          sectionIndex,
          description: fallbackDesc,
          visualMood:
            typeof section?.visualMood === "string"
              ? section.visualMood
              : undefined,
          mood: typeof section?.mood === "string" ? section.mood : undefined,
          atmosphere:
            typeof section?.atmosphere === "string"
              ? section.atmosphere
              : undefined,
          texture:
            typeof section?.texture === "string" ? section.texture : undefined,
          motion:
            typeof section?.motion === "string" ? section.motion : undefined,
          lyrics: sectionLyrics || undefined,
          dominantColor:
            typeof section?.dominantColor === "string"
              ? section.dominantColor
              : undefined,
        };
      })
      .sort(
        (a: SectionInput, b: SectionInput) => a.sectionIndex - b.sectionIndex,
      );

    if (sections.length === 0) {
      return new Response(
        JSON.stringify({
          error: "cinematic_direction.sections[].description is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const prompts = sections.map((section: SectionInput) =>
      buildImagePrompt(section, sections.length),
    );

    // First pass: generate all images in parallel
    let imageResults = await Promise.all(
      prompts.map((prompt: string) => generateImage(prompt, apiKey)),
    );

    // Retry pass: attempt failed images up to 2 more times with staggered delay
    const MAX_RETRIES = 2;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      const failedIndices = imageResults
        .map((result, index) => (result === null ? index : -1))
        .filter((index) => index >= 0);
      if (failedIndices.length === 0) break;

      console.log(
        `[section-images] Retry ${retry + 1}: ${failedIndices.length} failed images`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000 * (retry + 1)));

      const retryResults = await Promise.all(
        failedIndices.map((index) => generateImage(prompts[index], apiKey)),
      );

      for (
        let retryResultIndex = 0;
        retryResultIndex < failedIndices.length;
        retryResultIndex++
      ) {
        if (retryResults[retryResultIndex] !== null) {
          imageResults[failedIndices[retryResultIndex]] =
            retryResults[retryResultIndex];
        }
      }
    }

    // Upload all successful images to storage
    const uploadResults = await Promise.all(
      imageResults.map(async (base64, i) => {
        if (!base64) return null;
        const ext = base64.includes("image/png") ? "png" : "jpg";
        const cacheBust = Date.now();
        const path = `${lyric_dance_id}/section-${sections[i].sectionIndex}-${cacheBust}.${ext}`;
        return uploadBase64ToStorage(supabase, base64, path);
      }),
    );

    const urls = uploadResults.map((url) => url ?? null);
    const successCount = urls.filter(Boolean).length;
    const totalCount = sections.length;
    const allComplete = successCount === totalCount;

    if (successCount > 0) {
      const { error: updateError } = await supabase
        .from("shareable_lyric_dances")
        .update({ section_images: urls })
        .eq("id", lyric_dance_id);

      if (updateError) {
        console.error("[section-images] DB update error:", updateError.message);
      } else if (allComplete) {
        // Only trigger preview precompute if ALL images are ready
        await triggerPreviewPrecompute(sbUrl, sbKey, lyric_dance_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: allComplete,
        partial: !allComplete && successCount > 0,
        urls,
        section_images: urls,
        generated: successCount,
        total: totalCount,
        failed_indices: urls
          .map((url, index) => (url === null ? index : -1))
          .filter((index) => index >= 0),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[section-images] Error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
