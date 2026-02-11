import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
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
  return data.access_token;
}

function extractPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
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

    const { playlistUrl } = await req.json();
    if (!playlistUrl) {
      return new Response(JSON.stringify({ error: "playlistUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      return new Response(JSON.stringify({ error: "Could not extract playlist ID from URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken(clientId, clientSecret);

    // Fetch playlist details
    const playlistResp = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,description,owner(display_name),followers(total),tracks(total)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!playlistResp.ok) {
      const errText = await playlistResp.text();
      console.error("Spotify API error:", playlistResp.status, errText);
      return new Response(
        JSON.stringify({ error: `Spotify API error [${playlistResp.status}]` }),
        { status: playlistResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const playlist = await playlistResp.json();

    const ownerName = playlist.owner?.display_name || "";
    const isSpotifyEditorial = ownerName.toLowerCase() === "spotify";
    const description = playlist.description || "";

    // Detect submission language
    const submissionKeywords = ["submit", "submissions", " dm ", "promo", "placements", "guaranteed"];
    const descLower = description.toLowerCase();
    const submissionLanguageDetected = submissionKeywords.some((k) => descLower.includes(k));

    const result = {
      playlistUrl,
      playlistId,
      playlistName: playlist.name || "",
      ownerName,
      playlistOwnerIsSpotifyEditorial: isSpotifyEditorial,
      description,
      followersTotal: playlist.followers?.total ?? undefined,
      tracksTotal: playlist.tracks?.total ?? undefined,
      // These require deeper analysis not available from basic API
      lastUpdatedDays: undefined,
      submissionLanguageDetected,
      churnRate30d: undefined,
      bottomDumpScore: undefined,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
