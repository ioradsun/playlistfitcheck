import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import jpeg from "https://esm.sh/jpeg-js@0.4.4";
import { PNG } from "https://esm.sh/pngjs@7.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TopReaction = { emoji: string; count: number; line_text: string } | null;

type PixelData = {
  width: number;
  height: number;
  data: Uint8Array;
};

function toHex(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function blend(hexA: string, hexB: string, t: number): string {
  const a = hexA.replace("#", "");
  const b = hexB.replace("#", "");
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function decodePixels(bytes: Uint8Array, contentType?: string | null): PixelData | null {
  const header = bytes.slice(0, 12);
  const isPng =
    contentType?.includes("png") ||
    (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47);
  const isJpeg =
    contentType?.includes("jpeg") ||
    contentType?.includes("jpg") ||
    (header[0] === 0xff && header[1] === 0xd8);

  try {
    if (isPng) {
      const decoded = PNG.sync.read(bytes);
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    }
    if (isJpeg) {
      const decoded = jpeg.decode(bytes, { useTArray: true });
      return {
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
      };
    }
  } catch (error) {
    console.error("[precompute-dance-preview] image decode failed", error);
  }

  return null;
}

async function extractPaletteFromImage(url: string): Promise<string[] | null> {
  const response = await fetch(url);
  if (!response.ok) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const decoded = decodePixels(bytes, contentType);
  if (!decoded) return null;

  const { data } = decoded;
  const step = Math.max(4, Math.floor(Math.sqrt((decoded.width * decoded.height) / 1400)));

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let lumTotal = 0;
  let samples = 0;

  for (let y = 0; y < decoded.height; y += step) {
    for (let x = 0; x < decoded.width; x += step) {
      const i = (y * decoded.width + x) * 4;
      const a = data[i + 3] ?? 255;
      if (a < 16) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const key = `${Math.floor(r / 16)}-${Math.floor(g / 16)}-${Math.floor(b / 16)}`;
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);

      lumTotal += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      samples += 1;
    }
  }

  if (samples === 0 || buckets.size === 0) return null;

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const dominant = ranked[0];
  const secondary = ranked[1] ?? dominant;

  const background = rgbToHex(dominant.r / dominant.count, dominant.g / dominant.count, dominant.b / dominant.count);
  const accent = rgbToHex(secondary.r / secondary.count, secondary.g / secondary.count, secondary.b / secondary.count);
  const avgLum = lumTotal / samples;
  const text = avgLum < 0.5 ? "#f4f4f5" : "#111827";
  const glow = blend(accent, text === "#f4f4f5" ? "#ffffff" : "#000000", 0.35);
  const dim = blend(text, background, 0.45);

  return [background, accent, text, glow, dim];
}

async function buildAutoPalettes(sectionImages: string[]): Promise<string[][]> {
  const fallback = ["#0a0a0f", "#a855f7", "#f0f0f0", "#e879f9", "#555555"];
  const palettes: string[][] = [];

  for (const url of sectionImages) {
    if (!url) {
      palettes.push(fallback);
      continue;
    }

    try {
      const palette = await extractPaletteFromImage(url);
      palettes.push(palette ?? fallback);
    } catch (error) {
      console.error("[precompute-dance-preview] palette extraction failed", error);
      palettes.push(fallback);
    }
  }

  return palettes;
}

function computeTopReaction(
  reactions: Array<{ emoji: string | null; line_index: number | null }>,
  lyrics: Array<{ text?: string }> | null,
): TopReaction {
  if (!reactions.length) return null;

  const byLine = new Map<number, { total: number; emojiTotals: Map<string, number> }>();
  for (const row of reactions) {
    if (row.line_index == null || !row.emoji) continue;
    const rec = byLine.get(row.line_index) ?? { total: 0, emojiTotals: new Map<string, number>() };
    rec.total += 1;
    rec.emojiTotals.set(row.emoji, (rec.emojiTotals.get(row.emoji) ?? 0) + 1);
    byLine.set(row.line_index, rec);
  }

  if (!byLine.size) return null;

  let bestLine = -1;
  let bestTotal = 0;
  for (const [line, rec] of byLine.entries()) {
    if (rec.total > bestTotal) {
      bestTotal = rec.total;
      bestLine = line;
    }
  }

  const selected = byLine.get(bestLine);
  if (!selected) return null;

  let bestEmoji = "fire";
  let bestEmojiCount = 0;
  for (const [emoji, count] of selected.emojiTotals.entries()) {
    if (count > bestEmojiCount) {
      bestEmoji = emoji;
      bestEmojiCount = count;
    }
  }

  const lineText = (lyrics?.[bestLine]?.text ?? "").slice(0, 120);
  if (!lineText) return null;

  return { emoji: bestEmoji, count: bestEmojiCount, line_text: lineText };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const danceId = body?.dance_id ?? body?.lyric_dance_id ?? null;

    if (!danceId) {
      return new Response(JSON.stringify({ error: "dance_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: dance, error: danceError } = await supabase
      .from("lyric_projects")
      .select("id, section_images, auto_palettes, lines")
      .eq("id", danceId)
      .maybeSingle();

    if (danceError || !dance) {
      return new Response(JSON.stringify({ error: "Dance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sectionImages = (Array.isArray(dance.section_images) ? dance.section_images : [])
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const coverImageUrl = sectionImages[0] ?? null;
    const hasPalettes = Array.isArray(dance.auto_palettes) && dance.auto_palettes.length > 0;

    const autoPalettes = hasPalettes
      ? dance.auto_palettes
      : (sectionImages.length > 0 ? await buildAutoPalettes(sectionImages) : null);

    const { data: reactionRows, error: reactionError } = await supabase
      .from("lyric_dance_reactions")
      .select("emoji, line_index")
      .eq("dance_id", danceId);

    if (reactionError) throw reactionError;

    const topReaction = computeTopReaction(
      (reactionRows ?? []) as Array<{ emoji: string | null; line_index: number | null }>,
      (Array.isArray(dance.lines) ? dance.lines : null) as Array<{ text?: string }> | null,
    );

    const updatePayload: Record<string, unknown> = {
      cover_image_url: coverImageUrl,
      top_reaction: topReaction,
      preview_ready: true,
      updated_at: new Date().toISOString(),
    };

    if (!hasPalettes && autoPalettes) {
      updatePayload.auto_palettes = autoPalettes;
    }

    const { error: updateError } = await supabase
      .from("lyric_projects")
      .update(updatePayload)
      .eq("id", danceId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, dance_id: danceId, cover_image_url: coverImageUrl, top_reaction: topReaction }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[precompute-dance-preview] error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
