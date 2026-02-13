

## Auto-Fetch Metadata via Spotify oEmbed

When an admin pastes a Spotify URL in the widget config, automatically fetch the title and thumbnail from Spotify's oEmbed endpoint to populate the widget header and optionally show album art.

### How It Works

1. **New backend function** `spotify-oembed` that proxies requests to `https://open.spotify.com/oembed?url={spotifyUrl}` (avoids CORS issues from the browser).

2. **Admin panel enhancement** — When the admin pastes/changes the embed URL field:
   - Auto-fetch oEmbed data via the new function
   - Pre-fill the "Widget Title" field with the returned `title`
   - Store the `thumbnail_url` in the database for optional use

3. **Database update** — Add a `thumbnail_url` column to `widget_config` to cache the fetched thumbnail.

4. **Widget enhancement** — Optionally display the thumbnail in the widget header alongside the title for a richer appearance.

### Technical Details

**New edge function: `supabase/functions/spotify-oembed/index.ts`**
- Accepts a Spotify URL in the request body
- Calls `https://open.spotify.com/oembed?url={url}` server-side
- Returns `{ title, thumbnail_url, type }` to the client

**Database migration**
- `ALTER TABLE widget_config ADD COLUMN thumbnail_url text;`

**Admin panel changes (`src/pages/Admin.tsx`)**
- Add a debounced effect on the embed URL input that calls the `spotify-oembed` function
- Auto-populate the title field with the oEmbed response title
- Show a small thumbnail preview next to the URL input

**Widget changes (`src/components/PromoPlayer.tsx`)**
- If `thumbnail_url` is set, display it in the widget header as a small icon next to the title
- Falls back to text-only header if no thumbnail

### What This Does NOT Change
- The actual Spotify embed iframe stays the same — oEmbed does not unlock extra player features
- The admin can still manually override the title after auto-fill
- Existing widget behavior (dragging, modes) remains untouched

