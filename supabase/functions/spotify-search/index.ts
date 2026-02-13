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
    if (!type || typeof type !== "string" || !["playlist", "track"].includes(type)) {
      return new Response(JSON.stringify({ error: "type must be 'playlist' or 'track'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken(clientId, clientSecret);

    const searchType = type === "playlist" ? "playlist" : "track";
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

    let results: any[] = [];

    if (searchType === "playlist") {
      results = (data.playlists?.items || []).filter((p: any) => p != null).map((p: any) => ({
        id: p.id,
        name: p.name,
        owner: p.owner?.display_name || "",
        tracks: p.tracks?.total || 0,
        image: p.images?.[0]?.url || null,
        url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
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
