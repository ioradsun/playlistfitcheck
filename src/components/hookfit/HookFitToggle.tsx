import type { HookFitFeedView } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  view: HookFitFeedView;
  onViewChange: (v: HookFitFeedView) => void;
}

export function HookFitToggle({ view, onViewChange }: Props) {
  return (
    <div className="border-b border-border/40">
      <div className="flex">
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => onViewChange("recent")}
            className={cn(
              "py-2.5 text-sm transition-all duration-150",
              view === "recent"
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            Recent
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => onViewChange("top")}
            className={cn(
              "py-2.5 text-sm transition-all duration-150",
              view === "top"
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            Most Hooked
          </button>
        </div>
      </div>
    </div>
  );
}
