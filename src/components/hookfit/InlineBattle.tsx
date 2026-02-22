/**
 * InlineBattle — Renders a hook battle directly in the feed using canvas.
 * Includes an HTML playbar below the canvas with progress + vote button.
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
  handleVote: (hookId: string) => void;
  accentColor: string;
}

interface Props {
  battleId: string;
  visible?: boolean;
  onBattleState?: (state: BattleState) => void;
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
  const [progress, setProgress] = useState(0);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const progressRafRef = useRef<number>(0);

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

  // ── Vote handler (declared before lift so BattleState can reference it) ──

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

  // ── Lift state to parent ──────────────────────────────────────────────

  useEffect(() => {
    onBattleState?.({ hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote, accentColor: hookA?.palette?.[1] || "#a855f7" });
  }, [hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote]);

  // ── Canvas engines — auto-alternate on end ─────────────────────────

  const switchToB = useCallback(() => {
    if (!hookB) return;
    setActiveHookSide("b");
    setTappedSides(prev => new Set(prev).add("b"));
  }, [hookB]);

  const switchToA = useCallback(() => {
    setActiveHookSide("a");
    setTappedSides(prev => new Set(prev).add("a"));
  }, []);

  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    visible && (!hookB || activeHookSide === "a"),
    hookB ? switchToB : undefined,
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    visible && !!hookB && activeHookSide === "b",
    switchToA,
  );

  // When side auto-switches, unmute active and restart (only after user has tapped)
  const prevSideRef = useRef(activeHookSide);
  useEffect(() => {
    if (prevSideRef.current === activeHookSide) return;
    prevSideRef.current = activeHookSide;
    // Only auto-switch audio if user has already interacted
    if (tappedSides.size === 0) return;
    if (activeHookSide === "a") {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
      hookACanvas.restart();
    } else {
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      hookBCanvas.restart();
    }
  }, [activeHookSide]);

  // ── Sync progress from active engine to HTML bar ────────────────────

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const activeCanvas = activeHookSide === "a" ? hookACanvas : hookBCanvas;
      setProgress(activeCanvas.progressRef.current);
      progressRafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; cancelAnimationFrame(progressRafRef.current); };
  }, [activeHookSide, hookACanvas, hookBCanvas]);

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


  // ── Derived ─────────────────────────────────────────────────────────

  const isBattle = !!(hookA && hookB);
  const activeLabel = activeHookSide === "a"
    ? (hookA?.hook_label || "Hook A")
    : (hookB?.hook_label || "Hook B");
  const accentColor = hookA?.palette?.[1] || "#a855f7";

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
      <div className="w-full" style={{ background: bgBase }}>
        <div className="relative" style={{ height: "300px" }}>
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
        </div>
        {/* Playbar */}
        <div className="relative h-8" style={{ background: bgBase }}>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.06]">
            <div className="h-full transition-none" style={{ width: `${progress * 100}%`, background: accentColor, opacity: 0.7 }} />
          </div>
          <div className="flex items-center justify-between px-3 h-full">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 truncate">
              {hookA.hook_label || hookA.hook_phrase}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Battle mode ───────────────────────────────────────────────────────

  return (
    <div className="w-full" style={{ background: bgBase }}>
      {/* Split canvases */}
      <div className="flex flex-row gap-1 px-1 pt-1" style={{ height: "300px" }}>
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
        </motion.div>
      </div>

      {/* ── HTML Playbar ─────────────────────────────────────────────── */}
      <div className="relative" style={{ background: bgBase }}>
        {/* Progress track — spans only the active side's half */}
        <div className="h-[2px] bg-white/[0.06] flex">
          {activeHookSide === "a" ? (
            <>
              <div className="w-1/2 relative">
                <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: accentColor, opacity: 0.7 }} />
              </div>
              <div className="w-1/2" />
            </>
          ) : (
            <>
              <div className="w-1/2" />
              <div className="w-1/2 relative">
                <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: accentColor, opacity: 0.7 }} />
              </div>
            </>
          )}
        </div>

        {/* Controls row — label only */}
        <div className="flex items-center px-3 py-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 truncate">
            {activeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}