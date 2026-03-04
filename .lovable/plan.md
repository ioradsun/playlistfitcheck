

## Plan: Fix Build Errors + Auto-Update Canvas on Transcript Changes

### Part 1: Fix Build Errors (3 locations in LyricDancePlayer.ts)

**Line 1696** — `this._lastVisibleChunkIds` → `this._lastVisibleMidChunkId`
**Line 3373** — `this._lastVisibleChunkIds` → `this._lastVisibleMidChunkId`
**Line 2401** — `visibleChunks[0]` → `this._solvedBounds[0]` (the variable `visibleChunks` doesn't exist in that scope; `_solvedBounds` is the array that holds visible chunk bounds)

### Part 2: Auto-Update Canvas When Transcript Changes

The `InlineLyricDance` in the FIT tab currently only renders from the published dance data fetched from the database. When a user edits their transcript in the Lyrics tab, the embedded player doesn't reflect those changes until they republish.

**Approach**: Expose `load()` on the `InlineLyricDanceHandle` interface and add a `useEffect` in `FitTab` that calls it when `lyricData.lines` or `words` change.

**File changes:**

1. **`src/engine/LyricDancePlayer.ts`** — Fix the 3 build errors (property name corrections).

2. **`src/components/songfit/InlineLyricDance.tsx`** — Extend the `InlineLyricDanceHandle` to also expose a `reloadTranscript(lines, words)` method that calls `player.load()` with the updated payload while preserving playback position.

3. **`src/components/lyric/FitTab.tsx`** — Add a `useEffect` watching `lyricData.lines` and `words` that calls `dancePlayerRef.current.reloadTranscript(lines, words)` with a 400ms debounce to avoid recompiling on every keystroke.

**Debounced reload logic (in FitTab):**
```text
useEffect:
  if no player or no prefetched data → skip
  debounce 400ms:
    save currentTime
    rebuild payload with new lines/words
    call player.load(newPayload)
    seek back to saved time
```

**reloadTranscript method (on InlineLyricDanceHandle):**
```text
reloadTranscript(lines, words):
  player = getPlayer()
  if !player → return
  t = player.getCurrentTime()
  merge new lines/words into existing payload
  await player.load(mergedPayload, noop)
  player.seek(t)
```

This keeps audio playing, images cached, and position preserved — exactly the pattern described.

