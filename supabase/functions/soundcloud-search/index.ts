import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const clientId = Deno.env.get("SOUNDCLOUD_CLIENT_ID");
    if (!clientId) throw new Error("SOUNDCLOUD_CLIENT_ID is not configured");

    const { query, type } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (query.length > 200) {
      return new Response(JSON.stringify({ error: "query too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchType = type || "track";
    if (!["track", "playlist", "user"].includes(searchType)) {
      return new Response(JSON.stringify({ error: "type must be 'track', 'playlist', or 'user'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if query is a SoundCloud URL — resolve it
    const isSoundCloudUrl = query.includes("soundcloud.com") || query.includes("snd.sc");
    let results: any[] = [];

    if (isSoundCloudUrl) {
      const resolveResp = await fetch(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(query.trim())}&client_id=${clientId}`
      );
      if (resolveResp.ok) {
        const d = await resolveResp.json();
        if (d.kind === "track") {
          results = [{
            id: String(d.id),
            name: d.title,
            artists: d.user?.username || "Unknown",
            image: d.artwork_url?.replace("-large", "-t300x300") || d.user?.avatar_url || null,
            url: d.permalink_url,
            duration: d.duration,
            platform: "soundcloud",
          }];
        } else if (d.kind === "playlist") {
          results = [{
            id: String(d.id),
            name: d.title,
            owner: d.user?.username || "",
            tracks: d.track_count || 0,
            image: d.artwork_url?.replace("-large", "-t300x300") || null,
            url: d.permalink_url,
            platform: "soundcloud",
          }];
        } else if (d.kind === "user") {
          results = [{
            id: String(d.id),
            name: d.username,
            image: d.avatar_url?.replace("-large", "-t300x300") || null,
            url: d.permalink_url,
            followers: d.followers_count || 0,
            genres: d.genre ? [d.genre] : [],
            platform: "soundcloud",
          }];
        }
      } else {
        await resolveResp.text(); // consume body
      }
    }

    // Fallback to search if URL resolve didn't work or wasn't a URL
    if (results.length === 0) {
      let endpoint = "";
      if (searchType === "track") {
        endpoint = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`;
      } else if (searchType === "playlist") {
        endpoint = `https://api-v2.soundcloud.com/search/playlists?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`;
      } else if (searchType === "user") {
        endpoint = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=8`;
      }

      const resp = await fetch(endpoint);
      if (!resp.ok) {
        const errText = await resp.text();
        console.error("SoundCloud search error:", resp.status, errText);
        return new Response(
          JSON.stringify({ error: "Search failed. Please try again later." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await resp.json();
      const items = data.collection || [];

      if (searchType === "track") {
        results = items.map((t: any) => ({
          id: String(t.id),
          name: t.title,
          artists: t.user?.username || "Unknown",
          image: t.artwork_url?.replace("-large", "-t300x300") || t.user?.avatar_url || null,
          url: t.permalink_url,
          duration: t.duration,
          platform: "soundcloud",
        }));
      } else if (searchType === "playlist") {
        results = items.map((p: any) => ({
          id: String(p.id),
          name: p.title,
          owner: p.user?.username || "",
          tracks: p.track_count || 0,
          image: p.artwork_url?.replace("-large", "-t300x300") || null,
          url: p.permalink_url,
          platform: "soundcloud",
        }));
      } else {
        results = items.map((u: any) => ({
          id: String(u.id),
          name: u.username,
          image: u.avatar_url?.replace("-large", "-t300x300") || null,
          url: u.permalink_url,
          followers: u.followers_count || 0,
          genres: u.genre ? [u.genre] : [],
          platform: "soundcloud",
        }));
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SoundCloud search error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
