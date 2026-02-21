

# v8.0 "Triptych" Parallel Architecture

## Overview

Replace the single monolithic Gemini Orchestrator call (which must produce 80+ lines in one shot and risks truncation, deletion, and timing drift) with **three specialized, parallel Gemini calls** that each handle a small, focused task. The Whisper skeleton remains the backbone for the middle of the track, with Gemini acting as a surgical editor rather than a full re-transcriber.

## Why This Solves the Remaining Issues

Every regression from v5.0 through v7.3 traces back to one root cause: asking a single Gemini call to do too many things at once (intro timing, full coverage, contextual QA, outro recovery, rhythmic pulsing). When the model prioritizes one rule, it drops another. The Triptych eliminates this by giving each "rule" its own dedicated call with a tiny output budget.

## Architecture

```text
t=0:   Whisper starts + Hook starts (parallel, unchanged)
t+W:   Whisper done
t+W:   Three Gemini lanes fire in parallel:
         Lane B: Intro Patch    (audio slice 0s - anchor)     -> intro lines[]
         Lane C: Outro Patch    (audio slice middleCut - end)  -> outro lines[]
         Lane D: Phonetic Audit (audio + rawText)              -> corrections map {}
t+max: All 3 resolve
t+max: JS Stitcher: intro + corrected-middle + outro -> final allLines[]
```

## What Changes

### File: `supabase/functions/lyric-transcribe/index.ts`

**1. Three new prompt builders replace `buildOrchestratorPrompt()`**

- `buildIntroPrompt(anchorWord, anchorTs)` -- Asks Gemini to detect the acoustic onset of spoken dialogue before the anchor word and return 3-8 lines with precise timestamps. Output budget: ~800 tokens.
- `buildOutroPrompt(middleCutoff, trackEnd)` -- Asks Gemini to transcribe all vocal events from the Whisper cutoff to the end of the file. All lines tagged "adlib". Output budget: ~800 tokens.
- `buildAuditorPrompt(rawText, anchorTs, middleCutoff)` -- Asks Gemini to listen to the middle section and return ONLY a JSON corrections map (`{"whore": "boy", "range": "rain"}`). No timestamps, no lines. Output budget: ~400 tokens.

**2. Three new lane functions replace `runGeminiOrchestrator()`**

- `runGeminiIntro()` -- Calls `callGemini()` with the intro prompt. Returns `LyricLine[]`.
- `runGeminiOutro()` -- Calls `callGemini()` with the outro prompt. Returns `LyricLine[]`.
- `runGeminiAuditor()` -- Calls `callGemini()` with the auditor prompt. Returns `Record<string, string>` (corrections map).

**3. New JS stitcher function: `stitchTriptych()`**

This replaces the orchestrator's line processing:

- Takes the Whisper segments for the middle section (anchor to middleCutoff)
- Applies the corrections map via regex word-swap
- Splits long segments into 6-word phrases with interpolated timestamps
- Prepends intro lines, appends outro lines
- Sorts by start time and validates coverage

**4. Parallel execution in the main handler**

The current sequential flow:
```text
Whisper + Hook (parallel) -> Orchestrator (sequential)
```

Becomes:
```text
Whisper + Hook (parallel) -> Intro + Outro + Auditor (parallel) -> JS Stitch
```

Using `Promise.allSettled()` so any single lane failure degrades gracefully (e.g., if intro fails, fall back to starting at the anchor word).

**5. Phrase splitting utility**

A new helper `splitSegmentIntoPhrases(segment, maxWords)` that:
- Breaks a Whisper segment into chunks of N words max
- Interpolates start/end timestamps proportionally based on word count
- Preserves 3-decimal precision

## What Does NOT Change

- `runWhisper()` -- unchanged, still provides the timing skeleton
- `runGeminiHookAnalysis()` -- unchanged, still finds hook + BPM/key/mood
- `callGemini()` / `extractJsonFromContent()` / `safeParseJson()` -- reused as-is
- `findHookFromWords()` / `findRepetitionAnchor()` -- unchanged
- The frontend (`LyricDisplay.tsx`, `LyricFitTab.tsx`) -- no changes; output schema is identical
- The `_debug` payload structure -- updated with per-lane telemetry

## Prompt Details

**Lane B (Intro Lock) -- ~200 word prompt:**
- Input: full audio + anchor word/timestamp
- Task: detect acoustic onset, transcribe intro dialogue, project timestamps backward from anchor
- Output: `{"intro_lines": [LyricLine...]}` (3-8 lines expected)
- Key invariant: first line start must not be 0.000s

**Lane C (Outro Endcap) -- ~150 word prompt:**
- Input: full audio + middleCutoff + trackEnd
- Task: transcribe all vocals from middleCutoff to trackEnd
- Output: `{"outro_lines": [LyricLine...]}` (5-15 lines expected)
- Key invariant: last line end within 2s of trackEnd

**Lane D (Phonetic Auditor) -- ~150 word prompt:**
- Input: full audio + Whisper rawText + time range
- Task: compare acoustic signal to text, find mismatches
- Output: `{"corrections": {"wrong_word": "right_word", ...}, "count": N}`
- Key invariant: returns ONLY word-level swaps, no timestamps

## Token Budget Comparison

```text
v7.3 (monolithic):  8192 tokens for one call
v8.0 (triptych):    800 + 800 + 400 = 2000 tokens across three calls
```

Total token usage drops by 75%, and each call is small enough that JSON truncation becomes virtually impossible.

## Risks and Mitigations

**Risk: Audio cannot be "sliced" -- Gemini receives the full file each time**
Mitigation: The prompts specify the time range to focus on. Gemini processes the full audio but only returns data for the requested window. This is how v7.x already works (one full audio, scoped output).

**Risk: Corrections map misses context-dependent errors**
Mitigation: The auditor receives the full rawText for context. If the map is empty, no corrections are applied -- the Whisper text passes through unchanged (safe default).

**Risk: Phrase splitting produces unnatural breaks**
Mitigation: Split on word boundaries using Whisper's word-level timestamps (already available) rather than interpolating. Each sub-phrase gets the exact start/end of its first/last word.

## Version String

`anchor-align-v8.0-triptych-parallel`

