import type { FeedView } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
}

export function BillboardToggle({ view, onViewChange }: Props) {
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

        <button
          onClick={() => onViewChange("billboard")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold text-center transition-colors border-b-2",
            view === "billboard"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          FMLY 40
        </button>
      </div>
    </div>
  );
}

