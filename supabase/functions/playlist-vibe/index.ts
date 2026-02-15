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
    const { playlistName, description, ownerName, trackList } = body;

    // Input validation
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
    if (ownerName != null && (typeof ownerName !== "string" || ownerName.length > 200)) {
      return new Response(JSON.stringify({ error: "Invalid ownerName" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trackListStr = trackList
      .map((t: { name: string; artists: string }, i: number) => `${i + 1}. "${t.name}" by ${t.artists}`)
      .join("\n");

    const defaultVibePrompt = `You are a music industry analyst specializing in Spotify playlist curation. Given a playlist's track list, analyze the overall vibe and provide actionable insights for artists considering submitting music.

Your response MUST be valid JSON with this exact structure:
{
  "genres": ["genre1", "genre2", "genre3"],
  "mood": "one-line mood description",
  "vibe": "2-3 sentence description of the playlist's overall sonic character and aesthetic",
  "idealSubmission": "2-3 sentence description of what kind of song/artist would be a perfect fit for this playlist",
  "energyLevel": "low" | "medium" | "high" | "mixed",
  "standoutArtists": ["artist1", "artist2", "artist3"]
}

Be specific and actionable. Reference actual patterns you see in the track list.`;

    const systemPrompt = await fetchPrompt("playlist-vibe", defaultVibePrompt);

    const userPrompt = `Analyze this playlist:
Name: ${(playlistName || "Unknown").slice(0, 200)}
Description: ${(description || "None").slice(0, 500)}
Curator: ${(ownerName || "Unknown").slice(0, 100)}

Track list:
${trackListStr}`;

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
        genres: [],
        mood: "Unable to determine",
        vibe: content.slice(0, 300),
        idealSubmission: "Unable to analyze",
        energyLevel: "mixed",
        standoutArtists: [],
      };
    }

    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Vibe analysis error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
