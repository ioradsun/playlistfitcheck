
import { useState } from "react";
import { RefreshCw, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ProfanityReport } from "@/lib/profanityFilter";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface FmlyFriendlyPanelProps {
  hasFmly: boolean;
  report: ProfanityReport | null;
  onGenerate: () => void;
  onSeek?: (time: number) => void;
}

export function FmlyFriendlyPanel({ hasFmly, report, onGenerate, onSeek }: FmlyFriendlyPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(false);

  const handleClick = () => {
    if (hasFmly) {
      setConfirmOpen(true);
    } else {
      onGenerate();
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleClick}
        size="sm"
        variant={hasFmly ? "outline" : "default"}
        className="w-full h-8 text-xs"
      >
        {hasFmly ? "Regenerate" : "FMLY VERSION"}
      </Button>

      {report && (
        <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
          <button
            className="w-full flex items-center justify-between text-[11px] font-medium text-foreground"
            onClick={() => setReportExpanded(!reportExpanded)}
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-primary" />
              FMLY Friendly Report
            </span>
            {reportExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-muted/30 rounded p-1.5 text-center">
              <div className="text-lg font-bold text-foreground">{report.totalFlagged}</div>
              <div className="text-muted-foreground">Total flagged</div>
            </div>
            <div className="bg-muted/30 rounded p-1.5 text-center">
              <div className="text-lg font-bold text-foreground">{report.uniqueFlagged}</div>
              <div className="text-muted-foreground">Unique words</div>
            </div>
          </div>

          {reportExpanded && report.flaggedWords.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] text-muted-foreground font-mono">Breakdown (censored)</p>
              {report.flaggedWords.map((fw) => (
                <div
                  key={fw.original}
                  className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/30 last:border-0"
                >
                  <span className="font-mono text-foreground/80">{fw.censored}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>×{fw.count}</span>
                    {onSeek && (
                      <button
                        onClick={() => onSeek(fw.firstTimestamp)}
                        className="text-primary hover:underline"
                      >
                        {formatTime(fw.firstTimestamp)}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate FMLY Friendly version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite your existing FMLY Friendly version with a fresh filter pass. Any manual edits you made to that version will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onGenerate(); }}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
