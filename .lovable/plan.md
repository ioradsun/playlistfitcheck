
## Aligning DreamFit Post Card & Composer Sizing with CrowdFit

### What's Different Right Now

**DreamToolCard vs SongFitPostCard (feed cards)**

| Element | DreamFit (current) | CrowdFit (reference) |
|---|---|---|
| Header outer flex gap | `gap-3` (single flat gap) | `gap-2` (outer) + `gap-3` (inner, avatar+name) |
| Avatar size | `w-9 h-9` | `w-9 h-9` ✓ same |
| Avatar ring | `ring-2 ring-primary/20` | `ring-2 ring-primary/20` ✓ same |
| Name font | `text-sm font-semibold` | `text-sm font-semibold` ✓ same |
| Timestamp font | `text-[11px]` | `text-[11px]` ✓ same |
| Profile click / hover card | None — static | `ProfileHoverCard` wrapping avatar+name |
| TrailblazerBadge indent | Misaligned (inside inner div) | Correctly placed after `ProfileHoverCard` |

**DreamInlineComposer vs SongFitInlineComposer (composer)**

| Element | DreamFit (current) | CrowdFit (reference) |
|---|---|---|
| Avatar size | `h-8 w-8` (smaller) | `h-9 w-9` (matches feed cards) |
| Avatar border | `border border-border` (thin line) | `ring-2 ring-primary/20` (matches feed) |
| Input gap | `gap-3 px-4` | `gap-3 px-3` |
| Padding | `px-4` | `px-3` (consistent with feed) |

---

### Plan

**1. Fix `DreamToolCard.tsx` — header layout**
- Change outer flex from `gap-3` to `gap-2` to match CrowdFit's two-level gap system
- Wrap the avatar + name block in `ProfileHoverCard` so clicking navigates to the user profile (same as CrowdFit)
- Move `TrailblazerBadge` outside the `ProfileHoverCard` wrapper, directly after it in the outer flex row

**2. Fix `DreamInlineComposer.tsx` — composer avatar**
- Change avatar from `h-8 w-8` to `h-9 w-9` so the composer avatar matches the feed card avatar size exactly
- Replace `border border-border` with `ring-2 ring-primary/20` to match the ring style used on feed cards
- Align `px-4` padding to `px-3` to match the feed card left-edge alignment

**Files to change:**
- `src/components/dreamfit/DreamToolCard.tsx`
- `src/components/dreamfit/DreamInlineComposer.tsx`
