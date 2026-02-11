import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

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

interface TrackItem {
  added_at: string;
  track: { id: string; name: string; artists: { name: string }[] } | null;
}

async function fetchAllTracks(playlistId: string, token: string): Promise<TrackItem[]> {
  const items: TrackItem[] = [];
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(added_at,track(id,name,artists(name))),next&limit=100`;

  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Error fetching tracks:", resp.status, text);
      break;
    }
    const data = await resp.json();
    items.push(...(data.items || []));
    url = data.next || null;
  }

  return items;
}

function computeDerivedMetrics(
  currentTrackIds: string[],
  snapshots: { track_ids: string[]; created_at: string }[]
) {
  let lastUpdatedDays: number | undefined;
  let churnRate30d: number | undefined;
  let bottomDumpScore: number | undefined;

  if (snapshots.length === 0) {
    return { lastUpdatedDays, churnRate30d, bottomDumpScore, snapshotCount: 0 };
  }

  // Sort snapshots by date descending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const previousSnapshot = sorted[0];
  const prevTrackIds = previousSnapshot.track_ids || [];

  // Last updated: compare current vs previous — if tracks changed, it was updated recently
  const prevSet = new Set(prevTrackIds);
  const currSet = new Set(currentTrackIds);
  const added = currentTrackIds.filter((id) => !prevSet.has(id));
  const removed = prevTrackIds.filter((id) => !currSet.has(id));

  if (added.length > 0 || removed.length > 0) {
    // Playlist changed since last snapshot — updated today
    lastUpdatedDays = 0;
  } else {
    // No change — days since last snapshot is minimum
    const daysSinceSnapshot = Math.floor(
      (Date.now() - new Date(previousSnapshot.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    lastUpdatedDays = daysSinceSnapshot;
  }

  // Churn rate: ratio of tracks changed over 30 days
  // Find snapshots from ~30 days ago
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const oldSnapshots = sorted.filter(
    (s) => new Date(s.created_at).getTime() <= thirtyDaysAgo
  );

  if (oldSnapshots.length > 0) {
    const oldSnapshot = oldSnapshots[0];
    const oldSet = new Set(oldSnapshot.track_ids || []);
    const totalUnique = new Set([...currentTrackIds, ...(oldSnapshot.track_ids || [])]);
    const changedCount =
      currentTrackIds.filter((id) => !oldSet.has(id)).length +
      (oldSnapshot.track_ids || []).filter((id: string) => !currSet.has(id)).length;

    churnRate30d = totalUnique.size > 0 ? Math.round((changedCount / totalUnique.size) * 100) / 100 : 0;
  }

  // Bottom dump: check if newly added tracks are in the bottom 25% of positions
  if (added.length > 0 && currentTrackIds.length > 0) {
    const bottomQuartileStart = Math.floor(currentTrackIds.length * 0.75);
    let bottomCount = 0;
    for (const addedId of added) {
      const pos = currentTrackIds.indexOf(addedId);
      if (pos >= bottomQuartileStart) bottomCount++;
    }
    bottomDumpScore = Math.round((bottomCount / added.length) * 100) / 100;
  }

  return { lastUpdatedDays, churnRate30d, bottomDumpScore, snapshotCount: snapshots.length };
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Fetch playlist metadata
    const playlistResp = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!playlistResp.ok) {
      const errText = await playlistResp.text();
      console.error("Spotify API error:", playlistResp.status, errText);
      return new Response(
        JSON.stringify({ error: `Spotify API error [${playlistResp.status}]. Make sure your Spotify app is out of Development Mode to access public playlists.` }),
        { status: playlistResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const playlist = await playlistResp.json();

    // Fetch all track IDs with positions
    const trackItems = await fetchAllTracks(playlistId, token);
    const trackIds = trackItems
      .map((item) => item.track?.id)
      .filter((id): id is string => !!id);

    const ownerName = playlist.owner?.display_name || "";
    const isSpotifyEditorial = ownerName.toLowerCase() === "spotify";
    const description = playlist.description || "";

    const submissionKeywords = ["submit", "submissions", " dm ", "promo", "placements", "guaranteed"];
    const descLower = description.toLowerCase();
    const submissionLanguageDetected = submissionKeywords.some((k) => descLower.includes(k));

    // Fetch previous snapshots for this playlist
    const { data: snapshots } = await supabase
      .from("playlist_snapshots")
      .select("track_ids, created_at")
      .eq("playlist_id", playlistId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Compute derived metrics from snapshot history
    const derived = computeDerivedMetrics(trackIds, snapshots || []);

    // Save current snapshot
    await supabase.from("playlist_snapshots").insert({
      playlist_id: playlistId,
      playlist_url: playlistUrl,
      playlist_name: playlist.name || "",
      owner_name: ownerName,
      description,
      followers_total: playlist.followers?.total,
      tracks_total: playlist.tracks?.total,
      track_ids: trackIds,
    });

    // Build track list for vibe analysis
    const trackList = trackItems
      .filter((item) => item.track)
      .slice(0, 50) // Limit to 50 for AI context
      .map((item) => ({
        name: item.track!.name,
        artists: item.track!.artists?.map((a) => a.name).join(", ") || "Unknown",
      }));

    const result = {
      playlistUrl,
      playlistId,
      playlistName: playlist.name || "",
      ownerName,
      playlistOwnerIsSpotifyEditorial: isSpotifyEditorial,
      description,
      followersTotal: playlist.followers?.total ?? undefined,
      tracksTotal: playlist.tracks?.total ?? undefined,
      lastUpdatedDays: derived.lastUpdatedDays,
      submissionLanguageDetected,
      churnRate30d: derived.churnRate30d,
      bottomDumpScore: derived.bottomDumpScore,
      _snapshotCount: derived.snapshotCount,
      _trackList: trackList,
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
