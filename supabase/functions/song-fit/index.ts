import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPrompt(slug: string, fallback: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    const { data } = await sb.from("ai_prompts").select("prompt").eq("slug", slug).single();
    return data?.prompt || fallback;
  } catch { return fallback; }
}

function validateTrackList(trackList: unknown): trackList is { name: string; artists: string }[] {
  if (!Array.isArray(trackList)) return false;
  if (trackList.length === 0 || trackList.length > 200) return false;
  return trackList.every(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof t.name === "string" &&
      t.name.length <= 300 &&
      typeof t.artists === "string" &&
      t.artists.length <= 500
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { songUrl, playlistName, description, ownerName, trackList, healthScore, healthLabel, scoreBreakdown, narrative, recommendation, pitchSuitability } = body;

    // Input validation
    if (!songUrl || typeof songUrl !== "string") {
      return new Response(JSON.stringify({ error: "No song URL provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (songUrl.length > 500 || !songUrl.match(/^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/)) {
      return new Response(JSON.stringify({ error: "Invalid Spotify track URL format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validateTrackList(trackList)) {
      return new Response(JSON.stringify({ error: "Invalid or missing track data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (playlistName != null && (typeof playlistName !== "string" || playlistName.length > 300)) {
      return new Response(JSON.stringify({ error: "Invalid playlistName" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (description != null && (typeof description !== "string" || description.length > 2000)) {
      return new Response(JSON.stringify({ error: "Invalid description" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch song name from Spotify
    let songName = "Unknown Song";
    let artistName = "";
    try {
      const trackIdMatch = songUrl.match(/track\/([a-zA-Z0-9]+)/);
      if (trackIdMatch) {
        const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
        const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
        if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
          const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=client_credentials&client_id=${SPOTIFY_CLIENT_ID}&client_secret=${SPOTIFY_CLIENT_SECRET}`,
          });
          if (tokenRes.ok) {
            const { access_token } = await tokenRes.json();
            const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackIdMatch[1]}`, {
              headers: { Authorization: `Bearer ${access_token}` },
            });
            if (trackRes.ok) {
              const track = await trackRes.json();
              artistName = track.artists?.map((a: { name: string }) => a.name).join(", ") || "";
              songName = track.name;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch song name:", e);
    }

    const trackListStr = trackList
      .map((t: { name: string; artists: string }, i: number) => `${i + 1}. "${t.name}" by ${t.artists}`)
      .join("\n");

    const breakdownStr = scoreBreakdown ? Object.entries(scoreBreakdown)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n") : "Not available";

    const defaultSongFitPrompt = `You are a music industry analyst specializing in Spotify playlist curation and song-to-playlist fit analysis. You are given:
1. A song URL and its inferred sonic character
2. A playlist's track list
3. The playlist's structural health metrics (algorithmic scores for activity, curation quality, reach, etc.)

Your job is to produce ONE BLENDED SCORE (0-100) that combines:
- How well the SONG fits the playlist sonically (genre, mood, energy, production style) — weighted ~60%
- How healthy/valuable the PLAYLIST is for pitching — weighted ~40%

Your response MUST be valid JSON with this exact structure:
{
  "blendedScore": <number 0-100>,
  "blendedLabel": "PERFECT_FIT" | "STRONG_FIT" | "DECENT_FIT" | "WEAK_FIT" | "POOR_FIT",
  "summary": "2-3 sentence summary blending song fit + playlist quality insights",
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "suggestion": "2-3 sentence actionable suggestion for the artist",
  "sonicFitScore": <number 0-100>,
  "playlistQualityScore": <number 0-100>,
  "soundDescription": "One concise line describing the song's sound — e.g. 'reverb-heavy vocal, ambient textures, mid-tempo indie' — max 15 words, no fluff"
}

Scoring guide for blendedScore:
- 85-100: PERFECT_FIT — great sonic match + strong playlist
- 70-84: STRONG_FIT — very compatible, minor gaps in fit or playlist quality
- 50-69: DECENT_FIT — could work but notable differences or playlist concerns
- 30-49: WEAK_FIT — significant sonic mismatch or poor playlist quality
- 0-29: POOR_FIT — fundamentally wrong fit or problematic playlist

Be honest, specific, and reference actual patterns from the track list. The strengths and concerns should cover BOTH sonic fit and playlist quality factors.`;

    const systemPrompt = await fetchPrompt("song-fit", defaultSongFitPrompt);

    const userPrompt = `Analyze this song's fit for the playlist, considering both sonic compatibility and playlist quality:

Song: ${songName}${artistName ? ` by ${artistName}` : ""}
Song URL: ${songUrl}

Playlist: ${(playlistName || "Unknown").slice(0, 200)}
Description: ${(description || "None").slice(0, 500)}
Curator: ${(typeof ownerName === "string" ? ownerName : "Unknown").slice(0, 100)}

Playlist Health Score: ${typeof healthScore === "number" ? healthScore : "N/A"}/100 (${typeof healthLabel === "string" ? healthLabel.slice(0, 50) : "N/A"})
Pitch Suitability: ${typeof pitchSuitability === "string" ? pitchSuitability.slice(0, 100) : "N/A"}
Health Breakdown:
${breakdownStr}
${narrative && typeof narrative === "string" ? `\nAnalysis: ${narrative.slice(0, 500)}` : ""}
${recommendation && typeof recommendation === "string" ? `\nRecommendation: ${recommendation.slice(0, 500)}` : ""}

Playlist tracks:
${trackListStr}

Produce a single blended score factoring in both how well "${songName}" fits sonically AND how valuable this playlist is as a pitching target.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error("AI analysis failed");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      analysis = {
        blendedScore: healthScore ?? 50,
        blendedLabel: "DECENT_FIT",
        summary: "Unable to fully analyze song fit.",
        strengths: [],
        concerns: [],
        suggestion: content.slice(0, 300),
        sonicFitScore: 50,
        playlistQualityScore: healthScore ?? 50,
      };
    }

    return new Response(JSON.stringify({ ...analysis, songName, artistName }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Song fit error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
