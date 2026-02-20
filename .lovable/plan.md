
# Anchor-Align v2.4: Reference-Based Adlib Auditor

## What Changes and Why

Currently the Adlib Auditor call sends only audio to Gemini. It has no awareness of what Whisper already transcribed as the main lead vocal. This forces Gemini to re-detect the lead vocal itself, which is the root cause of "ghost adlibs" (re-transcribed lead lines leaking through the 0.9 dedup filter).

The fix: pass Whisper's `rawText` transcript directly into the adlib call as a "Main Lyric Script." Gemini is then instructed to perform **subtraction** — identify only the vocals NOT present in the provided script.

This also reduces the globalOffset drift because Gemini can anchor its internal clock to the word sequence it sees in the transcript, instead of independently estimating timing.

## Pipeline Architecture (v2.4)

```text
Stage 1 — Whisper (unchanged)
  audio → whisper-1 → words[] + segments[] + rawText

Stage 2a — Gemini Hook (unchanged, audio only)
  audio → Hook/Meta prompt → hottest_hook + insights + metadata

Stage 2b — Gemini Adlib Auditor (UPGRADED)
  audio + rawText → Reference-Based Adlib prompt → adlibs[]
  Gemini now performs SUBTRACTION: only returns vocals NOT in rawText
```

The three calls still run in parallel via `Promise.allSettled`. The adlib call is fired immediately alongside the whisper call, but passes the rawText from the whisper result. Since whisper needs to resolve first before adlib can use rawText, the pipeline becomes:

```text
whisper + hook run in parallel first
↓ (whisper resolves)
adlib runs with rawText injected
hook waits separately
```

This adds a small sequential dependency but the benefit far outweighs the latency cost, since the adlib call is the most expensive to re-run when it hallucinates ghosts.

## Sequencing Strategy

There are two options for the timing:

**Option A (Sequential, cleanest):** Run Whisper and Hook in parallel. Once Whisper resolves, fire the Adlib call with rawText. Hook and Adlib results are collected together.

**Option B (Optimistic parallel):** Fire all three at once. If Whisper fails, the Adlib call falls back to audio-only mode (current behavior). This maintains max parallelism but loses the reference benefit on the first attempt.

**Chosen: Option A** — reliability over raw parallelism. The hook call is fully parallel with Whisper (no dependency). The adlib call fires after Whisper resolves, armed with the transcript.

```text
t=0  ──► whisper-1 starts
t=0  ──► gemini hook starts
         ↓ (whisper done, ~5-15s)
t+W  ──► gemini adlib starts (with rawText)
t+W+A ──► all results merged
```

## Specific Code Changes

### `supabase/functions/lyric-transcribe/index.ts`

**1. Update `runGeminiAdlibAnalysis` signature**

Add an optional `whisperTranscript?: string` parameter.

**2. New Reference-Based Adlib Prompt**

Replace the current `GEMINI_ADLIB_PROMPT` constant with a new `buildAdlibPrompt(transcript: string): string` function that dynamically injects the Whisper rawText:

```text
ROLE: Lead Vocal Producer

You have been provided:
1. Raw audio of a musical track
2. The Main Lead Vocal Transcript (below) — already captured by a word-level transcription engine

MAIN LEAD VOCAL TRANSCRIPT:
[whisperTranscript injected here]

TASK: Perform SUBTRACTION. Identify every vocal event in the audio that is NOT part of the Main Lead Vocal Transcript above.

SUBTRACTION RULE:
- If a word appears in the provided transcript, it belongs to the lead vocal — DO NOT include it.
- You are hunting ONLY for: background vocals, hype interjections, call-and-response layers, echo repeats, harmonies under the lead, and atmospheric vocal textures.

HIGH-SENSITIVITY WINDOW:
- Pay extreme attention from 2:30 to the end of the track. Outro sections contain dense background layers.

PRECISION:
- Timestamps: seconds with 3-decimal precision (e.g., 169.452)
- Confidence floor: 0.95 — only output if you are 95% certain it is a secondary vocal layer
- layer: "echo" | "callout" | "background" | "texture"

OUTPUT — ONLY valid JSON:
{
  "adlibs": [
    { "text": "...", "start": 0.000, "end": 0.000, "layer": "callout", "confidence": 0.98 }
  ]
}
```

Note the confidence floor is raised from 0.60 → **0.95** for the reference-based call, since Gemini now has the script as an anchor and should only output events it is highly certain are secondary layers.

**3. Update main handler sequencing**

Change from:
```typescript
// Current: all 3 parallel
const [whisperResult, hookResult, adlibResult] = await Promise.allSettled([
  whisperPromise, hookPromise, adlibPromise,
]);
```

To:
```typescript
// v2.4: Whisper + Hook parallel first, then Adlib with transcript
const [whisperResult, hookResult] = await Promise.allSettled([
  whisperPromise,
  hookPromise,
]);

const rawTranscript = whisperResult.status === "fulfilled"
  ? whisperResult.value.rawText
  : "";

const adlibResult = await (
  !analysisDisabled
    ? runGeminiAdlibAnalysis(audioBase64, mimeType, LOVABLE_API_KEY, resolvedAnalysisModel, rawTranscript).then(v => ({ status: "fulfilled" as const, value: v })).catch(e => ({ status: "rejected" as const, reason: e }))
    : Promise.resolve({ status: "rejected" as const, reason: new Error("ANALYSIS_DISABLED") })
);
```

**4. Update ghost-dedup threshold**

Since the reference-based prompt already performs text subtraction, the downstream ghost-dedup overlap threshold in `extractAdlibsFromWords` can be lowered from `0.9` → `0.75`. This catches the remaining edge cases where Gemini still returns a near-duplicate despite having the transcript, without being too aggressive.

**5. Update version string**

Change `"anchor-align-v2.3-split"` → `"anchor-align-v2.4-reference"`.

**6. Update debug output**

Add `transcriptProvided: true/false` to the gemini adlib debug block so we can verify the transcript was injected.

## Files to Modify

- `supabase/functions/lyric-transcribe/index.ts` — all logic changes, redeployed automatically

No frontend changes required. The merge engine, LyricDisplay, and LyricFitTab remain unchanged.

## Expected Outcomes

- Ghost adlib count drops significantly (Gemini won't re-identify lead lyrics)
- Outro adlib detection improves (Gemini's full attention on secondary layers)
- globalOffset drift reduces (transcript anchors Gemini's internal clock to Whisper's word sequence)
- Confidence floor raised to 0.95 means every returned adlib is high-certainty
