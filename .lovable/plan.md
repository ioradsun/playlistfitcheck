

# HookReview UX Unification — Verified Plan

Both verification points confirmed:

1. **Focus effect** — will consolidate to single `useEffect` on `step === "cta"` with `textareaRef` only. `skipTextareaRef` deleted.

2. **HookReviewsSheet props** — currently receives `postId` and `onClose`. The Follow/Save links will render conditionally (`{artistsJson?.[0]?.spotifyUrl && ...}`, `{spotifyTrackUrl && ...}`), safe for Billboard view where these may be undefined.

## Files & Changes

### 1. `src/components/songfit/HookReview.tsx`
- Step type: `2 | "cta" | "done"`
- Add prop `onOpenReactions?: () => void`
- Add state `showIdentity`, remove `skipTextareaRef`
- Single focus `useEffect` for `step === "cta"` → `textareaRef`
- Deterministic comment prompt array
- `handleVoteClick` → `setStep("cta")`
- `handleSubmit` → `setTimeout(() => setShowIdentity(true), 400)` after done
- Pre-resolved guard: check `step !== "done" && step !== "cta"`
- Replace render with 3-state layout (Decision / Response / Done)
- Remove all Follow/Save `<a>` tags

### 2. `src/components/songfit/SongFitPostCard.tsx`
- Add `onOpenReactions={() => setReviewsSheetPostId(post.id)}` to `<HookReview>`
- Pass `spotifyTrackUrl` and `artistsJson` to `<HookReviewsSheet>`

### 3. `src/components/songfit/HookReviewsSheet.tsx`
- Add optional props `spotifyTrackUrl?: string`, `artistsJson?: any[]`
- Render Follow/Save links conditionally inside the sheet

No new dependencies. Ready to implement.

