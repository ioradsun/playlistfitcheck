

# Auto-Play Spotify Embed with Transparent Overlay

## Problem
The Spotify embed iframe requires the user to click its internal play button to start playback. There's no way to programmatically trigger play inside a cross-origin iframe due to browser security restrictions.

## What We Can Do

### 1. Transparent click-through overlay (limited effectiveness)
Place a transparent div over the Spotify embed that, on click, removes itself so the next click hits the iframe's play button. However, this still requires **two clicks** (one to dismiss overlay, one to play), which isn't much better.

### 2. Better approach: Use Spotify's `autoplay=1` parameter (already in place)
The current embed URL already includes `autoplay=1`:
```
https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0&autoplay=1
```
This **should** autoplay, but browsers block autoplay unless the user has previously interacted with the page. Since the user clicks a track row before the embed loads, this interaction should satisfy the browser's autoplay policy in most cases.

### 3. Ensure autoplay works reliably
The real fix is to make sure the iframe only mounts **after** a user gesture (which it already does via track click), and to add `allow="autoplay"` properly. The current code already has `allow="autoplay; ..."` so this should work.

### Recommended Changes

**`src/components/PromoPlayer.tsx`**:
- Add a transparent overlay div positioned absolutely over the iframe. On click, it removes itself (setting a state flag), exposing the iframe underneath for direct interaction.
- This acts as a fallback: if autoplay works (which it should after a click gesture), the overlay is cosmetic. If autoplay fails, one click on the overlay area focuses/activates the iframe.
- Style the overlay with a subtle play icon hint so users know to click.

## Technical Details

### File: `src/components/PromoPlayer.tsx`
- Wrap the iframe in a `relative` container
- Add an absolutely-positioned transparent div on top with `cursor-pointer`
- On click of the overlay, set a per-track state to hide the overlay, allowing subsequent clicks to reach the iframe directly
- The overlay auto-resets when `activeTrack` changes (new track selected)
- Keep the existing `autoplay=1` parameter which handles most cases

This is a small, focused change -- just the iframe section of the component.

