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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { songUrl, playlistName, description, ownerName, trackList } = await req.json();

    if (!songUrl) {
      return new Response(JSON.stringify({ error: "No song URL provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!trackList || trackList.length === 0) {
      return new Response(JSON.stringify({ error: "No track data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trackListStr = trackList
      .map((t: { name: string; artists: string }, i: number) => `${i + 1}. "${t.name}" by ${t.artists}`)
      .join("\n");

    const systemPrompt = `You are a music industry analyst specializing in Spotify playlist curation and song-to-playlist fit analysis. Given a song URL and a playlist's track list, analyze how well the song fits the playlist's sonic character.

Your response MUST be valid JSON with this exact structure:
{
  "fitScore": <number 0-100>,
  "fitLabel": "PERFECT_FIT" | "STRONG_FIT" | "DECENT_FIT" | "WEAK_FIT" | "POOR_FIT",
  "summary": "1-2 sentence summary of how well the song fits",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "suggestion": "1-2 sentence actionable suggestion for the artist"
}

Scoring guide:
- 85-100: PERFECT_FIT — the song would blend seamlessly
- 70-84: STRONG_FIT — very compatible with minor differences
- 50-69: DECENT_FIT — could work but noticeable differences
- 30-49: WEAK_FIT — significant sonic mismatch
- 0-29: POOR_FIT — fundamentally different sonic space

Be honest, specific, and reference actual patterns from the track list. Base your analysis on genre, mood, energy, production style, and artist caliber patterns visible in the tracklist.`;

    const userPrompt = `Analyze this song's fit for the playlist:

Song URL: ${songUrl}

Playlist: ${playlistName || "Unknown"}
Description: ${description || "None"}
Curator: ${ownerName || "Unknown"}

Playlist tracks:
${trackListStr}

Based on the genres, moods, and sonic patterns in the playlist tracks above, evaluate how likely this song (inferred from its Spotify URL context) would fit.`;

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
        fitScore: 50,
        fitLabel: "DECENT_FIT",
        summary: "Unable to fully analyze song fit.",
        strengths: [],
        concerns: [],
        suggestion: content.slice(0, 300),
      };
    }

    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Song fit error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
