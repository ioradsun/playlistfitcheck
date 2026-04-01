import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) throw new Error(`Spotify auth failed [${resp.status}]`);

  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function fetchSpotifyTrack(trackId: string, token: string) {
  const resp = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Spotify track fetch failed [${resp.status}]`);
  return resp.json();
}

async function fetchSpotifyAudioFeatures(
  trackId: string,
  token: string,
): Promise<{ tempo: number } | null> {
  try {
    const resp = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { tempo: typeof data.tempo === "number" ? data.tempo : 0 };
  } catch {
    return null;
  }
}

async function scrapePreviewFromEmbed(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/"audioPreview"\s*:\s*\{"url"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];

    const fallback = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+/);
    return fallback?.[0] ?? null;
  } catch {
    return null;
  }
}

function extractTrackId(spotifyTrackUrl: string): string | null {
  const match = spotifyTrackUrl?.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const spotifyTrackUrl = body.spotifyTrackUrl || body.spotifyUrl || "";
    const trackId = extractTrackId(spotifyTrackUrl);

    if (!trackId) {
      return new Response(JSON.stringify({ error: "Invalid Spotify URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID")!;
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = await getSpotifyToken(clientId, clientSecret);
    const track = await fetchSpotifyTrack(trackId, token);

    const trackTitle = track.name;
    const artistName = track.artists[0].name;
    const albumArtUrl = track.album.images[0]?.url ?? null;

    let previewUrl: string | null = track.preview_url ?? null;
    if (!previewUrl) previewUrl = await scrapePreviewFromEmbed(trackId);

    const audioFeatures = await fetchSpotifyAudioFeatures(trackId, token);
    const bpm = audioFeatures?.tempo ?? 0;

    const slug = artistName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { data: existingGhost } = await supabase
      .from("ghost_artist_profiles" as any)
      .select("id")
      .eq("spotify_artist_slug", slug)
      .maybeSingle();

    let profileId: string;
    if (existingGhost?.id) {
      profileId = existingGhost.id;
    } else {
      const { data: newGhost, error: ghostErr } = await supabase
        .from("ghost_artist_profiles" as any)
        .insert({ spotify_artist_slug: slug, display_name: artistName })
        .select("id")
        .single();

      if (ghostErr) throw new Error(ghostErr.message);
      profileId = newGhost.id;
    }

    return new Response(
      JSON.stringify({
        trackId,
        trackTitle,
        artistName,
        albumArtUrl,
        previewUrl,
        bpm,
        slug,
        profileId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
