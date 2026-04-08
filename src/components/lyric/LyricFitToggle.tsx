import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, Bug } from "lucide-react";

export type LyricFitView = "lyrics" | "fit" | "data" | "debug";

interface Props {
  view: LyricFitView;
  onViewChange: (v: LyricFitView) => void;
  fitDisabled?: boolean;
  fitReady: boolean;
  isRunning?: boolean;
  isError?: boolean;
  showDebug?: boolean;
  hasData?: boolean;
  filmMode?: "song" | "beat";
}

const FitButton = forwardRef<HTMLButtonElement, { isLocked: boolean; isError: boolean; isReady: boolean; view: LyricFitView; onClick: () => void }>(
  ({ isLocked, isError, isReady, view, onClick, ...props }, ref) => (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        "py-2.5 text-sm transition-all duration-150 flex items-center gap-1.5",
        isLocked && "opacity-40 cursor-not-allowed",
        view === "fit"
          ? "font-medium text-foreground"
          : "font-normal text-muted-foreground"
      )}
      {...props}
    >
      {isLocked && !isError && <Loader2 size={12} className="animate-spin text-primary" />}
      {isReady && <CheckCircle2 size={12} className="text-primary" />}
      Video
    </button>
  )
);
FitButton.displayName = "FitButton";

export function LyricFitToggle({ view, onViewChange, fitDisabled, fitReady, isRunning = false, isError = false, showDebug, hasData = false, filmMode = "song" }: Props) {
  const isLocked = !!fitDisabled || !fitReady;
  const isReady = fitReady;
  const showLyricsTab = filmMode !== "beat";

  const handleClick = () => { if (!isLocked) onViewChange("fit"); };

  return (
    <div className="border-b border-border/40">
      <div className="flex max-w-2xl mx-auto">
        {showLyricsTab && (
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
        )}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <FitButton isLocked={isLocked} isError={isError} isReady={isReady} view={view} onClick={handleClick} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => {
              if (hasData) onViewChange("data");
            }}
            className={cn(
              "py-2.5 text-sm transition-all duration-150",
              !hasData && "opacity-30 cursor-default",
              hasData && view === "data"
                ? "font-medium text-foreground"
                : hasData
                  ? "font-normal text-muted-foreground"
                  : "",
            )}
          >
            Data
          </button>
        </div>
        {showDebug && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => onViewChange("debug")}
              className={cn(
                "py-2.5 text-sm transition-all duration-150 flex items-center gap-1.5",
                view === "debug"
                  ? "font-medium text-foreground"
                  : "font-normal text-muted-foreground"
              )}
            >
              <Bug size={12} />
              Debug
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
