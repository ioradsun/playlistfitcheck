/**
 * HookDanceCanvas — Full-bleed Canvas 2D overlay that renders the Hook Dance.
 *
 * Receives PhysicsState + active lyric text each frame from HookDanceEngine,
 * looks up the AI-assigned effect for the current line, and draws it.
 * Uses refs for all rapidly-changing values to avoid stale closures in rAF.
 */

import { useRef, useEffect, useState, useCallback, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { getEffect, resolveEffectKey, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import { animationResolver } from "@/engine/AnimationResolver";
import { applyEntrance, applyExit, applyModEffect } from "@/engine/LyricAnimations";
import { deriveCanvasManifest, logManifestDiagnostics } from "@/engine/deriveCanvasManifest";
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

export const HookDanceCanvas = forwardRef<HTMLDivElement, Props>(function HookDanceCanvas({
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
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<HookDanceOverrides>({});
  const startTimeRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ── Refs for all rapidly-changing values (prevents stale closures in rAF) ──
  const physicsStateRef = useRef(physicsState);
  const currentTimeRef = useRef(currentTime);
  const beatCountRef = useRef(beatCount);
  const specRef = useRef(spec);
  const linesRef = useRef(lines);
  const hookStartRef = useRef(hookStart);
  const hookEndRef = useRef(hookEnd);
  const prngRef = useRef(prng);

  // Keep refs synchronized with props
  physicsStateRef.current = physicsState;
  currentTimeRef.current = currentTime;
  beatCountRef.current = beatCount;
  specRef.current = spec;
  linesRef.current = lines;
  hookStartRef.current = hookStart;
  hookEndRef.current = hookEnd;
  prngRef.current = prng;

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

  // Keep palette/system in refs too
  const activePaletteRef = useRef(activePalette);
  const activeSystemRef = useRef(activeSystem);
  activePaletteRef.current = activePalette;
  activeSystemRef.current = activeSystem;

  // Resize canvas to fill container
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

  // ── rAF-driven draw loop — reads all values from refs ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    const draw = () => {
      animId = requestAnimationFrame(draw);

      const ps = physicsStateRef.current;
      if (!ps) return;

      const ct = currentTimeRef.current;
      const bc = beatCountRef.current;
      const sp = specRef.current;
      const ln = linesRef.current;
      const hs = hookStartRef.current;
      const he = hookEndRef.current;
      const rng = prngRef.current;
      const palette = activePaletteRef.current;
      const system = activeSystemRef.current;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Derive manifest via shared pipeline — includes text-safe palette
      const { manifest, textPalette, textColor, contrastRatio } = deriveCanvasManifest({
        physicsSpec: sp,
        fallbackPalette: palette,
        systemType: system,
      });

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSystemBackground(ctx, {
        system, physState: ps, w, h, time: ct, beatCount: bc,
        rng, palette, hookStart: hs, hookEnd: he,
      });

      // Find current lyric line
      const activeLine = ln.find(l => ct >= l.start && ct < l.end);
      const activeLineIndex = activeLine ? ln.indexOf(activeLine) : -1;

      if (activeLine) {
        // Resolve effect
        let effectKey = "STATIC_RESOLVE";
        if (sp.effect_sequence) {
          const seqEntry = sp.effect_sequence.find(e => e.line_index === activeLineIndex);
          effectKey = seqEntry?.effect_key ?? "STATIC_RESOLVE";
        } else if (sp.effect_pool && sp.effect_pool.length > 0 && sp.logic_seed != null) {
          const isInHook = ct >= hs && ct <= he;
          const isLastHookLine = isInHook && activeLine.end >= he - 0.5;
          if (isLastHookLine) {
            effectKey = "HOOK_FRACTURE";
          } else {
            const poolIdx = (sp.logic_seed + activeLineIndex * 7) % sp.effect_pool.length;
            effectKey = resolveEffectKey(sp.effect_pool[poolIdx]);
          }
        }
        const drawFn = getEffect(effectKey);

        const age = (ct - activeLine.start) * 1000;
        const lineDur = activeLine.end - activeLine.start;
        const progress = Math.min(1, (ct - activeLine.start) / lineDur);

        const stackedLayout = computeStackedLayout(ctx, activeLine.text, w, h, system);
        const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
          ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
          : computeFitFontSize(ctx, activeLine.text, w, system);

        // Beat intensity from physics heat (no analyser in editor)
        const editorBeatIntensity = ps.heat * 0.8;

        // AnimationResolver: entry/exit, scale, mod
        const lineAnim = animationResolver.resolveLine(
          activeLineIndex, activeLine.start, activeLine.end, ct, editorBeatIntensity,
        );

        const lyricEntrance = manifest.lyricEntrance ?? "fades";
        const lyricExit = manifest.lyricExit ?? "fades";

        ctx.save();

        // Entry/exit alpha
        const entryAlpha = applyEntrance(ctx, lineAnim.entryProgress, lyricEntrance);
        const exitAlpha = lineAnim.exitProgress > 0
          ? applyExit(ctx, lineAnim.exitProgress, lyricExit)
          : 1.0;
        const compositeAlpha = Math.min(entryAlpha, exitAlpha);

        // Beat-reactive scale
        const cx = w / 2;
        const cy = h / 2;
        ctx.translate(cx, cy);
        ctx.scale(lineAnim.scale, lineAnim.scale);
        ctx.translate(-cx, -cy);

        // Mod effect
        if (lineAnim.activeMod) {
          applyModEffect(ctx, lineAnim.activeMod, ct, editorBeatIntensity);
        }

        const effectState: EffectState = {
          text: activeLine.text,
          physState: ps,
          w, h, fs, age, progress, rng,
          // KEY FIX: use textPalette (text-safe) instead of raw palette
          palette: textPalette as string[],
          system,
          effectiveLetterSpacing,
          stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
          alphaMultiplier: compositeAlpha,
        };

        drawFn(ctx, effectState);
        ctx.restore();

        // 1Hz diagnostic log
        logManifestDiagnostics("EditorCanvas", {
          palette: manifest.palette as string[],
          fontFamily: manifest.typographyProfile?.fontFamily ?? "—",
          particleSystem: manifest.particleConfig?.system ?? "none",
          beatIntensity: editorBeatIntensity,
          activeMod: lineAnim.activeMod,
          entryProgress: lineAnim.entryProgress,
          exitProgress: lineAnim.exitProgress,
          textColor,
          contrastRatio,
          effectKey,
        });

        // Micro-surprise overlay
        if (
          sp.micro_surprise &&
          bc > 0 &&
          bc % sp.micro_surprise.every_n_beats === 0
        ) {
          drawMicroSurprise(ctx, w, h, sp.micro_surprise.action, ps, rng);
        }
      }

      // Progress bar
      const hookProgress = (ct - hs) / (he - hs);
      ctx.fillStyle = palette[1] || "#a855f7";
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, h - 3, w * Math.max(0, Math.min(1, hookProgress)), 3);
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []); // Stable — reads everything from refs

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => { containerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      className="fixed inset-0 z-[100]"
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
});

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
