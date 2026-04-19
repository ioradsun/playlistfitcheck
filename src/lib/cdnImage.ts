/**
 * cdnImage — Transform Supabase storage URLs into WebP-encoded, width-resized
 * variants via Supabase's image render endpoint.
 *
 * Why this exists
 * ───────────────
 * Raw section images and album art live in the `lyric-backgrounds` and
 * `avatars` buckets as 1.5–2.5 MB PNGs. A single FMLY card has ~8 sections,
 * so cold-loading the top 3 cards would otherwise pull ~36 MB of poster
 * payload — the dominant cause of slow card activation.
 *
 * Supabase's image transform endpoint (`/storage/v1/render/image/`) re-encodes
 * to WebP when an explicit width is supplied; output is typically 30–50× smaller
 * than the original PNG.
 *
 * IMPORTANT: A request without `width` returns the original PNG bytes. To get
 * WebP, both `width` AND a quality must be set. We always pass both.
 *
 * Presets:
 *   • engineWidth  → chapter image drawn into the player canvas. Canvas
 *                    rarely exceeds ~720 CSS px wide; 960 covers all DPR cases
 *                    while still being a 10× win over the raw PNG.
 *   • liveWidth    → live-card/source-of-truth poster path; aligned with engine
 *                    to avoid shell↔canvas first-frame mismatches.
 *   • thumbWidth   → avatars and small thumbnails.
 *
 * Idempotency
 * ───────────
 * If a URL is not on Supabase storage, or already targets the render endpoint,
 * it's returned unchanged. Safe to wrap any URL.
 */

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";

export type CdnPreset = "engine" | "live" | "thumb";

const PRESETS: Record<CdnPreset, { width: number; quality: number }> = {
  // Player canvas chapter image. 960 px @ 80 ≈ 80–120 KB; still 15–20× smaller
  // than the raw PNG, with no visible quality loss at typical card sizes.
  engine: { width: 960, quality: 80 },
  // Live card visual source for both feed preloads + engine chapter images.
  // Kept aligned to avoid first-frame content mismatches.
  live: { width: 960, quality: 80 },
  // Avatars and small thumbs.
  thumb: { width: 240, quality: 75 },
};

/**
 * Wrap a Supabase storage URL with width + quality params so the CDN returns
 * a WebP-encoded variant. Returns the original URL unchanged for any non-
 * Supabase or already-transformed URL.
 */
export function cdnImage(url: string | null | undefined, preset: CdnPreset = "live"): string {
  if (!url) return url ?? "";
  // Don't touch render URLs (already transformed) or non-supabase URLs.
  if (url.includes(SUPABASE_RENDER_PATH)) return url;
  const idx = url.indexOf(SUPABASE_OBJECT_PATH);
  if (idx === -1) return url;

  const { width, quality } = PRESETS[preset];
  const base =
    url.slice(0, idx) +
    SUPABASE_RENDER_PATH +
    url.slice(idx + SUPABASE_OBJECT_PATH.length);

  // Strip any existing query so we don't double up.
  const [path] = base.split("?");
  return `${path}?width=${width}&quality=${quality}`;
}

/** Convenience for arrays of section images. Filters out null/empty entries. */
export function cdnImages(urls: (string | null | undefined)[] | null | undefined, preset: CdnPreset = "engine"): string[] {
  if (!urls) return [];
  return urls.filter(Boolean).map((u) => cdnImage(u as string, preset));
}
