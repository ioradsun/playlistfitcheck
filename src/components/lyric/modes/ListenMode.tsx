import { Maximize2, Minimize2, VolumeX } from "lucide-react";
import type { ModeContext } from "./types";

/**
 * Listen mode — overlay-only UI.
 *
 * The live visual surface (canvas) is mounted by LyricDanceEmbed and remains
 * persistent across cardMode changes. ListenMode only renders additive controls
 * above that surface.
 */
export function ListenMode({ ctx }: { ctx: ModeContext }) {
  const { muted, showMuteIndicator, isFullscreen, onToggleFullscreen } = ctx;

  return (
    <>
      {muted && (
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFullscreen();
        }}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 45,
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(0,0,0,0.35)",
          color: "rgba(255,255,255,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </>
  );
}
