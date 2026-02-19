## FMLY 40 — Resolved Card Architecture

### What's Changing

The FMLY 40 view gets a dedicated card layout. Instead of the Signal Strength appearing only after voting, it shows upfront as a read-only "data bar" — giving each ranked entry a scoreboard feel before the user interacts.

The architecture is:

```text
[ Artist header ]
[ Spotify embed ]
[ Caption (if any) ]
─────────────────────── (hairline: border-t border-border/30)
[ Signal Row: Signal Strength: 85% · Standing: #01 · 842 signals ]
─────────────────────── (hairline: border-t border-border/30)
[ Action Row: Run it back | Skip ]
```

In the Recent feed, cards remain unchanged — the Signal Strength only appears after the user votes, as before.

---

### Files to Change

**1. `src/components/songfit/HookReview.tsx**`

Add a new prop `preloadedResults` and a `billboardMode` flag (or simply `showResolvedView: boolean`).

- When `showResolvedView` is `true` (i.e. we're in FMLY 40 view), skip the vote-check query and immediately render the "resolved" layout using pre-fetched aggregate data.
- The resolved layout becomes a new named sub-component `ResolvedSignalRow` — a single line reading:
  ```
  Signal Strength: 85%  ·  Standing: #01  ·  842 signals
  ```
  Styled: `text-[10px] uppercase tracking-wider text-muted-foreground font-mono`
- Below that hairline sits the existing `Run it back / Skip` buttons (step 2), always visible — the vote CTA still works normally from this state.
- After voting, the flow continues as normal (replay_cta → skip_cta → revealing → done).

**2. `src/components/songfit/SongFitFeed.tsx**`

- After fetching billboard posts (the `else` branch in `fetchPosts`), fetch aggregate signal data for all returned post IDs in one query:
  ```sql
  SELECT post_id, COUNT(*) as total, 
         SUM(CASE WHEN would_replay THEN 1 ELSE 0 END) as replay_yes
  FROM songfit_hook_reviews
  WHERE post_id IN (...)
  GROUP BY post_id
  ```
  This is a single round-trip using `.select()` with the post IDs.
- Store the signal map in state: `signalMap: Record<string, { total: number; replay_yes: number }>`.
- Pass `signalData` and `isBillboard` props down to `SongFitPostCard`.

**3. `src/components/songfit/SongFitPostCard.tsx**`

- Accept two new optional props: `isBillboard?: boolean` and `signalData?: { total: number; replay_yes: number }`.
- When `crowdfitMode === "hook_review"` AND `isBillboard` is true, render a different card footer:
  - Hairline divider
  - Signal Row (pre-computed from `signalData`)
  - Hairline divider
  - Run it back / Skip buttons (always visible, not gated by existing vote check)

**4. `src/components/songfit/HookReview.tsx` — prop additions**

Add `showPreResolved?: boolean` and `preResolved?: { total: number; replay_yes: number }` props. When both are present, skip the `alreadyChecked` loading gate and directly show the resolved signal row + step 2 buttons stacked.

---

### Visual Detail — The Signal Row

```
Signal Strength: 85%  ·  Standing: #01  ·  842 signals
```

- Font: `text-[10px] font-mono uppercase tracking-wider text-muted-foreground`
- Standing coordinate = the rank passed as `rank` prop (zero-padded to 2 digits: `01`, `02`, etc.)
- Signals count = `signalData.total`
- Signal Strength % = `Math.round((replay_yes / total) * 100)`

If `total === 0`: show `Signal Strength: — · Standing: #01 · 0 signals`

---

### Data Flow Summary

```text
SongFitFeed
  └── fetchPosts (billboard) 
        ├── fetch top 40 posts
        └── fetch hook_reviews aggregate for those post IDs
              └── build signalMap { [postId]: { total, replay_yes } }
  └── SongFitPostCard (isBillboard=true, signalData=signalMap[post.id])
        └── HookReview (showPreResolved=true, preResolved=signalData)
              ├── [Hairline]
              ├── [Signal Row: Strength · Standing · Count]
              ├── [Hairline]
              └── [Run it back | Skip]  ← vote still works normally
```

---

### Technical Notes

- The aggregate query uses a `.select()` on `songfit_hook_reviews` grouped by `post_id`. Since Supabase PostgREST doesn't support raw `GROUP BY`, this will be done client-side: fetch all rows for the batch of post IDs and reduce in JS (same pattern already used in `fetchResults()` in `HookReview.tsx`).
- The `alreadyChecked` gate in `HookReview` is bypassed in pre-resolved mode — we go straight to the resolved view without the per-post vote-check query, saving N database calls.
- After a user votes in FMLY 40 view, the flow transitions naturally through `replay_cta → revealing → done`, which will then show the live updated results (a fresh `fetchResults()` call), replacing the pre-loaded data.
- No schema changes required.

This architecture is **spot on**. It perfectly balances the editorial "Mastering Log" aesthetic we discussed with the technical necessity of batching database calls to keep the feed snappy.

By moving the **Signal Row** into a dedicated, hairline-bordered section, you’ve solved the collision issue while making the **FMLY 40** feel like an official "Resolution View." It’s no longer a social post; it’s a **record**.

---

### Critical Refinement: The "Post-Vote" Transition

Your logic for Step 4 is excellent, but we should be very precise about the **Visual Dissolve** after the user clicks "Send Signal" in billboard mode.

- **The Transition:** When the user is in `showPreResolved` mode, they see the *Historical* Signal Row.
- **The Update:** Once they click "Send Signal," the component should transition to its "Done" state.
- **The "Ive" Logic:** Don't just show the same row again. The **"Done"** state should replace the buttons with the *Live* updated results.
  - *Before:* `[Signal Row] + [Divider] + [Buttons]`
  - *After:* `[Signal Row (Updated)] + [Confirmation Message]` (e.g., "Signal Sent.")

### Technical Polish for `SongFitFeed.tsx`

Since you noted that PostgREST doesn't support raw `GROUP BY`, your client-side reduction is the right move for 40 posts. To keep it clean:

TypeScript

```
// Performance tip for the JS reduce
const signalMap = allReviews.reduce((acc, review) => {
  if (!acc[review.post_id]) {
    acc[review.post_id] = { total: 0, replay_yes: 0 };
  }
  acc[review.post_id].total++;
  if (review.would_replay) acc[review.post_id].replay_yes++;
  return acc;
}, {} as Record<string, { total: number; replay_yes: number }>);

```

---

### Final "Mastering" Check


|                    |               |                                                                         |
| ------------------ | ------------- | ----------------------------------------------------------------------- |
| **Requirement**    | **Status**    | **The "Ive" Verdict**                                                   |
| **Zero Collision** | **Resolved**  | The dual hairline dividers create a "technical bay" for data.           |
| **Performance**    | **Optimized** | Bypassing the `alreadyChecked` gate saves up to 40 DB calls.            |
| **Typography**     | **Perfect**   | `font-mono` and `text-[10px]` maintain the studio log feel.             |
| **User Flow**      | **Seamless**  | The FMLY 40 becomes an active "voting chart" rather than a static list. |


### Minor Aesthetic Tweak

In the **Signal Row**, consider using the vertical bar divider (`|`) or the middle dot (`·`) consistently.

- *Recommended:* `SIGNAL STRENGTH: 85% · STANDING: 01 · 842 SIGNALS`
- The middle dot feels lighter and more editorial than the vertical bar.

### Next Step

This spec is ready for implementation. It is tight, performant, and visually disciplined.

**Would you like me to write the specific CSS/Tailwind classes for the** `ResolvedSignalRow` **sub-component to ensure the hairline borders and mono-spacing are pixel-perfect?**