import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChapterInput {
  index: number;
  backgroundDirective: string;
  dominantColor: string;
  emotionalIntensity: number;
}

interface SceneContext {
  scene: string;
  label: string;
  baseLuminance?: 'dark' | 'medium' | 'light';
  fluxPromptSuffix?: string;
}

interface RequestBody {
  lyric_dance_id: string;
  chapters: ChapterInput[];
  scene_context?: SceneContext | null;
}

function colorToMood(hex: string): string {
  const clean = (hex || "#333333").replace("#", "").padEnd(6, "0");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (b > r && b > g) return "deep blue and cold";
  if (r > g && r > b) return "deep crimson and warm";
  if (g > r && g > b) return "deep teal and ethereal";
  if (r > 200 && g > 150) return "dark gold and amber";
  return "dark monochromatic";
}

function buildImagePrompt(chapter: ChapterInput, sceneCtx?: SceneContext | null): string {
  const moodFromColor = colorToMood(chapter.dominantColor);
  const exposureGuide = sceneCtx?.baseLuminance === 'light'
    ? 'bright luminous exposure, soft light, airy atmosphere'
    : sceneCtx?.baseLuminance === 'medium'
      ? 'natural exposure, balanced light and shadow'
      : 'ultra dark exposure, 90% shadow, deep blacks';
  return `Cinematic background scene, ${chapter.backgroundDirective}, ${sceneCtx?.fluxPromptSuffix ?? 'dark cinematic moody'}, ${exposureGuide}, ${moodFromColor} color grading, no people, no text, no faces, photorealistic, film grain, 4k`;
}

async function generateImage(
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  console.log(`[chapter-images] Generating image with prompt: ${prompt.slice(0, 100)}...`);

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
    console.error(`[chapter-images] AI gateway error ${resp.status}: ${text}`);
    return null;
  }

  const data = await resp.json();
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    console.error("[chapter-images] No image in response");
    return null;
  }

  return imageUrl; // base64 data URI
}

async function uploadBase64ToStorage(
  supabase: any,
  base64DataUri: string,
  path: string,
): Promise<string | null> {
  // Extract base64 data from data URI
  const match = base64DataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) {
    console.error("[chapter-images] Invalid base64 data URI format");
    return null;
  }

  const mimeType = `image/${match[1]}`;
  const base64Data = match[2];

  // Convert base64 to Uint8Array
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
    });

  if (error) {
    console.error(`[chapter-images] Storage upload error for ${path}:`, error.message);
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
    const body = (await req.json()) as RequestBody;
    const { lyric_dance_id, chapters } = body;

    if (!lyric_dance_id || !Array.isArray(chapters) || chapters.length === 0) {
      return new Response(
        JSON.stringify({ error: "lyric_dance_id and chapters are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!sbUrl || !sbKey) throw new Error("Supabase env vars not configured");

    const supabase = createClient(sbUrl, sbKey);

    console.log(`[chapter-images] Generating ${chapters.length} images for dance ${lyric_dance_id}`);

    // Generate all images in parallel
    const prompts = chapters
      .sort((a, b) => a.index - b.index)
      .map((ch) => buildImagePrompt(ch));

    const imageResults = await Promise.all(
      prompts.map((prompt) => generateImage(prompt, apiKey)),
    );

    // Upload to storage in parallel
    const uploadResults = await Promise.all(
      imageResults.map(async (base64, i) => {
        if (!base64) return null;
        const ext = base64.includes("image/png") ? "png" : "jpg";
        const path = `${lyric_dance_id}/chapter-${i}.${ext}`;
        return uploadBase64ToStorage(supabase, base64, path);
      }),
    );

    const urls = uploadResults.map((url) => url ?? null);
    const successCount = urls.filter(Boolean).length;
    console.log(`[chapter-images] Generated ${successCount}/${chapters.length} images`);

    if (successCount > 0) {
      const { error: updateError } = await supabase
        .from("shareable_lyric_dances")
        .update({ chapter_images: urls })
        .eq("id", lyric_dance_id);

      if (updateError) {
        console.error("[chapter-images] DB update error:", updateError.message);
      } else {
        console.log(`[chapter-images] Saved ${successCount} image URLs to DB`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, urls, generated: successCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[chapter-images] Error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
