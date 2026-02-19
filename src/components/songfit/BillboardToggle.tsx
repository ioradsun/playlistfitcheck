import type { BillboardMode, FeedView } from "./types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const modes: { key: BillboardMode; label: string }[] = [
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "all_time", label: "All-Time" },
];

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
}

export function BillboardToggle({ view, onViewChange, billboardMode, onModeChange }: Props) {
  return (
    <div className="border-b border-border/40">
      <div className="flex">
        <button
          onClick={(e) => { e.stopPropagation(); onViewChange("recent"); }}
          className={cn(
            "flex-1 py-2.5 text-sm text-center transition-all duration-150",
            view === "recent"
              ? "font-medium text-foreground"
              : "font-normal text-muted-foreground"
          )}
        >
          Recent
        </button>

        <div className="flex-1 flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={() => onViewChange("billboard")}
                className={cn(
                  "py-2.5 text-sm transition-all duration-150",
                  view === "billboard"
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground"
                )}
              >
                FMLY 40
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 bg-popover z-50">
              {modes.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => { onModeChange(key); onViewChange("billboard"); }}
                  className={cn(
                    "text-sm",
                    billboardMode === key && "text-foreground font-medium"
                  )}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}


