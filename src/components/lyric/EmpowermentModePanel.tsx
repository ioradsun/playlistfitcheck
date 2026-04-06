import { useState, useEffect } from "react";
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
  const [voted, setVoted] = useState<number | null>(null);

  useEffect(() => {
    if (!danceId) return;

    const stored = sessionStorage.getItem(`empower_voted_${danceId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // stored as single number or legacy array — handle both
        const val = Array.isArray(parsed) ? parsed[0] : parsed;
        if (typeof val === "number") setVoted(val);
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
  }, [danceId, empowermentPromise]);

  const castVote = async (hookIndex: number) => {
    if (voted !== null || !danceId) return;

    setHookVoteCounts((prev) => {
      const next = [...prev];
      next[hookIndex] = (next[hookIndex] ?? 0) + 1;
      return next;
    });
    setVoted(hookIndex);
    sessionStorage.setItem(`empower_voted_${danceId}`, JSON.stringify(hookIndex));

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.15)",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
          }}
        >
          coming soon
        </p>
      </div>
    );
  }

  const totalVotes = hookVoteCounts.reduce((a, b) => a + b, 0);
  const hasVoted = voted !== null;
  const topThree = empowermentPromise.hooks.slice(0, 3);

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
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
        }}
      >
        <p
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "0.1em",
            textTransform: "lowercase",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          which one hits?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topThree.map((hook, i) => {
            const isVoted = voted === i;
            const votes = hookVoteCounts[i] ?? 0;
            const pct = totalVotes > 0
              ? Math.round((votes / totalVotes) * 100)
              : 0;

            return (
              <button
                key={i}
                type="button"
                onClick={() => castVote(i)}
                disabled={hasVoted}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: isVoted
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    isVoted
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(255,255,255,0.06)"
                  }`,
                  borderRadius: 12,
                  padding: "13px 16px",
                  cursor: isVoted ? "default" : "pointer",
                  transition: "all 200ms ease",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: isVoted
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.5)",
                    lineHeight: 1.45,
                    flex: 1,
                    transition: "color 200ms ease",
                  }}
                >
                  {hook}
                </span>

                {hasVoted && (
                  <span
                    style={{
                      fontSize: 10,
                      color: isVoted
                        ? "rgba(255,255,255,0.5)"
                        : "rgba(255,255,255,0.2)",
                      flexShrink: 0,
                      minWidth: 32,
                      textAlign: "right",
                      transition: "opacity 300ms ease",
                    }}
                  >
                    {pct}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
