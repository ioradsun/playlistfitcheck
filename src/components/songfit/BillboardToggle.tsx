import type { BillboardMode, FeedView } from "./types";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
}

const modeLabels: Record<BillboardMode, string> = {
  trending: "Trending",
  top: "Top",
  best_fit: "Best Fit",
  all_time: "All-Time",
};

export function BillboardToggle({ view, onViewChange, billboardMode, onModeChange }: Props) {
  return (
    <div className="border-b border-border/40">
      <div className="flex">
        <button
          onClick={() => onViewChange("recent")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold text-center transition-colors border-b-2",
            view === "recent"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Recent
        </button>

        {/* Billboard with inline dropdown */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => onViewChange("billboard")}
            className={cn(
              "py-2.5 text-sm font-semibold transition-colors border-b-2",
              view === "billboard"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Billboard
          </button>
          {view === "billboard" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2.5">
                  <span className="text-primary font-medium">{modeLabels[billboardMode]}</span>
                  <ChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-36">
                {(Object.keys(modeLabels) as BillboardMode[]).map(key => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onModeChange(key)}
                    className={cn(billboardMode === key && "text-primary font-semibold")}
                  >
                    {modeLabels[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
