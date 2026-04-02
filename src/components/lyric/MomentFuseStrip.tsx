import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";

interface MomentFuseStripProps {
  moments: Moment[];
  currentTimeSec: number;
  durationSec: number;
  momentFireCounts: Record<number, number>;
  totalFires: number;
  beatEnergy: number;
  beatHit: boolean;
  onSeekToMoment: (momentIndex: number) => void;
  onFireTap: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onPrevMoment: () => void;
  onNextMoment: () => void;
  accent?: string;
  sectionColors?: Record<number, string>;
}

function formatTime(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return color;
}

export function MomentFuseStrip({
  moments,
  currentTimeSec,
  durationSec,
  momentFireCounts,
  totalFires,
  beatEnergy,
  beatHit,
  onSeekToMoment,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onPrevMoment,
  onNextMoment,
  accent = "rgba(255,170,0,0.8)",
  sectionColors = {},
}: MomentFuseStripProps) {
  const holdStartRef = useRef<number | null>(null);
  const sparkIdRef = useRef(0);
  const [localBeatActive, setLocalBeatActive] = useState(false);
  const [sparks, setSparks] = useState<Array<{ id: number; left: number; bottom: number }>>([]);

  const currentMomentIdx = useMemo(() => {
    for (let i = moments.length - 1; i >= 0; i -= 1) {
      if (currentTimeSec >= moments[i].startSec - 0.1) return i;
    }
    return 0;
  }, [moments, currentTimeSec]);

  const currentMoment = moments[currentMomentIdx];
  const momentProgress = currentMoment
    ? Math.max(
      0,
      Math.min(
        1,
        (currentTimeSec - currentMoment.startSec)
          / Math.max(0.1, currentMoment.endSec - currentMoment.startSec),
      ),
    )
    : 0;

  useEffect(() => {
    if (!beatHit) return;
    setLocalBeatActive(true);
    const t = setTimeout(() => setLocalBeatActive(false), 150);
    return () => clearTimeout(t);
  }, [beatHit]);

  const spawnSparks = () => {
    const baseId = sparkIdRef.current;
    const next = Array.from({ length: 6 }).map((_, i) => ({
      id: baseId + i,
      left: 45 + Math.random() * 10,
      bottom: 56 + Math.random() * 8,
    }));
    sparkIdRef.current += 6;
    setSparks((prev) => [...prev, ...next]);
    setTimeout(() => {
      setSparks((prev) => prev.filter((s) => !next.some((n) => n.id === s.id)));
    }, 700);
  };

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
      onFireTap();
      spawnSparks();
      return;
    }
    onFireHoldEnd?.(holdMs);
  };

  const canPrev = currentMomentIdx > 0;
  const canNext = currentMomentIdx < moments.length - 1;

  return (
    <div style={{ width: "100%", padding: "8px 12px 10px" }}>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 44, padding: "0 4px" }}>
        {moments.map((moment, index) => {
          const isPast = index < currentMomentIdx;
          const isActive = index === currentMomentIdx;
          const fireCount = momentFireCounts[index] ?? 0;
          const color = sectionColors[moment.sectionIndex] ?? "#6B7A8E";
          const flex = Math.max(1, moment.lines.length || 1);
          const intensity = Math.min(1, fireCount / 8);
          return (
            <button
              key={moment.index}
              type="button"
              onClick={() => onSeekToMoment(index)}
              aria-label={`Seek to moment ${index + 1}`}
              className={isActive ? `moment-block ${localBeatActive ? "beat-active" : ""}` : "moment-block"}
              style={{
                flex,
                position: "relative",
                border: isActive ? `1px solid ${withAlpha(accent, 0.85)}` : "1px solid transparent",
                borderRadius: 3,
                cursor: "pointer",
                transition: "height 0.3s ease, opacity 0.3s ease",
                height: isActive ? 26 : 12,
                opacity: isPast ? 0.3 : isActive ? 1 : 0.12,
                background: isPast
                  ? `linear-gradient(180deg, ${withAlpha("#FFD777", 0.2 + intensity * 0.6)} 0%, ${withAlpha(color, 0.08 + intensity * 0.26)} 100%)`
                  : withAlpha(color, isActive ? 0.42 : 0.15),
                boxShadow: isActive ? "0 0 10px rgba(255,170,0,0.45)" : "none",
                overflow: "hidden",
              }}
            >
              {isActive && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${Math.max(0, Math.min(100, momentProgress * 100))}%`,
                      background: "linear-gradient(90deg, rgba(255,220,120,0.35), rgba(255,130,0,0.45))",
                    }}
                  />
                  <div className="fuse-spark" style={{ left: `${momentProgress * 100}%` }}>
                    <div
                      className="flame-tongue"
                      style={{ width: 8, height: 16, left: -2, bottom: 4, background: "rgba(255,200,50,0.7)", animationDelay: "0s" }}
                    />
                    <div
                      className="flame-tongue"
                      style={{ width: 6, height: 12, left: 0, bottom: 4, background: "rgba(255,140,20,0.55)", animationDelay: "0.12s" }}
                    />
                    <div
                      className="flame-tongue"
                      style={{ width: 5, height: 10, left: 1, bottom: 4, background: "rgba(255,80,0,0.45)", animationDelay: "0.25s" }}
                    />
                  </div>
                </>
              )}
              {isPast && fireCount > 0 && (
                <>
                  <div className="ember-particle" style={{ left: "25%", animationDelay: "0.1s" }} />
                  <div className="ember-particle" style={{ left: "55%", animationDelay: "0.4s" }} />
                </>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          fontSize: 9,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "rgba(255,255,255,0.22)",
        }}
      >
        <span>{formatTime(currentTimeSec)}</span>
        <span style={{ color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
          moment {Math.min(moments.length, currentMomentIdx + 1)} of {moments.length || 0}
          <span style={{ color: "rgba(255,215,0,0.35)", marginLeft: 8 }}>{totalFires} fires</span>
        </span>
        <span style={{ justifySelf: "end" }}>{formatTime(durationSec)}</span>
      </div>

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, position: "relative" }}>
        {sparks.map((spark) => (
          <div
            key={spark.id}
            className="spark-particle"
            style={{ left: `${spark.left}%`, bottom: `${spark.bottom}%` }}
          />
        ))}
        <button
          type="button"
          onClick={onPrevMoment}
          disabled={!canPrev}
          aria-label="Previous moment"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.06)",
            opacity: canPrev ? 1 : 0.2,
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.4)" }}>‹</span>
        </button>
        <button
          type="button"
          onPointerDown={handleFireStart}
          onPointerUp={handleFireEnd}
          onPointerLeave={handleFireEnd}
          onTouchEnd={handleFireEnd}
          aria-label="Fire"
          className="fire-btn"
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,170,0,0.3)",
            background: "rgba(255,150,0,0.1)",
            color: "rgba(255,220,140,0.85)",
            fontSize: 20,
            boxShadow: `0 0 ${6 + Math.round(beatEnergy * 10)}px rgba(255,170,0,0.25)`,
          }}
        >
          🔥
        </button>
        <button
          type="button"
          onClick={onNextMoment}
          disabled={!canNext}
          aria-label="Next moment"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.06)",
            opacity: canNext ? 1 : 0.2,
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
        </button>
      </div>

      <style>{`
        .moment-block.beat-active { animation: moment-glow 0.2s ease-out; }
        .fuse-spark {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #fff;
          bottom: 50%;
          transform: translate(-50%, 50%);
          box-shadow: 0 0 6px #FFD700, 0 0 14px rgba(255,170,0,0.5);
          z-index: 2;
        }
        .flame-tongue {
          position: absolute;
          border-radius: 50% 50% 20% 20%;
          animation: flame-flicker 0.35s ease-in-out infinite;
          transform-origin: bottom center;
        }
        .beat-active .flame-tongue { animation-duration: 0.2s; transform: scaleY(1.4); }
        .ember-particle {
          position: absolute;
          bottom: 3px;
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: rgba(255,180,80,0.7);
          animation: ember-drift 1.2s ease-out infinite;
        }
        .spark-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #FFD700;
          animation: spark-fly 0.7s ease-out forwards;
        }
        .fire-btn:active { transform: scale(0.92); background: rgba(255,170,30,0.18); }
        @keyframes moment-glow { 0%,100% { box-shadow: 0 0 4px rgba(255,170,0,0.3);} 50% { box-shadow: 0 0 14px rgba(255,170,0,0.7);} }
        @keyframes ember-drift { 0% { transform: translateY(0) translateX(0); opacity: 0.6; } 100% { transform: translateY(-20px) translateX(3px); opacity: 0; } }
        @keyframes spark-fly { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-25px) scale(0.2); opacity: 0; } }
        @keyframes flame-flicker { 0%,100% { opacity: 0.8; transform: scaleY(1); } 33% { opacity: 1; transform: scaleY(1.15); } 66% { opacity: 0.65; transform: scaleY(0.85); } }
        @media (prefers-reduced-motion: reduce) {
          .flame-tongue, .spark-particle, .ember-particle, .fuse-spark, .moment-block.beat-active { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
