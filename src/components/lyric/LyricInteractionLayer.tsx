import { useEffect, useMemo, useRef, useState } from "react";
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
  player,
}: {
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  player?: any;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);
  const [fireFlash, setFireFlash] = useState(false);
  const [fireHolding, setFireHolding] = useState(false);
  const [fireShrink, setFireShrink] = useState(false);
  const [sparks, setSparks] = useState<Array<{ id: number; xOffset: number; durationMs: number }>>([]);
  const sparkIdRef = useRef(0);

  const spawnFireSparks = (count = 5) => {
    for (let i = 0; i < count; i += 1) {
      const id = sparkIdRef.current++;
      const durationMs = 500;
      const xOffset = (Math.random() - 0.5) * 16;
      setSparks((prev) => [...prev, { id, xOffset, durationMs }]);
      window.setTimeout(() => {
        setSparks((prev) => prev.filter((spark) => spark.id !== id));
      }, durationMs);
    }
  };

  const handleFireStart = () => {
    holdStartRef.current = performance.now();
    setFireHolding(true);
    setFireFlash(false);
    spawnFireSparks(5);
    player?.startContinuousFire?.();
    onFireHoldStart?.();
    holdTickRef.current = window.setInterval(() => {
      spawnFireSparks(2);
    }, 100);
  };

  const handleFireEnd = () => {
    if (holdTickRef.current != null) {
      window.clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }
    player?.stopContinuousFire?.();
    setFireHolding(false);
    const start = holdStartRef.current;
    holdStartRef.current = null;
    if (start == null) return;
    const holdMs = Math.max(0, performance.now() - start);
    if (holdMs < 180) {
      spawnFireSparks(6);
      player?.fireMoment?.();
      setFireFlash(true);
      setFireShrink(true);
      window.setTimeout(() => setFireShrink(false), 100);
      window.setTimeout(() => setFireFlash(false), 300);
      onFireTap?.();
      return;
    }
    onFireHoldEnd?.(holdMs);
  };

  useEffect(() => {
    return () => {
      if (holdTickRef.current != null) {
        window.clearInterval(holdTickRef.current);
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", width: 50, height: 50 }}>
      {sparks.map((spark) => (
        <span
          key={spark.id}
          style={{
            position: "absolute",
            left: "50%",
            bottom: "50%",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "#FFD700",
            opacity: 1,
            pointerEvents: "none",
            transform: `translate(${spark.xOffset}px, 0px)`,
            animation: `spark-to-canvas ${spark.durationMs}ms ease-out forwards`,
          }}
        />
      ))}
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
          border: "1px solid rgba(255,255,255,0.08)",
          background: "transparent",
          color: "rgba(255,220,140,0.85)",
          display: "grid",
          placeItems: "center",
          transition: "transform 100ms ease, opacity 200ms ease",
          transform: fireShrink ? "scale(0.92)" : "scale(1)",
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill={fireFlash || fireHolding ? "rgba(255,215,0,0.9)" : "none"} stroke={fireFlash || fireHolding ? "rgba(255,215,0,0.9)" : "rgba(255,255,255,0.3)"} strokeWidth="1.5" style={{ opacity: fireHolding ? 0.6 : 1, transition: "fill 200ms ease, stroke 300ms ease, opacity 200ms ease" }}>
          <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.3v2c0 .2.2.4.4.3 2.1-1.1 4.8-3.5 4.8-7 0-.3.4-.5.6-.3C18.2 6 20 10 20 13.5c0 5.3-3.6 9.5-8 9.5z" />
        </svg>
      </button>
    </div>
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
  player,
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
      <style>{`
        @keyframes spark-to-canvas {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          70% { transform: translateY(-60px) scale(0.6); opacity: 0.8; }
          100% { transform: translateY(-80px) scale(0.2); opacity: 0; }
        }
      `}</style>
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
          player={player}
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
