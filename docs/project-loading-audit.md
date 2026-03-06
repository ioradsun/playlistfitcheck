# Project Loading & Skeleton Rendering Audit

## Scope
Audited routing, project hydration, and UI loading/skeleton behavior for: LyricFit, MixFit, PlaylistFit, HitFit, ProFit, VibeFit (plus related sidebar/shareable flows).

## 1) Route/pathname → active tool resolution

- React Router mounts all tool routes to `Index`, with optional `:projectId` for ProFit, PlaylistFit, MixFit, LyricFit, HitFit, and VibeFit. `DreamFit`, `CrowdFit`, and `HookFit` do not use `:projectId` in routes. (`src/App.tsx`)
- `Index` computes tool from pathname by:
  - stripping a UUID suffix from pathname,
  - mapping base path via `PATH_TO_TAB`,
  - falling back to `songfit`. (`src/pages/Index.tsx`)
- `Index` syncs tab on pathname changes and runs route normalization redirects (`/` → `/CrowdFit`, `/SongFit` → `/CrowdFit`, hookfit-disabled redirect). (`src/pages/Index.tsx`)
- Sidebar tool clicks delegate to `onTabChange` (Index owns route+reset behavior), while recent-item clicks call `onLoadProject` and then navigate to `/Tool/:id`. (`src/components/AppSidebar.tsx`)

## 2) `projectId` (or equivalent) → existing vs new project

### Global orchestration in `Index`

- `projectId` comes from route params and is treated as the existing-project signal. (`src/pages/Index.tsx`)
- A shared `projectLoadedRef` memoizes the last loaded route project id to avoid duplicate fetches. (`src/pages/Index.tsx`)
- Lyric uses a dedicated loader path (`saved_lyrics`) with a specialized loading state machine (`lyricLoadingState`). (`src/pages/Index.tsx`)
- Non-lyric tools use one generic loader effect keyed by `activeTab` + `projectId`, querying tool-specific tables and invoking `handleLoadProject`. (`src/pages/Index.tsx`)

### Per-tool “existing/new” proxies

- **LyricFit**: existing if `loadedLyric?.id === projectId` and lyric hydration is complete; otherwise skeleton/new uploader path. (`src/pages/Index.tsx`)
- **MixFit**: existing if `loadedMixProject?.id === projectId` (plus ref checks); otherwise skeleton/new form path. (`src/pages/Index.tsx`)
- **HitFit**: existing if `loadedHitFitAnalysis` is present; no separate explicit mode enum. (`src/pages/Index.tsx`)
- **PlaylistFit**: existing if `result` is present after project fetch; otherwise skeleton/input. (`src/pages/Index.tsx`)
- **ProFit**: existing if `profitSavedReport` present; otherwise fallback/loading/landing. (`src/pages/Index.tsx`)
- **VibeFit**: existing if `loadedVibeFitResult` present; otherwise fallback/form. (`src/pages/Index.tsx`)

## 3) Loading flags, loading state, skeleton conditions

### In `Index` (screen-level)

- `authLoading` gates hydration for route-bound existing projects. (`src/pages/Index.tsx`)
- `loadingProjectType` tracks active async load for non-lyric tools and drives skeleton rendering. (`src/pages/Index.tsx`)
- `lyricLoadingState: "loading" | "ready" | "missing"` drives lyric skeleton/missing behavior. (`src/pages/Index.tsx`)
- Hydration booleans:
  - `isHydratingExistingLyricProject`
  - `isHydratingMix`
  - `isHydratingHitFit`
  - `isHydratingProfit`
  - `isHydratingPlaylist`
  - `isHydratingVibeFit`
  all independently encode `projectId + auth/loading + data presence` checks. (`src/pages/Index.tsx`)
- Suspense fallback skeletons are repeated per tool via `ToolSkeleton` or `TabChunkFallback`. (`src/pages/Index.tsx`)
- Playlist additionally has `isFullyLoaded` (`result` + `!vibeLoading` + `!songFitLoading`) to switch between report and analysis loading spinner. (`src/pages/Index.tsx`)

### In tool components (local-level)

- **MixFitCheck**: `projectId` controls whole-screen mode (`!projectId` renders create form); `saving`, `beatGridLoading`, `needsReupload` are local loading/status flags. (`src/pages/MixFitCheck.tsx`)
- **HitFitTab**: `loading` controls analyzer spinner state; `analysis` presence controls uploader vs results screen. (`src/components/hitfit/HitFitTab.tsx`)
- **VibeFitTab**: `loading` controls full loading screen; `result` presence controls form vs results screen. (`src/components/vibefit/VibeFitTab.tsx`)
- **ProFitTab**: `loading` for analyze call; `view` (`landing|report|chat`) + `report` determine screen state. (`src/components/profit/ProFitTab.tsx`)
- **LyricFitTab**: many pipeline flags (`fitReadiness`, `generationStatus`, `pipelineStages`, etc.) plus data presence (`lyricData`) decide view composition. (`src/components/lyric/LyricFitTab.tsx`)

### Related page

- **ShareableLyricDance** uses `isWaitingForPlayer` (derived from `loading` + data/cinematicDirection validity) and explicitly treats cover overlay as skeleton. (`src/pages/ShareableLyricDance.tsx`)

## 4) Places that clear state to represent “new project”

### In `Index`

- Sidebar tab change clears per-tool loaded state before navigation:
  - lyric: `setLoadedLyric(null)`
  - mix: `setLoadedMixProject(null)`
  - hitfit: `setLoadedHitFitAnalysis(null)`
  - playlist: `setResult(null)` + reset saved-search ref
  - profit: `setProfitSavedReport(null)`
  - vibefit: `setLoadedVibeFitResult(null)`. (`src/pages/Index.tsx`)
- New-project callbacks:
  - `handleNewLyric`, `handleNewMix`, `handleNewHitFit` clear state + navigate tool root. (`src/pages/Index.tsx`)
- `handleLoadProject` begins by clearing multiple cross-tool states before setting target tool data (inside `flushSync`). (`src/pages/Index.tsx`)
- Logout effect clears all tool state and cached audio. (`src/pages/Index.tsx`)

### In tool tabs

- `MixFitCheck.resetProject()` clears all project fields and calls parent `onNewProject`. (`src/pages/MixFitCheck.tsx`)
- `HitFitTab.handleBack()` sets `analysis` to null and calls parent `onNewProject`. (`src/components/hitfit/HitFitTab.tsx`)
- `VibeFitTab.handleBack()` clears `result` and `lastInput`. (`src/components/vibefit/VibeFitTab.tsx`)
- `ProFitTab` report back action clears `report` and sets `view="landing"`. (`src/components/profit/ProFitTab.tsx`)
- `LyricFitTab` has a large reset block in `onNewProject` callback (render data, beat grid, cinematic, waveform, sections, readiness flags, refs). (`src/components/lyric/LyricFitTab.tsx`)

## 5) Duplicate loading logic across tools

1. **Hydration booleans duplicated per tool in `Index`** with slightly different conditions.
2. **Skeleton fallback plumbing duplicated** (`ToolSkeleton`, `TabChunkFallback`, per-case `Suspense fallback`).
3. **Existing-vs-new decided by tool-specific data null checks** (`result`, `analysis`, `loadedMixProject`, etc.) rather than a shared mode field.
4. **Route-load effect has switch-by-table logic inline**; this is repeated branching and transforms in one component.
5. **New-project reset logic duplicated** between Index and child tabs, often partially overlapping.

## 6) `flushSync` usage / anti-flash hacks

- `flushSync` used after lyric project fetch to atomically set `loadedLyric` and `lyricLoadingState`, explicitly to avoid a transient `ready + null` frame. (`src/pages/Index.tsx`)
- `flushSync` used in `handleLoadProject` to clear old tool state and set target tool state before navigating, explicitly to prevent “New Project” flash. (`src/pages/Index.tsx`)
- Sidebar comment documents race/flash risk if navigating to base route before project route; mitigated by loading+navigating directly. (`src/components/AppSidebar.tsx`)

## 7) Places where data state is used as screen state (coupling risks)

- `PlaylistFit`: `result` doubles as both domain data and screen mode (`result ? dashboard : input`). (`src/pages/Index.tsx`)
- `HitFit`: `analysis` presence toggles results vs uploader. (`src/components/hitfit/HitFitTab.tsx`)
- `VibeFit`: `result` presence toggles results vs form. (`src/components/vibefit/VibeFitTab.tsx`)
- `MixFit`: `projectId` local state toggles editor vs create form. (`src/pages/MixFitCheck.tsx`)
- `LyricFit`: `lyricData` presence toggles uploader/tab shell, while separate readiness flags drive fit access. (`src/components/lyric/LyricFitTab.tsx`)
- `ProFit`: both `view` and `report` are used to derive screen, allowing mixed/invalid combinations unless carefully synchronized. (`src/components/profit/ProFitTab.tsx`)

---

## Concise architecture summary

- Routing centralizes in `App.tsx` and `Index.tsx`, where `pathname + optional projectId` determine active tool and whether to hydrate an existing project.
- `Index` is the orchestration hub, but it stores per-tool data/state separately and computes loading/hydration screen conditions per tool.
- Child tools also manage their own local loading and screen transitions, so loading/screen state is currently split across parent and child layers.
- Current behavior is functional but heavily conditional, with anti-flash sequencing (`flushSync`) and data-null checks substituting for explicit UI mode/screen state.

## Problems list

1. **No universal screen contract** for `{tool, mode, status, projectId}`; each tool infers mode differently.
2. **Data-null as UI mode** creates brittle transitions and potential flashes.
3. **Hydration logic centralized but duplicated** by tool-specific booleans and branches.
4. **Reset pathways are fragmented** (Index, tool back buttons, sidebar, logout), increasing drift risk.
5. **`flushSync` is compensating for missing state model** rather than being exceptional.
6. **Potential invalid intermediate states** (e.g., route says existing project while tool data is null and loading flag already false).
7. **Inconsistent missing/error semantics** (lyric has explicit `missing`; other tools usually toast+redirect).

## Proposed target architecture

Introduce a single route-driven screen state object in `Index`:

```ts
{
  tool,
  mode: "new" | "existing",
  status: "loading" | "ready" | "missing" | "error",
  projectId?
}
```

### Design

- **Tool**: resolved from pathname via one parser.
- **Mode**:
  - `existing` iff `projectId` present
  - `new` otherwise
- **Status**:
  - `loading` during auth/project hydration and async tool chunk fetch
  - `ready` when screen can safely render target view
  - `missing` when route project not found/unauthorized
  - `error` on unrecoverable fetch/transform failure
- **Project payload cache**: separate object keyed by tool+projectId, not used as mode/status source.

### Operational rules

1. Route change computes a next `screenState` synchronously.
2. Existing mode always enters `loading` first.
3. Project loader resolves into `ready|missing|error` without requiring data-null heuristics.
4. Child tabs receive explicit `screenState` + `initialProjectData` props and become mostly stateless re: route mode.
5. Skeleton rendering depends only on `screenState.status === "loading"`.
6. “New project” actions set `mode:"new", status:"ready"` and clear only tool-local draft data.
7. Eliminate most `flushSync`; only keep if a measured visual regression remains after state normalization.

## File-by-file migration plan (no implementation yet)

### `src/pages/Index.tsx`

1. Add `ScreenState` type and reducer (`screenStateReducer`).
2. Replace per-tool hydration booleans and `loadingProjectType`/`lyricLoadingState` with reducer transitions.
3. Extract route parsing into `resolveToolFromPath(pathname)` utility.
4. Extract project fetchers into a map: `loaders[tool](projectId, user)` returning `{status,data}`.
5. Replace `handleLoadProject` with reducer + payload cache updates; navigate after reducer commit (likely no `flushSync`).
6. Render switch uses universal conditions:
   - `status=loading` → tool skeleton
   - `status=missing|error` → standardized empty/error panel
   - `status=ready` + `mode` to choose new/existing variant
7. Keep tool-specific pipeline spinners (e.g., playlist analysis) as **in-tool activity state**, not route screen state.

### `src/components/AppSidebar.tsx`

1. Remove dual navigation race by making recent click dispatch a single “open project route” event to Index.
2. Keep prefetch, but stop direct navigate+load double-trigger pattern.
3. Ensure tool click always means `mode:new,status:ready` for target tool.

### `src/App.tsx`

1. Optionally consolidate tool route declarations into a generated list for consistency.
2. Consider adding explicit lower-case redirects (`/playlistfit` etc.) to canonical app routes if desired, separate from SEO pages.

### `src/components/lyric/LyricFitTab.tsx`

1. Introduce explicit prop contract for route screen mode/status from parent.
2. Keep internal generation pipeline flags, but remove parent-mode inference through `initialLyric` null checks.
3. Isolate “new project reset” into one function exported to parent callback.
4. Ensure missing/error states are handled by parent screen shell, not inferred internally.

### `src/pages/MixFitCheck.tsx`

1. Decouple screen mode from local `projectId` presence by accepting parent `mode` and initial payload.
2. Keep editor/local activity flags (`saving`, `beatGridLoading`) as internal only.
3. Standardize reset handler to emit parent-level `set mode:new` event.

### `src/components/hitfit/HitFitTab.tsx`

1. Replace `analysis ? results : uploader` as the primary screen switch with parent-provided mode/status.
2. Keep `loading` only for analysis request in ready mode.
3. Convert back action to explicit `requestNewProject()` callback.

### `src/components/vibefit/VibeFitTab.tsx`

1. Replace result-null mode switching with explicit parent screen mode.
2. Keep generation `loading` as in-tool async status only.
3. Align back action with standardized “new project” event.

### `src/components/profit/ProFitTab.tsx`

1. Normalize to single screen state source:
   - Parent handles route mode/status
   - Child keeps sub-view state (`report/chat`) only inside `ready`.
2. Avoid `view` + `report` dual gating by introducing a single discriminated local state.

### `src/pages/ShareableLyricDance.tsx` (related)

1. Optional: align player loading overlay logic to same `status` enum for consistency with app shell.
2. Keep overlay-as-skeleton pattern but express with explicit status type.

### Supporting extraction files (new)

- `src/features/screenState/types.ts` (universal type)
- `src/features/screenState/reducer.ts`
- `src/features/screenState/loaders.ts`
- `src/features/screenState/route.ts`

This minimizes `Index` complexity and makes loading behavior consistent across all tools.
