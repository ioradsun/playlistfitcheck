
## Signal Engine — Dual-Meter Status Card

### What's changing

Both detail panels (CrowdFit's `HookReviewsSheet.tsx` and DreamFit's `DreamComments.tsx`) get a rebuilt Signal Status card. The secondary raw-count card in HookReviewsSheet is already gone; this replaces the primary card logic in both files.

---

### Data model (per panel)

| Variable | CrowdFit source | DreamFit source |
|---|---|---|
| `signals` | `rows.filter(r => r.would_replay).length` | `dream.greenlight_count` |
| `total` | `rows.length` | `dream.backers_count` |
| `threshold` | 50 (constant) | 50 (constant) |
| `percentage` | `round((signals / total) * 100)` | `round((greenlight / backers) * 100)` |

---

### State logic

**Resolving** (`signals < 50`)
- Primary display: `CALIBRATING` (animated — see below)
- Metadata line: `REPLAY FIT · {signals}/50 SIGNALS · {signals}/{total} RESONANCE`
- DreamFit variant: `BUILD FIT · …`
- If `total = 0`: omit the `· {signals}/{total} RESONANCE` fragment
- Never show a `%` value

**Consensus** (`signals ≥ 50`)
- Primary display: `{percentage}%` (static, bold)
- Metadata line: `CONSENSUS REACHED · {percentage}% REPLAY FIT · {signals}/{total} RESONANCE`

---

### Tooltip

- Attached **only** to the `{signals}/{total}` fraction span
- Uses Radix `Tooltip` (already in the project) with `delayDuration={350}` (matching project standard)
- Copy: `{signals} of {total} listeners signaled this track.`
- DreamFit copy: `{signals} of {total} members backed this feature.`
- Wrapped in `TooltipProvider` scoped to just the card

---

### CALIBRATING Animation

Added as a Tailwind keyframe in `tailwind.config.ts`:

```text
@keyframes signal-pulse {
  0%, 100%  → opacity: 1,   filter: blur(0px)
  50%       → opacity: 0.55, filter: blur(0.3px)
}
duration: 1400ms, timing: ease-in-out, infinite
```

Applied only when `signals < 50` via class `animate-signal-pulse`.

Respects `prefers-reduced-motion` — the keyframe uses `@media (prefers-reduced-motion: reduce)` override to set `animation: none`.

No dot tick accent (keeping it clean for now).

---

### Consensus lock-in transition

When signals crosses 50 the display switches. Since this is a detail panel (not a live feed), the transition happens on panel open. No cross-fade needed here — the panel always opens with fresh data. The CSS class switch itself provides the natural instant reveal.

If a future requirement is live realtime transition within the panel, we can add `framer-motion` `AnimatePresence` at that point.

---

### Files to modify

1. **`tailwind.config.ts`** — add `signal-pulse` keyframe + animation token + `prefers-reduced-motion` disable
2. **`src/components/songfit/HookReviewsSheet.tsx`** — rebuild the stat card with dual variables, tooltip on resonance fraction, CALIBRATING animation
3. **`src/components/dreamfit/DreamComments.tsx`** — same rebuild, BUILD FIT verbiage, `backers_count` as total

---

### What stays the same

- Card border, radius, padding (`rounded-2xl border border-border/50 bg-card px-4 py-3.5`)
- "Signal Status" label at top (10px mono, muted/50)
- Everything below the card (comments list, input footer)
- No database changes required
