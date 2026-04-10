import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════
// Section Image Generation v2
//
// The AI's scene description IS the image prompt.
// No contradictory fragment pile. No rotating color seeds.
// No MOOD_IMAGE_STYLE lookup. No luminance calculations.
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  project_id: string;
  force?: boolean;
}

// ── Image prompt builder ─────────────────────────────────────
// Four sentences. No contradictions. The scene description IS the style.

function buildImagePrompt(
  world: string,
  see: string,
  nouns: string[],
  artistDirection: string | undefined,
  sectionIndex: number,
  totalSections: number,
): string {
  const setting = artistDirection
    ? `Cinematic background: ${artistDirection}.`
    : `Cinematic background: ${world}.`;

  const elements =
    nouns.length > 0 ? `Key elements: ${nouns.join(", ")}.` : "";

  const position =
    sectionIndex === 0
      ? "Opening establishing shot."
      : sectionIndex === totalSections - 1
        ? "Closing shot, sense of ending."
        : "";

  return [
    setting,
    see,
    elements,
    position,
    "Wide cinematic shot, no people, no faces, no text, photorealistic, film grain, 16:9 landscape, visible detail throughout, avoid pure black regions.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ── Image generation ─────────────────────────────────────────

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
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(
      `[section-images] AI error ${resp.status}: ${text.slice(0, 200)}`,
    );
    return null;
  }

  const data = await resp.json();
  return (
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null
  );
}

// ── Storage upload ───────────────────────────────────────────

async function uploadBase64ToStorage(
  supabase: any,
  base64DataUri: string,
  path: string,
): Promise<string | null> {
  const match = base64DataUri.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/,
  );
  if (!match) return null;

  const mimeType = `image/${match[1]}`;
  const binaryString = atob(match[2]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("lyric-backgrounds")
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (error) {
    console.error(`[section-images] upload error: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("lyric-backgrounds")
    .getPublicUrl(path);
  return urlData?.publicUrl ?? null;
}

// ── Process one section ──────────────────────────────────────

async function processOneSection(
  world: string,
  see: string,
  nouns: string[],
  artistDirection: string | undefined,
  sectionIndex: number,
  totalSections: number,
  apiKey: string,
  supabase: any,
  projectId: string,
): Promise<string | null> {
  const prompt = buildImagePrompt(
    world,
    see,
    nouns,
    artistDirection,
    sectionIndex,
    totalSections,
  );
  console.log(
    `[section-images] section ${sectionIndex}: ${prompt.slice(0, 120)}...`,
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const base64 = await generateImage(prompt, apiKey);
    if (!base64) continue;

    const ext = base64.includes("image/png") ? "png" : "jpg";
    const path = `${projectId}/section-${sectionIndex}-${Date.now()}.${ext}`;
    const url = await uploadBase64ToStorage(supabase, base64, path);
    if (url) return url;
  }

  return null;
}

// ── Trigger preview precompute ───────────────────────────────

async function triggerPreviewPrecompute(
  sbUrl: string,
  sbKey: string,
  projectId: string,
): Promise<void> {
  try {
    await fetch(`${sbUrl}/functions/v1/precompute-dance-preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project_id: projectId }),
    });
  } catch (e) {
    console.error("[section-images] preview precompute failed:", e);
  }
}

// ── Serve ────────────────────────────────────────────────────

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

    const { project_id, force } = body;
    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !sbUrl || !sbKey) throw new Error("Missing env vars");

    const supabase = createClient(sbUrl, sbKey);

    // Load project
    const { data: row, error: dbErr } = await supabase
      .from("lyric_projects")
      .select("cinematic_direction, section_images")
      .eq("id", project_id)
      .maybeSingle();

    if (dbErr || !row) {
      throw new Error(`Could not load project ${project_id}`);
    }

    const cd = row.cinematic_direction;
    const sections = Array.isArray(cd?.sections) ? cd.sections : [];
    if (sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sections in cinematic_direction" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check cache
    const existing: (string | null)[] = Array.isArray(row.section_images)
      ? row.section_images
      : [];
    if (
      !force &&
      existing.length >= sections.length &&
      existing.every(Boolean)
    ) {
      await triggerPreviewPrecompute(sbUrl, sbKey, project_id);
      return new Response(
        JSON.stringify({
          success: true,
          cached: true,
          urls: existing,
          section_images: existing,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Read v2 fields (with v1 fallbacks)
    const world: string =
      cd?.world ?? cd?.description ?? "cinematic scene";
    const artistDirection: string | undefined =
      typeof cd?._artistDirection === "string"
        ? cd._artistDirection.trim() || undefined
        : undefined;

    // Prepare URL array
    const urls: (string | null)[] = [...existing];
    while (urls.length < sections.length) urls.push(null);

    // Generate all in parallel
    const toGenerate = sections.filter(
      (_: any, i: number) => force || !urls[i],
    );

    const results = await Promise.all(
      toGenerate.map((s: any) =>
        processOneSection(
          world,
          s.description ?? "cinematic scene",
          Array.isArray(s.nouns) ? s.nouns : [],
          artistDirection,
          s.sectionIndex ?? 0,
          sections.length,
          apiKey,
          supabase,
          project_id,
        ),
      ),
    );

    let changed = false;
    for (let j = 0; j < toGenerate.length; j++) {
      const idx = toGenerate[j].sectionIndex ?? j;
      if (results[j]) {
        urls[idx] = results[j];
        changed = true;
      }
    }

    // Progressive save
    if (changed) {
      const { error: saveErr } = await supabase
        .from("lyric_projects")
        .update({
          section_images: urls,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project_id);
      if (saveErr) {
        console.error(
          "[section-images] save error:",
          saveErr.message,
        );
      }
    }

    const successCount = urls.filter(Boolean).length;
    if (successCount === sections.length) {
      await triggerPreviewPrecompute(sbUrl, sbKey, project_id);
    }

    return new Response(
      JSON.stringify({
        success: successCount === sections.length,
        partial: successCount > 0 && successCount < sections.length,
        urls,
        section_images: urls,
        generated: successCount,
        total: sections.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    console.error("[section-images] error:", e);
    return new Response(
      JSON.stringify({ error: e.message ?? "Failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
