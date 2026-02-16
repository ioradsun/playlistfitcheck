

# Remove Recent Searches + Replace Music Embed with Link

## Changes

### 1. Public Profile (`src/pages/PublicProfile.tsx`)

**Remove "Recent PlaylistFit Checks" section**
- Delete the `searches` state, the `saved_searches` query in useEffect, and the `PublicSearch` interface
- Remove the entire "Recent searches" card block (lines 127-151)
- Clean up unused imports (`ExternalLink`)

**Replace Music embed with a "My Spotify" link in the bio area**
- Remove the Music embed card (lines 117-124)
- Instead, show a simple inline link below the bio: "My Spotify" (or "My SoundCloud") with an external link icon, pointing to the user's `spotify_embed_url`
- Remove `MusicEmbed` import and unused `Music` import from lucide

### 2. Private Profile (`src/pages/Profile.tsx`)

**Replace Music embed card with inline link**
- Remove the "My Music" embed card (lines 186-193)
- Show a "My Spotify" / "My SoundCloud" link below the bio in the header area (similar to public profile)
- Remove `MusicEmbed` import; keep the edit form input for setting the URL

### Result

Both profile pages will show the music URL as a simple styled link (e.g. with a Music icon + "My Spotify") in the bio section rather than a large embedded player, and the public profile will no longer display recent PlaylistFit check history.

