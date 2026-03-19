/**
 * Build a share URL that serves dynamic OG tags for social crawlers.
 * Points to the Supabase og-share edge function, which returns OG HTML
 * and redirects real browsers to the SPA page.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function buildShareUrl(
  artistSlug: string,
  songSlug: string,
  options?: { from?: string },
): string {
  const base = `${SUPABASE_URL}/functions/v1/og-share/${encodeURIComponent(artistSlug)}/${encodeURIComponent(songSlug)}`;
  if (options?.from) {
    return `${base}?from=${encodeURIComponent(options.from)}`;
  }
  return base;
}

/**
 * Extract artist/song slugs from a lyric dance URL like "/ajan/timeless/lyric-dance"
 */
export function parseLyricDanceUrl(
  url: string,
): { artistSlug: string; songSlug: string } | null {
  const match = url.match(/^\/?([^/]+)\/([^/]+)\/lyric-dance/);
  if (!match) return null;
  return { artistSlug: match[1], songSlug: match[2] };
}
