import { useCallback, useEffect, useMemo, useRef } from "react";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { MomentCard } from "@/components/lyric/MomentCard";
import { MomentThread } from "@/components/lyric/MomentThread";
import { ModePanel } from "@/components/lyric/modes/ModePanel";
import type { Moment } from "@/lib/buildMoments";
import type { ModeContext } from "./types";

export function MomentsMode({ ctx }: { ctx: ModeContext }) {
  const {
    danceId,
    moments,
    fireHeat,
    currentTimeSec,
    data,
    comments,
    profileMap,
    fireUserMap,
    fireAnonCount,
    momentsModeState,
    onPlayLine,
    onCommentReact,
  } = ctx;

  const { expandedMomentIdx, setExpandedMomentIdx, replyTargetId, setReplyTargetId } = momentsModeState;
  const hasLines = Array.isArray(data?.lines) && data.lines.length > 0;
  const words = hasLines ? (data?.words ?? []) : [];
  const isInstrumental = !hasLines;
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const momentFireCounts = useMemo(
    () => deriveMomentFireCounts(fireHeat, moments),
    [fireHeat, moments],
  );

  const hottestIdx = useMemo(() => {
    if (!moments.length) return -1;
    let best = 0;
    for (let i = 1; i < moments.length; i += 1) {
      if ((momentFireCounts[i] ?? 0) > (momentFireCounts[best] ?? 0)) best = i;
    }
    return best;
  }, [moments, momentFireCounts]);

  const commentsByMoment = useMemo(() => {
    const lineToMoment: Record<number, number> = {};
    moments.forEach((moment) => {
      if (moment.lines.length === 0) lineToMoment[moment.sectionIndex] = moment.index;
      moment.lines.forEach((line) => { lineToMoment[line.lineIndex] = moment.index; });
    });
    const grouped: Record<number, typeof comments> = {};
    comments.forEach((comment) => {
      if (comment.line_index == null) return;
      const idx = lineToMoment[comment.line_index];
      if (idx == null) return;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx].push(comment);
    });
    return grouped;
  }, [comments, moments]);

  const currentMomentIndex = useMemo(() => {
    const active = moments.find((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec);
    return active?.index ?? null;
  }, [moments, currentTimeSec]);

  const handleCardTap = useCallback((momentIdx: number) => {
    const m = moments[momentIdx];
    if (!m) return;
    onPlayLine(m.startSec, m.endSec);
    setExpandedMomentIdx(momentIdx);
    setReplyTargetId(null);
  }, [moments, onPlayLine, setExpandedMomentIdx, setReplyTargetId]);

  const handleBack = useCallback(() => {
    setExpandedMomentIdx(null);
    setReplyTargetId(null);
  }, [setExpandedMomentIdx, setReplyTargetId]);

  const handleReact = useCallback((commentId: string, emoji: string, toggle: boolean) => {
    onCommentReact(commentId, emoji, toggle);
  }, [onCommentReact]);

  useEffect(() => {
    if (expandedMomentIdx !== null || currentMomentIndex == null) return;
    const el = cardRefs.current[currentMomentIndex];
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentMomentIndex, expandedMomentIdx]);

  if (!danceId) return null;

  if (expandedMomentIdx !== null) {
    const m = moments[expandedMomentIdx];
    if (!m) return null;
    const threadComments = commentsByMoment[expandedMomentIdx] ?? [];
    const lineIndices = m.lines.length > 0
      ? m.lines.map((line) => line.lineIndex)
      : [m.sectionIndex];
    const userIds = new Set<string>();
    let anon = 0;
    for (const idx of lineIndices) {
      for (const uid of (fireUserMap[idx] ?? [])) userIds.add(uid);
      anon += fireAnonCount[idx] ?? 0;
    }
    const fireAvatarData = {
      avatars: [...userIds].slice(0, 3).map((uid) => ({
        url: profileMap[uid]?.avatarUrl ?? null,
        name: profileMap[uid]?.displayName ?? null,
      })),
      anonCount: anon + Math.max(0, userIds.size - 3),
    };

    const header = (
      <div>
        {fireAvatarData && (fireAvatarData.avatars.length > 0 || fireAvatarData.anonCount > 0) && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            {fireAvatarData.avatars.map((avatar, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: "50%",
                border: "1.5px solid #0a0a0a",
                marginLeft: i > 0 ? -5 : 0,
                overflow: "hidden", background: "rgba(255,255,255,0.08)",
              }}>
                {avatar.url ? <img src={avatar.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
            ))}
            {fireAvatarData.anonCount > 0 && (
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>
                +{fireAvatarData.anonCount}
              </span>
            )}
          </div>
        )}
        {isInstrumental ? (
          <p style={{ margin: 0, fontSize: 13, fontFamily: "monospace", color: "rgba(255,255,255,0.55)" }}>{m.label}</p>
        ) : (
          <LyricContent moment={m} words={words} currentTimeSec={currentTimeSec} />
        )}
      </div>
    );

    return (
      <ModePanel scroll="none">
        <MomentThread
          header={header}
          comments={threadComments}
          profileMap={profileMap}
          replyTargetId={replyTargetId}
          onBack={handleBack}
          onReplyTarget={setReplyTargetId}
          onReact={handleReact}
        />
      </ModePanel>
    );
  }

  return (
    <ModePanel scroll="y">
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "4px 0 32px" }}>
        {moments.map((moment) => {
          const fireTotal = momentFireCounts[moment.index] ?? 0;
          const mComments = commentsByMoment[moment.index] ?? [];

          return (
            <div key={moment.index} ref={(el) => { cardRefs.current[moment.index] = el; }}>
              <MomentCard
                moment={moment}
                fireTotal={fireTotal}
                isConsensus={moment.index === hottestIdx && fireTotal > 0}
                isLive={currentMomentIndex === moment.index}
                commentCount={mComments.length}
                onTap={() => handleCardTap(moment.index)}
              >
                {isInstrumental ? (
                  <EnergyBar energy={moment.energy ?? 0} />
                ) : (
                  <LyricContent moment={moment} words={words} currentTimeSec={currentTimeSec} />
                )}
              </MomentCard>
            </div>
          );
        })}
      </div>
    </ModePanel>
  );
}

function LyricContent({
  moment,
  words,
  currentTimeSec,
}: {
  moment: Moment;
  words: Array<{ word: string; start: number; end: number }>;
  currentTimeSec: number;
}) {
  const momentWords = words.filter((w) => w.start >= moment.startSec - 0.05 && w.start < moment.endSec + 0.05);
  if (momentWords.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>{moment.label}</p>;
  }
  return (
    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
      {momentWords.map((w) => {
        const active = currentTimeSec >= w.start - 0.05 && currentTimeSec < w.end + 0.05;
        return (
          <span key={`${w.start}-${w.word}`} style={{ color: active ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.45)" }}>
            {w.word}{" "}
          </span>
        );
      })}
    </p>
  );
}

function EnergyBar({ energy }: { energy: number }) {
  const clamped = Math.max(0, Math.min(1, energy));
  return (
    <div style={{ width: "100%", height: 4, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.round(clamped * 100)}%`,
          height: "100%",
          borderRadius: 999,
          background: `rgba(255, ${Math.round(255 - clamped * 95)}, ${Math.round(255 - clamped * 215)}, ${0.15 + clamped * 0.65})`,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
