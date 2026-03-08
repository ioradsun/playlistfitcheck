
## Fix TypeScript Error & Make Spotify Embed Fill Container

### Issues
1. **TypeScript error** (line 107 of InlineLyricDance.tsx): Type casting from `GenericStringError` to `Record<string, unknown>` needs intermediate `unknown` cast
2. **Spotify embed sizing**: Currently constrained by fixed height + wrapper div not stretching vertically

### Fixes

**1. InlineLyricDance.tsx (line 107)**
- Change: `...(row as Record<string, unknown>)` 
- To: `...(row as unknown as Record<string, unknown>)`
- This satisfies TypeScript's type safety by casting through `unknown` first

**2. LazySpotifyEmbed.tsx (lines 58-71)**
- Change wrapper div from `<div className="w-full">` to `<div className="w-full h-full flex flex-col items-center justify-center">`
- Change iframe from `height={height}` to `style={{ height: '100%' }}` for Spotify
- This allows the iframe to fill the available container height vertically
- For SoundCloud, keep minimum 166px but allow growth
