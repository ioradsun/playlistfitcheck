
# v5.0 "Universal Acoustic Orchestrator" — Architecture Redesign

## What the User is Proposing

Replace the current multi-stage JavaScript merge engine (Soundex, phonetic similarity scoring, ghost-dedup, 5-path identity executioner) with a **single Gemini call** that receives both the audio and the Whisper JSON, then returns the final `merged.allLines` array directly.

The idea: instead of orchestrating corrections in TypeScript, let Gemini reason acoustically over the raw audio + timing grid simultaneously and output the final, production-ready merged transcript.

---

## Current Architecture (v4.4)

```text
Stage 1: Whisper → words[], segments[], rawText        (timing skeleton)
Stage 2a: Gemini Hook Call → hottest_hook + insights   (parallel with Whisper)
Stage 2b: Gemini Adlib Call → adlibs[] (30 max)        (sequential, receives rawText)
Stage 3: JS Merge Engine (~450 lines)                  (correction, ghost-pruning, snapping)
  ├── phoneticRootMatch (Soundex gating)
  ├── phoneticSimilarity (Levenshtein + skeleton)
  ├── Identity Executioner (5-path ghost deletion)
  ├── Intro/Outro Zone Preservation
  └── Global Timebase Guard (median offset correction)
Output: merged.allLines (LyricLine[])
```

## Proposed v5.0 Architecture

```text
Stage 1: Whisper → words[], segments[], rawText        (timing skeleton, unchanged)
Stage 2a: Gemini Hook Call → hottest_hook + insights   (unchanged, audio only)
Stage 2b: Gemini Orchestrator Call                     (audio + whisper JSON payload)
  Input: audioBase64 + whisperWords + whisperSegments + rawText
  Prompt: Universal Acoustic Orchestrator
  Output: final merged.allLines[] directly
Stage 3: Thin JS validator                             (schema validation, boundary guard only)
Output: merged.allLines (LyricLine[])
```

---

## Why This is a Genuine Architectural Improvement

The root cause of every iteration from v3.7 to v4.4 is that a **JavaScript function is trying to do linguistic reasoning**. The Soundex gate, the 5-path identity executioner, and the phonetic similarity scoring are all approximations of what Gemini can do directly by listening to the audio. The "Rain/Range" problem persisted through 8 versions because JavaScript cannot hear — it can only compare strings.

By giving Gemini both the audio AND the Whisper timing grid simultaneously, Gemini can:
- Hear that "range" is sung as "rain" acoustically, not infer it from string distance
- Know with certainty whether a "Yeah!" at 42s is a ghost (heard in lead) or a genuine background vocal (from a different voice/position)
- Group orphaned intro dialogue into natural phrases without guessing at segment boundaries

---

## What Changes

### `supabase/functions/lyric-transcribe/index.ts`

**1. New Gemini Orchestrator Prompt**

Replace `buildAdlibPrompt()` with `buildOrchestratorPrompt(whisperJson)` that includes the full Whisper output as a structured payload alongside the 4 Logical Workflows from the user's spec:

```text
System: You are the Universal Acoustic Orchestrator...
Input payload (injected into prompt):
  - WHISPER_WORDS: [{word, start, end}, ...]   (full word-level grid)
  - WHISPER_SEGMENTS: [{start, end, text}, ...] (sentence-level segments)
  - WHISPER_RAW_TEXT: "..."

Output: merged_lines[] following the exact LyricLine schema
```

**2. New Output Schema for the Orchestrator Call**

Gemini is asked to return the complete `merged_lines` array directly, not just `adlibs[]`. The schema it must follow:

```json
{
  "merged_lines": [
    {
      "start": 0.000,
      "end": 0.000,
      "text": "...",
      "tag": "main" | "adlib",
      "isOrphaned": false,
      "isFloating": false,
      "isCorrection": false,
      "geminiConflict": "original whisper word if corrected",
      "confidence": 0.98
    }
  ],
  "qaCorrections": 0,
  "ghostsRemoved": 0
}
```

**3. Sequencing remains Option A** (Whisper + Hook parallel first, then Orchestrator call)

```text
t=0:  Whisper starts + Hook starts (parallel)
t+W:  Whisper done → full JSON passed to Orchestrator
t+W:  Orchestrator call starts (audio + whisper JSON)
t+W+O: Orchestrator returns merged_lines[]
```

**4. Remove the JS merge engine** (`extractAdlibsFromWords`, `computeGlobalOffset`, `buildLinesFromSegments`, all Soundex/phonetic helpers)

These ~500 lines of merge logic are replaced by a thin validator that:
- Validates the schema of each returned line
- Enforces the hard boundary cap (189.3s / trackEnd+1s) as a safety net
- Sorts lines by `start` timestamp

**5. Token Budget**

The orchestrator call needs a larger token budget than the current adlib call (4000 tokens) because it is returning the full merged lines array. Recommended: **6000 tokens** to accommodate a 3–4 minute track with 60–80 lines + adlibs.

---

## What Does NOT Change

- `runWhisper()` — unchanged, still provides the timing skeleton
- `runGeminiHookAnalysis()` — unchanged, still finds hook + BPM/key/mood
- `callGemini()` / `extractJsonFromContent()` / `safeParseJson()` — reused as-is
- `findHookFromWords()` / `findRepetitionAnchor()` — unchanged
- The frontend (`LyricDisplay.tsx`, `LyricFitTab.tsx`) — no changes needed; the output schema is compatible with what they already consume (`lines[]` with `tag`, `isOrphaned`, `isFloating`, `isCorrection`, `geminiConflict`)

---

## Risks and Mitigations

**Risk: Gemini returns invalid JSON for a 60+ line response**

The current `safeParseJson()` recovery function is already robust (strips trailing commas, closes truncated arrays). This will be preserved and applied to the orchestrator response.

Additionally, the **OUTPUT LIMIT guidance** from v4.4 (max 30 adlibs) will be adapted: the orchestrator will be instructed to return a maximum of 80 total lines to keep the response within the token budget.

**Risk: Gemini ignores Whisper timestamps and invents its own**

The prompt instructs Gemini to use Whisper `start`/`end` values for main lines verbatim and to snap adlib timestamps to the nearest Whisper word boundary. A JS post-pass will validate that main line timestamps fall within ±0.5s of the original Whisper segments.

**Risk: Ghost adlibs reappear because Gemini's identity filter is imprecise**

The identity filter becomes Gemini's own acoustic judgment ("is this the same voice as the lead?") rather than JavaScript string matching. This is strictly more accurate but could have edge cases. The JS boundary guard remains as a final safety net.

---

## Files to Modify

- `supabase/functions/lyric-transcribe/index.ts` — single file, redeployed automatically

No frontend changes required.

---

## Version String

`anchor-align-v5.0-universal-orchestrator`
