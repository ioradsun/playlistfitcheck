
import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WaveformData } from "@/hooks/useAudioEngine";

interface LyricWaveformProps {
  waveform: WaveformData | null;
  isPlaying: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], currentPct: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const barW = Math.max(cw / peaks.length, 1);
  const gap = 1;
  const playedX = currentPct * cw;

  peaks.forEach((peak, i) => {
    const barH = Math.max(peak * ch * 0.85, 2);
    const x = i * barW;
    ctx.fillStyle = x <= playedX
      ? "hsl(var(--primary) / 0.9)"
      : "hsl(var(--muted-foreground) / 0.3)";
    ctx.fillRect(x, (ch - barH) / 2, Math.max(barW - gap, 1), barH);
  });
}

export function LyricWaveform({ waveform, isPlaying, currentTime, onSeek, onTogglePlay }: LyricWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const duration = waveform?.duration || 1;
  const currentPct = Math.min(currentTime / duration, 1);
  const playheadPct = currentPct * 100;

  // Draw waveform whenever peaks or playhead changes
  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks, currentPct);
  }, [waveform, currentPct]);

  // Resize observer
  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    const observer = new ResizeObserver(() => {
      if (canvasRef.current && waveform) drawWaveform(canvasRef.current, waveform.peaks, currentPct);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [waveform, currentPct]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !waveform) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(pct * duration);
    },
    [duration, onSeek, waveform]
  );

  if (!waveform) {
    return (
      <div className="h-16 rounded-lg bg-muted/30 animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading waveform…</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button
          variant={isPlaying ? "default" : "outline"}
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onTogglePlay}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </Button>
        <div
          ref={containerRef}
          className="relative flex-1 cursor-pointer select-none"
          onClick={handleClick}
        >
          <canvas ref={canvasRef} className="w-full h-14 rounded" />
          {/* Playhead */}
          <div
            className="absolute inset-y-0 w-[2px] bg-primary pointer-events-none z-10 transition-none"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="absolute -top-1 -translate-x-[3px] w-2 h-2 rounded-full bg-primary shadow" />
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40 px-9">
        <span>0:00</span>
        <span>{formatTime(duration / 2)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
