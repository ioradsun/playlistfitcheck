import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ProgressStage =
  | "compressing"
  | "encoding"
  | "uploading"
  | "receiving"
  | "transcribing"
  | "separating"
  | "analyzing"
  | "detecting_hook"
  | "aligning"
  | "finalizing";

interface StageConfig {
  label: string;
  sublabel: string;
}

const STAGES: Record<ProgressStage, StageConfig> = {
  compressing: {
    label: "Compressing",
    sublabel: "Optimizing audio for transfer",
  },
  encoding: {
    label: "Encoding",
    sublabel: "Preparing data stream",
  },
  uploading: {
    label: "Uploading",
    sublabel: "Sending to engine",
  },
  receiving: {
    label: "Processing",
    sublabel: "Engine received your track",
  },
  transcribing: {
    label: "Transcribing",
    sublabel: "Listening for every word",
  },
  separating: {
    label: "Separating",
    sublabel: "Isolating vocals from mix",
  },
  analyzing: {
    label: "Analyzing",
    sublabel: "Detecting key, tempo & mood",
  },
  detecting_hook: {
    label: "Finding the Hook",
    sublabel: "Scoring catchiest moments",
  },
  aligning: {
    label: "Aligning",
    sublabel: "Matching words to timestamps",
  },
  finalizing: {
    label: "Finishing",
    sublabel: "Final quality check",
  },
};

const STAGE_ORDER: ProgressStage[] = [
  "compressing",
  "encoding",
  "uploading",
  "receiving",
  "transcribing",
  "separating",
  "analyzing",
  "detecting_hook",
  "aligning",
  "finalizing",
];

interface Props {
  open: boolean;
  currentStage: ProgressStage;
  fileName?: string;
}

export function LyricProgressModal({ open, currentStage, fileName }: Props) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!open) { setElapsedSec(0); return; }
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const progress = ((currentIdx + 1) / STAGE_ORDER.length) * 100;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[340px] space-y-8"
          >
            {/* Progress bar — single thin line */}
            <div className="space-y-6">
              <div className="h-[1px] w-full bg-border/40 overflow-hidden rounded-full">
                <motion.div
                  className="h-full bg-foreground"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>

              {/* Current stage — hero text */}
              <div className="text-center space-y-2">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentStage}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="text-[15px] font-medium tracking-[0.02em] text-foreground"
                  >
                    {STAGES[currentStage].label}
                  </motion.p>
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`sub-${currentStage}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                    className="text-[11px] text-muted-foreground tracking-wide"
                  >
                    {STAGES[currentStage].sublabel}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>

            {/* Stage dots */}
            <div className="flex items-center justify-center gap-2">
              {STAGE_ORDER.map((stage, idx) => {
                const isActive = idx === currentIdx;
                const isDone = idx < currentIdx;

                return (
                  <motion.div
                    key={stage}
                    className="relative"
                    animate={{
                      scale: isActive ? 1 : 0.85,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                        isDone
                          ? "bg-foreground"
                          : isActive
                          ? "bg-foreground"
                          : "bg-border"
                      }`}
                    />
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-foreground/30"
                        animate={{ scale: [1, 2.5, 1], opacity: [0.4, 0, 0.4] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* File name + timer */}
            <div className="text-center space-y-1">
              {fileName && (
                <p className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[280px] mx-auto tracking-wider">
                  {fileName}
                </p>
              )}
              <p className="text-[10px] font-mono text-muted-foreground/40 tabular-nums tracking-widest">
                {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
