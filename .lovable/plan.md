
# Floating PromoPlayer Widget

## Overview
Transform the PromoPlayer from an inline component into a compact, persistent floating widget that lives at the app root level. This ensures uninterrupted playback across all pages and keeps it accessible without dominating the layout.

## Design Changes

### Make it compact
- Remove the duration/time column from each track row
- Reduce max width from `max-w-md` (~448px) to ~280px
- Shrink album art from 36px to 32px
- Add a collapse/expand toggle so users can minimize it to just a small music icon button

### Float it at the root level
- Move PromoPlayer out of `PlaylistInput` and `ResultsDashboard` and render it once in `App.tsx`, so it persists across all pages
- Position it as `fixed` with a high z-index

### Suggested Position Options

Here are 3 positions ranked by UX suitability for this app:

1. **Bottom-right corner** (recommended) -- This is the most natural position for a media widget. It mirrors where chat widgets and music mini-players live (Spotify, YouTube Music). It stays out of the way of the main content area and the navbar, and is thumb-friendly on mobile.

2. **Bottom-left corner** -- Also viable, but slightly less conventional for media players. Could work well if you want to keep the bottom-right free for future features (like a help chat).

3. **Top-right, below navbar** -- Keeps it visible but risks competing with navigation elements and feeling intrusive on smaller screens.

### Collapse behavior
- Default state: collapsed to a small floating button (music icon + subtle pulse when playing)
- Click to expand the full track list
- When a track is actively playing via the Spotify embed, show a mini "now playing" bar on the collapsed state

## Technical Details

### Files to modify
- **`src/components/PromoPlayer.tsx`**: Refactor into a floating widget with collapsed/expanded states. Remove duration column. Reduce width. Add fixed positioning and collapse toggle.
- **`src/App.tsx`**: Add `<PromoPlayer />` at root level (after `<Navbar />`), so it renders on every page.
- **`src/components/PlaylistInput.tsx`**: Remove the inline `<PromoPlayer />` usage.
- **`src/components/ResultsDashboard.tsx`**: Remove the inline `<PromoPlayer />` usage.

### Widget structure
- Collapsed: a 48px circular button with a Music icon, fixed bottom-right (bottom-20 right-4), with a subtle glow/pulse when a track is active
- Expanded: the compact track list (max-w-[280px]) with the Spotify embed below the selected track, max-h constrained, scrollable
- Animate open/close with framer-motion
- On mobile: full-width drawer-style from the bottom instead of a floating card
