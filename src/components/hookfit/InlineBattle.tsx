/**
 * InlineBattle — Renders a hook battle directly in the feed using canvas.
 * Voting state is lifted to the parent via onVoteChange callback.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useHookCanvas, HOOK_COLUMNS, type HookData } from "@/hooks/useHookCanvas";
import type { ConstellationNode } from "@/hooks/useHookCanvas";
import { getSessionId } from "@/lib/sessionId";

export interface BattleState {
  hookA: HookData | null;
  hookB: HookData | null;
  activeHookSide: "a" | "b";
  votedHookId: string | null;
  voteCountA: number;
  voteCountB: number;
  tappedSides: Set<"a" | "b">;
}

interface Props {
  battleId: string;
  visible?: boolean;
  onBattleState?: (state: BattleState) => void;
  /** External trigger to restart the active side */
  restartSignal?: number;
}

export function InlineBattle({ battleId, visible = true, onBattleState, restartSignal }: Props) {
  const [hookA, setHookA] = useState<HookData | null>(null);
  const [hookB, setHookB] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeHookSide, setActiveHookSide] = useState<"a" | "b">("a");
  const [tappedSides, setTappedSides] = useState<Set<"a" | "b">>(new Set());
  const [votedHookId, setVotedHookId] = useState<string | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const userIdRef = useRef<string | null | undefined>(undefined);

  const canvasRefA = useRef<HTMLCanvasElement>(null);
  const containerRefA = useRef<HTMLDivElement>(null);
  const canvasRefB = useRef<HTMLCanvasElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);
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

  // ── Lift state to parent ──────────────────────────────────────────────

  useEffect(() => {
    onBattleState?.({ hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides });
  }, [hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides]);

  // ── Canvas engines ────────────────────────────────────────────────────

  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    visible && (!hookB || activeHookSide === "a"),
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    visible && !!hookB && activeHookSide === "b",
  );

  // ── Auto-pause when not visible ─────────────────────────────────────

  useEffect(() => {
    if (!visible) {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
    }
  }, [visible]);

  // ── External restart signal ─────────────────────────────────────────

  useEffect(() => {
    if (!restartSignal) return;
    if (activeHookSide === "a") hookACanvas.restart();
    else hookBCanvas.restart();
  }, [restartSignal]);

  // ── Vote handler (exposed via ref or can be called from parent) ─────

  // Expose vote handler for parent to call
  const handleVote = useCallback(async (hookId: string) => {
    if (!hookA?.battle_id) return;
    const sessionId = getSessionId();
    const isA = hookId === hookA.id;
    if (votedHookId === hookId) return;

    if (votedHookId) {
      if (votedHookId === hookA.id) setVoteCountA(v => Math.max(0, v - 1));
      else setVoteCountB(v => Math.max(0, v - 1));
    }
    if (isA) setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setVotedHookId(hookId);

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

  // Make handleVote accessible to parent
  useEffect(() => {
    (window as any).__hookfit_vote_handlers = (window as any).__hookfit_vote_handlers || {};
    (window as any).__hookfit_vote_handlers[battleId] = handleVote;
    return () => { delete (window as any).__hookfit_vote_handlers?.[battleId]; };
  }, [battleId, handleVote]);

  // ── Derived ─────────────────────────────────────────────────────────

  const isBattle = !!(hookA && hookB);

  if (loading || !hookA) {
    return (
      <div className="w-full bg-black/30 animate-pulse" style={{ height: "300px" }}>
        <div className="flex h-full gap-1 p-1">
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  const bgBase = hookA?.artist_dna?.palette?.background_base || "#0a0a0a";

  // ── Single hook ─────────────────────────────────────────────────────

  if (!isBattle) {
    return (
      <div className="w-full relative" style={{ height: "300px", background: bgBase }}>
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

  // ── Battle mode — canvas only, no bottom panel ────────────────────────

  return (
    <div className="w-full relative flex flex-col" style={{ height: "300px", background: bgBase }}>
      {/* Split canvases */}
      <div className="flex-1 flex flex-row gap-1 px-1 pt-1 min-h-0">
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
              {hookA.hook_label || "Hook A"}
            </p>
          </div>
          {votedHookId === hookA.id && (
            <div className="absolute top-2 right-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full" style={{ color: '#39FF14', background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.15)' }}>
                HOOKED
              </span>
            </div>
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
              {hookB.hook_label || "Hook B"}
            </p>
          </div>
          {votedHookId === hookB.id && (
            <div className="absolute top-2 right-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full" style={{ color: '#39FF14', background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.15)' }}>
                HOOKED
              </span>
            </div>
          )}
        </motion.div>
      </div>

      {/* Minimal "tap to hear" hint — only when neither side tapped */}
      {tappedSides.size === 0 && (
        <div className="px-3 py-1.5 text-center shrink-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">
            Tap each side to hear
          </p>
        </div>
      )}
    </div>
  );
}