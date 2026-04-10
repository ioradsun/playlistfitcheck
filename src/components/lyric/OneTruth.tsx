import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import { useAuth } from "@/hooks/useAuth";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import type { Moment } from "@/lib/buildMoments";

interface Comment {
  id: string;
  text: string;
  line_index: number | null;
  user_id: string | null;
}

interface OneTruthProps {
  danceId: string;
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  comments: Comment[];
  userFires: Record<number, number>;
  allLines: Array<{ text: string; lineIndex: number }>;
  initialBeat?: "yours" | "witness" | "meaning";
  onContinue: () => void;
  onCommentSubmitted: (comment: Comment) => void;
}

function scoreCommentQuality(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const lengthScore = wordCount >= 3 && wordCount <= 12 ? 1.0
    : wordCount < 3 ? 0.3
      : wordCount <= 20 ? 0.5
        : 0.1;

  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length;
  const emojiPenalty = emojiCount > 2 ? 0.2 : emojiCount > 0 ? 0.7 : 1.0;

  const vagueWords = ["omg", "wow", "fire", "slay", "bussin", "frfr", "ngl", "lol", "lmao", "bruh"];
  const vagueCount = words.filter((w) => vagueWords.includes(w.toLowerCase().replace(/[^a-z]/g, ""))).length;
  const vaguePenalty = vagueCount > 1 ? 0.3 : vagueCount > 0 ? 0.7 : 1.0;

  const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const specificBonus = ["this", "i", "the", "when", "that", "my", "every"].includes(firstWord) ? 1.2 : 1.0;

  return lengthScore * emojiPenalty * vaguePenalty * specificBonus;
}

function pickBestComment(comments: Array<{ id: string; text: string }>): { id: string; text: string } | null {
  if (comments.length === 0) return null;
  return comments
    .map((c) => ({ comment: c, score: scoreCommentQuality(c.text) }))
    .sort((a, b) => b.score - a.score)[0]?.comment ?? comments[comments.length - 1];
}

export function OneTruth({
  danceId,
  moments,
  fireHeat,
  comments,
  userFires,
  allLines,
  initialBeat,
  onContinue,
  onCommentSubmitted,
}: OneTruthProps) {
  const { user } = useAuth();
  type Beat = "yours" | "witness" | "meaning";
  const [beat, setBeat] = useState<Beat>(initialBeat ?? "yours");
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes truthFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const userMoment = useMemo(() => {
    const entries = Object.entries(userFires);
    if (!entries.length) return null;
    const [idxStr] = entries.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
    return moments[Number(idxStr)] ?? null;
  }, [userFires, moments]);

  const momentFireCounts = useMemo(() => deriveMomentFireCounts(fireHeat, moments), [fireHeat, moments]);
  const fmlyMoment = useMemo(() => {
    if (!moments.length) return null;
    let bestIdx = 0;
    for (let i = 1; i < moments.length; i += 1) {
      if ((momentFireCounts[i] ?? 0) > (momentFireCounts[bestIdx] ?? 0)) bestIdx = i;
    }
    return (momentFireCounts[bestIdx] ?? 0) > 0 ? moments[bestIdx] : null;
  }, [moments, momentFireCounts]);

  const isSameMoment = !!(userMoment && fmlyMoment && userMoment.index === fmlyMoment.index);
  const fmlyFireCount = fmlyMoment ? (momentFireCounts[fmlyMoment.index] ?? 0) : 0;

  const getMomentText = (moment: Moment) => moment.lines
    .map((line) => allLines.find((allLine) => allLine.lineIndex === line.lineIndex)?.text ?? "")
    .join(" ")
    .trim();

  const witnessComment = useMemo(() => {
    if (!fmlyMoment) return null;
    const momentComments = comments.filter((c) =>
      fmlyMoment.lines.some((line) => line.lineIndex === c.line_index)
    );
    return pickBestComment(momentComments);
  }, [fmlyMoment, comments]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !userMoment || !danceId) return;
    const lineIndex = userMoment.lines[0]?.lineIndex ?? null;
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      text: trimmed,
      line_index: lineIndex,
      user_id: user?.id ?? null,
    };
    onCommentSubmitted(optimistic);
    setSubmitted(true);
    setText("");

    setTimeout(() => {
      if (fmlyMoment) setBeat("witness");
      else onContinue();
    }, 1500);

    await supabase
      .from("project_comments")
      .insert({
        project_id: danceId,
        line_index: lineIndex,
        text: trimmed,
        session_id: getSessionId(),
        user_id: user?.id ?? null,
      } as any);
  }, [text, userMoment, danceId, onCommentSubmitted, user?.id, fmlyMoment, onContinue]);

  useEffect(() => {
    if (!userMoment && beat === "yours") {
      if (fmlyMoment) setBeat("witness");
      else onContinue();
    }
  }, [userMoment, beat, fmlyMoment, onContinue]);

  useEffect(() => {
    if (beat !== "witness") return;
    const timer = setTimeout(() => setBeat("meaning"), 4000);
    return () => clearTimeout(timer);
  }, [beat]);

  useEffect(() => {
    if (beat === "witness" && !fmlyMoment) onContinue();
  }, [beat, fmlyMoment, onContinue]);

  useEffect(() => {
    if (beat === "meaning" && !fmlyMoment) onContinue();
  }, [beat, fmlyMoment, onContinue]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      {beat === "yours" && userMoment && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            animation: "truthFadeIn 600ms ease",
          }}
        >
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: 300,
            }}
          >
            {getMomentText(userMoment)}
          </p>

          {!submitted ? (
            <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 260 }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="name it"
                autoFocus
                style={{
                  flex: 1,
                  minHeight: 36,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: 12,
                  fontFamily: "monospace",
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleSubmit}
                style={{
                  minHeight: 36,
                  minWidth: 36,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ↑
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>heard</p>
          )}

          <button
            type="button"
            onClick={() => {
              if (fmlyMoment) setBeat("witness");
              else onContinue();
            }}
            style={{
              border: "none",
              background: "none",
              color: "rgba(255,255,255,0.15)",
              fontSize: 10,
              fontFamily: "monospace",
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            skip →
          </button>
        </div>
      )}

      {beat === "witness" && fmlyMoment && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            animation: "truthFadeIn 600ms ease",
          }}
        >
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: 300,
            }}
          >
            {getMomentText(fmlyMoment)}
          </p>

          <p
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.20)",
            }}
          >
            🔥 {fmlyFireCount}
          </p>

          {witnessComment && (
            <p
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.35)",
                fontStyle: "italic",
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              "{witnessComment.text}"
            </p>
          )}

          <button
            type="button"
            onClick={() => setBeat("meaning")}
            style={{
              border: "none",
              background: "none",
              color: "rgba(255,255,255,0.15)",
              fontSize: 10,
              fontFamily: "monospace",
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            continue →
          </button>
        </div>
      )}

      {beat === "meaning" && fmlyMoment && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            animation: "truthFadeIn 600ms ease",
          }}
        >
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: 300,
            }}
          >
            {getMomentText(fmlyMoment)}
          </p>

          <p
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: isSameMoment ? "rgba(74,222,128,0.50)" : "rgba(255,255,255,0.25)",
              textAlign: "center",
              maxWidth: 260,
              lineHeight: 1.6,
            }}
          >
            {isSameMoment
              ? `you and ${fmlyFireCount} others landed here`
              : "you heard something different — that matters too"}
          </p>

          <button
            type="button"
            onClick={onContinue}
            style={{
              marginTop: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.40)",
              fontSize: 11,
              fontFamily: "monospace",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            see all moments →
          </button>
        </div>
      )}
    </div>
  );
}
