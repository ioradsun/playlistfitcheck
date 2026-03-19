import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Spotify token cache ──────────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`Spotify auth failed [${resp.status}]`);
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

// ── Fetch Spotify track metadata ─────────────────────────────────────────────
async function fetchSpotifyTrack(trackId: string, token: string) {
  const resp = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Spotify track fetch failed [${resp.status}]`);
  return resp.json();
}

// ── Fetch Spotify audio features (BPM, duration) ─────────────────────────────
async function fetchSpotifyAudioFeatures(
  trackId: string,
  token: string,
): Promise<{ tempo: number; durationMs: number } | null> {
  try {
    const resp = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      tempo: typeof data.tempo === "number" ? data.tempo : 0,
      durationMs: typeof data.duration_ms === "number" ? data.duration_ms : 0,
    };
  } catch {
    return null;
  }
}

// ── Generate synthetic beat grid from BPM ─────────────────────────────────────
function buildBeatGrid(
  bpm: number,
  durationSec: number,
): { bpm: number; beats: number[]; confidence: number } {
  if (bpm <= 0 || durationSec <= 0) {
    return { bpm: 120, beats: [], confidence: 0 };
  }
  const period = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < durationSec; t += period) {
    beats.push(Math.round(t * 1000) / 1000);
  }
  return { bpm: Math.round(bpm), beats, confidence: 0.7 };
}

// ── Scrape preview URL from embed page ───────────────────────────────────────
async function scrapePreviewFromEmbed(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });
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

// ── lrclib ───────────────────────────────────────────────────────────────────
async function fetchLrclib(
  trackTitle: string,
  artistName: string
): Promise<{ syncedLyrics: string | null; plainLyrics: string | null }> {
  try {
    const params = new URLSearchParams({ track_name: trackTitle, artist_name: artistName });
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { syncedLyrics: null, plainLyrics: null };
    const data = await res.json();
    return { syncedLyrics: data.syncedLyrics ?? null, plainLyrics: data.plainLyrics ?? null };
  } catch {
    return { syncedLyrics: null, plainLyrics: null };
  }
}

// ── Ghost profile upsert (ghost_artist_profiles, no auth FK) ─────────────────
async function upsertGhostProfile(
  slug: string,
  artistName: string,
  supabase: any
): Promise<{ profileId: string; isNew: boolean; alreadyClaimed: boolean; error?: string }> {
  const { data: existing } = await supabase
    .from("ghost_artist_profiles")
    .select("id, is_claimed")
    .eq("spotify_artist_slug", slug)
    .maybeSingle();

  if (existing) {
    if (existing.is_claimed) return { profileId: existing.id, isNew: false, alreadyClaimed: true };
    return { profileId: existing.id, isNew: false, alreadyClaimed: false };
  }

  const { data: newProfile, error: insertErr } = await supabase
    .from("ghost_artist_profiles")
    .insert({ display_name: artistName, spotify_artist_slug: slug })
    .select("id")
    .single();

  if (insertErr) return { profileId: "", isNew: false, alreadyClaimed: false, error: insertErr.message };
  return { profileId: newProfile.id, isNew: true, alreadyClaimed: false };
}

// ── AssemblyAI ────────────────────────────────────────────────────────────────
function buildWordBoost(plainLyrics: string | null): string[] {
  if (!plainLyrics) return [];
  return [...new Set(
    plainLyrics.split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9']/g, ""))
      .filter(w => w.length > 1)
      .slice(0, 200)
  )];
}

async function submitAssemblyAI(
  audioUrl: string,
  plainLyrics: string | null,
  apiKey: string
): Promise<{ jobId: string | null; error: string | null }> {
  const wordBoost = buildWordBoost(plainLyrics);
  const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ["universal-2"],
      ...(wordBoost.length > 0 && { word_boost: wordBoost, boost_param: "high" }),
      punctuate: false,
      format_text: false,
    }),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => `HTTP ${submitRes.status}`);
    return { jobId: null, error: `HTTP ${submitRes.status}: ${errText.slice(0, 200)}` };
  }
  const data = await submitRes.json();
  const jobId = typeof data.id === "string" ? data.id : null;
  if (!jobId) return { jobId: null, error: `No job ID: ${JSON.stringify(data).slice(0, 100)}` };
  return { jobId, error: null };
}

async function pollAssemblyAI(
  jobId: string,
  apiKey: string
): Promise<{ lrc: string; words: Array<{ word: string; start: number; end: number }> } | null> {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
      headers: { authorization: apiKey },
    });
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

    const words = data.words.map((w: any) => ({
      word: w.text,
      start: Math.round(w.start) / 1000,
      end: Math.round(w.end) / 1000,
    }));

    return { lrc: lines.join("\n"), words };
  }
  return null;
}

// ── LRC → LyricDancePlayer lyrics JSON ───────────────────────────────────────
function lrcToLyricsJson(
  lrc: string
): Array<{ start: number; end: number; text: string; tag: string }> {
  const parsed = lrc.split("\n").flatMap(line => {
    const matches = [...line.matchAll(/\[(\d{2}):(\d{2}\.\d{2,3})\]/g)];
    const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "").trim();
    if (!text || !matches.length) return [];
    return matches.map(m => ({
      time: parseInt(m[1]) * 60 + parseFloat(m[2]),
      text,
    }));
  }).sort((a, b) => a.time - b.time);

  return parsed.map((line, i) => ({
    start: line.time,
    end: parsed[i + 1]?.time ?? line.time + 3,
    text: line.text,
    tag: "main" as const,
  }));
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Env vars ──
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    if (!clientId) throw new Error("SPOTIFY_CLIENT_ID not configured");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!clientSecret) throw new Error("SPOTIFY_CLIENT_SECRET not configured");
    const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminUserId = Deno.env.get("ADMIN_USER_ID");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase service role not configured");
    if (!adminUserId) throw new Error("ADMIN_USER_ID not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const jobId = crypto.randomUUID();

    // ── Step logger (always awaited — no fire-and-forget) ──
    async function logStep(
      step: string,
      status: "running" | "done" | "error" | "skipped",
      detail: string | null,
      slug: string
    ) {
      const now = new Date().toISOString();
      try {
        if (status === "running") {
          await supabase.from("claim_page_jobs").insert({
            job_id: jobId, spotify_artist_slug: slug,
            step, status: "running", detail, started_at: now,
          });
          return;
        }
        const { data: updated } = await supabase
          .from("claim_page_jobs")
          .update({ status, detail, completed_at: now })
          .eq("job_id", jobId).eq("step", step).eq("status", "running")
          .select("id").limit(1);
        if (!updated?.length) {
          await supabase.from("claim_page_jobs").insert({
            job_id: jobId, spotify_artist_slug: slug,
            step, status, detail, started_at: now, completed_at: now,
          });
        }
      } catch { /* log failures are non-fatal */ }
    }

    // ── Parse request ──
    const { spotifyUrl } = await req.json();
    const match = spotifyUrl?.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid Spotify track URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trackId = match[1];

    // ── STEP 1: Spotify fetch ──
    await logStep("spotify_fetch", "running", null, trackId);
    const token = await getSpotifyToken(clientId, clientSecret);
    const [track, audioFeatures] = await Promise.all([
      fetchSpotifyTrack(trackId, token),
      fetchSpotifyAudioFeatures(trackId, token),
    ]);

    const trackTitle = track.name;
    const artistName = track.artists[0].name;
    const albumArtUrl = track.album.images[0]?.url ?? null;
    const trackUrl = track.external_urls.spotify;
    let previewUrl: string | null = track.preview_url ?? null;

    if (!previewUrl) previewUrl = await scrapePreviewFromEmbed(trackId);

    const previewDurationSec = 30;
    const beatGrid = buildBeatGrid(
      audioFeatures?.tempo ?? 0,
      previewDurationSec,
    );

    const slug = artistName.toLowerCase()
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    await logStep("spotify_fetch", "done",
      `${artistName} — "${trackTitle}" | preview: ${previewUrl ? (track.preview_url ? "api" : "embed") : "none"} | ${beatGrid.bpm}bpm`,
      slug);

    // ── STEP 2: Ghost profile + lrclib IN PARALLEL ──
    await logStep("ghost_profile", "running", null, slug);
    await logStep("lrclib_check", "running", null, slug);

    const [profileResult, lrclibResult] = await Promise.allSettled([
      upsertGhostProfile(slug, artistName, supabase),
      fetchLrclib(trackTitle, artistName),
    ]);

    if (profileResult.status === "fulfilled") {
      const p = profileResult.value;
      if (p.error) {
        await logStep("ghost_profile", "error", p.error, slug);
      } else {
        await logStep("ghost_profile",
          p.alreadyClaimed ? "skipped" : "done",
          p.alreadyClaimed ? "Already claimed"
            : p.isNew ? `New profile created — id: ${p.profileId}`
              : `Existing profile found — id: ${p.profileId}`,
          slug);
      }
    } else {
      await logStep("ghost_profile", "error", profileResult.reason?.message ?? "Failed", slug);
    }

    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    if (!profile || profile.error) {
      await logStep("complete", "error", "Profile creation failed", slug);
      return new Response(JSON.stringify({ error: "Failed to create profile" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (profile.alreadyClaimed) {
      await logStep("lrclib_check", "skipped", "Already claimed", slug);
      await logStep("complete", "done", `/artist/${slug}/claim-page`, slug);
      return new Response(JSON.stringify({ slug, alreadyClaimed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lrclib = lrclibResult.status === "fulfilled"
      ? lrclibResult.value
      : { syncedLyrics: null, plainLyrics: null };

    if (lrclib.syncedLyrics) {
      await logStep("lrclib_check", "done", "Hit — synced LRC found", slug);
      await logStep("assemblyai_submit", "skipped", "lrclib hit — skipped", slug);
      await logStep("assemblyai_poll", "skipped", "lrclib hit — skipped", slug);
    } else if (lrclib.plainLyrics) {
      await logStep("lrclib_check", "done", "Partial — plain lyrics only, using AssemblyAI for timing", slug);
    } else {
      await logStep("lrclib_check", "done", "Miss — no lyrics found", slug);
    }

    // ── STEP 3: AssemblyAI (only if no synced lyrics) ──
    let syncedLrc: string | null = lrclib.syncedLyrics;
    const plainLyrics: string | null = lrclib.plainLyrics;
    let lyricsSource = lrclib.syncedLyrics ? "lrclib" : "none";
    let transcriptWords: Array<{ word: string; start: number; end: number }> = [];

    if (!lrclib.syncedLyrics) {
      if (!previewUrl) {
        await logStep("assemblyai_submit", "skipped", "No preview URL available", slug);
        await logStep("assemblyai_poll", "skipped", "No preview URL available", slug);
      } else if (!assemblyKey) {
        await logStep("assemblyai_submit", "skipped", "ASSEMBLYAI_API_KEY missing", slug);
        await logStep("assemblyai_poll", "skipped", "ASSEMBLYAI_API_KEY missing", slug);
      } else {
        await logStep("assemblyai_submit", "running",
          `Submitting: ${previewUrl.slice(0, 60)}…`, slug);
        const { jobId: aiJobId, error: submitError } = await submitAssemblyAI(
          previewUrl, plainLyrics, assemblyKey
        );
        if (!aiJobId) {
          await logStep("assemblyai_submit", "error", submitError ?? "Submit failed", slug);
          await logStep("assemblyai_poll", "skipped", "Submit failed", slug);
        } else {
          await logStep("assemblyai_submit", "done", `Job ID: ${aiJobId}`, slug);
          await logStep("assemblyai_poll", "running", "Waiting for transcript…", slug);
          const pollResult = await pollAssemblyAI(aiJobId, assemblyKey);
          if (pollResult) {
            syncedLrc = pollResult.lrc;
            transcriptWords = pollResult.words;
            lyricsSource = "assemblyai";
            await logStep("assemblyai_poll", "done",
              `Transcript complete — ${pollResult.lrc.split("\n").length} lines, ${pollResult.words.length} words`,
              slug);
          } else {
            await logStep("assemblyai_poll", "error", "Transcript failed or timed out", slug);
          }
        }
      }
    }

    // ── STEP 4: Save lyric video row ──
    await logStep("lyric_video_save", "running", null, slug);
    const { error: insertError } = await supabase.from("artist_lyric_videos").insert({
      ghost_profile_id: profile.profileId,
      user_id: adminUserId,
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
    if (insertError) {
      await logStep("lyric_video_save", "error", insertError.message, slug);
    } else {
      await logStep("lyric_video_save", "done",
        `Source: ${lyricsSource} | lyrics: ${syncedLrc ? "yes" : "none"}`, slug);
    }

    // ── STEP 5: Generate LyricDance ──────────────────────────────────────────
    if (syncedLrc && previewUrl) {

      // 5a: Fetch MP3 + upload to storage
      await logStep("lyric_dance_mp3", "running", "Fetching preview MP3…", slug);
      let audioStorageUrl: string | null = null;
      try {
        const mp3Res = await fetch(previewUrl, { signal: AbortSignal.timeout(15000) });
        if (!mp3Res.ok) throw new Error(`MP3 fetch ${mp3Res.status}`);
        const mp3Bytes = new Uint8Array(await mp3Res.arrayBuffer());

        const storagePath = `ghost/${slug}/${trackId}/preview.mp3`;
        const { error: uploadErr } = await supabase.storage
          .from("audio-clips")
          .upload(storagePath, mp3Bytes, { upsert: true, contentType: "audio/mpeg" });
        if (uploadErr) throw new Error(`Upload: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage
          .from("audio-clips").getPublicUrl(storagePath);
        audioStorageUrl = urlData.publicUrl;
        await logStep("lyric_dance_mp3", "done",
          `Stored: ghost/${slug}/${trackId}/preview.mp3`, slug);
      } catch (e: any) {
        await logStep("lyric_dance_mp3", "error", e.message ?? "MP3 fetch/upload failed", slug);
      }

      // 5b: Cinematic direction (with retry)
      let cinematicDirection: any = null;
      await logStep("lyric_dance_cinematic", "running", "Generating cinematic direction…", slug);
      const lyrics = lrcToLyricsJson(syncedLrc);
      const cdBody = JSON.stringify({
        title: trackTitle,
        artist: artistName,
        lines: lyrics,
        lyrics: lyrics.map((l: any) => l.text).join("\n"),
        mode: "scene",
      });
      const cdHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      };

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const cdRes = await fetch(`${supabaseUrl}/functions/v1/cinematic-direction`, {
            method: "POST",
            headers: cdHeaders,
            body: cdBody,
            signal: AbortSignal.timeout(45000),
          });
          if (cdRes.ok) {
            const cdData = await cdRes.json();
            cinematicDirection = cdData.cinematicDirection ?? null;
            await logStep("lyric_dance_cinematic", "done",
              `Theme: ${cinematicDirection?.defaults?.scene_tone ?? "generated"}${attempt > 1 ? ` (attempt ${attempt})` : ""}`, slug);
            break;
          } else {
            const errText = await cdRes.text().catch(() => "");
            const errMsg = `HTTP ${cdRes.status}: ${errText.slice(0, 120)}`;
            if (attempt < 3 && (cdRes.status === 429 || cdRes.status >= 500)) {
              // Retryable error — wait and try again
              const delay = attempt === 1 ? 3000 : 8000;
              await logStep("lyric_dance_cinematic", "running",
                `Attempt ${attempt} failed (${cdRes.status}), retrying in ${delay / 1000}s…`, slug);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            // Non-retryable or final attempt
            await logStep("lyric_dance_cinematic", "error", errMsg, slug);
            break;
          }
        } catch (e: any) {
          const errMsg = e.name === "TimeoutError"
            ? `Timeout after 45s (attempt ${attempt})`
            : (e.message ?? "Cinematic direction failed");
          if (attempt < 3) {
            await logStep("lyric_dance_cinematic", "running",
              `Attempt ${attempt} failed: ${errMsg}, retrying…`, slug);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          await logStep("lyric_dance_cinematic", "error", errMsg, slug);
          break;
        }
      }

      // 5c: Upsert shareable_lyric_dances
      if (audioStorageUrl) {
        await logStep("lyric_dance_save", "running", "Writing LyricDance row…", slug);
        try {
          const lyrics = lrcToLyricsJson(syncedLrc);
          const songSlug = trackTitle.toLowerCase()
            .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);

          const { error: danceErr } = await supabase
            .from("shareable_lyric_dances")
            .upsert({
              user_id: adminUserId,
              artist_slug: slug,
              song_slug: songSlug,
              artist_name: artistName,
              song_name: trackTitle,
              audio_url: audioStorageUrl,
              lyrics,
              words: transcriptWords.length > 0 ? transcriptWords : null,
              cinematic_direction: cinematicDirection,
              beat_grid: beatGrid,
              palette: cinematicDirection?.defaults?.palette ??
                ["#ffffff", "#a855f7", "#ec4899"],
              section_images: null,
              auto_palettes: null,
              album_art_url: albumArtUrl,
            }, { onConflict: "artist_slug,song_slug" });

          if (danceErr) throw new Error(danceErr.message);

          const { data: danceRow } = await supabase
            .from("shareable_lyric_dances")
            .select("id")
            .eq("artist_slug", slug)
            .eq("song_slug", songSlug)
            .maybeSingle();

          const lyricDanceUrl = `/${slug}/${songSlug}/lyric-dance`;

          await supabase.from("artist_lyric_videos")
            .update({
              lyric_dance_url: lyricDanceUrl,
              lyric_dance_id: danceRow?.id ?? null,
            })
            .eq("ghost_profile_id", profile.profileId)
            .eq("spotify_track_id", trackId);

          await logStep("lyric_dance_save", "done", `Live at ${lyricDanceUrl}`, slug);

          // Trigger section image generation — await with timeout
          if (danceRow?.id) {
            await logStep("section_images", "running", "Generating section images…", slug);
            try {
              const imgRes = await fetch(`${supabaseUrl}/functions/v1/generate-section-images`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                },
                body: JSON.stringify({ lyric_dance_id: danceRow.id }),
                signal: AbortSignal.timeout(120_000),
              });
              if (imgRes.ok) {
                const imgData = await imgRes.json();
                const count = imgData.generated ?? 0;
                await logStep("section_images", "done", `${count} images generated`, slug);
              } else {
                const errText = await imgRes.text().catch(() => String(imgRes.status));
                await logStep("section_images", "error", `HTTP ${imgRes.status}: ${errText.slice(0, 100)}`, slug);
              }
            } catch (e: any) {
              const msg = e.name === "TimeoutError" ? "Timed out after 120s" : (e.message ?? "Image gen failed");
              await logStep("section_images", "error", msg, slug);
            }
          }
        } catch (e: any) {
          await logStep("lyric_dance_save", "error", e.message ?? "Dance save failed", slug);
        }
      } else {
        await logStep("lyric_dance_save", "skipped", "No audio URL — MP3 step failed", slug);
      }
    } else {
      await logStep("lyric_dance_mp3", "skipped",
        syncedLrc ? "No preview URL" : "No lyrics", slug);
      await logStep("lyric_dance_cinematic", "skipped", "No lyrics or preview", slug);
      await logStep("lyric_dance_save", "skipped", "No lyrics or preview", slug);
    }

    // ── COMPLETE ──
    await logStep("complete", "done", `/artist/${slug}/claim-page`, slug);

    return new Response(JSON.stringify({
      slug,
      profileId: profile.profileId,
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
    console.error("create-artist-page error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
