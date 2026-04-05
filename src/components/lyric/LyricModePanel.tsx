import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import { useAuth } from "@/hooks/useAuth";
import type { LyricSection, LyricSectionLine } from "@/hooks/useLyricSections";

interface Props {
  danceId: string;
  sections: LyricSection[];
  allLines: LyricSectionLine[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  currentTimeSec: number;
  onFireLine: (lineIndex: number, timeSec: number) => void;
}

interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
}

export function LyricModePanel({ danceId, sections, allLines, reactionData, currentTimeSec, onFireLine }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [openLineIndex, setOpenLineIndex] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const getLineFireCount = (lineIndex: number): number =>
    Object.values(reactionData).reduce((sum, v) => sum + (v.line[lineIndex] ?? 0), 0);

  const activeLineIndex: number | null = (() => {
    const match = allLines.find((line) => currentTimeSec >= line.startSec && currentTimeSec < (line.endSec ?? (line.startSec + 5)));
    return match?.lineIndex ?? null;
  })();

  useEffect(() => {
    if (!danceId) return;
    supabase
      .from("lyric_dance_comments" as any)
      .select("id, text, line_index, submitted_at")
      .eq("dance_id", danceId)
      .is("parent_comment_id", null)
      .order("submitted_at", { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (data) setComments(data as Comment[]);
      });
  }, [danceId]);

  useEffect(() => {
    if (!activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineIndex]);

  const handleLineTap = (lineIndex: number, timeSec: number) => {
    onFireLine(lineIndex, timeSec);
    if (openLineIndex === lineIndex) {
      setOpenLineIndex(null);
      setInputText("");
      return;
    }
    setOpenLineIndex(lineIndex);
    setInputText("");
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || submitting || !danceId) return;
    setSubmitting(true);

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      text,
      line_index: openLineIndex,
      submitted_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setInputText("");
    setOpenLineIndex(null);

    const { data, error } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({
        dance_id: danceId,
        line_index: openLineIndex,
        text,
        session_id: getSessionId(),
        user_id: user?.id ?? null,
      })
      .select("id, text, line_index, submitted_at")
      .single();

    if (!error && data) {
      setComments((prev) => prev.map((comment) => (comment.id === optimistic.id ? (data as Comment) : comment)));
    }
    setSubmitting(false);
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden", background: "#0a0a0a", padding: "12px 0 24px" }}>
      {sections.map((section) => (
        <div key={section.sectionIndex}>
          <div style={{ padding: "6px 14px 4px", fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {section.label}
          </div>

          {section.lines.map((line) => {
            const isActive = line.lineIndex === activeLineIndex;
            const fireCount = getLineFireCount(line.lineIndex);
            const lineComments = comments.filter((comment) => comment.line_index === line.lineIndex);
            const isCommentOpen = openLineIndex === line.lineIndex;

            return (
              <div key={line.lineIndex} ref={isActive ? activeLineRef : undefined}>
                <div
                  onClick={() => handleLineTap(line.lineIndex, line.startSec)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer", transition: "background 150ms ease", background: isActive ? "rgba(255,255,255,0.04)" : "transparent" }}
                >
                  <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)", transition: "color 200ms ease", letterSpacing: "-0.01em" }}>
                    {line.text}
                  </span>

                  {fireCount > 0 && (
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                      🔥{fireCount}
                    </span>
                  )}

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (openLineIndex === line.lineIndex) {
                        setOpenLineIndex(null);
                        setInputText("");
                      } else {
                        setOpenLineIndex(line.lineIndex);
                        setInputText("");
                        setTimeout(() => inputRef.current?.focus(), 80);
                      }
                    }}
                    style={{ background: "none", border: "none", color: lineComments.length > 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", gap: 2, flexShrink: 0, fontSize: 9, fontFamily: "monospace" }}
                    aria-label="Open comment"
                  >
                    <MessageCircle size={9} />
                    {lineComments.length > 0 ? lineComments.length : ""}
                  </button>
                </div>

                {lineComments.length > 0 && (
                  <div style={{ padding: "0 14px 4px 26px" }}>
                    {lineComments.map((comment) => (
                      <div key={comment.id} style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, padding: "2px 0", borderLeft: "1px solid rgba(255,255,255,0.06)", paddingLeft: 8, marginBottom: 2 }}>
                        {comment.text}
                      </div>
                    ))}
                  </div>
                )}

                {isCommentOpen && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 8px 26px" }} onClick={(event) => event.stopPropagation()}>
                    <input
                      ref={inputRef}
                      value={inputText}
                      onChange={(event) => setInputText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSubmit();
                        }
                        if (event.key === "Escape") {
                          setOpenLineIndex(null);
                          setInputText("");
                        }
                      }}
                      placeholder="comment on this line…"
                      maxLength={280}
                      style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)", outline: "none", fontFamily: "inherit" }}
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={!inputText.trim() || submitting}
                      style={{ background: "none", border: "none", cursor: inputText.trim() ? "pointer" : "default", color: inputText.trim() ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)", padding: 4, display: "flex", alignItems: "center", transition: "color 150ms", flexShrink: 0 }}
                    >
                      <Send size={13} />
                    </button>
                    <button
                      onClick={() => {
                        setOpenLineIndex(null);
                        setInputText("");
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
                    >
                      <X size={13} />
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
