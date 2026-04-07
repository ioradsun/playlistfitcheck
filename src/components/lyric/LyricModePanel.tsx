import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import { useAuth } from "@/hooks/useAuth";
import type { Moment } from "@/lib/buildMoments";

interface Props {
  danceId: string;
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  currentTimeSec: number;
  words: Array<{ word: string; start: number; end: number }>;
  onFireMoment: (lineIndex: number, timeSec: number, holdMs: number) => void;
  onPlayLine: (startSec: number, endSec: number) => void;
  sectionImages?: string[];
  sections?: Array<{ description?: string; visualMood?: string; dominantColor?: string }>;
  isInstrumental?: boolean;
  fireUsers?: Array<{
    sectionIndex: number;
    userId: string | null;
    avatarUrl: string | null;
    displayName: string | null;
  }>;
}

interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
}

export function LyricModePanel({
  danceId,
  moments,
  reactionData,
  currentTimeSec,
  words,
  onFireMoment,
  onPlayLine,
  sectionImages,
  sections,
  isInstrumental = false,
  fireUsers,
}: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeMoment, setActiveMoment] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pressing, setPressing] = useState<number | null>(null);
  const [fireScale, setFireScale] = useState<Record<number, number>>({});
  const [firePulse, setFirePulse] = useState<number | null>(null);
  const [localFires, setLocalFires] = useState<Record<number, number>>({});
  const [playingMoment, setPlayingMoment] = useState<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function fmtDuration(startSec: number, endSec: number): string {
    const dur = Math.round(endSec - startSec);
    return `${dur}s`;
  }

  const momentFireCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const v of Object.values(reactionData)) {
      for (const [idx, cnt] of Object.entries(v.line)) {
        counts[Number(idx)] = (counts[Number(idx)] ?? 0) + cnt;
      }
    }

    return moments.map((moment) => {
      const base = moment.lines.length > 0
        ? moment.lines.reduce((sum, line) => sum + (counts[line.lineIndex] ?? 0), 0)
        : (counts[moment.sectionIndex] ?? 0);
      return { index: moment.index, total: base + (localFires[moment.index] ?? 0) };
    });
  }, [reactionData, moments, localFires]);

  const momentComments = useMemo(() => {
    const lineToMoment: Record<number, number> = {};
    for (const moment of moments) {
      for (const line of moment.lines) {
        lineToMoment[line.lineIndex] = moment.index;
      }
      if (moment.lines.length === 0) {
        lineToMoment[moment.sectionIndex] = moment.index;
      }
    }

    const byMoment: Record<number, Comment[]> = {};
    for (const comment of comments) {
      const mIdx = comment.line_index != null ? lineToMoment[comment.line_index] : undefined;
      if (mIdx == null) continue;
      if (!byMoment[mIdx]) byMoment[mIdx] = [];
      byMoment[mIdx].push(comment);
    }

    return byMoment;
  }, [comments, moments]);

  const currentMomentIndex = useMemo(() => {
    const moment = moments.find((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec);
    return moment?.index ?? null;
  }, [moments, currentTimeSec]);

  const displayRowsByMoment = useMemo(() => {
    type DisplayRow = {
      text: string;
      startSec: number;
      endSec: number;
      wordRanges: Array<{ word: string; start: number; end: number }>;
    };

    const byMoment = new Map<number, DisplayRow[]>();
    const sentenceEndPattern = /[.!?]\s*$/;

    for (const moment of moments) {
      const rows: Array<Omit<DisplayRow, "wordRanges">> = [];
      let currentText = "";
      let currentStartSec: number | null = null;
      let currentEndSec: number | null = null;

      for (const line of moment.lines) {
        const lineText = line.text.trim();
        if (!lineText) continue;

        if (currentText.length === 0) {
          currentText = lineText;
          currentStartSec = line.startSec;
          currentEndSec = line.endSec;
        } else {
          currentText = `${currentText} ${lineText}`;
          currentEndSec = line.endSec;
        }

        if (currentText.length > 45 || sentenceEndPattern.test(lineText)) {
          rows.push({
            text: currentText,
            startSec: currentStartSec ?? line.startSec,
            endSec: currentEndSec ?? line.endSec,
          });
          currentText = "";
          currentStartSec = null;
          currentEndSec = null;
        }
      }

      if (currentText.length > 0 && currentStartSec != null && currentEndSec != null) {
        rows.push({
          text: currentText,
          startSec: currentStartSec,
          endSec: currentEndSec,
        });
      }

      byMoment.set(
        moment.index,
        rows.map((row) => ({
          ...row,
          wordRanges: words.filter(
            (word) => word.start >= row.startSec - 0.05 && word.start < row.endSec + 0.05,
          ),
        })),
      );
    }

    return byMoment;
  }, [moments, words]);

  const handleFireDown = useCallback((momentIndex: number) => {
    if (holdTickRef.current) {
      clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }

    setPressing(momentIndex);
    setFireScale((prev) => ({ ...prev, [momentIndex]: 1 }));
    holdStartRef.current = performance.now();

    holdTickRef.current = window.setInterval(() => {
      const elapsed = performance.now() - (holdStartRef.current ?? 0);
      const intensity = Math.min(1, elapsed / 2000);
      setFireScale((prev) => ({
        ...prev,
        [momentIndex]: 1 + intensity * 0.5,
      }));
    }, 50);
  }, []);

  const handleFireUp = useCallback(
    (momentIndex: number) => {
      setPressing(null);
      setFireScale((prev) => ({ ...prev, [momentIndex]: 1 }));

      if (holdTickRef.current) {
        clearInterval(holdTickRef.current);
        holdTickRef.current = null;
      }

      if (holdStartRef.current == null) return;
      const holdMs = performance.now() - holdStartRef.current;
      holdStartRef.current = null;

      const moment = moments[momentIndex];
      if (!moment) return;
      const scoreMs = holdMs < 180 ? 150 : holdMs;
      const weight = scoreMs < 300 ? 1 : scoreMs < 1000 ? 2 : scoreMs < 3000 ? 4 : 8;

      setLocalFires((prev) => ({
        ...prev,
        [momentIndex]: (prev[momentIndex] ?? 0) + weight,
      }));

      setFirePulse(momentIndex);
      setTimeout(() => setFirePulse(null), 400);

      const fireIdx = moment.lines[0]?.lineIndex ?? moment.sectionIndex;
      onFireMoment(fireIdx, moment.startSec, scoreMs);
    },
    [moments, onFireMoment],
  );

  const handleSubmit = async (momentIndex: number) => {
    const text = inputText.trim();
    if (!text || submitting || !danceId) return;
    setSubmitting(true);

    const moment = moments[momentIndex];
    const lineIndex = moment?.lines[0]?.lineIndex ?? (isInstrumental ? moment.sectionIndex : null);

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      text,
      line_index: lineIndex,
      submitted_at: new Date().toISOString(),
    };

    setComments((prev) => [...prev, optimistic]);
    setInputText("");

    const { data, error } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({
        dance_id: danceId,
        line_index: lineIndex,
        text,
        session_id: getSessionId(),
        user_id: user?.id ?? null,
      })
      .select("id, text, line_index, submitted_at" as any)
      .single();

    if (!error && data) {
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? ((data as any) as Comment) : c)));
    }

    setSubmitting(false);
  };

  useEffect(() => {
    if (!danceId) return;

    supabase
      .from("lyric_dance_comments" as any)
      .select("id, text, line_index, submitted_at" as any)
      .eq("dance_id", danceId)
      .is("parent_comment_id", null)
      .order("submitted_at", { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (data) setComments((data as any[]) as Comment[]);
      });
  }, [danceId]);

  useEffect(() => {
    return () => {
      if (holdTickRef.current) clearInterval(holdTickRef.current);
    };
  }, []);

  const isPressingMoment = (idx: number) => pressing === idx;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0a0a",
        padding: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          marginLeft: "auto",
          marginRight: "auto",
          padding: "8px 12px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {moments.map((moment) => {
        const fireCounts = momentFireCounts.find((f) => f.index === moment.index);
        const fireTotal = fireCounts?.total ?? 0;
        const mComments = momentComments[moment.index] ?? [];
        const isOpen = activeMoment === moment.index;
        const isLive = currentMomentIndex === moment.index || playingMoment === moment.index;
        const scale = fireScale[moment.index] ?? 1;
        const isPulsingCount = firePulse === moment.index;
        const isFirePressing = isPressingMoment(moment.index);

        return (
          <div
            key={moment.index}
            style={{
              borderRadius: 12,
              border: `1px solid ${isLive ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)"}`,
              background: isLive ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
              overflow: "hidden",
              transition: "border-color 200ms, background 200ms",
            }}
          >
            <div
              onClick={() => {
                setPlayingMoment(moment.index);
                onPlayLine(moment.startSec, moment.endSec);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "9px 12px 4px",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.05em",
                }}
              >
                {fmtTime(moment.startSec)}
                <span style={{ margin: "0 4px", opacity: 0.5 }}>→</span>
                {fmtTime(moment.endSec)}
                <span style={{ marginLeft: 5, color: "rgba(255,255,255,0.15)" }}>
                  ({fmtDuration(moment.startSec, moment.endSec)})
                </span>
              </span>

              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: isLive ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                  letterSpacing: "0.06em",
                  transition: "color 200ms",
                }}
              >
                {isLive ? "▶ playing" : "▶"}
              </span>
            </div>

            <div
              onClick={() => {
                setPlayingMoment(moment.index);
                onPlayLine(moment.startSec, moment.endSec);
              }}
              style={{
                padding: "0 12px 8px",
                cursor: "pointer",
              }}
            >
              {isInstrumental ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {sectionImages?.[moment.sectionIndex] && (
                    <img
                      src={sectionImages[moment.sectionIndex]}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        objectFit: "cover",
                        flexShrink: 0,
                        border: isLive
                          ? `1.5px solid ${sections?.[moment.sectionIndex]?.dominantColor ?? "rgba(255,255,255,0.15)"}`
                          : "1px solid rgba(255,255,255,0.06)",
                        transition: "border-color 200ms",
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: isLive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
                      transition: "color 200ms",
                    }}>
                      {sections?.[moment.sectionIndex]?.description ?? `Section ${moment.sectionIndex + 1}`}
                    </p>
                    {sections?.[moment.sectionIndex]?.visualMood && (
                      <span style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontSize: 9,
                        fontFamily: "monospace",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isLive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                        color: isLive ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                        letterSpacing: "0.04em",
                        transition: "all 200ms",
                      }}>
                        {sections[moment.sectionIndex].visualMood}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                (displayRowsByMoment.get(moment.index) ?? []).map((row, rowIdx) => (
                  <p
                    key={`${moment.index}-${rowIdx}-${row.startSec}`}
                    style={{
                      margin: "0 0 2px",
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: isLive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                      letterSpacing: "-0.01em",
                      transition: "color 200ms ease",
                    }}
                  >
                    {row.wordRanges.length > 0
                      ? row.wordRanges.map((word) => {
                        const isActive =
                            currentTimeSec >= word.start - 0.05 && currentTimeSec < word.end + 0.05;
                        return (
                          <span
                            key={word.start}
                            style={{
                              color: isActive ? "rgba(255,255,255,1)" : undefined,
                              transition: "color 120ms",
                            }}
                          >
                            {word.word}
                            {" "}
                          </span>
                        );
                      })
                      : row.text}
                  </p>
                ))
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px 9px",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onPointerDown={() => handleFireDown(moment.index)}
                onPointerUp={() => handleFireUp(moment.index)}
                onPointerLeave={() => {
                  if (pressing === moment.index) handleFireUp(moment.index);
                }}
                style={{
                  background: isFirePressing
                    ? "radial-gradient(circle, rgba(255,140,40,0.18) 0%, transparent 70%)"
                    : "none",
                  border: `1px solid ${isFirePressing ? "rgba(255,140,40,0.35)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 8,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "monospace",
                  transition: "border-color 150ms, background 150ms",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  touchAction: "none",
                }}
              >
                <Flame
                  size={14}
                  style={{
                    transform: `scale(${scale})`,
                    transition: isFirePressing ? "none" : "transform 200ms ease",
                    transformOrigin: "center",
                    color: fireTotal > 0 ? "rgba(255,160,40,0.9)" : "rgba(255,255,255,0.15)",
                  }}
                />

                {fireTotal > 0 && (
                  <span
                    style={{
                      color: isPulsingCount ? "rgba(255,160,40,0.9)" : "rgba(255,255,255,0.35)",
                      transform: isPulsingCount ? "scale(1.3)" : "scale(1.0)",
                      transition: "transform 200ms ease, color 200ms ease",
                      display: "inline-block",
                    }}
                  >
                    {fireTotal}
                  </span>
                )}
              </button>
              {(() => {
                type FireUser = NonNullable<Props["fireUsers"]>[number];
                const sectionUsers = (fireUsers ?? [])
                  .filter((u) => u.sectionIndex === moment.sectionIndex && u.avatarUrl)
                  .reduce((acc, u) => {
                    if (!acc.some((a) => a.userId === u.userId)) acc.push(u);
                    return acc;
                  }, [] as FireUser[]);
                const show = sectionUsers.slice(0, 3);
                const overflow = sectionUsers.length - 3;
                if (show.length === 0) return null;
                return (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    marginLeft: 2,
                  }}>
                    {show.map((u, idx) => (
                      <img
                        key={u.userId ?? idx}
                        src={u.avatarUrl!}
                        alt=""
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "1px solid #0a0a0a",
                          marginLeft: idx === 0 ? 0 : -4,
                          zIndex: 3 - idx,
                          position: "relative",
                        }}
                      />
                    ))}
                    {overflow > 0 && (
                      <span style={{
                        fontSize: 8,
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.3)",
                        marginLeft: 3,
                      }}>
                        +{overflow}
                      </span>
                    )}
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => {
                  if (isOpen) {
                    setActiveMoment(null);
                    setInputText("");
                  } else {
                    setActiveMoment(moment.index);
                    setInputText("");
                    setTimeout(() => inputRef.current?.focus(), 60);
                  }
                }}
                style={{
                  background: "none",
                  border: `1px solid ${isOpen ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 8,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  color: mComments.length > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "monospace",
                  transition: "border-color 150ms, color 150ms",
                }}
              >
                <MessageCircle size={11} />
                {mComments.length > 0 && <span>{mComments.length}</span>}
              </button>
            </div>

            {isOpen && (
              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                  padding: "8px 12px 4px",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {mComments.map((comment) => (
                  <div
                    key={comment.id}
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      lineHeight: 1.5,
                      padding: "4px 0 4px 8px",
                      borderLeft: "1px solid rgba(255,255,255,0.07)",
                      marginBottom: 4,
                    }}
                  >
                    {comment.text}
                  </div>
                ))}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: mComments.length > 0 ? 6 : 0,
                    paddingBottom: 6,
                  }}
                >
                  <input
                    ref={inputRef}
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSubmit(moment.index);
                      }
                      if (event.key === "Escape") {
                        setActiveMoment(null);
                        setInputText("");
                      }
                    }}
                    placeholder="what do you hear…"
                    maxLength={280}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSubmit(moment.index)}
                    disabled={!inputText.trim() || submitting}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: inputText.trim() ? "pointer" : "default",
                      color: inputText.trim() ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 150ms",
                      flexShrink: 0,
                    }}
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
