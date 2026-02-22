

# HookFit V1 — Complete Redesign

## Overview

Replace the current free-form HookFit card with a strict 6-state battle card. Each card is a self-contained judging experience: one listen, one verdict, one result. No replays before voting. No early results. Randomized playback order per judge.

## Database Changes

**New columns on `hook_votes` table:**
- `playback_order` (text, nullable) -- 'A_first' or 'B_first', logged for normalization
- `played_first_hook_id` (uuid, nullable) -- which hook played first for this judge

**New table: `battle_passes`**
- `id` (uuid, PK, default gen_random_uuid())
- `battle_id` (uuid, not null)
- `session_id` (text, not null)
- `user_id` (uuid, nullable)
- `created_at` (timestamptz, default now())
- RLS: insert for anyone, select for service role only (silent logging)

This logs when a judge scrolls past without voting (STATE 6) for future V2 streak mechanics.

## Architecture

### State Machine

The card has 6 states, managed by a single `cardState` enum in the refactored `HookFitPostCard`:

```text
CHALLENGE --> LISTEN --> JUDGMENT --> SCORECARD --> RESULTS
                                          |
    PASS (silent, triggered by scroll-away without voting)
```

### Component Structure

- **`HookFitPostCard`** -- Orchestrates the 6-state machine, owns all UI overlays
- **`InlineBattle`** -- Rewritten to be a controlled component. Parent tells it what to do:
  - Which canvases to show (both always mounted)
  - Which side is active/dimmed
  - Whether audio plays or not
  - Sequential playback mode (first hook, then second hook, then both loop silently)

### Playback Order Randomization

Use the existing `mulberry32` PRNG from `PhysicsIntegrator.ts`, seeded with `hashSeed(judgeSessionId + battleId)`. This determines whether Hook A or Hook B plays first. The order is logged with the vote for aggregate normalization.

## Detailed State Implementations

### STATE 1 -- THE CHALLENGE
- Both canvases mounted and running their physics engines but **dark/dimmed to 20% opacity**
- Audio fully muted on both sides
- Center overlay text: **WHICH HOOK WINS** (font-mono, uppercase, tracking-widest, white/70)
- Single tap anywhere on the card triggers transition to STATE 2
- No playbar, no labels, no controls visible

### STATE 2 -- THE LISTEN
- Compute `playbackOrder` from PRNG: either `['a','b']` or `['b','a']`
- **Phase 1 (first hook):**
  - Active canvas: full brightness, audio unmuted, playing from hook_start
  - Inactive canvas: dimmed to 40% opacity, silent
  - Seam (1px divider): pulses with active side's `palette[0]` (primary color) using CSS animation
  - Bottom center overlay: `HOOK A ENTERS` or `HOOK B ENTERS` depending on which is first
  - When hook reaches end (progress >= 0.98), auto-transition to Phase 2
- **Phase 2 (second hook):**
  - Swap: second hook's canvas goes full brightness + audio, first dims to 40%
  - Seam color shifts to new active side's palette
  - Bottom center: second hook's label enters
  - When second hook reaches end, auto-transition to STATE 3
- No tapping allowed during listen. No skipping. No switching sides.
- Progress bar visible only for active side

### STATE 3 -- THE JUDGMENT
- Both canvases dim slightly (70% opacity), keep looping silently (no audio)
- Center overlay replaces listen text: **YOUR VERDICT.** (with period)
- Two buttons appear, one under each canvas:
  - Left: **HOOKED** (positioned bottom-center of left canvas)
  - Right: **HOOKED** (positioned bottom-center of right canvas)
- Single tap on either button submits the vote and transitions to STATE 4
- No timer, no auto-advance

### STATE 4 -- SCORECARD SUBMITTED
- 400ms transition animation
- Top center: **YOUR CALL -- [chosen hook's hook_label or hook_slug]**
- Chosen canvas: brief flash of `palette[0]`, HOOK_FRACTURE effect fires, then continues looping
- Losing canvas: freezes mid-frame, dims to 30% opacity, stays frozen
- Seam: stays centered, no fill (battle still open)
- Bottom center: **FMLY VOTES COMING IN** (pulsing animation)
- Replay buttons appear under each canvas: **Replay This Hook** (allows replay AFTER voting only)
- Below replay buttons: **VERDICT LOCKED** (small, muted text)
- Vote counts start appearing via realtime subscription or polling
- Vote is persisted to `hook_votes` with `playback_order` and `played_first_hook_id`

### STATE 5 -- RESULTS
- Triggers when `voteCountA + voteCountB >= 10` or time-based cutoff
- Top: **THE JUDGES HAVE SCORED**
- Your call line: **YOUR CALL: [hook_slug]**
- FMLY Scorecard: two bars showing raw counts (e.g., "847 FMLY" vs "423 FMLY")
  - Horizontal bar visualization, no percentages
- Seam: animates filling toward majority side over 600ms
- Agreement text:
  - If judge's pick matches majority: **YOU CALLED IT WITH THE FMLY**
  - If different: **YOU SAW IT DIFFERENT** + minority percentage line below

### STATE 6 -- THE PASS
- No UI change. Triggered when card leaves viewport (IntersectionObserver) without a vote
- Log to `battle_passes` table silently
- If user scrolls back, card resets to STATE 1 (fresh listen)
- Track whether pass was already logged to avoid duplicates per session

## Key Behavioral Rules

1. **No results before voting** -- vote counts, bars, percentages are never shown until STATE 4+
2. **No replay before voting** -- replay buttons only appear in STATE 4
3. **No percentages anywhere** -- only raw FMLY crowd counts
4. **One listen per hook** -- sequential, no switching during STATE 2
5. **Tap to start, tap to vote** -- minimal interaction surface
6. **Audio auto-plays** on STATE 2 entry (user initiated the sequence with their tap in STATE 1)

## Files Modified

1. **`src/components/hookfit/InlineBattle.tsx`** -- Major rewrite. Becomes a controlled canvas renderer that accepts props for:
   - `mode`: 'dark' | 'listen-a' | 'listen-b' | 'judgment' | 'scorecard' | 'results'
   - `onHookEnd`: callback when active hook finishes playing
   - `votedSide`: which side won (for freeze/flash effects)
   - Remove all vote/mute/tap-to-unmute logic (moved to parent)

2. **`src/components/hookfit/HookFitPostCard.tsx`** -- Major rewrite. Becomes the state machine orchestrator:
   - New `cardState` enum: 'challenge' | 'listen-first' | 'listen-second' | 'judgment' | 'scorecard' | 'results'
   - Manages playback order via mulberry32 PRNG
   - Renders all overlay text and buttons per state
   - Handles vote submission with new columns
   - Implements pass logging on visibility loss
   - Realtime or polling for vote count updates in STATE 4/5

3. **`src/components/hookfit/HookFitPostCard.tsx` types** -- Remove `CardPhase` type, replace with new state enum

4. **`src/components/hookfit/HookFitFeed.tsx`** -- Minor: remove the HookFitToggle (recent/top toggle) since V1 is a clean feed. Keep feed fetching logic.

5. **`src/components/hookfit/HookFitTab.tsx`** -- No changes needed.

6. **`src/components/hookfit/types.ts`** -- Update `HookFitPost` if needed for new fields.

## Technical Notes

- The `useHookCanvas` hook already supports `active` prop and `restart()` -- these will be used to control sequential playback
- The `onEnd` callback in `useHookCanvas` fires when hook reaches 98% progress -- this drives the auto-transition from first hook to second hook in STATE 2
- The existing `mulberry32` and `hashSeed` from `PhysicsIntegrator.ts` will be imported for playback order randomization
- The seam pulsing will use framer-motion's `animate` with a repeating opacity/color transition
- The HOOK_FRACTURE effect is already in the EffectRegistry and triggers on the last hook line -- we just need to force-trigger it on vote submission
- Vote threshold for STATE 5 (10 votes) can be a constant, adjustable later

