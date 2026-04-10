import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

interface Props {
  danceId: string | null;
  empowermentPromise: {
    emotionalJob: string;
    fromState: string;
    toState: string;
    promise: string;
    hooks: string[];
  } | null;
  onDismiss: () => void;
}

export function EmpowermentModePanel({ danceId, empowermentPromise, onDismiss }: Props) {
  const { user } = useAuth();
  const hooks = useMemo(() => (empowermentPromise?.hooks ?? []).slice(0, 3), [empowermentPromise]);
  const [counts, setCounts] = useState<number[]>([0, 0, 0]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!danceId) return;
    try {
      const stored = sessionStorage.getItem(`empower_voted_${danceId}`);
      if (stored !== null) {
        const parsed = Number(stored);
        if (Number.isInteger(parsed) && parsed >= 0) setSelectedIndex(parsed);
      }
    } catch {
      // no-op
    }
  }, [danceId]);

  useEffect(() => {
    if (!danceId) return;
    let cancelled = false;

    supabase
      .from("project_angle_votes" as any)
      .select("hook_index")
      .eq("project_id", danceId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const nextCounts = [0, 0, 0];
        for (const row of data as any[]) {
          const hookIndex = Number(row.hook_index);
          if (Number.isInteger(hookIndex) && hookIndex >= 0 && hookIndex <= 2) {
            nextCounts[hookIndex] += 1;
          }
        }
        setCounts(nextCounts);
      });

    return () => {
      cancelled = true;
    };
  }, [danceId]);

  const totalVotes = counts.reduce((sum, value) => sum + value, 0);

  const handleVote = async (hookIndex: number) => {
    if (!danceId || selectedIndex !== null) return;

    const nextCounts = [...counts];
    nextCounts[hookIndex] += 1;
    setCounts(nextCounts);
    setSelectedIndex(hookIndex);

    try {
      sessionStorage.setItem(`empower_voted_${danceId}`, String(hookIndex));
    } catch {
      // no-op
    }

    const { error } = await supabase.from("project_angle_votes" as any).insert({
      project_id: danceId,
      hook_index: hookIndex,
      session_id: getSessionId(),
      user_id: user?.id ?? null,
    });

    if (error) {
      const rollbackCounts = [...nextCounts];
      rollbackCounts[hookIndex] = Math.max(0, rollbackCounts[hookIndex] - 1);
      setCounts(rollbackCounts);
      setSelectedIndex(null);
      try {
        sessionStorage.removeItem(`empower_voted_${danceId}`);
      } catch {
        // no-op
      }
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6 py-8"
      style={{ background: "#0a0a0a", fontFamily: "monospace", color: "rgba(255,255,255,0.88)" }}
    >
      {!empowermentPromise ? (
        <div className="text-center">
          <p className="text-sm text-white/80">empowerment mode</p>
          <p className="mt-2 text-xs text-white/45">coming soon</p>
        </div>
      ) : (
        <div className="w-full max-w-xl text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">which one hits?</p>
          <div className="mt-4 space-y-2">
            {hooks.map((hook, i) => {
              const percent = totalVotes > 0 ? Math.round((counts[i] / totalVotes) * 100) : 0;
              const hasVoted = selectedIndex !== null;
              return (
                <button
                  key={`${i}-${hook}`}
                  type="button"
                  onClick={() => handleVote(i)}
                  disabled={hasVoted}
                  className="w-full rounded-lg border px-4 py-3 text-left transition-colors"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    background: hasVoted ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                    color: "rgba(255,255,255,0.9)",
                    cursor: hasVoted ? "default" : "pointer",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm leading-snug">{hook}</span>
                    {hasVoted && <span className="text-xs text-white/55">{percent}%</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedIndex !== null && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-5 text-xs text-white/60 hover:text-white/85"
            >
              → see moments
            </button>
          )}
        </div>
      )}
    </div>
  );
}
