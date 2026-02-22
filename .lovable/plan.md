

# Lyric Dance Page: Social Features

## Overview
Add social interactivity to the ShareableLyricDance page, modeled after the ShareableHook single-hook experience. This includes:
- Artist profile picture + name + song title header
- Comments that appear live on the canvas (constellation/river system)
- CrowdFit-style "Replay" and "Skip" signal buttons
- Comment input after signaling

## Database Changes

### 1. Create `lyric_dance_comments` table
Mirrors `hook_comments` structure:
- `id` UUID PK
- `dance_id` UUID FK -> `shareable_lyric_dances(id)` ON DELETE CASCADE
- `user_id` UUID (nullable, for logged-in users)
- `session_id` TEXT (for anonymous users)
- `text` TEXT
- `submitted_at` TIMESTAMPTZ DEFAULT now()
- RLS: anyone can SELECT, anyone can INSERT

### 2. Create `lyric_dance_signals` table
Stores Replay/Skip votes:
- `id` UUID PK
- `dance_id` UUID FK -> `shareable_lyric_dances(id)` ON DELETE CASCADE
- `user_id` UUID (nullable)
- `session_id` TEXT
- `would_replay` BOOLEAN
- `context_note` TEXT (nullable)
- `created_at` TIMESTAMPTZ DEFAULT now()
- UNIQUE constraint on (dance_id, session_id) to prevent duplicate votes
- RLS: anyone can SELECT, anyone can INSERT

### 3. Add columns to `shareable_lyric_dances`
- `fire_count` INTEGER DEFAULT 0 (incremented by trigger on comment insert)

### 4. Create trigger
- `increment_lyric_dance_fire_count` trigger on `lyric_dance_comments` INSERT to bump `fire_count`

## Frontend Changes

### 1. Update `ShareableLyricDance.tsx`

**Fetch additional data on load:**
- Fetch the publisher's profile (avatar_url, display_name) from `profiles` using `data.user_id`
- Fetch existing comments from `lyric_dance_comments`
- Check if current session already has a signal in `lyric_dance_signals`

**Header redesign:**
- Show artist avatar (from profile) + artist_name + song_name in the header area
- Small profile pic with display name, song title below

**Canvas comments (reuse constellation/river system):**
- Import `mulberry32`, `hashSeed` from PhysicsIntegrator (already imported)
- Build constellation nodes from comments (same logic as ShareableHook lines 234-284)
- Render constellation + river in the canvas render loop (adapt from `useHookCanvas` drawing logic -- inline since we already have a custom render loop)

**Signal buttons (Replay / Skip):**
- Below the canvas, show two buttons: "Replay" and "Skip" (CrowdFit style)
- On tap: show auto-focused comment textarea with contextual placeholder
  - Replay: "What hit?"
  - Skip: "The missing piece..."
- "BROADCAST" submit button
- After signal: show signal strength percentage + "your words are on the video"

**Comment submission:**
- Insert into `lyric_dance_comments` with `dance_id`, `session_id`, optional `user_id`
- Push new comment into constellation as a "center" phase node (same as ShareableHook)
- Insert signal into `lyric_dance_signals`

### 2. Bottom panel state machine (3 states, like ShareableHook)
1. **Pre-signal**: Show "Replay" and "Skip" buttons
2. **Post-signal**: Show comment textarea + BROADCAST button
3. **Post-comment**: Show "your words are on the video" + signal strength + SEND THIS share button

## Technical Details

- The constellation/river drawing will be added directly into the existing canvas `render()` function in ShareableLyricDance, since it already has its own RAF loop (unlike ShareableHook which delegates to `useHookCanvas`)
- Comment nodes use the "Subtle as Breath" aesthetic: 300 weight, 5-6px font, 3-6% opacity for constellation, 3-7% for river rows
- Signal strength displayed as (Replay / Total) percentage
- No battle mode needed -- single canvas experience only
- Session-based voting (no auth required to signal, matching the ungated philosophy)

