

# Lyric Video Creator — Full Redesign

The current composer is a cramped dialog with minimal controls. This redesign treats it as a proper creative tool with a clear step-by-step flow, full timeline control, and typographic customization — all while keeping the interface minimal and typography-led per the Editorial Studio aesthetic.

---

## User Flow

The composer becomes a **multi-step wizard** inside a wider dialog (or full-page panel), progressing through:

1. **Describe** — Enter a text prompt describing the visual vibe for the looping background
2. **Configure** — Pick aspect ratio, font, font size, clip region (or full song)
3. **Preview** — Live animated canvas preview with play/pause
4. **Export** — Generate and download

---

## Step 1: Describe the Visual

- A single textarea input: *"Describe the vibe for your video background"*
- Placeholder text pulled from song mood/metadata (e.g., "neon rain on dark streets")
- Below: Artist name and song title displayed as metadata (auto-filled, not editable here)
- A "Generate Background" button that calls the existing `lyric-video-bg` edge function with the user's prompt appended to the mood context

## Step 2: Configure

### Aspect Ratio Picker
Three tappable pill buttons, no icons:
- **9:16** — TikTok / Reels (default)
- **1:1** — Instagram / Square
- **16:9** — YouTube / Landscape

Each selection updates canvas dimensions:
| Ratio | Width | Height |
|-------|-------|--------|
| 9:16  | 1080  | 1920   |
| 1:1   | 1080  | 1080   |
| 16:9  | 1920  | 1080   |

### Clip Region (Timeline)
- A dual-handle slider spanning the full song duration (0 to last line's end time)
- Handles are draggable — user drags to select any region
- Minimum clip: 6 seconds. No maximum — can select the entire song
- The 6-second AI background loops seamlessly until the clip ends
- Time readout: `12.3s – 45.1s (32.8s)`
- Quick-action: "Full Song" button that snaps handles to 0 and max

### Font Selection
A horizontal row of tappable font name labels, each rendered in its own font:
- **Geist** (default, already loaded)
- **Mono** (Geist Mono, already loaded)
- **Serif** (Georgia / system serif)
- **Impact** (system Impact)

### Font Size
A simple slider: Small (48px) to Large (96px), defaulting to 72px. Label shows the current value.

## Step 3: Preview

- Canvas preview scaled to fit the dialog, maintaining the selected aspect ratio
- Artist name displayed top-left, song title top-right (small, 11px Geist Mono, uppercase tracking-widest — matching the app's metadata style)
- Bouncing word animation plays in the selected font and size
- The 6s background loops seamlessly
- Play/Pause tap overlay on the canvas

## Step 4: Export

- Single "Download Video" button
- During recording: progress bar with percentage
- The recorder renders frames for the full clip duration, looping the 6s background as needed
- Output: `.webm` file named `{artist}_{title}_lyric_video.webm`

---

## Technical Implementation

### File: `src/components/lyric/LyricVideoComposer.tsx` (rewrite)

**New state variables:**
- `step: 1 | 2 | 3 | 4` — wizard step
- `bgPrompt: string` — user's background description
- `aspectRatio: "9:16" | "1:1" | "16:9"` — selected ratio
- `fontFamily: string` — selected font (`"Geist"`, `"Geist Mono"`, `"Georgia"`, `"Impact"`)
- `fontSize: number` — 48–96, default 72
- `regionStart / regionEnd` — already exists, remove the 6–10s constraint

**Aspect ratio dimensions map:**
```typescript
const ASPECT_DIMS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1":  [1080, 1080],
  "16:9": [1920, 1080],
};
```

**Updated `drawFrame` function:**
- Accept `fontFamily`, `fontSize`, canvas width/height as parameters instead of hardcoded constants
- Draw artist name (top-left) and song title (top-right) in 11px Geist Mono, uppercase, with `tracking-widest` letter-spacing
- Use the selected font for lyrics instead of hardcoded Geist

**Updated recording logic:**
- Calculate total frames from full clip duration (not just 6–10s)
- Loop the background: the 6s AI-generated clip visual loops via `relTime % 6` for the Ken Burns / glow animation cycle
- The lyrics advance linearly through the full timeline

**Updated `lyric-video-bg` edge function:**
- Accept an additional `userPrompt` field in the request body
- Append the user's description to the AI image prompt for more targeted visuals

### File: `src/components/lyric/LyricDisplay.tsx`
- No changes needed — already passes all required props to the composer

### UI Styling
- Dialog width: `max-w-2xl` (wider to accommodate the preview + controls side by side or stacked)
- All labels: 11px Geist Mono, uppercase, `tracking-widest` — matching the app's metadata convention
- Buttons: 13px Geist Sans Bold, `tracking-[0.15em]`, no icons
- Hairline dividers between sections: `border-border/30`
- Aspect ratio pills: `bg-foreground text-background` when active, `bg-secondary` when inactive

