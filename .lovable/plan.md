
## Changes to Signal Status Verbiage in Both Comments Panels

### What's Changing

The Signal Status card in both comments panels (DreamFit and CrowdFit) will collapse to a **single combined line** per tier, removing the separate `RESOLVING {n}/50` label row and merging everything into one compact string.

#### New Tier Format

| Tier | Line 1 (label) | Line 2 (summary) |
|---|---|---|
| Resolving (≤10) | *(removed)* | `CALIBRATING REPLAY FIT · {n}/50 SIGNALS NEEDED` |
| Resolving (≤10) DreamFit | *(removed)* | `CALIBRATING BUILD FIT · {n}/50 SIGNALS NEEDED` |
| Detected (11–49) | *(removed)* | `CALIBRATING REPLAY FIT · {n}/50 SIGNALS NEEDED` |
| Detected (11–49) DreamFit | *(removed)* | `CALIBRATING BUILD FIT · {n}/50 SIGNALS NEEDED` |
| Consensus (50+) | `CONSENSUS REACHED` | `{pct}% FMLY REPLAY FIT` / `{pct}% FMLY BUILD FIT` |

The `bigDisplay` value (the large bold number) stays as-is (`{pct}%` for resolving/consensus, unchanged for detected).

---

### Files to Change

**1. `src/components/dreamfit/DreamComments.tsx`** — `getSignalVerbiage` function

- Resolving: `label` → `"CONSENSUS REACHED"` only for consensus; for resolving/detected collapse into `summary` only as `CALIBRATING FIT · {n}/50 SIGNALS NEEDED`
- Specifically, update `label` and `summary` strings, remove the now-redundant separate label line from the rendered stat card (or set `label` to `""` / `undefined` so the render loop skips it)

**2. `src/components/songfit/HookReviewsSheet.tsx`** — inline `verbiage` object (lines 293–297)

- Same restructure: resolving/detected tiers get a single combined `summary` string; consensus tier keeps its two-line format

---

### Technical Detail

The stat card currently renders two `<p>` tags below the big number — `verbiage.label` and `verbiage.summary`. The cleanest approach is:

- For **resolving** and **detected**: set `label` to `undefined`/`""` and put the full combined string in `summary`
- For **consensus**: keep `label = "CONSENSUS REACHED"` and `summary = "{pct}% FMLY REPLAY/BUILD FIT"`
- The render side already uses `truncate`, so both lines display cleanly on one line each without wrap

No schema changes, no new components — purely string/logic updates in two files.
