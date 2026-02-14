

## Unified Project Launcher

### The Problem
Every tool handles saved work differently -- some show saved projects inline, some only in the Dashboard, some nowhere. Users have to remember where to find their work depending on which tool they're in.

### First-Principles UX Approach

**Principle 1: Proximity** -- Saved work should live where you do the work, not in a separate page.

**Principle 2: Progressive Disclosure** -- The default state should be "start new." Saved work should be visible but secondary, not blocking the primary action.

**Principle 3: Consistency** -- Every tool gets the exact same interaction pattern. Zero learning curve between tabs.

### The Design

Each tool's landing page keeps its existing "new project" form (search bar, upload zone, etc.) exactly as-is. Below the primary action, a small "Recent Projects" section appears if the user is logged in and has saved work. This mirrors how MixFit already works -- but applied uniformly.

```text
+----------------------------------+
|        [PageBadge]               |
|                                  |
|   [Primary Input / Upload]       |
|   [Action Button]                |
|   "See Demo Results"             |
|                                  |
|   --- Recent Projects ---        |
|   [Card: Project 1]  [load|del] |
|   [Card: Project 2]  [load|del] |
|   (max 5 shown, compact)        |
+----------------------------------+
```

### What Changes

1. **Remove the Dashboard page entirely** -- all saved work moves inline into each tool's landing page.

2. **Create a shared `RecentProjects` component** -- a single reusable component that each tool imports. It takes:
   - A `tableName` (or fetcher function) to query saved items
   - A `renderItem` function for tool-specific display (score, mix count, line count, etc.)
   - An `onLoad` callback to restore the project
   - An `onDelete` callback

3. **Add persistence to HitFit and ProFit** -- so they also have saveable history:
   - **HitFit**: Save analysis results to a new `saved_hitfit` table (master names, reference name, analysis JSON, created_at)
   - **ProFit**: Save reports to a new `saved_profit` table (already partially exists with `profit_reports` -- just wire it up inline)

4. **Update each tool's landing component**:
   - **PlaylistFit** (`PlaylistInput.tsx`): Add `RecentProjects` below the "See Demo Results" link, showing saved playlist checks with score chips
   - **MixFit** (`MixProjectForm.tsx`): Replace the existing `SavedProjectsList` with the shared `RecentProjects` component
   - **LyricFit** (`LyricUploader.tsx`): Add `RecentProjects` showing saved transcriptions with line count
   - **HitFit** (`HitFitUploader.tsx`): Add `RecentProjects` showing past master analyses
   - **ProFit** (`ProFitLanding.tsx`): Add `RecentProjects` showing past artist reports with tier badge

5. **Remove Dashboard route and nav link** -- clean up `App.tsx` routing, remove `/dashboard` and its nav entry.

6. **Update Profile page** -- if the Dashboard had a "Profile" button, ensure Profile remains accessible from the navbar avatar/menu.

### Technical Details

**New shared component**: `src/components/RecentProjects.tsx`
- Accepts generic props: `items`, `loading`, `onLoad(item)`, `onDelete(id)`, `renderLabel(item)`, `renderMeta(item)`
- Renders a compact list (max 5 items) with subtle styling
- Shows nothing if no items or not logged in
- Each row: icon + title + meta + load button + delete button (same pattern as current MixFit's `SavedProjectsList`)

**New database tables** (migrations):
- `saved_hitfit`: id, user_id, master1_name, master2_name, reference_name, analysis (jsonb), created_at
- Wire existing `profit_reports` table for inline loading (or create if not present)
- RLS policies: users can only read/delete their own rows

**Files to modify**:
- `src/components/PlaylistInput.tsx` -- add RecentProjects section
- `src/components/mix/MixProjectForm.tsx` -- swap SavedProjectsList for RecentProjects
- `src/components/lyric/LyricUploader.tsx` -- add RecentProjects section
- `src/components/hitfit/HitFitUploader.tsx` -- add RecentProjects section
- `src/components/hitfit/HitFitTab.tsx` -- add save logic after analysis
- `src/components/profit/ProFitLanding.tsx` -- add RecentProjects section
- `src/pages/Index.tsx` -- remove Dashboard-related state/navigation logic
- `src/App.tsx` -- remove /dashboard route
- `src/components/Navbar.tsx` -- remove Dashboard nav link if present

**Files to delete**:
- `src/pages/Dashboard.tsx`
- `src/components/mix/SavedProjectsList.tsx` (replaced by shared component)

