import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Lock, CheckCircle2, Circle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { FitReadiness, PipelineStages, PipelineStageStatus } from "./LyricFitTab";

export type LyricFitView = "lyrics" | "fit";

interface Props {
  view: LyricFitView;
  onViewChange: (v: LyricFitView) => void;
  fitDisabled?: boolean;
  fitReadiness?: FitReadiness;
  fitProgress?: number;
  fitStageLabel?: string;
  pipelineStages?: PipelineStages;
}

const STAGE_LABELS: Record<keyof PipelineStages, string> = {
  rhythm: "Rhythm analysis",
  songDna: "Song DNA",
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

export function LyricFitToggle({ view, onViewChange, fitDisabled, fitReadiness = "not_started", fitProgress = 0, fitStageLabel, pipelineStages }: Props) {
  const isLocked = fitDisabled || (fitReadiness !== "ready");
  const isRunning = fitReadiness === "running";
  const isError = fitReadiness === "error";
  const isReady = fitReadiness === "ready";

  const handleClick = () => { if (!isLocked) onViewChange("fit"); };
  const showHover = isLocked && !isError && pipelineStages && fitReadiness !== "not_started";

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
          {showHover ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FitButton isLocked={isLocked} isRunning={isRunning} isError={isError} isReady={isReady} view={view} onClick={handleClick} />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="w-52 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-popover-foreground mb-1">Building your Fit…</p>
                  {(Object.keys(STAGE_LABELS) as (keyof PipelineStages)[]).map((key) => (
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
          {isRunning && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${fitProgress}%` }}
              />
            </div>
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
      </div>
    </div>
  );
}