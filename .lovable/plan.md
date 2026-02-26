

## Dance Publishing Flow - Audit & Fixes

### Issues Found

**1. Audio upload always runs (hangs on existing projects)**
In `handleDance` (line 463-472), audio is uploaded to storage every single time, even when the dance already exists with a valid `audio_url`. The same issue exists in `handleStartBattle` (line 617-625). This is the primary cause of the hang you reported earlier.

**2. Missing `beat_grid` in dance upsert (will fail on first publish)**
The `shareable_lyric_dances` table has `beat_grid` as a NOT NULL column with no default value. The upsert payload (lines 501-512) does not include `beat_grid`, so first-time inserts will fail with a database constraint error.

**3. Missing `palette` in dance upsert**
The table has `palette` as NOT NULL (default exists), but the upsert doesn't include it. It works for inserts due to the default, but updates won't refresh the palette.

**4. Stale section images on re-publish**
Per the project architecture, publishing a dance should nullify `section_images` when lyrics have changed so fresh images are generated. The current upsert doesn't set `section_images: null` on regeneration.

**5. Battle handler has same audio upload issue**
`handleStartBattle` (line 617-625) also unconditionally uploads audio every time, same fix needed.

---

### Plan

#### Change 1: Skip audio upload when existing dance has audio_url
**File: `src/components/lyric/FitTab.tsx` -- `handleDance` (~line 462-472)**

Move the existing dance lookup (currently at line 479) **before** the audio upload step. If `existingDance?.audio_url` exists, reuse it and skip the upload entirely.

```
// Before audio upload, check for existing dance
const { data: existingDance } = await supabase
  .from("shareable_lyric_dances")
  .select("audio_url, section_images, auto_palettes")
  .eq("user_id", user.id)
  .eq("artist_slug", artistSlug)
  .eq("song_slug", songSlug)
  .maybeSingle();

let audioUrl = existingDance?.audio_url;
if (!audioUrl) {
  setPublishStatus("Uploading audio...");
  // ... upload logic ...
  audioUrl = publicUrl;
}
```

#### Change 2: Include `beat_grid` and `palette` in upsert
**File: `src/components/lyric/FitTab.tsx` -- upsert payload (~line 501-512)**

Add the missing required fields:

```
beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {},
palette: cinematicDirection?.palette || ["#ffffff", "#a855f7", "#ec4899"],
```

#### Change 3: Nullify `section_images` on lyric regeneration
**File: `src/components/lyric/FitTab.tsx` -- upsert payload (~line 501-512)**

When the dance is being regenerated (lyrics changed), null out `section_images` so fresh images will be generated:

```
section_images: danceNeedsRegeneration ? null : (existingDance?.section_images ?? null),
```

#### Change 4: Skip audio upload in battle handler
**File: `src/components/lyric/FitTab.tsx` -- `handleStartBattle` (~line 616-625)**

Same pattern: check for an existing hook's `audio_url` before uploading. Query the existing hook by `artist_slug + song_slug + hook_slug`, and reuse `audio_url` if present.

---

### Summary of Changes
- **Single file modified**: `src/components/lyric/FitTab.tsx`
- **No backend changes**
- 4 targeted fixes to the publishing flow, all within existing callbacks

