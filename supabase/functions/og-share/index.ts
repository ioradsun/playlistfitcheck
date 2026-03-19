import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://tools.fm";
const FALLBACK_OG_IMAGE = `${SITE_URL}/og/homepage.png`;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const GREEN = "#22c55e";

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/functions\/v1/, "");
  const segments = pathname
    .replace(/^\/og-share\/?/, "")
    .split("/")
    .filter(Boolean);

  const artistSlug = segments[0] || "";
  const songSlug = segments[1] || "";
  const isClaim = url.searchParams.get("from") === "claim";
  const isImageRequest = url.searchParams.get("format") === "image";

  if (!artistSlug || !songSlug) {
    return redirect(SITE_URL);
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;

  let songName = deslug(songSlug);
  let artistName = deslug(artistSlug);
  let sectionImageUrl: string | null = null;
  let voteCount = 0;

  if (supabase) {
    try {
      const { data: dance } = await supabase
        .from("shareable_lyric_dances")
        .select("song_name, artist_name, section_images, album_art_url")
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .maybeSingle();

      if (dance) {
        songName = dance.song_name || songName;
        artistName = dance.artist_name || artistName;
        const images = Array.isArray(dance.section_images) ? dance.section_images : [];
        sectionImageUrl = images.find((image): image is string => typeof image === "string" && image.length > 0) || dance.album_art_url || null;
      }

      const { data: post } = await supabase
        .from("songfit_posts")
        .select("engagement_score")
        .eq("lyric_dance_url", `/${artistSlug}/${songSlug}/lyric-dance`)
        .eq("status", "live")
        .maybeSingle();

      if (typeof post?.engagement_score === "number") {
        voteCount = Math.round(post.engagement_score);
      }
    } catch (error) {
      console.error("[og-share] DB query failed:", error);
    }
  }

  const displaySong = songName.toUpperCase();
  const displayArtist = toTitleCase(artistName);
  const spaUrl = isClaim
    ? `${SITE_URL}/${artistSlug}/${songSlug}/lyric-dance?from=claim`
    : `${SITE_URL}/${artistSlug}/${songSlug}/lyric-dance`;
  const imageBaseUrl = sbUrl || SITE_URL;
  const ogImageUrl = `${imageBaseUrl}/functions/v1/og-share/${encodeURIComponent(artistSlug)}/${encodeURIComponent(songSlug)}?format=image${isClaim ? "&from=claim" : ""}`;

  if (isImageRequest) {
    const storagePath = `og-cards/${artistSlug}--${songSlug}${isClaim ? "--claim" : ""}.svg`;

    if (supabase) {
      const { data: cached } = supabase.storage.from("lyric-backgrounds").getPublicUrl(storagePath);
      try {
        const headResp = await fetch(cached.publicUrl, { method: "HEAD" });
        if (headResp.ok) {
          return redirect(cached.publicUrl, "public, max-age=86400");
        }
      } catch {
        // Cache miss or network failure; fall through to regeneration.
      }
    }

    const maxSongLen = 28;
    const truncatedSong = displaySong.length > maxSongLen
      ? `${displaySong.slice(0, maxSongLen - 1).trimEnd()}…`
      : displaySong;

    const subtitle = isClaim
      ? "Your song · AI lyric video · Claim free"
      : voteCount > 10
        ? `Interactive lyric video · ${voteCount} engaged`
        : "Interactive lyric video";

    const bgImageBlock = sectionImageUrl
      ? `<defs><filter id="blur"><feGaussianBlur stdDeviation="30"/></filter></defs>
  <image href="${escapeAttr(sectionImageUrl)}" x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice" opacity="0.15" filter="url(#blur)"/>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0a0a0a"/>
  ${bgImageBlock}
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="rgba(10,10,10,0.75)"/>
  <text x="${OG_WIDTH / 2}" y="${OG_HEIGHT / 2 - 30}" text-anchor="middle"
        font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="64" font-weight="700"
        fill="${GREEN}" letter-spacing="4">${escapeHtml(truncatedSong)}</text>
  <text x="${OG_WIDTH / 2}" y="${OG_HEIGHT / 2 + 40}" text-anchor="middle"
        font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="28" font-weight="400"
        fill="rgba(255,255,255,0.7)" letter-spacing="2">${escapeHtml(displayArtist)}</text>
  <text x="${OG_WIDTH / 2}" y="${OG_HEIGHT / 2 + 85}" text-anchor="middle"
        font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="18" font-weight="400"
        fill="rgba(255,255,255,0.3)" letter-spacing="3">${escapeHtml(subtitle)}</text>
  <text x="${OG_WIDTH - 40}" y="${OG_HEIGHT - 25}" text-anchor="end"
        font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="16" font-weight="500"
        fill="rgba(255,255,255,0.15)" letter-spacing="2">tools.fm</text>
</svg>`;

    if (supabase) {
      const svgBytes = new TextEncoder().encode(svg);
      void supabase.storage.from("lyric-backgrounds").upload(storagePath, svgBytes, {
        contentType: "image/svg+xml",
        upsert: true,
      });
    }

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  }

  const ogTitle = isClaim
    ? `${displayArtist} — watch "${displaySong}" come alive`
    : `"${displaySong}" — ${displayArtist}`;

  const ogDescription = isClaim
    ? "Your song. One click. AI lyric video. Claim your free artist page on tools.fm"
    : voteCount > 10
      ? `Interactive lyric video · ${voteCount} listeners engaged · tools.fm`
      : "Interactive lyric video on tools.fm · Run it back or skip";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(ogTitle)}</title>
<meta property="og:title" content="${escapeAttr(ogTitle)}"/>
<meta property="og:description" content="${escapeAttr(ogDescription)}"/>
<meta property="og:image" content="${escapeAttr(ogImageUrl || FALLBACK_OG_IMAGE)}"/>
<meta property="og:image:width" content="${OG_WIDTH}"/>
<meta property="og:image:height" content="${OG_HEIGHT}"/>
<meta property="og:url" content="${escapeAttr(spaUrl)}"/>
<meta property="og:type" content="video.other"/>
<meta property="og:site_name" content="tools.fm"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeAttr(ogTitle)}"/>
<meta name="twitter:description" content="${escapeAttr(ogDescription)}"/>
<meta name="twitter:image" content="${escapeAttr(ogImageUrl || FALLBACK_OG_IMAGE)}"/>
<meta http-equiv="refresh" content="0;url=${escapeAttr(spaUrl)}"/>
<script>window.location.replace(${JSON.stringify(spaUrl)});</script>
</head>
<body style="background:#0a0a0a;color:#888;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Redirecting to <a href="${escapeAttr(spaUrl)}" style="color:${GREEN}">${escapeHtml(displaySong)}</a>…</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
});

function redirect(location: string, cacheControl?: string): Response {
  const headers = new Headers({ Location: location });
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  return new Response(null, { status: 302, headers });
}

function deslug(slug: string): string {
  return slug.replace(/-/g, " ");
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
