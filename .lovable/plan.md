
## Stage Presence — Master Refinement

Four files, four focused changes. No new components needed.

---

### 1. `StagePresence.tsx` — Full Rewrite of the Gate Logic

**Remove:** The numeric mono counter (`Signal Progress: N/3`).

**Add:** Dynamic narrative copy that counts down based on `currentVotes`:

| currentVotes | Copy |
|---|---|
| 0 | "Give 3 signals to drop your song" |
| 1 | "Give 2 more signals to drop your song" |
| 2 | "Give 1 more signal to drop your song" |
| 3 (threshold) | "The stage is yours." |

**Transition:** When `currentVotes >= 3`, the text changes to "The stage is yours." — hold for exactly **1000ms** — then call `onUnlocked()`. The container fades out with `transition-opacity duration-300`.

**Progress bars:** Already correct (3 horizontal bars, `bg-primary/60` filled, `bg-border/30` empty). Keep exactly as-is — just remove the numeric counter above them.

**Copy hierarchy:** Use `text-[12px] font-medium text-foreground/60` for gate copy, `text-[13px] font-medium text-foreground/70` for "The stage is yours." to give it slightly more weight.

---

### 2. `SongFitFeed.tsx` — Circular Economy + Floating Anchor

**A. Re-lock on post:** Add a listener for `crowdfit:post-created` window event. When fired:
- `setComposerUnlocked(false)`
- `setUserVoteCount(0)`

This resets the gate so the artist must give 3 more signals before their next drop.

**B. Floating "Drop Your Song" anchor:** Add state `showFloatingAnchor` (boolean). Add a `useEffect` that listens to `scroll` on `window`. Logic:
- Only active when `composerUnlocked === true`
- If `window.scrollY > 600` → `setShowFloatingAnchor(true)`
- If `window.scrollY <= 600` → `setShowFloatingAnchor(false)`

Render a fixed-position button at the bottom-center of viewport:

```
[ + Drop Your Song ]
```

Style: `fixed bottom-6 left-1/2 -translate-x-1/2 z-50` — minimal: `border border-border/40 bg-background text-[12px] font-medium px-4 py-2 rounded-full` — no color fill, no icons beyond the `+`. Clicking it: `window.scrollTo({ top: 0, behavior: "smooth" })`.

Clean up the scroll listener on unmount.

---

### 3. `SongFitInlineComposer.tsx` — Two changes

**A. Rename "Post" → "Drop":** Line 357 — change button label from `"Post"` to `"Drop"`.

**B. Dispatch `crowdfit:post-created` event:** After a successful submission (both new submission and re-entry paths), before or alongside the existing `onPostCreated()` call, dispatch:
```ts
window.dispatchEvent(new CustomEvent("crowdfit:post-created"));
```
There are two success paths — the re-entry path (around line 224) and the new submission path (around line 258). Both need the dispatch added.

---

### 4. `HookReview.tsx` — No changes needed

The `crowdfit:vote` event dispatch is already in place at line 117. This file is complete.

---

### Summary of Edits

| File | Change |
|---|---|
| `StagePresence.tsx` | Remove numeric counter. Dynamic narrative copy (0/1/2/3 remaining). "The stage is yours." hold for 1000ms before `onUnlocked()`. |
| `SongFitFeed.tsx` | Listen for `crowdfit:post-created` → re-lock composer and reset vote count. Add scroll-based floating "Drop Your Song" anchor button when composer is unlocked and scrollY > 600px. |
| `SongFitInlineComposer.tsx` | Change "Post" → "Drop". Dispatch `crowdfit:post-created` on both success paths. |
| `HookReview.tsx` | No changes. Already correct. |
