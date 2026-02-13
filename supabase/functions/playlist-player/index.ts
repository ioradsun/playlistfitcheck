import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: "grant_type=client_credentials",
      });
      if (resp.status >= 500 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Spotify auth failed [${resp.status}]: ${text}`);
      }
      const data = await resp.json();
      return data.access_token;
    } catch (e) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Spotify auth failed after retries");
}

interface Track {
  id: string;
  name: string;
  artists: string;
  previewUrl: string | null;
  spotifyUrl: string;
  albumArt: string | null;
  durationMs: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not configured");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!clientSecret) throw new Error("SPOTIFY_CLIENT_SECRET is not configured");

    const { playlistId } = await req.json();

    // Input validation
    if (!playlistId || typeof playlistId !== "string") {
      return new Response(JSON.stringify({ error: "playlistId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (playlistId.length > 100 || !/^[a-zA-Z0-9]+$/.test(playlistId)) {
      return new Response(JSON.stringify({ error: "Invalid playlistId format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken(clientId, clientSecret);

    const resp = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,preview_url,external_urls,artists(name),album(images),duration_ms)),next&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Spotify API error:", resp.status, errText);
      return new Response(
        JSON.stringify({ error: `Spotify API error [${resp.status}]` }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const tracks: Track[] = (data.items || [])
      .filter((item: any) => item.track)
      .map((item: any) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists?.map((a: any) => a.name).join(", ") || "Unknown",
        previewUrl: item.track.preview_url || null,
        spotifyUrl: item.track.external_urls?.spotify || `https://open.spotify.com/track/${item.track.id}`,
        albumArt: item.track.album?.images?.[1]?.url || item.track.album?.images?.[0]?.url || null,
        durationMs: item.track.duration_ms || 0,
      }));

    return new Response(JSON.stringify({ tracks }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
