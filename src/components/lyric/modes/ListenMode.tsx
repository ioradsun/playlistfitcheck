import { VolumeX } from "lucide-react";
import type { ModeContext } from "./types";

/**
 * Listen mode — renders the live visual canvas + interaction indicators.
 *
 * Structure:
 *   - Main canvas (zIndex 1): the engine paints visuals here
 *   - Text canvas (zIndex 2): the engine paints lyric text here
 *   - Muted indicator (zIndex 40): transient overlay when user mutes
 *
 * Unlike the overlay modes (Moments/Results/Empowerment), ListenMode does NOT
 * use ModePanel. Canvases paint at the base compositing layer, not above it.
 * The poster (zIndex 1, mounted by LyricDanceEmbed) provides the fallback visual
 * until the engine starts painting.
 *
 * Canvas refs are owned by LyricDanceEmbed (engine lifecycle needs them stable
 * across re-renders). This component attaches them to the DOM elements.
 */
export function ListenMode({ ctx }: { ctx: ModeContext }) {
  const { canvasRef, textCanvasRef, effectiveMuted, showMuteIndicator } = ctx;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1 }}
      />
      <canvas
        ref={textCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 2 }}
      />
      {effectiveMuted && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.5)",
            borderRadius: "50%",
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: showMuteIndicator ? 0.8 : 0,
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
            zIndex: 40,
          }}
        >
          <VolumeX size={20} color="white" />
        </div>
      )}
    </>
  );
}
