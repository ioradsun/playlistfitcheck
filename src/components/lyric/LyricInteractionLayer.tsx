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
  /** When true (closing screen is up), spotlight the user's biggest fire moment and dim everything else */
  closingActive?: boolean;
  /** Dance ID — needed to fetch the user's own fires from the database */
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

  const maxUserFire = useMemo(
    () => Math.max(1, ...Object.values(userFiresRef.current)),
    [renderTick],
  );

  const userTopIdx = useMemo(() => {
    if (!closingActive) return null;
    const fires = userFiresRef.current;
    let bestIdx = -1;
    let bestMs = 0;
    for (const [idx, ms] of Object.entries(fires)) {
      if (ms > bestMs) {
        bestMs = ms;
        bestIdx = Number(idx);
      }
    }
    return bestIdx >= 0 ? bestIdx : null;
  }, [closingActive, renderTick]);

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
    return () => {
      if (holdTickRef.current) window.clearInterval(holdTickRef.current);
    };
  }, []);

  const addUserFire = (idx: number, holdMs: number) => {
    if (idx < 0) return;
    userFiresRef.current[idx] = (userFiresRef.current[idx] ?? 0) + holdMs;
    setRenderTick((t) => t + 1);
  };

  const handleFireTap = () => {
    addUserFire(currentMomentIdx, 150);
    onFireTap();
  };

  const handleFireHoldEnd = (holdMs: number) => {
    addUserFire(currentMomentIdx, holdMs);
    onFireHoldEnd(holdMs);
  };

  const handleDown = () => {
    setPressing(true);
    holdStartRef.current = performance.now();
    player?.fireMoment?.();
    onFireHoldStart();
    holdTickRef.current = window.setInterval(() => {
      player?.fireMoment?.();
    }, 150);
  };

  const handleUp = () => {
    setPressing(false);
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
      handleFireTap();
    } else {
      handleFireHoldEnd(holdMs);
    }
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
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.55; }
        }
        .fire-icon-pulse {
          animation: fire-pulse 3s ease-in-out infinite;
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
        <div data-browsed-idx={browsedIdx ?? -1} style={{ flex: 1, display: "flex", position: "relative", minWidth: 0 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: closingActive ? "0%" : `${progressPct}%`,
              opacity: closingActive ? 0 : 1,
              background: "rgba(255,255,255,0.04)",
              borderRight: "1px solid rgba(255,255,255,0.12)",
              pointerEvents: "none",
              transition: "width 200ms linear, opacity 200ms linear",
              zIndex: 0,
            }}
          />

          {moments.map((moment, index) => {
            const isLast = index === moments.length - 1;
            const communityCount = momentFireCounts[index] ?? 0;
            const hasCommunityFire = communityCount > 0 && hottestIdx === index;
            const greenOpacity = Math.min(0.2 + (communityCount / maxFireCount) * 0.5, 0.7);

            const userHoldMs = userFiresRef.current[index] ?? 0;
            const hasUserFire = userHoldMs > 0;
            const orangeOpacity = hasUserFire
              ? 0.15 + (userHoldMs / maxUserFire) * 0.35
              : 0;

            const segmentOpacity = closingActive
              ? userTopIdx == null
                ? 0.15
                : userTopIdx === index
                  ? 1
                  : 0.15
              : 1;

            const spotlightGradient = closingActive
              && userTopIdx != null
              && userTopIdx === index
              && userTopIdx === hottestIdx
              && hasUserFire
              && hasCommunityFire;

            const spotlightOrange = closingActive
              && userTopIdx != null
              && userTopIdx === index
              && userTopIdx !== hottestIdx;

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
              >
                {hasCommunityFire && !spotlightGradient && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: `rgba(74,222,128,${greenOpacity})`,
                      boxShadow: `0 0 8px rgba(74,222,128,${greenOpacity * 0.35}), 0 -2px 12px rgba(74,222,128,${greenOpacity * 0.2})`,
                      borderRadius: "1px 1px 0 0",
                    }}
                  />
                )}

                {hasUserFire && !spotlightGradient && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: hasCommunityFire ? "3px" : 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: `rgba(255,160,50,${spotlightOrange ? 0.45 : orangeOpacity})`,
                      boxShadow: `0 0 6px rgba(255,140,30,${spotlightOrange ? 0.15 : orangeOpacity * 0.3})`,
                      borderRadius: "1px 1px 0 0",
                    }}
                  />
                )}

                {spotlightGradient && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "4px",
                      background: "linear-gradient(90deg, rgba(74,222,128,0.35), rgba(255,160,50,0.45))",
                      boxShadow: "0 0 8px rgba(74,222,128,0.08), 0 0 8px rgba(255,140,30,0.08)",
                      borderRadius: "1px 1px 0 0",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          style={{
            width: BAR_HEIGHT,
            height: BAR_HEIGHT,
            flexShrink: 0,
            background: "#0a0a0f",
            border: "none",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            opacity: closingActive ? 0.2 : undefined,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            fill={pressing ? "rgba(255,160,50,0.6)" : "none"}
            stroke={pressing ? "rgba(255,160,50,0.8)" : "rgba(255,255,255,0.3)"}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
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
