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

  // ── Lift state to parent ──────────────────────────────────────────────

  useEffect(() => {
    onBattleState?.({ hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote, accentColor: hookA?.palette?.[1] || "#a855f7", isMuted });
  }, [hookA, hookB, activeHookSide, votedHookId, voteCountA, voteCountB, tappedSides, handleVote, isMuted]);

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

  // When side auto-switches, restart canvas — respect userMuted
  const prevSideRef = useRef(activeHookSide);
  useEffect(() => {
    if (prevSideRef.current === activeHookSide) return;
    prevSideRef.current = activeHookSide;
    if (tappedSides.size < 2) {
      if (activeHookSide === "a") hookACanvas.restart();
      else hookBCanvas.restart();
      return;
    }
    if (userMutedRef.current) {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
      if (activeHookSide === "a") hookACanvas.restart();
      else hookBCanvas.restart();
      return;
    }
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
      <div className="flex flex-row gap-1 px-1 pt-1" style={{ height: "300px" }}>
        {/* Hook A */}
        <motion.div
          className="relative flex-1 cursor-pointer rounded-lg overflow-hidden"
          animate={{ opacity: activeHookSide !== "a" ? 0.4 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            if (activeHookSide === "a" && tappedSides.has("a")) {
              const nowMuted = !hookACanvas.audioRef.current?.muted;
              if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = nowMuted;
              userMutedRef.current = nowMuted;
              setIsMuted(nowMuted);
              flashMuteIcon();
              return;
            }
            setActiveHookSide("a");
            setTappedSides(prev => new Set(prev).add("a"));
            if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = false;
            if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
            userMutedRef.current = false;
            setIsMuted(false);
            flashMuteIcon();
            hookACanvas.restart();
          }}
        >
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
          {/* Mask overlay — Hook A */}
          {!tappedSides.has("a") && (
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          )}
          {/* "Tap to unmute" instruction — only on left video before any interaction */}
          {tappedSides.size === 0 && (
            <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
              <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/50">
                Tap to unmute
              </span>
            </div>
          )}
          {/* Mute icon overlay — Hook A */}
          {activeHookSide === "a" && (
            <AnimatePresence>
              <motion.div
                key={`mute-a-${recentMuteAction}`}
                initial={{ opacity: recentMuteAction ? 0.8 : 0.2 }}
                animate={{ opacity: recentMuteAction ? 0.8 : 0.2 }}
                exit={{ opacity: 0.2 }}
                transition={{ duration: 0.6 }}
                className="absolute bottom-2 right-2 pointer-events-none"
              >
                <MuteIcon size={16} className="text-white drop-shadow-md" />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* Hook B */}
        <motion.div
          className="relative flex-1 cursor-pointer rounded-lg overflow-hidden"
          animate={{ opacity: activeHookSide !== "b" ? 0.4 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => {
            if (activeHookSide === "b" && tappedSides.has("b")) {
              const nowMuted = !hookBCanvas.audioRef.current?.muted;
              if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = nowMuted;
              userMutedRef.current = nowMuted;
              setIsMuted(nowMuted);
              flashMuteIcon();
              return;
            }
            setActiveHookSide("b");
            setTappedSides(prev => new Set(prev).add("b"));
            if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = false;
            if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
            userMutedRef.current = false;
            setIsMuted(false);
            flashMuteIcon();
            hookBCanvas.restart();
          }}
        >
          <div ref={containerRefB} className="absolute inset-0">
            <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
          </div>
          {/* Mask overlay — Hook B */}
          {!tappedSides.has("b") && (
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          )}
          {/* Mute icon overlay — Hook B */}
          {activeHookSide === "b" && (
            <AnimatePresence>
              <motion.div
                key={`mute-b-${recentMuteAction}`}
                initial={{ opacity: recentMuteAction ? 0.8 : 0.2 }}
                animate={{ opacity: recentMuteAction ? 0.8 : 0.2 }}
                exit={{ opacity: 0.2 }}
                transition={{ duration: 0.6 }}
                className="absolute bottom-2 right-2 pointer-events-none"
              >
                <MuteIcon size={16} className="text-white drop-shadow-md" />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </div>

      {/* ── HTML Playbar — progress only when audio playing ──────────── */}
      <div className="h-[2px] bg-white/[0.06] flex">
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
    </div>
  );
}
