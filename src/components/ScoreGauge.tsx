import { motion } from "framer-motion";
import { getFitLabelDisplay, type HealthOutput } from "@/lib/playlistHealthEngine";

interface ScoreGaugeProps {
  score: number;
  label: HealthOutput["summary"]["healthLabel"];
  size?: number;
  hideLabel?: boolean;
}

export function ScoreGauge({ score, label, size = 200, hideLabel = false }: ScoreGaugeProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const fitDisplay = getFitLabelDisplay(label);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative score-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-5xl font-bold font-mono text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            / 100
          </span>
        </div>
      </div>
      {!hideLabel && (
        <motion.span
          className="font-mono text-[11px] tracking-widest uppercase border border-border/40 px-3 py-1 rounded-sm text-foreground"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {fitDisplay.text}
        </motion.span>
      )}
    </div>
  );
}
