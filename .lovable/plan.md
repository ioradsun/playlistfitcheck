

# Compact Spotify Embed for Widget

## What Changes
When the widget is in **Embed** mode, show the Spotify playlist embed at a compact height (80px) instead of the full 352px. This hides the tracklist inside the embed and shows only the playlist cover art, name, and play button — a slim, clean player bar.

## Visual Result
The embed widget will look like a single-line player bar showing:
- Playlist cover art thumbnail
- Playlist name
- Play/pause button
- Progress bar

This matches the compact widget aesthetic and avoids duplicating a tracklist the user doesn't want.

## Technical Details

### File: `src/components/PromoPlayer.tsx`
- Change the embed iframe `height` from `"352"` to `"80"` (line 108)
- This is the only change needed — Spotify's embed automatically adapts to the compact layout at this height

