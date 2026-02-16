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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { songTitle, moods, lyrics, composerNotes, hitfitAnalysis } = body;

    // Build HitFit context string if available
    let hitfitContext = "";
    if (hitfitAnalysis && typeof hitfitAnalysis === "object") {
      const parts: string[] = [];
      if (hitfitAnalysis.overallVerdict) parts.push(`Sonic verdict: ${hitfitAnalysis.overallVerdict}`);
      if (hitfitAnalysis.hitPotential?.label) parts.push(`Hit potential: ${hitfitAnalysis.hitPotential.label} (${hitfitAnalysis.hitPotential.score}/100)`);
      if (hitfitAnalysis.shortFormPotential?.label) parts.push(`Short-form potential: ${hitfitAnalysis.shortFormPotential.label} (${hitfitAnalysis.shortFormPotential.score}/100)`);
      const master = hitfitAnalysis.masters?.[0];
      if (master) {
        parts.push(`Sonic score: ${master.score}/100 — ${master.summary}`);
        if (master.performanceInsights) {
          const pi = master.performanceInsights;
          if (pi.hookStrength) parts.push(`Hook strength: ${pi.hookStrength.score}/100`);
          if (pi.energyCurve) parts.push(`Energy curve: ${pi.energyCurve.score}/100`);
        }
      }
      if (parts.length > 0) {
        hitfitContext = `\n\nHitFit Analysis (sonic insights from the actual track):\n${parts.join("\n")}`;
      }
    }

    // Validate inputs
    if (!songTitle || typeof songTitle !== "string" || songTitle.length > 200) {
      return new Response(JSON.stringify({ error: "Song title is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(moods) || moods.length === 0) {
      return new Response(JSON.stringify({ error: "At least one mood is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Step 1: Generate captions ---
    const defaultCaptionPrompt = `You are a social media strategist for independent musicians. Given a song's details, generate authentic, engaging captions that match the song's vibe. Be genuine, not corporate. Use emojis sparingly.

Your response MUST be valid JSON with this exact structure:
{
  "instagram": ["caption1", "caption2", "caption3"],
  "tiktok": ["caption1", "caption2"],
  "storytelling": "A short emotional storytelling caption (2-3 sentences)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}

Include a light CTA like 'stream now' or 'link in bio'. Match tone to mood. Be authentic.`;

    const captionPrompt = await fetchPrompt("vibefit-captions", defaultCaptionPrompt);

    const userPrompt = `Generate captions for this song:
Song Title: ${songTitle.slice(0, 200)}
Mood/Vibe: ${moods.join(", ")}
${composerNotes ? `Composer Notes: ${(composerNotes as string).slice(0, 500)}` : ""}
${lyrics ? `Lyrics:\n${(lyrics as string).slice(0, 1000)}` : ""}${hitfitContext}`;

    const captionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: captionPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!captionResp.ok) {
      if (captionResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (captionResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Caption generation failed");
    }

    const captionData = await captionResp.json();
    const captionContent = captionData.choices?.[0]?.message?.content || "";

    let captions;
    try {
      const jsonMatch = captionContent.match(/\{[\s\S]*\}/);
      captions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(captionContent);
    } catch {
      captions = {
        instagram: ["Check out my new track 🎵", "New music dropping now", "This one's different"],
        tiktok: ["POV: when the beat hits different", "New track alert 🔥"],
        storytelling: captionContent.slice(0, 300),
        hashtags: ["newmusic", "independent", moods[0]?.toLowerCase().replace(/[^a-z]/g, "") || "vibes"],
      };
    }

    // --- Step 2: Generate 3 cover art images ---
    const defaultArtPrompt = `Create a modern, high-quality album cover art. Square format (1:1 ratio). Spotify-ready aesthetic. NO TEXT on the image. Style should match current streaming platform trends.`;

    const artSystemPrompt = await fetchPrompt("vibefit-art", defaultArtPrompt);

    const artPromptBase = `${artSystemPrompt}
Mood: ${moods.join(", ")}
${composerNotes ? `Artist direction: ${(composerNotes as string).slice(0, 500)}` : ""}
${lyrics ? `Key lyrical themes: ${(lyrics as string).slice(0, 200)}` : ""}${hitfitContext}`;

    const artVariations = [
      `${artPromptBase}\nStyle: Abstract and atmospheric, focus on color and texture.`,
      `${artPromptBase}\nStyle: Photographic and cinematic, dramatic lighting.`,
      `${artPromptBase}\nStyle: Illustrative and bold, graphic design inspired.`,
    ];

    const artResults: string[] = [];

    for (const prompt of artVariations) {
      try {
        const artResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });

        if (artResp.ok) {
          const artData = await artResp.json();
          const imageUrl = artData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imageUrl) {
            artResults.push(imageUrl);
          }
        } else {
          console.error("Art generation failed:", artResp.status);
        }
      } catch (e) {
        console.error("Art generation error:", e);
      }
    }

    return new Response(JSON.stringify({
      captions,
      coverArt: artResults,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("VibeFit error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
