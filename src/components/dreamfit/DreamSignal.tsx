import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

type SignalStep = "idle" | "signaled" | "bypassed" | "done";

function getSignalVerbiage(total: number, pct: number) {
  if (total <= 10) {
    return {
      label: `STATUS: RESOLVING... (${total}/50 SIGNALS)`,
      summary: "ACQUIRING INITIAL SIGNAL FROM THE FMLY.",
      bigDisplay: `${pct}%`,
      tier: "resolving" as const,
    };
  }
  if (total < 50) {
    return {
      label: `STATUS: ${total}/50 SIGNALS`,
      summary: "COLLECTING DATA TO REACH UNIT CONSENSUS.",
      bigDisplay: `${total}/50`,
      tier: "detected" as const,
    };
  }
  return {
    label: "STATUS: CONSENSUS REACHED",
    summary: `${pct}% OF THE FMLY RESONATE WITH THIS.`,
    bigDisplay: `${pct}%`,
    tier: "consensus" as const,
  };
}

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
  const [chosenSignal, setChosenSignal] = useState<"signal" | "bypass" | null>(null);
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
        // Map DB values to new UI values
        const mapped = data.signal_type === "greenlight" ? "signal" : "bypass";
        setChosenSignal(mapped as "signal" | "bypass");
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

  // Auto-focus textarea when step changes to signaled/bypassed
  useEffect(() => {
    if ((step === "signaled" || step === "bypassed") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [step]);

  const demandStrength =
    localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;

  const handleVoteClick = (type: "signal" | "bypass") => {
    setStep(type === "signal" ? "signaled" : "bypassed");
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
    if (chosenSignal === "signal") setLocalGreenlight(c => Math.max(c - 1, 0));
    setChosenSignal(null);
    setStep("idle");
    onRefresh();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    // Map UI values back to DB values (greenlight/shelve)
    const signalType = step === "signaled" ? "greenlight" : "shelve";

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
    const verbiage = getSignalVerbiage(localBackers, pct);

    return (
      <div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        <div className="px-3 py-2 space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className={verbiage.tier === "resolving" ? "opacity-50" : ""}>{verbiage.label}</span>
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
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
            {verbiage.summary}
          </p>
        </div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      </div>
    );
  }

  // ── Active (feedback) state ──────────────────────────────────
  if (step === "signaled" || step === "bypassed") {
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
                placeholder={step === "bypassed" ? "Have a better idea?" : "Why does the FMLY need this?"}
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

      {/* Signal Status row — signals count is tappable to open comments */}
      <div className="px-3 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {localBackers === 0 ? (
            <>Demand Strength: —</>
          ) : (() => {
            const v = getSignalVerbiage(localBackers, demandStrength);
            return (
              <>
                <span className={v.tier === "resolving" ? "opacity-50" : ""}>{v.label}</span>
              </>
            );
          })()}
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

      {/* SIGNAL / BYPASS buttons */}
      <div className="flex gap-2 px-3 py-2.5">
        <button
          onClick={() => handleVoteClick("signal")}
          className="flex-1 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[12px] font-medium text-muted-foreground transition-colors"
        >
          Signal
        </button>
        <button
          onClick={() => handleVoteClick("bypass")}
          className="flex-1 py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[12px] font-medium text-muted-foreground transition-colors"
        >
          Bypass
        </button>
      </div>
    </div>
  );
}
