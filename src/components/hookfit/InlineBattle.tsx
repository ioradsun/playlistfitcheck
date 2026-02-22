/**
 * InlineBattle — Controlled dual-canvas renderer for hook battles.
 * Parent (HookFitPostCard) drives all state: mode, audio, dimming, etc.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useHookCanvas, HOOK_COLUMNS, type HookData } from "@/hooks/useHookCanvas";
import type { ConstellationNode } from "@/hooks/useHookCanvas";

export type BattleMode =
  | "dark"        // STATE 1: both dimmed, silent
  | "listen-a"    // STATE 2 phase 1: A active, B dimmed
  | "listen-b"    // STATE 2 phase 2: B active, A dimmed
  | "judgment"    // STATE 3: both dim, looping silently
  | "scorecard"   // STATE 4: winner loops, loser frozen
  | "results";    // STATE 5: same as scorecard visually

interface Props {
  battleId: string;
  mode: BattleMode;
  votedSide?: "a" | "b" | null;
  onHookEnd?: (side: "a" | "b") => void;
  onHooksLoaded?: (hookA: HookData, hookB: HookData | null) => void;
  onTileTap?: (side: "a" | "b") => void;
  activePlaying?: "a" | "b" | null;
}

export function InlineBattle({
  battleId, mode, votedSide, onHookEnd, onHooksLoaded,
  onTileTap, activePlaying,
}: Props) {
  const [hookA, setHookA] = useState<HookData | null>(null);
  const [hookB, setHookB] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);

  const canvasRefA = useRef<HTMLCanvasElement>(null);
  const containerRefA = useRef<HTMLDivElement>(null);
  const canvasRefB = useRef<HTMLCanvasElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);
  const constellationRefA = useRef<ConstellationNode[]>([]);
  const riverOffsetsRefA = useRef<number[]>([0, 0, 0, 0]);
  const constellationRefB = useRef<ConstellationNode[]>([]);
  const riverOffsetsRefB = useRef<number[]>([0, 0, 0, 0]);

  // ── Fetch battle hooks ──────────────────────────────────────────
  useEffect(() => {
    if (!battleId) return;
    setLoading(true);
    supabase
      .from("shareable_hooks" as any)
      .select(HOOK_COLUMNS)
      .eq("battle_id", battleId)
      .order("battle_position", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) { setLoading(false); return; }
        const hooks = data as any as HookData[];
        const a = hooks.find(h => h.battle_position === 1) || hooks[0];
        const b = hooks.find(h => h.id !== a.id) || null;
        setHookA(a);
        setHookB(b);
        setLoading(false);
        onHooksLoaded?.(a, b);
      });
  }, [battleId]);

  // ── Canvas engines ──────────────────────────────────────────────
  const isActive = mode !== "dark";

  const handleEndA = useCallback(() => onHookEnd?.("a"), [onHookEnd]);
  const handleEndB = useCallback(() => onHookEnd?.("b"), [onHookEnd]);

  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    isActive, handleEndA,
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    isActive && !!hookB, handleEndB,
  );

  // ── Audio control based on mode ────────────────────────────────
  useEffect(() => {
    const audioA = hookACanvas.audioRef.current;
    const audioB = hookBCanvas.audioRef.current;

    switch (mode) {
      case "dark":
      case "judgment":
      case "scorecard":
      case "results":
        if (audioA) audioA.muted = true;
        if (audioB) audioB.muted = true;
        break;
      case "listen-a":
        if (audioA) audioA.muted = false;
        if (audioB) audioB.muted = true;
        hookACanvas.restart();
        break;
      case "listen-b":
        if (audioB) audioB.muted = false;
        if (audioA) audioA.muted = true;
        hookBCanvas.restart();
        break;
    }
  }, [mode]);

  // ── Active playing control (scorecard/results tap-to-play) ───
  useEffect(() => {
    if (mode !== "scorecard" && mode !== "results") return;
    const audioA = hookACanvas.audioRef.current;
    const audioB = hookBCanvas.audioRef.current;
    if (activePlaying === "a") {
      if (audioA) audioA.muted = false;
      if (audioB) audioB.muted = true;
      hookACanvas.restart();
    } else if (activePlaying === "b") {
      if (audioB) audioB.muted = false;
      if (audioA) audioA.muted = true;
      hookBCanvas.restart();
    } else {
      if (audioA) audioA.muted = true;
      if (audioB) audioB.muted = true;
    }
  }, [activePlaying, mode]);

  // ── Progress bar state (must be before early returns) ────────
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef(0);

  const showProgress = mode === "listen-a" || mode === "listen-b" || ((mode === "scorecard" || mode === "results") && !!activePlaying);
  const activeCanvas = activePlaying === "b" ? hookBCanvas : (mode === "listen-b" ? hookBCanvas : hookACanvas);

  useEffect(() => {
    if (!showProgress) { setProgress(0); return; }
    let running = true;
    const tick = () => {
      if (!running) return;
      setProgress(activeCanvas.progressRef.current);
      progressRafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; cancelAnimationFrame(progressRafRef.current); };
  }, [showProgress, activeCanvas]);

  // ── Mute all on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hookACanvas.audioRef.current) hookACanvas.audioRef.current.muted = true;
      if (hookBCanvas.audioRef.current) hookBCanvas.audioRef.current.muted = true;
    };
  }, []);

  // ── Derived ────────────────────────────────────────────────────
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

  if (!hookB) {
    return (
      <div className="w-full" style={{ background: hookA?.artist_dna?.palette?.background_base || "#0a0a0a" }}>
        <div className="relative" style={{ height: "300px" }}>
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
        </div>
      </div>
    );
  }

  const getOpacity = (side: "a" | "b") => {
    switch (mode) {
      case "dark": return 0.2;
      case "listen-a": return side === "a" ? 1 : 0.4;
      case "listen-b": return side === "b" ? 1 : 0.4;
      case "judgment": return 0.7;
      case "scorecard":
      case "results":
        if (!votedSide) return 0.7;
        return side === votedSide ? 1 : 0.4;
      default: return 1;
    }
  };

  const getBorderStyle = (side: "a" | "b"): React.CSSProperties => {
    if ((mode !== "scorecard" && mode !== "results") || !votedSide) return {};
    if (side !== votedSide) return {};
    const palette = side === "a" ? hookA?.palette : hookB?.palette;
    const color = (palette as any)?.[0] || "#ffffff";
    return { boxShadow: `inset 0 0 0 2px ${color}` };
  };

  const getSeamColor = () => {
    switch (mode) {
      case "listen-a": return hookA?.palette?.[0] || "#ffffff";
      case "listen-b": return hookB?.palette?.[0] || "#ffffff";
      default: return "rgba(255,255,255,0.1)";
    }
  };

  const seamPulse = mode === "listen-a" || mode === "listen-b";
  const bgBase = hookA?.artist_dna?.palette?.background_base || "#0a0a0a";

  return (
    <div className="w-full" style={{ background: bgBase }}>
      <div className="relative flex flex-row" style={{ height: "300px" }}>
        {/* Hook A */}
        <motion.div
          className="relative flex-1 overflow-hidden cursor-pointer"
          style={getBorderStyle("a")}
          animate={{ opacity: getOpacity("a") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("a")}
        >
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
        </motion.div>

        {/* Seam */}
        <motion.div
          className="w-px shrink-0"
          animate={{
            backgroundColor: getSeamColor(),
            opacity: seamPulse ? [0.4, 1, 0.4] : 1,
          }}
          transition={seamPulse ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        />

        {/* Hook B */}
        <motion.div
          className="relative flex-1 overflow-hidden cursor-pointer"
          style={getBorderStyle("b")}
          animate={{ opacity: getOpacity("b") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("b")}
        >
          <div ref={containerRefB} className="absolute inset-0">
            <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
          </div>
        </motion.div>
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div className="h-1 bg-white/[0.06] flex">
          {(mode === "listen-a" || activePlaying === "a") ? (
            <>
              <div className="w-1/2 relative">
                <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: hookA?.palette?.[0] || "#fff", opacity: 0.85 }} />
              </div>
              <div className="w-1/2" />
            </>
          ) : (
            <>
              <div className="w-1/2" />
              <div className="w-1/2 relative">
                <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: hookB?.palette?.[0] || "#fff", opacity: 0.85 }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
