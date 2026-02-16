import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTrailblazer } from "@/hooks/useTrailblazer";

interface TrailblazerBadgeProps {
  userId?: string | null;
  compact?: boolean;
}

export function TrailblazerBadge({ userId, compact = false }: TrailblazerBadgeProps) {
  const { number, total, isBlazer, loading } = useTrailblazer(userId);

  if (loading || !isBlazer) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          className={`inline-flex items-center gap-1 rounded-full font-semibold cursor-default border border-primary/30 bg-primary/10 text-primary ${
            compact ? "px-1.5 py-0 text-[9px]" : "px-2.5 py-0.5 text-[11px]"
          }`}
          whileHover={{ scale: 1.08, boxShadow: "0 0 12px hsl(var(--primary) / 0.4)" }}
          transition={{ duration: 0.2 }}
        >
          <Star size={compact ? 8 : 11} className="fill-primary" />
          <span className="text-primary/60 font-mono">#{number}/1,000</span>
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[240px]">
        One of the first artists shaping the future of toolsFM.
      </TooltipContent>
    </Tooltip>
  );
}
