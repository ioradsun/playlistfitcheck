import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AudioWaveform, Upload, Shrink, Mic, Clock, Shield, Sparkles } from "lucide-react";

export type ProgressStage =
  | "compressing"
  | "encoding"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "finalizing";

interface StageConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  tip: string;
}

const STAGES: Record<ProgressStage, StageConfig> = {
  compressing: {
    label: "Compressing Audio",
    icon: Shrink,
    color: "text-blue-400",
    tip: "Optimizing file size for faster processing…",
  },
  encoding: {
    label: "Encoding",
    icon: AudioWaveform,
    color: "text-blue-400",
    tip: "Preparing audio data…",
  },
  uploading: {
    label: "Uploading",
    icon: Upload,
    color: "text-sky-400",
    tip: "Sending to our servers…",
  },
  transcribing: {
    label: "Transcribing Lyrics",
    icon: Mic,
    color: "text-emerald-400",
    tip: "Listening for every word and ad-lib…",
  },
  analyzing: {
    label: "Finding the Hook",
    icon: Sparkles,
    color: "text-amber-400",
    tip: "Detecting BPM, key, mood & hook…",
  },
  finalizing: {
    label: "Quality Check",
    icon: Shield,
    color: "text-violet-400",
    tip: "Aligning timestamps & building your lyrics…",
  },
};

const STAGE_ORDER: ProgressStage[] = [
  "compressing",
  "encoding",
  "uploading",
  "transcribing",
  "analyzing",
  "finalizing",
];

interface Props {
  open: boolean;
  currentStage: ProgressStage;
  fileName?: string;
}

function PulsingDot({ className }: { className?: string }) {
  return (
    <span className={`relative flex h-2.5 w-2.5 ${className}`}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-current" />
    </span>
  );
}

export function LyricProgressModal({ open, currentStage, fileName }: Props) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!open) { setElapsedSec(0); return; }
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm glass-card rounded-2xl p-6 space-y-5"
          >
            {/* Header */}
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">Syncing Lyrics</h3>
              {fileName && (
                <p className="text-xs text-muted-foreground font-mono truncate max-w-[260px] mx-auto">
                  {fileName}
                </p>
              )}
            </div>

            {/* Stages */}
            <div className="space-y-1">
              {STAGE_ORDER.map((stage, idx) => {
                const config = STAGES[stage];
                const Icon = config.icon;
                const isActive = idx === currentIdx;
                const isDone = idx < currentIdx;
                const isPending = idx > currentIdx;

                return (
                  <motion.div
                    key={stage}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-300 ${
                      isActive
                        ? "bg-primary/10"
                        : isDone
                        ? "bg-muted/30"
                        : ""
                    }`}
                  >
                    {/* Icon column */}
                    <div className="w-6 h-6 flex items-center justify-center shrink-0">
                      {isDone ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", damping: 15 }}
                        >
                          <Check size={16} className="text-emerald-400" />
                        </motion.div>
                      ) : isActive ? (
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        >
                          <Icon size={16} className={config.color} />
                        </motion.div>
                      ) : (
                        <Icon size={16} className="text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium transition-colors duration-300 ${
                          isActive
                            ? "text-foreground"
                            : isDone
                            ? "text-muted-foreground"
                            : "text-muted-foreground/40"
                        }`}
                      >
                        {config.label}
                      </p>
                      {isActive && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="text-[11px] text-muted-foreground mt-0.5"
                        >
                          {config.tip}
                        </motion.p>
                      )}
                    </div>

                    {/* Status indicator */}
                    <div className="w-5 flex justify-center shrink-0">
                      {isActive && <PulsingDot className={config.color} />}
                      {isDone && (
                        <span className="text-[10px] text-muted-foreground">✓</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">
                {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
