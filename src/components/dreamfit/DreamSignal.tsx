import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

type SignalStep = "idle" | "active" | "done";

function getSignalVerbiage(total: number, pct: number) {
  if (total <= 10) {
    return {
      label: `STATUS: RESOLVING... (${total}/50 SIGNALS)`,
      summary: "ACQUIRING INITIAL SIGNAL FROM THE FMLY.",
      tier: "resolving" as const,
    };
  }
  if (total < 50) {
    return {
      label: `STATUS: ${total}/50 SIGNALS`,
      summary: "COLLECTING DATA TO REACH UNIT CONSENSUS.",
      tier: "detected" as const,
    };
  }
  return {
    label: "STATUS: CONSENSUS REACHED",
    summary: `${pct}% OF THE FMLY RESONATE WITH THIS.`,
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
  const [chosenType, setChosenType] = useState<"signal" | "bypass" | null>(null);
  const [contextNote, setContextNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localBackers, setLocalBackers] = useState(backersCount);
  const [localGreenlight, setLocalGreenlight] = useState(greenlightCount);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const checkExisting = async () => {
      let query = supabase.from("dream_backers").select("signal_type").eq("dream_id", dreamId);
      if (user) query = query.eq("user_id", user.id);
      else query = query.eq("session_id", sessionId).is("user_id", null);
      const { data } = await query.maybeSingle();
      if (data) {
        setChosenType(data.signal_type === "greenlight" ? "signal" : "bypass");
        setStep("done");
      }
    };
    checkExisting();
  }, [dreamId, user, sessionId]);

  useEffect(() => {
    setLocalBackers(backersCount);
    setLocalGreenlight(greenlightCount);
  }, [backersCount, greenlightCount]);

  useEffect(() => {
    if (step === "active") setTimeout(() => textareaRef.current?.focus(), 50);
  }, [step]);

  const demandStrength = localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;
  const signalsLabel = localBackers === 1 ? "1 signal" : `${localBackers} signals`;
  const divider = <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />;

  const handleVoteClick = (type: "signal" | "bypass") => {
    setChosenType(type);
    setStep("active");
  };

  const handleCancel = () => {
    setChosenType(null);
    setContextNote("");
    setStep("idle");
  };

  const handleRemoveSignal = async () => {
    let query = supabase.from("dream_backers").delete().eq("dream_id", dreamId);
    if (user) query = query.eq("user_id", user.id);
    else query = (query as any).eq("session_id", sessionId).is("user_id", null);
    await query;
    // Update local state only — no full refresh to avoid list re-render
    setLocalBackers(c => Math.max(c - 1, 0));
    if (chosenType === "signal") setLocalGreenlight(c => Math.max(c - 1, 0));
    setChosenType(null);
    setStep("idle");
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const signalType = chosenType === "signal" ? "greenlight" : "shelve";
    const payload: Record<string, any> = {
      dream_id: dreamId,
      signal_type: signalType,
      context_note: contextNote.trim() || null,
    };
    if (user) payload.user_id = user.id;
    else payload.session_id = sessionId;

    const { error } = await (supabase.from("dream_backers") as any).insert(payload);
    if (!error) {
      // Update local state only — no full refresh to avoid list re-render
      setLocalBackers(c => c + 1);
      if (signalType === "greenlight") setLocalGreenlight(c => c + 1);
      setSubmitting(false);
      setContextNote("");
      setStep("done");
    } else {
      setSubmitting(false);
    }
  };

  const pct = localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;
  const v = getSignalVerbiage(localBackers, pct);

  // All three states share the EXACT same outer skeleton to prevent height shifts:
  // [divider] [top row] [divider] [bottom row] [divider]
  // "done" fills the bottom row with a minimal placeholder so height stays constant.

  const topRow = (
    <div className="px-3 py-1.5 flex items-center justify-between">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {localBackers === 0 && step !== "done" ? (
          <>Demand Strength: —</>
        ) : (
          <span className={v.tier === "resolving" ? "opacity-50" : ""}>{v.label}</span>
        )}
      </p>
      <button
        onClick={() => onOpenComments(dreamId)}
        className="font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
      >
        {signalsLabel}
      </button>
    </div>
  );

  // Bottom row is fixed height — idle: two buttons, active: textarea+broadcast, done: summary+turn off
  const bottomRow = (
    <div className="px-3 py-2.5">
      {step === "idle" && (
        <div className="flex gap-2">
          <button
            onClick={() => handleVoteClick("signal")}
            className="flex-1 py-2 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[13px] font-bold tracking-[0.15em] text-muted-foreground transition-colors"
          >
            Signal
          </button>
          <button
            onClick={() => handleVoteClick("bypass")}
            className="flex-1 py-2 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] text-[13px] font-bold tracking-[0.15em] text-muted-foreground transition-colors"
          >
            Bypass
          </button>
        </div>
      )}

      {step === "active" && (
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={contextNote}
            onChange={e => { if (e.target.value.length <= 280) setContextNote(e.target.value); }}
            placeholder={chosenType === "bypass" ? "Have a better idea?" : "Why does the FMLY need this?"}
            rows={2}
            style={{ resize: "none", overflow: "hidden" }}
            onInput={e => {
              const el = e.currentTarget;
              // Only grow beyond the 2-row default if user has typed enough
              el.style.height = "auto";
              el.style.height = Math.max(el.scrollHeight, 40) + "px";
            }}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none leading-relaxed"
          />
          <div className="flex flex-col items-end justify-between shrink-0 gap-1">
            <button onClick={handleCancel} className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              ✕
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="text-[12px] font-bold uppercase tracking-[0.12em] bg-foreground text-background px-2.5 py-1 rounded-md disabled:opacity-80 transition-opacity whitespace-nowrap"
            >
              {submitting ? "..." : "BROADCAST"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex items-center justify-between">
          <p className="font-sans text-[13px] leading-relaxed text-muted-foreground/50 flex-1 pr-3">
            {v.summary}
          </p>
          <button
            onClick={handleRemoveSignal}
            className="text-muted-foreground/30 hover:text-muted-foreground transition-colors text-[10px] font-mono shrink-0"
          >
            Turn Off Signal
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {divider}
      {topRow}
      {divider}
      {bottomRow}
      {divider}
    </div>
  );
}
