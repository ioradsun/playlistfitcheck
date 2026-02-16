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

    // ── WIDGET CONFIG actions ──
    if (body.action === "get_widget_config") {
      const { data: cfg } = await supabase.from("widget_config").select("*").limit(1).single();
      return new Response(JSON.stringify({ config: cfg }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (body.action === "update_site_copy" && body.copy_json) {
      const { data: existing } = await supabase.from("site_copy").select("id").limit(1).single();
      if (existing) {
        await supabase.from("site_copy").update({ copy_json: body.copy_json, updated_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await supabase.from("site_copy").insert({ copy_json: body.copy_json });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "update_widget_config") {
      const { data: existing } = await supabase.from("widget_config").select("id").limit(1).single();
      if (existing) {
        const updates: Record<string, string> = { updated_at: new Date().toISOString() };
        if (body.embed_url) updates.embed_url = body.embed_url;
        if (body.widget_title) updates.widget_title = body.widget_title;
        if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url;
        if (body.thumbnail_link !== undefined) updates.thumbnail_link = body.thumbnail_link;
        await supabase.from("widget_config").update(updates).eq("id", existing.id);
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── VERIFICATION REQUESTS ──
    if (body.action === "get_verification_requests") {
      const { data: requests } = await supabase
        .from("verification_requests")
        .select("id, user_id, screenshot_url, status, created_at, reviewed_at")
        .order("created_at", { ascending: false })
        .limit(100);

      // Fetch profiles for each request
      const userIds = [...new Set((requests || []).map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);
      const profileMap: Record<string, any> = {};
      for (const p of profiles || []) profileMap[p.id] = p;

      const enriched = (requests || []).map((r: any) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
      }));

      return new Response(JSON.stringify({ requests: enriched }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "review_verification" && body.request_id && body.decision) {
      const decision = body.decision as string;
      if (!["approve", "reject"].includes(decision)) {
        return new Response(JSON.stringify({ error: "Invalid decision" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the request
      const { data: req } = await supabase
        .from("verification_requests")
        .select("id, user_id, status")
        .eq("id", body.request_id)
        .single();

      if (!req) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update request status
      await supabase.from("verification_requests").update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
      }).eq("id", body.request_id);

      // If approved, set is_verified on profile
      if (decision === "approve") {
        await supabase.from("profiles").update({ is_verified: true }).eq("id", req.user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "get_verification_screenshot_url" && body.path) {
      const { data } = await supabase.storage
        .from("verification-screenshots")
        .createSignedUrl(body.path, 300);
      return new Response(JSON.stringify({ url: data?.signedUrl || null }), {
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

      // Build per-user engagement (including anonymous)
      const userEngagementMap: Record<string, number> = {};
      let anonymousTotal = 0;

      for (const e of engagements || []) {
        if (e.user_id) {
          userEngagementMap[e.user_id] = (userEngagementMap[e.user_id] || 0) + 1;
        } else {
          anonymousTotal++;
        }
      }

      const users: any[] = (authUsers || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        display_name: profileMap[u.id]?.display_name || null,
        avatar_url: profileMap[u.id]?.avatar_url || u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
        role: roleMap[u.id] || "user",
        fit_checks: fitCountMap[u.id] || 0,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        provider: u.app_metadata?.provider || "email",
        engagement: { total: userEngagementMap[u.id] || 0 },
      }));

      // Add anonymous pseudo-user if there are anonymous engagements
      if (anonymousTotal > 0) {
        users.push({
          id: "__anonymous__",
          email: "—",
          display_name: "Anonymous",
          avatar_url: null,
          role: "user",
          fit_checks: 0,
          created_at: new Date().toISOString(),
          last_sign_in_at: null,
          provider: "anonymous",
          engagement: { total: anonymousTotal },
        });
      }

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
