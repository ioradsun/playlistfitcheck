

## Plan: Comment Enter-to-Send + Fire Icon Toggle for React Button

### Changes

**1. Enter-to-send comments** — already works in both files. The `onKeyDown` handlers in `LazySpotifyEmbed.tsx` (line 191) and `LyricDanceEmbed.tsx` (line 827) both handle `Enter` to call `onCanvasSubmit`. No change needed here.

**2. Replace "React" text with fire icon (all locations)**

Import `Flame` and `X` from `lucide-react` in both files. Replace every `<span>React</span>` button with a `Flame` icon (greyscale outline style: `text-white/30`, no fill). When the reaction panel is open, show `X` icon instead of `Flame`.

#### `src/components/songfit/LazySpotifyEmbed.tsx`
- Add `Flame, X` to lucide imports
- **State 3 (post-vote default, line 239-249)**: Replace `<span>React</span>` with conditional icon: `externalPanelOpen ? <X size={14} /> : <Flame size={14} />`
- **State 2 (panel open, line 205-224)**: The "React" button here (when `canvasNote` is empty) also shows "React" — replace with `<X size={14} />` since panel is open in this state

#### `src/components/lyric/LyricDanceEmbed.tsx`
- Add `Flame, X` to lucide imports (if not already there)
- **Card mode post-vote default (line 872-879)**: Replace `<span>React</span>` with `<Flame size={14} className="text-white/30 group-hover:text-white/60" />`
- **Card mode comment focused (line 839-846)**: The "Send" button stays as text when there's input. The close action button (when no text) becomes `<X size={14} />`
- **Standalone mode (line 905-912)**: Replace `<span>React</span>` with conditional: `reactionPanelOpen ? <X size={14} /> : <Flame size={14} />`

### Summary of icon states
- **Panel closed**: Greyscale `Flame` outline icon
- **Panel open**: `X` icon (closes panel on click)
- Existing click handlers remain unchanged — they already toggle the panel open/closed

