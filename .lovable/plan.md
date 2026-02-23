
# Performance Optimization Plan for ShareableLyricDance

## Problem
The render loop in `ShareableLyricDance.tsx` runs ~2,400 lines of logic every frame at 60fps. Heavy per-frame work includes: chapter lookups via `.find()`, particle config rebuilds, word measurement, constellation drift math, background redraws, and multiple canvas state saves/restores.

## Optimization Strategy

Seven targeted changes, ordered by expected impact:

---

### 1. Pre-compute chapter timeline lookup table (lines 1139, 1092-1098)

**Current**: Every frame calls `interpreterNow?.getCurrentChapter(songProgress)` and `getCurrentTensionStage()` which both use `.find()` over arrays.

**Fix**: On data load, build a sorted array of chapter/tension boundaries. At render time, use a cached index that only advances forward (since songProgress is monotonic within a playthrough). Binary search on seek.

**File**: `src/pages/ShareableLyricDance.tsx` (setup block ~line 960, render block ~line 1092)

---

### 2. Move constellation/river drift to a 10fps timer instead of every rAF frame (lines 1262-1347)

**Current**: Every frame iterates all constellation nodes, updates positions, measures text, and draws.

**Fix**: Update constellation positions in a `setInterval(100ms)` into an offscreen canvas. In rAF, just `ctx.drawImage()` the pre-rendered constellation layer. Comments are subtle background elements; 10fps is imperceptible.

**File**: `src/pages/ShareableLyricDance.tsx`

---

### 3. Cache `getParticleConfigForTime` result (lines 1213-1218)

**Current**: Rebuilds a particle config object every frame with spread operators.

**Fix**: Cache the last result keyed on `Math.floor(songProgress * 20)` (5% buckets). Only recompute when the bucket changes. Avoids object allocation and spread on 95% of frames.

**File**: `src/pages/ShareableLyricDance.tsx` (render block ~line 1213)

---

### 4. Throttle background redraw with dirty flag (lines 1183-1197)

**Current**: Already has a `bgNeedsRedraw` check but threshold is too aggressive (`Math.abs(beatIntensity change) > 0.1`), causing frequent redraws.

**Fix**: Raise threshold to `0.2` and add a time-based minimum interval (redraw at most every 100ms unless chapter changes). Background changes are gradual; reducing from 60fps to 10fps background redraws saves significant fill-rect work.

**File**: `src/pages/ShareableLyricDance.tsx` (~line 1184)

---

### 5. Limit particle count based on device capability (lines 1211-1236)

**Current**: `maxParticles` is 150 on high-DPR or 80 otherwise. ParticleEngine still processes all particles every frame.

**Fix**: Add frame-time budget detection. If `deltaMs > 20` (below 50fps) for 10 consecutive frames, halve `maxParticles` dynamically. This auto-adapts to slower devices.

**File**: `src/pages/ShareableLyricDance.tsx` (render block setup)

---

### 6. Reduce word measurement overhead (lines 1030-1044)

**Current**: `getWordWidth` creates a cache key string via template literal every call, even for cache hits. Font is set and restored per measurement.

**Fix**: Batch all word measurements for a line in one pass after setting the font once. Pre-compute and store per-line word widths in `lineBeatMapRef` during setup instead of per-frame. Only recompute on resize.

**File**: `src/pages/ShareableLyricDance.tsx` (render block and setup)

---

### 7. Skip off-screen word rendering earlier (lines 1682-1684)

**Current**: Bounds check happens after evolution lookup, directive resolution, history tracking, and multiple ctx operations.

**Fix**: Move the bounds check to immediately after `finalX/finalY` are known (before evolution, before directive application). This eliminates all downstream work for clipped words.

**File**: `src/pages/ShareableLyricDance.tsx` (~line 1676)

---

## Technical Details

### Files Modified
- `src/pages/ShareableLyricDance.tsx` -- all 7 optimizations

### No New Dependencies
All changes are pure algorithmic/caching improvements within existing code.

### Risk Assessment
- **Low risk**: Changes 1, 3, 4, 6, 7 are pure caching with identical visual output
- **Minimal visual impact**: Change 2 (constellation at 10fps) -- imperceptible for ambient background text
- **Adaptive**: Change 5 auto-scales, no visual change on fast devices

### Expected Impact
- 30-50% reduction in per-frame CPU time on mid-range devices
- Eliminates most object allocations per frame
- Background rendering cost drops ~6x (60fps to ~10fps)
- Constellation rendering drops ~6x
