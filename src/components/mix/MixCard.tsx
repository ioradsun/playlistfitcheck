import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WaveformData } from "@/hooks/useAudioEngine";

interface MixCardProps {
  id: string;
  name: string;
  waveform: WaveformData;
  rank: number | null;
  comments: string;
  isPlaying: boolean;
  usedRanks: number[];
  totalMixes: number;
  markerStartPct: number;
  markerEndPct: number;
  playheadPct: number;
  onPlay: () => void;
  onStop: () => void;
  onNameChange: (name: string) => void;
  onRankChange: (rank: number | null) => void;
  onCommentsChange: (comments: string) => void;
  onRemove: () => void;
}

function getCssHsl(variable: string, alpha = 1): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return `hsla(${val}, ${alpha})`;
}

function drawCardWaveform(canvas: HTMLCanvasElement, peaks: number[], isPlaying: boolean) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const color = isPlaying
    ? getCssHsl("--primary", 0.7)
    : getCssHsl("--muted-foreground", 0.6);
  const barW = cw / peaks.length;
  const barGap = 1;
  peaks.forEach((peak, i) => {
    const barH = Math.max(peak * ch * 0.85, 1);
    ctx.fillStyle = color;
    ctx.fillRect(i * barW, (ch - barH) / 2, Math.max(barW - barGap, 1), barH);
  });
}

export function MixCard({
  id, name, waveform, rank, comments, isPlaying, usedRanks, totalMixes,
  markerStartPct, markerEndPct, playheadPct,
  onPlay, onStop, onNameChange, onRankChange, onCommentsChange, onRemove,
}: MixCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawCardWaveform(canvasRef.current, waveform.peaks, isPlaying);
    }
  }, [waveform.peaks, isPlaying]);

  const availableRanks = Array.from({ length: totalMixes }, (_, i) => i + 1).filter(
    (r) => r === rank || !usedRanks.includes(r)
  );

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-7 text-xs font-mono bg-transparent border-0 focus-visible:ring-0 p-0"
          placeholder="Mix name"
        />
        <button
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      <div className="border-t border-border/30" />

      {/* Waveform with marker overlay */}
      <div className="relative">
        <canvas ref={canvasRef} className="w-full h-10 rounded" />

        {/* Dimmed regions outside markers */}
        <div
          className="absolute inset-y-0 left-0 bg-background/60 rounded-l pointer-events-none"
          style={{ width: `${markerStartPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-background/60 rounded-r pointer-events-none"
          style={{ width: `${100 - markerEndPct}%` }}
        />
        <div className="absolute inset-y-0 w-[1px] bg-primary/60 pointer-events-none" style={{ left: `${markerStartPct}%` }} />
        <div className="absolute inset-y-0 w-[1px] bg-primary/60 pointer-events-none" style={{ left: `${markerEndPct}%` }} />

        {isPlaying && playheadPct > 0 && (
          <div
            className="absolute inset-y-0 w-[1px] bg-foreground/80 pointer-events-none z-10"
            style={{ left: `${playheadPct}%` }}
          />
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <button
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          onClick={isPlaying ? onStop : onPlay}
        >
          {isPlaying ? "Stop" : "Play"}
        </button>

        <div className="border-l border-border/30 h-3" />

        <Select
          value={rank?.toString() || ""}
          onValueChange={(v) => onRankChange(v ? Number(v) : null)}
        >
          <SelectTrigger className="h-6 w-20 text-[10px] font-mono border-0 bg-transparent focus:ring-0 p-0 gap-1">
            <SelectValue placeholder="Rank" />
          </SelectTrigger>
          <SelectContent>
            {availableRanks.map((r) => (
              <SelectItem key={r} value={r.toString()} className="text-xs font-mono">
                #{r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rank === 1 && (
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">Top Pick</span>
        )}
      </div>

      <div className="border-t border-border/30" />

      {/* Notes */}
      <Textarea
        value={comments}
        onChange={(e) => onCommentsChange(e.target.value)}
        placeholder="Notes…"
        className="min-h-[48px] text-[11px] resize-none bg-transparent border-0 focus-visible:ring-0 p-0 text-muted-foreground"
      />
    </div>
  );
}
