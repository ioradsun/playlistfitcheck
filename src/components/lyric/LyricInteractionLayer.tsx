import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { getSessionId } from "@/lib/sessionId";
import { fetchSessionFires } from "@/lib/fire";

const BAR_HEIGHT = 44;

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

  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);
  const userFiresRef = useRef<Record<number, number>>({});
  const emberCanvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Array<{
    x: number; y: number; vy: number; vx: number;
    life: number; size: number; opacity: number;
    r: number; g: number; b: number;
    segIdx: number; x0: number; x1: number;
  }>>([]);
  const pendingFireSpawnsRef = useRef<Array<{ count: number; intensity: number }>>([]);
  const pendingPlayheadSpawnsRef = useRef<Array<{ count: number; intensity: number }>>([]);
  const animRef = useRef<number>(0);
  const scrubbingRef = useRef(false);
  const progressPctRef = useRef(0);

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
  progressPctRef.current = progressPct;

  const currentMomentIdx = useMemo(
    () => moments.findIndex((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec),
    [moments, currentTimeSec],
  );

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
          r, g, b, segIdx, x0: seg.x0, x1: seg.x1,
        });
      }
    };

    const spawnFireEmbers = (count: number, intensity: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const x0 = rect.width / 2 - 24;
      const x1 = rect.width / 2 + 24;
      for (let i = 0; i < count; i++) {
        if (embers.length >= 24) break;
        embers.push({
          x: x0 + Math.random() * (x1 - x0),
          y: rect.height - 2,
          vy: -(0.4 + Math.random() * 0.5),
          vx: (Math.random() - 0.5) * 0.1,
          life: 0.5 + Math.random() * 0.4,
          size: 1.0 + intensity * 1.5,
          opacity: 0.5 + intensity * 0.4,
          r: 255, g: 140, b: 40,
          segIdx: -1, x0, x1,
        });
      }
    };

    const spawnPlayheadEmbers = (count: number, intensity: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const playheadX = (progressPctRef.current / 100) * rect.width;
      const x0 = playheadX - 12;
      const x1 = playheadX + 12;
      for (let i = 0; i < count; i++) {
        if (embers.length >= 30) break;
        embers.push({
          x: x0 + Math.random() * (x1 - x0),
          y: rect.height - 2,
          vy: -(0.3 + Math.random() * 0.4),
          vx: (Math.random() - 0.5) * 0.2,
          life: 0.5 + Math.random() * 0.3,
          size: 1.0 + intensity * 1.2,
          opacity: 0.5 + intensity * 0.3,
          r: 255, g: 150, b: 40,
          segIdx: -1, x0: Math.max(0, x0 - 20), x1: Math.min(rect.width, x1 + 20),
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

      while (pendingFireSpawnsRef.current.length > 0) {
        const req = pendingFireSpawnsRef.current.shift()!;
        spawnFireEmbers(req.count, req.intensity);
      }
      while (pendingPlayheadSpawnsRef.current.length > 0) {
        const req = pendingPlayheadSpawnsRef.current.shift()!;
        spawnPlayheadEmbers(req.count, req.intensity);
      }
      if (frame % 180 === 0) {
        spawnFireEmbers(1 + Math.floor(Math.random() * 2), 0.25);
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
        ctx.beginPath();
        ctx.rect(e.x0, -10, e.x1 - e.x0, rect.height + 10);
        ctx.clip();
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

  const handleFireTap = () => {
    addUserFire(currentMomentIdx, 150);
    pendingPlayheadSpawnsRef.current.push({ count: 2, intensity: 0.3 });
    onFireTap();
  };
  const handleFireHoldEnd = (holdMs: number) => {
    addUserFire(currentMomentIdx, holdMs);
    const intensity = Math.min(1.0, holdMs / 2000);
    pendingFireSpawnsRef.current.push({ count: Math.floor(4 + intensity * 8), intensity });
    pendingPlayheadSpawnsRef.current.push({ count: Math.floor(3 + intensity * 5), intensity });
    onFireHoldEnd(holdMs);
  };

  const handleDown = () => {
    setPressing(true);
    pendingFireSpawnsRef.current.push({ count: 5, intensity: 0.6 });
    pendingPlayheadSpawnsRef.current.push({ count: 3, intensity: 0.5 });
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

  return (
    <>
      <div
        style={{
          width: "100%",
          background: "#0a0a0f",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            height: BAR_HEIGHT,
            position: "relative",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
          }}
        >
          {/* Moments container */}
          <div style={{ position: "absolute", inset: 0, display: "flex", minWidth: 0 }}>
          {/* Ember canvas — overlaid on moments, pointer-events: none */}
          <canvas
            ref={emberCanvasRef}
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}
          />

          {/* Segment heat backgrounds */}
          {moments.map((moment, idx) => {
            const count = momentFireCounts[idx] ?? 0;
            const intensity = Math.max(0, Math.min(1, count / maxFireCount));
            if (intensity <= 0) return null;
            const leftPct = (moment.startSec / Math.max(0.0001, totalDuration)) * 100;
            const widthPct = ((moment.endSec - moment.startSec) / Math.max(0.0001, totalDuration)) * 100;
            const background = idx === hottestIdx && count > 0
              ? `rgba(74, 222, 128, ${intensity * 0.12})`
              : count > 0
                ? `rgba(255, 255, 255, ${intensity * 0.04})`
                : "transparent";
            return (
              <div
                key={`${moment.startSec}-${moment.endSec}-heat`}
                style={{
                  position: "absolute",
                  top: "auto",
                  bottom: 0,
                  height: 6,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />
            );
          })}

          {/* Playhead line */}
          {progressPct > 0 && (
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

          {/* Moment divider lines — visual only */}
          {moments.slice(0, -1).map((moment) => {
            const xPct = (moment.endSec / Math.max(0.0001, totalDuration)) * 100;
            return (
              <div
                key={`${moment.startSec}-${moment.endSec}-divider`}
                style={{
                  position: "absolute",
                  top: "auto",
                  bottom: 0,
                  height: 6,
                  left: `${xPct}%`,
                  width: "1px",
                  background: "rgba(255,255,255,0.06)",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            );
          })}

          {/* Full-bar scrub overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              cursor: "pointer",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              scrubbingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeekTo(pct * totalDuration);
            }}
            onPointerMove={(e) => {
              if (!scrubbingRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeekTo(pct * totalDuration);
            }}
            onPointerUp={() => { scrubbingRef.current = false; }}
            onPointerCancel={() => { scrubbingRef.current = false; }}
          />
          </div>

          {/* Fire button — centered overlay */}
          <button
            type="button"
            onPointerDown={handleDown}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 5,
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: pressing
                ? "radial-gradient(circle at 50% 50%, rgba(255,140,40,0.15) 0%, transparent 70%)"
                : "radial-gradient(circle at 50% 50%, rgba(255,140,40,0.06) 0%, transparent 70%)",
              border: "none",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
              opacity: closingActive ? 0.5 : undefined,
              transition: "background 0.3s ease",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: "none",
            }}
          >
            <span
              style={{
                fontSize: 24,
                opacity: pressing ? 1 : 0.5,
                transition: "opacity 0.15s ease",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              🔥
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

export { FmlyBar as LyricInteractionLayer };
