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
}

interface RequestBody {
  lyric_dance_id: string;
}

function buildImagePrompt(section: SectionInput): string {
  const description = section.description?.trim() || "moody cinematic abstract environment";
  if (!section.description?.trim()) {
    console.warn(`[section-images] Empty description for section ${section.sectionIndex}`);
  }

  return `Cinematic background scene, ${description}, ultra dark exposure, deep shadows, moody atmospheric, wide cinematic shot, no people, no text, no faces, photorealistic, film grain, 4k`;
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
      model: "google/gemini-3-pro-image-preview",
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
    const { lyric_dance_id } = body;

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
      .select("cinematic_direction, section_images")
      .eq("id", lyric_dance_id)
      .maybeSingle();

    if (danceError || !danceRow) {
      throw new Error(`Could not load lyric dance ${lyric_dance_id}`);
    }

    const existingImages = danceRow?.section_images;
    if (Array.isArray(existingImages) && existingImages.length > 0 && existingImages.every((url: string) => !!url)) {
      console.log(`[section-images] Images already exist for ${lyric_dance_id} — returning cached`);
      return new Response(
        JSON.stringify({ success: true, cached: true, section_images: existingImages, urls: existingImages }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cinematicDirection = danceRow?.cinematic_direction;
    const sections = Array.isArray(cinematicDirection?.sections)
      ? cinematicDirection.sections
          .map((section: any, idx: number) => ({
            sectionIndex: Number.isFinite(section?.sectionIndex) ? Number(section.sectionIndex) : idx,
            description: typeof section?.description === "string" ? section.description : "",
          }))
          .sort((a: SectionInput, b: SectionInput) => a.sectionIndex - b.sectionIndex)
      : [];

    if (sections.length === 0) {
      return new Response(JSON.stringify({ error: "cinematic_direction.sections[].description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[section-images] Generating ${sections.length} images for dance ${lyric_dance_id}`);

    const prompts = sections.map((section) => buildImagePrompt(section));
    const imageResults = await Promise.all(prompts.map((prompt) => generateImage(prompt, apiKey)));

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
