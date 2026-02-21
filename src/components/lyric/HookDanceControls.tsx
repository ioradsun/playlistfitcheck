/**
 * HookDanceControls — Bottom overlay strip for live creative control
 * of the Hook Dance visualizer. Editorial-styled, minimal footprint.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";

// ── Palette presets ─────────────────────────────────────────────────────────

export const PALETTE_PRESETS: { label: string; colors: string[] }[] = [
  { label: "Original", colors: [] }, // empty = use AI palette
  { label: "Neon", colors: ["#00ffcc", "#ff00ff", "#ffffff"] },
  { label: "Ember", colors: ["#ff4500", "#ff8c00", "#ffd700"] },
  { label: "Ice", colors: ["#00bfff", "#e0f7ff", "#ffffff"] },
  { label: "Violet", colors: ["#7c3aed", "#c084fc", "#f5f3ff"] },
  { label: "Mono", colors: ["#ffffff", "#888888", "#333333"] },
  { label: "Blood", colors: ["#dc2626", "#450a0a", "#ffffff"] },
  { label: "Ocean", colors: ["#0ea5e9", "#164e63", "#a5f3fc"] },
];

// ── Physics systems ─────────────────────────────────────────────────────────

export const SYSTEM_OPTIONS = [
  { key: "fracture", label: "Fracture" },
  { key: "pressure", label: "Pressure" },
  { key: "breath", label: "Breath" },
  { key: "combustion", label: "Combustion" },
  { key: "orbit", label: "Orbit" },
];

// ── Energy levels ───────────────────────────────────────────────────────────

export const ENERGY_OPTIONS = [
  { key: "low", label: "Low", multiplier: 0.5 },
  { key: "mid", label: "Mid", multiplier: 1.0 },
  { key: "high", label: "High", multiplier: 1.8 },
  { key: "max", label: "Max", multiplier: 3.0 },
];

export interface HookDanceOverrides {
  palette?: string[];
  system?: string;
  energyMultiplier?: number;
}

interface Props {
  currentSystem: string;
  currentPalette: string[];
  overrides: HookDanceOverrides;
  onChange: (overrides: HookDanceOverrides) => void;
}

export function HookDanceControls({ currentSystem, currentPalette, overrides, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const activeSystem = overrides.system || currentSystem;
  const activePaletteLabel = PALETTE_PRESETS.find(
    p => p.colors.length > 0 && JSON.stringify(p.colors) === JSON.stringify(overrides.palette)
  )?.label ?? "Original";
  const activeEnergy = ENERGY_OPTIONS.find(e => e.multiplier === overrides.energyMultiplier)?.key ?? "mid";

  return (
    <div className="absolute bottom-8 left-0 right-0 z-20 flex flex-col items-center pointer-events-none">
      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="pointer-events-auto mb-2 text-white/30 hover:text-white/70 transition-colors"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto w-[90%] max-w-md rounded-lg bg-black/70 backdrop-blur-md border border-white/10 p-3 space-y-3"
          >
            {/* Palette */}
            <ControlRow label="Palette">
              <div className="flex gap-1.5 flex-wrap">
                {PALETTE_PRESETS.map((p) => {
                  const isActive = p.label === activePaletteLabel;
                  const displayColors = p.colors.length > 0 ? p.colors : currentPalette;
                  return (
                    <button
                      key={p.label}
                      onClick={() => onChange({ ...overrides, palette: p.colors.length > 0 ? p.colors : undefined })}
                      className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      <div className="flex -space-x-0.5">
                        {displayColors.slice(0, 3).map((c, i) => (
                          <div
                            key={i}
                            className="w-2.5 h-2.5 rounded-full border border-white/20"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </ControlRow>

            {/* Physics System */}
            <ControlRow label="Physics">
              <div className="flex gap-1">
                {SYSTEM_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => onChange({ ...overrides, system: s.key === currentSystem ? undefined : s.key })}
                    className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      activeSystem === s.key
                        ? "bg-white/20 text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </ControlRow>

            {/* Energy */}
            <ControlRow label="Energy">
              <div className="flex gap-1">
                {ENERGY_OPTIONS.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => onChange({ ...overrides, energyMultiplier: e.multiplier === 1.0 ? undefined : e.multiplier })}
                    className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      activeEnergy === e.key
                        ? "bg-white/20 text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </ControlRow>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30">{label}</span>
      {children}
    </div>
  );
}
