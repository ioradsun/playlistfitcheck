

# HookFit — Instagram-style Feed for Hook Battles

## Overview

Create a new feed product called **HookFit** that mirrors CrowdFit's Instagram-style scrollable feed, but instead of Spotify embeds + signal interactions, each card embeds a live Hook Battle (from the existing `ShareableHook` page). When a user publishes a Hook Battle from LyricFit, it automatically creates a HookFit feed post. Users scroll through battles and interact directly within the embedded battle canvas.

## Architecture

The approach is to clone and adapt the CrowdFit components (`SongFitFeed`, `SongFitPostCard`, `BillboardToggle`) into a new `hookfit/` component family, replacing the Spotify embed with an inline Hook Battle embed powered by the existing `shareable_hooks` table.

## Database Changes

### New table: `hookfit_posts`

A lightweight feed table linking published hook battles to the social feed:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid | Author |
| battle_id | uuid | References `shareable_hooks.battle_id` |
| hook_id | uuid | Primary hook ID from `shareable_hooks` |
| caption | text | Optional artist caption |
| created_at | timestamptz | |
| status | text | 'live' (default) |

RLS: Anyone can SELECT, auth users can INSERT (own), UPDATE (own), DELETE (own).

No new signal/engagement tables needed -- all voting and commenting happens through the existing `hook_votes` and `hook_comments` tables on the `shareable_hooks` side.

## Implementation Steps

### 1. Database Migration

Create the `hookfit_posts` table with RLS policies. Enable realtime if desired.

### 2. New Components (`src/components/hookfit/`)

**HookFitTab.tsx** -- thin wrapper (like `SongFitTab.tsx`)
- Renders `HookFitFeed`

**HookFitFeed.tsx** -- adapted from `SongFitFeed.tsx`
- Fetches from `hookfit_posts` joined with `profiles` and `shareable_hooks`
- Simpler than CrowdFit: no composer gate (auto-published from LyricFit), no billboard mode initially
- Two feed views: "Recent" and "Top Battles" (ranked by total vote_count)
- Maps posts to `HookFitPostCard`

**HookFitPostCard.tsx** -- adapted from `SongFitPostCard.tsx`
- Header: artist avatar, name, timestamp, 3-dot menu (same pattern as CrowdFit)
- **Embed area**: Instead of `LazySpotifyEmbed`, renders an `<iframe>` pointing to `/:artistSlug/:songSlug/:hookSlug` (the existing ShareableHook page which already runs outside the provider tree and loads fast)
- Fixed-height iframe container (e.g. 400px on mobile, 500px on desktop) with the battle fully interactive inside
- Below the embed: caption area (same Instagram-style as CrowdFit)
- Action row: share button, fire/vote counts pulled from `shareable_hooks` data
- No duplicate signal/bypass system -- the battle embed handles all interaction internally

**HookFitToggle.tsx** -- simplified version of `BillboardToggle`
- Two tabs: "Recent" | "Most Hooked"
- "Most Hooked" sorts by total vote_count across the battle

### 3. Auto-Publish from LyricFit

Modify `PublishHookButton.tsx`:
- After successfully upserting hooks to `shareable_hooks`, also insert a row into `hookfit_posts` with the `battle_id`, primary `hook_id`, and user_id
- Only auto-post for battles (when `secondHook` exists), not single hooks
- Dispatch a `hookfit:battle-published` window event for any UI sync

### 4. Routing and Navigation

**Index.tsx**:
- Add `"/HookFit": "hookfit"` to `PATH_TO_TAB`
- Remove the redirect of `/HookFit` to `/CrowdFit`
- Add `hookfit` tab rendering in `renderTabContent` or as a persisted tab
- Mount `HookFitFeed` similar to how `SongFitTab` is mounted

**AppSidebar.tsx**:
- Add HookFit as a tool in the sidebar navigation
- Label: "HookFit" with pill "See which hook fits"

**App.tsx**:
- Add `/HookFit` route pointing to `Index`

### 5. Iframe Embed Strategy

The Hook Battle page (`ShareableHook`) already:
- Runs outside the provider tree (fast load)
- Has skeleton loading states
- Handles voting, commenting, playback independently

For the feed card, we embed it in an iframe:
```html
<iframe
  src="/:artistSlug/:songSlug/:hookSlug?embed=true"
  className="w-full rounded-lg border-0"
  style={{ height: '420px' }}
  loading="lazy"
/>
```

Add an `?embed=true` query param check in `ShareableHook.tsx` to:
- Hide the top "tools.fm" badge
- Hide the share/copy URL bar
- Reduce padding for tighter fit in the feed card
- Communicate vote events to parent via `postMessage` (so feed can update vote counts)

## Technical Considerations

- **Performance**: Iframes are lazy-loaded (`loading="lazy"`), so only visible battles load. Combined with the already-optimized ShareableHook page (provider bypass, parallel queries, selective columns), each embed should load in under 1 second.
- **Scroll performance**: Only 2-3 iframes will be in viewport at a time. Off-screen iframes are naturally throttled by the browser.
- **Data consistency**: Vote counts shown on the feed card are fetched from `shareable_hooks.vote_count` (maintained by existing triggers). The iframe battle handles its own real-time state.
- **No circular economy gate**: Unlike CrowdFit, HookFit posts are auto-generated from LyricFit publishes, not manually composed. No signal gate needed.

## File Summary

| File | Action |
|------|--------|
| Migration SQL | CREATE `hookfit_posts` table + RLS |
| `src/components/hookfit/HookFitTab.tsx` | New - thin wrapper |
| `src/components/hookfit/HookFitFeed.tsx` | New - adapted from SongFitFeed |
| `src/components/hookfit/HookFitPostCard.tsx` | New - adapted from SongFitPostCard with iframe embed |
| `src/components/hookfit/HookFitToggle.tsx` | New - simplified BillboardToggle |
| `src/components/hookfit/types.ts` | New - HookFitPost interface |
| `src/components/lyric/PublishHookButton.tsx` | Modify - auto-insert hookfit_posts row |
| `src/pages/ShareableHook.tsx` | Modify - embed mode support |
| `src/pages/Index.tsx` | Modify - add hookfit tab + routing |
| `src/components/AppSidebar.tsx` | Modify - add HookFit nav item |
| `src/App.tsx` | Modify - add /HookFit route |

