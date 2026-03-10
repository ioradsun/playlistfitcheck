import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

type Step = 2 | "cta" | "done";

interface Props {
  postId: string;
  isOwner?: boolean;
  onOpenReviews?: () => void;
  onReviewRemoved?: () => void;
  spotifyTrackUrl?: string;
  artistsJson?: any[];
  onScored?: () => void;
  onUnscored?: () => void;
  onVotedSide?: (side: "a" | "b" | null) => void;
  isBattle?: boolean;
  onOpenReactions?: () => void;
  onRegisterVoteHandler?: (fn: (replay: boolean) => void) => void;
  showPreResolved?: boolean;
  preResolved?: { total: number; replay_yes: number; saves_count?: number };
  rank?: number;
}

interface Results {
  total: number;
  replay_yes: number;
  replay_no: number;
}

const SESSION_COUNT_KEY = "crowdfit_reviews_this_session";

function incrementSessionReviewCount() {
  const next = parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10) + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
}

export function HookReview({ postId, onScored, onUnscored, onVotedSide, isBattle, onOpenReactions, onRegisterVoteHandler, showPreResolved, preResolved, rank }: Props) {
  const leftLabel  = isBattle ? "LEFT HOOK"  : "Run it back";
  const rightLabel = isBattle ? "RIGHT HOOK" : "Skip";
  const fitLabel   = isBattle ? "LEFT HOOK"  : "REPLAY FIT";

  const { user } = useAuth();
  const sessionId = getSessionId();

  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(2);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "cta") setTimeout(() => inputRef.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    const check = async () => {
      let q = supabase.from("songfit_hook_reviews").select("id, would_replay").eq("post_id", postId);
      q = user ? q.eq("user_id", user.id) : q.eq("session_id", sessionId).is("user_id", null);
      const { data } = await q.maybeSingle();
      if (data) {
        const voted = (data as any).would_replay;
        setWouldReplay(voted);
        onVotedSide?.(voted === true ? "a" : voted === false ? "b" : null);
        fetchResults().then(r => { setResults(r); setStep("done"); });
        onScored?.();
      }
      setAlreadyChecked(true);
    };
    check();
  }, [postId, user, sessionId]);

  const fetchResults = async (): Promise<Results> => {
    const { data } = await supabase
      .from("songfit_hook_reviews")
      .select("would_replay")
      .eq("post_id", postId);
    const rows = data || [];
    let replay_yes = 0, replay_no = 0;
    for (const row of rows) {
      if (row.would_replay === true) replay_yes++;
      else if (row.would_replay === false) replay_no++;
    }
    return { total: rows.length, replay_yes, replay_no };
  };

  const handleVote = (replay: boolean) => {
    if (!user) { navigate("/Auth", { state: { returnTab: "crowdfit" } }); return; }
    setWouldReplay(replay);
    onVotedSide?.(replay ? "a" : "b");
    setStep("cta");
  };

  // Register the vote handler so external components can trigger votes
  useEffect(() => {
    onRegisterVoteHandler?.(handleVote);
  });


    let q = supabase.from("songfit_hook_reviews").delete().eq("post_id", postId);
    if (user) q = q.eq("user_id", user.id);
    else q = (q as any).eq("session_id", sessionId).is("user_id", null);
    await q;
    setResults(null);
    setStep(2);
    setNote("");
    onVotedSide?.(null);
    onUnscored?.();
    window.dispatchEvent(new CustomEvent("crowdfit:vote"));
  };

  const handleSubmit = async (text: string) => {
    try {
      const payload: any = {
        post_id: postId,
        hook_rating: "solid",
        would_replay: wouldReplay,
        context_note: text.trim() || null,
      };
      if (user) payload.user_id = user.id;
      else payload.session_id = sessionId;
      await supabase.from("songfit_hook_reviews").insert(payload);
    } catch { /* ignore unique constraint */ }
    incrementSessionReviewCount();
    window.dispatchEvent(new CustomEvent("crowdfit:vote"));
    const r = await fetchResults();
    setResults(r);
    setStep("done");
    onScored?.();
  };

  if (!alreadyChecked) return null;

  // ── Pre-resolved (Billboard) ──
  if (showPreResolved && step !== "done" && step !== "cta") {
    const total     = preResolved?.total ?? 0;
    const replayYes = preResolved?.replay_yes ?? 0;
    const strength  = total > 0 ? Math.round((replayYes / total) * 100) : null;
    const rankStr   = rank != null ? `#${String(rank).padStart(2, "0")}` : null;
    return (
      <div className="border-t border-border/30">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            {rankStr && <>RANK: {rankStr} · </>}
            SIGNAL: {strength !== null ? `${strength}%` : "—"}
          </span>
        </div>
        <div className="border-t border-border/30 flex items-stretch">
          <button onClick={() => handleVote(true)} className="flex-1 flex items-center justify-center py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group">
            <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">{leftLabel}</span>
          </button>
          <div style={{ width: "0.5px" }} className="bg-border/30 self-stretch my-2" />
          <button onClick={() => handleVote(false)} className="flex-1 flex items-center justify-center py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group">
            <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">{rightLabel}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>

      {/* ── DONE ── */}
      {step === "done" && results && (() => {
        const { total, replay_yes: signals } = results;
        const hasSignals = signals > 0;
        const pct = total > 0 ? Math.round((signals / total) * 100) : 0;
        return (
          <div className="animate-fade-in">
            <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
            <div className="px-3 py-2 flex items-center justify-between gap-3">
              <p className={`font-mono text-[11px] uppercase tracking-widest text-muted-foreground ${!hasSignals ? "animate-signal-pulse" : ""}`}>
                {hasSignals ? `${pct}% ${fitLabel}` : "CALIBRATING"}
              </p>
              <div className="flex items-center gap-3">
                {hasSignals && onOpenReactions ? (
                  <button onClick={onOpenReactions} className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    {signals} of {total} FMLY signals in
                  </button>
                ) : !hasSignals && (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/40">
                    Waiting for input
                  </span>
                )}
                {rank != null && rank <= 50 && (
                  <span className="font-mono text-[11px] text-muted-foreground/30">#{rank}</span>
                )}
                <button onClick={handleRemove} className="font-mono text-[11px] text-muted-foreground/30 hover:text-destructive transition-colors">
                  ✕
                </button>
              </div>
            </div>
            <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          </div>
        );
      })()}

      {/* ── DECISION ── */}
      {step === 2 && (
        <div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          <div className="flex items-stretch">
            <button onClick={() => handleVote(true)} className="flex-1 flex items-center justify-center py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group">
              <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">{leftLabel}</span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-border/30 self-stretch my-2" />
            <button onClick={() => handleVote(false)} className="flex-1 flex items-center justify-center py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group">
              <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">{rightLabel}</span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-border/30 self-stretch my-2" />
            <button onClick={onOpenReactions} className="flex items-center justify-center px-5 py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group" aria-label="React">
              <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">React</span>
            </button>
          </div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        </div>
      )}

      {/* ── CTA — single row, no jump ── */}
      {step === "cta" && (
        <div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          <div className="flex items-stretch">
            <input
              ref={inputRef}
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); handleSubmit(note); }
                if (e.key === "Escape") setStep(2);
              }}
              placeholder="Signal locked · drop your take"
              className="flex-1 bg-transparent text-[12px] font-mono text-muted-foreground placeholder:text-muted-foreground/50 outline-none px-3 py-3.5 tracking-wide focus:text-foreground transition-colors"
            />
            <div style={{ width: "0.5px" }} className="bg-border/30 self-stretch my-2" />
            <button onClick={onOpenReactions} className="flex items-center justify-center px-5 py-3.5 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group" aria-label="React">
              <span className="text-[12px] font-mono tracking-[0.18em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">React</span>
            </button>
          </div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        </div>
      )}

    </div>
  );
}
