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
    setLocalBackers(c => Math.max(c - 1, 0));
    if (chosenType === "signal") setLocalGreenlight(c => Math.max(c - 1, 0));
    setChosenType(null);
    setStep("idle");
    onRefresh();
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
      setLocalBackers(c => c + 1);
      if (signalType === "greenlight") setLocalGreenlight(c => c + 1);
      setSubmitting(false);
      setStep("done");
      onRefresh();
    } else {
      setSubmitting(false);
    }
  };

  const divider = <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />;

  // ── Done ─────────────────────────────────────────────────────
  if (step === "done") {
    const pct = localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;
    const v = getSignalVerbiage(localBackers, pct);
    return (
      <div>
        {divider}
        <div className="px-3 py-2 flex items-start justify-between gap-3 animate-fade-in">
          <div className="flex-1 space-y-0.5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className={v.tier === "resolving" ? "opacity-50" : ""}>{v.label}</span>
            </p>
            <p className="font-sans text-[13px] leading-relaxed text-muted-foreground/50">{v.summary}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button onClick={() => onOpenComments(dreamId)} className="font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              {signalsLabel}
            </button>
            <button onClick={handleRemoveSignal} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors text-[10px] font-mono">
              Turn Off Signal
            </button>
          </div>
        </div>
        {divider}
      </div>
    );
  }

  // ── Idle + Active: same outer shell, content swaps with opacity ──
  return (
    <div>
      {divider}

      {/* Single action zone — height stays constant across idle↔active */}
      <div className="px-3 py-2.5 min-h-[3.5rem]">

        {/* IDLE: Signal / Bypass buttons */}
        <div
          className="flex gap-2 transition-opacity duration-150"
          style={{ opacity: step === "idle" ? 1 : 0, pointerEvents: step === "idle" ? "auto" : "none", position: step === "active" ? "absolute" : "relative" }}
        >
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

        {/* ACTIVE: textarea + BROADCAST */}
        {step === "active" && (
          <div className="flex flex-col gap-2 animate-fade-in">
            <div className="flex items-start gap-2">
              <textarea
                ref={textareaRef}
                value={contextNote}
                onChange={e => { if (e.target.value.length <= 280) setContextNote(e.target.value); }}
                placeholder={chosenType === "bypass" ? "Have a better idea?" : "Why does the FMLY need this?"}
                rows={2}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 outline-none resize-none leading-relaxed"
              />
              <button onClick={handleCancel} className="shrink-0 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-0.5">
                ✕
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground/40">{contextNote.length}/280</span>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="shrink-0 text-[13px] font-bold uppercase tracking-[0.15em] bg-foreground text-background px-3 py-1.5 rounded-md disabled:opacity-80 transition-opacity"
              >
                {submitting ? "BROADCASTING..." : "BROADCAST"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status row — always visible below, fades on active */}
      <div
        className="transition-opacity duration-150"
        style={{ opacity: step === "active" ? 0 : 1, pointerEvents: step === "active" ? "none" : "auto" }}
      >
        {divider}
        <div className="px-3 py-1.5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {localBackers === 0 ? (
              <>Demand Strength: —</>
            ) : (() => {
              const v = getSignalVerbiage(localBackers, demandStrength);
              return <span className={v.tier === "resolving" ? "opacity-50" : ""}>{v.label}</span>;
            })()}
            {" · "}
            <button onClick={() => onOpenComments(dreamId)} className="hover:text-foreground transition-colors">
              {signalsLabel}
            </button>
          </p>
        </div>
      </div>

      {divider}
    </div>
  );
}
