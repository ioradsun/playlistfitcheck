

# HookReviewsSheet Redesign

## Summary
Redesign the reaction panel sheet with 5 fixes: add vote controls, flatten score display, remove caption instructional label, convert Follow/Save to text links, remove Heart likes from review rows.

## Changes

### `src/components/songfit/HookReviewsSheet.tsx` — Full header + row redesign

**Props**: Add `onVoteChange?: (vote: boolean | null) => void` to interface (lines 46-52).

**Imports**: Remove `Heart`, `ChevronDown`, `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`. Keep `User`, `Music`, `Send`, `Loader2`.

**Interfaces**: Remove `likes` and `liked` fields from both `ReviewRow` (lines 22-36) and `Reply` (lines 12-20).

**State**: Add `localVote` (synced from rows on load — find user's existing review), `voteLoading`. Remove `likes`/`liked` defaults from row mapping (lines 169-177) and reply mapping (lines 158-166).

**Delete callbacks**: `toggleLike` (lines 189-195), `toggleReplyLike` (lines 197-210).

**Add `handleVoteChange`**: Delete+re-insert pattern on `songfit_hook_reviews`, toggle off if same vote, dispatch `crowdfit:vote` event, call `onVoteChange`.

**Auto-detect existing vote on load**: After rows are set, check if `user.id` matches any row's `user_id` to set `localVote`.

**Replace header** (lines 264-382) with the redesigned block from the prompt:
- Song identity row with album art, track title, artist name
- Follow/Save as plain `text-[11px] font-mono` links (no pill borders) in the identity row
- Caption: simple `line-clamp-1` button, no `ChevronDown`, no "Tap to expand" label
- Score: flat typographic row (`font-mono text-[11px]`) — no `rounded-2xl border bg-card` box, no `text-2xl`
- Vote controls: two buttons ("Run it back" / "Skip") with `✓` prefix when active, separated by thin vertical divider

**Review rows** (lines 394-557):
- Remove Heart button from top-level reviews (lines 454-466)
- Remove Heart button from reply rows (lines 501-512)
- Remove `{row.likes > 0 && ...}` from meta row (lines 430-433)
- Replace badge `<span>` (lines 416-418) with flat typography: `"replay"` or `"skip"` in muted mono, no border/pill

### `src/components/songfit/SongFitPostCard.tsx` — Wire `onVoteChange`

Add `onVoteChange` prop to `<HookReviewsSheet>` (line 605-611):
```
onVoteChange={() => setHookReviewKey(k => k + 1)}
```
This re-triggers the card's `HookReview` to re-check its existing vote state via `checkExisting`.

## Technical Notes

- `localVote` is derived from rows on load (check `rows.find(r => r.user_id === user?.id)?.would_replay`) rather than passed as a prop, keeping the sheet self-contained
- Vote change uses delete-then-insert to avoid needing an UPDATE RLS policy on `songfit_hook_reviews`
- `onVoteChange` callback on the card increments `hookReviewKey` which causes `HookReview` to re-run its `checkExisting` effect
- The `crowdfit:vote` custom event is already listened to elsewhere for cross-component sync

