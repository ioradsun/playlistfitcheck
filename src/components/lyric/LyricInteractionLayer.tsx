import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { getSessionId } from "@/lib/sessionId";
import { fetchSessionFires } from "@/lib/fire";

const BAR_HEIGHT = 40;

interface FmlyBarProps {
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  player: any;
  currentTimeSec: number;
  onFireTap: () => void;
  onFireHoldStart: () => void;
  onFireHoldEnd: (holdMs: number) => void;
  onSeekTo: (sec: number) => void;
  closingActive?: boolean;
  danceId?: string;
}

export function FmlyBar({
  moments,
  reactionData,
  player,
  currentTimeSec,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
  closingActive = false,
  danceId,
}: FmlyBarProps) {
  const [pressing, setPressing] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [browsedIdx, setBrowsedIdx] = useState<number | null>(null);

  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);
  const userFiresRef = useRef<Record<number, number>>({});
  const emberCanvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Array<{
    x: number; y: number; vy: number; vx: number;
    life: number; size: number; opacity: number;
    r: number; g: number; b: number; segIdx: number;
  }>>([]);
  const animRef = useRef<number>(0);

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(reactionData, moments),
    [reactionData, moments],
  );
  const maxFireCount = useMemo(() => Math.max(1, ...Object.values(momentFireCounts)), [momentFireCounts]);

  const hottestIdx = useMemo(() => {
    if (!moments.length) return -1;
    let best = 0;
    for (let i = 1; i < moments.length; i++) {
      if ((momentFireCounts[i] ?? 0) > (momentFireCounts[best] ?? 0)) best = i;
    }
    return best;
  }, [moments, momentFireCounts]);

  const totalDuration = moments.length ? moments[moments.length - 1].endSec : 1;
  const progressPct = Math.max(0, Math.min(100, (currentTimeSec / Math.max(0.0001, totalDuration)) * 100));

  const currentMomentIdx = useMemo(
    () => moments.findIndex((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec),
    [moments, currentTimeSec],
  );

  const userTopIdx = useMemo(() => {
    if (!closingActive) return null;
    const fires = userFiresRef.current;
    let bestIdx = -1;
    let bestMs = 0;
    for (const [idx, ms] of Object.entries(fires)) {
      if (ms > bestMs) { bestMs = ms; bestIdx = Number(idx); }
    }
    return bestIdx >= 0 ? bestIdx : null;
  }, [closingActive, renderTick]);

  // ── Hydrate user fires from DB on mount ─────────────────────────────────
  useEffect(() => {
    if (!moments.length || hydrated || !danceId) return;
    fetchSessionFires(danceId, getSessionId()).then((fires) => {
      const accumulated: Record<number, number> = {};
      for (const fire of fires) {
        const momentIdx = moments.findIndex((m) =>
          m.lines.some((l) => l.lineIndex === fire.line_index),
        );
        if (momentIdx >= 0) {
          accumulated[momentIdx] = (accumulated[momentIdx] ?? 0) + fire.hold_ms;
        }
      }
      userFiresRef.current = accumulated;
      setHydrated(true);
      setRenderTick((t) => t + 1);
    });
  }, [moments, danceId, hydrated]);

  useEffect(() => {
    return () => { if (holdTickRef.current) window.clearInterval(holdTickRef.current); };
  }, []);

  // ── Canvas ember animation ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = emberCanvasRef.current;
    if (!canvas || !moments.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const embers = embersRef.current;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const getSegmentRanges = (w: number) => {
      const totalFlex = moments.reduce((s, m) => s + Math.max(1, m.endSec - m.startSec), 0);
      const ranges: Array<{ x0: number; x1: number }> = [];
      let x = 0;
      for (const m of moments) {
        const flex = Math.max(1, m.endSec - m.startSec);
        const segW = (flex / totalFlex) * w;
        ranges.push({ x0: x, x1: x + segW });
        x += segW;
      }
      return ranges;
    };

    const spawnEmber = (segIdx: number, r: number, g: number, b: number, intensity: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const ranges = getSegmentRanges(rect.width);
      const seg = ranges[segIdx];
      if (!seg) return;
      const count = Math.floor(2 + intensity * 3);
      for (let i = 0; i < count; i++) {
        if (embers.length >= 20) break;
        embers.push({
          x: seg.x0 + Math.random() * (seg.x1 - seg.x0),
          y: rect.height - 2 + Math.random() * 4,
          vy: -(0.15 + Math.random() * 0.25),
          vx: (Math.random() - 0.5) * 0.15,
          life: 0.6 + Math.random() * 0.4,
          size: 1.2 + Math.random() * 1.8,
          opacity: 0.4 + intensity * 0.4,
          r, g, b, segIdx,
        });
      }
    };

    let frame = 0;
    const loop = () => {
      animRef.current = requestAnimationFrame(loop);
      frame++;

      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      if (Math.abs(canvas.width / dpr - rect.width) > 2) resize();

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Spawn new embers every ~60 frames (~1 second at 60fps)
      if (frame % 60 === 0) {
        if (hottestIdx >= 0 && (momentFireCounts[hottestIdx] ?? 0) > 0) {
          const intensity = Math.min(1, (momentFireCounts[hottestIdx] ?? 0) / maxFireCount);
          spawnEmber(hottestIdx, 74, 222, 128, intensity);
        }
        const userFires = userFiresRef.current;
        const maxUF = Math.max(1, ...Object.values(userFires));
        for (const [idx, ms] of Object.entries(userFires)) {
          if (ms > 0) spawnEmber(Number(idx), 255, 150, 40, ms / maxUF);
        }
      }

      // Update and draw particles
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.y += e.vy;
        e.x += e.vx;
        e.life -= 0.008;
        if (e.life <= 0 || e.y < -4) { embers.splice(i, 1); continue; }

        const flicker = 0.7 + Math.sin(frame * 0.08 + i * 2.3) * 0.3;
        const alpha = e.opacity * e.life * flicker;
        const rad = e.size * (0.8 + flicker * 0.4);

        ctx.save();
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad * 2.5);
        grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(0.3, `rgba(${e.r},${e.g},${e.b},${alpha * 0.85})`);
        grad.addColorStop(1, `rgba(${e.r},${e.g},${e.b},0)`);
        ctx.fillStyle = grad;
        ctx.shadowColor = `rgba(${e.r},${e.g},${e.b},${alpha * 0.6})`;
        ctx.shadowBlur = rad * 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rad * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [moments, hottestIdx, momentFireCounts, maxFireCount, renderTick]);

  // ── Fire handlers ───────────────────────────────────────────────────────
  const addUserFire = (idx: number, holdMs: number) => {
    if (idx < 0) return;
    userFiresRef.current[idx] = (userFiresRef.current[idx] ?? 0) + holdMs;
    setRenderTick((t) => t + 1);
  };

  const handleFireTap = () => { addUserFire(currentMomentIdx, 150); onFireTap(); };
  const handleFireHoldEnd = (holdMs: number) => { addUserFire(currentMomentIdx, holdMs); onFireHoldEnd(holdMs); };

  const handleDown = () => {
    setPressing(true);
    holdStartRef.current = performance.now();
    player?.fireMoment?.();
    onFireHoldStart();
    holdTickRef.current = window.setInterval(() => { player?.fireMoment?.(); }, 150);
  };

  const handleUp = () => {
    setPressing(false);
    if (holdTickRef.current) { window.clearInterval(holdTickRef.current); holdTickRef.current = null; }
    player?.stopContinuousFire?.();
    const startedAt = holdStartRef.current;
    holdStartRef.current = null;
    if (startedAt == null) return;
    const holdMs = performance.now() - startedAt;
    if (holdMs < 180) handleFireTap(); else handleFireHoldEnd(holdMs);
  };

  const onSelectMoment = (moment: Moment, index: number) => {
    setBrowsedIdx(index);
    onSeekTo(moment.startSec);
    player?.setRegion?.(moment.startSec, moment.endSec);
  };

  return (
    <>
      <style>{`
        @keyframes fire-pulse {
          0%, 100% { opacity: 0.5; filter: drop-shadow(0 0 3px rgba(255,140,40,0.0)); }
          50% { opacity: 0.9; filter: drop-shadow(0 0 6px rgba(255,140,40,0.3)); }
        }
        .fire-icon-pulse {
          animation: fire-pulse 2.5s ease-in-out infinite;
        }
      `}</style>

      <div
        style={{
          width: "100%",
          height: BAR_HEIGHT,
          background: "#0a0a0f",
          display: "flex",
          alignItems: "stretch",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {/* Moments container */}
        <div data-browsed-idx={browsedIdx ?? -1} style={{ flex: 1, display: "flex", position: "relative", minWidth: 0 }}>
          {/* Ember canvas — overlaid on moments, pointer-events: none */}
          <canvas
            ref={emberCanvasRef}
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}
          />

          {/* Progress fill */}
          <div
            style={{
              position: "absolute", top: 0, left: 0, bottom: 0,
              width: closingActive ? "0%" : `${progressPct}%`,
              opacity: closingActive ? 0 : 1,
              background: "rgba(255,255,255,0.06)",
              pointerEvents: "none",
              transition: "width 150ms linear, opacity 200ms linear",
              zIndex: 0,
            }}
          />
          {/* Playhead line */}
          {!closingActive && progressPct > 0 && (
            <div
              style={{
                position: "absolute", top: 0, bottom: 0,
                left: `${progressPct}%`,
                width: "1.5px",
                background: "rgba(255,255,255,0.25)",
                boxShadow: "0 0 4px rgba(255,255,255,0.08)",
                pointerEvents: "none",
                transition: "left 150ms linear",
                zIndex: 2,
              }}
            />
          )}

          {/* Moment segments — transparent buttons for click/seek */}
          {moments.map((moment, index) => {
            const isLast = index === moments.length - 1;
            const segmentOpacity = closingActive
              ? userTopIdx == null ? 0.15 : userTopIdx === index ? 1 : 0.15
              : 1;

            return (
              <button
                key={`${moment.startSec}-${moment.endSec}`}
                type="button"
                onClick={() => onSelectMoment(moment, index)}
                style={{
                  flex: Math.max(1, moment.endSec - moment.startSec),
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  borderRight: isLast ? "none" : "1px solid rgba(255,255,255,0.06)",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  zIndex: 1,
                  opacity: segmentOpacity,
                  transition: "opacity 0.5s ease",
                }}
              />
            );
          })}
        </div>

        {/* Fire button — right edge */}
        <button
          type="button"
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          style={{
            width: BAR_HEIGHT, height: BAR_HEIGHT, flexShrink: 0,
            background: pressing
              ? "radial-gradient(circle at 50% 50%, rgba(255,140,40,0.15) 0%, transparent 70%)"
              : "radial-gradient(circle at 50% 50%, rgba(255,140,40,0.06) 0%, transparent 70%)",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0,
            opacity: closingActive ? 0.2 : undefined,
            transition: "background 0.3s ease",
          }}
        >
          <svg
            viewBox="0 0 24 24" width={20} height={20}
            fill={pressing ? "rgba(255,140,40,0.7)" : "rgba(255,140,40,0.15)"}
            stroke={pressing ? "rgba(255,160,50,0.9)" : "rgba(255,140,40,0.5)"}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            className={closingActive ? "" : "fire-icon-pulse"}
            style={{ transition: "fill 0.15s ease, stroke 0.15s ease" }}
          >
            <path d="M12 2c0 0-5.5 5-5.5 10.5a5.5 5.5 0 0 0 11 0C17.5 9 15 6.5 15 6.5c0 0 .5 3-1.5 4.5C13.5 8 12 2 12 2z" />
          </svg>
        </button>
      </div>
    </>
  );
}

export { FmlyBar as LyricInteractionLayer };
