import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgeCheck } from "lucide-react";

interface Props {
  size?: number;
  className?: string;
}

export function VerifiedBadge({ size = 14, className = "" }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center shrink-0 ${className}`}>
          <BadgeCheck size={size} className="text-white fill-blue-500" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Verified Artist
      </TooltipContent>
    </Tooltip>
  );
}
