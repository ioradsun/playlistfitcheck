import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate via JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user || !ADMIN_EMAILS.includes(user.email ?? "")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const section = body.section || "data";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── DELETE USER action ──
    if (body.action === "delete_user" && body.user_id) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(body.user_id);
      if (delErr) throw delErr;
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── USERS section ──
    if (section === "users") {
      const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authErr) throw authErr;

      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, created_at");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const { data: savedSearches } = await supabase.from("saved_searches").select("user_id");

      // Fetch ALL track engagement with user_id
      const { data: engagements } = await supabase
        .from("track_engagement")
        .select("user_id, track_id, track_name, artist_name, action, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      const fitCountMap: Record<string, number> = {};
      for (const s of savedSearches || []) {
        fitCountMap[s.user_id] = (fitCountMap[s.user_id] || 0) + 1;
      }

      const profileMap: Record<string, any> = {};
      for (const p of profiles || []) profileMap[p.id] = p;

      const roleMap: Record<string, string> = {};
      for (const r of roles || []) roleMap[r.user_id] = r.role;

      // Build per-user engagement: { userId -> { trackId -> { name, artist, plays, spotify_clicks } } }
      const userEngagementMap: Record<string, Record<string, { track_name: string; artist_name: string; plays: number; spotify_clicks: number }>> = {};
      let totalPlays = 0;
      let totalClicks = 0;

      for (const e of engagements || []) {
        if (!e.user_id) continue;
        if (!userEngagementMap[e.user_id]) userEngagementMap[e.user_id] = {};
        const tracks = userEngagementMap[e.user_id];
        if (!tracks[e.track_id]) {
          tracks[e.track_id] = { track_name: e.track_name || "Unknown", artist_name: e.artist_name || "Unknown", plays: 0, spotify_clicks: 0 };
        }
        if (e.action === "play") { tracks[e.track_id].plays++; totalPlays++; }
        else if (e.action === "spotify_click") { tracks[e.track_id].spotify_clicks++; totalClicks++; }
      }

      const users = (authUsers || []).map((u: any) => {
        const userTracks = userEngagementMap[u.id] || {};
        const trackList = Object.entries(userTracks)
          .map(([trackId, t]) => ({ track_id: trackId, ...t, total: t.plays + t.spotify_clicks }))
          .sort((a, b) => b.total - a.total);

        const totalInteractions = trackList.reduce((sum, t) => sum + t.total, 0);

        return {
          id: u.id,
          email: u.email,
          display_name: profileMap[u.id]?.display_name || null,
          avatar_url: profileMap[u.id]?.avatar_url || u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
          role: roleMap[u.id] || "user",
          fit_checks: fitCountMap[u.id] || 0,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          provider: u.app_metadata?.provider || "email",
          engagement: { total: totalInteractions, tracks: trackList },
        };
      });

      // Sort: users with most engagement first
      users.sort((a: any, b: any) => b.engagement.total - a.engagement.total);

      return new Response(JSON.stringify({ users }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DATA section (existing logic) ──
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
        trackMap[e.track_id] = { name: e.track_name || "Unknown", artist: e.artist_name || "Unknown", plays: 0, spotify_clicks: 0, sessions: [] };
      }
      const t = trackMap[e.track_id];
      if (e.action === "play") t.plays++;
      else if (e.action === "spotify_click") t.spotify_clicks++;
      if (e.session_id && !t.sessions.includes(e.session_id)) t.sessions.push(e.session_id);
      if (e.session_id) {
        if (!sessionTracksMap[e.session_id]) sessionTracksMap[e.session_id] = [];
        sessionTracksMap[e.session_id].push({ track_name: e.track_name || "Unknown", artist_name: e.artist_name || "Unknown", action: e.action });
      }
    }

    const trackStats = Object.entries(trackMap)
      .map(([trackId, data]) => ({ trackId, name: data.name, artist: data.artist, plays: data.plays, spotifyClicks: data.spotify_clicks, totalInteractions: data.plays + data.spotify_clicks }))
      .sort((a, b) => b.totalInteractions - a.totalInteractions);

    const searchGroups: Record<string, { playlist_name: string | null; playlist_url: string | null; song_name: string | null; song_url: string | null; count: number; last_checked: string; tracksClicked: { track_name: string; artist_name: string; action: string }[] }> = {};
    for (const s of (searches || []).slice(0, 200)) {
      const key = s.playlist_url || s.playlist_name || "unknown";
      if (!searchGroups[key]) {
        searchGroups[key] = { playlist_name: s.playlist_name, playlist_url: s.playlist_url, song_name: s.song_name, song_url: s.song_url, count: 0, last_checked: s.created_at, tracksClicked: [] };
      }
      searchGroups[key].count++;
      if (new Date(s.created_at) > new Date(searchGroups[key].last_checked)) searchGroups[key].last_checked = s.created_at;
      if (s.session_id && sessionTracksMap[s.session_id]) searchGroups[key].tracksClicked.push(...sessionTracksMap[s.session_id]);
    }

    const enrichedSearches = Object.values(searchGroups).sort((a, b) => new Date(b.last_checked).getTime() - new Date(a.last_checked).getTime());

    return new Response(
      JSON.stringify({ trackStats, totalEngagements: engagements?.length || 0, totalSearches: searches?.length || 0, checkFits: enrichedSearches }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Admin dashboard error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
