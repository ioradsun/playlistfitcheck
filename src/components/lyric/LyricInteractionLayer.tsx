import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";

const BAR_HEIGHT = 48;

interface FmlyBarProps {
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  player: any;
  currentTimeSec: number;
  onFireTap: () => void;
  onFireHoldStart: () => void;
  onFireHoldEnd: (holdMs: number) => void;
  onSeekTo: (sec: number) => void;
}

// ── Thermal section — pure divs, CSS gradient + shimmer ─────────────────
function Section({
  moment,
  fill,
  isActive,
  progress,
  isFlash,
  isHottest,
  proximity,
  onPress,
}: {
  moment: Moment;
  fill: number;
  isActive: boolean;
  progress: number;
  isFlash: boolean;
  isHottest: boolean;
  proximity: number;
  onPress: () => void;
}) {
  const h = Math.max(0, Math.min(1, fill));
  const fillPct = 8 + h * 85;
  const s = 85 + h * 15;
  const bright = 15 + h * 48 + (isFlash ? 15 : 0);
  const mid = 10 + h * 28;
  const dim = 5 + h * 14;
  const alpha = 0.25 + h * 0.5 + (isFlash ? 0.3 : 0);
  const progL = 35 + h * 35;
  const progGlow = 0.2 + h * 0.35;

  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        flex: Math.max(1, moment.endSec - moment.startSec),
        height: BAR_HEIGHT,
        background: "#030305",
        border: "none",
        borderRight: "1px solid rgba(255,255,255,0.012)",
        position: "relative",
        overflow: "hidden",
        padding: 0,
        margin: 0,
        cursor: "pointer",
      }}
    >
      {/* Thermal fill — rises from bottom, height = fire count */}
      <div
        className={`thermal-fill${isFlash ? " thermal-flash" : ""}`}
        style={{
          "--t1": `hsla(25,${s}%,${bright}%,${alpha})`,
          "--t2": `hsla(22,${s}%,${mid}%,${alpha * 0.7})`,
          "--t3": `hsla(20,${s - 10}%,${dim}%,${alpha * 0.35})`,
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${fillPct}%`,
        } as React.CSSProperties}
      />

      {/* Progress line — rides the top of the fill */}
      {isActive && progress > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: `${fillPct}%`,
            left: 0,
            height: 2,
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            background: `hsl(25,${s}%,${progL}%)`,
            boxShadow: `0 0 ${3 + h * 5}px rgba(255,${Math.round(140 + h * 40)},30,${progGlow}), 0 0 ${1 + h * 2}px rgba(255,180,60,${progGlow * 0.5})`,
            transition: "width 100ms linear",
          }}
        />
      )}

      {/* Anticipation glow for hottest section */}
      {isHottest && proximity > 0 && !isActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 100%, rgba(255,155,35,${proximity * 0.1}), transparent 65%)`,
            transition: "opacity 0.8s",
          }}
        />
      )}
    </button>
  );
}

// ── Fire button — slow breath, proximity warmth ─────────────────────────
function InlineFireButton({
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  player,
  proximity,
  isFlash,
}: {
  onFireTap: () => void;
  onFireHoldStart: () => void;
  onFireHoldEnd: (holdMs: number) => void;
  player: any;
  proximity: number;
  isFlash: boolean;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);

  const handleDown = () => {
    holdStartRef.current = performance.now();
    player?.fireMoment?.();
    onFireHoldStart();
    holdTickRef.current = window.setInterval(() => {
      player?.fireMoment?.();
    }, 150);
  };

  const handleUp = () => {
    if (holdTickRef.current) {
      window.clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }
    player?.stopContinuousFire?.();

    const startedAt = holdStartRef.current;
    holdStartRef.current = null;
    if (startedAt == null) return;

    const holdMs = performance.now() - startedAt;
    if (holdMs < 180) {
      onFireTap();
    } else {
      onFireHoldEnd(holdMs);
    }
  };

  useEffect(() => {
    return () => {
      if (holdTickRef.current) window.clearInterval(holdTickRef.current);
    };
  }, []);

  const glow = 0.02 + proximity * 0.2 + (isFlash ? 0.25 : 0);
  const bAlpha = 0.05 + proximity * 0.3 + (isFlash ? 0.25 : 0);
  const bG = Math.round(140 + proximity * 55);

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      style={{
        width: BAR_HEIGHT,
        height: BAR_HEIGHT,
        flexShrink: 0,
        background: "#030305",
        border: `1.5px solid rgba(255,${bG},40,${bAlpha})`,
        borderRadius: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        margin: 0,
        animation: "fire-breath 3s ease-in-out infinite",
        boxShadow: `0 0 ${glow * 28}px rgba(255,145,35,${glow * 0.28})`,
        transition: "box-shadow 0.4s ease, border-color 0.4s ease",
        willChange: "transform",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill={proximity > 0.5 ? `hsl(25,95%,${30 + proximity * 16}%)` : "none"}
        stroke={`hsl(25,90%,${18 + proximity * 20}%)`}
        strokeWidth={1.5}
        style={{ transition: "fill 1s ease, stroke 0.8s ease" }}
      >
        <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.3v2c0 .2.2.4.4.3 2.1-1.1 4.8-3.5 4.8-7 0-.3.4-.5.6-.3C18.2 6 20 10 20 13.5c0 5.3-3.6 9.5-8 9.5z" />
      </svg>
    </button>
  );
}

// ── Thermal Bar ─────────────────────────────────────────────────────────
export function FmlyBar({
  moments,
  reactionData,
  player,
  currentTimeSec,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
}: FmlyBarProps) {
  const [loopMomentIdx, setLoopMomentIdx] = useState(0);
  const [flashIdx, setFlashIdx] = useState(-1);

  // Auto-select moment when loopMomentIdx is stale
  useEffect(() => {
    if (!moments.length) return;
    const idx = moments.findIndex((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec);
    if (idx >= 0 && (loopMomentIdx < 0 || loopMomentIdx >= moments.length)) {
      setLoopMomentIdx(idx);
    }
  }, [moments, currentTimeSec, loopMomentIdx]);

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(reactionData, moments),
    [reactionData, moments],
  );
  const maxFireCount = Math.max(1, ...Object.values(momentFireCounts));

  // Find hottest moment
  const hottestIdx = useMemo(() => {
    let best = 0;
    for (let i = 1; i < moments.length; i++) {
      if ((momentFireCounts[i] ?? 0) > (momentFireCounts[best] ?? 0)) best = i;
    }
    return best;
  }, [moments, momentFireCounts]);

  const activeMoment = moments[loopMomentIdx] ?? null;
  const activeProgress = activeMoment
    ? Math.max(0, Math.min(1, (currentTimeSec - activeMoment.startSec) / Math.max(0.0001, activeMoment.endSec - activeMoment.startSec)))
    : 0;

  // Proximity to hottest (0-1, ramps up over 4 seconds before it)
  const currentIdx = moments.findIndex((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec);
  const timeToHottest = moments[hottestIdx] ? moments[hottestIdx].startSec - currentTimeSec : Infinity;
  const proximity = timeToHottest > 0 && timeToHottest < 4
    ? 1 - timeToHottest / 4
    : currentIdx === hottestIdx ? 1 : 0;

  const leftCount = Math.floor(moments.length / 2);
  const leftMoments = moments.slice(0, leftCount);
  const rightMoments = moments.slice(leftCount);

  const onSelectMoment = (moment: Moment, index: number) => {
    setLoopMomentIdx(index);
    onSeekTo(moment.startSec);
    player?.setRegion?.(moment.startSec, moment.endSec);
  };

  // Flash on fire
  const handleFireTap = () => {
    if (currentIdx >= 0) {
      setFlashIdx(currentIdx);
      setTimeout(() => setFlashIdx(-1), 400);
    }
    onFireTap();
  };

  const handleFireHoldEnd = (holdMs: number) => {
    if (currentIdx >= 0) {
      setFlashIdx(currentIdx);
      setTimeout(() => setFlashIdx(-1), 400);
    }
    onFireHoldEnd(holdMs);
  };

  return (
    <>
      <style>{`
        .thermal-fill {
          background: linear-gradient(160deg, var(--t1) 0%, var(--t2) 50%, var(--t3) 100%);
          background-size: 200% 200%;
          animation: thermal-shimmer 6s ease-in-out infinite;
          transition: height 0.5s ease, opacity 0.3s ease;
        }
        .thermal-flash {
          transition: height 0.1s, opacity 0.1s !important;
        }
        @keyframes thermal-shimmer {
          0%   { background-position: 0% 100%; }
          50%  { background-position: 100% 80%; }
          100% { background-position: 0% 100%; }
        }
        @keyframes fire-breath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.025); }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          height: BAR_HEIGHT,
          background: "#030305",
          display: "flex",
          alignItems: "stretch",
          borderTop: "1px solid rgba(255,255,255,0.018)",
          borderBottom: "1px solid rgba(255,255,255,0.018)",
        }}
      >
        {/* Left sections */}
        <div style={{ flex: 1, display: "flex", alignItems: "stretch", minWidth: 0, overflow: "hidden" }}>
          {leftMoments.map((moment, index) => {
            const fill = Math.max(0, Math.min(1, (momentFireCounts[index] ?? 0) / maxFireCount));
            return (
              <Section
                key={`l-${index}-${moment.startSec}`}
                moment={moment}
                fill={fill}
                isActive={loopMomentIdx === index}
                progress={loopMomentIdx === index ? activeProgress : 0}
                isFlash={flashIdx === index}
                isHottest={index === hottestIdx}
                proximity={index === hottestIdx ? proximity : 0}
                onPress={() => onSelectMoment(moment, index)}
              />
            );
          })}
        </div>

        {/* Fire button — always breathing */}
        <InlineFireButton
          onFireTap={handleFireTap}
          onFireHoldStart={onFireHoldStart}
          onFireHoldEnd={handleFireHoldEnd}
          player={player}
          proximity={proximity}
          isFlash={flashIdx >= 0}
        />

        {/* Right sections */}
        <div style={{ flex: 1, display: "flex", alignItems: "stretch", minWidth: 0, overflow: "hidden" }}>
          {rightMoments.map((moment, rightIndex) => {
            const index = leftCount + rightIndex;
            const fill = Math.max(0, Math.min(1, (momentFireCounts[index] ?? 0) / maxFireCount));
            return (
              <Section
                key={`r-${index}-${moment.startSec}`}
                moment={moment}
                fill={fill}
                isActive={loopMomentIdx === index}
                progress={loopMomentIdx === index ? activeProgress : 0}
                isFlash={flashIdx === index}
                isHottest={index === hottestIdx}
                proximity={index === hottestIdx ? proximity : 0}
                onPress={() => onSelectMoment(moment, index)}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

export { FmlyBar as LyricInteractionLayer };
