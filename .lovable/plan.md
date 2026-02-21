

## Update LyricFit Transcription Fallback Prompt

### What changes
Replace the hardcoded `DEFAULT_TRANSCRIBE_PROMPT` in `supabase/functions/lyric-transcribe/index.ts` (lines 362-379) with your refined "Global Clock" prompt. This ensures that even if the database prompt is deleted or unreachable, the edge function falls back to the superior version.

### The new fallback prompt
The "Global Clock" prompt with these key improvements over the current default:
- **Global Clock Anchoring** -- timestamps are relative to absolute file start (0.000), with explicit silence accounting
- **No-overlap constraint** -- end times must not exceed the next line's start time
- **Continuous tracking** -- the clock never resets between sections

### Technical details
- **File**: `supabase/functions/lyric-transcribe/index.ts`
- **Lines 362-379**: Replace `DEFAULT_TRANSCRIBE_PROMPT` with the Global Clock prompt
- The database version (slug `lyric-transcribe`) will still take priority at runtime via `getPrompt()`; this only updates the fallback
- No other files or database changes needed
- The edge function will be redeployed automatically

