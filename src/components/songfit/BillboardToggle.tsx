import type { BillboardMode, FeedView } from "./types";
import { cn } from "@/lib/utils";
import { Flame, Trophy, Target, Crown, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
}

const modes: { key: BillboardMode; label: string; icon: typeof Flame; tip: string }[] = [
  { key: "trending", label: "Trending", icon: Flame, tip: "Hottest posts by recent engagement velocity" },
  { key: "top", label: "Top", icon: Trophy, tip: "Highest engagement score this cycle" },
  { key: "best_fit", label: "Best Fit", icon: Target, tip: "Best sonic match to your taste" },
  { key: "all_time", label: "All-Time", icon: Crown, tip: "Legendary posts across all cycles" },
];

export function BillboardToggle({ view, onViewChange, billboardMode, onModeChange }: Props) {
  const activeMode = modes.find(m => m.key === billboardMode) || modes[0];
  const ActiveIcon = activeMode.icon;

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
          <TooltipProvider delayDuration={350}>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "ml-1 flex items-center gap-0.5 transition-colors py-2.5 px-1 rounded",
                        view === "billboard"
                          ? "text-primary hover:text-primary/80"
                          : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                    >
                      <ActiveIcon size={14} />
                      <ChevronDown size={10} className="opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {activeMode.tip}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center" className="w-44">
                {modes.map(({ key, label, icon: Icon, tip }) => (
                  <TooltipProvider key={key} delayDuration={350}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onClick={() => { onModeChange(key); onViewChange("billboard"); }}
                          className={cn(
                            "flex items-center gap-2",
                            billboardMode === key && "text-primary font-semibold"
                          )}
                        >
                          <Icon size={15} />
                          <span>{label}</span>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {tip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
