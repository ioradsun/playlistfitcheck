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
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{ text: string; momentIndex: number } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const fireHoldControllerRef = useRef<ReturnType<typeof createFireHold> | null>(null);
  const userFiresRef = useRef<Record<number, number>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Memoization for the curve Path2D — rebuilt only when heat data or width changes.
  const cachedPathRef = useRef<{
    path: Path2D;
    fillPath: Path2D;
    points: Array<{ x: number; y: number; momentIdx: number }>;
    maxFire: number;
    width: number;
    counts: Record<number, number>;
    holdIdx: number;
    holdBucket: number;
  } | null>(null);
  const prevMaxFireRef = useRef(1);
  const releaseDecayRef = useRef<{ momentIdx: number; peakBoost: number; releaseTime: number } | null>(null);
  const animRef = useRef<number>(0);
  const scrubbingRef = useRef(false);
  const progressPctRef = useRef(0);
  const toastMomentRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeHoldMomentRef = useRef<number>(-1);
  const holdStartTimeRef = useRef<number>(0);
  const pressAttributedIndexRef = useRef<number>(0);
  const fireButtonRef = useRef<HTMLSpanElement>(null);

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
    });
  }, [moments, danceId, hydrated]);

  useEffect(() => {
    fireHoldControllerRef.current = createFireHold({
      onCanvasTrigger: () => {
        player?.spawnFireRiser?.();
      },
    });
    return () => {
      fireHoldControllerRef.current?.destroy();
      fireHoldControllerRef.current = null;
    };
  }, [player]);

  // ── Canvas render loop: curve + peak marker + playhead + optional hold bar ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !moments.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    const getMomentWeight = (idx: number, now: number) => {
      const base = momentFireCounts[idx] ?? 0;
      const committedUser = (userFiresRef.current[idx] ?? 0) / 150;
      if (activeHoldMomentRef.current === idx && holdStartTimeRef.current > 0) {
        const elapsed = now - holdStartTimeRef.current;
        const holdBoost = (elapsed / 2000) * Math.max(prevMaxFireRef.current, 5);
        return base + committedUser + holdBoost;
      }
      const decay = releaseDecayRef.current;
      if (decay && decay.momentIdx === idx) {
        const since = now - decay.releaseTime;
        if (since >= 500) {
          releaseDecayRef.current = null;
        } else {
          const remaining = decay.peakBoost * (1 - since / 500);
          return base + committedUser + remaining;
        }
      }
      return base + committedUser;
    };

    const buildCurve = (rect: DOMRect, now: number) => {
      const baseline = rect.height - 2;
      const maxLineHeight = rect.height * 0.7;
      const weights: number[] = [];
      let maxFire = 1;
      for (let i = 0; i < moments.length; i += 1) {
        const w = getMomentWeight(i, now);
        weights.push(w);
        if (w > maxFire) maxFire = w;
      }
      prevMaxFireRef.current = maxFire;

      const points: Array<{ x: number; y: number; momentIdx: number }> = [];
      for (let i = 0; i < moments.length; i += 1) {
        const moment = moments[i];
        // Peaks land at moment END, not midpoint — users react AFTER a line, so
        // heat attributed to a moment is really heat at the end of that line.
        const endPct = moment.endSec / Math.max(0.0001, totalDuration);
        const x = Math.max(0, Math.min(rect.width, endPct * rect.width));
        const fireWeight = weights[i];
        const normalized = fireWeight > 0
          ? Math.log1p(fireWeight) / Math.log1p(maxFire)
          : 0;
        const y = baseline - normalized * maxLineHeight;
        points.push({ x, y, momentIdx: i });
      }

      const path = new Path2D();
      const fillPath = new Path2D();
      if (points.length > 0) {
        path.moveTo(0, baseline);
        path.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i += 1) {
          const curr = points[i];
          const next = points[i + 1];
          const cpx = (curr.x + next.x) / 2;
          const cpy = (curr.y + next.y) / 2;
          path.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        const last = points[points.length - 1];
        path.lineTo(last.x, last.y);
        path.lineTo(rect.width, baseline);

        // Fill path: same shape, closed at baseline for the heat-floor fill
        fillPath.moveTo(0, baseline);
        fillPath.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i += 1) {
          const curr = points[i];
          const next = points[i + 1];
          const cpx = (curr.x + next.x) / 2;
          const cpy = (curr.y + next.y) / 2;
          fillPath.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        fillPath.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        fillPath.lineTo(rect.width, baseline);
        fillPath.closePath();
      }

      return { path, fillPath, points, maxFire };
    };

    const loop = () => {
      animRef.current = requestAnimationFrame(loop);

      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      if (Math.abs(canvas.width / dpr - rect.width) > 2) resize();

      const now = performance.now();
      const holdIdx = activeHoldMomentRef.current;
      const holdBucket = holdIdx >= 0 && holdStartTimeRef.current > 0
        ? Math.floor((now - holdStartTimeRef.current) / 100)
        : 0;

      // Cache invalidators: counts changed, width changed, hold state changed,
      // or hold elapsed crossed a 100ms bucket.
      const cached = cachedPathRef.current;
      const needsRebuild =
        !cached
        || cached.width !== rect.width
        || cached.counts !== momentFireCounts
        || cached.holdIdx !== holdIdx
        || cached.holdBucket !== holdBucket;

      let curve = cached;
      if (needsRebuild) {
        const built = buildCurve(rect, now);
        curve = {
          path: built.path,
          fillPath: built.fillPath,
          points: built.points,
          maxFire: built.maxFire,
          width: rect.width,
          counts: momentFireCounts,
          holdIdx,
          holdBucket,
        };
        cachedPathRef.current = curve;
      }
      if (!curve) return;

      ctx.clearRect(0, 0, rect.width, rect.height);

      // ── Heat floor: translucent orange wash beneath the curve ─────────────
      ctx.fillStyle = "rgba(255, 140, 40, 0.08)";
      ctx.fill(curve.fillPath);

      // ── Curve stroke: quiet white, reads as a shape not a signal ──────────
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(curve.path);

      // ── Peak marker: single dot at the FMLY-voted hottest moment ──────────
      // Static: stays put regardless of playhead position (Option A).
      let hottestIdx = -1;
      let hottestY = Infinity;
      for (let i = 0; i < curve.points.length; i += 1) {
        if (curve.points[i].y < hottestY) {
          hottestY = curve.points[i].y;
          hottestIdx = i;
        }
      }
      if (hottestIdx >= 0 && curve.maxFire > 1) {
        const p = curve.points[hottestIdx];
        // Outer white ring (push-pin effect)
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fill();
        // Inner accent fill
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 140, 40, 1)";
        ctx.fill();
      }

      // ── Fire hold bar: rising flame at the held moment's end-x ────────────
      // Height grows with hold time; bar color deepens bottom-to-top.
      // On release (handled elsewhere), the bar disappears and the curve's
      // point at that moment has already been lifted via the hold boost in
      // getMomentWeight — so the curve smoothly rises to meet it.
      if (holdIdx >= 0 && holdStartTimeRef.current > 0 && curve.points[holdIdx]) {
        const elapsed = now - holdStartTimeRef.current;
        const t = Math.min(1, elapsed / 2000);
        const maxLineHeight = rect.height * 0.7;
        const baseline = rect.height - 2;
        const barH = Math.min(rect.height - 4, t * maxLineHeight * 1.05);
        const holdX = curve.points[holdIdx].x;
        const barW = 3;

        // Rounded-top rectangle
        const barTop = baseline - barH;
        const grad = ctx.createLinearGradient(holdX, baseline, holdX, barTop);
        grad.addColorStop(0, "rgba(255, 140, 40, 0.9)");
        grad.addColorStop(1, "rgba(255, 210, 128, 0.7)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(holdX - barW / 2, baseline);
        ctx.lineTo(holdX - barW / 2, barTop + barW / 2);
        ctx.arc(holdX, barTop + barW / 2, barW / 2, Math.PI, 0);
        ctx.lineTo(holdX + barW / 2, baseline);
        ctx.closePath();
        ctx.fill();
      }

      // ── Playhead: dot at fixed baseline, x only ───────────────────────────
      if (ready && progressPctRef.current > 0) {
        const baseline = rect.height - 2;
        const playheadX = (progressPctRef.current / 100) * rect.width;
        ctx.beginPath();
        ctx.arc(playheadX, baseline, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fill();
      }

      // ── Fire button scale during hold (preserved from previous behavior) ──
      if (fireButtonRef.current) {
        if (activeHoldMomentRef.current >= 0 && holdStartTimeRef.current > 0) {
          const elapsed = now - holdStartTimeRef.current;
          const intensity = Math.min(1, elapsed / 2000);
          const scale = 1 + intensity * 0.4;
          fireButtonRef.current.style.transform = `scale(${scale})`;
        } else {
          fireButtonRef.current.style.transform = "scale(1)";
        }
      }
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [moments, momentFireCounts, ready, totalDuration]);

  // ── Fire handlers ───────────────────────────────────────────────────────
  const addUserFire = (idx: number, holdMs: number) => {
    if (idx < 0) return;
    userFiresRef.current[idx] = (userFiresRef.current[idx] ?? 0) + holdMs;
  };

  const handleFireTap = useCallback(() => {
    const fireMomentIdx = activeHoldMomentRef.current >= 0
      ? activeHoldMomentRef.current
      : currentMomentIdx;
    addUserFire(fireMomentIdx, 150);
    if (activeHoldMomentRef.current >= 0 && holdStartTimeRef.current > 0) {
      const elapsed = performance.now() - holdStartTimeRef.current;
      const peakBoost = (elapsed / 2000) * Math.max(prevMaxFireRef.current, 5);
      releaseDecayRef.current = {
        momentIdx: activeHoldMomentRef.current,
        peakBoost,
        releaseTime: performance.now(),
      };
    }
    activeHoldMomentRef.current = -1;
    holdStartTimeRef.current = 0;
    if (!danceId) return;
    onFire(pressAttributedIndexRef.current, 0);
  }, [currentMomentIdx, danceId, onFire]);

  const handleFireHoldEnd = useCallback((holdMs: number) => {
    const fireMomentIdx = activeHoldMomentRef.current >= 0
      ? activeHoldMomentRef.current
      : currentMomentIdx;
    addUserFire(fireMomentIdx, holdMs);
    if (activeHoldMomentRef.current >= 0 && holdStartTimeRef.current > 0) {
      const elapsed = performance.now() - holdStartTimeRef.current;
      const peakBoost = (elapsed / 2000) * Math.max(prevMaxFireRef.current, 5);
      releaseDecayRef.current = {
        momentIdx: activeHoldMomentRef.current,
        peakBoost,
        releaseTime: performance.now(),
      };
    }
    activeHoldMomentRef.current = -1;
    holdStartTimeRef.current = 0;
    if (!danceId) return;
    onFire(pressAttributedIndexRef.current, holdMs);
  }, [currentMomentIdx, danceId, onFire]);

  const handleDown = () => {
    let momentIdx = currentMomentIdx;
    if (momentIdx < 0 && moments.length > 0) {
      let minDist = Infinity;
      for (let i = 0; i < moments.length; i += 1) {
        const mid = (moments[i].startSec + moments[i].endSec) / 2;
        const dist = Math.abs(currentTimeSec - mid);
        if (dist < minDist) {
          minDist = dist;
          momentIdx = i;
        }
      }
    }
    if (momentIdx < 0) return;

    activeHoldMomentRef.current = momentIdx;
    holdStartTimeRef.current = performance.now();
    pressAttributedIndexRef.current = getLineIndex();
    fireHoldControllerRef.current?.start();
  };

  const handleUp = () => {
    const holdData = fireHoldControllerRef.current?.stop();
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
          {/* Heat curve canvas — overlaid on moments, pointer-events: none */}
          <canvas
            ref={canvasRef}
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
            <span
              ref={fireButtonRef}
              style={{
                fontSize: 22,
                lineHeight: 1,
                transition: "transform 0.15s ease-out",
                display: "inline-block",
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
