/**
 * HookDanceCanvas — Full-bleed Canvas 2D overlay that renders the Hook Dance.
 *
 * Receives PhysicsState + active lyric text each frame from HookDanceEngine,
 * looks up the AI-assigned effect for the current line, and draws it.
 * Uses refs for all rapidly-changing values to avoid stale closures in rAF.
 */

import { useRef, useEffect, useState, useCallback, forwardRef, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { getEffect, resolveEffectKey, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import { animationResolver } from "@/engine/AnimationResolver";
import { applyEntrance, applyExit, applyModEffect } from "@/engine/LyricAnimations";
import { deriveCanvasManifest, logManifestDiagnostics } from "@/engine/deriveCanvasManifest";
import { getBackgroundSystemForTime } from "@/engine/getBackgroundSystemForTime";
import {
  resolveWordColors, applyContrastRhythm, applyBeatFlash,
  drawTemperatureTint, perceivedBrightness, mixTowardWhite,
} from "@/engine/ColorEnhancer";
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

  // ── Debug HUD state ──
  interface EditorDebugState {
    beatIntensity: number; physGlow: number;
    heat: number; offsetX: number; offsetY: number; rotation: number; scale: number; shake: number;
    effectKey: string; entryProgress: number; exitProgress: number;
    activeMod: string | null; fontScale: number; finalScale: number;
    lineColor: string; isHookLine: boolean; repIndex: number; repTotal: number;
    system: string; songProgress: number; palette: string[];
    entrance: string; time: number;
  }
  const debugRef = useRef<EditorDebugState>({
    beatIntensity: 0, physGlow: 0,
    heat: 0, offsetX: 0, offsetY: 0, rotation: 0, scale: 1, shake: 0,
    effectKey: "—", entryProgress: 0, exitProgress: 0,
    activeMod: null, fontScale: 1, finalScale: 1,
    lineColor: "#fff", isHookLine: false, repIndex: 0, repTotal: 0,
    system: "—", songProgress: 0, palette: [],
    entrance: "fades", time: 0,
  });
  const [showHud, setShowHud] = useState(false);
  const [hudSnap, setHudSnap] = useState<EditorDebugState>(debugRef.current);

  // D-key toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setShowHud(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Poll debug ref at 100ms
  useEffect(() => {
    if (!showHud) return;
    const id = setInterval(() => setHudSnap({ ...debugRef.current }), 100);
    return () => clearInterval(id);
  }, [showHud]);

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
    // Contrast-rhythm: track last 2 line brightness values
    const recentBrightness: number[] = [];
    let lastTrackedLineIndex = -1;
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
      const songProgress = (ct - hs) / Math.max(0.001, he - hs);
      const editorBeatIntensity = ps.heat * 0.8;
      const activeBackgroundSystem = getBackgroundSystemForTime(manifest, songProgress, editorBeatIntensity);

      drawSystemBackground(ctx, {
        system: activeBackgroundSystem,
        physState: ps,
        w,
        h,
        time: ct,
        beatCount: bc,
        rng,
        palette,
        hookStart: hs,
        hookEnd: he,
      });

      // ── 4. Color temperature tint (background only) ──
      drawTemperatureTint(ctx, w, h, songProgress);

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

        const stackedLayout = computeStackedLayout(ctx, activeLine.text, w, h, activeBackgroundSystem);
        const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
          ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
          : computeFitFontSize(ctx, activeLine.text, w, activeBackgroundSystem);

        // AnimationResolver: entry/exit, scale, mod
        const lineAnim = animationResolver.resolveLine(
          activeLineIndex, activeLine.start, activeLine.end, ct, editorBeatIntensity, manifest.palette as [string, string, string],
        );

        // ── 2. Contrast rhythm — force mid-tone if last 2 were bright ──
        let correctedLineColor = lineAnim.lineColor;
        if (activeLineIndex !== lastTrackedLineIndex) {
          correctedLineColor = applyContrastRhythm(lineAnim.lineColor, recentBrightness, textPalette as string[]);
          recentBrightness.push(perceivedBrightness(correctedLineColor));
          if (recentBrightness.length > 2) recentBrightness.shift();
          lastTrackedLineIndex = activeLineIndex;
        } else {
          correctedLineColor = applyContrastRhythm(lineAnim.lineColor, recentBrightness, textPalette as string[]);
        }

        // ── 1. Word-level color ──
        let wordColors = resolveWordColors(
          activeLine.text, correctedLineColor, textPalette as string[],
          lineAnim.isHookLine, lineAnim.activeMod,
        );

        // ── 3. Beat brightness flash ──
        wordColors = applyBeatFlash(wordColors, editorBeatIntensity);
        const flashedLineColor = editorBeatIntensity > 0.7
          ? mixTowardWhite(correctedLineColor, editorBeatIntensity * 0.3)
          : correctedLineColor;

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
        ctx.scale(lineAnim.scale * ps.scale, lineAnim.scale * ps.scale);
        ctx.translate(-cx, -cy);

        // ── Physics-driven word motion ──────────────────────────────────
        const physShakeAngle = (bc * 2.3 + ct * 7.1) % (Math.PI * 2);
        const physShakeX = Math.cos(physShakeAngle) * ps.shake;
        const physShakeY = Math.sin(physShakeAngle) * ps.shake;
        ctx.translate(
          ps.offsetX + physShakeX,
          ps.offsetY + physShakeY,
        );
        ctx.translate(cx, cy);
        ctx.rotate(ps.rotation);
        ctx.translate(-cx, -cy);

        // Mod effect
        if (lineAnim.activeMod) {
          applyModEffect(ctx, lineAnim.activeMod, ct, editorBeatIntensity);
        }

        const effectState: EffectState = {
          text: activeLine.text,
          physState: ps,
          w, h, fs, age, progress, rng,
          palette: [flashedLineColor, textPalette[1] as string, textPalette[2] as string],
          system: activeBackgroundSystem,
          effectiveLetterSpacing,
          stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
          alphaMultiplier: compositeAlpha,
          wordColors,
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

        // Write debug state for HUD
        debugRef.current = {
          beatIntensity: editorBeatIntensity,
          physGlow: ps.heat * 0.6,
          heat: sp.params?.heat ?? 0,
          offsetX: ps.offsetX,
          offsetY: ps.offsetY,
          rotation: ps.rotation,
          scale: ps.scale,
          shake: ps.shake,
          effectKey,
          entryProgress: lineAnim.entryProgress,
          exitProgress: lineAnim.exitProgress,
          activeMod: lineAnim.activeMod ?? null,
          fontScale: lineAnim.fontScale ?? 1,
          finalScale: lineAnim.scale * ps.scale,
          lineColor: correctedLineColor,
          isHookLine: lineAnim.isHookLine,
          repIndex: 0,
          repTotal: 0,
          system: activeBackgroundSystem ?? "—",
          songProgress,
          palette: palette,
          entrance: lyricEntrance,
          time: ct,
        };

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

      {/* Debug HUD — press D to toggle */}
      {showHud && <EditorDebugHUD snap={hudSnap} />}
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

// ── Editor Debug HUD ────────────────────────────────────────────────────────

function EditorDebugHUD({ snap }: { snap: {
  beatIntensity: number; physGlow: number;
  heat: number; offsetX: number; offsetY: number; rotation: number; scale: number; shake: number;
  effectKey: string; entryProgress: number; exitProgress: number;
  activeMod: string | null; fontScale: number; finalScale: number;
  lineColor: string; isHookLine: boolean; repIndex: number; repTotal: number;
  system: string; songProgress: number; palette: string[];
  entrance: string; time: number;
} }) {
  const f = (v: number, d = 2) => v.toFixed(d);
  const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8 };
  const labelStyle: CSSProperties = { color: "#4ade80" };
  const valStyle: CSSProperties = { color: "#d1fae5" };
  const sectionStyle: CSSProperties = { marginBottom: 6 };
  const titleStyle: CSSProperties = { color: "#22c55e", fontWeight: 700, marginBottom: 2, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" };

  const Row = ({ l, v }: { l: string; v: string }) => (
    <div style={rowStyle}><span style={labelStyle}>{l}:</span><span style={valStyle}>{v}</span></div>
  );
  const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div style={sectionStyle}><div style={titleStyle}>{t}</div>{children}</div>
  );

  return (
    <div style={{
      position: "fixed", top: 12, left: 12, zIndex: 200,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)",
      border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6,
      padding: 12, maxWidth: 280, minWidth: 240,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 11, lineHeight: "1.55", color: "#4ade80",
      pointerEvents: "auto", overflowY: "auto", maxHeight: "90vh",
    }}>
      <Sec t="BEAT">
        <Row l="intensity" v={f(snap.beatIntensity)} />
        <Row l="physGlow" v={f(snap.physGlow)} />
      </Sec>
      <Sec t="PHYSICS ENGINE">
        <Row l="heat" v={f(snap.heat)} />
        <Row l="offsetX" v={`${f(snap.offsetX, 1)}px`} />
        <Row l="offsetY" v={`${f(snap.offsetY, 1)}px`} />
        <Row l="rotation" v={f(snap.rotation, 3)} />
        <Row l="scale" v={f(snap.scale)} />
        <Row l="shake" v={f(snap.shake)} />
      </Sec>
      <Sec t="ANIMATION">
        <Row l="effect" v={snap.effectKey} />
        <Row l="entryProgress" v={f(snap.entryProgress)} />
        <Row l="exitProgress" v={f(snap.exitProgress)} />
        <Row l="activeMod" v={snap.activeMod ?? "none"} />
        <Row l="fontScale" v={f(snap.fontScale)} />
        <Row l="finalScale" v={f(snap.finalScale)} />
        <Row l="lineColor" v={snap.lineColor} />
        <Row l="isHookLine" v={snap.isHookLine ? "true" : "false"} />
        <Row l="repIndex" v={`${snap.repIndex}/${snap.repTotal}`} />
      </Sec>
      <Sec t="BACKGROUND">
        <Row l="system" v={snap.system} />
        <Row l="songProgress" v={f(snap.songProgress)} />
        <Row l="palette" v={`[${snap.palette.join(", ")}]`} />
        <Row l="entrance" v={snap.entrance} />
      </Sec>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(74,222,128,0.4)", textAlign: "center" }}>
        {f(snap.time, 2)}s · press D to close
      </div>
    </div>
  );
}
