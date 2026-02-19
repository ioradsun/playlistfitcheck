import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

async function getSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID")!;
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Failed to get Spotify token");
  return data.access_token;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Allow cron calls (no auth header) OR admin-authenticated calls
    const authHeader = req.headers.get("authorization");
    let isAdminCall = false;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user && ADMIN_EMAILS.includes(user.email ?? "")) {
        isAdminCall = true;
      } else {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // If no auth header, assume cron call (trusted internal)

    const body = await req.json().catch(() => ({}));
    const page = body.page ?? 0;
    const pageSize = 100;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch profiles with spotify_artist_id
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, display_name, spotify_artist_id")
      .not("spotify_artist_id", "is", null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (profilesErr) throw profilesErr;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No artists to process" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken();
    const artistIds = profiles.map((p) => p.spotify_artist_id!);

    // Batch fetch artist info (Spotify allows up to 50 at a time)
    const artistMap: Record<string, any> = {};
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const resp = await fetch(
        `https://api.spotify.com/v1/artists?ids=${batch.join(",")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resp.ok) {
        const data = await resp.json();
        for (const artist of data.artists || []) {
          if (artist) artistMap[artist.id] = artist;
        }
      }
      if (i + 50 < artistIds.length) await sleep(200); // rate limit
    }

    // Fetch top tracks for each artist (individual calls, US market)
    const topTracksMap: Record<string, any[]> = {};
    for (let i = 0; i < artistIds.length; i++) {
      const id = artistIds[i];
      try {
        const resp = await fetch(
          `https://api.spotify.com/v1/artists/${id}/top-tracks?market=US`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (resp.ok) {
          const data = await resp.json();
          topTracksMap[id] = (data.tracks || []).slice(0, 10).map((t: any) => ({
            id: t.id,
            name: t.name,
            album: t.album?.name,
            album_art: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url,
            preview_url: t.preview_url,
            spotify_url: t.external_urls?.spotify,
            popularity: t.popularity,
            duration_ms: t.duration_ms,
          }));
        }
      } catch (_) {
        // skip failed tracks
      }
      // Throttle: ~3 req/sec to stay well under 180/min limit
      if (i < artistIds.length - 1) await sleep(350);
    }

    // Upsert into profit_artists
    let processed = 0;
    const now = new Date().toISOString();

    for (const profile of profiles) {
      const id = profile.spotify_artist_id!;
      const artist = artistMap[id];
      if (!artist) continue;

      const upsertData = {
        spotify_artist_id: id,
        name: artist.name,
        image_url: artist.images?.[0]?.url || null,
        artist_url: artist.external_urls?.spotify || null,
        popularity: artist.popularity || 0,
        followers_total: artist.followers?.total || 0,
        genres_json: artist.genres || [],
        raw_artist_json: artist,
        top_tracks_json: topTracksMap[id] || [],
        last_synced_at: now,
        updated_at: now,
      };

      const { data: existing } = await supabase
        .from("profit_artists")
        .select("id")
        .eq("spotify_artist_id", id)
        .single();

      if (existing) {
        await supabase.from("profit_artists").update(upsertData).eq("id", existing.id);
      } else {
        await supabase.from("profit_artists").insert(upsertData);
      }
      processed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        total_profiles: profiles.length,
        page,
        has_more: profiles.length === pageSize,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("populate-artists error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
