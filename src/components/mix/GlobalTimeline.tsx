import { useRef, useEffect, useCallback, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WaveformData } from "@/hooks/useAudioEngine";

interface GlobalTimelineProps {
  waveform: WaveformData | null;
  referenceName?: string;
  markerStart: number;
  markerEnd: number;
  isPlaying: boolean;
  playheadPct: number;
  onMarkersChange: (start: number, end: number) => void;
  onMarkersChangeEnd?: (start: number, end: number) => void;
  onPlay: () => void;
  onStop: () => void;
  beats?: number[] | null;
  beatGridLoading?: boolean;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getCssHsl(variable: string, alpha = 1): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return `hsla(${val}, ${alpha})`;
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], beats?: number[] | null, duration?: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const color = getCssHsl("--muted-foreground", 0.6);
  const barW = Math.max(cw / peaks.length, 1);
  const gap = 1;
  peaks.forEach((peak, i) => {
    const barH = Math.max(peak * ch * 0.85, 1);
    ctx.fillStyle = color;
    ctx.fillRect(i * barW, (ch - barH) / 2, Math.max(barW - gap, 1), barH);
  });

  // Beat grid ticks
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

export function GlobalTimeline({
  waveform, referenceName, markerStart, markerEnd, isPlaying, playheadPct,
  onMarkersChange, onMarkersChangeEnd, onPlay, onStop, beats, beatGridLoading,
}: GlobalTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const duration = waveform?.duration || 1;

  const startPct = (markerStart / duration) * 100;
  const endPct = (markerEnd / duration) * 100;

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks, beats, duration);
    const observer = new ResizeObserver(() => {
      if (canvasRef.current && waveform) drawWaveform(canvasRef.current, waveform.peaks, beats, duration);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [waveform, beats, duration]);

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const time = getTimeFromClientX(e.clientX);
      if (dragging === "start") {
        onMarkersChange(Math.max(0, Math.min(time, markerEnd - 0.5)), markerEnd);
      } else {
        onMarkersChange(markerStart, Math.min(duration, Math.max(time, markerStart + 0.5)));
      }
    };
    const onUp = () => {
      setDragging(null);
      onMarkersChangeEnd?.(markerStart, markerEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, duration, markerStart, markerEnd, onMarkersChange, getTimeFromClientX]);

  if (!waveform) return <div className="glass-card rounded-xl p-4 min-h-[140px]" />;

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            onClick={isPlaying ? onStop : onPlay}
          >
            {isPlaying ? "Stop" : "Play"}
          </button>
          <div className="border-l border-border/30 h-3" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Loop Zone</span>
          {referenceName && (
            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[180px]">· {referenceName}</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {formatTime(markerStart)} – {formatTime(markerEnd)}
        </span>
      </div>

      {/* Timeline */}
      <div className="relative select-none" ref={containerRef}>
        <canvas ref={canvasRef} className="w-full h-16 rounded" />

        {/* Dimmed outside markers */}
        <div
          className="absolute inset-y-0 left-0 bg-background/70 rounded-l pointer-events-none"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-background/70 rounded-r pointer-events-none"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Playhead */}
        {isPlaying && (
          <div
            className="absolute inset-y-0 w-[1px] bg-foreground/70 pointer-events-none z-10"
            style={{ left: `${playheadPct}%` }}
          />
        )}

        {/* Start marker */}
        <div className="absolute inset-y-0" style={{ left: `${startPct}%` }}>
          <div className="absolute inset-y-0 w-[1px] bg-primary/80 pointer-events-none" />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-8 rounded-sm bg-primary/80 cursor-ew-resize"
            onPointerDown={(e) => { e.preventDefault(); setDragging("start"); }}
          />
        </div>

        {/* End marker */}
        <div className="absolute inset-y-0" style={{ left: `${endPct}%` }}>
          <div className="absolute inset-y-0 w-[1px] bg-primary/80 pointer-events-none" />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-8 rounded-sm bg-primary/80 cursor-ew-resize"
            onPointerDown={(e) => { e.preventDefault(); setDragging("end"); }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40">
        <span>0:00</span>
        <span>{beatGridLoading ? "Detecting beats…" : beats && beats.length > 0 ? `${beats.length} beats · Drag markers to set loop zone` : "Drag markers to set loop zone"}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
