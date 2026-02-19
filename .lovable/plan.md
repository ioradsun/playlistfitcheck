
## Stage Presence — Vote Gate for Song Submission

### What We're Building

Before a logged-in user can submit their own song, they must first give 3 signals (votes) on other songs. The composer is replaced by a "ghost" Stage Presence component that tracks their vote count and dissolves into the full composer once the threshold is met.

---

### Data Source

The vote count comes from `songfit_hook_reviews` — filtered to the current user's `user_id`. This is the authoritative count (not just sessionStorage, which resets). We query it once on mount and increment it locally each time a vote is cast.

---

### Files to Create / Modify

**1. New component: `src/components/songfit/StagePresence.tsx`**

The "ghost" gate UI. It:
- Accepts `currentVotes` (number, 0–3) and `onUnlocked` (callback)
- Shows the dashed-border container with the mono-type `Signal Progress: N/3` counter in the top-right
- Shows the centered copy: `"Give 3 signals to drop your own."`
- Shows the 3-bar progress indicator — bars fill left to right as votes accumulate (`bg-primary/60` filled, `bg-border/30` empty)
- When `currentVotes >= 3`, calls `onUnlocked()` which triggers the fade-in transition into the composer

```text
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐          Signal Progress: 1/3
│                                          │
│     Give 3 signals to drop your own.     │
│          ▬ ▬ ─ ─ ─ ─ ─ ─               │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

Transition: when `currentVotes` hits 3, the component animates out (`opacity-0`) and `onUnlocked()` is fired after the CSS transition (300ms). The composer fades in using the existing `animate-fade-in` class.

---

**2. Modify: `src/components/songfit/SongFitFeed.tsx`**

Replace the direct `<SongFitInlineComposer>` render for logged-in users with a container that:
- On mount (when `user` is defined), fetches the count of rows in `songfit_hook_reviews` where `user_id = user.id`
- Stores this in `userVoteCount` state
- If `userVoteCount < 3` → renders `<StagePresence currentVotes={userVoteCount} onUnlocked={() => setUserVoteCount(3)} />`
- If `userVoteCount >= 3` → renders `<SongFitInlineComposer>` with a `animate-fade-in` wrapper

When `HookReview` fires `incrementSessionReviewCount`, we need the feed to know a vote was cast. The cleanest way: pass an `onVoteCast` callback down through the post card chain OR use a lightweight event. Given the architecture, the best approach is to **re-query the vote count from the DB** whenever the feed refreshes (which happens naturally after `onPostCreated`), and to additionally expose a `window` custom event `"crowdfit:vote"` that `SongFitFeed` listens to and uses to bump `userVoteCount` by 1.

This avoids prop-drilling through `SongFitPostCard → HookReview`.

---

**3. Modify: `src/components/songfit/HookReview.tsx`**

After `incrementSessionReviewCount()` is called in `handleSubmit`, also dispatch:
```ts
window.dispatchEvent(new CustomEvent("crowdfit:vote"));
```

This fires once per successful vote submission and is caught by the feed.

---

### Technical Flow

```text
User loads CrowdFit feed (logged in)
  → SongFitFeed queries songfit_hook_reviews for user's vote count
  → userVoteCount = 1 → StagePresence rendered (1/3 bars filled)

User clicks "Run it back" on a post
  → HookReview.handleSubmit inserts row, calls incrementSessionReviewCount()
  → dispatches window event "crowdfit:vote"
  → SongFitFeed listener: setUserVoteCount(prev => prev + 1)
  → If count reaches 3 → StagePresence fades out, composer fades in

User with ≥ 3 prior votes
  → Fetch returns count ≥ 3 immediately
  → Composer rendered directly, no gate shown
```

---

### Edge Cases

- **Already has votes from previous sessions**: DB query picks this up — users who have already given 3+ votes across any session see the composer immediately.
- **User owns the post they're voting on**: The `HookReview` component doesn't prevent self-voting. The gate doesn't need to distinguish — any 3 votes unlock the composer.
- **Votes already cast before this feature ships**: Existing `songfit_hook_reviews` rows with a `user_id` are counted — no data migration needed.
- **Loading state**: While the vote count is being fetched, show a neutral placeholder (empty dashed box, no bars, no counter) to avoid layout shift.

---

### What Stays the Same

- The `HookReview` voting UI itself is unchanged
- No new database tables or migrations needed
- The `SESSION_COUNT_KEY` sessionStorage key continues to work as-is alongside the new gate

---

### Summary of Changes

| File | Change |
|---|---|
| `src/components/songfit/StagePresence.tsx` | New component — the ghost gate UI |
| `src/components/songfit/SongFitFeed.tsx` | Fetch user vote count on mount, conditionally render gate vs composer, listen for `crowdfit:vote` event |
| `src/components/songfit/HookReview.tsx` | Dispatch `crowdfit:vote` custom event after successful vote submission |
