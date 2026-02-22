/**
 * InlineBattle — Renders a hook battle directly in the feed using canvas,
 * eliminating the iframe bootstrap overhead (~2.5MB per card).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useHookCanvas, HOOK_COLUMNS, type HookData } from "@/hooks/useHookCanvas";
import type { ConstellationNode } from "@/hooks/useHookCanvas";
import { getSessionId } from "@/lib/sessionId";

interface Props {
  battleId: string;
  /** When false the engines keep running but audio is muted */
  visible?: boolean;
}

export function InlineBattle({ battleId, visible = true }: Props) {
  const [hookA, setHookA] = useState<HookData | null>(null);
  const [hookB, setHookB] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);

  // Battle interaction state
  const [activeHookSide, setActiveHookSide] = useState<"a" | "b">("a");
  const [tappedSides, setTappedSides] = useState<Set<"a" | "b">>(new Set());
  const [votedHookId, setVotedHookId] = useState<string | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const userIdRef = useRef<string | null | undefined>(undefined);

  // Canvas refs
  const canvasRefA = useRef<HTMLCanvasElement>(null);
  const containerRefA = useRef<HTMLDivElement>(null);
  const canvasRefB = useRef<HTMLCanvasElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);

  // Empty constellation refs (no comments in feed view)
  const constellationRefA = useRef<ConstellationNode[]>([]);
  const riverOffsetsRefA = useRef<number[]>([0, 0, 0, 0]);
  const constellationRefB = useRef<ConstellationNode[]>([]);
  const riverOffsetsRefB = useRef<number[]>([0, 0, 0, 0]);

  // ── Fetch battle data ───────────────────────────────────────────────────

  useEffect(() => {
    if (!battleId) return;
    setLoading(true);

    supabase
      .from("shareable_hooks" as any)
      .select(HOOK_COLUMNS)
      .eq("battle_id", battleId)
      .order("battle_position", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setLoading(false);
          return;
        }
        const hooks = data as any as HookData[];
        const a = hooks.find(h => h.battle_position === 1) || hooks[0];
        const b = hooks.find(h => h.id !== a.id) || null;
        setHookA(a);
        setHookB(b);
        setVoteCountA(a.vote_count || 0);
        if (b) setVoteCountB(b.vote_count || 0);
        setLoading(false);

        // Check existing vote in background
        const sessionId = getSessionId();
        supabase
          .from("hook_votes" as any)
          .select("hook_id")
          .eq("battle_id", battleId)
          .eq("session_id", sessionId)
          .maybeSingle()
          .then(({ data: vote }) => {
            if (vote) setVotedHookId((vote as any).hook_id);
          });
      });
  }, [battleId]);

  // ── Canvas engines ────────────────────────────────────────────────────────

  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    visible && (!hookB || activeHookSide === "a"),
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    visible && !!hookB && activeHookSide === "b",
  );

  // ── Auto-pause when not visible ───────────────────────────────────────────

  useEffect(() => {
    if (!visible) {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
    }
  }, [visible]);

  // ── Vote handler ──────────────────────────────────────────────────────────

  const handleVote = useCallback(async (hookId: string) => {
    if (!hookA?.battle_id) return;
    const sessionId = getSessionId();
    const isA = hookId === hookA.id;
    if (votedHookId === hookId) return;

    // Optimistic: decrement old, increment new
    if (votedHookId) {
      if (votedHookId === hookA.id) setVoteCountA(v => Math.max(0, v - 1));
      else setVoteCountB(v => Math.max(0, v - 1));
    }
    if (isA) setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setVotedHookId(hookId);

    // Persist
    if (votedHookId) {
      await supabase
        .from("hook_votes" as any)
        .update({ hook_id: hookId })
        .eq("battle_id", hookA.battle_id)
        .eq("session_id", sessionId);
    } else {
      if (userIdRef.current === undefined) {
        const { data: { user } } = await supabase.auth.getUser();
        userIdRef.current = user?.id ?? null;
      }
      await supabase
        .from("hook_votes" as any)
        .insert({
          battle_id: hookA.battle_id,
          hook_id: hookId,
          user_id: userIdRef.current || null,
          session_id: sessionId,
        });
    }
  }, [hookA, hookB, votedHookId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const isBattle = !!(hookA && hookB);
  const hasVoted = !!votedHookId;
  const totalVotes = voteCountA + voteCountB;
  const hookALabel = hookA?.hook_label || "Hook A";
  const hookBLabel = hookB?.hook_label || "Hook B";
  const votedA = votedHookId === hookA?.id;
  const votedB = votedHookId === hookB?.id;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading || !hookA) {
    return (
      <div className="w-full bg-black/30 animate-pulse" style={{ height: "420px" }}>
        <div className="flex h-full gap-1 p-1">
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  const bgBase = hookA?.artist_dna?.palette?.background_base || "#0a0a0a";

  // ── Single hook (no rival) ────────────────────────────────────────────────

  if (!isBattle) {
    return (
      <div className="w-full relative" style={{ height: "420px", background: bgBase }}>
        <div ref={containerRefA} className="absolute inset-0">
          <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
          <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40 truncate">
            {hookA.hook_label || hookA.hook_phrase}
          </p>
        </div>
      </div>
    );
  }

  // ── Battle mode ───────────────────────────────────────────────────────────

  return (
    <div className="w-full relative flex flex-col" style={{ height: "420px", background: bgBase }}>
      {/* Header */}
      <div className="px-3 pt-2 pb-1 text-center z-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 truncate">
          {hookA.artist_name} × {hookA.song_name}
        </p>
      </div>

      {/* Split canvases */}
      <div className="flex-1 flex flex-row gap-1 px-1 min-h-0">
        {/* Hook A */}
        <motion.div
          className="relative flex-1 cursor-pointer rounded-lg overflow-hidden"
          animate={{ opacity: activeHookSide !== "a" ? 0.4 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            setActiveHookSide("a");
            setTappedSides(prev => new Set(prev).add("a"));
            if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
            if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
            hookACanvas.restart();
          }}
        >
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 truncate max-w-[100px]">
              {hookALabel}
            </p>
          </div>
          {votedA && (
            <motion.div
              initial={{ opacity: 0.4 }} animate={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 rounded-lg"
              style={{ border: `2px solid ${hookA.palette?.[1] || '#a855f7'}` }}
            />
          )}
        </motion.div>

        {/* Hook B */}
        <motion.div
          className="relative flex-1 cursor-pointer rounded-lg overflow-hidden"
          animate={{ opacity: activeHookSide !== "b" ? 0.4 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            setActiveHookSide("b");
            setTappedSides(prev => new Set(prev).add("b"));
            if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
            if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
            hookBCanvas.restart();
          }}
        >
          <div ref={containerRefB} className="absolute inset-0">
            <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 truncate max-w-[100px]">
              {hookBLabel}
            </p>
          </div>
          {votedB && (
            <motion.div
              initial={{ opacity: 0.4 }} animate={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 rounded-lg"
              style={{ border: `2px solid ${hookB.palette?.[1] || '#a855f7'}` }}
            />
          )}
        </motion.div>
      </div>

      {/* Bottom panel */}
      <div className="px-3 py-2 shrink-0" style={{ background: bgBase }}>
        <AnimatePresence mode="wait">
          {!hasVoted ? (
            <motion.div key="prevote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              {tappedSides.size === 0 ? (
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 py-1">
                  Tap each side to hear
                </p>
              ) : (
                <button
                  onClick={() => handleVote(activeHookSide === "a" ? hookA.id : hookB.id)}
                  className="px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors"
                >
                  {"I'M HOOKED ON " + (activeHookSide === "a" ? hookALabel : hookBLabel)}
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="voted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.3em]" style={{ color: 'rgba(57,255,20,0.45)' }}>
                {totalVotes <= 1 ? "Hooked" : `You + ${totalVotes - 1} fmly`}
              </p>
              {/* Allow switching vote */}
              {((activeHookSide === "a" && !votedA) || (activeHookSide === "b" && !votedB)) && (
                <button
                  onClick={() => handleVote(activeHookSide === "a" ? hookA.id : hookB.id)}
                  className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors"
                >
                  Switch to {activeHookSide === "a" ? hookALabel : hookBLabel}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
