

## Plan: Rename hook labels + show lyrics instead of justifications

### Problem
1. **Labels**: "Main Chorus" and "Outro Hook" are already persisted in the database for existing songs. The edge function fix only applies to *new* detections. Need client-side remapping too.
2. **Description**: Currently shows AI justification text (e.g., "This section contains the most direct lyrical repetition..."). User wants the actual lyrics (`previewText`) from those timestamps instead.

### Changes

**`src/components/lyric/FitTab.tsx`** (lines 946-989):

1. **Remap labels client-side** (after line 946): Add a mapping step so `"Main Chorus"` → `"Left Hook"` and `"Outro Hook"` → `"Right Hook"` before rendering.

2. **Replace justification with lyrics** (lines 985-989): Instead of rendering `justifications[idx]`, render `aiHook.previewText` (the actual lyrics from the hook's time range). The `previewText` field is already populated by the `snapToWordAndBeat` function in detect-hooks.

```text
Before:
  {!isUserHook && justifications[idx] && (
    <p className="...">{justifications[idx]}</p>
  )}

After:
  {!isUserHook && activeHook.previewText && (
    <p className="...">&ldquo;{activeHook.previewText}&rdquo;</p>
  )}
```

**`supabase/functions/detect-hooks/index.ts`**: Already has the label remapping — no further changes needed there.

### No other files affected
The edge function is already deployed with the label mapping. This is purely a client-side display fix in `FitTab.tsx`.

