import type { BillboardMode, FeedView } from "./types";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
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
  const activeMode = modes.find(m => m.key === billboardMode) || modes[0];

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
            FMLY 40
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "ml-1 flex items-center gap-0.5 transition-colors py-2.5 px-1 rounded",
                  view === "billboard"
                    ? "text-primary hover:text-primary/80"
                    : "text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                <ChevronDown size={12} className="opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 bg-popover z-50">
              {modes.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => { onModeChange(key); onViewChange("billboard"); }}
                  className={cn(
                    "text-sm",
                    billboardMode === key && "text-primary font-semibold"
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


