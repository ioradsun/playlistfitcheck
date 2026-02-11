import { motion } from "framer-motion";

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: number;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "hsl(var(--score-excellent))";
  if (score >= 75) return "hsl(var(--score-strong))";
  if (score >= 60) return "hsl(var(--score-ok))";
  if (score >= 40) return "hsl(var(--score-weak))";
  return "hsl(var(--score-bad))";
}

export function ScoreGauge({ score, label, size = 200 }: ScoreGaugeProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

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
            stroke={color}
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
            className="text-5xl font-bold font-mono"
            style={{ color }}
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
      <motion.span
        className="text-sm font-semibold uppercase tracking-[0.2em] font-mono"
        style={{ color }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        {label}
      </motion.span>
    </div>
  );
}
