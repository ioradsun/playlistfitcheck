/**
 * DirectorsCutScreen — Editorial carousel for system selection.
 * Minimal, typography-led. Two canvases side-by-side with carousel nav.
 * All systems render live. Tap to select, confirm with "SELECT".
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhysicsIntegrator, mulberry32, hashSeed, type PhysicsSpec, type PhysicsState } from "@/engine/PhysicsIntegrator";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize } from "@/engine/SystemStyles";
import type { LyricLine } from "./LyricDisplay";
import type { BeatTick } from "@/engine/HookDanceEngine";

// ── System definitions ──────────────────────────────────────────────────────

const SYSTEMS = ["fracture", "pressure", "breath", "combustion", "orbit", "paper", "glass"] as const;
type SystemKey = typeof SYSTEMS[number];

const SYSTEM_LABELS: Record<SystemKey, { name: string; subtitle: string; light?: boolean }> = {
  fracture:   { name: "FRACTURE",    subtitle: "Your words are glass" },
  pressure:   { name: "PRESSURE",    subtitle: "Your words have mass" },
  breath:     { name: "BREATH",      subtitle: "Your words are heat" },
  combustion: { name: "COMBUSTION",  subtitle: "Your words smolder" },
  orbit:      { name: "ORBIT",       subtitle: "Your words have gravity" },
  paper:      { name: "PAPER",       subtitle: "Your words bleed ink", light: true },
  glass:      { name: "GLASS",       subtitle: "Your words refract light", light: true },
};

/** Multipliers applied to base AI spec per system */
const SYSTEM_MULTIPLIERS: Record<SystemKey, Record<string, number>> = {
  fracture:   {},
  pressure:   { mass: 1.2, elasticity: 0.8 },
  breath:     { damping: 1.3, heat: 1.6 },
  combustion: { heat: 2.0, brittleness: 0.5 },
  orbit:      { elasticity: 1.4, damping: 0.7 },
  paper:      { damping: 1.1 },
  glass:      { elasticity: 1.2, damping: 0.9 },
};

function deriveSpec(baseSpec: PhysicsSpec, system: SystemKey): PhysicsSpec {
  const mults = SYSTEM_MULTIPLIERS[system];
  const params = { ...(baseSpec.params || {}) };
  for (const [key, mult] of Object.entries(mults)) {
    params[key] = (params[key] ?? baseSpec.material?.[key as keyof typeof baseSpec.material] ?? 1) * mult;
  }
  return { ...baseSpec, system, params };
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  baseSpec: PhysicsSpec;
  beats: BeatTick[];
  lines: LyricLine[];
  hookStart: number;
  hookEnd: number;
  audioFile: File;
  seedBase: string;
  onSelect: (system: string) => void;
  onClose: () => void;
}

// ── Per-system canvas renderer ──────────────────────────────────────────────

interface SystemRenderer {
  integrator: PhysicsIntegrator;
  beatIndex: number;
  prng: () => number;
  system: SystemKey;
  spec: PhysicsSpec;
}

export function DirectorsCutScreen({
  baseSpec,
  beats,
  lines,
  hookStart,
  hookEnd,
  audioFile,
  seedBase,
  onSelect,
  onClose,
}: Props) {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderersRef = useRef<SystemRenderer[]>([]);
  const prevTimeRef = useRef(hookStart);

  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(1);
  const [selected, setSelected] = useState<SystemKey>(baseSpec.system as SystemKey || "fracture");

  const aiPick = (baseSpec.system as SystemKey) || "fracture";

  // Filter beats to hook region
  const hookBeats = useMemo(
    () => beats.filter(b => b.time >= hookStart && b.time <= hookEnd).sort((a, b) => a.time - b.time),
    [beats, hookStart, hookEnd]
  );

  // Initialize renderers for all systems
  useEffect(() => {
    renderersRef.current = SYSTEMS.map((system, idx) => {
      const spec = deriveSpec(baseSpec, system);
      const integrator = new PhysicsIntegrator(spec);
      const seed = hashSeed(seedBase) + idx;
      const prng = mulberry32(seed);
      return { integrator, beatIndex: 0, prng, system, spec };
    });
  }, [baseSpec, seedBase]);

  // Canvas drawing
  const drawSystemCanvas = useCallback((
    canvas: HTMLCanvasElement,
    physState: PhysicsState,
    renderer: SystemRenderer,
    currentTime: number,
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const w = rect.width;
    const h = rect.height;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bgPalette = renderer.spec.palette || ["#ffffff", "#a855f7", "#ec4899"];
    drawSystemBackground(ctx, {
      system: renderer.system,
      physState,
      w, h,
      time: currentTime,
      beatCount: renderer.beatIndex,
      rng: renderer.prng,
      palette: bgPalette,
      hookStart,
      hookEnd,
    });

    const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
    const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;

    if (activeLine) {
      let effectKey = "STATIC_RESOLVE";
      const spec = renderer.spec;
      if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
        const systemOffset = SYSTEMS.indexOf(renderer.system);
        const poolIdx = (spec.logic_seed + systemOffset + activeLineIndex * 7) % spec.effect_pool.length;
        effectKey = spec.effect_pool[poolIdx];
      }
      const drawFn = getEffect(effectKey);

      const age = (currentTime - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (currentTime - activeLine.start) / lineDur);

      const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, activeLine.text, w, renderer.system);

      const palette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];

      const effectState: EffectState = {
        text: activeLine.text,
        physState,
        w, h, fs, age, progress,
        rng: renderer.prng,
        palette,
        system: renderer.system,
        effectiveLetterSpacing,
      };

      drawFn(ctx, effectState);
    }

    // Progress bar
    const hookProgress = (currentTime - hookStart) / (hookEnd - hookStart);
    ctx.fillStyle = (renderer.spec.palette?.[1]) || "#a855f7";
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, h - 2, w * Math.max(0, Math.min(1, hookProgress)), 2);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [lines, hookStart, hookEnd]);

  // Audio + animation loop
  useEffect(() => {
    const ownUrl = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.muted = true;
    audio.volume = 0;
    audio.preload = "auto";
    audioRef.current = audio;

    let audioReady = false;
    let audioSeeked = false;
    audio.addEventListener("canplay", () => {
      audioReady = true;
      audio.currentTime = hookStart;
    });
    audio.addEventListener("seeked", () => {
      if (audioReady) {
        audioSeeked = true;
        audio.play().catch((e) => console.warn("[DirectorsCut] audio play failed:", e));
      }
    });
    audio.addEventListener("error", (e) => {
      console.warn("[DirectorsCut] audio error, using synthetic clock:", e);
    });
    audio.src = ownUrl;
    audio.load();

    const syntheticStartTime = performance.now();
    const hookDuration = hookEnd - hookStart;

    const tick = () => {
      let ct: number;
      const useAudio = audioSeeked && audioRef.current && !audioRef.current.paused && audioRef.current.currentTime >= hookStart;
      if (useAudio) {
        ct = audioRef.current!.currentTime;
      } else {
        const elapsed = (performance.now() - syntheticStartTime) / 1000;
        ct = hookStart + (elapsed % hookDuration);
      }

      if (ct >= hookEnd) {
        if (useAudio && audioRef.current) {
          audioRef.current.currentTime = hookStart;
        }
        prevTimeRef.current = hookStart;
        renderersRef.current.forEach(r => { r.integrator.reset(); r.beatIndex = 0; });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const prev = prevTimeRef.current;

      for (const idx of [leftIndex, rightIndex]) {
        const renderer = renderersRef.current[idx];
        if (!renderer) continue;

        while (
          renderer.beatIndex < hookBeats.length &&
          hookBeats[renderer.beatIndex].time <= ct
        ) {
          const beat = hookBeats[renderer.beatIndex];
          if (beat.time > prev) {
            renderer.integrator.onBeat(beat.strength, beat.isDownbeat);
          }
          renderer.beatIndex++;
        }
        const state = renderer.integrator.tick();

        const canvas = idx === leftIndex ? leftCanvasRef.current : rightCanvasRef.current;
        if (canvas) drawSystemCanvas(canvas, state, renderer, ct);
      }

      prevTimeRef.current = ct;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      URL.revokeObjectURL(ownUrl);
    };
  }, [audioFile, hookStart, hookEnd, hookBeats, leftIndex, rightIndex, drawSystemCanvas]);

  const handleConfirm = useCallback(() => {
    onSelect(selected);
  }, [selected, onSelect]);

  const cycleSide = (side: "left" | "right", dir: number) => {
    const setter = side === "left" ? setLeftIndex : setRightIndex;
    const other = side === "left" ? rightIndex : leftIndex;
    setter(prev => {
      let next = (prev + dir + SYSTEMS.length) % SYSTEMS.length;
      if (next === other) next = (next + dir + SYSTEMS.length) % SYSTEMS.length;
      return next;
    });
  };

  const leftSys = SYSTEMS[leftIndex];
  const rightSys = SYSTEMS[rightIndex];
  const leftLabel = SYSTEM_LABELS[leftSys];
  const rightLabel = SYSTEM_LABELS[rightSys];

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#0a0a0a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
          Director's Cut
        </p>
        <button
          onClick={onClose}
          className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20 hover:text-white/50 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Split canvas area */}
      <div className="flex-1 flex gap-1 px-1 min-h-0">
        {/* Left panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <motion.div
            className="flex-1 relative rounded-lg overflow-hidden cursor-pointer"
            animate={{ opacity: selected === leftSys ? 1 : 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => setSelected(leftSys)}
          >
            <canvas
              ref={leftCanvasRef}
              className="absolute inset-0 w-full h-full"
            />
            {/* Selected indicator — subtle border */}
            {selected === leftSys && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ border: '1px solid rgba(255,255,255,0.15)' }}
              />
            )}
            {/* AI pick — editorial label */}
            {leftSys === aiPick && (
              <div className="absolute top-2 left-2">
                <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/30">
                  AI Pick
                </p>
              </div>
            )}
          </motion.div>

          {/* Label + carousel nav */}
          <div className="flex items-center justify-between py-2 px-1">
            <button
              onClick={() => cycleSide("left", -1)}
              className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors px-1"
            >
              ←
            </button>
            <div className="text-center min-w-0">
              <p className={`text-[11px] font-mono uppercase tracking-[0.2em] transition-colors ${
                selected === leftSys ? "text-white/70" : "text-white/30"
              }`}>
                {leftLabel.name}
              </p>
            </div>
            <button
              onClick={() => cycleSide("left", 1)}
              className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors px-1"
            >
              →
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <motion.div
            className="flex-1 relative rounded-lg overflow-hidden cursor-pointer"
            animate={{ opacity: selected === rightSys ? 1 : 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => setSelected(rightSys)}
          >
            <canvas
              ref={rightCanvasRef}
              className="absolute inset-0 w-full h-full"
            />
            {selected === rightSys && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ border: '1px solid rgba(255,255,255,0.15)' }}
              />
            )}
            {rightSys === aiPick && (
              <div className="absolute top-2 left-2">
                <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/30">
                  AI Pick
                </p>
              </div>
            )}
          </motion.div>

          <div className="flex items-center justify-between py-2 px-1">
            <button
              onClick={() => cycleSide("right", -1)}
              className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors px-1"
            >
              ←
            </button>
            <div className="text-center min-w-0">
              <p className={`text-[11px] font-mono uppercase tracking-[0.2em] transition-colors ${
                selected === rightSys ? "text-white/70" : "text-white/30"
              }`}>
                {rightLabel.name}
              </p>
            </div>
            <button
              onClick={() => cycleSide("right", 1)}
              className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors px-1"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* System position indicators */}
      <div className="flex justify-center gap-2 py-1 shrink-0">
        {SYSTEMS.map((s, i) => (
          <button
            key={s}
            onClick={() => {
              if (i !== rightIndex) setLeftIndex(i);
              else setRightIndex(leftIndex);
            }}
            className={`w-1 h-1 rounded-full transition-all ${
              selected === s ? "bg-white/60 scale-150" :
              i === leftIndex || i === rightIndex ? "bg-white/30" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {/* Select button — editorial */}
      <div className="px-5 pb-[env(safe-area-inset-bottom,16px)] pt-3 shrink-0">
        <button
          onClick={handleConfirm}
          className="w-full py-3 text-[11px] font-mono uppercase tracking-[0.2em] text-white/70 hover:text-white bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg transition-all"
        >
          Select
        </button>
        <p className="text-center text-[9px] font-mono text-white/15 mt-2 uppercase tracking-[0.2em]">
          {SYSTEM_LABELS[selected].name} — {SYSTEM_LABELS[selected].subtitle}
        </p>
      </div>
    </motion.div>
  );
}
