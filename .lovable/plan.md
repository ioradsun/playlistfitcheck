

# Hook Battle: Editorial A/B Poll on the Share Page

## Vision

Transform the share page from a single-hook showcase into a split-screen "Hook Battle" where audiences vote on which of two AI-identified hooks hits harder. Think editorial music magazine meets Instagram Stories poll -- minimal, typographic, and visceral. The winning hook accumulates fire and floating comments in real-time while the losing side fades quiet.

## Architecture Overview

```text
+--------------------------------------------------+
|  AI (lyric-analyze)                               |
|  Returns top 2 hooks ranked by confidence         |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  LyricDisplay (client)                            |
|  Parses both hooks, publishes both to             |
|  shareable_hooks with a shared battle_id          |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  ShareableHook (/:artist/:song/:hook)             |
|  Detects battle_id, loads both hooks,             |
|  renders split-screen poll with voting            |
+--------------------------------------------------+
```

## Changes Required

### 1. Backend: AI Returns Two Hooks

**File: `supabase/functions/lyric-analyze/index.ts`**

- Update the system prompt to request the top 2 hooks instead of 1
- Change the JSON schema from `hottest_hook` (single object) to `hottest_hooks` (array of 2)
- Each entry: `{ start_sec, duration_sec, confidence, justification, label }`
- The `label` is a short editorial name the AI gives each hook (e.g. "The Drop", "The Confession")
- Keep backward compatibility: if only 1 hook returned, still works

### 2. Database: Battle Support

**New columns on `shareable_hooks`:**
- `battle_id` (uuid, nullable) -- groups two hooks into a battle pair
- `battle_position` (smallint, nullable) -- 1 or 2 within the battle
- `hook_label` (text, nullable) -- AI-generated editorial label for the hook
- `vote_count` (integer, default 0) -- total votes for this hook

**New table: `hook_votes`**
- `id` (uuid, PK)
- `battle_id` (uuid, not null)
- `hook_id` (uuid, not null) -- which hook was voted for
- `user_id` (uuid, nullable)
- `session_id` (text, nullable)
- `created_at` (timestamptz)
- Unique constraint on `(battle_id, session_id)` -- one vote per visitor per battle
- RLS: anyone can view, anyone can insert (anon or auth), no update/delete

**Trigger:** On insert into `hook_votes`, increment `shareable_hooks.vote_count` for the voted hook.

### 3. Client: LyricDisplay Parses Two Hooks

**File: `src/components/lyric/LyricDisplay.tsx`**

- Update the Song DNA parser to handle `hottest_hooks` (array) in addition to `hottest_hook`
- Store both hooks in state (primary + challenger)
- The "Hottest Hook" card shows the top-ranked hook (unchanged UX)
- PublishHookButton publishes both hooks with a shared `battle_id`

### 4. Client: PublishHookButton Publishes a Battle

**File: `src/components/lyric/PublishHookButton.tsx`**

- Accept an optional second hook prop
- When two hooks exist, generate a `battle_id` (crypto.randomUUID)
- Upsert both hooks to `shareable_hooks` with `battle_id`, `battle_position` (1 or 2), and `hook_label`
- The published URL remains the same (primary hook's slug) -- the share page detects the battle

### 5. Share Page: Split-Screen Battle UI

**File: `src/pages/ShareableHook.tsx`**

This is the centrepiece -- a Jony Ive-inspired editorial poll.

**Data loading:**
- After loading the primary hook, check if `battle_id` exists
- If yes, load the second hook from `shareable_hooks` where `battle_id` matches and `id` differs
- Load vote counts for both hooks
- Check if current session has already voted

**Layout (mobile-first, full viewport):**

```text
+---------------------------------------+
|  [artist] x [song]                    |  <- editorial header, 10px mono
|                                       |
|  +---------------+  +---------------+ |
|  |               |  |               | |
|  |   HOOK A      |  |   HOOK B      | |  <- two canvases, each running
|  |   (canvas)    |  |   (canvas)    | |     its own HookDanceEngine
|  |               |  |               | |
|  +---------------+  +---------------+ |
|                                       |
|  "THE DROP"          "THE CONFESSION" |  <- AI-generated labels
|   62%  ████░░         38%  ███░░░░░░  |  <- live vote bars
|                                       |
|  Tap the side that hits harder.       |  <- CTA
|                                       |
|  [Fit by toolsFM]                     |  <- badge, bottom-right
+---------------------------------------+
```

**On mobile (< 640px):** Stack vertically -- top canvas / bottom canvas, each 45vh.

**Interaction:**
- Tapping either canvas side casts a vote (or switches vote if already cast)
- On vote: the chosen side gets a burst of fire emojis and floating comment particles gravitating toward it
- The losing side dims to 40% opacity
- Vote percentages animate in with a typographic counter
- Comments submitted via the input float exclusively around the winning hook's canvas

**After voting:**
- The voted hook's canvas expands slightly (scale 1.02)
- A subtle pulse of the palette's accent color radiates from the chosen side
- The input prompt changes from "Tap the side that hits harder" to "What did [label] do to you?"

**Single-hook fallback:**
- If no `battle_id`, render the existing single-hook experience (no regression)

### 6. Shared Audio Strategy

Both canvases share a single `HTMLAudioElement`. Since the hooks are from the same track:
- Audio plays continuously
- Each canvas's HookDanceEngine has its own hook region
- They alternate: Hook A plays its 8-12s, then Hook B plays its 8-12s, ping-pong style
- A thin progress indicator at the bottom shows which hook is currently "live"
- The inactive canvas shows a frozen last-frame with reduced opacity

### 7. Route Structure

No route changes needed. The existing `/:artistSlug/:songSlug/:hookSlug` route loads the primary hook. The battle detection happens at data-load time by checking `battle_id`.

## Technical Details

### Font & Typography
- Hook labels: 11px mono, uppercase, tracking-[0.3em], white/40
- Vote percentages: 32px Geist, tabular-nums, white/90
- Vote bars: 2px height, palette accent color, CSS transition 600ms
- "Tap the side" CTA: 10px mono, white/20, centered below canvases

### Canvas Rendering (per side)
- Each side gets its own `<canvas>` element with independent DPR scaling
- Each runs its own `HookDanceEngine` instance with the same audio element
- The `computeFitFontSize` safe ratio stays at 0.52 (already battle-ready since canvases are narrower)
- Background, effects, and progress bar render identically to the current single-hook experience

### Performance
- Two canvases = two rAF loops. Use a single shared rAF coordinator that ticks both engines
- Only the "active" engine (whose hook region audio is playing) renders at 60fps
- The inactive engine renders at 15fps (every 4th frame) to save GPU

### Vote Persistence
- Anonymous visitors get a session_id (existing pattern from `hook_comments`)
- Authenticated users use their user_id
- One vote per battle per visitor (unique constraint)
- Votes are mutable (can switch sides) via upsert

### Fire + Comment Particles
- On vote, spawn 8-12 fire emoji particles from the tap point
- Particles use simple gravity physics (vy += 0.15 per frame, fade over 1s)
- Existing constellation comments drift toward the winning hook's side
- New comments submitted after voting appear only on the voted side's canvas
