import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { getSessionId } from "@/lib/sessionId";
import { fetchSessionFires } from "@/lib/fire";
import { createFireHold } from "@/lib/fireHold";

const BAR_HEIGHT = 44;

interface FmlyBarProps {
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  player: LyricDancePlayer | null;
  currentTimeSec: number;
  /**
   * Invoked when user fires a moment. `holdMs` is 0 for a tap, otherwise the
   * hold duration.
   */
  onFire: (lineIndex: number, holdMs: number) => void;
  getLineIndex: () => number;
  onSeekTo: (sec: number) => void;
  danceId?: string;
  comments?: Array<{ text: string; line_index: number | null }> ;
  onToastTap?: (momentIndex: number) => void;
}

export function FmlyBar({
  moments,
  fireHeat,
  player,
  currentTimeSec,
  onFire,
  getLineIndex,
  onSeekTo,
  danceId,
  comments = [],
  onToastTap,
}: FmlyBarProps) {
  const [renderTick, setRenderTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{ text: string; momentIndex: number } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const fireHoldControllerRef = useRef<ReturnType<typeof createFireHold> | null>(null);
  const userFiresRef = useRef<Record<number, number>>({});
  const emberCanvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Array<{
    x: number; y: number; vy: number; vx: number;
    life: number; size: number; opacity: number;
    r: number; g: number; b: number;
    segIdx: number; x0: number; x1: number;
  }>>([]);
  const pendingPlayheadBurstRef = useRef<{ count: number; intensity: number } | null>(null);
  const animRef = useRef<number>(0);
  const scrubbingRef = useRef(false);
  const progressPctRef = useRef(0);
  const toastMomentRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeHoldMomentRef = useRef<number>(-1);
  const activeHoldMsRef = useRef(0);

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(fireHeat, moments),
    [fireHeat, moments],
  );
  /**
   * Timeline duration — the authoritative length of the scrub bar's span.
   *
   * Source precedence:
   *   1. player.audio.duration — the true source once audio metadata is loaded.
   *   2. moments[last].endSec — best-available proxy during initial load.
   *   3. 0 — sentinel "not ready"; disables scrubbing.
   *
   * Using `|| 1` as a fallback (previous code) was a bug: NaN || 1 === 1, which
   * caused every click to map 0-100% of bar width to 0-1 second of audio.
   */
  const audioDuration = player?.audio?.duration;
  const totalDuration =
    (typeof audioDuration === "number" && isFinite(audioDuration) && audioDuration > 0)
      ? audioDuration
      : moments.length
        ? moments[moments.length - 1].endSec
        : 0;
  const ready = totalDuration > 0;
  const progressPct = Math.max(0, Math.min(100, (currentTimeSec / Math.max(0.0001, totalDuration)) * 100));
  progressPctRef.current = progressPct;

  const currentMomentIdx = useMemo(
    () => moments.findIndex((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec),
    [moments, currentTimeSec],
  );

  useEffect(() => {
    if (scrubbingRef.current || currentMomentIdx < 0) return;
    if (toastMomentRef.current === currentMomentIdx) return;
    const lineIndex = moments[currentMomentIdx]?.lines[0]?.lineIndex ?? moments[currentMomentIdx]?.sectionIndex;
    if (lineIndex == null) return;
    const bucket = comments.filter((c) => c.line_index === lineIndex);
    if (!bucket.length) return;
    const latest = bucket[bucket.length - 1];
    toastMomentRef.current = currentMomentIdx;
    setToast({ text: latest.text, momentIndex: currentMomentIdx });
    setToastVisible(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 3000);
  }, [comments, currentMomentIdx, moments]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

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
    fireHoldControllerRef.current = createFireHold({
      onCanvasTrigger: (elapsedMs) => {
        activeHoldMsRef.current = elapsedMs;
        player?.fireMoment?.(elapsedMs);
      },
    });
    return () => {
      fireHoldControllerRef.current?.destroy();
      fireHoldControllerRef.current = null;
    };
  }, [player]);

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
      const ranges: Array<{ x0: number; x1: number }> = [];
      for (const m of moments) {
        const x0 = (m.startSec / Math.max(0.0001, totalDuration)) * w;
        const x1 = (m.endSec / Math.max(0.0001, totalDuration)) * w;
        ranges.push({ x0, x1 });
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
        if (embers.length >= 60) break;
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

    const spawnPlayheadEmbers = (count: number, intensity: number) => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const playheadX = (progressPctRef.current / 100) * rect.width;
      const x0 = playheadX - 12;
      const x1 = playheadX + 12;
      for (let i = 0; i < count; i++) {
        if (embers.length >= 80) break;
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
      frame += 1;

      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      if (Math.abs(canvas.width / dpr - rect.width) > 2) resize();

      ctx.clearRect(0, 0, rect.width, rect.height);

      const getMomentWeight = (idx: number) => {
        const base = momentFireCounts[idx] ?? 0;
        const committedUser = (userFiresRef.current[idx] ?? 0) / 150;
        const liveHold = activeHoldMomentRef.current === idx ? (activeHoldMsRef.current / 150) : 0;
        return base + committedUser + liveHold;
      };

      const points: Array<{ x: number; y: number }> = [];
      const maxFire = Math.max(1, ...moments.map((_, i) => getMomentWeight(i)));
      const maxLineHeight = rect.height * 0.7;
      for (let i = 0; i < moments.length; i += 1) {
        const moment = moments[i];
        const fireWeight = getMomentWeight(i);
        const midPct = ((moment.startSec + moment.endSec) / 2) / Math.max(0.0001, totalDuration);
        const x = midPct * rect.width;
        const normalized = fireWeight > 0
          ? Math.log1p(fireWeight) / Math.log1p(maxFire)
          : 0;
        const y = rect.height - 2 - normalized * maxLineHeight;
        points.push({ x, y });
      }

      if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, rect.height - 2);
        ctx.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i += 1) {
          const curr = points[i];
          const next = points[i + 1];
          const cpx = (curr.x + next.x) / 2;
          const cpy = (curr.y + next.y) / 2;
          ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        if (points.length > 1) {
          const last = points[points.length - 1];
          ctx.lineTo(last.x, last.y);
        }
        ctx.lineTo(rect.width, rect.height - 2);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      }

      if (ready && progressPctRef.current > 0) {
        const currentPct = progressPctRef.current / 100;
        const playheadX = currentPct * rect.width;
        let playheadY = rect.height - 2;
        if (points.length >= 2) {
          let left = points[0];
          let right = points[points.length - 1];
          if (playheadX <= points[0].x) {
            left = { x: 0, y: rect.height - 2 };
            right = points[0];
          } else if (playheadX >= points[points.length - 1].x) {
            left = points[points.length - 1];
            right = { x: rect.width, y: rect.height - 2 };
          } else {
            for (let i = 0; i < points.length - 1; i += 1) {
              if (points[i].x <= playheadX && points[i + 1].x >= playheadX) {
                left = points[i];
                right = points[i + 1];
                break;
              }
            }
          }
          const t = right.x === left.x ? 0 : (playheadX - left.x) / (right.x - left.x);
          playheadY = left.y + (right.y - left.y) * t;
        } else if (points.length === 1) {
          playheadY = points[0].y;
        }
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(playheadX, playheadY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn embers — collective fires (everyone) + hottest moment (green)
      // Runs every ~20 frames (~3× per second at 60fps) for denser coverage
      if (frame % 20 === 0) {
        const maxFC = Math.max(1, ...moments.map((_, i) => momentFireCounts[i] ?? 0));

        let hottestIdx = -1;
        let hottestCount = 0;
        for (let i = 0; i < moments.length; i += 1) {
          const c = momentFireCounts[i] ?? 0;
          if (c > hottestCount) {
            hottestCount = c;
            hottestIdx = i;
          }
        }

        for (let i = 0; i < moments.length; i += 1) {
          const count = momentFireCounts[i] ?? 0;
          if (count <= 0) continue;
          const intensity = Math.min(1, count / maxFC);
          spawnEmber(i, 255, 140, 40, intensity);
        }

        if (hottestIdx >= 0 && hottestCount > 0) {
          const intensity = Math.min(1, hottestCount / maxFC);
          spawnEmber(hottestIdx, 74, 222, 128, intensity);
        }
      }

      const burst = pendingPlayheadBurstRef.current;
      if (burst) {
        pendingPlayheadBurstRef.current = null;
        spawnPlayheadEmbers(burst.count, burst.intensity);
      }

      // Update and draw particles
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.y += e.vy;
        e.x += e.vx;
        e.life -= 0.008;
        if (e.life <= 0 || e.y < -4) { embers.splice(i, 1); continue; }

        const flicker = 0.7 + Math.sin(performance.now() * 0.004 + i * 2.3) * 0.3;
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
  }, [moments, momentFireCounts, renderTick, ready, totalDuration]);

  // ── Fire handlers ───────────────────────────────────────────────────────
  const addUserFire = (idx: number, holdMs: number) => {
    if (idx < 0) return;
    userFiresRef.current[idx] = (userFiresRef.current[idx] ?? 0) + holdMs;
    setRenderTick((t) => t + 1);
  };

  const handleFireTap = useCallback(() => {
    addUserFire(currentMomentIdx, 150);
    pendingPlayheadBurstRef.current = { count: 2, intensity: 0.3 };
    activeHoldMomentRef.current = -1;
    activeHoldMsRef.current = 0;
    if (!danceId) return;
    onFire(getLineIndex(), 0);
  }, [currentMomentIdx, danceId, getLineIndex, onFire]);
  const handleFireHoldEnd = useCallback((holdMs: number) => {
    addUserFire(currentMomentIdx, holdMs);
    const intensity = Math.min(1.0, holdMs / 2000);
    pendingPlayheadBurstRef.current = { count: Math.floor(3 + intensity * 5), intensity };
    activeHoldMomentRef.current = -1;
    activeHoldMsRef.current = 0;
    if (!danceId) return;
    onFire(getLineIndex(), holdMs);
  }, [currentMomentIdx, danceId, getLineIndex, onFire]);

  const handleDown = () => {
    activeHoldMomentRef.current = currentMomentIdx;
    activeHoldMsRef.current = 0;
    pendingPlayheadBurstRef.current = { count: 3, intensity: 0.5 };
    player?.fireHoldStart?.();
    fireHoldControllerRef.current?.start();
  };

  const handleUp = () => {
    const holdData = fireHoldControllerRef.current?.stop();
    player?.fireHoldEnd?.();
    if (!holdData) return;
    const holdMs = holdData.holdMs;
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

          {/* Full-bar scrub overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              cursor: ready ? "pointer" : "default",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              if (!ready) return;
              scrubbingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeekTo(pct * totalDuration);
            }}
            onPointerMove={(e) => {
              if (!scrubbingRef.current || !ready) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeekTo(pct * totalDuration);
            }}
            onPointerUp={() => { scrubbingRef.current = false; }}
            onPointerCancel={() => { scrubbingRef.current = false; }}
          />
          </div>

          {toast && (
            <button
              type="button"
              onClick={() => onToastTap?.(toast.momentIndex)}
              style={{
                position: "absolute",
                left: "50%",
                bottom: BAR_HEIGHT + 8,
                transform: "translateX(-50%)",
                border: "none",
                background: "none",
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.25)",
                maxWidth: "80%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: "pointer",
                opacity: toastVisible ? 1 : 0,
                transition: "opacity 300ms ease",
                zIndex: 4,
              }}
            >
              {toast.text}
            </button>
          )}

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
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
              transition: "background 0.3s ease",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: "none",
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>🔥</span>
          </button>
        </div>
      </div>
    </>
  );
}

export { FmlyBar as LyricInteractionLayer };
