/**
 * DirectorsCutScreen — Horizontal carousel for system selection.
 * Editorial style: mono type, minimal chrome, tap-to-select.
 * All 7 systems render live simultaneously.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhysicsIntegrator, mulberry32, hashSeed, type PhysicsSpec, type PhysicsState } from "@/engine/PhysicsIntegrator";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
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

// ── Per-system renderer state ───────────────────────────────────────────────

interface SystemRenderer {
  integrator: PhysicsIntegrator;
  beatIndex: number;
  prng: () => number;
  system: SystemKey;
  spec: PhysicsSpec;
}

// ── Component ───────────────────────────────────────────────────────────────

export function DirectorsCutScreen({
  baseSpec, beats, lines, hookStart, hookEnd, audioFile, seedBase, onSelect, onClose,
}: Props) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>(new Array(SYSTEMS.length).fill(null));
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderersRef = useRef<SystemRenderer[]>([]);
  const prevTimeRef = useRef(hookStart);

  const [selected, setSelected] = useState<SystemKey | null>(null);
  const aiPick = (baseSpec.system as SystemKey) || "fracture";

  const hookBeats = useMemo(
    () => beats.filter(b => b.time >= hookStart && b.time <= hookEnd).sort((a, b) => a.time - b.time),
    [beats, hookStart, hookEnd]
  );

  // Initialize renderers
  useEffect(() => {
    renderersRef.current = SYSTEMS.map((system, idx) => {
      const spec = deriveSpec(baseSpec, system);
      const integrator = new PhysicsIntegrator(spec);
      const seed = hashSeed(seedBase) + idx;
      const prng = mulberry32(seed);
      return { integrator, beatIndex: 0, prng, system, spec };
    });
  }, [baseSpec, seedBase]);

  // Canvas draw function
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
      system: renderer.system, physState, w, h,
      time: currentTime, beatCount: renderer.beatIndex,
      rng: renderer.prng, palette: bgPalette, hookStart, hookEnd,
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
      const stackedLayout = computeStackedLayout(ctx, activeLine.text, w, h, renderer.system);
      const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
        ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
        : computeFitFontSize(ctx, activeLine.text, w, renderer.system);
      const palette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];

      const effectState: EffectState = {
        text: activeLine.text, physState, w, h, fs, age, progress,
        rng: renderer.prng, palette, system: renderer.system, effectiveLetterSpacing,
        stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
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

  // Audio + animation loop — tick ALL 7 systems
  useEffect(() => {
    const ownUrl = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.muted = true;
    audio.volume = 0;
    audio.preload = "auto";
    audioRef.current = audio;

    let audioReady = false;
    let audioSeeked = false;
    audio.addEventListener("canplay", () => { audioReady = true; audio.currentTime = hookStart; });
    audio.addEventListener("seeked", () => {
      if (audioReady) { audioSeeked = true; audio.play().catch(() => {}); }
    });
    audio.addEventListener("error", () => {});
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
        if (useAudio && audioRef.current) audioRef.current.currentTime = hookStart;
        prevTimeRef.current = hookStart;
        renderersRef.current.forEach(r => { r.integrator.reset(); r.beatIndex = 0; });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const prev = prevTimeRef.current;

      // Tick and draw ALL systems
      for (let idx = 0; idx < SYSTEMS.length; idx++) {
        const renderer = renderersRef.current[idx];
        if (!renderer) continue;

        while (renderer.beatIndex < hookBeats.length && hookBeats[renderer.beatIndex].time <= ct) {
          const beat = hookBeats[renderer.beatIndex];
          if (beat.time > prev) renderer.integrator.onBeat(beat.strength, beat.isDownbeat);
          renderer.beatIndex++;
        }
        const state = renderer.integrator.tick();
        const canvas = canvasRefs.current[idx];
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
  }, [audioFile, hookStart, hookEnd, hookBeats, drawSystemCanvas]);

  // Scroll by one card
  const scrollCarousel = useCallback((dir: number) => {
    if (!scrollRef.current) return;
    const cardWidth = scrollRef.current.offsetWidth * 0.28 + 4; // card + gap
    scrollRef.current.scrollBy({ left: dir * cardWidth, behavior: "smooth" });
  }, []);

  const handleSelect = useCallback((system: SystemKey) => {
    setSelected(system);
    onSelect(system);
  }, [onSelect]);

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
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-sm font-mono text-white/40 hover:text-white/70 active:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Carousel area */}
      <div className="flex-1 relative flex items-center min-h-0 px-1">
        {/* Left chevron */}
        <button
          onClick={() => scrollCarousel(-1)}
          className="absolute left-1 z-10 flex items-center justify-center w-10 h-10 text-white/20 hover:text-white/50 transition-colors"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <span className="text-2xl font-mono">‹</span>
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex-1 flex gap-1 overflow-x-auto mx-10 min-h-0 h-full items-stretch"
          style={{
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            scrollBehavior: 'smooth',
          }}
        >
          {SYSTEMS.map((system, idx) => {
            const label = SYSTEM_LABELS[system];
            const isSelected = selected === system;
            const isAiPick = system === aiPick;

            return (
              <div
                key={system}
                className="shrink-0 flex flex-col"
                style={{
                  width: '28%',
                  scrollSnapAlign: 'start',
                }}
              >
                {/* Canvas card */}
                <motion.div
                  className="flex-1 relative rounded-lg overflow-hidden cursor-pointer"
                  style={{
                    border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)',
                  }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(system)}
                >
                  <canvas
                    ref={el => { canvasRefs.current[idx] = el; }}
                    className="absolute inset-0 w-full h-full"
                  />

                  {/* AI Pick label */}
                  {isAiPick && (
                    <div className="absolute top-2 left-2">
                      <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/30">
                        AI Pick
                      </p>
                    </div>
                  )}

                  {/* Selected — neon green editorial label */}
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-2 left-0 right-0 flex justify-center"
                    >
                      <p
                        className="text-[9px] font-mono uppercase tracking-[0.3em]"
                        style={{ color: 'rgba(57, 255, 20, 0.45)' }}
                      >
                        Selected
                      </p>
                    </motion.div>
                  )}
                </motion.div>

                {/* System name label */}
                <p className={`text-[9px] font-mono uppercase tracking-[0.2em] text-center py-1.5 transition-colors ${
                  isSelected ? 'text-white/60' : 'text-white/25'
                }`}>
                  {label.name}
                </p>
              </div>
            );
          })}
        </div>

        {/* Right chevron */}
        <button
          onClick={() => scrollCarousel(1)}
          className="absolute right-1 z-10 flex items-center justify-center w-10 h-10 text-white/20 hover:text-white/50 transition-colors"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <span className="text-2xl font-mono">›</span>
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 py-2 shrink-0">
        {SYSTEMS.map((s) => (
          <div
            key={s}
            className={`w-1 h-1 rounded-full transition-all ${
              selected === s ? 'bg-white/60 scale-150' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}
