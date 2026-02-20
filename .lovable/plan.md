
# Timing Synchronization Fix for LyricFit

## Root Cause Diagnosis

There are three distinct bugs causing the mismatch, each with a clear fix.

---

### Bug 1: `timeupdate` fires only ~4x per second (most impactful)

**Where**: `LyricDisplay.tsx`, lines 284-291.

The `<audio>` `timeupdate` event fires roughly every 250ms (browser-defined). This is the single biggest source of lag. The waveform playhead and lyric highlight both read from `currentTime` state, which is only updated 4x per second.

**Fix**: Replace the `timeupdate` listener with a `requestAnimationFrame` (RAF) loop that reads `audio.currentTime` at 60fps. The `timeupdate` listener is kept only for the loop-region check (which needs to fire accurately to prevent overshooting the hook end).

```text
Current:
  timeupdate (250ms intervals) → setState(currentTime) → re-render

New:
  requestAnimationFrame (16ms intervals) → setState(currentTime) → re-render
  timeupdate (250ms) → loop region enforcement only
```

---

### Bug 2: Floating-point gap causes lines to be skipped or flicker

**Where**: `LyricDisplay.tsx`, lines 261-274.

The check `currentTime >= l.start && currentTime < l.end` has no tolerance. If a line ends at `14.8` and the next starts at `14.8`, the RAF loop may hit `14.800001` and briefly miss both. Short adlib lines (< 300ms) can be entirely skipped by a single RAF tick.

**Fix**: Add a small epsilon (`0.08s`) to the end boundary:
```
currentTime >= l.start && currentTime < (l.end + 0.08)
```
This is invisible to the user but prevents flickering at boundaries. The sticky logic already handles gaps between non-adjacent lines, so this only needs to be applied at the active-line detection level.

---

### Bug 3: MP3 codec delay ("Processing Offset")

**Where**: Audio files — especially MP3s — can contain a LAME/Xing header that pads up to ~1,152 samples (~26ms at 44.1kHz) of silence. More significantly, some files have transcoding silence of 0.5–2 seconds that Gemini correctly ignores (its timestamps start where audio content starts) but the HTML5 player includes.

**Fix**: Add a user-adjustable **Offset Slider** in the LyricDisplay header. This adds a signed offset (e.g., `-1.5` to `+1.5` seconds) to all timestamp comparisons — without touching the underlying data. The value is stored in component state and applied only at render/comparison time.

```text
Effective timestamp = stored_timestamp + timingOffset
```

This lets artists dial in perfect sync after transcription without re-running the AI. Default is `0`. The slider is compact (a small row beneath the waveform).

---

## Files to Modify

### `src/components/lyric/LyricDisplay.tsx`

1. **Replace `timeupdate` → RAF loop**:
   - On audio setup (`useEffect`), start a RAF loop using `rafRef` that reads `audio.currentTime` and calls `setCurrentTime`.
   - Keep `timeupdate` only for the loop-region clamp (it doesn't need 60fps accuracy for that).
   - Cancel the RAF loop on pause/stop/cleanup.

2. **Add epsilon to active-line detection**:
   - Change `currentTime < l.end` → `currentTime < l.end + HIGHLIGHT_EPSILON` where `HIGHLIGHT_EPSILON = 0.08`.

3. **Add `timingOffset` state and slider**:
   - `const [timingOffset, setTimingOffset] = useState(0)` — range `-2.0` to `+2.0`, step `0.1`.
   - Compute `adjustedTime = currentTime - timingOffset` (subtracting means "shift lyrics earlier if audio leads").
   - Use `adjustedTime` everywhere timestamps are compared (active-line detection, hook loop region, waveform playhead).
   - Render a compact offset row beneath the waveform: a `-` button, a `+` button, a numeric display (`Offset: +0.3s`), and a Reset link. No full Radix slider needed — simple step buttons keep the UI clean.

---

## Technical Summary

```text
Before:
  audio.timeupdate (~250ms) ──► setCurrentTime ──► highlight / waveform

After:
  requestAnimationFrame (16ms) ──► setCurrentTime ──► highlight / waveform
  audio.timeupdate (~250ms) ──► loop region clamp only

Highlight check (before):
  currentTime >= l.start && currentTime < l.end

Highlight check (after):
  adjustedTime >= l.start && adjustedTime < l.end + 0.08

Timing offset:
  adjustedTime = currentTime - timingOffset
  UI: [ - ] [ Offset: 0.0s ] [ + ]  (step 0.1s, range ±2.0s)
```

No backend changes required. No new dependencies. All changes are contained in `LyricDisplay.tsx`.
