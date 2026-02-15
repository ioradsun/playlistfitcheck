import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Resolves a SoundCloud URL to full track/playlist/user metadata
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("SOUNDCLOUD_CLIENT_ID");
    if (!clientId) throw new Error("SOUNDCLOUD_CLIENT_ID is not configured");
    const clientSecret = Deno.env.get("SOUNDCLOUD_CLIENT_SECRET");
    if (!clientSecret) throw new Error("SOUNDCLOUD_CLIENT_SECRET is not configured");

    // Get OAuth2 token
    const tokenResp = await fetch("https://secure.soundcloud.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("SoundCloud token error:", tokenResp.status, err);
      throw new Error("Failed to obtain SoundCloud access token");
    }
    const { access_token } = await tokenResp.json();
    const authHeader = { Authorization: `OAuth ${access_token}` };

    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!url.includes("soundcloud.com") && !url.includes("snd.sc")) {
      return new Response(JSON.stringify({ error: "Not a SoundCloud URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolveResp = await fetch(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url.trim())}`,
      { headers: authHeader }
    );

    if (!resolveResp.ok) {
      const errText = await resolveResp.text();
      console.error("SoundCloud resolve error:", resolveResp.status, errText);
      return new Response(
        JSON.stringify({ error: "Could not resolve SoundCloud URL" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const d = await resolveResp.json();

    let result: any = { kind: d.kind, platform: "soundcloud" };

    if (d.kind === "track") {
      result = {
        ...result,
        id: String(d.id),
        title: d.title,
        artist: d.user?.username || "Unknown",
        artistUrl: d.user?.permalink_url || null,
        image: d.artwork_url?.replace("-large", "-t500x500") || d.user?.avatar_url || null,
        url: d.permalink_url,
        duration: d.duration,
        playbackCount: d.playback_count || 0,
        likesCount: d.likes_count || 0,
        genre: d.genre || null,
        description: d.description || null,
        createdAt: d.created_at,
        waveformUrl: d.waveform_url || null,
      };
    } else if (d.kind === "playlist") {
      result = {
        ...result,
        id: String(d.id),
        title: d.title,
        owner: d.user?.username || "",
        ownerUrl: d.user?.permalink_url || null,
        trackCount: d.track_count || 0,
        image: d.artwork_url?.replace("-large", "-t500x500") || null,
        url: d.permalink_url,
        duration: d.duration || 0,
        likesCount: d.likes_count || 0,
        description: d.description || null,
        tracks: (d.tracks || []).slice(0, 50).map((t: any) => ({
          id: String(t.id),
          title: t.title,
          artist: t.user?.username || "Unknown",
          duration: t.duration,
          url: t.permalink_url,
          image: t.artwork_url?.replace("-large", "-t300x300") || null,
        })),
      };
    } else if (d.kind === "user") {
      result = {
        ...result,
        id: String(d.id),
        username: d.username,
        displayName: d.full_name || d.username,
        image: d.avatar_url?.replace("-large", "-t500x500") || null,
        url: d.permalink_url,
        followersCount: d.followers_count || 0,
        trackCount: d.track_count || 0,
        playlistCount: d.playlist_count || 0,
        genre: d.genre || null,
        description: d.description || null,
        city: d.city || null,
        country: d.country_code || null,
      };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SoundCloud resolve error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
