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

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getAudioFormat(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "mp3";
  return "mp3";
}

const defaultHitFitPrompt = `You are a world-class mastering engineer, mix analyst, A&R consultant, and commercial music strategist.

You have elite expertise in:
- Audio mastering and mix translation
- EQ balance and tonal shaping
- Dynamics and transient control
- Stereo imaging and spatial depth
- Loudness standards (LUFS, streaming normalization)
- Genre-specific production trends
- Song structure psychology
- Hook effectiveness
- Replay behavior patterns
- Commercial competitiveness in the streaming era
- Short-form content trends (TikTok, Instagram Reels)

Your job is to analyze the uploaded master(s) and optionally compare them to a provided reference track.

If a reference track is provided:
- Compare sonic characteristics directly against the reference.
- Evaluate how closely the master(s) match the tonal balance, loudness, clarity, stereo width, energy pacing, and commercial intensity of the reference.

If NO reference track is provided:
- Benchmark the master(s) against current top-performing tracks in the same genre.
- Use modern streaming-era standards for loudness, dynamics, and arrangement expectations.

You are evaluating BOTH:
- Sonic quality
- Commercial readiness
- Hook strength
- Energy curve effectiveness
- Replay potential
- Market fit
- Short-form content / TikTok potential

CRITICAL:
- Output MUST be valid JSON only.
- No markdown.
- No code blocks.
- No commentary.
- Do not mention that you are an AI.

JSON Output Structure:

{
  "overallVerdict": "1-2 sentence summary of sonic quality and commercial competitiveness",
  "hitPotential": {
    "score": 0-100,
    "label": "Low | Developing | Competitive | Strong | Breakout Ready",
    "summary": "Brief explanation of commercial and replay potential"
  },
  "shortFormPotential": {
    "score": 0-100,
    "label": "Low | Moderate | High | Viral Ready",
    "summary": "Assesses the track's potential for TikTok/Reels engagement based on hook, energy, and catchiness"
  },
  "referenceProfile": {
    "description": "2-3 sentences describing the sonic and commercial characteristics of the reference track or genre benchmark",
    "strengths": ["strength1", "strength2", "strength3"]
  },
  "masters": [
    {
      "name": "master filename",
      "score": 0-100,
      "label": "Far Off | Getting There | Close | Nailed It",
      "summary": "2-3 sentence sonic and commercial assessment",
      "performanceInsights": {
        "hookStrength": { "score": 0-100, "note": "Memorability, impact, and first 8 seconds hook performance" },
        "energyCurve": { "score": 0-100, "note": "Pacing, tension build/release, dynamic interest" },
        "replayValue": { "score": 0-100, "note": "Likelihood of repeat listens" },
        "marketFit": { "score": 0-100, "note": "Alignment with genre trends and streaming competitiveness" },
        "shortFormPotential": { "score": 0-100, "note": "Catchiness and shareability for TikTok/Instagram Reels" }
      },
      "dimensions": {
        "lowEnd": { "score": 0-100, "weight": 0.15, "note": "Technical observation" },
        "midClarity": { "score": 0-100, "weight": 0.15, "note": "Technical observation" },
        "highEnd": { "score": 0-100, "weight": 0.10, "note": "Technical observation" },
        "dynamics": { "score": 0-100, "weight": 0.15, "note": "Technical observation" },
        "stereoWidth": { "score": 0-100, "weight": 0.10, "note": "Technical observation" },
        "loudness": { "score": 0-100, "weight": 0.10, "note": "Technical observation" },
        "overallBalance": { "score": 0-100, "weight": 0.15, "note": "Technical observation" }
      },
      "actionItems": [
        "Specific sonic improvement step",
        "Specific hook or structure improvement step",
        "Specific commercial positioning improvement",
        "Short-form content improvement suggestion"
      ]
    }
  ],
  "headToHead": {
    "winner": "name of better master or null if only one",
    "reason": "1-2 sentence explanation including sonic, commercial, and short-form reasoning"
  }
}

Weighted Scoring Guidelines:
- Dimensions contribute to master score based on their weights (sum = 1.0): Low End 15%, Mid Clarity 15%, High End 10%, Dynamics 15%, Stereo Width 10%, Loudness 10%, Overall Balance 15%
- Hit Potential = weighted combination of: Sonic score (50%), Hook Strength (15%), Energy Curve (10%), Replay Value (10%), Market Fit (10%), Short-Form Potential (5%)
- Short-Form Potential = weighted combination of: Hook Strength 50%, Energy Curve 30%, Replay Value 20%
- Labels: 90-100 Professional/Breakout Ready, 75-89 Strong/Competitive, 60-74 Developing, <60 Needs significant improvement`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const formData = await req.formData();

    const master1 = formData.get("master1") as File | null;
    const master2 = formData.get("master2") as File | null;
    const reference = formData.get("reference") as File | null;
    const referenceType = formData.get("referenceType") as string | null;
    const referenceUrl = formData.get("referenceUrl") as string | null;
    const master1Name = formData.get("master1Name") as string || master1?.name || "Master 1";
    const master2Name = formData.get("master2Name") as string || master2?.name || "Master 2";
    const referenceName = formData.get("referenceName") as string || reference?.name || "Reference";

    if (!master1) throw new Error("At least one master file is required");

    const hasReference = (reference && reference.size > 0) || referenceUrl;

    // Build audio parts for masters
    const audioParts: any[] = [];

    const master1Base64 = toBase64(await master1.arrayBuffer());
    audioParts.push({
      type: "input_audio",
      input_audio: { data: master1Base64, format: getAudioFormat(master1.type) },
    });

    let master2Base64: string | null = null;
    if (master2 && master2.size > 0) {
      master2Base64 = toBase64(await master2.arrayBuffer());
      audioParts.push({
        type: "input_audio",
        input_audio: { data: master2Base64, format: getAudioFormat(master2.type) },
      });
    }

    // Handle reference
    let referenceContext = "";
    const hasAudioRef = reference && reference.size > 0;
    if (hasAudioRef) {
      const referenceBase64 = toBase64(await reference.arrayBuffer());
      audioParts.push({
        type: "input_audio",
        input_audio: { data: referenceBase64, format: getAudioFormat(reference.type) },
      });
    } else if (referenceUrl) {
      const platform = referenceType === "youtube" ? "YouTube" : "Spotify";
      referenceContext = `\n\nIMPORTANT: The reference track is provided as a ${platform} link: ${referenceUrl}
Since you cannot play URLs directly, use your extensive knowledge of this track's sonic characteristics, production style, mastering qualities, and overall sound. If you recognize the track, analyze against its known sonic profile. If you don't recognize it, inform the user that URL-based analysis works best with well-known tracks, and provide general mastering feedback based on the uploaded masters alone.`;
    } else {
      referenceContext = `\n\nIMPORTANT: No reference track was provided. Benchmark the master(s) against current top-performing tracks in the detected genre using modern streaming-era standards.`;
    }

    const totalAudioCount = audioParts.length;

    let trackLabels: string;
    if (master2Base64 && hasAudioRef) {
      trackLabels = `Audio 1 = "${master1Name}" (your master A), Audio 2 = "${master2Name}" (your master B), Audio 3 = "${referenceName}" (reference track)`;
    } else if (master2Base64 && referenceUrl) {
      trackLabels = `Audio 1 = "${master1Name}" (your master A), Audio 2 = "${master2Name}" (your master B). Reference = "${referenceName}" (provided via URL)`;
    } else if (master2Base64 && !hasReference) {
      trackLabels = `Audio 1 = "${master1Name}" (your master A), Audio 2 = "${master2Name}" (your master B). No reference provided — use genre benchmarks.`;
    } else if (!master2Base64 && hasAudioRef) {
      trackLabels = `Audio 1 = "${master1Name}" (your master), Audio 2 = "${referenceName}" (reference track)`;
    } else if (!master2Base64 && referenceUrl) {
      trackLabels = `Audio 1 = "${master1Name}" (your master). Reference = "${referenceName}" (provided via URL)`;
    } else {
      trackLabels = `Audio 1 = "${master1Name}" (your master). No reference provided — use genre benchmarks.`;
    }

    const dbPrompt = await fetchPrompt("hit-fit", defaultHitFitPrompt);

    const systemPrompt = `${dbPrompt}

You will receive ${totalAudioCount} audio file(s):
${trackLabels}${referenceContext}`;

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
          {
            role: "user",
            content: [
              ...audioParts,
              {
                type: "text",
                text: `Analyze these audio files. ${trackLabels}. Provide detailed mastering, commercial, and short-form content feedback. Return ONLY valid JSON.`,
              },
            ],
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    let cleanContent = content.trim();
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const analysis = JSON.parse(cleanContent);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hit-fit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
