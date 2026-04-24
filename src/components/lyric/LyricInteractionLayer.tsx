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
  /** When true, show comment input overlaying the curve area */
  composing?: boolean;
  /** Author name for reply chip (null = not replying) */
  replyTargetAuthor?: string | null;
  /** Called when user submits a comment */
  onCommentSubmit?: (text: string) => void;
  /** Called when user dismisses reply target */
  onClearReply?: () => void;
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
  composing = false,
  replyTargetAuthor = null,
  onCommentSubmit,
  onClearReply,
}: FmlyBarProps) {
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{ text: string; momentIndex: number } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [commentText, setCommentText] = useState("");

  const fireHoldControllerRef = useRef<ReturnType<typeof createFireHold> | null>(null);
  const userFiresRef = useRef<Record<number, number>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Memoization for the curve geometry — rebuilt only when crowd data, user
  // fire data, width, or hold state changes. Without this, the curve would
  // rebuild 60 times per second from identical inputs.
  const cachedCurveRef = useRef<{
    curvePoints: Array<{ x: number; y: number; momentIdx: number; xLeft: number; xRight: number }>;
    curvePath: Path2D;
    maxCombinedFire: number;
    hottestCrowdIdx: number;
    userFiredSegments: Set<number>;
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
  const commentInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setCommentText("");
    if (composing) commentInputRef.current?.focus();
  }, [composing]);

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

  // ── Canvas render loop: unified curve + green winner + user segments + playhead ─
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
    const getCrowdWeight = (idx: number) => momentFireCounts[idx] ?? 0;

    // ── User weight: personal contribution only ──
    // Includes committed user fires, the in-progress hold boost, and the
    // post-release decay tail. This now contributes directly to unified
    // curve height.
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

      // Compute combined heights and normalize against combined max so the
      // user's fire raises the same unified curve.
      const combinedWeights: number[] = [];
      let maxCombinedFire = 1;
      let hottestCrowdIdx = -1;
      let hottestCrowdWeight = 0;
      for (let i = 0; i < moments.length; i += 1) {
        const crowdWeight = getCrowdWeight(i);
        const userWeight = getUserWeight(i, now);
        const combinedWeight = crowdWeight + userWeight;
        combinedWeights.push(combinedWeight);
        if (combinedWeight > maxCombinedFire) maxCombinedFire = combinedWeight;
        if (crowdWeight > hottestCrowdWeight) {
          hottestCrowdWeight = crowdWeight;
          hottestCrowdIdx = i;
        }
      }
      prevMaxFireRef.current = maxCombinedFire;

      const curvePoints: Array<{ x: number; y: number; momentIdx: number; xLeft: number; xRight: number }> = [];
      for (let i = 0; i < moments.length; i += 1) {
        const moment = moments[i];
        // Peaks at moment END — users react AFTER a lyric line lands.
        const endPct = moment.endSec / Math.max(0.0001, totalDuration);
        const x = Math.max(0, Math.min(rect.width, endPct * rect.width));
        const fireWeight = combinedWeights[i];
        const normalized = fireWeight > 0
          ? Math.log1p(fireWeight) / Math.log1p(maxCombinedFire)
          : 0;
        const y = baseline - normalized * maxLineHeight;
        curvePoints.push({ x, y, momentIdx: i, xLeft: 0, xRight: 0 });
      }
      for (let i = 0; i < curvePoints.length; i += 1) {
        const prev = curvePoints[i - 1];
        const next = curvePoints[i + 1];
        curvePoints[i].xLeft = prev ? (prev.x + curvePoints[i].x) / 2 : 0;
        curvePoints[i].xRight = next ? (curvePoints[i].x + next.x) / 2 : rect.width;
      }

      // Build curve path (stroke).
      const curvePath = new Path2D();
      if (curvePoints.length > 0) {
        curvePath.moveTo(0, baseline);
        curvePath.lineTo(curvePoints[0].x, curvePoints[0].y);
        for (let i = 0; i < curvePoints.length - 1; i += 1) {
          const curr = curvePoints[i];
          const next = curvePoints[i + 1];
          const cpx = (curr.x + next.x) / 2;
          const cpy = (curr.y + next.y) / 2;
          curvePath.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
        }
        const last = curvePoints[curvePoints.length - 1];
        curvePath.lineTo(last.x, last.y);
        curvePath.lineTo(rect.width, baseline);
      }

      // User-fired segments are persistent for the session — the stroke stays orange
      // wherever the user has committed fires. Driven directly by userFiresRef.
      const userFiredSegments = new Set<number>();
      for (const key of Object.keys(userFiresRef.current)) {
        const idx = Number(key);
        if ((userFiresRef.current[idx] ?? 0) > 0) userFiredSegments.add(idx);
      }

      return { curvePoints, curvePath, maxCombinedFire, hottestCrowdIdx, userFiredSegments };
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
          curvePoints: built.curvePoints,
          curvePath: built.curvePath,
          maxCombinedFire: built.maxCombinedFire,
          hottestCrowdIdx: built.hottestCrowdIdx,
          userFiredSegments: built.userFiredSegments,
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

      // ── White base stroke — crowd shape across all moments ──────────────
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(curve.curvePath);

      // ── Helper to stroke only a specific moment's segment by clipping ────
      const strokeSegment = (idx: number, strokeStyle: string) => {
        const p = curve.curvePoints[idx];
        if (!p) return;
        if (p.xRight <= p.xLeft) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.xLeft, 0, p.xRight - p.xLeft, rect.height);
        ctx.clip();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke(curve.curvePath);
        ctx.restore();
      };

      // ── Green winner — the crowd's #1 moment, opaque and confident ──────
      if (curve.hottestCrowdIdx >= 0 && getCrowdWeight(curve.hottestCrowdIdx) > 1) {
        strokeSegment(curve.hottestCrowdIdx, "rgba(74, 222, 128, 0.9)");
      }

      // ── Orange user-fired segments — persistent record of user's fires ──
      // Drawn AFTER green so that when the user's fire lands on the crowd
      // winner, orange visually takes precedence (most recent, most personal).
      for (const idx of curve.userFiredSegments) {
        strokeSegment(idx, "rgba(255, 140, 40, 0.9)");
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

  const commitFire = useCallback((rawHoldMs: number) => {
    const isTap = rawHoldMs < 180;
    const fireMomentIdx = activeHoldMomentRef.current >= 0
      ? activeHoldMomentRef.current
      : currentMomentIdx;
    addUserFire(fireMomentIdx, isTap ? 150 : rawHoldMs);
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
    onFire(pressAttributedIndexRef.current, isTap ? 0 : rawHoldMs);
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
    commitFire(holdData.holdMs);
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
          {/* Bar content wrapper */}
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
              opacity: composing ? 0 : 1,
              pointerEvents: composing ? "none" : "auto",
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
              opacity: composing ? 0 : 1,
              pointerEvents: composing ? "none" : "auto",
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

          {composing && (
            <>
              {replyTargetAuthor && (
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    top: -22,
                    zIndex: 11,
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.5)",
                    background: "rgba(20,20,24,0.9)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>↳ @{replyTargetAuthor}</span>
                  <button
                    type="button"
                    onClick={onClearReply}
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.4)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  gap: 8,
                  background: "rgba(10,10,15,0.92)",
                }}
              >
                <input
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const trimmed = commentText.trim();
                      if (trimmed) {
                        onCommentSubmit?.(trimmed);
                        setCommentText("");
                      }
                    }
                  }}
                  placeholder={replyTargetAuthor ? "reply..." : "What hit?"}
                  maxLength={140}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 30,
                    border: "none",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 13,
                    fontFamily: "monospace",
                    padding: "0 10px",
                    borderRadius: 999,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = commentText.trim();
                    if (trimmed) {
                      onCommentSubmit?.(trimmed);
                      setCommentText("");
                    }
                  }}
                  disabled={commentText.trim().length === 0}
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "none",
                    background: commentText.trim().length > 0 ? "rgba(74,222,128,0.8)" : "rgba(255,255,255,0.08)",
                    color: commentText.trim().length > 0 ? "#0a0a0f" : "rgba(255,255,255,0.3)",
                    fontSize: 14,
                    cursor: commentText.trim().length > 0 ? "pointer" : "default",
                    transition: "background 150ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label="send"
                >
                  ↑
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export { FmlyBar as LyricInteractionLayer };
