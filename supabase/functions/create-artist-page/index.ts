import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

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

async function fetchSpotifyTrack(trackId: string, token: string) {
  const resp = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error("Failed to fetch Spotify track");
  }
  return await resp.json();
}

async function fetchLrclib(
  trackTitle: string,
  artistName: string
): Promise<{ syncedLyrics: string | null; plainLyrics: string | null }> {
  try {
    const params = new URLSearchParams({
      track_name: trackTitle,
      artist_name: artistName,
    });
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { syncedLyrics: null, plainLyrics: null };
    const data = await res.json();
    return {
      syncedLyrics: data.syncedLyrics ?? null,
      plainLyrics: data.plainLyrics ?? null,
    };
  } catch {
    return { syncedLyrics: null, plainLyrics: null };
  }
}

async function upsertGhostProfile(
  slug: string,
  artistName: string,
  supabase: any
): Promise<{ userId: string; isNew: boolean; alreadyClaimed: boolean }> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, is_claimed, claim_token")
    .eq("spotify_artist_slug", slug)
    .maybeSingle();

  if (existing) {
    if (existing.is_claimed) {
      return { userId: existing.id, isNew: false, alreadyClaimed: true };
    }
    return { userId: existing.id, isNew: false, alreadyClaimed: false };
  }

  const newId = crypto.randomUUID();
  await supabase.from("profiles").insert({
    id: newId,
    display_name: artistName,
    spotify_artist_slug: slug,
    is_claimed: false,
    claim_token: crypto.randomUUID(),
  });
  await supabase.from("artist_pages").upsert({ user_id: newId }, { onConflict: "user_id" });

  return { userId: newId, isNew: true, alreadyClaimed: false };
}

async function runAssemblyAI(
  audioUrl: string,
  plainLyrics: string | null,
  apiKey: string
): Promise<string | null> {
  const wordBoost = plainLyrics
    ? [...new Set(
        plainLyrics
          .split(/\s+/)
          .map((w) => w.replace(/[^a-zA-Z0-9']/g, ""))
          .filter((w) => w.length > 1)
          .slice(0, 200)
      )]
    : [];

  const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      ...(wordBoost.length > 0 && {
        word_boost: wordBoost,
        boost_param: "high",
      }),
      punctuate: false,
      format_text: false,
    }),
  });

  if (!submitRes.ok) return null;
  const { id: jobId } = await submitRes.json();

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(
      `https://api.assemblyai.com/v2/transcript/${jobId}`,
      { headers: { authorization: apiKey } }
    );
    const data = await poll.json();

    if (data.status === "error") return null;
    if (data.status !== "completed") continue;

    if (!data.words?.length) return null;

    const WORDS_PER_LINE = 6;
    const lines: string[] = [];
    for (let w = 0; w < data.words.length; w += WORDS_PER_LINE) {
      const chunk = data.words.slice(w, w + WORDS_PER_LINE);
      const startSec = chunk[0].start / 1000;
      const mins = Math.floor(startSec / 60).toString().padStart(2, "0");
      const secs = (startSec % 60).toFixed(2).padStart(5, "0");
      lines.push(`[${mins}:${secs}]${chunk.map((x: any) => x.text).join(" ")}`);
    }
    return lines.join("\n");
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not configured");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!clientSecret) throw new Error("SPOTIFY_CLIENT_SECRET is not configured");
    const assemblyKey = Deno.env.get("ASSEMBLY_AI_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase service role is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { spotifyUrl } = await req.json();

    const match = spotifyUrl.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid Spotify track URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trackId = match[1];

    const token = await getSpotifyToken(clientId, clientSecret);
    const spotifyPromise = fetchSpotifyTrack(trackId, token);
    const track = await spotifyPromise;

    const trackTitle = track.name;
    const artistName = track.artists[0].name;
    const albumArtUrl = track.album.images[0]?.url ?? null;
    const previewUrl = track.preview_url ?? null;
    const trackUrl = track.external_urls.spotify;

    const slug = artistName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const [lrclibResult, profileResult] = await Promise.allSettled([
      fetchLrclib(trackTitle, artistName),
      upsertGhostProfile(slug, artistName, supabase),
    ]);

    const lrclib = lrclibResult.status === "fulfilled"
      ? lrclibResult.value
      : { syncedLyrics: null, plainLyrics: null };

    let syncedLrc: string | null = null;
    let plainLyrics: string | null = lrclib.plainLyrics;
    let lyricsSource = "none";

    if (lrclib.syncedLyrics) {
      syncedLrc = lrclib.syncedLyrics;
      lyricsSource = "lrclib";
    } else if (previewUrl && assemblyKey) {
      syncedLrc = await runAssemblyAI(previewUrl, plainLyrics, assemblyKey);
      if (syncedLrc) lyricsSource = "assemblyai";
    }

    const profile = profileResult.status === "fulfilled"
      ? profileResult.value
      : null;
    if (!profile) {
      return new Response(JSON.stringify({ error: "Failed to create profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.alreadyClaimed) {
      return new Response(JSON.stringify({ slug, alreadyClaimed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("artist_lyric_videos").insert({
      user_id: profile.userId,
      spotify_track_id: trackId,
      track_title: trackTitle,
      artist_name: artistName,
      album_art_url: albumArtUrl,
      spotify_track_url: trackUrl,
      preview_url: previewUrl,
      synced_lyrics_lrc: syncedLrc,
      plain_lyrics: plainLyrics,
      lyrics_source: lyricsSource,
    });

    return new Response(JSON.stringify({
      slug,
      userId: profile.userId,
      trackTitle,
      artistName,
      albumArtUrl,
      previewUrl,
      lyricsFound: !!syncedLrc,
      lyricsSource,
      alreadyClaimed: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-artist-page error", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
