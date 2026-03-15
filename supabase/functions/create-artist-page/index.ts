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

async function scrapePreviewFromEmbed(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://open.spotify.com/embed/track/${trackId}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"audioPreview"\s*:\s*\{"url"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
    const fallback = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[a-zA-Z0-9]+/);
    return fallback?.[0] ?? null;
  } catch {
    return null;
  }
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

function buildWordBoost(plainLyrics: string | null): string[] {
  if (!plainLyrics) return [];

  return [...new Set(
    plainLyrics
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9']/g, ""))
      .filter((w) => w.length > 1)
      .slice(0, 200)
  )];
}

async function submitAssemblyAI(
  audioUrl: string,
  plainLyrics: string | null,
  apiKey: string
): Promise<string | null> {
  const wordBoost = buildWordBoost(plainLyrics);

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
  return typeof jobId === "string" ? jobId : null;
}

async function pollAssemblyAI(
  jobId: string,
  apiKey: string
): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(
      `https://api.assemblyai.com/v2/transcript/${jobId}`,
      { headers: { authorization: apiKey } }
    );

    if (!poll.ok) continue;
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
    const jobId = crypto.randomUUID();

    async function logStep(
      step: string,
      status: "running" | "done" | "error" | "skipped",
      detail: string | null,
      slug: string
    ) {
      const now = new Date().toISOString();

      if (status === "running") {
        await supabase.from("claim_page_jobs").insert({
          job_id: jobId,
          spotify_artist_slug: slug,
          step,
          status: "running",
          detail,
          started_at: now,
        });
        return;
      }

      const { data: updatedRows } = await supabase
        .from("claim_page_jobs")
        .update({
          status,
          detail,
          completed_at: now,
        })
        .eq("job_id", jobId)
        .eq("step", step)
        .eq("status", "running")
        .select("id")
        .limit(1);

      if (!updatedRows || updatedRows.length === 0) {
        await supabase.from("claim_page_jobs").insert({
          job_id: jobId,
          spotify_artist_slug: slug,
          step,
          status,
          detail,
          started_at: now,
          completed_at: now,
        });
      }
    }

    function fireAndForgetLog(
      step: string,
      status: "running" | "done" | "error" | "skipped",
      detail: string | null,
      slug: string
    ) {
      void logStep(step, status, detail, slug).then(() => {}).catch(() => {});
    }

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

    fireAndForgetLog("spotify_fetch", "running", null, `track:${trackId}`);
    const track = await fetchSpotifyTrack(trackId, token);

    const trackTitle = track.name;
    const artistName = track.artists[0].name;
    const albumArtUrl = track.album.images[0]?.url ?? null;
    let previewUrl: string | null = track.preview_url ?? null;
    const apiHadPreview = !!previewUrl;
    const trackUrl = track.external_urls.spotify;

    const slug = artistName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    // Backfill the spotify_fetch running row with the real slug
    void supabase
      .from("claim_page_jobs")
      .update({ spotify_artist_slug: slug })
      .eq("job_id", jobId)
      .eq("step", "spotify_fetch")
      .then(() => {}).catch(() => {});

    // If Spotify API didn't return a preview, try scraping the embed player
    if (!previewUrl) {
      fireAndForgetLog("spotify_fetch", "running", "preview_url null — trying embed scrape…", slug);
      previewUrl = await scrapePreviewFromEmbed(trackId);
    }

    fireAndForgetLog(
      "spotify_fetch",
      "done",
      `${artistName} — "${trackTitle}" | preview: ${previewUrl ? (apiHadPreview ? "api" : "embed") : "none"}`,
      slug
    );

    fireAndForgetLog("ghost_profile", "running", null, slug);
    fireAndForgetLog("lrclib_check", "running", null, slug);

    const [profileResult, lrclibResult] = await Promise.allSettled([
      upsertGhostProfile(slug, artistName, supabase),
      fetchLrclib(trackTitle, artistName),
    ]);

    if (profileResult.status === "fulfilled") {
      const p = profileResult.value;
      fireAndForgetLog(
        "ghost_profile",
        p.alreadyClaimed ? "skipped" : "done",
        p.alreadyClaimed
          ? "Already claimed"
          : p.isNew
            ? "New ghost profile created"
            : "Existing unclaimed profile found",
        slug
      );
    } else {
      fireAndForgetLog("ghost_profile", "error", profileResult.reason?.message ?? "Ghost profile failed", slug);
    }

    const lrclib = lrclibResult.status === "fulfilled"
      ? lrclibResult.value
      : { syncedLyrics: null, plainLyrics: null };

    if (lrclib.syncedLyrics) {
      fireAndForgetLog("lrclib_check", "done", "Hit — synced LRC found", slug);
      fireAndForgetLog("assemblyai_submit", "skipped", "lrclib hit — skipped", slug);
      fireAndForgetLog("assemblyai_poll", "skipped", "lrclib hit — skipped", slug);
    } else if (lrclib.plainLyrics) {
      fireAndForgetLog(
        "lrclib_check",
        "done",
        "Partial hit — plain lyrics only, falling back to AssemblyAI",
        slug
      );
    } else {
      fireAndForgetLog("lrclib_check", "done", "Miss — no lyrics found", slug);
    }

    const profile = profileResult.status === "fulfilled"
      ? profileResult.value
      : null;
    if (!profile) {
      fireAndForgetLog("complete", "error", "Failed to create profile", slug);
      return new Response(JSON.stringify({ error: "Failed to create profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.alreadyClaimed) {
      fireAndForgetLog("complete", "done", `/artist/${slug}/claim-page`, slug);
      return new Response(JSON.stringify({ slug, alreadyClaimed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let syncedLrc: string | null = lrclib.syncedLyrics;
    const plainLyrics: string | null = lrclib.plainLyrics;
    let lyricsSource = lrclib.syncedLyrics ? "lrclib" : "none";

    if (!lrclib.syncedLyrics && previewUrl && assemblyKey) {
      fireAndForgetLog("assemblyai_submit", "running", `Submitting preview: ${previewUrl.slice(0, 60)}…`, slug);
      const jobIdAi = await submitAssemblyAI(previewUrl, lrclib.plainLyrics, assemblyKey);

      if (jobIdAi) {
        fireAndForgetLog("assemblyai_submit", "done", `Job ID: ${jobIdAi}`, slug);
        fireAndForgetLog("assemblyai_poll", "running", "Waiting for transcript…", slug);

        const result = await pollAssemblyAI(jobIdAi, assemblyKey);
        if (result) {
          syncedLrc = result;
          lyricsSource = "assemblyai";
          const lineCount = result.split("\n").length;
          fireAndForgetLog("assemblyai_poll", "done", `Transcript complete — ${lineCount} lyric lines`, slug);
        } else {
          fireAndForgetLog("assemblyai_poll", "error", "Transcript failed or timed out", slug);
        }
      } else {
        fireAndForgetLog("assemblyai_submit", "error", "Failed to submit job", slug);
        fireAndForgetLog("assemblyai_poll", "skipped", "Submit failed", slug);
      }
    } else if (!lrclib.syncedLyrics && !previewUrl) {
      fireAndForgetLog("assemblyai_submit", "skipped", "No preview_url available", slug);
      fireAndForgetLog("assemblyai_poll", "skipped", "No preview_url available", slug);
    } else if (!lrclib.syncedLyrics && !assemblyKey) {
      fireAndForgetLog("assemblyai_submit", "skipped", "ASSEMBLY_AI_KEY missing", slug);
      fireAndForgetLog("assemblyai_poll", "skipped", "ASSEMBLY_AI_KEY missing", slug);
    }

    fireAndForgetLog("lyric_video_save", "running", null, slug);
    try {
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

      fireAndForgetLog(
        "lyric_video_save",
        "done",
        `Source: ${lyricsSource} | lyrics: ${syncedLrc ? "yes" : "none"}`,
        slug
      );
    } catch (e: any) {
      fireAndForgetLog("lyric_video_save", "error", e?.message ?? "Failed to save lyric video", slug);
    }

    fireAndForgetLog("complete", "done", `/artist/${slug}/claim-page`, slug);

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
