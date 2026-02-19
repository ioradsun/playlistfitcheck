import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTrailblazer } from "@/hooks/useTrailblazer";

interface TrailblazerBadgeProps {
  userId?: string | null;
  compact?: boolean;
}

export function TrailblazerBadge({ userId, compact = false }: TrailblazerBadgeProps) {
  const { number, total, isBlazer, loading } = useTrailblazer(userId);

  if (loading || !isBlazer) return null;

  const serial = String(number).padStart(4, "0");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.span
          className={`inline-flex items-center font-mono rounded border-[0.5px] border-green-500/50 bg-transparent text-green-500/70 cursor-default tracking-wider ${
            compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]"
          }`}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
        >
          {serial}
        </motion.span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[240px] space-y-1">
        <p className="font-semibold font-mono">PIONEER · UNIT {serial}</p>
        <p>One of the first artists shaping the future of toolsFM.</p>
      </TooltipContent>
    </Tooltip>
  );
}
