import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

type HookRating = "missed" | "almost" | "solid" | "hit";

interface Props {
  postId: string;
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

  const [hookRating, setHookRating] = useState<HookRating | null>(null);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [contextNote, setContextNote] = useState("");
  const [completed, setCompleted] = useState(false);
  const [reviewCount, setReviewCount] = useState(getSessionReviewCount());
  const [submitting, setSubmitting] = useState(false);
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  // Auto-submit when both required fields filled
  const submitRef = useRef(false);

  useEffect(() => {
    // Check if user already reviewed this post
    const checkExisting = async () => {
      let query = supabase
        .from("songfit_hook_reviews")
        .select("id")
        .eq("post_id", postId);

      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", sessionId).is("user_id", null);
      }

      const { data } = await query.maybeSingle();
      if (data) {
        setCompleted(true);
      }
      setAlreadyChecked(true);
    };

    checkExisting();
  }, [postId, user, sessionId]);

  useEffect(() => {
    if (hookRating !== null && wouldReplay !== null && !submitRef.current && !completed && alreadyChecked) {
      submitRef.current = true;
      handleSubmit();
    }
  }, [hookRating, wouldReplay, completed, alreadyChecked]);

  const handleSubmit = async () => {
    if (submitting || completed) return;
    setSubmitting(true);
    try {
      const payload: any = {
        post_id: postId,
        hook_rating: hookRating,
        would_replay: wouldReplay,
        context_note: contextNote.trim() || null,
      };

      if (user) {
        payload.user_id = user.id;
      } else {
        payload.session_id = sessionId;
      }

      const { error } = await supabase.from("songfit_hook_reviews").insert(payload);
      if (error && error.code !== "23505") throw error; // ignore unique constraint (already reviewed)

      const count = incrementSessionReviewCount();
      setReviewCount(count);
      setCompleted(true);
    } catch (e: any) {
      // If unique constraint, still show complete state
      if (e?.code === "23505") {
        setCompleted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!alreadyChecked) return null;

  if (completed) {
    return (
      <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
            <Check size={10} className="text-primary" />
          </div>
          <span className="text-xs">Your reaction was recorded.</span>
        </div>
        {reviewCount > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {reviewCount} {reviewCount === 1 ? "review" : "reviews"} this session
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border/30 px-4 py-3 space-y-3">
      {/* Section 1: Hook Strength */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Did the hook land?</p>
        <div className="flex gap-1.5">
          {HOOK_OPTIONS.map(({ value, label }) => {
            const selected = hookRating === value;
            return (
              <button
                key={value}
                onClick={() => setHookRating(value)}
                className={`flex-1 py-1.5 px-1 text-xs font-medium rounded-md border transition-all ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Replay Intent */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Would you replay this?</p>
        <div className="flex gap-2">
          {[
            { value: true, label: "🔁 Yes" },
            { value: false, label: "⏭ No" },
          ].map(({ value, label }) => {
            const selected = wouldReplay === value;
            return (
              <button
                key={String(value)}
                onClick={() => setWouldReplay(value)}
                className={`flex-1 py-2 text-sm font-medium rounded-md border transition-all ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Context (optional, collapsed) */}
      <div>
        <button
          onClick={() => setContextExpanded(v => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {contextExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Add context (optional)
        </button>
        {contextExpanded && (
          <textarea
            value={contextNote}
            onChange={e => setContextNote(e.target.value)}
            placeholder="What made you choose that?"
            rows={2}
            className="mt-2 w-full bg-muted/40 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none resize-none rounded-md p-2 border border-border/40 focus:border-border"
          />
        )}
      </div>
    </div>
  );
}
