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
  // Memoization for the curve geometry — rebuilt only when crowd data, user
  // fire data, width, or hold state changes. Without this, the curve would
  // rebuild 60 times per second from identical inputs.
  const cachedCurveRef = useRef<{
    crowdPoints: Array<{ x: number; y: number; momentIdx: number }>;
    crowdPath: Path2D;
    fillPath: Path2D;
    maxCrowdFire: number;
    hottestCrowdIdx: number;
    userContributions: Array<{ momentIdx: number; extraHeight: number; cappedTop: number }>;
    width: number;
    counts: Record<number, number>;
    userFires: Record<number, number>;
    holdIdx: number;
    holdBucket: number;
    releaseIdx: number;
    releaseBucket: number;
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

  // ── Canvas render loop: curve + green winner + orange user-fires + playhead ─
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

    // ── Crowd weight: pure crowd data, excludes any user fires ──
    // This is load-bearing: the crowd curve MUST stay stable when the user
    // fires, otherwise every tap rewrites the crowd's reality. The user's
    // contribution is visualized separately (orange overlay) in a way that
    // never moves the crowd curve.
    const getCrowdWeight = (idx: number) => momentFireCounts[idx] ?? 0;

    // ── User weight: personal contribution only ──
    // Includes committed user fires, the in-progress hold boost, and the
    // post-release decay tail. This is what drives the ORANGE extension
    // drawn above the crowd curve.
    const getUserWeight = (idx: number, now: number) => {
      const committedUser = (userFiresRef.current[idx] ?? 0) / 150;
      let holdBoost = 0;
      if (activeHoldMomentRef.current === idx && holdStartTimeRef.current > 0) {
        const elapsed = now - holdStartTimeRef.current;
        holdBoost = (elapsed / 2000) * Math.max(prevMaxFireRef.current, 5);
      }
      let decayBoost = 0;
      const decay = releaseDecayRef.current;
      if (decay && decay.momentIdx === idx) {
        const since = now - decay.releaseTime;
        if (since >= 500) {
          releaseDecayRef.current = null;
        } else {
          decayBoost = decay.peakBoost * (1 - since / 500);
        }
      }
      return committedUser + holdBoost + decayBoost;
    };

    const buildCurve = (rect: DOMRect, now: number) => {
      const baseline = rect.height - 2;
      const maxLineHeight = rect.height * 0.7;

      // Compute crowd heights, normalized against crowd-only max.
      // This is what keeps the crowd curve stable under user fires.
      const crowdWeights: number[] = [];
      let maxCrowdFire = 1;
      let hottestCrowdIdx = -1;
      let hottestCrowdWeight = 0;
      for (let i = 0; i < moments.length; i += 1) {
        const w = getCrowdWeight(i);
        crowdWeights.push(w);
        if (w > maxCrowdFire) maxCrowdFire = w;
        if (w > hottestCrowdWeight) {
          hottestCrowdWeight = w;
          hottestCrowdIdx = i;
        }
      }
      // Also track the overall weight (crowd + user) for use in setMoments
      // rebuild gating via prevMaxFireRef.
      let overallMax = 1;
      for (let i = 0; i < moments.length; i += 1) {
        const overall = crowdWeights[i] + getUserWeight(i, now);
        if (overall > overallMax) overallMax = overall;
      }
      prevMaxFireRef.current = overallMax;

      const crowdPoints: Array<{ x: number; y: number; momentIdx: number }> = [];
      for (let i = 0; i < moments.length; i += 1) {
        const moment = moments[i];
        // Peaks at moment END — users react AFTER a lyric line lands.
        const endPct = moment.endSec / Math.max(0.0001, totalDuration);
        const x = Math.max(0, Math.min(rect.width, endPct * rect.width));
        const fireWeight = crowdWeights[i];
        const normalized = fireWeight > 0
          ? Math.log1p(fireWeight) / Math.log1p(maxCrowdFire)
          : 0;
        const y = baseline - normalized * maxLineHeight;
        crowdPoints.push({ x, y, momentIdx: i });
      }

      // Build crowd curve path (stroke) and matching fill path (closed to baseline).
      const crowdPath = new Path2D();
      const fillPath = new Path2D();
      if (crowdPoints.length > 0) {
        crowdPath.moveTo(0, baseline);
        crowdPath.lineTo(crowdPoints[0].x, crowdPoints[0].y);
        fillPath.moveTo(0, baseline);
        fillPath.lineTo(crowdPoints[0].x, crowdPoints[0].y);
        for (let i = 0; i < crowdPoints.length - 1; i += 1) {
          const curr = crowdPoints[i];
          const next = crowdPoints[i + 1];
          const cpx = (curr.x + next.x) / 2;
          const cpy = (curr.y + next.y) / 2;
          crowdPath.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
          fillPath.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        const last = crowdPoints[crowdPoints.length - 1];
        crowdPath.lineTo(last.x, last.y);
        crowdPath.lineTo(rect.width, baseline);
        fillPath.lineTo(last.x, last.y);
        fillPath.lineTo(rect.width, baseline);
        fillPath.closePath();
      }

      // ── User contributions: per-moment orange extensions ──
      // For each moment where the user has fired (or is firing), compute how
      // much ADDITIONAL height rises above the crowd curve's y at that moment.
      // Capped at bar top (cappedTop = 2 with a little headroom).
      const userContributions: Array<{ momentIdx: number; extraHeight: number; cappedTop: number }> = [];
      for (let i = 0; i < moments.length; i += 1) {
        const userW = getUserWeight(i, now);
        if (userW <= 0) continue;
        const pt = crowdPoints[i];
        if (!pt) continue;
        // Same normalization scale as crowd — 1 unit of user weight = 1 unit
        // of crowd weight visually. This means on a very hot crowd moment
        // where the curve is already near bar-top, your fire has little room.
        // That's honest: you can't move the needle much where the crowd has
        // already filled the space.
        const addHeightNormalized = Math.log1p(userW) / Math.log1p(maxCrowdFire);
        const requestedHeight = addHeightNormalized * maxLineHeight;
        const availableAboveCrowd = pt.y - 2; // leave 2px at bar top
        const actualHeight = Math.max(0, Math.min(requestedHeight, availableAboveCrowd));
        const cappedTop = pt.y - actualHeight;
        userContributions.push({
          momentIdx: i,
          extraHeight: actualHeight,
          cappedTop,
        });
      }

      return { crowdPoints, crowdPath, fillPath, maxCrowdFire, hottestCrowdIdx, userContributions };
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
      const releaseDecay = releaseDecayRef.current;
      const releaseIdx = releaseDecay?.momentIdx ?? -1;
      const releaseBucket = releaseDecay
        ? Math.floor((now - releaseDecay.releaseTime) / 50)
        : 0;

      // Cache invalidation: rebuild when any input that affects geometry changes.
      // During idle playback with no user interaction, NONE of these change and
      // the cached paths are reused frame after frame — the draw loop becomes
      // three cheap draw operations.
      const cached = cachedCurveRef.current;
      const needsRebuild =
        !cached
        || cached.width !== rect.width
        || cached.counts !== momentFireCounts
        || cached.userFires !== userFiresRef.current
        || cached.holdIdx !== holdIdx
        || cached.holdBucket !== holdBucket
        || cached.releaseIdx !== releaseIdx
        || cached.releaseBucket !== releaseBucket;

      let curve = cached;
      if (needsRebuild) {
        const built = buildCurve(rect, now);
        curve = {
          crowdPoints: built.crowdPoints,
          crowdPath: built.crowdPath,
          fillPath: built.fillPath,
          maxCrowdFire: built.maxCrowdFire,
          hottestCrowdIdx: built.hottestCrowdIdx,
          userContributions: built.userContributions,
          width: rect.width,
          counts: momentFireCounts,
          userFires: userFiresRef.current,
          holdIdx,
          holdBucket,
          releaseIdx,
          releaseBucket,
        };
        cachedCurveRef.current = curve;
      }
      if (!curve) return;

      ctx.clearRect(0, 0, rect.width, rect.height);

      // ── 1. Heat floor: subtle white wash under entire curve ──
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fill(curve.fillPath);

      // ── 2. Green winner shade at the crowd's #1 moment's segment ──
      // Winner is crowd-only — user fires never flip the crown.
      if (curve.hottestCrowdIdx >= 0 && curve.maxCrowdFire > 1) {
        const idx = curve.hottestCrowdIdx;
        const p = curve.crowdPoints[idx];
        const prev = curve.crowdPoints[idx - 1];
        const next = curve.crowdPoints[idx + 1];
        const xLeft = prev ? (prev.x + p.x) / 2 : 0;
        const xRight = next ? (p.x + next.x) / 2 : rect.width;

        // Clipped fill under the crowd curve, bounded to this moment's segment.
        ctx.save();
        ctx.beginPath();
        ctx.rect(xLeft, 0, xRight - xLeft, rect.height);
        ctx.clip();
        ctx.fillStyle = "rgba(74, 222, 128, 0.30)";
        ctx.fill(curve.fillPath);
        ctx.restore();
      }

      // ── 3. White crowd curve stroke — the map of FMLY heat ──
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(curve.crowdPath);

      // ── 4. Orange user-fire extensions, rising above the crowd curve ──
      // Drawn per-moment as a segment fill from the crowd's y up to cappedTop.
      // Shape: the crowd's existing curve from xLeft to xRight, with the
      // top pushed upward by extraHeight. Simplest correct approximation: a
      // rounded-top rectangle at the moment's x, width spanning the segment.
      for (const contrib of curve.userContributions) {
        const idx = contrib.momentIdx;
        const p = curve.crowdPoints[idx];
        if (!p) continue;
        const prev = curve.crowdPoints[idx - 1];
        const next = curve.crowdPoints[idx + 1];
        const xLeft = prev ? (prev.x + p.x) / 2 : 0;
        const xRight = next ? (p.x + next.x) / 2 : rect.width;
        const width = xRight - xLeft;
        if (width <= 0) continue;

        ctx.fillStyle = "rgba(255, 140, 40, 0.50)";
        // Rounded top-only rectangle: straight sides, flat bottom at crowd y,
        // rounded top at cappedTop. If extraHeight is tiny (< 2px), just draw
        // a flat fill to avoid degenerate arcs.
        if (contrib.extraHeight < 2) {
          ctx.fillRect(xLeft, contrib.cappedTop, width, p.y - contrib.cappedTop);
        } else {
          const r = Math.min(4, width / 2, contrib.extraHeight);
          ctx.beginPath();
          ctx.moveTo(xLeft, p.y);
          ctx.lineTo(xLeft, contrib.cappedTop + r);
          ctx.quadraticCurveTo(xLeft, contrib.cappedTop, xLeft + r, contrib.cappedTop);
          ctx.lineTo(xRight - r, contrib.cappedTop);
          ctx.quadraticCurveTo(xRight, contrib.cappedTop, xRight, contrib.cappedTop + r);
          ctx.lineTo(xRight, p.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── 5. Playhead dot at top of bar ──
      if (ready && progressPctRef.current > 0) {
        const playheadX = (progressPctRef.current / 100) * rect.width;
        ctx.beginPath();
        ctx.arc(playheadX, 2, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fill();
      }

      // ── Fire button scale during hold (preserved behavior) ──
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
