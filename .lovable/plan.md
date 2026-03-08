

## Make content-type badges more visible with green pill styling

**What changes**: Update all "Now Streaming", "In Studio", and "In Battle" badges from the current ghosted white/30 style to a green pill that pops against the dark media backgrounds.

**Files to update** (5 locations across 4 files):

1. **`src/components/songfit/SongFitPostCard.tsx`** (line 320) — "Now Streaming" on Tier 1 cover
2. **`src/components/songfit/LazySpotifyEmbed.tsx`** (line 115) — "Now Streaming" on Spotify embed
3. **`src/components/songfit/InlineBattleFeed.tsx`** (line 295) — "In Battle"
4. **`src/components/lyric/LyricDanceCover.tsx`** (line 32) — "In Studio" badge
5. **`src/pages/ShareableHook.tsx`** (line 366) — "In Battle" on shareable page

**New shared badge classes** (replacing `text-white/30 border border-white/10 bg-black/40 backdrop-blur-sm`):

```
text-green-400 border border-green-400/30 bg-green-500/15 backdrop-blur-sm
```

This gives a soft green glow pill — visible but not garish. The mono uppercase tracking stays the same for brand consistency.

