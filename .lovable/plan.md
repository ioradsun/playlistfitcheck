## DreamFit Signal Bar — Replacing the 🔥 Back Button with a CrowdFit-Style Vote Flow

### What's Changing

The current DreamFit card has a minimal action row with a comment button and a 🔥 "back" toggle. This gets replaced with a proper **Demand Signal** system that mirrors CrowdFit's HookReview interaction pattern — two action buttons (Greenlight / Shelve) that expand into a feedback module with a comment prompt and a final "Submit Signal" button.

### Interaction Flow

```text
INITIAL STATE (not yet voted):
─────────────────────── (border-t border-border/30)
[ Demand Strength: 72% · 14 signals ]
─────────────────────── (border-t border-border/30)
[ Greenlight ]  [ Shelve ]

AFTER CLICKING GREENLIGHT:
[ Why does the FMLY need this? (optional textarea) ]  [ ✕ cancel ]
[ character counter (Geist Mono, bottom-right)     ]  [ SUBMIT SIGNAL ]

AFTER CLICKING SHELVE:
[ Why does the FMLY need this? (optional textarea) ]  [ ✕ cancel ]
[ character counter (Geist Mono, bottom-right)     ]  [ SUBMIT SIGNAL ]

DONE STATE (after submitting):
[ Demand Strength: 72% · 14 signals ]
[ 72% of the FMLY greenlighted this. ]
```

The `SUBMIT SIGNAL` button text appears once the user starts typing (before that it reads `Send Signal`). The textarea is non-mandatory — users can click `Send Signal` / `Submit Signal` without typing anything.

---

### Database Changes Required

The `dream_backers` table currently only stores `dream_id + user_id` (a simple toggle). We need to extend it to track:

- `signal_type`: `"greenlight"` or `"shelve"` (replaces the binary backed/not-backed model)
- `context_note`: optional text comment from the voter
- `session_id`: for anonymous voting (matching CrowdFit's pattern)
- Make `user_id` nullable to support anonymous voters

We also need a `greenlight_count` column on `dream_tools` (alongside the existing `backers_count`) so Demand Strength can be computed as `greenlight_count / backers_count`.

Migration SQL:

```sql
-- Add signal_type and context_note to dream_backers
ALTER TABLE public.dream_backers
  ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'greenlight'
    CHECK (signal_type IN ('greenlight', 'shelve')),
  ADD COLUMN context_note TEXT,
  ADD COLUMN session_id TEXT;

-- Make user_id nullable for anonymous signals
ALTER TABLE public.dream_backers ALTER COLUMN user_id DROP NOT NULL;

-- Add greenlight_count to dream_tools
ALTER TABLE public.dream_tools ADD COLUMN greenlight_count INTEGER NOT NULL DEFAULT 0;

-- Backfill: assume all existing backers are greenlights
UPDATE public.dream_tools dt
SET greenlight_count = (
  SELECT COUNT(*) FROM dream_backers db WHERE db.dream_id = dt.id
);
```

---

### Files to Create / Modify

**1. New component: `src/components/dreamfit/DreamSignal.tsx**`

A self-contained component mirroring `HookReview.tsx` but for DreamFit. It handles:

- Checking if the current user/session has already voted (query `dream_backers` on mount)
- Rendering the Demand Strength row (always visible, pre-vote and post-vote)
- Rendering the Greenlight / Shelve buttons (pre-vote)
- Rendering the feedback textarea + Send Signal / Submit Signal button (post-button-click)
- Submitting the insert to `dream_backers` and dispatching a refresh event

Key state machine:

```
idle → greenlit | shelved → done
```

Demand Strength formula:

```
Math.round((greenlight_count / backers_count) * 100)
```

Where `greenlight_count` and `backers_count` come from `dream_tools` row (passed as props, refreshed after vote).

**2. Modified: `src/components/dreamfit/DreamToolCard.tsx**`

- Remove the current `<div className="flex items-center px-1 pt-1 pb-1">` action row (🔥 button + comment icon).
- Keep the comment button (it opens the comments sheet — this stays).
- Add `<DreamSignal>` below the content block, passing `dream.id`, `dream.backers_count`, `dream.greenlight_count`, and `onRefresh`.
- The comment button moves to a small secondary row above the signal bar, or stays as a ghost icon in the header area.

**3. Modified: `src/components/dreamfit/types.ts**`

Add `greenlight_count: number` to the `Dream` interface.

**4. Modified: `src/components/dreamfit/DreamFitTab.tsx**`

The feed query already selects `*` from `dream_tools` — no query change needed. The `greenlight_count` column will be included automatically once the migration runs.

---

### Visual Detail — The Signal Bar

```
─────────────────────── border-t border-border/30
Demand Strength: 72% · 14 signals
─────────────────────── border-t border-border/30
[ Greenlight ]   [ Shelve ]
```

Signal row typography: `text-[10px] font-mono uppercase tracking-wider text-muted-foreground`

Button styling (matching HookReview exactly):

```
flex-1 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent
hover:border-foreground/15 hover:bg-foreground/[0.03]
text-[12px] font-medium text-muted-foreground
```

Feedback textarea after vote:

```
placeholder="Why does the FMLY need this?"
className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none"
```

Character counter (Geist Mono, bottom-right):

```
<span className="font-mono text-[10px] text-muted-foreground/40">{contextNote.length}/280</span>
```

Submit button — text changes dynamically:

- Default (no text entered): `Send Signal`
- Once user starts typing: `Submit Signal`
- Both: `shrink-0 text-[11px] font-medium bg-foreground text-background px-3 py-1.5 rounded-md`

Done state:

```
Demand Strength: 72%
72% of the FMLY greenlighted this.   ← if greenlight_count >= 50%
Only 28% greenlighted this.           ← if greenlight_count < 50%
```

---

### Anonymous Voting

Matching the CrowdFit pattern: import `getSessionId` from `@/lib/sessionId` and use it to check for existing votes when the user is not logged in. Unauthenticated users who click Greenlight/Shelve are **not** redirected — they can signal anonymously (consistent with the "community request board" ethos of DreamFit). If they are logged in, `user_id` is stored; otherwise `session_id` is stored.

---

### No Edge Functions Needed

All logic is client-side Supabase queries — the same pattern as `dream_backers` insert/delete today.

---

### Technical Notes

- The `dream_backers` unique constraint currently prevents duplicate votes per user per dream. After making `user_id` nullable, we need to ensure uniqueness is still enforced. We'll add a partial unique index: `UNIQUE (dream_id, user_id) WHERE user_id IS NOT NULL` and `UNIQUE (dream_id, session_id) WHERE user_id IS NULL`.
- The existing 🔥 toggle logic in `DreamToolCard` (optimistic UI with `setBacked`) will be fully replaced by `DreamSignal`'s self-contained state.
- The `backers_count` column continues to count total signals (greenlight + shelve) via the existing trigger (or we add one). `greenlight_count` is maintained by a new trigger on `dream_backers`.

Before the devs start coding, ensure these three hardware-inspired details are included:

1. **The "Ghost" Separator:** Ensure the `border-t border-border/30` lines are hairline thin (0.5px). They should look like scored lines on a brushed metal surface.
2. **Cancel Logic:** The `[ ✕ cancel ]` button should be styled as a simple, low-opacity text trigger (`text-muted-foreground/40`) so it doesn't compete with the `SUBMIT SIGNAL` action.
3. **The "Done" Summary:** The post-submission summary (e.g., *"72% of the FMLY greenlighted this"*) should be rendered in **Geist Sans** but with a slightly higher opacity than the raw data to feel like a "Human Conclusion."