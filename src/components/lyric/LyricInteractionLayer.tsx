import { useMemo, useRef } from "react";
import type { Moment } from "@/lib/buildMoments";

interface LyricInteractionLayerProps {
  variant: "embedded" | "fullscreen";
  danceId: string;
  moments?: Moment[];
  currentTimeSec?: number;
  durationSec?: number;
  palette?: string[];
  accent?: string;
  reactionData?: Record<string, { line: Record<number, number>; total: number }>;
  player?: any;
  isLive?: boolean;
  hasFired?: boolean;
  totalFireCount?: number;
  songEnded?: boolean;
  refreshKey?: number;
  sectionColors?: Record<number, string>;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onSeekTo?: (sec: number) => void;
  onPause?: () => void;
  onResume?: () => void;
  source?: "feed" | "shareable" | "embed";
}

function formatTime(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function FireButton({
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
}: {
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
}) {
  const holdStartRef = useRef<number | null>(null);

  const handleFireStart = () => {
    holdStartRef.current = performance.now();
    onFireHoldStart?.();
  };

  const handleFireEnd = () => {
    const start = holdStartRef.current;
    holdStartRef.current = null;
    if (start == null) return;
    const holdMs = Math.max(0, performance.now() - start);
    if (holdMs < 180) {
      onFireTap?.();
      return;
    }
    onFireHoldEnd?.(holdMs);
  };

  return (
    <button
      type="button"
      onPointerDown={handleFireStart}
      onPointerUp={handleFireEnd}
      onPointerLeave={handleFireEnd}
      onTouchEnd={handleFireEnd}
      aria-label="Fire"
      style={{
        width: 50,
        height: 50,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,170,0,0.3)",
        background: "rgba(255,150,0,0.1)",
        color: "rgba(255,220,140,0.85)",
        fontSize: 20,
      }}
    >
      🔥
    </button>
  );
}

export function LyricInteractionLayer({
  variant,
  moments,
  currentTimeSec = 0,
  durationSec = 0,
  reactionData = {},
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
}: LyricInteractionLayerProps) {
  const isFullscreen = variant === "fullscreen";
  const safeMoments = moments ?? [];

  const currentMomentIdx = useMemo(() => {
    for (let i = safeMoments.length - 1; i >= 0; i -= 1) {
      if (currentTimeSec >= safeMoments[i].startSec - 0.1) return i;
    }
    return 0;
  }, [safeMoments, currentTimeSec]);

  const totalFires = useMemo(
    () => Object.values(reactionData).reduce((sum, data) => sum + data.total, 0),
    [reactionData],
  );

  const canPrev = currentMomentIdx > 0;
  const canNext = currentMomentIdx < safeMoments.length - 1;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingBottom: isFullscreen ? "env(safe-area-inset-bottom, 0px)" : "8px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          padding: "0 16px 4px",
          fontSize: 9,
          color: "rgba(255,255,255,0.22)",
          pointerEvents: "none",
        }}
      >
        <span style={{ fontFamily: "monospace" }}>{formatTime(currentTimeSec)}</span>
        <span>
          moment {Math.min(safeMoments.length, currentMomentIdx + 1)} of {safeMoments.length}
          {totalFires > 0 && (
            <span style={{ color: "rgba(255,215,0,0.4)", marginLeft: 8 }}>{totalFires} fires</span>
          )}
        </span>
        <span style={{ fontFamily: "monospace" }}>{formatTime(durationSec)}</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "6px 0",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: canPrev ? 1 : 0.3,
          }}
          disabled={!canPrev}
          onClick={() => {
            const m = safeMoments[currentMomentIdx - 1];
            if (m) onSeekTo?.(m.startSec);
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 20, lineHeight: 1 }}>‹</span>
        </button>

        <FireButton
          onFireTap={onFireTap}
          onFireHoldStart={onFireHoldStart}
          onFireHoldEnd={onFireHoldEnd}
        />

        <button
          type="button"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: canNext ? 1 : 0.3,
          }}
          disabled={!canNext}
          onClick={() => {
            const m = safeMoments[currentMomentIdx + 1];
            if (m) onSeekTo?.(m.startSec);
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 20, lineHeight: 1 }}>›</span>
        </button>
      </div>
    </div>
  );
}
