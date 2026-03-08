
## Update Recent Dropdown to Filter by Content Type

**Goal**: Replace the "Recent/Pending/Resolved" dropdown with "All/Now Streaming/In Studio/In Battle" to filter posts by content type (Spotify, Lyric Dance, Battle).

**Files to update** (3 locations):

1. **`src/components/songfit/types.ts`**
   - Change `FeedView` type from `'recent' | 'pending' | 'resolved' | 'billboard'` to `'all' | 'now_streaming' | 'in_studio' | 'in_battle' | 'billboard'`

2. **`src/components/songfit/BillboardToggle.tsx`**
   - Update `recentSubViews` array to:
     ```
     [
       { key: "all", label: "All", desc: "All live submissions" },
       { key: "now_streaming", label: "Now Streaming", desc: "Spotify posts" },
       { key: "in_studio", label: "In Studio", desc: "Lyric dances" },
       { key: "in_battle", label: "In Battle", desc: "Battle submissions" }
     ]
     ```
   - Update the button display logic to show correct label based on view

3. **`src/components/songfit/SongFitFeed.tsx`**
   - Update `fetchPosts` to filter posts by content type:
     - **all**: all live posts (current "recent" logic)
     - **now_streaming**: `post.spotify_track_id` exists, no `lyric_dance_url`
     - **in_studio**: `post.lyric_dance_url && post.lyric_dance_id && !post.spotify_track_id`
     - **in_battle**: `post.lyric_dance_url && !post.lyric_dance_id && !post.spotify_track_id`
   - Remove "pending" and "resolved" filter logic since those views no longer exist
   - Keep billboard logic unchanged

**Logic**: Posts are identified by the same criteria used in SongFitPostCard (hasLyricDancePost and isBattlePost).

