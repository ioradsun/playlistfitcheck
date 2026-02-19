
## Collapse to a Single-Step Review UI

### What's Changing

Right now the flow is:
1. Step 2 — Pick "Run it back" or "Skip" → advances to Step 3
2. Step 3 — Optional comment textarea + Submit button

The request is to **combine these into one step**: show the replay buttons, the optional comment textarea, and the Submit button all at once. Picking a replay option no longer auto-advances; the user fills in an optional comment and hits Submit whenever ready.

---

### Implementation Plan

**File: `src/components/songfit/HookReview.tsx`**

1. **Remove Step 3** — delete the separate Step 3 render block entirely.

2. **Merge into Step 2** — update the Step 2 block to include:
   - The "Would you replay this?" prompt + the two replay buttons (unchanged styling, but clicking them now only sets `wouldReplay` state instead of also calling `setStep(3)`)
   - Below the buttons: the comment `<textarea>` (same placeholder, same Enter-to-submit key handler)
   - Below the textarea: the "Shift+Enter for new line" hint on the left and the **Submit** button on the right

3. **Submit button behavior** — Submit remains disabled-looking (muted) until a replay option is selected (`wouldReplay !== null`), then becomes active. This prevents accidental empty submissions.

4. **Type cleanup** — Remove `3` from the `Step` type union (becomes `1 | 2 | "revealing" | "done"`) since Step 3 no longer exists as a distinct state.

5. **Remove the `useEffect` that focused the textarea on Step 3** — no longer needed since the textarea is always visible in Step 2.

---

### Visual Layout (Step 2 — combined)

```text
Would you replay this?
[ ↺ Run it back ]  [ →| Skip ]

┌─────────────────────────────────────┐
│ What made you choose that? (optional)│
└─────────────────────────────────────┘
Shift+Enter for new line          [Submit]
```

Submit is visually muted until a replay button is selected, then brightens to indicate it's ready.

---

### No Database or Backend Changes

The same `handleSubmit` function is used unchanged — it already accepts `wouldReplay` from state. No schema changes needed.
