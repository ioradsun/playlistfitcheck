import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `
You are a music video director and motion designer. You will receive:
1. A cinematic direction document describing the visual story of a song
2. Lyrics with word-level timestamps
3. Beat grid with BPM and beat positions
4. Song duration

Your job is to output a scene_manifest — exact engine instructions for rendering each word cinematically.

ENGINE CAPABILITIES:
WORD DIRECTIVES (for hero/notable words only — 15-40 words max):
- position: [x, y] normalized 0-1 canvas coordinates
- fontSize: number (24-96px, base is 36)
- scaleX: number (0.7-1.8, horizontal stretch)
- scaleY: number (0.7-1.3, vertical stretch)
- color: hex string
- glow: 0-2 multiplier
- entryStyle: rises | slams-in | fractures-in | materializes | cuts
- exitStyle: dissolves-upward | burns-out | shatters | lingers | fades
- kineticClass: RISING | FALLING | IMPACT | SPINNING | FLOATING

LINE LAYOUTS (for lines that deserve special spatial treatment — 10-20 lines):
- positions: array of [x,y] per word in the line
- stagger: seconds between word entries

CHAPTERS (one per chapter):
- zoom: 0.8-1.5
- driftIntensity: 0-1
- dominantColor: hex
- atmosphere: storm | cosmic | intimate | golden | urban

RULES:
- Only include wordDirectives for emotionally significant words
- Beat-align entries — use beat timestamps to time word appearances
- Hero words at climax should be large (64-96px), centered or near-center
- Filler words (the, a, I, in) stay small (20-28px), off-center
- Stagger = 60/bpm * 0.3 for energetic songs, * 0.5 for slow songs
- Return ONLY valid JSON, no markdown, no explanation

OUTPUT FORMAT:
{
  "visualMode": "intimate | cinematic | explosive",
  "stagger": number,
  "wordDirectives": {
    "word": { "position": [x,y], "fontSize": n, "color": "#hex", "entryStyle": "...", "glow": n }
  },
  "lineLayouts": {
    "lineIndex": { "positions": [[x,y],...], "stagger": n }
  },
  "chapters": [
    { "zoom": n, "driftIntensity": n, "dominantColor": "#hex", "atmosphere": "..." }
  ]
}
`;

type AnalyzeRequest = {
  cinematic_direction?: Record<string, unknown> | null;
  lyrics?: Array<Record<string, unknown>>;
  words?: Array<{ word: string; start: number; end: number }>;
  beat_grid?: { bpm?: number; beats?: Array<{ time?: number } | number> } | null;
  song_duration?: number;
  lyricId?: string;
  id?: string;
};

function extractJson(raw: string): Record<string, unknown> | null {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function validateManifest(value: Record<string, unknown>): boolean {
  const mode = value.visualMode;
  if (!["intimate", "cinematic", "explosive"].includes(String(mode))) return false;
  return true;
}

async function persistSceneManifest(sceneManifest: Record<string, unknown> | null, lyricId?: string): Promise<void> {
  if (!lyricId) return;
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return;

  const payload = { scene_manifest: sceneManifest };
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  for (const table of ["shareable_lyric_dances", "lyric_dances", "saved_lyrics"]) {
    await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(lyricId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as AnalyzeRequest;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const lyricId = typeof body.lyricId === "string" ? body.lyricId : typeof body.id === "string" ? body.id : undefined;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              cinematic_direction: body.cinematic_direction ?? null,
              lyrics: Array.isArray(body.lyrics) ? body.lyrics : [],
              words: Array.isArray(body.words) ? body.words : [],
              beat_grid: body.beat_grid ?? null,
              song_duration: Number(body.song_duration ?? 0),
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[generate-scene-manifest] AI error", resp.status, text);
      return new Response(JSON.stringify({ scene_manifest: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await resp.json();
    const rawContent = String(completion?.choices?.[0]?.message?.content ?? "");
    const parsed = extractJson(rawContent);
    const sceneManifest = parsed && validateManifest(parsed) ? parsed : null;

    await persistSceneManifest(sceneManifest, lyricId);

    return new Response(JSON.stringify({ scene_manifest: sceneManifest }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-scene-manifest] Error:", error);
    return new Response(JSON.stringify({ scene_manifest: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
