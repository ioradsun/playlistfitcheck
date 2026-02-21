/**
 * HookDanceCanvas — Full-bleed Canvas 2D overlay that renders the Hook Dance.
 *
 * Receives PhysicsState + active lyric text each frame from HookDanceEngine,
 * looks up the AI-assigned effect for the current line, and draws it.
 */

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Download } from "lucide-react";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "./LyricDisplay";

interface Props {
  physicsState: PhysicsState | null;
  spec: PhysicsSpec;
  lines: LyricLine[];       // hook-region lines
  hookStart: number;
  hookEnd: number;
  currentTime: number;
  beatCount: number;
  prng: () => number;
  onClose: () => void;
  onExport?: () => void;
}

export function HookDanceCanvas({
  physicsState,
  spec,
  lines,
  hookStart,
  hookEnd,
  currentTime,
  beatCount,
  prng,
  onClose,
  onExport,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Draw every time physicsState updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !physicsState) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear with dark background
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    ctx.fillRect(0, 0, w, h);

    // Find current lyric line in hook region
    const activeLine = lines.find(
      l => currentTime >= l.start && currentTime < l.end
    );
    const activeLineIndex = activeLine
      ? lines.indexOf(activeLine)
      : -1;

    if (activeLine) {
      // Look up effect from AI sequence
      const seqEntry = spec.effect_sequence?.find(
        e => e.line_index === activeLineIndex
      );
      const effectKey = seqEntry?.effect_key ?? "STATIC_RESOLVE";
      const drawFn = getEffect(effectKey);

      const age = (currentTime - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (currentTime - activeLine.start) / lineDur);

      const fs = Math.min(w * 0.06, 42);

      const effectState: EffectState = {
        text: activeLine.text,
        physState: physicsState,
        w,
        h,
        fs,
        age,
        progress,
        rng: prng,
        palette: spec.palette || ["#ffffff", "#a855f7", "#ec4899"],
      };

      drawFn(ctx, effectState);

      // Micro-surprise overlay
      if (
        spec.micro_surprise &&
        beatCount > 0 &&
        beatCount % spec.micro_surprise.every_n_beats === 0
      ) {
        drawMicroSurprise(ctx, w, h, spec.micro_surprise.action, physicsState, prng);
      }
    }

    // Progress bar at bottom
    const hookProgress = (currentTime - hookStart) / (hookEnd - hookStart);
    ctx.fillStyle = spec.palette?.[1] || "#a855f7";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, h - 3, w * Math.max(0, Math.min(1, hookProgress)), 3);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [physicsState, currentTime, beatCount, lines, hookStart, hookEnd, spec, prng]);

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {onExport && (
          <button
            onClick={onExport}
            className="text-white/40 hover:text-white transition-colors"
            title="Export video"
          >
            <Download size={20} />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>
      </div>
      {/* System label */}
      <div className="absolute bottom-4 left-4 z-10 text-[10px] font-mono text-white/30 uppercase tracking-wider">
        {spec.system} · hook dance
      </div>
    </motion.div>
  );
}

// ── Micro-surprise overlays ─────────────────────────────────────────────────

function drawMicroSurprise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  action: string,
  state: PhysicsState,
  rng: () => number
) {
  ctx.save();
  switch (action) {
    case "rgb_split": {
      // Flash scanlines
      ctx.globalAlpha = 0.15;
      const lineCount = 5 + Math.floor(rng() * 10);
      for (let i = 0; i < lineCount; i++) {
        const y = rng() * h;
        ctx.fillStyle = rng() > 0.5 ? "cyan" : "red";
        ctx.fillRect(0, y, w, 2);
      }
      break;
    }
    case "flash": {
      ctx.globalAlpha = 0.1 + state.heat * 0.2;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "invert": {
      ctx.globalCompositeOperation = "difference";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    default: {
      // Generic glitch scanlines
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, rng() * h, w, 1);
      }
    }
  }
  ctx.restore();
}
