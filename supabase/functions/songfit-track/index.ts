import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getSpotifyToken(): Promise<string> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Spotify credentials not configured");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${id}&client_secret=${secret}`,
  });
  if (!res.ok) throw new Error("Spotify auth failed");
  const { access_token } = await res.json();
  return access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trackUrl } = await req.json();
    if (!trackUrl || typeof trackUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing trackUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const match = trackUrl.match(/track\/([a-zA-Z0-9]+)/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid Spotify track URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trackId = match[1];
    const token = await getSpotifyToken();

    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!trackRes.ok) {
      const status = trackRes.status;
      if (status === 404) {
        return new Response(JSON.stringify({ error: "Track not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Spotify API error: ${status}`);
    }

    const track = await trackRes.json();

    // Fetch artist genres from the first artist
    let genres: string[] = [];
    const firstArtistId = track.artists?.[0]?.id;
    if (firstArtistId) {
      try {
        const artistRes = await fetch(`https://api.spotify.com/v1/artists/${firstArtistId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (artistRes.ok) {
          const artist = await artistRes.json();
          genres = artist.genres || [];
        }
      } catch { /* swallow – genres are optional */ }
    }

    const result = {
      trackId: track.id,
      title: track.name,
      artists: (track.artists || []).map((a: any) => ({
        name: a.name,
        id: a.id,
        spotifyUrl: a.external_urls?.spotify,
      })),
      albumTitle: track.album?.name,
      albumArt: track.album?.images?.[0]?.url || null,
      releaseDate: track.album?.release_date || null,
      previewUrl: track.preview_url || null,
      spotifyUrl: track.external_urls?.spotify,
      genres,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("songfit-track error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
