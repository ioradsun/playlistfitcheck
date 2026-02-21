

# Comment Layer Redesign — Constellation, River, and Arrival

This reworks the entire comment rendering system on the Hook canvas to match the precise animation specification. The current implementation has approximate versions of these concepts but with wrong parameters, wrong lifecycle, and missing the center-entry animation.

## What Changes

### 1. Constellation Nodes (Layer 1, drawn first)

**Current**: Nodes orbit in a ring at 0.35-0.48 radius, capped at 15% opacity, 8px font, with fly-in from edges.

**New**: Every comment is a permanent node. Position seeded deterministically from `submitted_at`. Newest cluster in center 40%, oldest drift to outer 60%. Opacity 6%-12% based on age (linear decay). Drift speed 0.015-0.04px/frame at a permanent seeded angle. Font: 13px `system-ui`. No orbit behavior -- just linear drift. No overlap avoidance needed (opacity is low enough). No fly-in from edges.

### 2. River Rows (Layer 1, drawn second)

**Current**: 4 rows at y=20/40/60/80%, speeds 0.3-0.6, opacity ~0.13-0.07, 5 comments per row, 13px font.

**New**: 4 rows at y=25/38/62/75% (avoids center lyric zone). Speeds: 0.4/0.6/0.8/1.1 px/frame. Opacities: 18/14/11/8%. Rows 1,3 scroll left; rows 2,4 scroll right. Min 120px spacing. Font: 15px `system-ui`. Comments wrap when exiting one edge, re-entering the opposite.

### 3. New Submission Animation (Layer 1, drawn last)

**Current**: Spawns from random edge, flies to center, settles, then joins constellation orbit.

**New**: Appears dead center at 28px, 100% opacity white. Holds 2000ms. Over 8000ms, drifts linearly toward its permanent constellation position while shrinking 28px to 15px and fading 100% to 18%. Then joins the river. Over following minutes, continues fading toward 6% and transitioning from river scroll to constellation drift.

## Technical Changes

### `src/pages/ShareableHook.tsx`

**Types (lines 54-84)**: Rewrite `ConstellationNode` to include:
- `submittedAt: number` (timestamp)
- `seedX, seedY` (permanent position from PRNG)
- `driftSpeed, driftAngle` (permanent from PRNG)
- `phase: "center" | "transitioning" | "river" | "constellation"`
- `phaseStartTime: number`
- `riverRowIndex: number` (assigned row for river phase)
- `currentSize: number`

Remove `RiverRow` interface -- river rows become a rendering pass over nodes that are in "river" phase, plus a static config.

**Build constellation (lines 484-516)**: Rewrite to:
- Seed each node's position using `mulberry32(hashSeed(c.id))` from `submitted_at`
- Newest comments: seed position within center 40% of canvas
- Oldest comments: seed position in outer 60%
- Compute `driftSpeed` (0.015-0.04) and `driftAngle` (0-360) from the same PRNG
- Compute opacity as linear interpolation between 6% (oldest) and 12% (newest)
- All existing comments start in "constellation" phase

**River config**: Define 4 static river rows with fixed y-positions, speeds, opacities, and directions. Recent comments (last N) are assigned to river rows and rendered as a separate pass.

**Canvas draw — constellation pass (lines 250-308)**: Replace with:
- Simple linear drift: `node.x += cos(driftAngle) * driftSpeed`, `node.y += sin(driftAngle) * driftSpeed`
- Wrap position when exiting canvas bounds
- Draw at 13px system-ui, white, node's age-based opacity (6-12%)
- No overlap detection needed (very low opacity)
- No orbit calculation

**Canvas draw — river pass (lines 310-324)**: Replace with:
- 4 rows at y = 25/38/62/75%
- Pull recent comments for each row
- Scroll with alternating directions (rows 1,3 left; rows 2,4 right)
- 15px font, row-specific opacity
- 120px minimum spacing, wrapping at edges

**Canvas draw — new submission (within constellation loop)**: Add phase handling:
- "center": Draw at canvas center, 28px, 100% opacity, no movement. After 2000ms, transition to "transitioning"
- "transitioning": Over 8000ms, linearly interpolate position from center to river position, size 28px to 15px, opacity 100% to 18%. After 8000ms, move to "river"
- "river": Scroll with assigned row. Over time (minutes), gradually decay opacity toward constellation opacity and shift drift angle from horizontal to permanent constellation angle
- "constellation": Standard constellation rendering

**Submit handler (lines 610-651)**: Rewrite spawn logic:
- New node starts at phase "center" with `phaseStartTime = Date.now()`
- Position: `x = 0.5, y = 0.5` (canvas center)
- `currentSize = 28`
- No edge spawning

### Rendering Order (within the existing canvas draw effect)

1. Constellation nodes (phase "constellation") -- lowest opacity, drawn first
2. River rows (phase "river" + static recent comments) -- medium opacity
3. New submission (phase "center" or "transitioning") -- highest opacity, drawn last

### What Gets Removed

- The `doesOverlap` / `placedRects` collision detection system
- The "flying" / "settling" / "drifting" phase system
- The orbit calculation (`orbitRadius`, `orbitSpeed`, `baseAngle`)
- The edge-spawn logic in `handleSubmit`
- The `flySpeed`, `settleTimer`, `scale` fields from `ConstellationNode`
- The `RiverRow` interface (replaced by static config + phase-based rendering)

### What Does NOT Change

- No blur, glow, or shadow on comments
- Comments always white -- no palette colors
- Layer 2 (lyrics/effects) renders on top, making overlap architecturally impossible
- No physics interaction -- comments are purely opacity + linear drift
- Font: `system-ui, -apple-system, sans-serif` -- never the artist fingerprint font
- Text rendered exactly as typed -- no transform

