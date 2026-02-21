

## Add Optional Lyrics Input to LyricFit

### Overview
Add an optional "Paste Your Lyrics" textarea to the LyricUploader screen. When lyrics are provided, the transcription pipeline shifts from **detective mode** (phonetic guessing) to **editor mode** (forced alignment), significantly improving accuracy.

### User Experience
- A collapsible or always-visible textarea appears above the upload button labeled something like "Have lyrics? Paste them for better accuracy"
- The field is **optional** -- if empty, the pipeline works exactly as it does today
- When lyrics are pasted, a subtle indicator shows "Editor Mode" so the user knows the AI will align rather than guess
- The existing upload + sync flow remains unchanged

### Frontend Changes

**1. `src/components/lyric/LyricUploader.tsx`**
- Add a `Textarea` field for pasting lyrics (optional)
- Store in local state, pass to `onTranscribe` callback
- Update the callback signature: `onTranscribe: (file: File, referenceLyrics?: string) => void`
- Add a helper label: "Paste lyrics for better sync accuracy (optional)"

**2. `src/components/lyric/LyricFitTab.tsx`**
- Update `handleTranscribe` to accept and forward the optional `referenceLyrics` string
- Include `referenceLyrics` in the POST body to the edge function

### Backend Changes

**3. `supabase/functions/lyric-transcribe/index.ts`**

- Parse optional `referenceLyrics` from the request body
- **Scribe path (editor mode)**: After Scribe returns word-level timestamps, run a post-processing step that diffs the Scribe output against the reference lyrics. Replace misheard words with the reference text while preserving Scribe's native timestamps. This gives you Scribe-quality timing with lyric-perfect text.
- **Gemini path (editor mode)**: Swap the transcription prompt from the current "detective" prompt to a new "forced alignment" prompt. Instead of asking Gemini to figure out what's being said, the prompt says: "Here are the lyrics. Align each line to the audio and return timestamps." This is a fundamentally simpler task for the model.
- Add a new `DEFAULT_ALIGN_PROMPT` constant as fallback, and a corresponding `lyric-align` slug for the admin prompt editor
- The hook analysis pipeline remains untouched -- it always works from audio

### Technical Details

**New alignment prompt (Gemini path):**
```
ROLE: Precision Lyric Alignment Engine (Global Clock Sync)

TASK: You are given the complete lyrics below. Your ONLY job is to listen
to the audio and assign precise start/end timestamps to each line.
Do NOT alter, rewrite, or reorder the lyrics. Align them exactly as given.

REFERENCE LYRICS:
{referenceLyrics}

RULES:
- Timestamps anchored to Absolute File Start (0.000)
- 3-decimal precision (e.g., 12.402)
- No overlaps between consecutive main vocal lines
- Tag lines as "main" or "adlib" based on what you hear
- If a reference line isn't audible, still include it with your best
  estimate based on surrounding context

OUTPUT: Raw JSON array only, no markdown.
```

**Scribe post-processing (diff/correction):**
- Tokenize both Scribe output and reference lyrics
- Use a simple word-level sequence alignment (longest common subsequence)
- Where Scribe's word differs from reference, replace the text but keep the timestamp
- This preserves Scribe's millisecond-precision timing while fixing phonetic errors

**Request body change:**
```json
{
  "audioBase64": "...",
  "format": "mp3",
  "analysisModel": "google/gemini-2.5-flash",
  "transcriptionModel": "scribe",
  "referenceLyrics": "optional string of pasted lyrics"
}
```

**Debug output additions:**
- `mode: "detective" | "editor"` to indicate which path was used
- `referenceProvided: boolean`

### What stays the same
- Hook analysis (Gemini) is unaffected -- always uses audio
- The upload zone, progress modal, and file handling are unchanged
- If no lyrics are pasted, the entire pipeline runs identically to today
- Admin prompt management still works -- the new alignment prompt gets its own `lyric-align` slug

