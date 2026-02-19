## Three Changes Across Two Files

### Files to edit

- `src/components/songfit/HookReview.tsx` — feed card results display
- `src/components/songfit/HookReviewsSheet.tsx` — review panel header + per-row badges

---

### Change 1 — Feed card: "done" results block (`HookReview.tsx`)

Replace the current single-line pill (↺ 75% replay · 2 reviews) with a two-line typographic block:

- **Line 1 — Replay Signal:** `Replay Signal: 75%` in small, weight-medium type.
- **Line 2 — Affirmative Sentiment:**
  - **Majority (≥ 50%):** `75% of the FMLY would run it back.`
  - **Minority (< 50%):** `25% are feeling this.`
- **Signal Count:** The `{N} signals` count replaces "N reviews." If the user is the owner, the signal count remains clickable to open the Sheet.
- **Styling:** No pill, no icons, no color coding—pure typography.

**Example output:**

> Replay Signal: 75%
>
> 75% of the FMLY would run it back. • 2 signals

---

### Change 2 — Per-row vote badge in the Sheet (`HookReviewsSheet.tsx`)

Replace the current colored pills (↺ Replay / →| Skip) with a minimal, neutral text pill:

- **Labels:** `Would replay` or `Would skip`
- **Styling:** `text-[10px] border border-border/30 rounded-full px-2 py-0.5 text-muted-foreground/60`
- **Cleanup:** Remove all conditional color classes (primary/muted backgrounds) and icon spans. The intent is a light, neutral border tag that feels like a footnote.

---

### Change 3 — Panel header: "reviews" → "signals" + "Replay Signal" (`HookReviewsSheet.tsx`)

- **Count label:** Change `{rows.length} review(s)` → `{rows.length} signal(s)`
- **Stat display:** Replace the current `↺ 75% replay` pill with plain text: `Replay Signal: 75%`.
- **Styling:** Align with the feed card—no icon, no background, using the existing small mono/muted style.

---

### Technical notes

- **Data:** No schema changes. `would_replay` boolean is the source of truth.
- **Logic:** `replayPct` calculation remains as is; only the string templates and CSS classes are updated.
- **Cleanup:** Remove unused constants `RATING_LABEL`, `RATING_ICON`, `RATING_COLOR`, and `RATING_BG` from `HookReviewsSheet.tsx` to ensure the codebase remains lean and purposeful.