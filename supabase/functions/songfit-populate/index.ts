import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const { playlistUrl, userId } = await req.json();
    if (!playlistUrl) {
      return new Response(JSON.stringify({ error: "playlistUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid playlist URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const playlistId = match[1];
    const token = await getSpotifyToken();

    // Fetch all tracks from playlist (paginated)
    const tracks: any[] = [];
    let url: string | null =
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(name,id,external_urls),album(name,images,release_date),preview_url,external_urls)),next&limit=100`;

    while (url) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Spotify API error ${resp.status}: ${text}`);
      }
      const data = await resp.json();
      tracks.push(...(data.items || []));
      url = data.next || null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check which tracks already exist to avoid duplicates
    const trackIds = tracks
      .filter((t) => t.track?.id)
      .map((t) => t.track.id);

    const { data: existing } = await supabase
      .from("songfit_posts")
      .select("spotify_track_id")
      .in("spotify_track_id", trackIds);

    const existingSet = new Set((existing || []).map((e: any) => e.spotify_track_id));

    const newPosts = tracks
      .filter((t) => t.track?.id && !existingSet.has(t.track.id))
      .map((t) => {
        const track = t.track;
        return {
          user_id: userId,
          spotify_track_url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
          spotify_track_id: track.id,
          track_title: track.name,
          track_artists_json: (track.artists || []).map((a: any) => ({
            name: a.name,
            id: a.id,
            spotifyUrl: a.external_urls?.spotify,
          })),
          album_title: track.album?.name || null,
          album_art_url: track.album?.images?.[0]?.url || null,
          release_date: track.album?.release_date || null,
          preview_url: track.preview_url || null,
          caption: "",
          tags_json: [],
        };
      });

    if (newPosts.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, message: "All tracks already in feed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert in batches of 50
    let inserted = 0;
    for (let i = 0; i < newPosts.length; i += 50) {
      const batch = newPosts.slice(i, i + 50);
      const { error } = await supabase.from("songfit_posts").insert(batch);
      if (error) {
        console.error("Batch insert error:", error);
        throw new Error(`Insert failed: ${error.message}`);
      }
      inserted += batch.length;
    }

    return new Response(
      JSON.stringify({ inserted, total: tracks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("songfit-populate error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
