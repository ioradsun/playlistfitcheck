import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

type SignalStep = "idle" | "compose" | "done";




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
  const [alreadyChecked, setAlreadyChecked] = useState(false);
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
      setAlreadyChecked(true);
    };
    checkExisting();
  }, [dreamId, user, sessionId]);

  useEffect(() => {
    setLocalBackers(backersCount);
    setLocalGreenlight(greenlightCount);
  }, [backersCount, greenlightCount]);

  useEffect(() => {
    if (step === "compose") setTimeout(() => textareaRef.current?.focus(), 50);
  }, [step]);

  const pct = localBackers > 0 ? Math.round((localGreenlight / localBackers) * 100) : 0;
  const hasSignals = localGreenlight > 0;
  const bigDisplay = hasSignals ? `${pct}%` : "CALIBRATING";

  const handleVoteClick = (type: "signal" | "bypass") => {
    setChosenType(type);
    setStep("compose");
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
    // no onRefresh — avoids full list re-render
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
      setContextNote("");
      setStep("done");
      // no onRefresh — avoids full list re-render
    }
    setSubmitting(false);
  };

  const handleContextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!alreadyChecked) return null;

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="animate-fade-in">
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        <div className="px-3 py-2 space-y-0.5">
          {/* Top row: display (left) + Turn Off Signal (right) */}
          <div className="flex items-center justify-between">
            <p className={`font-mono text-[11px] uppercase tracking-widest text-muted-foreground ${!hasSignals ? "animate-signal-pulse" : ""}`}>
              {bigDisplay}
            </p>
            <button
              onClick={handleRemoveSignal}
              className="font-mono text-[11px] text-muted-foreground/30 hover:text-destructive transition-colors"
            >
              Turn Off Signal
            </button>
          </div>
          {/* Bottom row: meta (left) + open comments (right) */}
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">
              {hasSignals ? `BUILD FIT · ${localGreenlight} OF ${localBackers} FMLY MEMBERS` : "WAITING FOR INPUT"}
            </p>
            <button
              onClick={() => onOpenComments(dreamId)}
              className="font-mono text-[11px] tracking-widest text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              View All
            </button>
          </div>
        </div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      </div>
    );
  }

  // ── Idle: Signal / Bypass buttons ────────────────────────────────────────────
  if (step === "idle") {
    return (
      <div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
        <div className="flex gap-2 px-3 py-2.5">
          {/* Control Tier: 13px, font-bold, tracking-[0.15em], border-border/40 */}
          <button
            onClick={() => handleVoteClick("signal")}
            className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">Signal</span>
          </button>
          <button
            onClick={() => handleVoteClick("bypass")}
            className="flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg border border-border/40 bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all duration-[120ms]"
          >
            <span className="text-[13px] leading-none font-bold tracking-[0.15em] text-muted-foreground">Bypass</span>
          </button>
        </div>
        <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      </div>
    );
  }

  // ── Compose: textarea + broadcast ────────────────────────────────────────────
  return (
    <div>
      <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
      <div className="px-3 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          {/* Metadata Tier: 11px, tracking-wide, muted */}
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide uppercase">
            {chosenType === "bypass" ? "Have a better idea?" : "Why does the FMLY need this?"}
          </p>
          {/* Metadata Tier: 11px, muted/40 */}
          <button
            onClick={handleCancel}
            className="font-mono text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors leading-none"
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>
        <div className="flex items-end gap-2">
          {/* Content Tier: text-sm (14px), text-foreground, placeholder muted/35 */}
          <textarea
            ref={textareaRef}
            value={contextNote}
            onChange={e => { if (e.target.value.length <= 280) setContextNote(e.target.value); }}
            onKeyDown={handleContextKeyDown}
            placeholder="Optional but helpful..."
            rows={2}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/35 outline-none resize-none leading-relaxed"
          />
          {/* Control Tier: 13px, font-bold, tracking-[0.15em], bg-foreground, text-background */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="shrink-0 text-[13px] font-bold uppercase tracking-[0.15em] bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {submitting ? "..." : "BROADCAST"}
          </button>
        </div>
        {/* Metadata Tier: 11px char count */}
        <p className={`font-mono text-[11px] text-right transition-opacity ${contextNote.length === 0 ? "opacity-0" : contextNote.length >= 280 ? "text-destructive" : "text-muted-foreground/40"}`}>
          {contextNote.length}/280
        </p>
      </div>
      <div style={{ borderTopWidth: "0.5px" }} className="border-border/30" />
    </div>
  );
}
