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
    if (!reference && !referenceUrl) throw new Error("A reference track is required");

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

    // Handle reference: file upload or URL
    let referenceContext = "";
    if (reference && reference.size > 0) {
      const referenceBase64 = toBase64(await reference.arrayBuffer());
      audioParts.push({
        type: "input_audio",
        input_audio: { data: referenceBase64, format: getAudioFormat(reference.type) },
      });
    } else if (referenceUrl) {
      // For URL-based references, we describe the reference by URL and ask the AI to use its knowledge
      const platform = referenceType === "youtube" ? "YouTube" : "Spotify";
      referenceContext = `\n\nIMPORTANT: The reference track is provided as a ${platform} link: ${referenceUrl}
Since you cannot play URLs directly, use your extensive knowledge of this track's sonic characteristics, production style, mastering qualities, and overall sound. If you recognize the track, analyze against its known sonic profile. If you don't recognize it, inform the user that URL-based analysis works best with well-known tracks, and provide general mastering feedback based on the uploaded masters alone.`;
    }

    const masterCount = master2Base64 ? 2 : 1;
    const totalAudioCount = audioParts.length;
    const hasAudioRef = reference && reference.size > 0;

    let trackLabels: string;
    if (master2Base64 && hasAudioRef) {
      trackLabels = `Audio 1 = "${master1Name}" (your master A), Audio 2 = "${master2Name}" (your master B), Audio 3 = "${referenceName}" (reference track)`;
    } else if (master2Base64 && !hasAudioRef) {
      trackLabels = `Audio 1 = "${master1Name}" (your master A), Audio 2 = "${master2Name}" (your master B). Reference = "${referenceName}" (provided via URL)`;
    } else if (!master2Base64 && hasAudioRef) {
      trackLabels = `Audio 1 = "${master1Name}" (your master), Audio 2 = "${referenceName}" (reference track)`;
    } else {
      trackLabels = `Audio 1 = "${master1Name}" (your master). Reference = "${referenceName}" (provided via URL)`;
    }

    const defaultHitFitPrompt = `You are a world-class mastering engineer and mix analyst. You have perfect ears and deep knowledge of audio production, EQ, dynamics, stereo imaging, loudness standards (LUFS), harmonic balance, and genre-specific sonics.

Your job is to analyze and compare the masters against the reference track, providing actionable feedback to help the artist achieve the sonic quality of the reference.

CRITICAL: Output MUST be valid JSON — no markdown, no code blocks, no extra text.

Output this exact JSON structure:
{
  "overallVerdict": "A short 1-2 sentence summary of how close the master(s) are to the reference",
  "referenceProfile": {
    "description": "2-3 sentences describing the sonic character of the reference track",
    "strengths": ["strength1", "strength2", "strength3"]
  },
  "masters": [
    {
      "name": "master filename",
      "score": 0-100,
      "label": "one of: Far Off | Getting There | Close | Nailed It",
      "summary": "2-3 sentence sonic assessment",
      "dimensions": {
        "lowEnd": { "score": 0-100, "note": "brief observation" },
        "midClarity": { "score": 0-100, "note": "brief observation" },
        "highEnd": { "score": 0-100, "note": "brief observation" },
        "dynamics": { "score": 0-100, "note": "brief observation" },
        "stereoWidth": { "score": 0-100, "note": "brief observation" },
        "loudness": { "score": 0-100, "note": "brief observation" },
        "overallBalance": { "score": 0-100, "note": "brief observation" }
      },
      "actionItems": [
        "Specific actionable step 1",
        "Specific actionable step 2",
        "Specific actionable step 3"
      ]
    }
  ],
  "headToHead": {
    "winner": "name of the better master or null if only one",
    "reason": "1-2 sentences explaining why"
  }
}`;

    const dbPrompt = await fetchPrompt("hit-fit", defaultHitFitPrompt);

    // Inject dynamic context into the prompt
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
                text: `Analyze these audio files. ${trackLabels}. Compare the master(s) against the reference and provide detailed mastering feedback. Return ONLY valid JSON.`,
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
