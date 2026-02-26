import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  fileName?: string;
  loading: boolean;
  onRetry?: () => void;
  onBack?: () => void;
}

export function LyricSkeleton({ title, fileName, loading, onRetry, onBack }: Props) {
  const lineWidths = useMemo(
    () => Array.from({ length: 14 }, () => 40 + Math.random() * 50),
    [],
  );

  return (
    <div className="flex-1 px-4 py-6 space-y-5 max-w-2xl mx-auto w-full">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      )}

      {/* Title */}
      <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">
        {title}
      </h2>

      {/* Waveform placeholder */}
      <Skeleton className="h-10 w-full rounded-md" />

      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2 py-2">
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground tracking-wide">
              Transcribing lyrics…
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs text-destructive tracking-wide">
                Transcription failed
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
                  <RotateCcw className="w-3 h-3" />
                  Try Again
                </Button>
              )}
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  Upload Different File
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Skeleton lyric lines */}
      <div className="space-y-2.5 pt-2">
        {lineWidths.map((width, i) => (
          <Skeleton
            key={i}
            className="h-4 rounded"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>

      {/* File name */}
      {fileName && (
        <p className="text-[10px] font-mono text-muted-foreground/50 truncate text-center pt-4 tracking-wider">
          {fileName}
        </p>
      )}
    </div>
  );
}
