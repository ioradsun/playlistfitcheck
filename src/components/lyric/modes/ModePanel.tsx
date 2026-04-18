import type { CSSProperties, ReactNode } from "react";

interface ModePanelProps {
  /** Panel contents. Panel-specific layout, typography, padding go here. */
  children: ReactNode;
  /**
   * Scroll behavior.
   * - "y"    → content scrolls vertically (lists, long content)
   * - "none" → content does not scroll (default; centered forms, short content)
   */
  scroll?: "y" | "none";
  /**
   * Additional inline style overrides. Merged on top of ModePanel defaults.
   * Prefer panel-internal styling where possible.
   */
  style?: CSSProperties;
}

/**
 * Shared container for cardMode overlay panels.
 *
 * Owns the invariants every mode panel needs:
 *  - `position: absolute, inset: 0` — fills the card area
 *  - `zIndex: 50` — paints above poster (z:1), canvas (z:1), text canvas (z:2),
 *    DOM text (z:3); below modals (z:100+)
 *  - `background: "#0a0a0a"` — opaque, matches LyricDanceEmbed root
 *
 * If adding a new mode:
 *   1. Create `<ModeName>Mode.tsx` in this directory.
 *   2. Wrap top-level render in `<ModePanel>`.
 *   3. Pick `scroll="y"` for list content, omit for centered content.
 *   4. (Next PR: add entry to `registry.ts`.)
 */
export function ModePanel({ children, scroll = "none", style }: ModePanelProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "#0a0a0a",
        overflowY: scroll === "y" ? "auto" : "hidden",
        overflowX: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
