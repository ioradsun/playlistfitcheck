
# LyricFit — Complete Feature Upgrade Plan

## What Already Exists

- Audio upload + compression pipeline (client-side to base64)
- AI transcription via `lyric-transcribe` edge function
- Synced lyric display (auto-scroll, highlight active line)
- Inline line editing (double-click)
- Export: LRC, SRT, TXT (copy + download)
- Manual Save button for logged-in users
- `SignUpToSaveBanner` for guests
- `saved_lyrics` table with RLS

## What Needs to Be Built (Gap Analysis)

### 1. FMLY Friendly Version System
The biggest new feature. Two versions: Explicit (current) and FMLY Friendly (new). Each stored and editable independently.

### 2. Waveform Visualization
Replace the plain Play/Pause button with a visual waveform timeline (same pattern as MixFit's `GlobalTimeline` + `useAudioEngine`). Scrubbable, shows playhead, synced to lyrics.

### 3. Autosave (replace manual Save)
Remove the manual Save button. Debounced autosave on any edit, with a subtle "Saving… / Saved" status indicator.

### 4. Line Format Controls
Dropdown: Natural Phrases, 1 Word, 2–3 Words, 4–6 Words, Break On Pause. Re-splits line text into new lines while preserving timestamps.

### 5. Social Optimization Presets
Dropdown: General, Instagram Reels, TikTok, YouTube Shorts, Musixmatch, Live Performance, etc. Applies formatting recommendations. Stored per version.

### 6. Export filename versioning
Rename exports to `songname_Explicit.lrc` / `songname_FMLY_Friendly.srt` format.

### 7. Database schema update
Add `fmly_lines` (JSONB) and `version_meta` (JSONB for formatting/optimization settings per version) columns to `saved_lyrics`.

---

## Technical Implementation Plan

### Database Migration
Add two new nullable columns to `saved_lyrics`:
- `fmly_lines jsonb DEFAULT NULL` — stores the FMLY Friendly version lines
- `version_meta jsonb DEFAULT '{}'` — stores formatting preset + social optimization preset per version (`{ explicit: { lineFormat, socialPreset }, fmly: { lineFormat, socialPreset } }`)

### New Components

**`src/components/lyric/LyricWaveform.tsx`** (new)
- Adapts `GlobalTimeline` canvas waveform pattern from MixFit
- Uses `useAudioEngine.decodeFile()` to extract peaks from the real `audioFile`
- Scrubbable: clicking jumps audio position
- Shows playhead via `requestAnimationFrame` loop
- Shared between both versions (audio doesn't change)

**`src/components/lyric/VersionToggle.tsx`** (new)
- Segmented control: `[ Explicit ] [ FMLY Friendly ]`
- Shows last-edited timestamp per version
- If FMLY version doesn't exist yet, shows "Generate" state

**`src/components/lyric/LyricFormatControls.tsx`** (new)
- Line Format dropdown (Natural Phrases, 1 Word, 2–3 Words, 4–6 Words, Break On Pause)
- Social Optimization dropdown (General, Instagram Reels, TikTok, YouTube Shorts, Musixmatch, Live Performance, Karaoke)
- Strictness selector for FMLY (Mild / Standard / Strict) — only shown on FMLY tab

**`src/components/lyric/FmlyFriendlyPanel.tsx`** (new)
- "Make FMLY Friendly" button
- Profanity report panel: total flagged, unique flagged, breakdown list (censored)
- Confirmation dialog if FMLY version already exists and user clicks regenerate

### Updated Components

**`src/components/lyric/LyricDisplay.tsx`** (major refactor)
- Split into two modes driven by `activeVersion: 'explicit' | 'fmly'`
- Each version has its own `lines` state
- Remove manual Save button → replace with autosave (debounced 1.5s)
- Show autosave status: `Saving… / Saved`
- Wire in `LyricWaveform` above lyrics
- Wire in `VersionToggle` in header
- Wire in `LyricFormatControls` + `FmlyFriendlyPanel` in a right-side panel
- Export filenames use version suffixes

**`src/components/lyric/LyricFitTab.tsx`** (minor updates)
- Pass `audioFile` to waveform decoder
- Handle `fmly_lines` and `version_meta` when loading saved lyrics

### FMLY Friendly Generation (Client-Side)
Run the profanity filter in the browser (no extra API call needed for basic filter). A curated profanity word list is embedded as a module. Each matched word is replaced with asterisks of equal character length. Strictness modes use different-sized word lists.

For the admin-editable profanity dictionary: store it in the `ai_prompts` table (or a dedicated field in `site_copy`) so admins can update the word list from the admin dashboard.

### Layout Change
Move from single-column to a two-panel layout within `LyricDisplay`:
- **Left/Main panel (2/3 width)**: Waveform + synced lyrics editor
- **Right panel (1/3 width)**: Version toggle, Format controls, Social preset, FMLY generation + report, Export

### Autosave Logic
- `useEffect` watching `lines`, `fmlyLines`, `versionMeta` with a 1500ms debounce
- Only saves if user is logged in
- For guest users: keep the `SignUpToSaveBanner` (no session persistence)
- Status shown as small text near the header: `● Saving…` / `✓ Saved`

### Waveform / Audio Sync
- `useAudioEngine` already provides `decodeFile` — use it to decode the audio file once and extract peaks
- The playhead position is tracked with `requestAnimationFrame` since `useAudioEngine.getPlayheadPosition()` is already available
- Clicking on the waveform calls `seekTo(time)` which updates the audio position and jumps the lyric list

---

## File Summary

| File | Action |
|------|--------|
| `supabase/migrations/...sql` | Add `fmly_lines` + `version_meta` columns to `saved_lyrics` |
| `src/components/lyric/LyricWaveform.tsx` | Create — canvas waveform with scrubbable playhead |
| `src/components/lyric/VersionToggle.tsx` | Create — Explicit / FMLY Friendly segmented toggle |
| `src/components/lyric/LyricFormatControls.tsx` | Create — line format + social preset dropdowns |
| `src/components/lyric/FmlyFriendlyPanel.tsx` | Create — FMLY generation button + profanity report |
| `src/lib/profanityFilter.ts` | Create — client-side profanity replacement engine |
| `src/components/lyric/LyricDisplay.tsx` | Refactor — two-version system, autosave, waveform, new layout |
| `src/components/lyric/LyricFitTab.tsx` | Update — pass fmly/meta through, handle loading |

---

## Scope Intentionally Excluded (Future Work)
- Beat marker BPM detection (requires a WebAudio beat-detection algorithm — significant standalone feature)
- Rhyme / chorus / sentiment detection
- Brand safety scoring
- Free vs Pro gating
