
## "Processed" Embed Visual Effect — When a User Has Already Signaled

### What's Happening

When a user has already sent a Signal on a post (or submits one now), the Spotify/SoundCloud embed should visually dim to a "studio glass" matte finish — indicating this card is resolved from their perspective. The effect:

- **Opacity**: `0.8` (80%)
- **Filter**: `grayscale(20%) brightness(90%)` — a subtle matte behind-glass look
- **Pointer Events**: `none` — prevents re-interaction with embed controls
- **Transition**: `500ms ease` so it fades in smoothly after signal submission

The dimming only applies to the embed wrapper. The caption, action row, and HookReview panel below remain fully interactive (the user can still open comments, share, etc.).

---

### How the State Flows

The `HookReview` component already knows whether the user has reviewed a post — it checks on mount (`checkExisting`) and sets `step = "done"` if a review exists. The embed in `SongFitPostCard` is rendered *above* `HookReview` and currently has no knowledge of this state.

The fix is a thin callback: `HookReview` fires `onScored?.()` upward, `SongFitPostCard` tracks `isScored` in local state, and wraps the embed in a conditionally-dimmed `<div>`.

```
HookReview (checkExisting finds review OR handleSubmit completes)
    └─ onScored?.()
          ↓
SongFitPostCard: setIsScored(true)
          ↓
<div className="transition-all duration-500 opacity-80 [filter:grayscale(20%)_brightness(90%)] pointer-events-none">
  <LazySpotifyEmbed ... />
</div>
```

---

### Files to Change

**1. `src/components/songfit/HookReview.tsx`**

Add `onScored?: () => void` to the `Props` interface.

Fire it in two places:
- In the `checkExisting` `useEffect`, when `data` is found (user already reviewed): call `onScored?.()` before `setAlreadyChecked(true)`.
- In `handleSubmit`'s `setTimeout` callback, right after `setStep("done")`: call `onScored?.()`.

**2. `src/components/songfit/SongFitPostCard.tsx`**

- Add `const [isScored, setIsScored] = useState(false)` to the component's state block.
- Wrap the `<LazySpotifyEmbed ... />` call (lines 262–270) in a `<div>` that conditionally applies the dim classes:

```tsx
<div className={cn(
  "transition-all duration-500",
  isScored && "opacity-80 pointer-events-none [filter:grayscale(20%)_brightness(90%)]"
)}>
  <LazySpotifyEmbed ... />
</div>
```

- Pass `onScored={() => setIsScored(true)}` to the `<HookReview>` component.

No changes needed to `LazySpotifyEmbed.tsx` — the wrapper div in `SongFitPostCard` handles the visual treatment without touching the embed internals.

---

### Key Technical Detail

The `pointer-events: none` on the wrapper div only blocks mouse/touch interaction with the iframe itself. It does **not** affect the `HookReview` panel, caption, or action row below it — those are siblings in the DOM, not children of the dimmed wrapper.

The `[filter:grayscale(20%)_brightness(90%)]` uses Tailwind's arbitrary value syntax since `grayscale-[20%]` is a single-filter utility and combining brightness requires the bracket form `[filter:...]`.

The effect triggers:
1. **Immediately on mount** — if the user already signaled this post in a previous session (the `checkExisting` check).
2. **After submission** — fades in after the 3-second "Summing Signals..." animation resolves.
