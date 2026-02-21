
# v12.0 "Dual Engine" Architecture

## Overview

Added **Gemini audio transcription** as a selectable alternative to ElevenLabs Scribe v2. The transcription engine is admin-configurable via the Tools panel.

## Pipeline

```text
t=0:   Transcribe (Scribe OR Gemini) + Hook Analysis (parallel)
t+T:   Transcription done → build lyric lines
t+H:   Hook done → snap hook to nearest word boundary
t+max: Return response
```

## Engines

| Engine | Source | Timestamps | Dependency |
|--------|--------|-----------|------------|
| ElevenLabs Scribe v2 | Native word-level | High precision | `ELEVENLABS_API_KEY` |
| Gemini (audio-only) | Prompted line-level | Approximate | `LOVABLE_API_KEY` (free) |

## What Changed (v11 → v12)

- Added `runGeminiTranscribe()` — prompts Gemini for timestamped lyrics, synthesizes word entries for hook snapping
- Edge function accepts `transcriptionModel` param (`"scribe"` or `"gemini"`)
- Admin ToolsEditor: Whisper option replaced with Scribe; Gemini option retained
- Frontend reads `lyric_transcription_model` from site_copy and passes to edge function
- Client-side WebM/Opus compression unchanged — both engines receive the same base64 payload

## Version String

`v12.0-dual-engine`
