## Pull interactive controls out of the video into the card area

The idea: the canvas + playbar is a pure visual/audio experience with zero overlays. All interactive elements (vote button, "HOOKED" badge, vote counts, caption) live in the normal card area below, using the page's theme background instead of the dark video background.

### What changes

**1. `InlineBattle.tsx` — Strip all interactive UI**

&nbsp;

- Remove the vote button and "Hooked" status from the playbar controls row (lines 354-391)
- Keep only: the two canvases, the half-width progress bar, the 
- "Tap each side to play" comes out of canvas to the white area.. and when user clicks vide its replaced by "I'M HOOKED BUTTON"
- The playbar becomes a minimal progress-only strip with the hook label
- Expose `handleVote` via the lifted `BattleState` (add it to the callback or return it as a separate prop)

**2. `HookFitPostCard.tsx` — Add controls in the card's white area**

- Below the `<InlineBattle />` component, add a new action row in the normal card background:
  - **"I'm Hooked on [Hook]"** button — appears once the user has tapped one side... its going to be the same style we use in crowdfit...(follow crowd fit styling"
  - **"HOOKED" status** with vote count — shown after voting
- The caption already renders in this area, so it stays as-is
- The vote logic needs to be callable from this component — we'll pass `handleVote` up from `InlineBattle` via an `onVote` callback prop

### Architecture

```
+---------------------------+
|  Avatar / Name / Time     |  <-- card bg (existing)
+---------------------------+
|                           |
|   [Canvas A] [Canvas B]   |  <-- dark bg, pure visual
|                           |
|  ---- progress bar ----   |  <-- dark bg, minimal
|  hook label only          |
+---------------------------+
|  [I'm Hooked on Hook A]   |  <-- card bg (NEW)
|  or "Hooked - 12 votes"   |
+---------------------------+
|  Caption text             |  <-- card bg (existing)
+---------------------------+
```

### Technical details

- Add `onVote?: (hookId: string) => void` to `InlineBattle` props, or simpler: just lift `handleVote` into the `BattleState` object so `HookFitPostCard` can call it directly
- `BattleState` gets a new field: `handleVote: (hookId: string) => void` and `accentColor: string`
- `InlineBattle` keeps the playbar's progress track and the tiny label ("Tap each side to hear" / active hook name) — no buttons
- `HookFitPostCard` renders the vote button using `battleState.canVote`, `battleState.activeHookSide`, etc.
- The vote button uses standard card padding (`px-3 py-2`) so it sits naturally in the feed