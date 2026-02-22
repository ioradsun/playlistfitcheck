


## HookFit Card UX Overhaul — IMPLEMENTED

### Overview
Redesigned the HookFit card interaction flow to be clearer, more intentional, and reuse proven patterns from CrowdFit (side panel for comments/reviews).

### Changes Completed

1. ✅ Progress bar only shows when audio is playing (`!isMuted`)
2. ✅ Both canvases get dim mask overlay (`bg-black/30`), disappears on tap
3. ✅ "Tap to unmute" instruction on left video (top) before first interaction
4. ✅ Bottom instruction: "WHICH HOOK FITS? — FMLY DECIDES" → "I'm Hooked on [label]" → "Hooked · You + N FMLY"
5. ✅ "Hooked" badge on player (top-left of active canvas) after voting, opens side panel
6. ✅ Side panel (`HookFitVotesSheet`) for vote details with voter list grouped by hook
