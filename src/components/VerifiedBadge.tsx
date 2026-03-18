import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  size?: number;
  className?: string;
}

/**
 * Verified Artist indicator — a minimal green checkmark with a
 * translucent dark backing for legibility on any surface.
 */
export function VerifiedBadge({ size = 14, className = "" }: Props) {
  const r = size / 2;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Subtle dark disc for contrast */}
            <circle cx="8" cy="8" r="7.5" fill="rgba(0,0,0,0.6)" />
            {/* Green checkmark — 2px stroke, rounded caps */}
            <path
              d="M5 8.2 7 10.2 11 6"
              stroke="#4ade80"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Verified Artist
      </TooltipContent>
    </Tooltip>
  );
}
