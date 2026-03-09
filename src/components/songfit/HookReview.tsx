import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

type HookRating = "missed" | "almost" | "solid" | "hit";

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
  // Billboard pre-resolved mode
  showPreResolved?: boolean;
  preResolved?: { total: number; replay_yes: number; saves_count?: number };
  rank?: number;
}

interface Results {
  total: number;
  hook: Record<HookRating, number>;
  replay_yes: number;
  replay_no: number;
}

const SESSION_COUNT_KEY = "crowdfit_reviews_this_session";

const COMMENT_PROMPTS = [
  "What made you run it back?",
  "What would make this stronger?",
  "Where did the hook land for you?",
  "What moment stuck with you?",
];

function getSessionReviewCount(): number {
  return parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10);
}
function incrementSessionReviewCount(): number {
  const next = getSessionReviewCount() + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
  return next;
}

export function HookReview({ postId, isOwner, onOpenReviews, spotifyTrackUrl, artistsJson, onScored, onUnscored, onVotedSide, isBattle, onOpenReactions, showPreResolved, preResolved, rank }: Props) {
  const leftLabel = isBattle ? "LEFT HOOK" : "Run it back";
  const rightLabel = isBattle ? "RIGHT HOOK" : "Skip";
  const fitLabel = isBattle ? "LEFT HOOK" : "REPLAY FIT";
  const { user } = useAuth();
  const sessionId = getSessionId();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(2);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [contextNote, setContextNote] = useState("");
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commentPrompt = wouldReplay === false
    ? "The missing piece... (Optional but helpful)"
    : COMMENT_PROMPTS[parseInt(postId.slice(-1), 16) % COMMENT_PROMPTS.length];

  useEffect(() => {
    if (step === "cta") setTimeout(() => textareaRef.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    const checkExisting = async () => {
      let query = supabase.from("songfit_hook_reviews").select("id, would_replay").eq("post_id", postId);
      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", sessionId).is("user_id", null);
      }
      const { data } = await query.maybeSingle();
      if (data) {
        const voted = (data as any).would_replay;
        setWouldReplay(voted);
        onVotedSide?.(voted === true ? "a" : voted === false ? "b" : null);
        fetchResults().then(r => { setResults(r); setStep("done"); });
        onScored?.();
      }
      setAlreadyChecked(true);
    };
    checkExisting();
  }, [postId, user, sessionId]);

  const fetchResults = async (): Promise<Results> => {
    const { data } = await supabase
      .from("songfit_hook_reviews")
      .select("hook_rating, would_replay")
      .eq("post_id", postId);

    const rows = data || [];
    const hook: Record<HookRating, number> = { missed: 0, almost: 0, solid: 0, hit: 0 };
    let replay_yes = 0, replay_no = 0;

    for (const row of rows) {
      if (row.hook_rating in hook) hook[row.hook_rating as HookRating]++;
      if (row.would_replay === true) replay_yes++;
      else if (row.would_replay === false) replay_no++;
    }
    return { total: rows.length, hook, replay_yes, replay_no };
  };

  const handleVoteClick = (replay: boolean) => {
    if (!user) {
      navigate("/Auth", { state: { returnTab: "crowdfit" } });
      return;
    }
    setWouldReplay(replay);
    onVotedSide?.(replay ? "a" : "b");
    setStep("cta");
  };

  const handleRemoveSignal = async () => {
    let query = supabase.from("songfit_hook_reviews").delete().eq("post_id", postId);
    if (user) query = query.eq("user_id", user.id);
    else query = (query as any).eq("session_id", sessionId).is("user_id", null);
    await query;
    setResults(null);
    setStep(2);
    setContextNote("");
    setShowIdentity(false);
    onVotedSide?.(null);
    onUnscored?.();
    window.dispatchEvent(new CustomEvent("crowdfit:vote"));
  };

  const handleSubmit = async (note: string, overrideReplay?: boolean) => {
    const replayValue = overrideReplay !== undefined ? overrideReplay : wouldReplay;
    try {
      const payload: any = {
        post_id: postId,
        hook_rating: "solid",
        would_replay: replayValue,
        context_note: note.trim() || null,
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
    setTimeout(() => setShowIdentity(true), 400);
  };

  const handleContextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(contextNote);
    }
  };

  if (!alreadyChecked) return null;

  // Pre-resolved (FMLY 40 billboard) layout
  if (showPreResolved && step !== "done" && step !== "cta") {
    const total = preResolved?.total ?? 0;
    const replayYes = preResolved?.replay_yes ?? 0;
    const savesCount = preResolved?.saves_count ?? 0;
    const strength = total > 0 ? Math.round((replayYes / total) * 100) : null;
    const rankStr = rank != null ? `#${String(rank).padStart(2, "0")}` : null;

    return (
      <div className="border-t border-border/30">
        {/* Studio Display Row */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            {rankStr && <>RANK: {rankStr} · </>}
            SIGNAL: {strength !== null ? `${strength}%` : "—"}
            {" · "}{savesCount} SAVES
          </span>
        </div>
        {/* Action Row */}
        <div className="border-t border-border/30 px-4 py-3 flex gap-2">
          <button
            onClick={() => handleVoteClick(true)}
            className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">{leftLabel}</span>
          </button>
          <button
            onClick={() => handleVoteClick(false)}
            className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">{rightLabel}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>

      {/* ── DONE ── */}
      {step === "done" && results && (() => {
        const total = results.total;
        const signals = results.replay_yes;
        const hasSignals = signals > 0;
        const pct = total > 0 ? Math.round((signals / total) * 100) : 0;

        return (
          <div className="animate-fade-in">
            <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
            <div className="px-3 py-2 space-y-0.5">
              {/* Turn Off Signal */}
              <div className="flex items-center justify-end">
                <button
                  onClick={handleRemoveSignal}
                  className="font-mono text-[11px] text-muted-foreground/30 hover:text-destructive transition-colors"
                >
                  Turn Off Signal
                </button>
              </div>
              {/* Result row */}
              <div className="flex items-center justify-between gap-3">
                <p className={`font-mono text-[11px] uppercase tracking-widest text-muted-foreground ${!hasSignals ? "animate-signal-pulse" : ""}`}>
                  {hasSignals ? `${pct}% ${fitLabel}` : "CALIBRATING"}
                </p>
                <div className="flex items-center gap-2">
                  {hasSignals && onOpenReviews ? (
                    <button
                      onClick={onOpenReviews}
                      className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {signals} of {total} FMLY signals in
                    </button>
                  ) : !hasSignals && (
                    <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/40">
                      Waiting for input
                    </span>
                  )}
                  {/* Rank */}
                  <div className="flex items-center gap-1.5 text-muted-foreground/30 text-[11px] font-mono">
                    {rank && rank <= 50 && <span>#{rank}</span>}
                  </div>
                </div>
              </div>

              {/* Identity line — fades in 400ms after signal */}
              {showIdentity && (
                <p
                  className="text-[10px] font-mono text-muted-foreground/30 text-center mt-1 transition-opacity duration-700"
                  style={{ opacity: showIdentity ? 1 : 0 }}
                >
                  {wouldReplay ? "You called it early." : "Your read is logged."}
                </p>
              )}
            </div>
            <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          </div>
        );
      })()}

      {/* ── STATE 1: DECISION ── */}
      {step === 2 && (
        <div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          <div className="flex gap-2 px-3 py-2.5">
            <button
              onClick={() => handleVoteClick(true)}
              className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
            >
              <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">
                {leftLabel}
              </span>
            </button>
            <button
              onClick={() => handleVoteClick(false)}
              className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
            >
              <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">
                {rightLabel}
              </span>
            </button>
            {/* React button */}
            <button
              onClick={onOpenReactions}
              className="flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
              aria-label="React"
            >
              <span className="text-[15px] leading-none">🔥</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STATE 2: RESPONSE (unified) ── */}
      {step === "cta" && (
        <div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
          <div className="px-3 py-2.5 space-y-2.5">
            {/* Cancel */}
            <div className="flex items-center justify-end">
              <button
                onClick={() => setStep(2)}
                className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors leading-none"
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
            {/* Signal locked in */}
            <p className="font-mono text-[11px] text-muted-foreground tracking-wide uppercase">
              Signal locked in
            </p>
            {/* Comment + React + BROADCAST */}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={contextNote}
                onChange={e => setContextNote(e.target.value)}
                onKeyDown={handleContextKeyDown}
                placeholder={commentPrompt}
                rows={2}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/35 outline-none resize-none leading-relaxed"
              />
              {/* React button */}
              <button
                onClick={onOpenReactions}
                className="shrink-0 flex items-center justify-center py-2 px-2.5 rounded-md border border-border/40 hover:border-foreground/15 transition-all"
                aria-label="React"
              >
                <span className="text-[15px] leading-none">🔥</span>
              </button>
              <button
                onClick={() => handleSubmit(contextNote)}
                className="shrink-0 text-[13px] font-bold uppercase tracking-[0.15em] bg-foreground text-background px-4 py-2.5 rounded-md hover:opacity-90 transition-opacity"
              >
                BROADCAST
              </button>
            </div>
          </div>
          <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        </div>
      )}

    </div>
  );
}
