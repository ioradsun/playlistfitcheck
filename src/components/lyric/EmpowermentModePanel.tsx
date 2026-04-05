import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

interface Props {
  danceId: string;
  empowermentPromise: {
    emotionalJob: string;
    fromState: string;
    toState: string;
    promise: string;
    hooks: string[];
  } | null;
}

export function EmpowermentModePanel({ danceId, empowermentPromise }: Props) {
  const [hookVoteCounts, setHookVoteCounts] = useState<number[]>([]);
  const [voted, setVoted] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!danceId) return;

    const stored = sessionStorage.getItem(`empower_voted_${danceId}`);
    if (stored) {
      try {
        setVoted(new Set(JSON.parse(stored)));
      } catch {
        // ignore malformed session storage
      }
    }

    supabase
      .from("lyric_dance_angle_votes" as any)
      .select("hook_index")
      .eq("dance_id", danceId)
      .then(({ data }) => {
        if (!data) return;
        const counts: number[] = Array(empowermentPromise?.hooks.length ?? 6).fill(0);
        (data as any[]).forEach((row) => {
          counts[row.hook_index] = (counts[row.hook_index] ?? 0) + 1;
        });
        setHookVoteCounts(counts);
      });
  }, [danceId]);

  const castVote = async (hookIndex: number) => {
    if (voted.has(hookIndex) || !danceId) return;

    setHookVoteCounts((prev) => {
      const next = [...prev];
      next[hookIndex] = (next[hookIndex] ?? 0) + 1;
      return next;
    });
    const nextVoted = new Set(voted).add(hookIndex);
    setVoted(nextVoted);
    sessionStorage.setItem(`empower_voted_${danceId}`, JSON.stringify([...nextVoted]));

    await supabase
      .from("lyric_dance_angle_votes" as any)
      .insert({
        dance_id: danceId,
        hook_index: hookIndex,
        session_id: getSessionId(),
      });
  };

  if (!empowermentPromise) {
    return (
      <div style={{ height: "100%", background: "#0a0a0a", padding: 16, fontFamily: "monospace" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
            No empowerment promise yet
          </p>
        </div>
      </div>
    );
  }

  const totalVotes = hookVoteCounts.reduce((a, b) => a + b, 0);
  const winnerIndex = totalVotes >= 3 ? hookVoteCounts.indexOf(Math.max(...hookVoteCounts)) : -1;

  return (
    <div style={{ height: "100%", background: "#0a0a0a", padding: 16, fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 999,
            padding: "2px 8px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {empowermentPromise.fromState}
        </span>
        <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 11 }}>→</span>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: "2px 8px",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {empowermentPromise.toState}
        </span>
      </div>

      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.8)",
          lineHeight: 1.45,
          margin: "10px 0 6px",
          letterSpacing: "-0.01em",
        }}
      >
        {empowermentPromise.promise}
      </p>

      <p
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.2)",
          marginBottom: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {totalVotes > 0 ? `${totalVotes} FMLY vote${totalVotes !== 1 ? "s" : ""}` : "Be first to vote"}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {empowermentPromise.hooks.map((hook, i) => {
          const votes = hookVoteCounts[i] ?? 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isWinner = i === winnerIndex;
          const hasVoted = voted.has(i);

          return (
            <div
              key={i}
              style={{
                position: "relative",
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {totalVotes > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    width: `${pct}%`,
                    background: isWinner ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                    transition: "width 400ms ease",
                    pointerEvents: "none",
                  }}
                />
              )}

              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px" }}>
                <span
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.2)",
                    fontFamily: "monospace",
                    minWidth: 16,
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span style={{ fontSize: 11, color: isWinner ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)", flex: 1, lineHeight: 1.4 }}>
                  {hook}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {totalVotes > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.2)",
                        fontFamily: "monospace",
                        minWidth: 28,
                        textAlign: "right",
                      }}
                    >
                      {pct}%
                    </span>
                  )}

                  {hasVoted ? (
                    <Check size={11} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                  ) : (
                    <button
                      onClick={() => castVote(i)}
                      style={{
                        fontSize: 9,
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 999,
                        padding: "2px 7px",
                        background: "none",
                        cursor: "pointer",
                        transition: "color 150ms, border-color 150ms",
                      }}
                    >
                      vote
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
