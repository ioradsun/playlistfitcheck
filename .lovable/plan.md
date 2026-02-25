

# Fix Hook Battle Text Stacking

## The Problem

In the `useHookCanvas.ts` rendering code, `computeStackedLayout()` is called and correctly detects when text needs to be stacked into multiple lines (e.g., when the canvas is narrow, like in a 50/50 battle split). However, the **actual drawing code completely ignores the stacked lines**. It always splits the full `activeLine.text` into individual words and lays them out **horizontally on a single row** (lines 450-456). The stacked layout is only used for font size calculation -- the multi-line positioning is never applied.

This means in a battle view where each canvas is ~half the screen width (well under the 600px stacking threshold), the text tries to render all words on one line, causing them to overlap and run into each other.

## The Fix

**File: `src/hooks/useHookCanvas.ts`** (lines ~370-470)

Replace the single-line horizontal word layout with a stacked-aware layout that:

1. When `stackedLayout.isStacked` is `true`, renders each stacked line on its own vertical row
2. Each stacked line's words are measured and positioned horizontally within that row
3. The vertical spacing uses the system style's `lineHeight` multiplied by font size
4. The total block is vertically centered on the canvas (same `lineY` center point)

### Current flow (broken):
```text
computeStackedLayout() --> returns { lines: ["line 1", "line 2"], isStacked: true }
                      |
                      v  (only fs is used)
words = activeLine.text.split(" ")  <-- ignores stacked lines
positions = all words on single horizontal row at lineY
```

### Fixed flow:
```text
computeStackedLayout() --> returns { lines: ["line 1", "line 2"], isStacked: true }
                      |
                      v
if (isStacked) {
  for each stacked line:
    words = line.split(" ")
    positions = horizontal row at lineY + row offset
}
else {
  words = activeLine.text.split(" ")  // existing single-line logic
  positions = single horizontal row at lineY
}
```

### Specific changes:

**In `useHookCanvas.ts`, around lines 370-470** -- restructure the word positioning block:

- Move the existing `words`, `measureLineWidth`, and position calculation into an `else` branch (non-stacked case, unchanged)
- Add a new `if (stackedLayout.isStacked)` branch that:
  - Calculates vertical offset for each stacked line: `rowY = lineY - totalBlockHeight/2 + rowIndex * rowHeight + rowHeight/2`
  - For each stacked line, measures its words, centers them horizontally, and pushes `{x, y}` positions
  - Builds a flat `words[]` array and matching flat `positions[]` array so the existing per-word rendering loop (lines 458-470) works without changes
- The orbital layout path remains in the non-stacked branch only (orbital doesn't apply to narrow stacked views)
- The `workingFontSize` shrink loop is kept but uses the stacked font size when stacked

No other files need to change. The `computeStackedLayout` function in `SystemStyles.ts` already works correctly -- it just wasn't being used for rendering.
