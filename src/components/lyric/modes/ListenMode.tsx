import { useEffect, useRef, useState } from "react";
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

  // Fullscreen pill auto-fade: visible briefly on mount and on canvas tap,
  // then fades to near-invisible so it stops competing with the video.
  // Rehydrates on any pointer event anywhere in the embed so users can always
  // find it with a tap, without it permanently occupying the top-right corner.
  const [pillVisible, setPillVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const showThenFade = () => {
      setPillVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setPillVisible(false), 2000);
    };
    // Show on mount, then fade.
    showThenFade();

    // Any pointer activity at the document level rehydrates the pill. Using
    // the document rather than the canvas avoids coupling to canvas event
    // plumbing and handles taps on mode overlays too.
    const onActivity = () => showThenFade();
    document.addEventListener("pointerdown", onActivity);

    return () => {
      document.removeEventListener("pointerdown", onActivity);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

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
          border: "none",
          background: "rgba(0,0,0,0.30)",
          color: "rgba(255,255,255,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: pillVisible ? 0.85 : 0.15,
          transition: "opacity 400ms ease",
          cursor: "pointer",
        }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </>
  );
}
