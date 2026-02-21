/**
 * DirectorsCutScreen — Full-screen overlay showing all 5 physics systems
 * rendered simultaneously on the same hook. The artist picks one by feel.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PhysicsIntegrator, mulberry32, hashSeed, type PhysicsSpec, type PhysicsState } from "@/engine/PhysicsIntegrator";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import type { LyricLine } from "./LyricDisplay";
import type { BeatTick } from "@/engine/HookDanceEngine";

// ── System definitions ──────────────────────────────────────────────────────

const SYSTEMS = ["fracture", "pressure", "breath", "combustion", "orbit"] as const;
type SystemKey = typeof SYSTEMS[number];

const SYSTEM_LABELS: Record<SystemKey, { name: string; subtitle: string }> = {
  fracture:   { name: "FRACTURE",   subtitle: "Your words are glass" },
  pressure:   { name: "PRESSURE",   subtitle: "Your words have mass" },
  breath:     { name: "BREATH",     subtitle: "Your words are heat" },
  combustion: { name: "COMBUSTION", subtitle: "Your words smolder" },
  orbit:      { name: "ORBIT",      subtitle: "Your words have gravity" },
};

/** Multipliers applied to base AI spec per system */
const SYSTEM_MULTIPLIERS: Record<SystemKey, Record<string, number>> = {
  fracture:   {},
  pressure:   { mass: 1.2, elasticity: 0.8 },
  breath:     { damping: 1.3, heat: 1.6 },
  combustion: { heat: 2.0, brittleness: 0.5 },
  orbit:      { elasticity: 1.4, damping: 0.7 },
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
  audioSrc: string;       // object URL for audio
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
  audioSrc,
  seedBase,
  onSelect,
  onClose,
}: Props) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null, null]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const renderersRef = useRef<SystemRenderer[]>([]);
  const prevTimeRef = useRef(hookStart);

  const [selected, setSelected] = useState<SystemKey>(baseSpec.system as SystemKey || "fracture");
  const [hovered, setHovered] = useState<SystemKey | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);

  const isLowEnd = useMemo(() => (navigator.hardwareConcurrency ?? 2) < 4, []);
  const aiPick = (baseSpec.system as SystemKey) || "fracture";

  // Filter beats to hook region
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

  // Audio setup + animation loop
  useEffect(() => {
    const audio = new Audio(audioSrc);
    audio.volume = 0; // silent preview
    audioRef.current = audio;

    // Try to play audio for timing, but start the loop regardless
    let audioReady = false;
    audio.addEventListener("canplay", () => {
      audioReady = true;
      audio.currentTime = hookStart;
      audio.play().catch(() => {});
    });
    audio.load();

    // Fallback: use a synthetic clock if audio never loads
    const syntheticStartTime = performance.now();
    const hookDuration = hookEnd - hookStart;

    function startLoop() {
      const tick = () => {
        let ct: number;
        if (audioReady && audioRef.current && !isNaN(audioRef.current.currentTime)) {
          ct = audioRef.current.currentTime;
        } else {
          // Synthetic clock loops over hook region
          const elapsed = (performance.now() - syntheticStartTime) / 1000;
          ct = hookStart + (elapsed % hookDuration);
        }

        // Loop audio if needed
        if (audioReady && audioRef.current && (ct >= hookEnd || ct < hookStart)) {
          audioRef.current.currentTime = hookStart;
          prevTimeRef.current = hookStart;
          renderersRef.current.forEach(r => {
            r.integrator.reset();
            r.beatIndex = 0;
          });
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Synthetic loop reset
        if (!audioReady && ct >= hookEnd) {
          prevTimeRef.current = hookStart;
          renderersRef.current.forEach(r => {
            r.integrator.reset();
            r.beatIndex = 0;
          });
        }

        const prev = prevTimeRef.current;

        // Update each renderer
        for (const renderer of renderersRef.current) {
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

          const sysIdx = SYSTEMS.indexOf(renderer.system);
          const canvas = canvasRefs.current[sysIdx];
          if (!canvas) continue;

          if (isLowEnd && sysIdx !== mobileIndex) continue;

          drawSystemCanvas(canvas, state, renderer, ct);
        }

        prevTimeRef.current = ct;
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    // Start loop immediately — don't wait for audio
    startLoop();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [audioSrc, hookStart, hookEnd, hookBeats, isLowEnd, mobileIndex]);

  // Canvas drawing
  const drawSystemCanvas = useCallback((
    canvas: HTMLCanvasElement,
    physState: PhysicsState,
    renderer: SystemRenderer,
    currentTime: number,
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize
    const rect = canvas.getBoundingClientRect();
    const isFocus = renderer.system === selected || renderer.system === hovered;
    const res = isFocus ? 1 : 0.5;
    const dpr = (window.devicePixelRatio || 1) * res;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const w = rect.width;
    const h = rect.height;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // System-specific background
    const bgPalette = renderer.spec.palette || ["#ffffff", "#a855f7", "#ec4899"];
    drawSystemBackground(ctx, {
      system: renderer.system,
      physState: physState,
      w,
      h,
      time: currentTime,
      beatCount: renderer.beatIndex,
      rng: renderer.prng,
      palette: bgPalette,
      hookStart,
      hookEnd,
    });

    // Find active line
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

      const safeW = w * 0.85;
      const charCount = Math.max(1, activeLine.text.length);
      const dynamicFs = Math.min(w * 0.06, 42, (safeW / charCount) * 1.6);
      const fs = Math.max(Math.round(dynamicFs), 10);

      const palette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];

      const effectState: EffectState = {
        text: activeLine.text,
        physState: physState,
        w,
        h,
        fs,
        age,
        progress,
        rng: renderer.prng,
        palette,
        system: renderer.system,
      };

      drawFn(ctx, effectState);
    }

    // Progress bar
    const hookProgress = (currentTime - hookStart) / (hookEnd - hookStart);
    ctx.fillStyle = (renderer.spec.palette?.[1]) || "#a855f7";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, h - 2, w * Math.max(0, Math.min(1, hookProgress)), 2);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [lines, hookStart, hookEnd, selected, hovered]);

  const handleConfirm = useCallback(() => {
    onSelect(selected);
  }, [selected, onSelect]);

  // ── Mobile navigation ─────────────────────────────────────────────────────

  if (isLowEnd) {
    const sys = SYSTEMS[mobileIndex];
    const label = SYSTEM_LABELS[sys];
    return (
      <motion.div
        className="fixed inset-0 z-50 bg-black flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* AI Pick badge */}
        {sys === aiPick && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-[10px] font-mono text-red-500 tracking-[0.2em] uppercase">
            AI Pick
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          <canvas
            ref={el => { canvasRefs.current[mobileIndex] = el; }}
            className={`absolute inset-0 w-full h-full ${selected === sys ? "ring-1 ring-red-500" : ""}`}
            onClick={() => setSelected(sys)}
          />
        </div>

        {/* Label */}
        <div className="text-center py-3">
          <p className="text-lg font-bold tracking-[0.15em] text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {label.name}
          </p>
          <p className="text-[11px] text-white/40 italic">{label.subtitle}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-4">
          <button
            onClick={() => setMobileIndex(Math.max(0, mobileIndex - 1))}
            className="text-white/40 hover:text-white disabled:opacity-20"
            disabled={mobileIndex === 0}
          >
            <ChevronLeft size={28} />
          </button>

          {/* Dots */}
          <div className="flex gap-2">
            {SYSTEMS.map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${i === mobileIndex ? "bg-white" : "bg-white/20"}`}
              />
            ))}
          </div>

          <button
            onClick={() => setMobileIndex(Math.min(4, mobileIndex + 1))}
            className="text-white/40 hover:text-white disabled:opacity-20"
            disabled={mobileIndex === 4}
          >
            <ChevronRight size={28} />
          </button>
        </div>

        {/* Confirm */}
        <div className="px-6 pb-6">
          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-lg text-sm font-bold tracking-[0.15em] uppercase transition-all bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
          >
            This One →
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Desktop: 5-canvas grid ────────────────────────────────────────────────

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/30 hover:text-white text-xs font-mono uppercase tracking-wider transition-colors"
      >
        ✕ Close
      </button>

      {/* Title */}
      <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] mb-4 mt-2">
        Director's Cut — Choose your physics
      </p>

      {/* Grid: 2-2-1 layout */}
      <div className="flex flex-col gap-3 items-center w-full max-w-[92vw]">
        {/* Row 1 */}
        <div className="flex gap-3 w-full justify-center">
          {renderSystemCard(0)}
          {renderSystemCard(1)}
        </div>
        {/* Row 2 */}
        <div className="flex gap-3 w-full justify-center">
          {renderSystemCard(2)}
          {renderSystemCard(3)}
        </div>
        {/* Row 3 — centered */}
        <div className="flex justify-center w-full">
          {renderSystemCard(4)}
        </div>
      </div>

      {/* THIS ONE button */}
      <div className="mt-4 mb-2">
        <button
          onClick={handleConfirm}
          className="px-10 py-2.5 rounded-lg text-sm font-bold tracking-[0.15em] uppercase transition-all bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
        >
          This One →
        </button>
      </div>
    </motion.div>
  );

  function renderSystemCard(idx: number) {
    const sys = SYSTEMS[idx];
    const label = SYSTEM_LABELS[sys];
    const isSelected = selected === sys;
    const isAiPick = sys === aiPick;

    return (
      <div
        key={sys}
        className="flex flex-col items-center gap-1 cursor-pointer group"
        onClick={() => setSelected(sys)}
        onMouseEnter={() => setHovered(sys)}
        onMouseLeave={() => setHovered(null)}
      >
        {/* AI Pick badge */}
        <div className="h-4">
          {isAiPick && (
            <span className="text-[9px] font-mono text-red-500 tracking-[0.15em] uppercase">
              AI Pick
            </span>
          )}
        </div>

        {/* Canvas */}
        <div
          className={`relative w-[44vw] max-w-[380px] aspect-video rounded overflow-hidden transition-all duration-150 ${
            isSelected ? "ring-2 ring-red-500" : "ring-1 ring-white/10"
          } group-hover:scale-[1.02]`}
        >
          <canvas
            ref={el => { canvasRefs.current[idx] = el; }}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Label */}
        <p
          className={`text-sm tracking-[0.12em] transition-colors ${
            isSelected ? "text-white" : "text-white/30 group-hover:text-white/60"
          }`}
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {label.name}
        </p>
        <p className="text-[10px] text-white/25 italic -mt-1">{label.subtitle}</p>
      </div>
    );
  }
}
