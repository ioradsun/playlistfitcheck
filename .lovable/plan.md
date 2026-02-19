
## CrowdFit Hook Review — Feature Plan

### Overview

This adds a **"Hook Review" interaction mode** to CrowdFit posts, toggled on/off from the Admin Tools panel. When enabled, the standard 🔥 / comment / share action bar is replaced by a frictionless 2-tap structured review panel inline under each Spotify embed.

---

### What Gets Built

**1. Admin Toggle (ToolsEditor.tsx)**

A new section in the Admin → Tools panel:

```text
┌─────────────────────────────────────────────┐
│ 🎯  CrowdFit Mode                           │
├─────────────────────────────────────────────┤
│  Standard reactions (🔥, 💬, share)  ●  ○  │
│  Hook Review (structured 2-tap panel)  ○  ●  │
└─────────────────────────────────────────────┘
```

This writes `features.crowdfit_mode: "reactions" | "hook_review"` to `site_copy` in the database, the same pattern already used for `crypto_tipping` and `growth_flow`.

**2. New Component: `HookReview.tsx`**

A self-contained inline panel rendered directly under the Spotify embed, replacing the action bar when `crowdfit_mode === "hook_review"`. Stores state in a new `songfit_hook_reviews` database table.

Layout (single-screen, no modals):

```text
──────────────────────────────────────────
  Did the hook land?
  [ Missed ]  [ Almost ]  [ Solid ]  [ Hit ]
──────────────────────────────────────────
  Would you replay this?
  [   🔁 Yes   ]        [   ⏭ No   ]
──────────────────────────────────────────
  ▸ Add context (optional)
──────────────────────────────────────────
  "Your reaction was recorded."   ✓
──────────────────────────────────────────
```

**3. Database Migration**

New table `songfit_hook_reviews`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `post_id` | uuid | FK to songfit_posts |
| `user_id` | uuid | nullable (guest reviews allowed) |
| `session_id` | text | for guest dedup |
| `hook_rating` | text | `missed`, `almost`, `solid`, `hit` |
| `would_replay` | boolean | true = yes, false = no |
| `context_note` | text | nullable, optional |
| `created_at` | timestamptz | |

RLS policies:
- SELECT: public (aggregates visible)
- INSERT: authenticated users only with `auth.uid() = user_id`, or guest with `user_id IS NULL AND session_id IS NOT NULL`
- No UPDATE or DELETE

**4. SongFitPostCard.tsx — Conditional Rendering**

The post card will read `crowdfit_mode` from `useSiteCopy()`. When it equals `"hook_review"`:
- Hide the existing action bar (🔥, 💬, Share, Bookmark)
- Render `<HookReview postId={post.id} />` beneath the embed

When in standard mode, behavior is unchanged.

**5. SiteCopy Interface Update**

Add `crowdfit_mode?: "reactions" | "hook_review"` to the `features` object in `useSiteCopy.tsx` and the `DEFAULT_COPY`.

---

### Interaction Design

**Hook Rating** — 4 pill buttons, single select, required:
- `Missed` · `Almost` · `Solid` · `Hit`
- Selected state: filled background with primary color
- Cultural framing, no numbers

**Replay Intent** — 2 wide buttons, single select, required:
- `🔁 Yes` · `⏭ No`
- Equal weight, clear visual confirmation

**Context Field** — collapsed by default, one chevron tap expands:
- Single textarea, placeholder: *"What made you choose that?"*
- No character minimum, no validation blocking submit

**Completion State:**
- After both required fields selected, auto-submit triggers (no separate submit button needed — submits when 2nd required selection is made)
- Shows: `"Your reaction was recorded."` with a subtle checkmark
- Shows progress: `1 of N reviews complete` (count from local session)
- No animations, no modals

**Deduplication**: One review per `user_id` + `post_id` (or `session_id` + `post_id` for guests). If already reviewed, show the completed state immediately on mount.

---

### Files to Create/Modify

| File | Change |
|---|---|
| `src/components/songfit/HookReview.tsx` | **New** — the full review panel component |
| `src/components/songfit/SongFitPostCard.tsx` | Conditional render: action bar vs. HookReview |
| `src/components/admin/ToolsEditor.tsx` | Add CrowdFit Mode toggle section |
| `src/hooks/useSiteCopy.tsx` | Add `crowdfit_mode` to `features` type + default |
| Database migration | Create `songfit_hook_reviews` table with RLS |

---

### Technical Notes

- The `HookReview` component manages its own local state for the two selections and context text.
- Auto-submit fires when `hook_rating` AND `would_replay` are both set, inserting a row into `songfit_hook_reviews`.
- The session-review count (for "1 of N reviews") is tracked in component state using a simple `sessionStorage` counter key `crowdfit_reviews_this_session`.
- The existing 🔥 like system, comments, saves, and share remain in the database and are simply hidden from the UI in Hook Review mode — no data is lost, the mode can be toggled back.
