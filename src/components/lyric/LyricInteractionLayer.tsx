import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";

interface LyricInteractionLayerProps {
  variant: "embedded" | "fullscreen";
  danceId: string;
  moments?: Moment[];
  currentTimeSec?: number;
  durationSec?: number;
  reactionData?: Record<string, { line: Record<number, number>; total: number }>;
  player?: any;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onSeekTo?: (sec: number) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MomentPill({
  moment,
  state,
  fireCount,
  maxFireCount,
  momentProgress,
  onClick,
}: {
  moment: Moment;
  state: "past" | "active" | "future";
  fireCount: number;
  maxFireCount: number;
  momentProgress: number;
  onClick: () => void;
}) {
  const flex = Math.max(1, moment.endSec - moment.startSec);

  if (state === "future") {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex,
          height: 5,
          background: "rgba(255,140,20,0.06)",
          borderRadius: 3,
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      />
    );
  }

  if (state === "active") {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex,
          height: 5,
          borderRadius: 3,
          position: "relative",
          background: "rgba(255,140,20,0.12)",
          overflow: "hidden",
          border: "none",
          cursor: "pointer",
          padding: 0,
          transition: "background 0.3s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${momentProgress * 100}%`,
            background: "rgb(255,160,30)",
            borderRadius: 3,
          }}
        />
      </button>
    );
  }

  const heat = maxFireCount > 0 ? fireCount / maxFireCount : 0;
  const r = Math.round(100 + heat * 140);
  const g = Math.round(50 + heat * 100);
  const b = Math.round(10 + heat * 10);
  const opacity = 0.15 + heat * 0.7;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex,
        height: 5,
        background: `rgb(${r},${g},${b})`,
        opacity,
        borderRadius: 3,
        border: "none",
        cursor: "pointer",
        padding: 0,
        transition: "opacity 0.5s ease, background 0.5s ease",
      }}
    />
  );
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
  const [mode, setMode] = useState<"rest" | "active">("rest");

  const ignite = () => setMode("active");
  const emberOut = () => setMode("rest");

  const handleDown = () => {
    if (holdTickRef.current != null) return;
    holdStartRef.current = performance.now();
    ignite();
    player?.fireMoment?.();
    onFireHoldStart?.();
    holdTickRef.current = window.setInterval(() => {
      player?.fireMoment?.();
    }, 150);
  };

  const handleUp = () => {
    if (holdTickRef.current != null) {
      window.clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }
    player?.stopContinuousFire?.();
    const start = holdStartRef.current;
    holdStartRef.current = null;
    if (start == null) {
      emberOut();
      return;
    }
    const holdMs = performance.now() - start;
    if (holdMs < 180) {
      onFireTap?.();
    } else {
      onFireHoldEnd?.(holdMs);
    }
    window.setTimeout(emberOut, 300);
  };

  useEffect(
    () => () => {
      if (holdTickRef.current != null) {
        window.clearInterval(holdTickRef.current);
      }
    },
    [],
  );

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      onPointerCancel={handleUp}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "rgba(10,10,15,0.92)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="rgba(255,160,40,0.4)"
        strokeWidth={1.5}
        style={{
          position: "absolute",
          opacity: mode === "rest" ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.3v2c0 .2.2.4.4.3 2.1-1.1 4.8-3.5 4.8-7 0-.3.4-.5.6-.3C18.2 6 20 10 20 13.5c0 5.3-3.6 9.5-8 9.5z" />
      </svg>

      <span
        style={{
          fontSize: 22,
          position: "absolute",
          opacity: mode === "active" ? 1 : 0,
          transform: mode === "active" ? "scale(1.25)" : "scale(0.6)",
          transition:
            mode === "active"
              ? "transform 0.12s ease-out, opacity 0.1s ease"
              : "transform 0.5s ease-out, opacity 0.4s ease",
          pointerEvents: "none",
        }}
      >
        🔥
      </span>
    </button>
  );
}

export function LyricInteractionLayer({
  moments,
  currentTimeSec = 0,
  durationSec = 0,
  reactionData = {},
  player,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
}: LyricInteractionLayerProps) {
  const safeMoments = moments ?? [];

  const currentMomentIdx = useMemo(() => {
    for (let i = safeMoments.length - 1; i >= 0; i -= 1) {
      if (currentTimeSec >= safeMoments[i].startSec - 0.1) return i;
    }
    return 0;
  }, [safeMoments, currentTimeSec]);

  const currentMoment = safeMoments[currentMomentIdx];
  const momentProgress = currentMoment
    ? Math.max(
        0,
        Math.min(
          1,
          (currentTimeSec - currentMoment.startSec) /
            Math.max(0.1, currentMoment.endSec - currentMoment.startSec),
        ),
      )
    : 0;

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(reactionData, safeMoments),
    [safeMoments, reactionData],
  );

  const maxFireCount = Math.max(1, ...Object.values(momentFireCounts));

  if (safeMoments.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          background: "#0a0a0f",
          position: "relative",
          padding: "14px 12px 10px",
          height: 64,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            height: 5,
            borderRadius: 3,
            background: "rgba(255,140,20,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            zIndex: 2,
          }}
        >
          <FireButton
            onFireTap={onFireTap}
            onFireHoldStart={onFireHoldStart}
            onFireHoldEnd={onFireHoldEnd}
            player={player}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        background: "#0a0a0f",
        position: "relative",
        padding: "14px 12px 10px",
        height: 64,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          gap: 2,
          alignItems: "center",
        }}
      >
        {safeMoments.map((moment, index) => {
          const state =
            index < currentMomentIdx
              ? "past"
              : index === currentMomentIdx
                ? "active"
                : "future";

          return (
            <MomentPill
              key={`${moment.startSec}-${moment.endSec}-${index}`}
              moment={moment}
              state={state}
              fireCount={momentFireCounts[index] ?? 0}
              maxFireCount={maxFireCount}
              momentProgress={state === "active" ? momentProgress : 0}
              onClick={() => onSeekTo?.(moment.startSec)}
            />
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2,
        }}
      >
        <FireButton
          onFireTap={onFireTap}
          onFireHoldStart={onFireHoldStart}
          onFireHoldEnd={onFireHoldEnd}
          player={player}
        />
      </div>

      <span
        style={{
          position: "absolute",
          left: 14,
          bottom: 2,
          fontSize: 9,
          color: "rgba(255,255,255,0.12)",
          fontFamily: "monospace",
        }}
      >
        {formatTime(currentTimeSec)}
      </span>
      <span
        style={{
          position: "absolute",
          right: 14,
          bottom: 2,
          fontSize: 9,
          color: "rgba(255,255,255,0.12)",
          fontFamily: "monospace",
        }}
      >
        {formatTime(durationSec)}
      </span>
    </div>
  );
}
