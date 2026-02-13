import { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, X } from "lucide-react";
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
  onPlay: () => void;
  onStop: () => void;
  onNameChange: (name: string) => void;
  onRankChange: (rank: number | null) => void;
  onCommentsChange: (comments: string) => void;
  onRemove: () => void;
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

  const barW = cw / peaks.length;
  peaks.forEach((peak, i) => {
    const barH = peak * ch * 0.85;
    ctx.fillStyle = isPlaying
      ? "hsl(var(--primary))"
      : "hsla(var(--primary), 0.5)";
    ctx.fillRect(i * barW, (ch - barH) / 2, Math.max(barW - 1, 1), barH);
  });
}

export function MixCard({
  id,
  name,
  waveform,
  rank,
  comments,
  isPlaying,
  usedRanks,
  totalMixes,
  onPlay,
  onStop,
  onNameChange,
  onRankChange,
  onCommentsChange,
  onRemove,
}: MixCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawCardWaveform(canvasRef.current, waveform.peaks, isPlaying);
    }
  }, [waveform.peaks, isPlaying]);

  const isRankOne = rank === 1;
  const availableRanks = Array.from({ length: totalMixes }, (_, i) => i + 1).filter(
    (r) => r === rank || !usedRanks.includes(r)
  );

  return (
    <Card
      className={`relative transition-all ${
        isRankOne ? "ring-1 ring-primary/50 shadow-[0_0_15px_hsla(var(--primary),0.15)]" : ""
      }`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: name + remove */}
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="h-8 text-sm font-medium bg-transparent border-border/50"
            placeholder="Mix name"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
            <X size={14} />
          </Button>
        </div>

        {/* Waveform */}
        <canvas ref={canvasRef} className="w-full h-12 rounded" />

        {/* Controls row */}
        <div className="flex items-center gap-2">
          <Button
            variant={isPlaying ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={isPlaying ? onStop : onPlay}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </Button>

          <Select
            value={rank?.toString() || ""}
            onValueChange={(v) => onRankChange(v ? Number(v) : null)}
          >
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue placeholder="Rank" />
            </SelectTrigger>
            <SelectContent>
              {availableRanks.map((r) => (
                <SelectItem key={r} value={r.toString()}>
                  #{r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isRankOne && (
            <span className="text-xs text-primary font-medium ml-auto">★ Top Pick</span>
          )}
        </div>

        {/* Comments */}
        <Textarea
          value={comments}
          onChange={(e) => onCommentsChange(e.target.value)}
          placeholder="Notes on this mix..."
          className="min-h-[60px] text-xs resize-none bg-transparent border-border/50"
        />
      </CardContent>
    </Card>
  );
}
