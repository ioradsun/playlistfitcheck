import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface HookResult {
  start: number;
  end: number;
  score: number;
  previewText: string;
  status: "confirmed" | "candidate";
}

interface RequestBody {
  lyrics: string;
  lines: Array<{ text: string; start: number; end: number }>;
  words: WordTiming[];
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  energyCurve?: number[];
  beatEnergies?: number[];
  durationSec: number;
}

const HOOK_PROMPT = `ROLE: Hook Detection Specialist

You will receive song lyrics with timestamps AND audio analysis data (BPM, energy curve, beat energies). Use ALL signals to find the two strongest 10-second hook segments.

SIGNALS TO COMBINE:
1. LYRIC REPETITION — phrases that repeat verbatim or near-verbatim across the song are almost always hooks/choruses. This is the strongest signal.
2. ENERGY PEAKS — the energy curve shows loudness over time (0-1 normalized, 0.5s windows). Hook segments correlate with sustained high energy.
3. BEAT ENERGY — per-beat energy values. Clusters of high-energy beats = intense production moment.
4. VOCAL DENSITY — sections with more words per second = denser vocal delivery, often verses. Sections with fewer, longer-held words = often hooks/choruses.
5. STRUCTURAL POSITION — hooks tend to appear after verses (25-40% and 50-70% into the song). The strongest hook often repeats 2-3 times.

RULES:
- Scan the FULL track. Do NOT just pick the first two high-energy moments.
- The two hooks MUST be from DIFFERENT parts of the song (at least 15 seconds apart).
- Hook 1 = the absolute strongest moment (highest combination of repetition + energy).
- Hook 2 = second strongest, ideally a different section type (e.g., if Hook 1 is a chorus, Hook 2 could be a bridge or post-chorus).
- Output start_sec as a decimal with 3-decimal precision (e.g., 42.150).
- Each hook is exactly 10 seconds — do NOT output an end time.
- Confidence: 0.0-1.0. Be honest — a clear repeating chorus with peak energy = 0.9+. A best-guess on a monotone track = 0.5.
- Provide a short label for each hook (e.g., "Main Chorus", "Bridge Climax", "Post-Chorus Drop", "Opening Hook").
- Provide a brief justification for each pick (1 sentence explaining why this is a hook).

OUTPUT — return ONLY valid JSON, no markdown:
{
  "hooks": [
    { "start_sec": 42.150, "confidence": 0.92, "label": "Main Chorus", "justification": "Highest energy peak with repeated lyric appearing 3 times in the song" },
    { "start_sec": 98.300, "confidence": 0.78, "label": "Bridge Climax", "justification": "Emotional peak with sustained vocal hold and production lift" }
  ]
}`;

function extractJson(raw: string): any {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  // Fix mm:ss timestamps Gemini sometimes returns instead of decimal seconds
  // e.g. "start_sec":1:28 → "start_sec":88.0
  cleaned = cleaned.replace(/"start_sec"\s*:\s*(\d+):(\d{2})(?:\.\d+)?/g, (_match, m, s) => {
    return `"start_sec":${parseInt(m) * 60 + parseInt(s)}.0`;
  });
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildUserMessage(body: RequestBody): string {
  let msg = "";

  msg += `Song: ${body.durationSec.toFixed(1)}s, ${body.beatGrid.bpm} BPM (confidence ${(body.beatGrid.confidence * 100).toFixed(0)}%)\n\n`;

  // Energy curve (compact: ~1 value per 2 seconds)
  if (body.energyCurve && body.energyCurve.length > 0) {
    const step = Math.max(1, Math.floor(body.energyCurve.length / Math.ceil(body.durationSec / 2)));
    const sampled: string[] = [];
    for (let i = 0; i < body.energyCurve.length; i += step) {
      const timeSec = i * 0.5;
      sampled.push(`${fmt(timeSec)}=${body.energyCurve[i].toFixed(2)}`);
    }
    msg += `ENERGY CURVE (0=quiet, 1=peak):\n${sampled.join(" ")}\n\n`;
  }

  // Beat energies (compact: sample ~30 beats)
  if (body.beatEnergies && body.beatEnergies.length > 0 && body.beatGrid.beats.length > 0) {
    const step = Math.max(1, Math.floor(body.beatEnergies.length / 30));
    const sampled: string[] = [];
    for (let i = 0; i < body.beatEnergies.length; i += step) {
      const beatTime = body.beatGrid.beats[i] ?? 0;
      sampled.push(`${fmt(beatTime)}=${body.beatEnergies[i].toFixed(2)}`);
    }
    msg += `BEAT ENERGIES (sampled):\n${sampled.join(" ")}\n\n`;
  }

  // Lyrics with timestamps
  msg += `LYRICS (${body.lines.length} lines):\n`;
  for (const line of body.lines) {
    msg += `[${fmt(line.start)}-${fmt(line.end)}] ${line.text}\n`;
  }
  msg += "\n";

  // Pre-compute repeated lyrics for the AI
  const lineTexts = body.lines.map(l => l.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
  const freq: Record<string, number[]> = {};
  for (let i = 0; i < lineTexts.length; i++) {
    const key = lineTexts[i];
    if (key.length < 5) continue;
    if (!freq[key]) freq[key] = [];
    freq[key].push(i);
  }
  const repeated = Object.entries(freq).filter(([_, indices]) => indices.length > 1);
  if (repeated.length > 0) {
    msg += `REPEATED LYRICS (strong hook signal):\n`;
    for (const [text, indices] of repeated) {
      const times = indices.map(i => fmt(body.lines[i].start)).join(", ");
      msg += `  "${body.lines[indices[0]].text}" — appears ${indices.length}x at ${times}\n`;
    }
    msg += "\n";
  }

  msg += "Find the two strongest 10-second hook segments. Return JSON only.";
  return msg;
}

function snapToWordAndBeat(
  words: WordTiming[],
  beats: number[],
  startSec: number,
  confidence: number,
): HookResult | null {
  if (!words.length) return null;

  const TARGET = 10.0;
  const MIN = 8.0;
  const MAX = 12.0;
  const trackEnd = words[words.length - 1].end;

  let snapStart = Math.max(0, Math.min(startSec, trackEnd - MIN));

  // Snap to nearest beat (musical boundary)
  if (beats.length > 0) {
    let bestBeatDist = Infinity;
    for (const beat of beats) {
      const dist = Math.abs(beat - snapStart);
      if (dist < bestBeatDist && dist < 1.0) {
        bestBeatDist = dist;
        snapStart = beat;
      }
    }
  }

  // Then snap to nearest word start within 0.5s of beat-snapped position
  const nearbyWords = words.filter(w => w.start >= snapStart - 0.5 && w.start <= snapStart + 0.5);
  if (nearbyWords.length > 0) {
    let bestDist = Infinity;
    for (const w of nearbyWords) {
      const dist = Math.abs(w.start - snapStart);
      if (dist < bestDist) { bestDist = dist; snapStart = w.start; }
    }
  }

  // Find beat-aligned end near target duration
  let snapEnd = snapStart + TARGET;
  const beatEndCandidates = beats
    .filter(b => b >= snapStart + MIN && b <= snapStart + MAX)
    .sort((a, b) => Math.abs((a - snapStart) - TARGET) - Math.abs((b - snapStart) - TARGET));
  if (beatEndCandidates.length > 0) {
    snapEnd = beatEndCandidates[0];
  }

  // Snap end to nearest word boundary
  const endWords = words.filter(w => w.end >= snapEnd - 0.5 && w.end <= snapEnd + 0.5);
  if (endWords.length > 0) {
    let bestDist = Infinity;
    for (const w of endWords) {
      const dist = Math.abs(w.end - snapEnd);
      if (dist < bestDist) { bestDist = dist; snapEnd = w.end; }
    }
  }

  snapEnd = Math.min(snapEnd, snapStart + MAX);
  snapEnd = Math.max(snapEnd, snapStart + MIN);

  const finalWords = words.filter(w => w.start >= snapStart - 0.1 && w.end <= snapEnd + 0.3);
  return {
    start: Math.round(snapStart * 1000) / 1000,
    end: Math.round(snapEnd * 1000) / 1000,
    score: Math.round(confidence * 100),
    previewText: finalWords.map(w => w.word).join(" "),
    status: confidence >= 0.75 ? "confirmed" : "candidate",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;

    if (!body.lines?.length || !body.words?.length) {
      return new Response(JSON.stringify({ error: "lines and words are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const userMessage = buildUserMessage(body);

    async function callHookDetection(systemPrompt: string, userMsg: string, maxTokens: number): Promise<any> {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
      });

      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Gemini error ${r.status}: ${errText.slice(0, 300)}`);
      }

      const gwData = await r.json();
      const finishReason = gwData.choices?.[0]?.finish_reason;
      const rawContent = gwData.choices?.[0]?.message?.content || "";
      console.log(`[detect-hooks] finish_reason=${finishReason}, content_length=${rawContent.length}`);
      if (!rawContent) {
        console.warn("[detect-hooks] Empty content from AI. Full response:", JSON.stringify(gwData).slice(0, 500));
      }
      return { rawContent, finishReason };
    }

    // Attempt 1
    let { rawContent, finishReason } = await callHookDetection(HOOK_PROMPT, userMessage, 1024);
    let parsed = extractJson(rawContent);

    // Retry if empty/truncated
    if (!parsed?.hooks || !Array.isArray(parsed.hooks) || parsed.hooks.length === 0) {
      console.warn(`[detect-hooks] Attempt 1 failed (finish=${finishReason}). Content preview: ${rawContent.slice(0, 200)}`);
      console.log("[detect-hooks] Retrying with simplified prompt...");

      const retryPrompt = `You are a hook detection AI. Find the two best 10-second hook segments in this song. Return ONLY this JSON: {"hooks":[{"start_sec":NUMBER,"confidence":NUMBER,"label":"STRING","justification":"STRING"},{"start_sec":NUMBER,"confidence":NUMBER,"label":"STRING","justification":"STRING"}]}`;

      const retry = await callHookDetection(retryPrompt, userMessage, 1024);
      parsed = extractJson(retry.rawContent);

      if (!parsed?.hooks || !Array.isArray(parsed.hooks) || parsed.hooks.length === 0) {
        console.error("[detect-hooks] Retry also failed. Content:", retry.rawContent.slice(0, 300));
        throw new Error("Gemini returned no hooks after retry");
      }
    }

    const sortedHooks = parsed.hooks
      .filter((h: any) => typeof h.start_sec === "number" && h.start_sec >= 0)
      .sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 2);

    if (sortedHooks.length === 0) {
      throw new Error("No valid hook anchors from Gemini");
    }

    const beats = body.beatGrid?.beats ?? [];
    const hook1 = snapToWordAndBeat(body.words, beats, sortedHooks[0].start_sec, sortedHooks[0].confidence || 0.5);
    const hook2 = sortedHooks[1]
      ? snapToWordAndBeat(body.words, beats, sortedHooks[1].start_sec, sortedHooks[1].confidence || 0.5)
      : null;

    // Hardcode label mappings
    let hookLabel = sortedHooks[0].label || "Hook 1";
    let secondHookLabel = sortedHooks[1]?.label || "Hook 2";
    
    if (hookLabel === "Main Chorus") hookLabel = "Left Hook";
    if (secondHookLabel === "Outro Hook") secondHookLabel = "Right Hook";

    const result = {
      hook: hook1,
      secondHook: hook2,
      hookLabel,
      secondHookLabel,
      hookJustification: sortedHooks[0].justification || null,
      secondHookJustification: sortedHooks[1]?.justification || null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[detect-hooks] Error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
