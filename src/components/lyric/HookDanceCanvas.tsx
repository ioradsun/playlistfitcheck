/**
 * HookDanceCanvas — Full-bleed Canvas 2D overlay that renders the Hook Dance.
 *
 * Receives PhysicsState + active lyric text each frame from HookDanceEngine,
 * looks up the AI-assigned effect for the current line, and draws it.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "./LyricDisplay";
import { HookDanceControls, type HookDanceOverrides } from "./HookDanceControls";
import { ArtistFingerprintButton } from "./ArtistFingerprintButton";
import { FingerprintOnboarding } from "./FingerprintOnboarding";
import { FingerprintConfirmation } from "./FingerprintConfirmation";
import { FingerprintSummary } from "./FingerprintSummary";
import type { ArtistDNA, FingerprintSongContext } from "./ArtistFingerprintTypes";

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
  onOverrides?: (overrides: HookDanceOverrides) => void;
  /** Artist fingerprint for visual identity */
  fingerprint?: ArtistDNA | null;
  /** Called when fingerprint is created/reset */
  onFingerprintChange?: (dna: ArtistDNA | null) => void;
  /** Song context for fingerprint generation */
  songContext?: FingerprintSongContext;
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
  onOverrides,
  fingerprint,
  onFingerprintChange,
  songContext,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<HookDanceOverrides>({});
  const startTimeRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Fingerprint flow state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingDna, setPendingDna] = useState<ArtistDNA | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Track elapsed time for the fingerprint button reveal
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Propagate overrides to parent (for engine system changes)
  const handleOverrides = useCallback((newOverrides: HookDanceOverrides) => {
    setOverrides(newOverrides);
    onOverrides?.(newOverrides);
  }, [onOverrides]);

  // Build active palette: fingerprint palette takes priority
  const fpPalette = fingerprint ? [fingerprint.palette.primary, fingerprint.palette.accent, "#ffffff"] : null;
  const activePalette = overrides.palette || fpPalette || spec.palette || ["#ffffff", "#a855f7", "#ec4899"];
  const activeSystem = overrides.system || spec.system;

  // Resize canvas to fill container — use ResizeObserver for crisp rendering at any size
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
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

    // Draw system-specific background
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSystemBackground(ctx, {
      system: activeSystem,
      physState: physicsState,
      w,
      h,
      time: currentTime,
      beatCount,
      rng: prng,
      palette: activePalette,
      hookStart,
      hookEnd,
    });

    // Find current lyric line in hook region
    const activeLine = lines.find(
      l => currentTime >= l.start && currentTime < l.end
    );
    const activeLineIndex = activeLine
      ? lines.indexOf(activeLine)
      : -1;

    if (activeLine) {
      // Resolve effect: v6 pool-based or v5 sequence-based
      let effectKey = "STATIC_RESOLVE";
      if (spec.effect_sequence) {
        const seqEntry = spec.effect_sequence.find(e => e.line_index === activeLineIndex);
        effectKey = seqEntry?.effect_key ?? "STATIC_RESOLVE";
      } else if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
        const isInHook = currentTime >= hookStart && currentTime <= hookEnd;
        const isLastHookLine = isInHook && activeLine.end >= hookEnd - 0.5;
        if (isLastHookLine) {
          effectKey = "HOOK_FRACTURE";
        } else {
          const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
          effectKey = spec.effect_pool[poolIdx];
        }
      }
      const drawFn = getEffect(effectKey);

      const age = (currentTime - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (currentTime - activeLine.start) / lineDur);

      // Dynamic font sizing: scale to canvas width, no hard pixel cap
      const safeW = w * 0.85;
      const charCount = Math.max(1, activeLine.text.length);
      const dynamicFs = Math.min(w * 0.07, (safeW / charCount) * 1.8);
      const fs = Math.max(Math.round(dynamicFs), 14);

      const effectState: EffectState = {
        text: activeLine.text,
        physState: physicsState,
        w,
        h,
        fs,
        age,
        progress,
        rng: prng,
        palette: activePalette,
        system: activeSystem,
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
    ctx.fillStyle = activePalette[1] || "#a855f7";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, h - 3, w * Math.max(0, Math.min(1, hookProgress)), 3);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [physicsState, currentTime, beatCount, lines, hookStart, hookEnd, spec, prng, activePalette, activeSystem]);

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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
        {activeSystem} · hook dance
      </div>
      {/* Creative controls */}
      <HookDanceControls
        currentSystem={spec.system}
        currentPalette={spec.palette || ["#ffffff", "#a855f7", "#ec4899"]}
        overrides={overrides}
        onChange={handleOverrides}
      />

      {/* Artist Fingerprint button — fades in after 3s */}
      {onFingerprintChange && !showOnboarding && !pendingDna && !showSummary && (
        <ArtistFingerprintButton
          elapsedSeconds={elapsedSeconds}
          fingerprint={fingerprint ?? null}
          onStartOnboarding={() => setShowOnboarding(true)}
          onViewSummary={() => setShowSummary(true)}
        />
      )}

      {/* Fingerprint onboarding overlay */}
      <AnimatePresence>
        {showOnboarding && songContext && (
          <FingerprintOnboarding
            songContext={songContext}
            onGenerated={(dna) => {
              setShowOnboarding(false);
              setPendingDna(dna);
            }}
            onClose={() => setShowOnboarding(false)}
          />
        )}
      </AnimatePresence>

      {/* Fingerprint confirmation overlay */}
      <AnimatePresence>
        {pendingDna && (
          <FingerprintConfirmation
            dna={pendingDna}
            onLockIn={() => {
              onFingerprintChange?.(pendingDna);
              setPendingDna(null);
            }}
            onStartOver={() => {
              setPendingDna(null);
              setShowOnboarding(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* Fingerprint summary overlay */}
      <AnimatePresence>
        {showSummary && fingerprint && (
          <FingerprintSummary
            dna={fingerprint}
            onClose={() => setShowSummary(false)}
            onReset={() => {
              onFingerprintChange?.(null);
              setShowSummary(false);
            }}
          />
        )}
      </AnimatePresence>
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
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, rng() * h, w, 1);
      }
    }
  }
  ctx.restore();
}
