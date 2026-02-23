import { cn } from "@/lib/utils";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";
import type { FitReadiness } from "./LyricFitTab";

export type LyricFitView = "lyrics" | "fit";

interface Props {
  view: LyricFitView;
  onViewChange: (v: LyricFitView) => void;
  fitDisabled?: boolean;
  fitReadiness?: FitReadiness;
  fitProgress?: number;
  fitStageLabel?: string;
}

export function LyricFitToggle({ view, onViewChange, fitDisabled, fitReadiness = "not_started", fitProgress = 0, fitStageLabel }: Props) {
  const isLocked = fitDisabled || (fitReadiness !== "ready");
  const isRunning = fitReadiness === "running";
  const isError = fitReadiness === "error";
  const isReady = fitReadiness === "ready";

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
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <button
            onClick={() => {
              if (!isLocked) onViewChange("fit");
            }}
            className={cn(
              "py-2.5 text-sm transition-all duration-150 flex items-center gap-1.5",
              isLocked && "opacity-40 cursor-not-allowed",
              view === "fit"
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground"
            )}
          >
            {isRunning && <Loader2 size={12} className="animate-spin text-primary" />}
            {isLocked && !isRunning && !isError && <Lock size={10} />}
            {isReady && <CheckCircle2 size={12} className="text-green-500" />}
            Fit
          </button>
          {/* Progress bar under Fit tab */}
          {isRunning && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${fitProgress}%` }}
              />
            </div>
          )}
          {/* Locked message */}
          {isLocked && !isError && fitStageLabel && (
            <span className="text-[9px] text-muted-foreground/60 absolute -bottom-3.5 whitespace-nowrap">
              {fitStageLabel}
            </span>
          )}
          {isError && (
            <span className="text-[9px] text-destructive absolute -bottom-3.5 whitespace-nowrap">
              Failed — retry from Fit tab
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
