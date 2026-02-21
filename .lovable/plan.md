
# v11.0 "Scribe-Only" Architecture

## Overview

Replaced the entire Whisper + Gemini Triptych pipeline with **ElevenLabs Scribe v2** as the sole transcription engine. Gemini is retained only for hook detection and metadata analysis.

## Pipeline

```text
t=0:   Scribe + Hook (parallel)
t+S:   Scribe done → build lyric lines from word-level timestamps
t+H:   Hook done → snap hook to nearest word boundary
t+max: Return response
```

## What Was Removed (v8-v10)

- **Whisper** (`runWhisper`) — replaced by Scribe
- **Gemini Triptych Lanes B/C/D** — intro patch, outro patch, phonetic auditor
- **Audio byte-slicer** (`sliceAudioBase64`)
- **Stitcher** (`stitchTriptych`)
- **Phrase splitter** (`splitSegmentIntoPhrases`)
- All triptych prompt builders (`buildIntroPrompt`, `buildOutroPrompt`, `buildAuditorPrompt`)
- Auditor fallback logic (`runGeminiAuditorWithFallback`)
- `transcriptionModel` frontend state (always Scribe now)

## What Remains

- `runScribe()` — ElevenLabs Scribe v2 with diarization + audio event tagging
- `runGeminiHookAnalysis()` — hook detection, BPM/key/mood, title/artist
- `findHookFromWords()` / `findRepetitionAnchor()` — hook snapping
- `callGemini()` / `extractJsonFromContent()` — shared utilities
- Frontend unchanged except removed `transcriptionModel` param

## Version String

`v11.0-scribe-only`
