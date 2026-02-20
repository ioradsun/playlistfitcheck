
## FMLY Top 40: "Signal Velocity" Scoring System

### What's Changing and Why

The current ranking uses a generic `engagement_score` stored on the post and computed by a database trigger. This score only knows about events logged to `songfit_engagement_events` and cannot be time-windowed. The new formula requires:

1. Real-time, client-side score computation from multiple source tables
2. Time-window filtering applied to signal *creation dates* (not post submission dates)
3. A new display format: `RANK: #01 · SIGNAL: 98% · 420 SAVES`

The cleanest approach is to fetch the raw signal data in `SongFitFeed.tsx` during the billboard query, compute the Signal Velocity score in the client, and sort by it — rather than touching the database trigger or the stored `engagement_score` (which powers the non-billboard "recent" feed separately).

---

### The Formula

```
Signal Velocity = (1 × RunItBack) + (3 × Comments) + (8 × Follows) + (12 × Saves) − (2 × Skips)
```

| Signal Source | Table | Filter | Weight |
|---|---|---|---|
| Run It Back | `songfit_hook_reviews` | `would_replay = true` | +1 |
| Skip | `songfit_hook_reviews` | `would_replay = false` | −2 |
| Comment | `songfit_comments` | any | +3 |
| Follow | `songfit_follows` | `followed_user_id = post.user_id` | +8 |
| Save | `songfit_saves` | any | +12 |

Time windows are applied by filtering each table's `created_at`:
- **This Week**: `created_at >= now() - 7 days`
- **Last Week**: `created_at` between `now() - 14 days` and `now() - 7 days`
- **All Time**: no filter

---

### Files to Change

**1. `src/components/songfit/SongFitFeed.tsx`**

In the billboard branch of `fetchPosts`:
- Change the post query to order by `created_at DESC` with a broad pool (100 posts), not by `engagement_score`. The time-windowing will be done on signals, not post submission dates.
- After fetching posts, run 5 parallel signal queries (hook_reviews, comments, follows, saves) for that pool of posts, filtered by the appropriate time window's `created_at`.
- Compute a `signalVelocity` score per post in JS using the formula above.
- Sort descending by `signalVelocity`, take top 40, assign `current_rank`.
- Extend the `signalMap` to carry: `{ total, replay_yes, saves_count, signal_velocity }` so the card can display the new format.

**2. `src/components/songfit/HookReview.tsx`**

Update the `showPreResolved` display row (the scoreboard shown in billboard mode) to render the new format:

```
RANK: #01 · SIGNAL: 98% · 420 SAVES
```

- `RANK` comes from the `rank` prop (already passed in)
- `SIGNAL` is the existing `(replay_yes / total) * 100`%
- `SAVES` comes from the new `saves_count` field in `signalData`

This is the "Studio Display Logic" from the brief — signal strength percentage as the primary human-readable metric, while ranking is powered by the full velocity formula behind the scenes.

**3. `src/components/songfit/SongFitPostCard.tsx`**

Pass the `saves_count` from the enriched `signalData` down to `HookReview`. The `signalData` prop on `SongFitPostCard` already flows into `HookReview` as `preResolved`, so we just need to expand the type to include `saves_count`.

**4. `src/components/songfit/types.ts`**

No changes needed to `SongFitPost`. The enriched signal data is passed inline via props.

---

### Data Flow Diagram

```text
SongFitFeed (billboard fetch)
│
├─ Query: songfit_posts (broad pool, 100 posts)
│
├─ Parallel signal queries, time-windowed by created_at:
│   ├─ songfit_hook_reviews  → run_it_back, skip counts per post
│   ├─ songfit_comments      → comment count per post
│   ├─ songfit_follows       → follow count per post (by post owner)
│   └─ songfit_saves         → save count per post
│
├─ JS: compute Signal Velocity per post
│
├─ Sort descending, take top 40, assign ranks
│
└─ signalMap[postId] = { total, replay_yes, saves_count, signal_velocity }
        │
        ▼
SongFitPostCard → HookReview (showPreResolved)
        │
        ▼
Display: "RANK: #01 · SIGNAL: 98% · 420 SAVES"
```

---

### Key Technical Details

- **Follows are per-artist, not per-post.** The `songfit_follows` table tracks `followed_user_id`. For a post, the relevant follows are those where `followed_user_id = post.user_id`. We query follows for the set of unique `user_id`s across all billboard posts and map them back per post.
- **Time window on signals, not posts.** The `submitted_at` filter on posts is removed for the billboard query. Instead, the signal tables are filtered by `created_at`. This means a song submitted 3 weeks ago that's getting saves *this week* will rank in "This Week."
- **The stored `engagement_score` is untouched.** It still powers the "Recent" feed ordering and the non-billboard game mechanics (trophy icon, etc.). The new velocity score is computed ephemerally at query time for the billboard view only.
- **No DB migration required.** All data already exists in the correct tables. This is purely a client-side query and scoring change.
