import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter for brute force protection
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count++;
  return record.count > MAX_ATTEMPTS;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string" || password.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { data: engagements, error: engErr } = await supabase
      .from("track_engagement")
      .select("track_id, track_name, artist_name, action, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (engErr) throw engErr;

    const { data: searches, error: searchErr } = await supabase
      .from("search_logs")
      .select("playlist_name, playlist_url, song_name, song_url, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (searchErr) throw searchErr;

    const trackMap: Record<string, { name: string; artist: string; plays: number; spotify_clicks: number; sessions: string[] }> = {};
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

      if (e.session_id) {
        if (!sessionTracksMap[e.session_id]) sessionTracksMap[e.session_id] = [];
        sessionTracksMap[e.session_id].push({
          track_name: e.track_name || "Unknown",
          artist_name: e.artist_name || "Unknown",
          action: e.action,
        });
      }
    }

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

    const searchGroups: Record<string, {
      playlist_name: string | null;
      playlist_url: string | null;
      song_name: string | null;
      song_url: string | null;
      count: number;
      last_checked: string;
      tracksClicked: { track_name: string; artist_name: string; action: string }[];
    }> = {};

    for (const s of (searches || []).slice(0, 200)) {
      const key = s.playlist_url || s.playlist_name || "unknown";
      if (!searchGroups[key]) {
        searchGroups[key] = {
          playlist_name: s.playlist_name,
          playlist_url: s.playlist_url,
          song_name: s.song_name,
          song_url: s.song_url,
          count: 0,
          last_checked: s.created_at,
          tracksClicked: [],
        };
      }
      searchGroups[key].count++;
      if (new Date(s.created_at) > new Date(searchGroups[key].last_checked)) {
        searchGroups[key].last_checked = s.created_at;
      }
      if (s.session_id && sessionTracksMap[s.session_id]) {
        searchGroups[key].tracksClicked.push(...sessionTracksMap[s.session_id]);
      }
    }

    const enrichedSearches = Object.values(searchGroups)
      .sort((a, b) => new Date(b.last_checked).getTime() - new Date(a.last_checked).getTime());

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
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
