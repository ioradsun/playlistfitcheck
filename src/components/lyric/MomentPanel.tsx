import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import type { Moment } from "@/lib/buildMoments";
import { useAuth } from "@/hooks/useAuth";
import { MomentCard } from "@/components/lyric/MomentCard";
import { createFireHold, fireWeight } from "@/lib/fireHold";

interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
  user_id: string | null;
}

interface MomentPanelProps {
  danceId: string;
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  currentTimeSec: number;
  words?: Array<{ word: string; start: number; end: number }>;
  onFireMoment: (lineIndex: number, timeSec: number, holdMs: number) => void;
  onPlayLine: (startSec: number, endSec: number) => void;
  isInstrumental?: boolean;
  comments: Comment[];
  onCommentAdded: (comment: Comment) => void;
  profileMap: Record<string, { avatarUrl: string | null; displayName: string | null }>;
  fireUserMap: Record<number, string[]>;
  fireAnonCount: Record<number, number>;
  spotifyTrackId?: string | null;
  lyricDanceUrl?: string | null;
}

export function MomentPanel({
  danceId,
  moments,
  fireHeat,
  currentTimeSec,
  words = [],
  onFireMoment,
  onPlayLine,
  isInstrumental,
  comments,
  onCommentAdded,
  profileMap,
  fireUserMap,
  fireAnonCount,
  spotifyTrackId,
  lyricDanceUrl,
}: MomentPanelProps) {
  const { user } = useAuth();
  const [firedMoments, setFiredMoments] = useState<Set<number>>(new Set());
  const [expandedMoment, setExpandedMoment] = useState<number | null>(null);
  const [pressing, setPressing] = useState<number | null>(null);
  const [localFires, setLocalFires] = useState<Record<number, number>>({});
  const [playingMoment, setPlayingMoment] = useState<number | null>(null);
  const fireHoldControllersRef = useRef<Record<number, ReturnType<typeof createFireHold>>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const momentFireCounts = useMemo(() => deriveMomentFireCounts(fireHeat, moments), [fireHeat, moments]);

  const hottestIdx = useMemo(() => {
    if (!moments.length) return -1;
    let best = 0;
    for (let i = 1; i < moments.length; i += 1) {
      const bestTotal = (momentFireCounts[best] ?? 0) + (localFires[best] ?? 0);
      const currentTotal = (momentFireCounts[i] ?? 0) + (localFires[i] ?? 0);
      if (currentTotal > bestTotal) best = i;
    }
    return best;
  }, [moments, momentFireCounts, localFires]);

  const commentsForMoment = useMemo(() => {
    const lineToMoment: Record<number, number> = {};
    moments.forEach((moment) => {
      if (moment.lines.length === 0) {
        lineToMoment[moment.sectionIndex] = moment.index;
      }
      moment.lines.forEach((line) => {
        lineToMoment[line.lineIndex] = moment.index;
      });
    });

    const grouped: Record<number, Comment[]> = {};
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

  const momentFireAvatars = useMemo(() => {
    const result: Record<number, { avatars: Array<{ url: string | null; name: string | null }>; anonCount: number }> = {};

    moments.forEach((moment) => {
      const lineIndices = moment.lines.length > 0
        ? moment.lines.map((line) => line.lineIndex)
        : [moment.sectionIndex];

      const userIds = new Set<string>();
      let anon = 0;

      for (const idx of lineIndices) {
        for (const uid of (fireUserMap[idx] ?? [])) userIds.add(uid);
        anon += fireAnonCount[idx] ?? 0;
      }

      const avatars = [...userIds].slice(0, 3).map((uid) => ({
        url: profileMap[uid]?.avatarUrl ?? null,
        name: profileMap[uid]?.displayName ?? null,
      }));

      result[moment.index] = { avatars, anonCount: anon + Math.max(0, userIds.size - 3) };
    });

    return result;
  }, [moments, fireUserMap, fireAnonCount, profileMap]);

  useEffect(() => {
    if (playingMoment == null) return;
    const m = moments[playingMoment];
    if (!m) return;
    if (currentTimeSec > m.endSec + 0.2) setPlayingMoment(null);
  }, [currentTimeSec, moments, playingMoment]);

  useEffect(() => {
    if (currentMomentIndex == null) return;
    const el = cardRefs.current[currentMomentIndex];
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentMomentIndex]);

  const handleFireDown = useCallback((idx: number) => {
    setPressing(idx);
    if (!fireHoldControllersRef.current[idx]) {
      fireHoldControllersRef.current[idx] = createFireHold({});
    }
    fireHoldControllersRef.current[idx].start();
  }, []);

  const handleFireUp = useCallback((idx: number) => {
    setPressing(null);
    const holdData = fireHoldControllersRef.current[idx]?.stop();
    if (!holdData) return;
    const holdMs = holdData.holdMs;
    const scoreMs = holdMs < 180 ? 150 : holdMs;
    const weight = fireWeight(scoreMs);
    setLocalFires((prev) => ({ ...prev, [idx]: (prev[idx] ?? 0) + weight }));
    setFiredMoments((prev) => new Set([...prev, idx]));
    const moment = moments[idx];
    if (!moment) return;
    onFireMoment(moment.lines[0]?.lineIndex ?? moment.sectionIndex, moment.startSec, scoreMs);
  }, [moments, onFireMoment]);

  const handleSubmit = useCallback(async (momentIndex: number, text: string) => {
    const moment = moments[momentIndex];
    if (!moment || !danceId) return;
    const lineIndex = moment.lines[0]?.lineIndex ?? (isInstrumental ? moment.sectionIndex : null);
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      text,
      line_index: lineIndex,
      submitted_at: new Date().toISOString(),
      user_id: user?.id ?? null,
    };
    onCommentAdded(optimistic);

    await supabase
      .from("project_comments" as any)
      .insert({
        project_id: danceId,
        line_index: lineIndex,
        text,
        session_id: getSessionId(),
        user_id: user?.id ?? null,
      })
      .select("id, text, line_index, submitted_at, user_id" as any)
      .single();
  }, [danceId, isInstrumental, moments, onCommentAdded, user?.id]);

  useEffect(() => () => {
    Object.values(fireHoldControllersRef.current).forEach((controller) => controller.destroy());
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#0a0a0a" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "8px 12px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
        {moments.map((moment) => {
          const fireTotal = (momentFireCounts[moment.index] ?? 0) + (localFires[moment.index] ?? 0);
          const mComments = commentsForMoment[moment.index] ?? [];
          const latestComment = mComments.length > 0 ? mComments[mComments.length - 1].text : null;
          const isExpanded = expandedMoment === moment.index;

          return (
            <div key={moment.index} ref={(el) => { cardRefs.current[moment.index] = el; }}>
              <MomentCard
                moment={moment}
                fireTotal={fireTotal}
                isConsensus={moment.index === hottestIdx && fireTotal > 0}
                isLive={currentMomentIndex === moment.index || playingMoment === moment.index}
                latestComment={latestComment}
                onPlay={() => {
                  setPlayingMoment(moment.index);
                  onPlayLine(moment.startSec, moment.endSec);
                }}
                onFireDown={() => handleFireDown(moment.index)}
                onFireUp={() => handleFireUp(moment.index)}
                onExpandComments={() => setExpandedMoment(isExpanded ? null : moment.index)}
                onSubmitComment={(text) => handleSubmit(moment.index, text)}
                firedByUser={firedMoments.has(moment.index)}
                pressing={pressing === moment.index}
                fireAvatars={momentFireAvatars[moment.index]?.avatars ?? []}
                fireAnonCount={momentFireAvatars[moment.index]?.anonCount ?? 0}
              >
                {isInstrumental ? (
                  <EnergyBar energy={moment.energy ?? 0} />
                ) : (
                  <LyricContent moment={moment} words={words} currentTimeSec={currentTimeSec} />
                )}
              </MomentCard>

              {isExpanded && mComments.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, padding: "0 6px" }}>
                  {mComments.map((comment) => (
                    (() => {
                      const profile = comment.user_id ? profileMap[comment.user_id] : null;
                      return (
                        <div key={comment.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                          {profile?.avatarUrl ? (
                            <img src={profile.avatarUrl} style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                          )}
                          <span
                            style={{
                              borderLeft: "1px solid rgba(255,255,255,0.15)",
                              paddingLeft: 8,
                              fontSize: 11,
                              fontFamily: "monospace",
                              color: "rgba(255,255,255,0.4)",
                            }}
                          >
                            {comment.text}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Share + Listen footer ── */}
        <div style={{
          display: "flex",
          gap: 8,
          paddingTop: 16,
          marginTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          {lyricDanceUrl && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(lyricDanceUrl);
              }}
              style={{
                flex: 1,
                minHeight: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.35)",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              🔗 share
            </button>
          )}
          {spotifyTrackId && (
            <a
              href={`https://open.spotify.com/track/${spotifyTrackId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                minHeight: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.35)",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              🎵 spotify
            </a>
          )}
        </div>
      </div>
    </div>
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
    return <p style={{ margin: 0, fontSize: 14, fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>{moment.label}</p>;
  }
  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
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
