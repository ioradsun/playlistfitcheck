import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface CategoryBarProps {
  label: string;
  description?: string;
  dataLabel?: string;
  score: number | null;
  max: number;
  delay?: number;
  indicator?: string;
}

function getBarColor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 85) return "bg-score-excellent";
  if (pct >= 65) return "bg-score-strong";
  if (pct >= 45) return "bg-score-ok";
  if (pct >= 25) return "bg-score-weak";
  return "bg-score-bad";
}

export function CategoryBar({ label, description, dataLabel, score, max, delay = 0, indicator }: CategoryBarProps) {
  const isNull = score === null;
  const pct = isNull ? 0 : (score / max) * 100;

  return (
    <motion.div
      className={`space-y-1.5 ${isNull ? "opacity-40" : ""}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isNull ? 0.4 : 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div className="flex justify-between items-center text-sm">
        <span className="flex items-center gap-1.5 text-secondary-foreground">
          {indicator && <span className="text-xs">{indicator}</span>}
          {label}
          {description && (
            <TooltipProvider delayDuration={350}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  {description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
        <span className="font-mono text-foreground">
          {isNull ? (
            <span className="text-muted-foreground text-xs">N/A</span>
          ) : (
            <>{score}<span className="text-muted-foreground">/{max}</span></>
          )}
        </span>
      </div>
      {dataLabel && (
        <p className="text-[11px] font-mono text-primary/70 leading-snug">{dataLabel}</p>
      )}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        {!isNull && (
          <motion.div
            className={`h-full rounded-full ${getBarColor(score, max)}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: "easeOut" }}
          />
        )}
      </div>
    </motion.div>
  );
}
