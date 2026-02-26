

# Skeleton-First Lyric Tab — Final Adjustments

## 1. Delete `LyricProgressModal` entirely

`LyricsTab.tsx` is the only consumer. The file `src/components/lyric/LyricProgressModal.tsx` will be deleted, along with its import and all related state (`progressStage`, `progressOpen`, `progressFileName`, and the `ProgressStage` type import) from `LyricsTab.tsx`.

## 2. Create `LyricSkeleton.tsx`

New file: `src/components/lyric/LyricSkeleton.tsx`

A skeleton screen mimicking the `LyricDisplay` layout:
- Song title (passed as prop)
- Waveform placeholder bar
- 12-16 skeleton lines with randomized widths (40-90%)
- Uses the existing `Skeleton` component from `src/components/ui/skeleton.tsx`

Accepts two mode props:
- **loading mode**: Shows "Transcribing lyrics..." with a subtle spinner
- **error mode**: Shows "Transcription failed" message with a "Try Again" button and an optional "Back" button

Props:
```typescript
interface Props {
  title: string;
  fileName?: string;
  loading: boolean;       // true = transcribing, false = failed
  onRetry?: () => void;   // retry button handler (error mode)
  onBack?: () => void;    // back to uploader
}
```

## 3. Update `LyricsTab.tsx` — four render states

```text
State A: lyricData + audioFile + lines.length > 0
  --> LyricDisplay (normal editor)

State B: lyricData + audioFile + lines.length === 0 + loading
  --> LyricSkeleton (transcribing mode)

State C: lyricData + audioFile + lines.length === 0 + !loading
  --> LyricSkeleton (error mode, retry button calls handleTranscribe again)

State D: everything else
  --> LyricUploader
```

State C is the key addition -- when transcription fails, `loading` becomes `false` but `lyricData` still has 0 lines. Instead of silently dropping the user back to the uploader, we show the skeleton in error mode with a retry button. The retry button re-calls `handleTranscribe` with the existing `audioFile`.

## 4. Clean up `handleTranscribe` in `LyricsTab.tsx`

Remove:
- All `setProgressStage(...)` calls
- All `setTimeout` timer arrays and `clearTimeout` loops
- `progressStage`, `progressOpen`, `progressFileName` state variables
- `LyricProgressModal` import

Keep:
- `setLoading(true)` / `setLoading(false)`
- Immediate shell creation (`setLyricData({ title, lines: [] })`)
- `onUploadStarted` / `onAudioSubmitted` callbacks
- Transcription fetch, response handling, DB persistence
- Console timing logs

## Files affected

| File | Action |
|------|--------|
| `src/components/lyric/LyricProgressModal.tsx` | **Delete** |
| `src/components/lyric/LyricSkeleton.tsx` | **Create** |
| `src/components/lyric/LyricsTab.tsx` | **Edit** — remove modal, add skeleton, four-state render |

## Not modified
- `LyricFitTab.tsx` — upload fast-path intact
- `LyricDisplay.tsx` — unchanged
- Backend / edge functions — untouched
- `presetDerivation.ts` — untouched
