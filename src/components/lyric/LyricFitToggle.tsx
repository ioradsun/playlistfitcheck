import { cn } from "@/lib/utils";
import { Loader2, Lock, CheckCircle2, Circle, CircleDot } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
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
  transcript: "Transcript sync",
  rhythm: "Rhythm analysis",
  songDna: "Song DNA",
  cinematic: "Cinematic direction",
};

function StageIcon({ status }: { status: PipelineStageStatus }) {
  if (status === "done") return <CheckCircle2 size={12} className="text-primary shrink-0" />;
  if (status === "running") return <Loader2 size={12} className="animate-spin text-primary shrink-0" />;
  return <Circle size={12} className="text-muted-foreground/40 shrink-0" />;
}

export function LyricFitToggle({ view, onViewChange, fitDisabled, fitReadiness = "not_started", fitProgress = 0, fitStageLabel, pipelineStages }: Props) {
  const isLocked = fitDisabled || (fitReadiness !== "ready");
  const isRunning = fitReadiness === "running";
  const isError = fitReadiness === "error";
  const isReady = fitReadiness === "ready";

  const fitButton = (
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
      {isReady && <CheckCircle2 size={12} className="text-primary" />}
      Fit
    </button>
  );

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
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>{fitButton}</HoverCardTrigger>
              <HoverCardContent side="bottom" align="center" className="w-52 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground mb-1.5">Building your Fit…</p>
                {(Object.keys(STAGE_LABELS) as (keyof PipelineStages)[]).map((key) => (
                  <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StageIcon status={pipelineStages[key]} />
                    <span className={cn(pipelineStages[key] === "done" && "text-foreground")}>
                      {STAGE_LABELS[key]}
                    </span>
                  </div>
                ))}
              </HoverCardContent>
            </HoverCard>
          ) : (
            fitButton
          )}
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
