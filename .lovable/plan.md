

# Director's Cut Screen

## Overview
After Song DNA analysis reveals the AI's recommended physics system, a new full-screen "Director's Cut" overlay lets the artist see all 5 physics systems rendered simultaneously on the same hook. They pick the one that feels right -- no sliders, no parameters. Just instinct.

## Flow Change

```text
Upload --> Transcribe --> Song DNA Reveal --> Director's Cut --> Hook Dance Playback --> Export
```

The "See Hook Dance" button in Song DNA will now open the Director's Cut screen instead of jumping directly into the single-system Hook Dance.

## New Component: `DirectorsCutScreen.tsx`

A full-screen overlay (`fixed inset-0 z-50`) with:

- **5 mini-canvases** in a 2-col grid (2 / 2 / 1 centered) on desktop; stacked vertically on mobile
- Each canvas runs its own `PhysicsIntegrator` with the same beat grid, same lyrics, same hook window -- just a different system
- **Silent playback**: audio plays once (shared), all 5 canvases render from the same `audio.currentTime`
- **AI Pick badge**: the AI-recommended system gets a small "AI PICK" label above its canvas in red
- **System labels**: Bebas Neue font, with poetic subtitle underneath (e.g., "FRACTURE -- Your words are glass")
- **Selection**: tap/click a canvas to highlight it (thin red border, white label). Hover scales to 1.02x
- **"THIS ONE" button**: glows red when a system is selected. Clicking it transitions to the full Hook Dance with that system applied as an override

### System Variants (derived from AI base spec)

Each system starts from the AI's base `PhysicsSpec` params and applies multipliers:

| System | Modifications |
|---|---|
| FRACTURE | Use spec params as-is |
| PRESSURE | mass x1.2, elasticity x0.8 |
| BREATH | damping x1.3, heat x1.6 |
| COMBUSTION | heat x2.0, brittleness x0.5 |
| ORBIT | elasticity x1.4, damping x0.7 |

### Performance Strategy

- **Desktop (hardwareConcurrency >= 4)**: Render all 5 canvases. Non-hovered canvases render at 0.5x resolution (CSS scaled up). Hovered/selected canvas gets full resolution.
- **Mobile / low-end (hardwareConcurrency < 4)**: Show one canvas at a time with left/right swipe navigation. System name + subtitle visible; dots indicator for position.

### Deterministic Seeding

Each system gets a unique but deterministic seed: `baseSeed + systemIndex` (0-4), ensuring each canvas produces different but reproducible visuals.

## Changes Summary

### New Files
1. **`src/components/lyric/DirectorsCutScreen.tsx`** -- The full Director's Cut overlay component. Contains:
   - 5 mini-canvas elements, each with its own `PhysicsIntegrator` instance
   - A shared `requestAnimationFrame` loop driving all 5 integrators from one `audio.currentTime`
   - System labels with Bebas Neue font (loaded via Google Fonts or CSS)
   - Low-end device detection and single-canvas fallback mode
   - "THIS ONE" button that returns the selected system key

### Modified Files
2. **`src/components/lyric/LyricDisplay.tsx`** -- Wire the Director's Cut into the flow:
   - "See Hook Dance" button opens `DirectorsCutScreen` instead of directly starting `HookDanceEngine`
   - New state: `showDirectorsCut: boolean`
   - On system selection from Director's Cut, set `hookDanceOverrides.system` to the chosen system and launch the existing Hook Dance playback
   - The existing `HookDanceCanvas` and `HookDanceExporter` remain unchanged

3. **`index.html`** -- Add Bebas Neue font link (Google Fonts) for the system labels

### No Backend Changes
The AI prompt does NOT need to change. The current v6 spec already provides `effect_pool` + `logic_seed` which the Director's Cut will reuse per-system. Each canvas uses the same pool but with its own seeded index offset, creating visual variety without requiring 5 separate effect sequences from the AI.

## Technical Details

### Shared Audio Architecture
One `HTMLAudioElement` plays the hook region. A single `requestAnimationFrame` loop reads `audio.currentTime` and fans it out to all 5 `PhysicsIntegrator` instances. Each integrator scans the same `BeatTick[]` array independently with its own `beatIndex` pointer.

### Canvas Rendering
Each mini-canvas gets its own draw pass using the existing `EffectRegistry`. The effect key resolution uses the same `(logic_seed + systemOffset + lineIndex * 7) % pool.length` formula, where `systemOffset` varies per system to create visual differentiation.

### Transition to Playback
When the artist clicks "THIS ONE", the Director's Cut fades out, the selected system key is passed as a `hookDanceOverrides.system` override, and the existing full-screen `HookDanceCanvas` takes over with audio. This reuses all existing infrastructure -- no new engine code needed.

