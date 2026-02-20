
import { useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WaveformData } from "@/hooks/useAudioEngine";

export interface LoopRegion {
  start: number;
  end: number;
  duration: number;
}

export interface DiagnosticDot {
  /** Position in seconds */
  time: number;
  /** Green = high confidence, Yellow = medium, Red = large gap detected */
  color: "green" | "yellow" | "red";
  label?: string;
}

interface LyricWaveformProps {
  waveform: WaveformData | null;
  isPlaying: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  loopRegion?: LoopRegion | null;
  diagnosticDots?: DiagnosticDot[];
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
  diagnosticDots?: DiagnosticDot[],
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

  // Draw diagnostic dots above the waveform
  if (diagnosticDots && diagnosticDots.length > 0 && duration && duration > 0) {
    const dotR = 3;
    const dotY = 4; // near the top
    diagnosticDots.forEach((dot) => {
      const pct = Math.min(dot.time / duration, 1);
      const x = pct * cw;
      const colorMap = {
        green: "rgba(74, 222, 128, 0.9)",   // green-400 equivalent
        yellow: "rgba(251, 191, 36, 0.9)",  // yellow-400 equivalent
        red: "rgba(248, 113, 113, 0.9)",    // red-400 equivalent
      };
      ctx.beginPath();
      ctx.arc(x, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = colorMap[dot.color];
      ctx.fill();
    });
  }
}

export function LyricWaveform({
  waveform,
  isPlaying,
  currentTime,
  onSeek,
  onTogglePlay,
  loopRegion,
  diagnosticDots,
}: LyricWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const duration = waveform?.duration || 1;
  const currentPct = Math.min(currentTime / duration, 1);
  const playheadPct = currentPct * 100;

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, diagnosticDots, duration);
  }, [waveform, currentPct, loopRegion, diagnosticDots, duration]);

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    const observer = new ResizeObserver(() => {
      if (canvasRef.current && waveform)
        drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, diagnosticDots, duration);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [waveform, currentPct, loopRegion, diagnosticDots, duration]);

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    const mo = new MutationObserver(() => {
      if (canvasRef.current && waveform)
        drawWaveform(canvasRef.current, waveform.peaks, currentPct, loopRegion, diagnosticDots, duration);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [waveform, currentPct, loopRegion, diagnosticDots, duration]);

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
              className="absolute top-1 left-2 bg-primary text-primary-foreground text-[9px] font-mono px-1 py-0.5 rounded whitespace-nowrap pointer-events-none shadow z-20"
              style={{
                transform: playheadPct > 80 ? "translateX(calc(-100% - 6px))" : "translateX(0)",
              }}
            >
              {currentTime.toFixed(2)}s
            </div>
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
