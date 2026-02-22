

## HookFit Card UX Overhaul

### Overview
Redesign the HookFit card interaction flow to be clearer, more intentional, and reuse proven patterns from CrowdFit (side panel for comments/reviews).

### Changes

**1. Progress bar only shows when audio is playing**
- In `InlineBattle.tsx`, the colored progress line will only render when `!isMuted` (audio is actually playing)
- When muted/silent, the 2px bar remains as a dim separator but no colored fill

**2. Both canvases get a dim mask overlay**
- Each canvas panel gets a semi-transparent dark overlay (`bg-black/30`) that signals "tap to activate"
- The mask disappears from a side once the user taps it (tracked via `tappedSides`)
- The inactive side's existing opacity fade (0.4) remains as-is

**3. "Tap to unmute" instruction on left video (top)**
- A transparent text overlay "Tap to unmute" appears at the top-center of the LEFT (Hook A) canvas
- This only shows before first interaction (before any side is tapped)
- Disappears once the user taps any side

**4. Bottom instruction flow redesign**
- **Initial state**: `"WHICH HOOK FITS? -- FMLY DECIDES"` (centered below both canvases)
- **After tapping a side**: Changes to `"I'm Hooked on [Hook Label]"` button (existing behavior, kept)
- **After voting**: Label changes to `"Hooked"` with a badge showing `"You + 24 FMLY"` (vote count)

**5. "Hooked" badge on player (top-left of active canvas)**
- After voting, a small badge appears top-left of the canvas: `"Hooked"` with green accent
- Clicking this badge opens the side panel (same Sheet pattern as CrowdFit's `HookReviewsSheet`)

**6. Side panel for vote details (Sheet)**
- Reuses the `Sheet` component (same as `HookReviewsSheet` / `DreamComments`)
- Opens from right side
- Shows battle info at top (hook labels, vote counts, who voted for what)
- Lists voters with their display names (fetched from profiles)
- Triggered by: clicking the "Hooked" badge OR clicking the vote count text

### Technical Details

**File: `src/components/hookfit/InlineBattle.tsx`**
- Progress bar: wrap the colored fill in a conditional `{!isMuted && <div ... />}`
- Mask overlay: add `{!tappedSides.has("a") && <div className="absolute inset-0 bg-black/30 pointer-events-none" />}` inside each canvas panel (same for B)
- "Tap to unmute" overlay: add a positioned text element inside Hook A's panel, shown only when `tappedSides.size === 0`

**File: `src/components/hookfit/HookFitPostCard.tsx`**
- Replace "Tap a side to play" with "WHICH HOOK FITS? -- FMLY DECIDES"
- Keep "I'm Hooked on [label]" button as-is
- After voting, show "Hooked" label + "You + {totalVotes - 1} FMLY" badge
- Add "Hooked" badge overlay inside InlineBattle area (top-left, absolute positioned) when `hasVoted`
- Add state for Sheet open/close
- Add a new `HookFitVotesSheet` component import

**File: `src/components/hookfit/HookFitVotesSheet.tsx` (NEW)**
- New component following the `HookReviewsSheet` pattern
- Props: `battleId`, `hookA`, `hookB`, `voteCountA`, `voteCountB`, `votedHookId`, `onClose`
- Fetches votes from `hook_votes` table, joins with `profiles` for display names
- Shows battle header with hook labels and vote counts
- Lists individual voters grouped by which hook they voted for
- Uses `Sheet` / `SheetContent` from `@/components/ui/sheet`

**File: `src/components/hookfit/InlineBattle.tsx` (BattleState update)**
- No new fields needed -- existing `BattleState` already has everything the post card needs

