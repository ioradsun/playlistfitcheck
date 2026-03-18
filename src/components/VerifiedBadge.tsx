import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  size?: number;
  className?: string;
}

export function VerifiedBadge({ size = 12, className = "" }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center shrink-0 ${className}`}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Badge shape — filled green, no stroke */}
            <path
              d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
              className="fill-green-400"
            />
            {/* Checkmark — white stroke, no fill */}
            <path
              d="m9 12 2 2 4-4"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
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
