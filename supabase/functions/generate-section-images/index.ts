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
}

interface RequestBody {
  lyric_dance_id: string;
  force?: boolean;
}

// Color palette seeds per section index — ensures visual variety even with similar descriptions
const SECTION_COLOR_SEEDS = [
  "deep blue and amber tones",
  "crimson and dark teal palette",
  "violet and gold undertones",
  "emerald and rust hues",
  "navy and warm copper tones",
  "dark magenta and silver",
  "burnt orange and midnight blue",
  "forest green and dusty rose",
];

// Visual mood → image generation style hints
const MOOD_IMAGE_STYLE: Record<string, string> = {
  intimate: "ultra dark exposure, warm amber lighting, shallow depth of field, soft shadows",
  anthemic: "vivid colors, dramatic lighting, wide cinematic shot, high contrast",
  dreamy: "soft focus, warm golden light, ethereal glow, hazy atmosphere, blown highlights",
  aggressive: "cold blue steel tones, harsh contrast, gritty, sharp shadows, dark",
  melancholy: "muted desaturated colors, overcast cool light, rain-soaked, foggy",
  euphoric: "bright warm light, golden hour, lens flare, vivid saturated colors, radiant",
  eerie: "dark teal green tint, cold fluorescent light, unsettling shadows, fog",
  vulnerable: "warm soft light, intimate close framing, gentle shadows, dusty film grain",
  triumphant: "golden dramatic light, bold contrast, wide heroic framing, rich warm tones",
  nostalgic: "warm sepia tones, vintage film grain, soft sunlight, faded memories",
  defiant: "cold high contrast, dramatic side lighting, sharp edges, bold shadows",
  hopeful: "dawn light, warm gradient sky, soft bright exposure, gentle rays",
  raw: "ungraded neutral, harsh direct light, gritty documentary feel, high grain",
  hypnotic: "deep saturated colors, slow gradient, mysterious lighting, tilt-shift bokeh",
};

function buildImagePrompt(section: SectionInput, totalSections: number): string {
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
    const excerpt = lyrics.length > 60 ? lyrics.slice(0, 60).replace(/\s+\S*$/, '...') : lyrics;
    parts.push(`evoking the feeling of "${excerpt}"`);
  }

  // If we have almost nothing, add a unique fallback
  if (!description && !moodStyle && !mood && !atmosphere && !lyrics) {
    parts.push("moody cinematic abstract environment");
  }

  // Color seed for guaranteed visual variety
  const colorSeed = SECTION_COLOR_SEEDS[section.sectionIndex % SECTION_COLOR_SEEDS.length];
  parts.push(colorSeed);

  // Section position awareness
  if (section.sectionIndex === 0) {
    parts.push("opening establishing shot");
  } else if (section.sectionIndex === totalSections - 1) {
    parts.push("closing finale atmosphere");
  }

  // Base quality — no longer forcing "ultra dark" on every image
  parts.push("wide cinematic shot, no people, no text, no faces, photorealistic, film grain, 4k");

  const prompt = parts.join(", ");
  if (!description) {
    console.warn(`[section-images] No description for section ${section.sectionIndex} — using visualMood/color seed`);
  }
  return prompt;
}

async function generateImage(prompt: string, apiKey: string): Promise<string | null> {
  console.log(`[section-images] Generating image with prompt: ${prompt.slice(0, 120)}...`);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
  });

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

async function uploadBase64ToStorage(
  supabase: any,
  base64DataUri: string,
  path: string,
): Promise<string | null> {
  const match = base64DataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
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

  const { error } = await supabase.storage.from("lyric-backgrounds").upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.error(`[section-images] Storage upload error for ${path}:`, error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("lyric-backgrounds").getPublicUrl(path);
  return urlData?.publicUrl ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { lyric_dance_id, force } = body;

    if (!lyric_dance_id) {
      return new Response(JSON.stringify({ error: "lyric_dance_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!sbUrl || !sbKey) throw new Error("Supabase env vars not configured");

    const supabase = createClient(sbUrl, sbKey);

    const { data: danceRow, error: danceError } = await supabase
      .from("shareable_lyric_dances")
      .select("cinematic_direction, section_images, lines, words")
      .eq("id", lyric_dance_id)
      .maybeSingle();

    if (danceError || !danceRow) {
      throw new Error(`Could not load lyric dance ${lyric_dance_id}`);
    }

    const existingImages = danceRow?.section_images;
    if (!force && Array.isArray(existingImages) && existingImages.length > 0 && existingImages.every((url: string) => !!url)) {
      console.log(`[section-images] Images already exist for ${lyric_dance_id} — returning cached (pass force:true to regenerate)`);
      return new Response(
        JSON.stringify({ success: true, cached: true, section_images: existingImages, urls: existingImages }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cinematicDirection = danceRow?.cinematic_direction;
    const lines = Array.isArray(danceRow?.lines) ? danceRow.lines : [];

    const rawSections = Array.isArray(cinematicDirection?.sections)
      ? cinematicDirection.sections : [];

    const sections: SectionInput[] = rawSections
      .map((section: any, idx: number) => {
        const sectionIndex = Number.isFinite(section?.sectionIndex) ? Number(section.sectionIndex) : idx;

        // Extract lyrics for this section's time range
        let sectionLyrics = "";
        if (section?.startSec != null && section?.endSec != null) {
          const sectionLines = lines.filter((l: any) =>
            l?.start != null && l?.end != null &&
            l.start >= section.startSec - 0.5 && l.start < section.endSec + 0.5
          );
          sectionLyrics = sectionLines.map((l: any) => l.text || "").join(" ").slice(0, 120);
        }

        return {
          sectionIndex,
          description: typeof section?.description === "string" ? section.description : "",
          visualMood: typeof section?.visualMood === "string" ? section.visualMood : undefined,
          mood: typeof section?.mood === "string" ? section.mood : undefined,
          atmosphere: typeof section?.atmosphere === "string" ? section.atmosphere : undefined,
          texture: typeof section?.texture === "string" ? section.texture : undefined,
          motion: typeof section?.motion === "string" ? section.motion : undefined,
          lyrics: sectionLyrics || undefined,
        };
      })
      .sort((a: SectionInput, b: SectionInput) => a.sectionIndex - b.sectionIndex);

    if (sections.length === 0) {
      return new Response(JSON.stringify({ error: "cinematic_direction.sections[].description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[section-images] Generating ${sections.length} images for dance ${lyric_dance_id}`);
    const prompts = sections.map((section: SectionInput) => buildImagePrompt(section, sections.length));
    prompts.forEach((p, i) => console.log(`[section-images] prompt[${i}]: ${p.slice(0, 150)}...`));
    const imageResults = await Promise.all(prompts.map((prompt: string) => generateImage(prompt, apiKey)));

    const uploadResults = await Promise.all(
      imageResults.map(async (base64, i) => {
        if (!base64) return null;
        const ext = base64.includes("image/png") ? "png" : "jpg";
        const path = `${lyric_dance_id}/section-${sections[i].sectionIndex}.${ext}`;
        return uploadBase64ToStorage(supabase, base64, path);
      }),
    );

    const urls = uploadResults.map((url) => url ?? null);
    const successCount = urls.filter(Boolean).length;
    console.log(`[section-images] Generated ${successCount}/${sections.length} images`);

    if (successCount > 0) {
      const { error: updateError } = await supabase
        .from("shareable_lyric_dances")
        .update({ section_images: urls })
        .eq("id", lyric_dance_id);

      if (updateError) {
        console.error("[section-images] DB update error:", updateError.message);
      } else {
        console.log(`[section-images] Saved ${successCount} image URLs to DB`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, urls, section_images: urls, generated: successCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
