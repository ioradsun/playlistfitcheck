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

export function CategoryBar({ label, description, dataLabel, score, max, delay = 0, indicator }: CategoryBarProps) {
  const isNull = score === null;
  const pct = isNull ? 0 : (score / max) * 100;

  // Neutral opacity-based fill: full score = full foreground opacity
  const opacity = isNull ? 0 : Math.max(0.25, pct / 100);

  return (
    <motion.div
      className={`space-y-1.5 ${isNull ? "opacity-40" : ""}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isNull ? 0.4 : 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div className="flex justify-between items-center text-sm">
        <span className="flex items-center gap-1.5 text-secondary-foreground">
          {indicator && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {indicator === "✅" ? "●" : indicator === "⚠️" ? "◐" : "○"}
            </span>
          )}
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
        <span className="font-mono text-foreground text-sm">
          {isNull ? (
            <span className="text-muted-foreground text-xs">N/A</span>
          ) : (
            <>{score}<span className="text-muted-foreground text-xs">/{max}</span></>
          )}
        </span>
      </div>
      {dataLabel && (
        <p className="text-[10px] font-mono text-muted-foreground leading-snug">{dataLabel}</p>
      )}
      <div className="h-[3px] bg-border/40 overflow-hidden">
        {!isNull && (
          <motion.div
            className="h-full bg-foreground"
            style={{ opacity }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: "easeOut" }}
          />
        )}
      </div>
    </motion.div>
  );
}
