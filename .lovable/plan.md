

## Universal Navigation Fix + Remove Back Arrow

### Problem
1. Clicking a tool category (e.g. "LyricFit") preserves existing project state when switching tabs instead of always opening a fresh "New Project" screen
2. Header shows a back arrow (`←`) on existing projects that needs to be removed — navigation should be sidebar-only

### Changes

**1. `src/pages/Index.tsx` — `handleSidebarTabChange` (lines 589-611)**

Remove the `isAlreadyOnTab` branching. Every tool category click should clear tool state and navigate to the bare path:

```tsx
const handleSidebarTabChange = useCallback((tab: string) => {
  setLoadingProjectType(null);
  // Always reset to New Project for the target tool
  if (tab === "lyric") setLoadedLyric(null);
  else if (tab === "mix") setLoadedMixProject(null);
  else if (tab === "hitfit") setLoadedHitFitAnalysis(null);
  // Clear playlist/profit/vibefit state too
  if (tab === "playlist") { setResult(null); savedSearchIdRef.current = null; }
  if (tab === "profit") setProfitSavedReport(null);
  if (tab === "vibefit") setLoadedVibeFitResult(null);

  const pathMap = { songfit: "/CrowdFit", hookfit: "/HookFit", profit: "/ProFit", playlist: "/PlaylistFit", mix: "/MixFit", lyric: "/LyricFit", hitfit: "/HitFit", dreamfit: "/DreamFit", vibefit: "/VibeFit" };
  transitionNavigate(pathMap[tab] || "/CrowdFit", { replace: true });
  startTransition(() => { setActiveTab(tab); });
}, [setActiveTab, transitionNavigate]);
```

**2. `src/pages/Index.tsx` — Header (lines 907-914)**

Remove the back arrow button. Keep project title and right content:

```tsx
{headerProject ? (
  <>
    <span className="text-xs font-semibold">{headerProject.title}</span>
    {headerProject.rightContent && <div className="ml-auto flex items-center gap-2">{headerProject.rightContent}</div>}
  </>
) : (
  // ... existing subtitle fallback
)}
```

### Files Changed
- `src/pages/Index.tsx` only — two surgical edits

