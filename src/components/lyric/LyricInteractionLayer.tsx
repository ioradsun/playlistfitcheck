import { useEffect, useMemo, useState } from "react";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import type { Moment } from "@/lib/buildMoments";
import { MomentFuseStrip } from "@/components/lyric/MomentFuseStrip";

interface LyricInteractionLayerProps {
  variant: "embedded" | "fullscreen";
  danceId: string;
  moments?: Moment[];
  currentTimeSec?: number;
  durationSec?: number;
  palette?: string[];
  accent?: string;
  reactionData?: Record<string, { line: Record<number, number>; total: number }>;
  player?: LyricDancePlayer | null;
  isLive?: boolean;
  hasFired?: boolean;
  totalFireCount?: number;
  songEnded?: boolean;
  refreshKey?: number;
  /** Section colors from cinematic direction */
  sectionColors?: Record<number, string>;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onSeekTo?: (sec: number) => void;
  onPause?: () => void;
  onResume?: () => void;
  source?: "feed" | "shareable" | "embed";
}

function deriveMomentFireCounts(
  reactionData: Record<string, { line: Record<number, number>; total: number }>,
  moments: Moment[] | undefined,
): Record<number, number> {
  if (!moments?.length) return {};
  const counts: Record<number, number> = {};
  for (let mi = 0; mi < moments.length; mi += 1) {
    let total = 0;
    for (const emojiData of Object.values(reactionData)) {
      for (const line of moments[mi].lines) {
        total += emojiData.line[line.lineIndex] ?? 0;
      }
    }
    counts[mi] = total;
  }
  return counts;
}

export function LyricInteractionLayer({
  variant,
  currentTimeSec = 0,
  durationSec = 0,
  accent,
  reactionData = {},
  player = null,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
  moments,
  sectionColors = {},
}: LyricInteractionLayerProps) {
  const isFullscreen = variant === "fullscreen";
  const [beatState, setBeatState] = useState({ energy: 0, hit: false });

  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      const bs = (player as any)._lastBeatState ?? (player as any).lastBeatState;
      if (!bs) return;
      setBeatState({
        energy: bs.energy ?? 0,
        hit: (bs.hitStrength ?? 0) > 0.3,
      });
    }, 50);
    return () => clearInterval(interval);
  }, [player]);

  const safeMoments = moments ?? [];
  const currentMomentIdx = useMemo(() => {
    for (let i = safeMoments.length - 1; i >= 0; i -= 1) {
      if (currentTimeSec >= safeMoments[i].startSec - 0.1) return i;
    }
    return 0;
  }, [safeMoments, currentTimeSec]);

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(reactionData, safeMoments),
    [reactionData, safeMoments],
  );
  const totalFires = useMemo(
    () => Object.values(reactionData).reduce((s, d) => s + d.total, 0),
    [reactionData],
  );

  return (
    <div
      style={{
        flexShrink: 0,
        ...(isFullscreen
          ? {
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 80,
              background: "linear-gradient(180deg, rgba(10,10,10,0), rgba(10,10,10,0.9) 34%)",
              display: "flex",
              justifyContent: "center",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }
          : {}),
      }}
    >
      <div style={{ width: "min(680px, 100%)" }}>
        <MomentFuseStrip
          moments={safeMoments}
          currentTimeSec={currentTimeSec}
          durationSec={durationSec}
          momentFireCounts={momentFireCounts}
          totalFires={totalFires}
          beatEnergy={beatState.energy}
          beatHit={beatState.hit}
          onSeekToMoment={(idx) => {
            const m = safeMoments[idx];
            if (m) onSeekTo?.(m.startSec);
          }}
          onFireTap={() => {
            onFireTap?.();
          }}
          onFireHoldStart={onFireHoldStart}
          onFireHoldEnd={onFireHoldEnd}
          onPrevMoment={() => {
            const prevIdx = Math.max(0, currentMomentIdx - 1);
            const m = safeMoments[prevIdx];
            if (m) onSeekTo?.(m.startSec);
          }}
          onNextMoment={() => {
            const nextIdx = Math.min(Math.max(0, safeMoments.length - 1), currentMomentIdx + 1);
            const m = safeMoments[nextIdx];
            if (m) onSeekTo?.(m.startSec);
          }}
          sectionColors={sectionColors}
          accent={accent}
        />
      </div>
    </div>
  );
}
