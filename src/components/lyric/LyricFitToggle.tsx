import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Lock, CheckCircle2, Circle, Bug } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { FitReadiness, PipelineStages, PipelineStageStatus } from "./LyricFitTab";

export type LyricFitView = "lyrics" | "fit" | "data" | "debug";

interface Props {
  view: LyricFitView;
  onViewChange: (v: LyricFitView) => void;
  fitDisabled?: boolean;
  fitUnlocked?: boolean;
  fitReadiness?: FitReadiness;
  fitProgress?: number;
  fitStageLabel?: string;
  pipelineStages?: PipelineStages;
  showDebug?: boolean;
  hasData?: boolean;
  filmMode?: "song" | "beat";
}

const STAGE_LABELS: Record<keyof PipelineStages, string> = {
  rhythm: "Rhythm analysis",
  sections: "Section detection",
  cinematic: "Cinematic direction",
  transcript: "Final transcript sync",
};

function StageIcon({ status }: { status: PipelineStageStatus }) {
  if (status === "done") return <CheckCircle2 size={12} className="text-primary shrink-0" />;
  if (status === "running") return <Loader2 size={12} className="animate-spin text-primary shrink-0" />;
  return <Circle size={12} className="text-muted-foreground/40 shrink-0" />;
}

const FitButton = forwardRef<HTMLButtonElement, { isLocked: boolean; isRunning: boolean; isError: boolean; isReady: boolean; view: LyricFitView; onClick: () => void }>(
  ({ isLocked, isRunning, isError, isReady, view, onClick, ...props }, ref) => (
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
      {isRunning && <Loader2 size={12} className="animate-spin text-primary" />}
      {isLocked && !isRunning && !isError && <Lock size={10} />}
      {isReady && <CheckCircle2 size={12} className="text-primary" />}
      Fit
    </button>
  )
);
FitButton.displayName = "FitButton";

export function LyricFitToggle({ view, onViewChange, fitDisabled, fitUnlocked = false, fitReadiness = "not_started", fitProgress = 0, fitStageLabel, pipelineStages, showDebug, hasData = false, filmMode = "song" }: Props) {
  const isLocked = fitDisabled || (!fitUnlocked && fitReadiness !== "ready");
  const isRunning = fitReadiness === "running";
  const isError = fitReadiness === "error";
  const isReady = fitReadiness === "ready";
  const showLyricsTab = !(filmMode === "beat" && (fitUnlocked || fitReadiness === "ready"));
  const visibleStageKeys = (Object.keys(STAGE_LABELS) as (keyof PipelineStages)[])
    .filter((k) => !(filmMode === "beat" && k === "transcript"));

  const handleClick = () => { if (!isLocked) onViewChange("fit"); };
  const showHover = isLocked && !isError && pipelineStages && fitReadiness !== "not_started";

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
              {filmMode === "beat" ? "Upload" : "Lyrics"}
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {showHover ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FitButton isLocked={isLocked} isRunning={isRunning} isError={isError} isReady={isReady} view={view} onClick={handleClick} />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="w-52 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-popover-foreground mb-1">{filmMode === "beat" ? "Building your Fire…" : "Building your Fit…"}</p>
                  {visibleStageKeys.map((key) => (
                    <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <StageIcon status={pipelineStages![key]} />
                      <span className={cn(pipelineStages![key] === "done" && "text-popover-foreground")}>
                        {STAGE_LABELS[key]}
                      </span>
                    </div>
                  ))}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <FitButton isLocked={isLocked} isRunning={isRunning} isError={isError} isReady={isReady} view={view} onClick={handleClick} />
          )}
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
        {hasData && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => onViewChange("data")}
              className={cn(
                "py-2.5 text-sm transition-all duration-150",
                view === "data"
                  ? "font-medium text-foreground"
                  : "font-normal text-muted-foreground"
              )}
            >
              Data
            </button>
          </div>
        )}
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
