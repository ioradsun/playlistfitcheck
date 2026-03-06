

## Optimistic Sidebar Items for VibeFit, ProFit, and MixFit

### What
Wire `onOptimisticItem` prop to VibeFitTab, ProFitTab, and MixFitCheck so newly created projects appear instantly in the sidebar — matching the pattern already implemented for HitFitTab and PlaylistFit.

### Changes

**1. `src/components/vibefit/VibeFitTab.tsx`**
- Add `import type { RecentItem } from "@/components/AppSidebar"`
- Add `onOptimisticItem?: (item: RecentItem) => void` to `VibeFitTabProps`
- Destructure `onOptimisticItem` in function signature
- After `onSavedId?.(inserted.id)` (line ~123), call `onOptimisticItem` with `{ id: inserted.id, label: input.songTitle || "VibeFit", meta: "just now", type: "vibefit", rawData: { input, result: output } }`

**2. `src/components/profit/ProFitTab.tsx`**
- Add `import type { RecentItem } from "@/components/AppSidebar"`
- Add `onOptimisticItem?: (item: RecentItem) => void` to `ProFitTabProps`
- Destructure `onOptimisticItem` in function signature
- Expand the `if (data.reportId)` block (line ~58) to also call `onOptimisticItem` with `{ id: data.reportId, label: data.artist?.name || "Artist Report", meta: "just now", type: "profit", rawData: { reportId, shareToken, blueprint, artist } }`

**3. `src/pages/MixFitCheck.tsx`**
- Add `import type { RecentItem } from "@/components/AppSidebar"`
- Add `onOptimisticItem?: (item: RecentItem) => void` to `MixFitCheckProps`
- Destructure `onOptimisticItem` in function signature
- After `onSavedId?.(newId)` (line ~140), call `onOptimisticItem` with `{ id: newId, label: t || "Mix Project", meta: "just now", type: "mix", rawData: { id, title, notes, mixes metadata } }`

**4. `src/pages/Index.tsx`**
- Add `onOptimisticItem={(item) => setOptimisticSidebarItem(item)}` to:
  - `<MixFitCheck>` (line ~805)
  - `<ProFitTab>` (line ~839)
  - `<VibeFitTab>` (line ~883)
- HitFitTab already has it — no change needed.

