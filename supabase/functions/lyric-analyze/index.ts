import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DNA_PROMPT = `ROLE: Lead Music Intelligence Analyst — Song DNA Engine

TASK: Analyze the full audio track AND its timestamped lyrics to extract the song's structural identity ("Song DNA").

You have access to:
- Full audio track
- Beat grid (bar and downbeat alignment)
- Timestamped lyrics

Use all three signals in combination.

1. ADAPTIVE HOOK ANCHOR (8–12s, Bar-Aligned)
Identify the single primary bar-aligned segment representing the track's definitive "Hottest Hook."

Duration Rules:
- The hook window MUST be between 8.000 and 12.000 seconds.
- It must be fully bar-aligned (start on a musical downbeat).
- Select the smallest bar-aligned window within 8–12 seconds that fully captures the dominant hook phrase and its peak production lift.
- Do NOT cut off a lyrical phrase mid-line.
- Do NOT extend beyond the emotional or production peak unnecessarily.

Evaluation Priority (strict order):
1. Production lift and instrumental intensity
2. Overlap between peak production and the most frequently repeated lyrical phrase (using timestamped lyrics)
3. Melodic memorability
4. Emotional peak
5. Lead vocal intensity
6. Repetition frequency across the full track

Additional Requirements:
- Scan the FULL track. Do not default to the first chorus.
- Evaluate the final chorus separately for added instrumentation or layered lift.
- Use timestamped lyrics to detect the most frequently repeated lyrical phrase.
- Prefer windows where that phrase overlaps with maximum production intensity.
- A purely instrumental drop may be selected only if its memorability and lift clearly exceed all lyrical sections.

Output Rules:
- Output ONLY: start_sec (3-decimal precision), duration_sec (3-decimal precision, between 8.000 and 12.000), confidence
- Confidence floor: Only return hottest_hook if confidence >= 0.85. If below, omit the field entirely.

2. SONG DESCRIPTION
Write a single evocative sentence (max 15 words) describing what this song sounds and feels like.
Requirements:
- Must include at least one sonic texture descriptor (e.g., distorted, glossy, cinematic, gritty, orchestral, minimal).
- Must include at least one emotional descriptor.
- Avoid clichés and generic phrasing.
- Do not stack genre labels.

3. MOOD
Return the single most dominant emotional descriptor (e.g., melancholic, euphoric, anthemic, brooding, aggressive).
- Do NOT return null.
- If blended, choose the primary emotional driver.
- Confidence floor target: >= 0.85 (if below, return the closest dominant mood anyway).

4. SONG MEANING (from lyrics)
- theme: Core theme in 2–4 words
- summary: 2–3 sentence plain-language explanation of what the song is about
- imagery: 2–3 visually concrete, physically renderable images used in the lyrics

Imagery Rules:
- Must be physically visualizable (objects, environments, physical scenes).
- No abstract emotional phrases (e.g., "broken heart," "shattered dreams," "lost love").
- Prefer specific environments, objects, or physical actions.

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "duration_sec": 10.000, "confidence": 0.00, "justification": "Brief 1-2 sentence explanation of why this window was chosen — reference production lift, lyrical repetition, or melodic peak." },
  "description": "A cinematic, euphoric anthem pulsing with restless longing",
  "mood": "anthemic",
  "meaning": {
    "theme": "Midnight Redemption",
    "summary": "The artist confronts past mistakes while chasing emotional closure...",
    "imagery": ["neon skyline", "rearview mirror", "rain-soaked street"]
  }
}`;

const LYRICS_ONLY_PROMPT = `You are a music analyst. Given song lyrics, provide analysis. Return ONLY valid JSON with these keys:
- description: A single evocative sentence (max 15 words) describing what this song sounds and feels like
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic")
- meaning: { theme (2-4 words), summary (2-3 sentences), imagery (array of 2-3 short strings) }

No markdown, no explanation — just JSON.`;

// Runtime prompt fetcher — checks ai_prompts table, falls back to hardcoded default
async function getDnaPrompt(): Promise<string> {
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && sbKey) {
      const res = await fetch(`${sbUrl}/rest/v1/ai_prompts?slug=eq.lyric-hook&select=prompt`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].prompt) return rows[0].prompt;
      }
    }
  } catch {}
  return DEFAULT_DNA_PROMPT;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, artist, lyrics, audioBase64, format, beatGrid } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;

    let parsed: any;

    if (hasAudio) {
      // ── Audio + Lyrics mode: full Song DNA via Gemini with audio ──
      const mimeMap: Record<string, string> = {
        wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
        flac: "audio/flac", ogg: "audio/ogg", webm: "audio/webm",
      };
      const ext = format && mimeMap[format] ? format : "mp3";
      const mimeType = mimeMap[ext] || "audio/mpeg";

      const userContent: any[] = [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
      ];

      // Build text instruction with optional beat grid context
      let textInstruction = "";
      if (beatGrid?.bpm) {
        textInstruction += `[Beat Grid Context] Detected BPM: ${beatGrid.bpm} (confidence: ${beatGrid.confidence?.toFixed?.(2) ?? "N/A"}). Use this as ground truth for tempo.\n\n`;
      }
      if (lyrics) {
        textInstruction += `Lyrics:\n${lyrics}\n\nAnalyze this audio and its lyrics. Return only the JSON schema specified.`;
      } else {
        textInstruction += "Analyze this audio. Return only the JSON schema specified.";
      }
      userContent.push({ type: "text", text: textInstruction });

      console.log(`[song-dna] Audio mode: ~${(audioBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB, format: ${ext}, beatGrid: ${beatGrid ? `${beatGrid.bpm}bpm` : "none"}`);

      const dnaPrompt = await getDnaPrompt();
      console.log(`[song-dna] Prompt source: ${dnaPrompt.includes("ADAPTIVE HOOK ANCHOR") ? "v2-adaptive" : "v1-legacy"}, length: ${dnaPrompt.length}`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: dnaPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";

      // Parse JSON from response
      let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error("No JSON in response");
      const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
        .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

      try { parsed = JSON.parse(jsonStr); } catch { parsed = {}; }

      console.log(`[song-dna] Audio analysis complete: mood=${parsed.mood}, hook=${parsed.hottest_hook?.start_sec ?? "none"}, duration=${parsed.hottest_hook?.duration_sec ?? "none"}, conf=${parsed.hottest_hook?.confidence ?? "none"}`);
      console.log(`[song-dna] Raw AI response: ${raw.slice(0, 500)}`);

    } else {
      // ── Lyrics-only mode: text analysis ──
      if (!lyrics || typeof lyrics !== "string") {
        return new Response(JSON.stringify({ error: "Missing lyrics or audio" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[song-dna] Lyrics-only mode`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: LYRICS_ONLY_PROMPT },
            { role: "user", content: `Song: "${title || "Unknown"}" by ${artist || "Unknown Artist"}${beatGrid?.bpm ? `\n[Beat Grid] BPM: ${beatGrid.bpm}` : ""}\n\nLyrics:\n${lyrics}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      try { parsed = JSON.parse(raw); } catch { parsed = { summary: raw }; }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lyric-analyze error:", e);
    return new Response(JSON.stringify({ error: "Analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
