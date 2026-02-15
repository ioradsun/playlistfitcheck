import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID")!;
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`Spotify auth failed: ${resp.status}`);
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

async function spotifyGet(path: string, token: string) {
  const resp = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spotify API ${path} failed [${resp.status}]: ${text}`);
  }
  return resp.json();
}

function parseArtistId(input: string): string {
  // Accept full URL or raw ID
  const match = input.match(/artist[/:]([a-zA-Z0-9]{22})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  throw new Error("Invalid Spotify artist URL or ID");
}

function computeSignals(artist: any, topTracks: any[], relatedArtists: any[], releases: any[]) {
  const trackPops = topTracks.map((t: any) => t.popularity || 0);
  const avg = trackPops.length ? trackPops.reduce((a: number, b: number) => a + b, 0) / trackPops.length : 0;
  const max = trackPops.length ? Math.max(...trackPops) : 0;

  const relatedPops = relatedArtists.map((a: any) => a.popularity || 0);
  const relatedAvg = relatedPops.length ? relatedPops.reduce((a: number, b: number) => a + b, 0) / relatedPops.length : 0;

  // Release cadence
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const recentReleases = releases.filter((r: any) => new Date(r.release_date) >= oneYearAgo);

  let cadenceDaysAvg: number | null = null;
  if (releases.length >= 2) {
    const dates = releases.map((r: any) => new Date(r.release_date).getTime()).sort((a: number, b: number) => b - a);
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(dates.length - 1, 10); i++) {
      gaps.push((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
    }
    cadenceDaysAvg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  }

  // Market breadth proxy from top tracks
  const allMarkets = new Set<string>();
  topTracks.forEach((t: any) => {
    (t.available_markets || []).forEach((m: string) => allMarkets.add(m));
  });

  return {
    followers_total: artist.followers?.total || 0,
    artist_popularity: artist.popularity || 0,
    top_tracks_popularity_avg: Math.round(avg),
    top_tracks_popularity_max: max,
    top_tracks_popularity_skew: max - Math.round(avg),
    related_artists_count: relatedArtists.length,
    related_artists_popularity_avg: Math.round(relatedAvg),
    release_count_recent: recentReleases.length,
    release_cadence_days_avg: cadenceDaysAvg,
    market_breadth_proxy: allMarkets.size,
    catalog_depth_proxy: Math.min(releases.length, 50),
  };
}

function classifyTier(signals: any) {
  const { followers_total, artist_popularity, top_tracks_popularity_avg } = signals;

  let followerTier = 1;
  if (followers_total > 150000) followerTier = 4;
  else if (followers_total > 25000) followerTier = 3;
  else if (followers_total > 5000) followerTier = 2;

  let popTier = 1;
  if (artist_popularity >= 66) popTier = 4;
  else if (artist_popularity >= 46) popTier = 3;
  else if (artist_popularity >= 26) popTier = 2;

  if (followerTier !== popTier) {
    const higher = Math.max(followerTier, popTier);
    const lower = Math.min(followerTier, popTier);
    // Pick higher only if track avg supports it
    const trackThreshold = [0, 15, 30, 45, 55][higher];
    return top_tracks_popularity_avg >= trackThreshold ? higher : lower;
  }
  return followerTier;
}

const tierNames: Record<number, string> = {
  1: "Foundation",
  2: "Growth",
  3: "Expansion",
  4: "Leverage",
};

const DEFAULT_BLUEPRINT_PROMPT = `You are ProFit, a revenue strategist for independent artists. You must be analytical, tier-aware, and data-justified. Your job is not to brainstorm. Your job is to prioritize and prescribe. Use only the provided Spotify data and computed signals. If a datapoint is missing, do not invent it; say it is unavailable and proceed.

Rules:
- Output MUST be valid JSON matching the Blueprint schema exactly.
- Be concise and structured.
- Every "why" must reference at least one signal (followers, popularity, top track stats, release cadence, related artists, market breadth proxy, genres).
- Avoid generic advice. No clichés. No motivational fluff.
- No invented numbers or revenue claims. Use qualitative ranges: "Likely", "Possible", "Unlikely", "Low/Medium/High lift", "Near-term vs longer-term".
- Provide tier-aware "what to ignore" guidance.
- Include a 2-week checklist with concrete tasks.
- Use genre-aware playbook weights: Hip-hop (services, features, collabs), EDM (live, DJ sets, sample packs), Indie (live, merch, Patreon, sync), Singer-songwriter (live, teaching, custom songs), Metal/Rock (merch, live, community), Producer (services, sample packs, licensing).

Blueprint JSON schema:
{
  "artistSnapshot": { "positioning": string, "bottleneck": string, "bestLane": string },
  "signalsUsed": [{ "label": string, "value": string }],
  "tier": { "name": string, "reason": string },
  "scorecard": [{ "pillar": "Streaming"|"Live"|"Services"|"Digital"|"BrandLicensing", "score": number(1-10), "why": string }],
  "topMoves": [{ "rank": 1|2|3, "title": string, "whyFits": string[], "steps": string[], "timeCost": "Low"|"Medium"|"High", "outcome": string, "measurement": string[] }],
  "ignoreNow": string[],
  "roadmap90": { "month1": string[], "month2": string[], "month3": string[] },
  "weeklyChecklist": { "week1": string[], "week2": string[] },
  "singleROIFocus": { "focus": string, "why": string }
}`;

async function fetchPrompt(slug: string, fallback: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data } = await sb.from("ai_prompts").select("prompt").eq("slug", slug).single();
    return data?.prompt || fallback;
  } catch { return fallback; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { artistUrl } = await req.json();
    if (!artistUrl) throw new Error("artistUrl is required");

    const artistId = parseArtistId(artistUrl);
    const token = await getSpotifyToken();

    // Fetch Spotify data in parallel (related-artists may 404 in Dev Mode)
    const [artist, topTracksData, albumsData] = await Promise.all([
      spotifyGet(`/artists/${artistId}`, token),
      spotifyGet(`/artists/${artistId}/top-tracks?market=US`, token),
      spotifyGet(`/artists/${artistId}/albums?include_groups=album,single&limit=50`, token),
    ]);

    let relatedData: any = { artists: [] };
    try {
      relatedData = await spotifyGet(`/artists/${artistId}/related-artists`, token);
    } catch (e) {
      console.warn("Related artists unavailable (likely Dev Mode):", (e as Error).message);
    }

    const topTracks = topTracksData.tracks || [];
    const relatedArtists = (relatedData.artists || []).slice(0, 20);
    const releases = (albumsData.items || []);

    const signals = computeSignals(artist, topTracks, relatedArtists, releases);
    const tierNum = classifyTier(signals);
    const tierName = tierNames[tierNum];

    const artistData = {
      spotify_artist_id: artistId,
      name: artist.name,
      image_url: artist.images?.[0]?.url || null,
      genres: artist.genres || [],
      followers_total: signals.followers_total,
      popularity: signals.artist_popularity,
      top_tracks: topTracks.slice(0, 10).map((t: any) => ({
        name: t.name,
        popularity: t.popularity,
        preview_url: t.preview_url,
        album_name: t.album?.name || "",
        album_image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      })),
      related_artists: relatedArtists.slice(0, 10).map((a: any) => ({
        name: a.name,
        popularity: a.popularity,
        followers: a.followers?.total || 0,
        genres: a.genres || [],
      })),
      recent_releases: releases.slice(0, 15).map((r: any) => ({
        name: r.name,
        type: r.album_type,
        release_date: r.release_date,
        total_tracks: r.total_tracks,
        image: r.images?.[1]?.url || r.images?.[0]?.url || null,
      })),
      signals,
    };

    // Generate blueprint via Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userPrompt = `Generate a Monetization Blueprint for this artist using the provided data. Use the schema exactly. Return ONLY valid JSON, no markdown.

Artist: ${artist.name}
Tier: ${tierNum} (${tierName})
Genres: ${(artist.genres || []).join(", ") || "none listed"}

Artist data JSON:
${JSON.stringify(artistData, null, 2)}

Computed signals:
${JSON.stringify(signals, null, 2)}`;

    const BLUEPRINT_SYSTEM_PROMPT = await fetchPrompt("profit-analyze", DEFAULT_BLUEPRINT_PROMPT);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again in a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResp.json();
    let blueprintText = aiData.choices?.[0]?.message?.content || "";
    
    // Strip markdown fences if present
    blueprintText = blueprintText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let blueprint;
    try {
      blueprint = JSON.parse(blueprintText);
    } catch {
      console.error("AI returned invalid JSON:", blueprintText.substring(0, 500));
      throw new Error("AI returned invalid blueprint format. Please try again.");
    }

    // Save to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Upsert artist
    const { data: dbArtist } = await sb.from("profit_artists").upsert({
      spotify_artist_id: artistId,
      name: artist.name,
      image_url: artistData.image_url,
      genres_json: artist.genres || [],
      followers_total: signals.followers_total,
      popularity: signals.artist_popularity,
      raw_artist_json: artistData,
      signals_json: signals,
      updated_at: new Date().toISOString(),
    }, { onConflict: "spotify_artist_id" }).select("id").single();

    // Save report
    const { data: report } = await sb.from("profit_reports").insert({
      artist_id: dbArtist!.id,
      blueprint_json: blueprint,
      signals_json: signals,
      model_info: "google/gemini-3-flash-preview",
    }).select("id, share_token").single();

    return new Response(JSON.stringify({
      artist: artistData,
      blueprint,
      reportId: report!.id,
      shareToken: report!.share_token,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("profit-analyze error:", e);
    const msg = e instanceof Error ? e.message : "An internal error occurred";
    const status = msg.includes("Invalid Spotify") ? 400 : msg.includes("not found") ? 404 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
