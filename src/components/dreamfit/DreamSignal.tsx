import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

type SignalStep = "idle" | "greenlit" | "shelved" | "done";

interface Props {
  dreamId: string;
  backersCount: number;
  greenlightCount: number;
  commentsCount: number;
  onRefresh: () => void;
  onOpenComments: (dreamId: string) => void;
}

export function DreamSignal({ dreamId, backersCount, greenlightCount, commentsCount, onRefresh, onOpenComments }: Props) {
  const { user } = useAuth();
  const sessionId = getSessionId();

  const [step, setStep] = useState<SignalStep>("idle");
  const [contextNote, setContextNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localBackers, setLocalBackers] = useState(backersCount);
  const [localGreenlight, setLocalGreenlight] = useState(greenlightCount);
  const [chosenSignal, setChosenSignal] = useState<"greenlight" | "shelve" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if this user/session has already voted
  useEffect(() => {
    const checkExisting = async () => {
      let query = supabase.from("dream_backers").select("signal_type").eq("dream_id", dreamId);
      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", sessionId).is("user_id", null);
      }
      const { data } = await query.maybeSingle();
      if (data) {
        setChosenSignal(data.signal_type as "greenlight" | "shelve");
        setStep("done");
      }
    };
    checkExisting();
  }, [dreamId, user, sessionId]);

  // Sync props → local state (after refresh)
  useEffect(() => {
    setLocalBackers(backersCount);
    setLocalGreenlight(greenlightCount);
  }, [backersCount, greenlightCount]);

  // Auto-focus textarea when step changes to greenlit/shelved
  useEffect(() => {
    if ((step === "greenlit" || step === "shelved") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [step]);

  const demandStrength =
    localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;

  const handleVoteClick = (type: "greenlight" | "shelve") => {
    setStep(type === "greenlight" ? "greenlit" : "shelved");
    setChosenSignal(type);
  };

  const handleCancel = () => {
    setStep("idle");
    setChosenSignal(null);
    setContextNote("");
  };

  const handleRemoveSignal = async () => {
    let query = supabase.from("dream_backers").delete().eq("dream_id", dreamId);
    if (user) query = query.eq("user_id", user.id);
    else query = (query as any).eq("session_id", sessionId).is("user_id", null);
    await query;
    setLocalBackers(c => Math.max(c - 1, 0));
    if (chosenSignal === "greenlight") setLocalGreenlight(c => Math.max(c - 1, 0));
    setChosenSignal(null);
    setStep("idle");
    onRefresh();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const signalType = step === "greenlit" ? "greenlight" : "shelve";

    const payload: Record<string, any> = {
      dream_id: dreamId,
      signal_type: signalType,
      context_note: contextNote.trim() || null,
    };

    if (user) {
      payload.user_id = user.id;
    } else {
      payload.session_id = sessionId;
    }

    const { error } = await (supabase.from("dream_backers") as any).insert(payload);

    if (!error) {
      setLocalBackers((c) => c + 1);
      if (signalType === "greenlight") setLocalGreenlight((c) => c + 1);
      setStep("done");
      onRefresh();
    }

    setSubmitting(false);
  };

  const submitLabel = contextNote.length > 0 ? "Submit Signal" : "Send Signal";

  // Shared signals + comments footer line
  const signalsLabel = localBackers === 1 ? "1 signal" : `${localBackers} signals`;

  // ── Done state ──────────────────────────────────────────────
  if (step === "done") {
    const pct = localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;
    const majority = pct >= 50;
    const summaryLine = majority
      ? `${pct}% of the FMLY greenlighted this.`
      : `Only ${pct}% greenlighted this.`;

    return (
      <div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        <div className="px-3 py-2 space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Demand Strength: {pct}%
              {" · "}
              <button
                onClick={() => onOpenComments(dreamId)}
                className="hover:text-foreground transition-colors"
              >
                {signalsLabel}
              </button>
            </p>
            <button
              onClick={handleRemoveSignal}
              className="text-muted-foreground/30 hover:text-muted-foreground transition-colors text-[10px] font-mono"
            >
              Turn Off Signal
            </button>
          </div>
          <p className="text-[11px] text-foreground/70 font-sans">{summaryLine}</p>
        </div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      </div>
    );
  }

  // ── Active (feedback) state ──────────────────────────────────
  if (step === "greenlit" || step === "shelved") {
    return (
      <div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        <div className="px-3 py-2.5">
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <textarea
                ref={textareaRef}
                value={contextNote}
                onChange={(e) => {
                  if (e.target.value.length <= 280) setContextNote(e.target.value);
                }}
                placeholder={step === "shelved" ? "Have a better idea?" : "Why does the FMLY need this?"}
                rows={2}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none leading-relaxed"
              />
              <button
                onClick={handleCancel}
                className="shrink-0 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-0.5"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground/40">
                {contextNote.length}/280
              </span>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="shrink-0 text-[11px] font-medium bg-foreground text-background px-3 py-1.5 rounded-md disabled:opacity-40 transition-opacity"
              >
                {submitting ? "Sending..." : submitLabel}
              </button>
            </div>
          </div>
        </div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      </div>
    );
  }

  // ── Idle state ───────────────────────────────────────────────
  return (
    <div>
      <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />

      {/* Demand Strength row — signals count is tappable to open comments */}
      <div className="px-3 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Demand Strength:{" "}
          {localBackers > 0 ? `${demandStrength}%` : "—"}
          {" · "}
          <button
            onClick={() => onOpenComments(dreamId)}
            className="hover:text-foreground transition-colors"
          >
            {signalsLabel}
          </button>
        </p>
      </div>

      <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />

      {/* Greenlight / Shelve buttons */}
      <div className="flex gap-2 px-3 py-2.5">
        <button
          onClick={() => handleVoteClick("greenlight")}
          className="flex-1 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[12px] font-medium text-muted-foreground transition-colors"
        >
          Greenlight
        </button>
        <button
          onClick={() => handleVoteClick("shelve")}
          className="flex-1 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[12px] font-medium text-muted-foreground transition-colors"
        >
          Shelve
        </button>
      </div>
    </div>
  );
}
