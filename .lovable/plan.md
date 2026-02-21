

## Move Back Button + Project Title into the Header

### Problem
Every tool screen (LyricFit, MixFit, HitFit, ProFit, VibeFit, PlaylistFit) renders its own `< ArrowLeft` button + project title inside the scrollable content area, wasting vertical space and breaking consistency.

### Solution
Lift the "active project" state into the Index page header so the back arrow and project name appear in the shared sticky header bar -- the same row as the sidebar trigger and tab subtitle.

### How it works

**When no project is active** (uploader/form view):
```
[=] LYRICFIT
```

**When a project is loaded** (results view):
```
[=] < My Song Title
```

The `<` replaces the tab subtitle, and the project title appears inline. One tap resets back to new-project view. Zero vertical space used in the content area.

---

### Technical Details

**1. Add header state to Index.tsx**

Create a state object for the active project context:
```typescript
const [headerProject, setHeaderProject] = useState<{
  title: string;
  onBack: () => void;
} | null>(null);
```

Pass `setHeaderProject` down to each tool component (or use a lightweight context to avoid prop drilling).

**2. Update the Index header (lines 481-490)**

When `headerProject` is set, render the back arrow + title instead of the tab subtitle:
```typescript
<header className="sticky top-0 z-40 flex items-center gap-3 h-12 border-b border-border bg-background/80 backdrop-blur-md px-3">
  <SidebarTrigger ... />
  {headerProject ? (
    <>
      <button onClick={headerProject.onBack}>
        <ArrowLeft size={16} />
      </button>
      <span className="text-xs font-semibold truncate">{headerProject.title}</span>
    </>
  ) : (
    TAB_SUBTITLES[activeTab] && <span className="font-mono text-[11px] ...">{TAB_SUBTITLES[activeTab]}</span>
  )}
</header>
```

**3. Update each tool to report its project title**

Each tool component receives an `onHeaderProject` callback and calls it when entering/exiting results:

- **LyricFitTab / LyricDisplay**: Call `onHeaderProject({ title, onBack })` when lyrics load; call `onHeaderProject(null)` on back.
- **MixFitCheck**: Call when `projectId` is set with the mix title; clear on `resetProject`.
- **HitFitTab / HitFitResults**: Call when analysis loads; clear on back.
- **ProFitTab / ProFitReport / ProFitChat**: Call with artist name; clear on back to landing.
- **VibeFitResults**: Call with song title; clear on back.
- **ResultsDashboard** (PlaylistFit): Call with playlist name; clear on back.

**4. Remove redundant back buttons from each component**

Remove the `<ArrowLeft>` + title header blocks from:
- `LyricDisplay.tsx` (line ~642-646)
- `MixFitCheck.tsx` (line ~253-261)
- `HitFitResults.tsx` (line ~171-175)
- `ProFitReport.tsx` (line ~67-70)
- `ProFitChat.tsx` (line ~84-86)
- `VibeFitResults.tsx` (line ~61-65)
- `ResultsDashboard.tsx` (line ~105-109)

**5. Clear header on tab switch**

In the `setActiveTab` handler, also call `setHeaderProject(null)` so switching tabs always resets the header to show the tab subtitle.

**6. PageLayout.tsx also gets the same pattern**

For routes that use `PageLayout` (like PublicProfile), pass `title` + `onBack` as props so the same header pattern applies there too.

### Screens affected
- LyricFit (LyricDisplay)
- MixFit (MixFitCheck)
- HitFit (HitFitResults)
- ProFit (ProFitReport, ProFitChat)
- VibeFit (VibeFitResults)
- PlaylistFit (ResultsDashboard)

