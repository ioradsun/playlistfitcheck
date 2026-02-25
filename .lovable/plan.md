

# Add "Start CrowdFit Battle" Button to Fit Tab

Add a button under the Hottest Hooks section in the Fit tab that publishes hook battles directly to the CrowdFit feed, mirroring how Lyric Dance posts appear there.

## What Changes

### 1. FitTab.tsx -- Add Battle Publishing Logic and Button

**New state variables:**
- `battlePublishing` (boolean) -- tracks publish-in-progress
- `battlePublishedUrl` (string | null) -- stores the published battle URL

**New handler: `handleStartBattle`**
- Fetches user profile for display name
- Generates artist/song/hook slugs
- Uploads audio to storage
- Upserts both hooks into `shareable_hooks` with a shared `battle_id`
- Upserts primary hook into `hookfit_posts`
- Creates a CrowdFit post (`songfit_posts`) with:
  - `track_title` = song title
  - `spotify_track_url` = null, `spotify_track_id` = null
  - `lyric_dance_url` = battle page URL (e.g. `/:artist/:song/:hook`)
  - `lyric_dance_id` = null (this is a battle, not a dance)
  - `status` = "live", 21-day expiry
- Dispatches `hookfit:battle-published` and `songfit:dance-published` events for feed refresh
- Shows toast on success

**Button placement:**
- Rendered inside the Hottest Hooks card (lines 454-479), below the hook details
- Only shown when both `songDna.hook` and `songDna.secondHook` exist (a battle requires two hooks)
- Label: "START CROWDFIT BATTLE" (changes to "VIEW BATTLE" after publishing)
- Styled consistently with the existing Dance button aesthetic

### 2. Props -- No Changes Needed

The FitTab already receives all necessary data: `songDna` (contains hook/secondHook), `audioFile`, `beatGrid`, `lyricData` (contains lines, title), and `cinematicDirection`. No new props required.

## Technical Details

### Battle publish flow (mirrors PublishHookButton logic)
1. Derive `artistSlug`, `songSlug`, `hookSlug` from display name, song title, and hook phrase
2. Upload audio once to storage
3. Upsert hook 1 with `battle_position: 1` and a new `battle_id`
4. Upsert hook 2 with `battle_position: 2` and the same `battle_id`
5. Upsert into `hookfit_posts` (for HookFit feed)
6. Insert into `songfit_posts` (for CrowdFit feed) -- fire-and-forget, same pattern as the lyric dance auto-post at line 290
7. Dispatch window events for both feeds

### Duplicate prevention
- `shareable_hooks` upsert uses `onConflict: "artist_slug,song_slug,hook_slug"`
- `hookfit_posts` upsert uses `onConflict: "battle_id"`
- CrowdFit post checks for existing post by `user_id` + battle URL before inserting

### Button states
- Disabled when `!allReady` or `battlePublishing` or hooks missing
- Shows spinner while publishing
- After publish, shows "VIEW BATTLE" linking to the battle page

