
## Signal Count-Gated Verbiage System

### The Problem
Showing `X% of the FMLY greenlighted this` or `X% of the FMLY would run it back` is misleading with small sample sizes. A single vote = 100%, which is noise, not signal.

### The New 3-Tier System

| Signal Count | Label | Summary Line |
|---|---|---|
| 1–10 | `SIGNAL RESOLVING...` | Percentage shown grayed out — tells user we need more data |
| 11–50 | `{n} SIGNALS DETECTED` | Focuses on volume, not percentage |
| 51+ | `{pct}% UNIT CONSENSUS` | Sample is large enough to claim a community truth |

---

### All Touch Points to Update

**1. `DreamSignal.tsx` — DreamFit**

Three places:

**Idle state** (line ~211): `Demand Strength: {demandStrength}%`
- Replace with the new tier label logic

**Done state** (lines ~124–127): `Demand Strength: {pct}%` header label + `"${pct}% of the FMLY greenlighted this."` / `"Only ${pct}% greenlighted this."` summary line
- Replace both with tier-aware versions

---

**2. `HookReview.tsx` — CrowdFit (inline on post card)**

**Done state** (lines ~209–219):
```
Signal Strength: {replayPct}%
{replayPct}% of the FMLY would run it back.  ← or →  {replayPct}% are feeling this.
```
- Replace label and summary line with tier-aware versions

**Pre-resolved / Billboard mode** — `showPreResolved` renders a scoreboard directly from `preResolved` prop. Need to check if this also renders a % summary line and apply the same logic.

---

**3. `HookReviewsSheet.tsx` — CrowdFit reviews slide-up sheet**

Two places:

- **Stat card** (lines ~294–301): `Signal Strength` card header + `{replayPct}%` value + `"of the FMLY would run it back."` / `"are feeling this."` sub-label
- These are inside the full reviews sheet so they also need the tier-aware copy

---

### Shared Helper Function

A single pure function will be created and used in all three files to keep the logic consistent and easy to update later:

```typescript
function getSignalVerbiage(total: number, pct: number, context: "dreamfit" | "crowdfit") {
  if (total <= 10) {
    return {
      label: "SIGNAL RESOLVING...",
      pctDisplay: `${pct}%`,   // shown grayed out
      summary: "Not enough signals yet to read the room.",
      tier: "resolving"
    };
  }
  if (total <= 50) {
    return {
      label: `${total} SIGNALS DETECTED`,
      pctDisplay: null,         // hide percentage
      summary: context === "dreamfit"
        ? `${total} members have weighed in.`
        : `${total} members have signaled.`,
      tier: "detected"
    };
  }
  // 51+
  const verb = context === "dreamfit" ? "greenlighted" : "would run it back";
  return {
    label: `${pct}% UNIT CONSENSUS`,
    pctDisplay: `${pct}%`,
    summary: pct >= 50
      ? `${pct}% of the unit ${verb}.`
      : `Only ${pct}% ${context === "dreamfit" ? "greenlighted" : "are feeling"} this.`,
    tier: "consensus"
  };
}
```

This helper will be inlined (copy-pasted) into each file since they're in different directories — no need for a shared utils file.

---

### Visual Treatment for "RESOLVING" tier

When `tier === "resolving"`:
- The percentage shown is `opacity-50` / `text-muted-foreground` to visually communicate "unreliable data"
- The label `SIGNAL RESOLVING...` uses the existing `font-mono uppercase tracking-wider` styling

---

### Files to Change

- `src/components/dreamfit/DreamSignal.tsx` — idle state label + done state label + done state summary line
- `src/components/songfit/HookReview.tsx` — done state label + summary line (and pre-resolved billboard display if it renders a summary)
- `src/components/songfit/HookReviewsSheet.tsx` — stat card label + percentage value + sub-label copy
