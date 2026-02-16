import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTrailblazer } from "@/hooks/useTrailblazer";

interface TrailblazerBadgeProps {
  userId?: string | null;
  /** Compact mode for feed cards */
  compact?: boolean;
  /** Show the progress counter */
  showCounter?: boolean;
}

export function TrailblazerBadge({ userId, compact = false, showCounter = false }: TrailblazerBadgeProps) {
  const { number, total, isBlazer, loading } = useTrailblazer(userId);
  const [hovered, setHovered] = useState(false);

  if (loading) return null;

  // Not a trailblazer — show locked hint (only in non-compact mode)
  if (!isBlazer) {
    if (compact) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground/50 cursor-default grayscale">
            <Star size={10} />
            Pioneer
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[220px]">
          Be one of the first 1,000 artists to claim your Pioneer badge!
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          className={`inline-flex items-center gap-1 rounded-full font-semibold cursor-default border border-primary/30 bg-primary/10 text-primary ${
            compact ? "px-1.5 py-0 text-[9px]" : "px-2.5 py-0.5 text-[11px]"
          }`}
          animate={hovered ? { scale: 1.08, boxShadow: "0 0 12px hsl(var(--primary) / 0.4)" } : { scale: 1, boxShadow: "0 0 0px transparent" }}
          transition={{ duration: 0.2 }}
        >
          <Star size={compact ? 8 : 11} className="fill-primary" />
          Pioneer
          {showCounter && (
            <span className="text-primary/60 font-mono ml-0.5">#{number}</span>
          )}
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[260px] space-y-1">
        <p className="font-semibold">🌟 Pioneer #{number} / 1,000</p>
        <p>It's early. You're one of {total} artists shaping the future of toolsFM. Your feedback builds the tools.</p>
      </TooltipContent>
    </Tooltip>
  );
}
