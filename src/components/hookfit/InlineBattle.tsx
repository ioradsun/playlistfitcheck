/**
 * InlineBattle — Controlled dual-canvas renderer for hook battles.
 * Parent (HookFitPostCard) drives all state: mode, audio, dimming, etc.
 *
 * MASTER AUDIO RULE: `activePlaying` is the single source of truth.
 * If activePlaying === "a", A is unmuted and B is muted. Vice versa.
 * If activePlaying === null, both are muted. No other code path touches mute.
 */

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useHookCanvas, HOOK_COLUMNS, type HookData } from "@/hooks/useHookCanvas";
import type { ConstellationNode } from "@/hooks/useHookCanvas";

export type BattleMode =
  | "dark"        // STATE 1: both dimmed, silent
  | "listen-a"    // STATE 2 phase 1: A active, B dimmed
  | "listen-b"    // STATE 2 phase 2: B active, A dimmed
  | "judgment"    // STATE 3: both dim, looping silently
  | "scorecard"   // STATE 4: winner loops, loser dimmed
  | "results";    // STATE 5: same as scorecard visually

export interface InlineBattleHandle {
  constellationRefA: React.MutableRefObject<ConstellationNode[]>;
  constellationRefB: React.MutableRefObject<ConstellationNode[]>;
  riverOffsetsRefA: React.MutableRefObject<number[]>;
  riverOffsetsRefB: React.MutableRefObject<number[]>;
}

interface Props {
  battleId: string;
  mode: BattleMode;
  votedSide?: "a" | "b" | null;
  onHookEnd?: (side: "a" | "b") => void;
  onHooksLoaded?: (hookA: HookData, hookB: HookData | null) => void;
  onTileTap?: (side: "a" | "b") => void;
  /** Single source of truth for audio. Only this side plays. null = all muted. */
  activePlaying: "a" | "b" | null;
}

// ── Inversion rule ───────────────────────────────────────────────
// The right hook (B) gets an inverted palette and a contrasting physics system.
// Same artist identity, opposite emotional register.

const SYSTEM_PAIRS: Record<string, string> = {
  fracture: "breath",
  breath: "fracture",
  pressure: "orbit",
  orbit: "pressure",
  combustion: "glass",
  glass: "combustion",
  paper: "combustion",
};

/**
 * Parse an HSL string like "hsl(200, 70%, 40%)" into [h, s, l].
 * Falls back to null for non-HSL strings.
 */
function parseHSL(color: string): [number, number, number] | null {
  const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/i);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

function invertColor(color: string): string {
  const hsl = parseHSL(color);
  if (!hsl) {
    // Hex fallback — just return as-is, the contrast system will handle the feel
    return color;
  }
  const [h, s, l] = hsl;
  // Rotate hue 180°, invert lightness (light↔dark), keep saturation
  const newH = (h + 180) % 360;
  const newL = Math.max(10, Math.min(90, 100 - l));
  return `hsl(${Math.round(newH)}, ${Math.round(s)}%, ${Math.round(newL)}%)`;
}

function invertHookData(hook: HookData, sourceHook: HookData): HookData {
  // True palette inversion: rotate hue 180° and flip lightness for each color
  const palette = hook.palette.map(c => invertColor(c));

  // Contrasting physics system — use sourceHook's system to pick the opposite
  const contrastSystem = SYSTEM_PAIRS[sourceHook.system_type] || "breath";

  return {
    ...hook,
    palette,
    system_type: contrastSystem,
    // Preserve the original artist typography — font identity stays consistent
    font_system: hook.system_type,
  };
}

export const InlineBattle = forwardRef<InlineBattleHandle, Props>(function InlineBattle({
  battleId, mode, votedSide, onHookEnd, onHooksLoaded,
  onTileTap, activePlaying,
}, ref) {
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

  // Expose constellation refs to parent
  useImperativeHandle(ref, () => ({
    constellationRefA,
    constellationRefB,
    riverOffsetsRefA,
    riverOffsetsRefB,
  }), []);

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
        const rawB = hooks.find(h => h.id !== a.id) || null;
        // Apply inversion rule to hook B
        const b = rawB ? invertHookData(rawB, a) : null;
        setHookA(a);
        setHookB(b);
        setLoading(false);
        onHooksLoaded?.(a, b);
      });
  }, [battleId]);

  // ── Canvas engines ──────────────────────────────────────────────
  // When one side is actively playing audio, pause the other's animation
  const isActive = mode !== "dark";
  const aActive = isActive && (activePlaying === null || activePlaying === "a");
  const bActive = isActive && !!hookB && (activePlaying === null || activePlaying === "b");

  const handleEndA = useCallback(() => onHookEnd?.("a"), [onHookEnd]);
  const handleEndB = useCallback(() => onHookEnd?.("b"), [onHookEnd]);

  const hookACanvas = useHookCanvas(
    canvasRefA, containerRefA, hookA, constellationRefA, riverOffsetsRefA,
    aActive, handleEndA,
  );
  const hookBCanvas = useHookCanvas(
    canvasRefB, containerRefB, hookB, constellationRefB, riverOffsetsRefB,
    bActive, handleEndB,
  );

  // ── MASTER AUDIO RULE ──────────────────────────────────────────
  // activePlaying is the ONLY thing that controls mute state.
  // Parent is responsible for setting it correctly for all modes.
  const prevActiveRef = useRef<"a" | "b" | null>(null);

  useEffect(() => {
    const audioA = hookACanvas.audioRef.current;
    const audioB = hookBCanvas.audioRef.current;

    // Always enforce mute state from activePlaying
    if (audioA) audioA.muted = activePlaying !== "a";
    if (audioB) audioB.muted = activePlaying !== "b";

    // Pause the inactive side's audio entirely so it doesn't drift out of sync
    if (activePlaying === "a" && audioB) {
      audioB.pause();
    } else if (activePlaying === "b" && audioA) {
      audioA.pause();
    }

    // Restart the newly activated side (only when it changes)
    if (activePlaying && activePlaying !== prevActiveRef.current) {
      if (activePlaying === "a") hookACanvas.restart();
      if (activePlaying === "b") hookBCanvas.restart();
    }

    prevActiveRef.current = activePlaying;
  }, [activePlaying]);

  // ── Progress bar state (must be before early returns) ────────
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef(0);

  const showProgress = !!activePlaying;
  const activeCanvas = activePlaying === "b" ? hookBCanvas : hookACanvas;

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
    // Green highlight on the actively playing side or voted side
    if (activePlaying === side || (votedSide === side && !activePlaying)) {
      return { boxShadow: "inset 0 0 0 1.5px rgba(34,197,94,0.6)" };
    }
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
          animate={{ opacity: getOpacity("a") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("a")}
        >
          <div ref={containerRefA} className="absolute inset-0">
            <canvas ref={canvasRefA} className="absolute inset-0 w-full h-full" />
          </div>
          {getBorderStyle("a").boxShadow && (
            <div className="absolute inset-0 z-10 pointer-events-none rounded-sm" style={getBorderStyle("a")} />
          )}
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
          animate={{ opacity: getOpacity("b") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("b")}
        >
          <div ref={containerRefB} className="absolute inset-0">
            <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
          </div>
          {getBorderStyle("b").boxShadow && (
            <div className="absolute inset-0 z-10 pointer-events-none rounded-sm" style={getBorderStyle("b")} />
          )}
        </motion.div>
      </div>

      {/* Progress bar — absolute overlay at bottom of canvas, no layout shift */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 z-20 flex pointer-events-none">
        {showProgress && activePlaying === "a" && (
          <>
            <div className="w-1/2 relative bg-white/[0.06]">
              <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: hookA?.palette?.[0] || "#fff", opacity: 0.9 }} />
            </div>
            <div className="w-1/2" />
          </>
        )}
        {showProgress && activePlaying === "b" && (
          <>
            <div className="w-1/2" />
            <div className="w-1/2 relative bg-white/[0.06]">
              <div className="absolute inset-y-0 left-0 transition-none" style={{ width: `${progress * 100}%`, background: hookB?.palette?.[0] || "#fff", opacity: 0.9 }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
});
