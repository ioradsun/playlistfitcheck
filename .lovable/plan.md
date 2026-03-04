

# Replace Waveform with Inline Lyric Dance on Fit Tab

## What changes

Replace the `LyricWaveform` at the top of the Fit tab with the actual published lyric dance video (using the existing `InlineLyricDance` component), and move the Republish/Regenerate button directly below it.

## Implementation

### File: `src/components/lyric/FitTab.tsx`

1. **Import `InlineLyricDance`** from `@/components/songfit/InlineLyricDance`.

2. **Replace the waveform block** (lines 602-615) with conditional rendering:
   - **If a published dance exists** (`publishedUrl` is set and we can derive the dance ID): Render `<InlineLyricDance>` with the dance data, followed by the Republish button underneath.
   - **If no dance exists yet**: Keep the waveform as a fallback (the dance hasn't been created yet, so there's nothing to show).

3. **Fetch the dance ID** alongside the existing published-dance check (the `useEffect` at line 112 already queries `shareable_lyric_dances`). Add `id` to the select columns and store it in a new `publishedDanceId` state variable.

4. **Move the Dance/Republish buttons** (lines 807-841) from the bottom up to directly below the inline dance player at the top. Remove the duplicate button section at the bottom.

### Layout (when dance exists)

```text
┌─────────────────────────────┐
│  InlineLyricDance (352px)   │  ← replaces waveform
├─────────────────────────────┤
│  [Watch Dance] [Republish]  │  ← moved from bottom
├─────────────────────────────┤
│  Song DNA / Meaning / etc.  │  ← unchanged
└─────────────────────────────┘
```

### Layout (no dance yet)

```text
┌─────────────────────────────┐
│  LyricWaveform              │  ← kept as before
├─────────────────────────────┤
│  Song DNA / Meaning / etc.  │
├─────────────────────────────┤
│  [Dance] button             │  ← stays at bottom
└─────────────────────────────┘
```

### Details

- New state: `publishedDanceId: string | null` — set from the existing `useEffect` that checks for published dances.
- The `InlineLyricDance` component already handles fetching its own data, autoplay on visibility, mute controls, and full-page expansion — no new logic needed.
- The `publishedUrl` is already computed; we just need the `id` to pass to `InlineLyricDance`.

### Files affected

| File | Action |
|------|--------|
| `src/components/lyric/FitTab.tsx` | Edit — add import, add `publishedDanceId` state, replace waveform conditionally, relocate buttons |

