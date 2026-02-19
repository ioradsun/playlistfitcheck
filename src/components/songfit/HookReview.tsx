import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

type HookRating = "missed" | "almost" | "solid" | "hit";
type Step = 1 | 2 | 3 | "revealing" | "done";

interface Props {
  postId: string;
}

interface Results {
  total: number;
  hook: Record<HookRating, number>;
  replay_yes: number;
  replay_no: number;
}

const HOOK_OPTIONS: { value: HookRating; label: string }[] = [
  { value: "missed", label: "Missed" },
  { value: "almost", label: "Almost" },
  { value: "solid", label: "Solid" },
  { value: "hit", label: "Hit" },
];

const SESSION_COUNT_KEY = "crowdfit_reviews_this_session";

function getSessionReviewCount(): number {
  return parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10);
}
function incrementSessionReviewCount(): number {
  const next = getSessionReviewCount() + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
  return next;
}

export function HookReview({ postId }: Props) {
  const { user } = useAuth();
  const sessionId = getSessionId();

  const [step, setStep] = useState<Step>(1);
  const [hookRating, setHookRating] = useState<HookRating | null>(null);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [contextNote, setContextNote] = useState("");
  const [reviewCount, setReviewCount] = useState(getSessionReviewCount());
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [dots, setDots] = useState(".");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        // Already reviewed — fetch results and jump straight to done
        fetchResults().then(r => { setResults(r); setStep("done"); });
      }
      setAlreadyChecked(true);
    };
    checkExisting();
  }, [postId, user, sessionId]);

  // Auto-focus textarea when step 3 appears
  useEffect(() => {
    if (step === 3) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [step]);

  // Animated dots while revealing
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
    let replay_yes = 0;
    let replay_no = 0;

    for (const row of rows) {
      if (row.hook_rating in hook) hook[row.hook_rating as HookRating]++;
      if (row.would_replay === true) replay_yes++;
      else if (row.would_replay === false) replay_no++;
    }

    return { total: rows.length, hook, replay_yes, replay_no };
  };

  const handleSubmit = async (note: string) => {
    try {
      const payload: any = {
        post_id: postId,
        hook_rating: hookRating,
        would_replay: wouldReplay,
        context_note: note.trim() || null,
      };
      if (user) {
        payload.user_id = user.id;
      } else {
        payload.session_id = sessionId;
      }
      await supabase.from("songfit_hook_reviews").insert(payload);
    } catch {
      // ignore unique constraint
    }

    incrementSessionReviewCount();
    setReviewCount(getSessionReviewCount());
    setStep("revealing");

    // After 3 seconds, fetch and show results
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

  return (
    <div className="border-t border-border/30 px-4 py-3 min-h-[72px] flex flex-col justify-center">

      {/* Revealing state */}
      {step === "revealing" && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tallying results{dots}</span>
        </div>
      )}

      {/* Done: show results */}
      {step === "done" && results && (() => {
        const topEntry = HOOK_OPTIONS.reduce((best, { value, label }) => {
          const pct = results.total > 0 ? Math.round((results.hook[value] / results.total) * 100) : 0;
          return pct > best.pct ? { label, pct } : best;
        }, { label: "", pct: 0 });
        const replayPct = results.total > 0 ? Math.round((results.replay_yes / results.total) * 100) : 0;
        return (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
            <span><span className="text-foreground font-medium">{topEntry.pct}%</span> {topEntry.label}</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground font-medium">{replayPct}%</span> replay</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-muted-foreground/50">{results.total} {results.total === 1 ? "review" : "reviews"}</span>
          </div>
        );
      })()}

      {/* Step 1: Did the hook land? */}
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Did the hook land?</p>
          <div className="flex gap-1.5">
            {HOOK_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setHookRating(value); setStep(2); }}
                className="flex-1 py-1.5 px-1 text-xs font-medium rounded-md border border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5 transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Would you replay this? */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Would you replay this?</p>
          <div className="flex gap-2">
            {[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ].map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => { setWouldReplay(value); setStep(3); }}
                className="flex-1 py-1.5 text-sm font-medium rounded-md border border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5 transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Optional context + submit */}
      {step === 3 && (
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={contextNote}
            onChange={e => setContextNote(e.target.value)}
            onKeyDown={handleContextKeyDown}
            placeholder="What made you choose that? (optional) — press Enter to submit"
            rows={2}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/40">Shift+Enter for new line</span>
            <button
              onClick={() => handleSubmit(contextNote)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
