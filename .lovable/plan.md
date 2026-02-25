

# Hook Battle Signal Buttons

## Overview
When a CrowdFit post contains a hook battle (instead of a regular track), the signal buttons and results text need to reflect the battle context: "LEFT HOOK" vs "RIGHT HOOK" instead of "Run it back" vs "Skip".

## Changes

### 1. Add a `isBattle` prop to HookReview

**File: `src/components/songfit/HookReview.tsx`**

- Add an optional `isBattle?: boolean` prop to the `Props` interface
- When `isBattle` is true:
  - Step 2 buttons change from "Run it back" / "Skip" to "LEFT HOOK" / "RIGHT HOOK"
  - The `would_replay` mapping stays the same (LEFT HOOK = true, RIGHT HOOK = false) so the same DB schema works
  - Results "done" state changes label from "REPLAY FIT" to "LEFT HOOK" percentage display:
    - Instead of `"67% REPLAY FIT"`, show `"67% LEFT HOOK"`
    - The tally text stays the same: `"2 OF 3 FMLY MEMBERS"`
  - Pre-resolved billboard mode also uses the battle labels
  - The "replay_cta" step prompt changes from Spotify CTAs to a simpler comment-only flow (no "Follow artist" / "Save track" links since battles don't have a single Spotify track)
  - The "skip_cta" prompt changes from "What's missing?" to "What sealed it?" or similar battle-appropriate copy

### 2. Pass `isBattle` from SongFitPostCard

**File: `src/components/songfit/SongFitPostCard.tsx`**

- Detect battle posts using the existing condition: `post.lyric_dance_url && !post.lyric_dance_id && !post.spotify_track_id`
- Pass `isBattle={true}` to the `HookReview` component when this condition is met

## Technical Details

### HookReview.tsx changes (around lines 14, 47, 156-190, 239-257, 195-236)

**Props interface** -- add `isBattle?: boolean`

**Step 2 buttons (lines 239-257)**:
- Button labels become conditional: `isBattle ? "LEFT HOOK" : "Run it back"` and `isBattle ? "RIGHT HOOK" : "Skip"`

**Pre-resolved billboard (lines 156-190)**:
- Same button label logic applies

**Results "done" state (lines 195-236)**:
- Change fit label: `isBattle ? "LEFT HOOK" : "REPLAY FIT"`
- The percentage calculation stays the same (`replay_yes / total`)

**replay_cta / skip_cta steps (lines 260-351)**:
- When `isBattle`, hide the Spotify follow/save CTAs (they don't apply to battles)
- Adjust placeholder text to be battle-appropriate

### SongFitPostCard.tsx changes (around line 457)

Add the `isBattle` prop:
```
const isBattlePost = !!(post.lyric_dance_url && !post.lyric_dance_id && !post.spotify_track_id);
```
Then pass `isBattle={isBattlePost}` to `<HookReview>`.

