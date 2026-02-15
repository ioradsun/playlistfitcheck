import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spotify auth failed [${resp.status}]: ${text}`);
  }
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
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

    const { query, type } = await req.json();

    // Input validation
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (query.length > 200) {
      return new Response(JSON.stringify({ error: "query is too long (max 200 characters)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!type || typeof type !== "string" || !["playlist", "track", "artist"].includes(type)) {
      return new Response(JSON.stringify({ error: "type must be 'playlist', 'track', or 'artist'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken(clientId, clientSecret);
    const searchType = type;

    // Check if query looks like a Spotify ID (direct lookup)
    const isSpotifyId = /^[a-zA-Z0-9]{22}$/.test(query.trim());

    let results: any[] = [];

    if (isSpotifyId) {
      let endpoint = "";
      if (searchType === "artist") endpoint = `https://api.spotify.com/v1/artists/${query.trim()}`;
      else if (searchType === "playlist") endpoint = `https://api.spotify.com/v1/playlists/${query.trim()}?fields=id,name,images,owner,tracks.total,external_urls`;
      else if (searchType === "track") endpoint = `https://api.spotify.com/v1/tracks/${query.trim()}`;

      if (endpoint) {
        const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (resp.ok) {
          const d = await resp.json();
          if (searchType === "artist") {
            results = [{ id: d.id, name: d.name, image: d.images?.[0]?.url || null, url: d.external_urls?.spotify || `https://open.spotify.com/artist/${d.id}`, genres: (d.genres || []).slice(0, 5), followers: d.followers?.total || 0 }];
          } else if (searchType === "playlist") {
            results = [{ id: d.id, name: d.name, owner: d.owner?.display_name || "", tracks: d.tracks?.total || 0, image: d.images?.[0]?.url || null, url: d.external_urls?.spotify || `https://open.spotify.com/playlist/${d.id}` }];
          } else {
            results = [{ id: d.id, name: d.name, artists: d.artists?.map((a: any) => a.name).join(", ") || "Unknown", image: d.album?.images?.[2]?.url || d.album?.images?.[0]?.url || null, url: d.external_urls?.spotify || `https://open.spotify.com/track/${d.id}` }];
          }
        }
      }
    }

    if (results.length === 0) {
      const resp = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=8`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Spotify search error:", resp.status, errText);
        return new Response(
          JSON.stringify({ error: "Search failed. Please try again later." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await resp.json();

      if (searchType === "playlist") {
        results = (data.playlists?.items || []).filter((p: any) => p != null).map((p: any) => ({
          id: p.id,
          name: p.name,
          owner: p.owner?.display_name || "",
          tracks: p.tracks?.total || 0,
          image: p.images?.[0]?.url || null,
          url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
        }));
      } else if (searchType === "artist") {
        results = (data.artists?.items || []).filter((a: any) => a != null).map((a: any) => ({
          id: a.id,
          name: a.name,
          image: a.images?.[0]?.url || a.images?.[1]?.url || null,
          url: a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`,
          genres: (a.genres || []).slice(0, 5),
          followers: a.followers?.total || 0,
        }));
      } else {
        results = (data.tracks?.items || []).filter((t: any) => t != null).map((t: any) => ({
          id: t.id,
          name: t.name,
          artists: t.artists?.map((a: any) => a.name).join(", ") || "Unknown",
          image: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || null,
          url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
        }));
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Search error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
