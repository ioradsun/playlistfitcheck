# Director's Cut -- Horizontal Carousel Redesign

## What changes

Replace the current two-panel split layout with a single horizontal scrolling carousel that shows ~3.5 system cards at a time. The 4th card peeks off-screen to hint there's more. Tapping a card directly selects that system and adds the select button on the tile  (no separate "Select" button under it). Large chevron arrows sit on the left and right edges for navigation.

## Layout

```text
  [<]  [ card 1 ][ card 2 ][ card 3 ][ card 4 ...  [>]
                                         (partially
                                          clipped)
```

- Each card is roughly 28% of viewport width so ~3.5 fit
- All 7 system canvases render live simultaneously in the animation loop (not just the visible two)
- Chevrons are larger (24px arrows, padded touch targets) positioned absolute on left/right edges, vertically centered over the carousel

## Interaction

- **Tap a card** = selects that system immediately, calls `onSelect(system)` -- no confirm button needed
- Selected card gets a subtle white border + the neon green "HOOKED"-style editorial label showing the system name
- "AI Pick" label stays as-is on the AI-recommended card
- Chevrons scroll the carousel by one card width with smooth CSS scroll-behavior
- Bottom dot indicators remain for position awareness

## What gets removed

- The "Select" button and its subtitle text at the bottom
- The per-panel left/right mini arrows
- The two-panel split layout (replaced by single horizontal scroll container)

## Editorial style preserved

- 9-10px mono uppercase tracking for all labels
- `#0a0a0a` background, white at low opacity
- Minimal borders, no backgrounds on interactive elements
- System name label below each card in muted mono type

## Technical approach

1. Replace the two canvas refs with an array of 7 canvas refs (one per system)
2. Update the animation loop to tick and draw all 7 systems each frame (they're lightweight canvas draws)
3. Use a horizontal scroll container (`overflow-x: auto`, `scroll-snap-type: x mandatory`, `scrollbar-width: none`) for the cards
4. Each card is a fixed-width div (~28vw) with `scroll-snap-align: start`
5. Chevron buttons call `scrollBy` on the container ref
6. Clicking a card calls `onSelect(system)` directly -- no intermediate selection state needed
7. Keep the header with "Director's Cut" and close button unchanged