import { useMemo, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LyricWaveform } from "./LyricWaveform";
import type { WaveformData } from "@/hooks/useAudioEngine";

interface Props {
  title: string;
  fileName?: string;
  loading: boolean;
  waveformData?: WaveformData | null;
  onRetry?: () => void;
  onBack?: () => void;
}

export function LyricSkeleton({ title, fileName, loading, waveformData, onRetry, onBack }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const lineWidths = useMemo(
    () => Array.from({ length: 14 }, () => 40 + Math.random() * 50),
    [],
  );

  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);
  const handleTogglePlay = useCallback(() => setIsPlaying(p => !p), []);

  return (
    <div className="w-full space-y-4">
      {/* Waveform: matches LyricDisplay max-w-3xl layout */}
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="w-full">
          {waveformData ? (
            <div className="glass-card rounded-xl p-3">
              <LyricWaveform
                waveform={waveformData}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onSeek={handleSeek}
                onTogglePlay={handleTogglePlay}
              />
            </div>
          ) : (
            <div className="glass-card rounded-xl p-3">
              <Skeleton className="h-[72px] w-full rounded-lg" />
            </div>
          )}
        </div>

        {/* Lyrics card skeleton — matches glass-card layout with 45vh max */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full space-y-3">
            <div className="glass-card rounded-xl p-4 space-y-1">
              {/* Header row skeleton */}
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-3 w-48 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>

              {/* Lyric lines skeleton — constrained to 45vh like the real view */}
              <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: "45vh" }}>
                {lineWidths.map((width, i) => (
                  <div key={i} className="flex items-center gap-2 py-[5px] px-2">
                    <Skeleton className="h-3 w-8 rounded flex-shrink-0" />
                    <Skeleton
                      className="h-4 rounded"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                ))}
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-center gap-2 py-3">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
