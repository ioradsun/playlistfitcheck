import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_DNA_PROMPT = `ROLE: Lead Music Intelligence Analyst — Song DNA Engine

TASK: Analyze the full audio track AND its lyrics to extract the song's structural identity ("Song DNA").

1. THE 10.000s HOOK ANCHOR
- Identify the single primary 10-second segment representing the track's "Hottest Hook."
- Evaluation criteria: production lift, lead vocal intensity, melodic memorability, emotional peak, and repetition.
- Scan the FULL track. Do not default to the first chorus.
- Output ONLY start_sec as a decimal in seconds with 3-decimal precision (e.g., 78.450).
- The 10s duration is a system invariant — do NOT output an end time.
- Confidence floor: Only return hottest_hook if confidence >= 0.75. If below, omit the field entirely.

2. SONG DESCRIPTION
- Write a single evocative sentence (max 15 words) describing what this song sounds and feels like.
- Combine sonic texture, lyrical theme, and emotional tone into one line.
- Be specific and vivid — avoid generic phrases like "a good song" or "nice beat."

3. MOOD
- mood: Single dominant emotional descriptor (e.g., "melancholic", "hype", "anthemic"). Confidence floor: 0.85 — return null if below.

4. BPM
- Estimate the tempo in beats per minute. Return as integer.
- Confidence: 0.0–1.0.

5. SONG MEANING (from lyrics)
- theme: The core theme in 2-4 words
- summary: A 2-3 sentence plain-language explanation of what the song is about
- imagery: 2-3 notable metaphors or images used (array of short strings)

OUTPUT — return ONLY valid JSON, no markdown, no explanation:
{
  "hottest_hook": { "start_sec": 0.000, "confidence": 0.00 },
  "description": "A brooding trap ballad about midnight regret over heavy 808s",
  "mood": "melancholic",
  "bpm": 140,
  "meaning": {
    "theme": "Midnight Regret",
    "summary": "The artist reflects on a relationship that fell apart...",
    "imagery": ["broken glass", "empty streets", "fading headlights"]
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

      console.log(`[song-dna] Audio mode: ~${(audioBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB, format: ${ext}`);

      const dnaPrompt = await getDnaPrompt();

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

      console.log(`[song-dna] Audio analysis complete: mood=${parsed.mood}, bpm=${parsed.bpm}, hook=${parsed.hottest_hook?.start_sec ?? "none"}`);

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
