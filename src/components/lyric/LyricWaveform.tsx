
import { useRef, useEffect, useCallback, forwardRef } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WaveformData } from "@/hooks/useAudioEngine";

export interface LoopRegion {
  start: number;
  end: number;
  duration: number;
}

interface LyricWaveformProps {
  waveform: WaveformData | null;
  isPlaying: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  loopRegion?: LoopRegion | null;
  beats?: number[] | null;
  beatGridLoading?: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getCssHsl(variable: string, alpha = 1): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return `hsla(${val}, ${alpha})`;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  currentPct: number,
  loopRegion?: LoopRegion | null,
  beats?: number[] | null,
  duration?: number
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const dark = isDarkMode();
  const playedColor = getCssHsl("--primary", 0.9);
  const unplayedColor = dark ? "rgba(150,150,150,0.6)" : "rgba(120,120,120,0.35)";

  // Draw loop region shading behind bars
  if (loopRegion && loopRegion.duration > 0) {
    const loopStartPct = Math.min(loopRegion.start / loopRegion.duration, 1);
    const loopEndPct = Math.min(loopRegion.end / loopRegion.duration, 1);
    ctx.fillStyle = getCssHsl("--primary", 0.08);
    ctx.fillRect(loopStartPct * cw, 0, (loopEndPct - loopStartPct) * cw, ch);
    ctx.strokeStyle = getCssHsl("--primary", 0.5);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(loopStartPct * cw, 0);
    ctx.lineTo(loopStartPct * cw, ch);
    ctx.moveTo(loopEndPct * cw, 0);
    ctx.lineTo(loopEndPct * cw, ch);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const barW = Math.max(cw / peaks.length, 1);
  const gap = 1;
  const playedX = currentPct * cw;

  peaks.forEach((peak, i) => {
    const barH = Math.max(peak * ch * 0.85, 2);
    const x = i * barW;
    const barPct = x / cw;
    const inLoop =
      loopRegion && loopRegion.duration > 0
        ? barPct >= loopRegion.start / loopRegion.duration &&
          barPct <= loopRegion.end / loopRegion.duration
        : false;

    if (x <= playedX) {
      ctx.fillStyle = playedColor;
    } else if (inLoop) {
      ctx.fillStyle = getCssHsl("--primary", 0.3);
    } else {
      ctx.fillStyle = unplayedColor;
    }
    ctx.fillRect(x, (ch - barH) / 2, Math.max(barW - gap, 1), barH);
  });

  // Draw beat grid ticks
  if (beats && beats.length > 0 && duration && duration > 0) {
    ctx.strokeStyle = getCssHsl("--primary", 0.25);
    ctx.lineWidth = 1;
    beats.forEach((beatTime) => {
      const x = (beatTime / duration) * cw;
      ctx.beginPath();
      ctx.moveTo(x, ch - 4);
      ctx.lineTo(x, ch);
      ctx.stroke();
    });
  }
}

export const LyricWaveform = forwardRef<HTMLDivElement, LyricWaveformProps>(function LyricWaveform({
  waveform,
  isPlaying,
  currentTime,
  onSeek,
  onTogglePlay,
  loopRegion,
  beats,
  beatGridLoading,
}, _ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const duration = waveform?.duration || 1;
  const currentPct = Math.min(currentTime / duration, 1);
  const playheadPct = currentPct * 100;

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, beats, duration);
  }, [waveform, currentPct, loopRegion, beats, duration]);

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    const observer = new ResizeObserver(() => {
      if (canvasRef.current && waveform)
        drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, beats, duration);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [waveform, currentPct, loopRegion, beats, duration]);

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    const mo = new MutationObserver(() => {
      if (canvasRef.current && waveform)
        drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, beats, duration);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [waveform, currentPct, loopRegion, beats, duration]);

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
            {/* Timestamp bubble on playhead */}
            <div
              className="absolute top-1 left-2 bg-primary text-primary-foreground text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none shadow z-20"
              style={{
                transform: playheadPct > 80 ? "translateX(calc(-100% - 6px))" : "translateX(0)",
              }}
            >
              <span>▶ {currentTime.toFixed(2)}s</span>
            </div>
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40 px-9">
        <span>0:00</span>
        <span>
          {beatGridLoading ? "Detecting beats…" : beats && beats.length > 0 ? `${beats.length} beats detected` : formatTime(duration / 2)}
        </span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
