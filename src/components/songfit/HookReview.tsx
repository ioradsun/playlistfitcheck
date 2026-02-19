import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

type HookRating = "missed" | "almost" | "solid" | "hit";
type Step = 2 | "replay_cta" | "skip_cta" | "revealing" | "done";

interface Props {
  postId: string;
  isOwner?: boolean;
  onOpenReviews?: () => void;
  onReviewRemoved?: () => void;
  spotifyTrackUrl?: string;
  artistsJson?: any[];
  // Billboard pre-resolved mode
  showPreResolved?: boolean;
  preResolved?: { total: number; replay_yes: number };
  rank?: number;
}

interface Results {
  total: number;
  hook: Record<HookRating, number>;
  replay_yes: number;
  replay_no: number;
}

const SESSION_COUNT_KEY = "crowdfit_reviews_this_session";

function getSessionReviewCount(): number {
  return parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10);
}
function incrementSessionReviewCount(): number {
  const next = getSessionReviewCount() + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
  return next;
}

export function HookReview({ postId, isOwner, onOpenReviews, spotifyTrackUrl, artistsJson, showPreResolved, preResolved, rank }: Props) {
  const { user } = useAuth();
  const sessionId = getSessionId();
  const navigate = useNavigate();

  const handleVoteClick = (replay: boolean) => {
    if (!user) {
      navigate("/Auth", { state: { returnTab: "crowdfit" } });
      return;
    }
    setWouldReplay(replay);
    setStep(replay ? "replay_cta" : "skip_cta");
  };

  const [step, setStep] = useState<Step>(2);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [contextNote, setContextNote] = useState("");
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [dots, setDots] = useState(".");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "replay_cta") setTimeout(() => textareaRef.current?.focus(), 50);
    if (step === "skip_cta") setTimeout(() => skipTextareaRef.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    const checkExisting = async () => {
      let query = supabase.from("songfit_hook_reviews").select("id").eq("post_id", postId);
      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", sessionId).is("user_id", null);
      }
      const { data } = await query.maybeSingle();
      if (data) {
        fetchResults().then(r => { setResults(r); setStep("done"); });
      }
      setAlreadyChecked(true);
    };
    checkExisting();
  }, [postId, user, sessionId, showPreResolved]);

  useEffect(() => {
    if (step !== "revealing") return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 400);
    return () => clearInterval(interval);
  }, [step]);

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
    setStep("revealing");

    setTimeout(async () => {
      const r = await fetchResults();
      setResults(r);
      setStep("done");
    }, 3000);
  };

  const handleContextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(contextNote);
    }
  };

  if (!alreadyChecked) return null;

  // Pre-resolved (FMLY 40 billboard) layout
  if (showPreResolved && step !== "done" && step !== "revealing" && step !== "replay_cta" && step !== "skip_cta") {
    const total = preResolved?.total ?? 0;
    const replayYes = preResolved?.replay_yes ?? 0;
    const strength = total > 0 ? Math.round((replayYes / total) * 100) : null;
    const rankStr = rank != null ? String(rank).padStart(2, "0") : null;
    const signalLabel = total === 1 ? "signal" : "signals";

    return (
      <div className="border-t border-border/30">
        {/* Signal Row */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Signal Strength: {strength !== null ? `${strength}%` : "—"}
            {rankStr && <> · Standing: {rankStr}</>}
            {" · "}{total} {signalLabel}
          </span>
        </div>
        {/* Action Row */}
        <div className="border-t border-border/30 px-4 py-3 flex gap-2">
          <button
            onClick={() => handleVoteClick(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none text-muted-foreground/40">↺</span>
            <span className="text-[12px] leading-none font-medium text-muted-foreground">Run it back</span>
          </button>
          <button
            onClick={() => handleVoteClick(false)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none text-muted-foreground/40">→|</span>
            <span className="text-[12px] leading-none font-medium text-muted-foreground">Skip</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/30 px-4 py-3 min-h-[72px] flex flex-col justify-center">

      {/* Revealing */}
      {step === "revealing" && (
        <span className="text-xs text-muted-foreground">Summing Signals{dots}</span>
      )}

      {/* Done */}
      {step === "done" && results && (() => {
        const replayPct = results.total > 0 ? Math.round((results.replay_yes / results.total) * 100) : 0;
        const signalLabel = results.total === 1 ? "signal" : "signals";
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-foreground">Signal Strength: {replayPct}%</span>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {replayPct >= 50
                  ? `${replayPct}% of the FMLY would run it back.`
                  : `${replayPct}% are feeling this.`}
              </span>
              {isOwner && onOpenReviews ? (
                <button
                  onClick={onOpenReviews}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {results.total} {signalLabel}
                </button>
              ) : (
                <span className="text-muted-foreground/50">{results.total} {signalLabel}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Step 2: Run it back / Skip */}
      {step === 2 && (
        <div className="flex gap-2">
          <button
            onClick={() => handleVoteClick(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none text-muted-foreground/40">↺</span>
            <span className="text-[12px] leading-none font-medium text-muted-foreground">Run it back</span>
          </button>
          <button
            onClick={() => handleVoteClick(false)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none text-muted-foreground/40">→|</span>
            <span className="text-[12px] leading-none font-medium text-muted-foreground">Skip</span>
          </button>
        </div>
      )}

      {/* replay_cta: Spotify CTAs + comment + vote */}
      {step === "replay_cta" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {artistsJson && artistsJson.length > 0 && artistsJson[0]?.spotifyUrl && (
                <a
                  href={artistsJson[0].spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] border border-border/40 rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-[120ms]"
                >
                  <span>♫</span>
                  <span>Follow {artistsJson[0].name}</span>
                </a>
              )}
              {spotifyTrackUrl && (
                <a
                  href={spotifyTrackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] border border-border/40 rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all duration-[120ms]"
                >
                  <span>+</span>
                  <span>Save track</span>
                </a>
              )}
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors leading-none"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
              onKeyDown={handleContextKeyDown}
              placeholder="What hit? (Optional but helpful)"
              rows={2}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none"
            />
            <button
              onClick={() => handleSubmit(contextNote)}
              className="shrink-0 text-[11px] font-medium bg-foreground text-background px-3 py-1.5 rounded-md hover:bg-foreground/90 transition-colors"
            >
              Send Signal
            </button>
          </div>
        </div>
      )}

      {/* skip_cta: comment + vote (no Spotify CTAs) */}
      {step === "skip_cta" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground tracking-wide">→| Real talk: What's missing?</p>
            <button
              onClick={() => setStep(2)}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors leading-none"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
          <div className="flex items-end gap-2">
          <textarea
              ref={skipTextareaRef}
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
              onKeyDown={handleContextKeyDown}
              placeholder="The missing piece... (Optional but helpful)"
              rows={2}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none"
            />
            <button
              onClick={() => handleSubmit(contextNote)}
              className="shrink-0 text-[11px] font-medium bg-foreground text-background px-3 py-1.5 rounded-md hover:bg-foreground/90 transition-colors"
            >
              Send Signal
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
