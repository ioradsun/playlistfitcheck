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
  artistDirection?: string;
  visualMood?: string;
  lyrics?: string;
  dominantColor?: string;
}

interface RequestBody {
  project_id: string;
  force?: boolean;
  /** Sections passed directly from client — skips DB read when present */
  sections_inline?: Array<{
    sectionIndex: number;
    description: string;
    visualMood?: string;
    texture?: string;
    dominantColor?: string;
    startSec?: number;
    endSec?: number;
  }>;
  /** Artist direction passed inline */
  artist_direction_inline?: string;
  /** Lyrics text for section lyrics extraction */
  lyrics_lines_inline?: Array<{ text: string; start: number; end: number }>;
}

const SECTION_COLOR_SEEDS = [
  "golden hour light washing over weathered concrete, amber and dust",
  "volcanic crimson glow against deep shadow, fire at the edges",
  "moonlit rooftop with city lights below, silver-blue and warm amber",
  "cathedral rays cutting through smoke, gold light in dark air",
  "neon violet and electric blue reflected on wet city pavement",
  "desert dusk with burnt orange sky bleeding into deep indigo",
  "emerald light filtering through industrial haze, green and grey",
  "blood orange sun low on the horizon, silhouette and warmth",
  "arctic white sky with lone dark figure, high exposure, minimal",
  "deep jade and copper lantern light, intimate interior glow",
  "storm break — dark clouds parting to reveal single shaft of white light",
  "soft pink dawn over empty highway, quiet and wide open",
];

const MOOD_IMAGE_STYLE: Record<string, string> = {
  intimate: "low-key warm exposure, amber lighting, shallow depth of field, soft shadows, visible detail in shadows",
  anthemic: "vivid colors, dramatic lighting, wide cinematic shot, high contrast",
  dreamy: "soft focus, warm golden light, ethereal glow, hazy atmosphere, blown highlights",
  aggressive: "cold blue steel tones, harsh contrast, gritty, sharp shadows, moody low-key lighting",
  melancholy: "muted desaturated colors, overcast cool light, rain-soaked, foggy, grey-blue tones",
  euphoric: "bright warm light, golden hour, lens flare, vivid saturated colors, radiant",
  eerie: "teal green tint, cold fluorescent light, unsettling shadows, thin fog, visible environment detail",
  vulnerable: "warm soft light, intimate close framing, gentle shadows, dusty grain",
  triumphant: "golden dramatic light, bold contrast, wide heroic framing, rich warm tones",
  nostalgic: "warm sepia tones, vintage grain, soft sunlight, faded warmth",
  defiant: "cold high contrast, dramatic side lighting, sharp edges, bold shadows",
  hopeful: "dawn light, warm gradient sky, soft bright exposure, gentle rays",
  raw: "neutral tones, harsh direct light, gritty documentary feel, high grain, unpolished",
  hypnotic: "deep saturated colors, slow gradient, mysterious lighting, tilt-shift bokeh",
  noir: "high-contrast with single warm light source, deep shadows with visible detail, wet surfaces reflecting light, cinematic night scene",
  rebellious: "raw energy, bold primary colors against dark ground, high contrast, street-level grit, saturated accents cutting through shadow",
  ethereal: "soft luminous haze, diffused light, pale warm tones, weightless atmosphere, heavenly glow",
  celestial: "vast sky with brilliant light source, cosmic scale, radiant rays, contrast between dark void and intense brightness",
  haunted: "cold desaturated palette, lone light source, long shadows, abandoned space, still and uneasy atmosphere",
};

const MOOD_COLOR_VERBAL: Record<string, string> = {
  intimate: "warm amber gold",
  anthemic: "burnt orange fire",
  dreamy: "soft lavender purple",
  aggressive: "cold steel blue",
  melancholy: "deep ocean blue",
  euphoric: "bright gold",
  eerie: "deep teal green",
  vulnerable: "dusty rose pink",
  triumphant: "bright gold",
  nostalgic: "warm weathered bronze",
  defiant: "cold steel blue",
  hopeful: "fresh spring green",
  raw: "neutral silver grey",
  hypnotic: "deep violet purple",
  ethereal: "pale ice blue",
  haunted: "cold slate grey",
  celestial: "muted twilight blue",
  noir: "dark charcoal blue-grey",
  rebellious: "burnt rust red",
};

function buildImagePrompt(section: SectionInput, totalSections: number): string {
  const parts: string[] = [];

  // ── Layer 1: ARTIST DIRECTION — overrides everything ──
  if (section.artistDirection) {
    parts.push(`Visual direction: ${section.artistDirection}`);
  }

  // ── Layer 2: SCENE — what the viewer sees RIGHT NOW ──
  const description = section.description?.trim();
  if (description) {
    parts.push(`Scene: ${description}`);
  }

  // ── Layer 3: LYRICS — ground the scene in the actual song ──
  const lyrics = section.lyrics?.trim();
  if (lyrics) {
    const excerpt = lyrics.length > 100 ? lyrics.slice(0, 100).replace(/\s+\S*$/, "...") : lyrics;
    parts.push(`The lyrics over this image: "${excerpt}"`);
  }

  // ── Layer 4: CINEMATOGRAPHY — how it's shot ──
  const visualMood = section.visualMood?.trim()?.toLowerCase();
  const moodStyle = visualMood ? MOOD_IMAGE_STYLE[visualMood] : null;
  if (moodStyle) {
    parts.push(moodStyle);
  }

  // ── Fallback if nothing above provided content ──
  if (!description && !moodStyle && !lyrics) {
    parts.push("moody cinematic abstract environment");
  }

  // ── Color grading ──
  if (section.dominantColor && section.visualMood) {
    const colorName = MOOD_COLOR_VERBAL[section.visualMood.toLowerCase()] || section.dominantColor;
    parts.push(`Color palette dominated by ${colorName}`);
  } else if (section.dominantColor) {
    parts.push(`Color palette: ${section.dominantColor}`);
  } else {
    const colorSeed = SECTION_COLOR_SEEDS[section.sectionIndex % SECTION_COLOR_SEEDS.length];
    parts.push(colorSeed);
  }

  // ── Structural position ──
  if (section.sectionIndex === 0) {
    parts.push("opening establishing shot");
  } else if (section.sectionIndex === totalSections - 1) {
    parts.push("closing finale atmosphere");
  }

  // ── Technical constraints (always last — lowest priority) ──
  parts.push(
    "Background for a lyric video — white text will overlay this image, so keep the center area darker or less busy. " +
      "Cinematic composition. No faces, no readable text, no writing. " +
      "Silhouettes, hands, and body outlines are fine — no detailed facial features. " +
      "Photorealistic, 35mm film grain, shallow depth of field. " +
      "16:9 landscape aspect ratio. Ensure background detail is visible — avoid large pure black regions.",
  );

  return parts.map((p) => p.replace(/[.\s]+$/, "")).join(". ") + ".";
}

async function generateImage(prompt: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
      signal: controller.signal,
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
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error("[section-images] Image generation timed out (30s)");
    } else {
      console.error("[section-images] Image generation error:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function triggerPreviewPrecompute(sbUrl: string, sbKey: string, lyricDanceId: string): Promise<void> {
  try {
    const resp = await fetch(`${sbUrl}/functions/v1/precompute-dance-preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: lyricDanceId }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[section-images] preview precompute failed ${resp.status}: ${text}`);
    }
  } catch (error) {
    console.error("[section-images] preview precompute invocation failed", error);
  }
}

async function uploadBase64ToStorage(supabase: any, base64DataUri: string, path: string): Promise<string | null> {
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
    cacheControl: "31536000",
  });

  if (error) {
    console.error(`[section-images] Storage upload error for ${path}:`, error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("lyric-backgrounds").getPublicUrl(path);
  return urlData?.publicUrl ?? null;
}

function enforceMinimumLuminance(base64DataUri: string, minLuminance: number = 0.12): string {
  const match = base64DataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) return base64DataUri;

  const mimeType = match[1];
  const base64Data = match[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let totalLuminance = 0;
  let sampleCount = 0;
  const stride = 48;
  for (let i = 0; i < bytes.length - 2; i += stride) {
    const r = bytes[i];
    const g = bytes[i + 1];
    const b = bytes[i + 2];
    if (r === 0 && g === 0 && b === 0) continue;
    totalLuminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sampleCount++;
  }

  if (sampleCount === 0) return base64DataUri;
  const avgLuminance = totalLuminance / sampleCount;
  if (avgLuminance >= minLuminance) return base64DataUri;

  const multiplier = Math.min(minLuminance / avgLuminance, 2.5);
  const corrected = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    corrected[i] = Math.min(255, Math.round(bytes[i] * multiplier));
  }

  let binary = "";
  for (let i = 0; i < corrected.length; i++) {
    binary += String.fromCharCode(corrected[i]);
  }
  return `data:image/${mimeType};base64,${btoa(binary)}`;
}

/** Generate + upload a single section image, returning the public URL or null. */
async function processOneSection(
  section: SectionInput,
  totalSections: number,
  apiKey: string,
  supabase: any,
  projectId: string,
): Promise<string | null> {
  const prompt = buildImagePrompt(section, totalSections);
  console.log(`[section-images] Section ${section.sectionIndex} prompt (${prompt.length} chars): ${prompt.slice(0, 200)}...`);

  // Try up to 2 attempts per image
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));

    const base64 = await generateImage(prompt, apiKey);
    if (!base64) continue;

    const corrected = enforceMinimumLuminance(base64, 0.12);
    const ext = corrected.includes("image/png") ? "png" : "jpg";
    const cacheBust = Date.now();
    const path = `${projectId}/section-${section.sectionIndex}-${cacheBust}.${ext}`;
    const url = await uploadBase64ToStorage(supabase, corrected, path);
    if (url) return url;
  }

  return null;
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
      return new Response(JSON.stringify({ error: "Invalid or empty JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { project_id, force } = body;

    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
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
      .from("lyric_projects")
      .select("cinematic_direction, section_images, lines, words")
      .eq("id", project_id)
      .maybeSingle();

    if (danceError || !danceRow) {
      throw new Error(`Could not load lyric project ${project_id}`);
    }

    const existingImages = Array.isArray(danceRow?.section_images)
      ? danceRow.section_images.filter((url): url is string => typeof url === "string" || url === null)
      : [];

    const cinematicDirection = danceRow?.cinematic_direction;
    const artistDirection: string | undefined =
      typeof cinematicDirection?._artistDirection === "string"
        ? cinematicDirection._artistDirection.trim() || undefined
        : undefined;
    const lines = Array.isArray(danceRow?.lines) ? danceRow.lines : [];

    let sections: SectionInput[] = [];

    // Fast path: sections provided inline — skip DB-derived section building
    if (Array.isArray(body.sections_inline) && body.sections_inline.length > 0) {
      const inlineSections: SectionInput[] = body.sections_inline.map((s, idx) => {
        const sectionIndex = s.sectionIndex ?? idx;
        // Extract lyrics for this section from inline lines
        let sectionLyrics = "";
        if (Array.isArray(body.lyrics_lines_inline) && s.startSec != null && s.endSec != null) {
          sectionLyrics = body.lyrics_lines_inline
            .filter((l) => l.start >= (s.startSec ?? 0) - 0.5 && l.start < (s.endSec ?? 0) + 0.5)
            .map((l) => l.text)
            .join(" ")
            .slice(0, 120);
        }
        return {
          sectionIndex,
          description: s.description || `Section ${sectionIndex + 1}`,
          artistDirection: body.artist_direction_inline,
          visualMood: s.visualMood,
          lyrics: sectionLyrics || undefined,
          dominantColor: s.dominantColor,
        };
      });

      // Use inline sections for generation (rest of flow is identical)
      // Jump to the generation block below
      sections = inlineSections;
    } else {
      const rawSections = Array.isArray(cinematicDirection?.sections) ? cinematicDirection.sections : [];

      sections = rawSections
        .map((section: any, idx: number) => {
          const sectionIndex = Number.isFinite(section?.sectionIndex) ? Number(section.sectionIndex) : idx;

          let sectionLyrics = "";
          if (section?.startSec != null && section?.endSec != null) {
            const sectionLines = lines.filter(
              (l: any) =>
                l?.start != null && l?.end != null && l.start >= section.startSec - 0.5 && l.start < section.endSec + 0.5,
            );
            sectionLyrics = sectionLines.map((l: any) => l.text || "").join(" ").slice(0, 120);
          }

          const rawDesc = typeof section?.description === "string" ? section.description.trim() : "";
          const fallbackDesc =
            rawDesc ||
            (sectionLyrics
              ? `Musical scene inspired by: "${sectionLyrics.slice(0, 80)}"`
              : `Section ${sectionIndex + 1} of the song`);

          return {
            sectionIndex,
            description: fallbackDesc,
            artistDirection,
            visualMood: typeof section?.visualMood === "string" ? section.visualMood : undefined,
            lyrics: sectionLyrics || undefined,
            dominantColor: typeof section?.dominantColor === "string" ? section.dominantColor : undefined,
          };
        })
        .sort((a: SectionInput, b: SectionInput) => a.sectionIndex - b.sectionIndex);
    }

    if (sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "cinematic_direction.sections[].description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedExistingImages: (string | null)[] = existingImages.slice(0, sections.length);
    while (normalizedExistingImages.length < sections.length) normalizedExistingImages.push(null);

    if (!force && normalizedExistingImages.length > 0 && normalizedExistingImages.every(Boolean)) {
      await triggerPreviewPrecompute(sbUrl, sbKey, project_id);
      return new Response(
        JSON.stringify({ success: true, cached: true, section_images: normalizedExistingImages, urls: normalizedExistingImages }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Batched generation with progressive DB saves ──
    // Process sections in a single full-size batch for maximum parallelism.
    // After each batch, save progress to the DB so partial results
    // survive a timeout.

    const urls: (string | null)[] = [...normalizedExistingImages];

    // Process all pending sections in parallel
    const CONCURRENCY = sections.length;
    for (let i = 0; i < sections.length; i += CONCURRENCY) {
      const batch = sections.slice(i, i + CONCURRENCY);

      // Skip sections that already have a valid URL (unless force)
      const toGenerate = batch.filter((s) => force || !urls[s.sectionIndex]);
      if (toGenerate.length === 0) continue;

      const results = await Promise.all(
        toGenerate.map((s) => processOneSection(s, sections.length, apiKey, supabase, project_id)),
      );

      let changed = false;
      for (let j = 0; j < toGenerate.length; j++) {
        if (results[j]) {
          urls[toGenerate[j].sectionIndex] = results[j];
          changed = true;
        }
      }

      // Progressive save — persist after each batch so partial results survive timeouts
      if (changed) {
        const { error: saveErr } = await supabase
          .from("lyric_projects")
          .update({ section_images: urls, updated_at: new Date().toISOString() })
          .eq("id", project_id);
        if (saveErr) console.error("[section-images] progressive save error:", saveErr.message);
        else console.log(`[section-images] saved ${urls.filter(Boolean).length}/${sections.length} images`);
      }
    }

    const successCount = urls.filter(Boolean).length;
    const allComplete = successCount === sections.length;

    if (allComplete) {
      await triggerPreviewPrecompute(sbUrl, sbKey, project_id);
    }

    return new Response(
      JSON.stringify({
        success: allComplete,
        partial: !allComplete && successCount > 0,
        urls,
        section_images: urls,
        generated: successCount,
        total: sections.length,
        failed_indices: urls.map((url, index) => (url === null ? index : -1)).filter((index) => index >= 0),
      }),
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
