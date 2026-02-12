import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all track engagement data
    const { data: engagements, error: engErr } = await supabase
      .from("track_engagement")
      .select("track_id, track_name, artist_name, action, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (engErr) throw engErr;

    // Fetch all search logs
    const { data: searches, error: searchErr } = await supabase
      .from("search_logs")
      .select("playlist_name, playlist_url, song_name, song_url, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (searchErr) throw searchErr;

    // Aggregate track clicks: { trackId -> { name, artist, plays, spotify_clicks } }
    const trackMap: Record<string, { name: string; artist: string; plays: number; spotify_clicks: number; sessions: string[] }> = {};

    // Build session -> tracks mapping (for hover on searches)
    const sessionTracksMap: Record<string, { track_name: string; artist_name: string; action: string }[]> = {};

    for (const e of engagements || []) {
      if (!trackMap[e.track_id]) {
        trackMap[e.track_id] = {
          name: e.track_name || "Unknown",
          artist: e.artist_name || "Unknown",
          plays: 0,
          spotify_clicks: 0,
          sessions: [],
        };
      }
      const t = trackMap[e.track_id];
      if (e.action === "play") t.plays++;
      else if (e.action === "spotify_click") t.spotify_clicks++;
      if (e.session_id && !t.sessions.includes(e.session_id)) {
        t.sessions.push(e.session_id);
      }

      // Build per-session track list
      if (e.session_id) {
        if (!sessionTracksMap[e.session_id]) sessionTracksMap[e.session_id] = [];
        sessionTracksMap[e.session_id].push({
          track_name: e.track_name || "Unknown",
          artist_name: e.artist_name || "Unknown",
          action: e.action,
        });
      }
    }

    // Build session -> search mapping for correlation
    const sessionSearchMap: Record<string, { playlist_name: string | null; song_name: string | null; playlist_url: string | null; song_url: string | null }> = {};
    for (const s of searches || []) {
      if (s.session_id) {
        sessionSearchMap[s.session_id] = {
          playlist_name: s.playlist_name,
          song_name: s.song_name,
          playlist_url: s.playlist_url,
          song_url: s.song_url,
        };
      }
    }

    // Build final track stats
    const trackStats = Object.entries(trackMap)
      .map(([trackId, data]) => ({
        trackId,
        name: data.name,
        artist: data.artist,
        plays: data.plays,
        spotifyClicks: data.spotify_clicks,
        totalInteractions: data.plays + data.spotify_clicks,
      }))
      .sort((a, b) => b.totalInteractions - a.totalInteractions);

    // Enrich searches with correlated track clicks
    const enrichedSearches = (searches || []).slice(0, 50).map((s) => ({
      playlist_name: s.playlist_name,
      playlist_url: s.playlist_url,
      song_name: s.song_name,
      song_url: s.song_url,
      session_id: s.session_id,
      created_at: s.created_at,
      tracksClicked: s.session_id ? (sessionTracksMap[s.session_id] || []) : [],
    }));

    return new Response(
      JSON.stringify({
        trackStats,
        totalEngagements: engagements?.length || 0,
        totalSearches: searches?.length || 0,
        checkFits: enrichedSearches,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Admin dashboard error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
