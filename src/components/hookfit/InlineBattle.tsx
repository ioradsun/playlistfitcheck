/**
 * InlineBattle — Renders a hook battle directly in the feed using canvas.
 * Includes an HTML playbar below the canvas with progress + vote button.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
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
  handleUnvote: () => void;
  accentColor: string;
  isMuted: boolean;
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
  const [isMuted, setIsMuted] = useState(true);
  const [recentMuteAction, setRecentMuteAction] = useState(false);
  const userMutedRef = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const progressRafRef = useRef<number>(0);
  const muteActionTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  // ── Vote handler ──

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

  // ── Unvote handler ──
  const handleUnvote = useCallback(async () => {
    if (!hookA?.battle_id || !votedHookId) return;
    const sessionId = getSessionId();
    if (votedHookId === hookA.id) setVoteCountA(v => Math.max(0, v - 1));
    else setVoteCountB(v => Math.max(0, v - 1));
    setVotedHookId(null);
    await supabase
      .from("hook_votes" as any)
      .delete()
      .eq("battle_id", hookA.battle_id)
      .eq("session_id", sessionId);
  }, [hookA, votedHookId]);

  // ── Lift state to parent ──────────────────────────────────────────────

  useEffect(() => {
    onBattleState?.({ hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote, handleUnvote, accentColor: hookA?.palette?.[1] || "#a855f7", isMuted });
  }, [hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote, handleUnvote, isMuted]);

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

  // Both canvases always play when visible (simultaneous playback)
  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    visible,
    hookB ? switchToB : undefined,
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    visible && !!hookB,
    switchToA,
  );

  // When side auto-switches, restart canvas and handle audio
  const prevSideRef = useRef(activeHookSide);
  useEffect(() => {
    if (prevSideRef.current === activeHookSide) return;
    prevSideRef.current = activeHookSide;
    if (userMutedRef.current || isMuted) {
      // Muted — just restart the visual, keep all audio muted
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
      if (activeHookSide === "a") hookACanvas.restart();
      else hookBCanvas.restart();
      return;
    }
    // Unmuted — switch audio to the new active side
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
      setIsMuted(true);
    }
  }, [visible]);

  // ── Mute all on unmount (route change) ──────────────────────────────

  useEffect(() => {
    return () => {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
      clearTimeout(muteActionTimerRef.current);
    };
  }, []);

  // ── External restart signal ─────────────────────────────────────────

  useEffect(() => {
    if (!restartSignal) return;
    if (activeHookSide === "a") hookACanvas.restart();
    else hookBCanvas.restart();
  }, [restartSignal]);

  // ── Mute flash helper ─────────────────────────────────────────────────
  const flashMuteIcon = useCallback(() => {
    setRecentMuteAction(true);
    clearTimeout(muteActionTimerRef.current);
    muteActionTimerRef.current = setTimeout(() => setRecentMuteAction(false), 1500);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────

  const isBattle = !!(hookA && hookB);
  const accentColor = hookA?.palette?.[1] || "#a855f7";
  const MuteIcon = isMuted ? VolumeX : Volume2;

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
        <div className="h-[2px] bg-white/[0.06]">
          {!isMuted && (
            <div className="h-full transition-none" style={{ width: `${progress * 100}%`, background: accentColor, opacity: 0.7 }} />
          )}
        </div>
      </div>
    );
  }

  // ── Battle mode ───────────────────────────────────────────────────────

  return (
    <div className="w-full" style={{ background: bgBase }}>
      {/* Split canvases */}
      <div className="relative flex flex-row" style={{ height: "300px" }}>
        {/* Hook A */}
        <motion.div
          className="relative flex-1 cursor-pointer overflow-hidden"
          animate={{ opacity: activeHookSide !== "a" ? 0.6 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            if (activeHookSide === "a") return;
            setActiveHookSide("a");
            setTappedSides(prev => new Set(prev).add("a"));
            if (!isMuted) {
              if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
              if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
            }
            hookACanvas.restart();
          }}
        >
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
          {(isMuted || activeHookSide !== "a") && (
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          )}
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-white/50 drop-shadow-md">
              {hookA?.hook_label || "Hook A"}
            </span>
          </div>
        </motion.div>

        {/* 1px vertical seam */}
        <div className="w-px bg-white/10 shrink-0" />

        {/* Hook B */}
        <motion.div
          className="relative flex-1 cursor-pointer overflow-hidden"
          animate={{ opacity: activeHookSide !== "b" ? 0.6 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            if (activeHookSide === "b") return;
            setActiveHookSide("b");
            setTappedSides(prev => new Set(prev).add("b"));
            if (!isMuted) {
              if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
              if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
            }
            hookBCanvas.restart();
          }}
        >
          <div ref={containerRefB} className="absolute inset-0">
            <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
          </div>
          {(isMuted || activeHookSide !== "b") && (
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          )}
          <div className="absolute bottom-2 left-2 pointer-events-none">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-white/50 drop-shadow-md">
              {hookB?.hook_label || "Hook B"}
            </span>
          </div>
        </motion.div>

        {/* Centered "Tap to unmute" across both videos */}
        {isMuted && (
          <div
            className="absolute inset-0 flex items-center justify-center z-20 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              userMutedRef.current = false;
              setIsMuted(false);
              // Unmute the active side
              if (activeHookSide === "a" && hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
              if (activeHookSide === "b" && hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
              setTappedSides(prev => new Set(prev).add(activeHookSide));
            }}
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/30">
              Tap to unmute
            </span>
          </div>
        )}
      </div>

      {/* ── Playbar — progress + mute control ──────────────────────── */}
      <div className="relative h-6 bg-white/[0.03] flex items-center">
        {/* Progress track */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-white/[0.06] flex">
          {!isMuted && (
            activeHookSide === "a" ? (
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
            )
          )}
        </div>
        {/* Mute/Unmute button */}
        <button
          onClick={() => {
            const nowMuted = !isMuted;
            userMutedRef.current = nowMuted;
            setIsMuted(nowMuted);
            if (nowMuted) {
              if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
              if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
            } else {
              // Unmute the active side only
              if (activeHookSide === "a" && hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
              if (activeHookSide === "b" && hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
              setTappedSides(prev => new Set(prev).add(activeHookSide));
            }
          }}
          className="ml-2 p-1 text-white/40 hover:text-white/70 transition-colors"
        >
          <MuteIcon size={14} />
        </button>
      </div>
    </div>
  );
}
