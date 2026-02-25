

# Auto-Post Lyric Dance to CrowdFit

When a lyric dance is published, it will automatically create a CrowdFit post — the same pattern used by HookFit battles. The post appears in the CrowdFit feed like any other post, with the Spotify embed replaced by a link to the lyric dance page.

## What Changes

### 1. Database Migration
Add two nullable columns to `songfit_posts` and make `spotify_track_url` / `spotify_track_id` nullable so dance-only posts don't need Spotify data:

```text
ALTER TABLE public.songfit_posts
  ALTER COLUMN spotify_track_url DROP NOT NULL,
  ALTER COLUMN spotify_track_id DROP NOT NULL;

ALTER TABLE public.songfit_posts
  ADD COLUMN lyric_dance_url text,
  ADD COLUMN lyric_dance_id uuid;
```

### 2. Publishing Flow (FitTab.tsx)
After the `shareable_lyric_dances` upsert succeeds (around line 281), add a fire-and-forget block:
- Query the just-upserted dance record to get its ID
- Check if a `songfit_posts` row already exists for this user with a matching `lyric_dance_id`
- If not, insert a new CrowdFit post with:
  - `track_title` = song name
  - `caption` = auto-generated (e.g. empty or short default)
  - `lyric_dance_url` = the published dance path
  - `lyric_dance_id` = the dance record ID
  - `spotify_track_url` = null, `spotify_track_id` = null
  - `album_art_url` = null (or background URL if available)
  - `status` = "live", standard 21-day expiry
- If post already exists, update its `lyric_dance_url`

### 3. CrowdFit Post Card (SongFitPostCard.tsx)
- Before the `LazySpotifyEmbed`, check if `post.lyric_dance_url` exists
- If so, render a compact card linking to the dance page instead of the Spotify embed — similar to how HookFit cards show battle canvases instead of track embeds
- Show song title, artist name, and a "Watch Lyric Dance" CTA button

### 4. Types Update (songfit/types.ts)
- Add `lyric_dance_url?: string | null` and `lyric_dance_id?: string | null` to the `SongFitPost` interface

### 5. Feed Query (SongFitFeed.tsx)
- No query changes needed — dance posts are just regular `songfit_posts` rows with `status = 'live'`
- The existing feed query already fetches all live posts

## Technical Details

### Dance post card rendering
When `post.lyric_dance_url` is set and `post.spotify_track_id` is empty/null:
- Replace the Spotify embed area with a styled card containing:
  - Song title (from `track_title`)
  - Artist name (from profile)
  - A "WATCH LYRIC DANCE" button linking to `post.lyric_dance_url`
- The card uses the same resolved/scored filter states as regular posts

### Duplicate prevention
- On republish, the system checks for existing posts by `lyric_dance_id` to avoid duplicates
- If found, updates the existing post's URL rather than creating a new one

### Event dispatch
- After auto-posting, dispatch `window.dispatchEvent(new Event("songfit:dance-published"))` so the feed can refresh if open (mirrors the HookFit pattern with `hookfit:battle-published`)

