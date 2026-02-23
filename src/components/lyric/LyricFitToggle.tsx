import { cn } from "@/lib/utils";

export type LyricFitView = "lyrics" | "fit";

interface Props {
  view: LyricFitView;
  onViewChange: (v: LyricFitView) => void;
  fitDisabled?: boolean;
}

export function LyricFitToggle({ view, onViewChange, fitDisabled }: Props) {
  return (
    <div className="border-b border-border/40">
      <div className="flex">
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => onViewChange("lyrics")}
            className={cn(
              "py-2.5 text-sm transition-all duration-150",
              view === "lyrics"
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            Lyrics
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => {
              if (!fitDisabled) onViewChange("fit");
            }}
            className={cn(
              "py-2.5 text-sm transition-all duration-150",
              fitDisabled && "opacity-30 pointer-events-none",
              view === "fit"
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}
