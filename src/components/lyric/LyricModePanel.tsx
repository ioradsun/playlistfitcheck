import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import { useAuth } from "@/hooks/useAuth";
import type { Moment } from "@/lib/buildMoments";

interface Props {
  danceId: string;
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  currentTimeSec: number;
  onFireLine: (lineIndex: number, timeSec: number) => void;
  onPlayLine: (startSec: number, endSec: number) => void;
}

interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
}

type MomentLine = Moment["lines"][number];

export function LyricModePanel({
  danceId,
  moments,
  reactionData,
  currentTimeSec,
  onFireLine,
  onPlayLine,
}: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [commentOpen, setCommentOpen] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allLines = useMemo(() => moments.flatMap((moment) => moment.lines), [moments]);

  const playingLineIndex = useMemo(() => {
    const match = allLines.find((line) => currentTimeSec >= line.startSec && currentTimeSec < line.endSec);
    return match?.lineIndex ?? null;
  }, [allLines, currentTimeSec]);

  const lineFireCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const v of Object.values(reactionData)) {
      for (const [idx, cnt] of Object.entries(v.line)) {
        counts[Number(idx)] = (counts[Number(idx)] ?? 0) + cnt;
      }
    }
    return counts;
  }, [reactionData]);

  const commentsByLine = useMemo(() => {
    const map: Record<number, Comment[]> = {};
    for (const c of comments) {
      const idx = c.line_index ?? -1;
      if (!map[idx]) map[idx] = [];
      map[idx].push(c);
    }
    return map;
  }, [comments]);

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

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || submitting || !danceId) return;
    setSubmitting(true);

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      text,
      line_index: commentOpen,
      submitted_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setInputText("");
    setCommentOpen(null);

    const { data, error } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({
        dance_id: danceId,
        line_index: commentOpen,
        text,
        session_id: getSessionId(),
        user_id: user?.id ?? null,
      })
      .select("id, text, line_index, submitted_at" as any)
      .single();

    if (!error && data) {
      setComments((prev) => prev.map((comment) => (comment.id === optimistic.id ? ((data as any) as Comment) : comment)));
    }
    setSubmitting(false);
  };

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const handleLineTap = (line: MomentLine) => {
    if (activeLine === line.lineIndex) {
      setActiveLine(null);
      setCommentOpen(null);
      setInputText("");
      return;
    }

    setActiveLine(line.lineIndex);
    setCommentOpen(null);
    setInputText("");
    onPlayLine(line.startSec, line.endSec);
  };

  return (
    <div
      ref={scrollRef}
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0a0a0a",
        padding: "8px 0 32px",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {moments.map((moment) => (
        <div key={moment.index}>
          <div
            style={{
              padding: "14px 16px 6px",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Moment {moment.index + 1}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.2)",
              }}
            >
              {fmtTime(moment.startSec)}
            </span>
          </div>

          {moment.lines.map((line) => {
            const isPlaying = line.lineIndex === playingLineIndex;
            const isExpanded = activeLine === line.lineIndex;
            const fireCount = lineFireCounts[line.lineIndex] ?? 0;
            const lineComments = commentsByLine[line.lineIndex] ?? [];
            const isCommentOpen = commentOpen === line.lineIndex;

            return (
              <div key={line.lineIndex}>
                <div
                  onClick={() => handleLineTap(line)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 16px",
                    cursor: "pointer",
                    background: isPlaying
                      ? "rgba(255,255,255,0.04)"
                      : isExpanded
                        ? "rgba(255,255,255,0.03)"
                        : "transparent",
                    transition: "background 150ms ease",
                    minHeight: 44,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: isPlaying
                        ? "rgba(255,255,255,0.9)"
                        : isExpanded
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(255,255,255,0.45)",
                      letterSpacing: "-0.01em",
                      transition: "color 200ms ease",
                    }}
                  >
                    {line.text}
                  </span>

                  {fireCount > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.2)",
                        marginLeft: 10,
                        flexShrink: 0,
                      }}
                    >
                      🔥{fireCount}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "0 16px 10px 20px",
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onFireLine(line.lineIndex, line.startSec);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        padding: "5px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.5)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        transition: "border-color 150ms, color 150ms",
                        fontFamily: "monospace",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor = "rgba(255,140,40,0.4)";
                        event.currentTarget.style.color = "rgba(255,140,40,0.8)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                        event.currentTarget.style.color = "rgba(255,255,255,0.5)";
                      }}
                    >
                      🔥
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCommentOpen) {
                          setCommentOpen(null);
                          setInputText("");
                        } else {
                          setCommentOpen(line.lineIndex);
                          setInputText("");
                          setTimeout(() => inputRef.current?.focus(), 60);
                        }
                      }}
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        padding: "5px 10px",
                        cursor: "pointer",
                        fontSize: 11,
                        color: lineComments.length > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: "monospace",
                        transition: "border-color 150ms, color 150ms",
                      }}
                    >
                      <MessageCircle size={11} />
                      {lineComments.length > 0 && <span>{lineComments.length}</span>}
                    </button>
                  </div>
                )}

                {isExpanded && lineComments.length > 0 && (
                  <div style={{ padding: "0 16px 8px 28px" }} onClick={(event) => event.stopPropagation()}>
                    {lineComments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.35)",
                          lineHeight: 1.5,
                          padding: "2px 0 2px 8px",
                          borderLeft: "1px solid rgba(255,255,255,0.06)",
                          marginBottom: 3,
                        }}
                      >
                        {comment.text}
                      </div>
                    ))}
                  </div>
                )}

                {isCommentOpen && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0 16px 12px 28px",
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      ref={inputRef}
                      value={inputText}
                      onChange={(event) => setInputText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSubmit();
                        }
                        if (event.key === "Escape") {
                          setCommentOpen(null);
                          setInputText("");
                        }
                      }}
                      placeholder="comment on this line…"
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
                      onClick={() => void handleSubmit()}
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
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
