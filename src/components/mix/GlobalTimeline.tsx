import { useRef, useEffect, useCallback, useState } from "react";
import type { WaveformData } from "@/hooks/useAudioEngine";

interface GlobalTimelineProps {
  waveform: WaveformData | null;
  markerStart: number;
  markerEnd: number;
  onMarkersChange: (start: number, end: number) => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[]) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  // Draw waveform bars centered vertically
  const barW = Math.max(cw / peaks.length, 1);
  const gap = 1;
  peaks.forEach((peak, i) => {
    const x = i * barW;
    const barH = Math.max(peak * ch * 0.85, 1);
    ctx.fillStyle = "hsla(var(--primary), 0.35)";
    ctx.fillRect(x, (ch - barH) / 2, Math.max(barW - gap, 1), barH);
  });
}

export function GlobalTimeline({ waveform, markerStart, markerEnd, onMarkersChange }: GlobalTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const duration = waveform?.duration || 1;

  const startPct = (markerStart / duration) * 100;
  const endPct = (markerEnd / duration) * 100;

  // Draw waveform once when data changes
  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks);
    const observer = new ResizeObserver(() => {
      if (canvasRef.current && waveform) drawWaveform(canvasRef.current, waveform.peaks);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [waveform]);

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  // Pointer drag handlers
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
    const onUp = () => setDragging(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, duration, markerStart, markerEnd, onMarkersChange, getTimeFromClientX]);

  if (!waveform) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Comparison Region
        </h3>
        <span className="text-xs font-mono text-primary px-2 py-0.5 rounded bg-primary/10">
          {formatTime(markerStart)} – {formatTime(markerEnd)}
        </span>
      </div>

      {/* Timeline container */}
      <div className="relative select-none" ref={containerRef}>
        {/* Waveform canvas */}
        <canvas ref={canvasRef} className="w-full h-20 rounded" />

        {/* Dimmed regions outside markers */}
        <div
          className="absolute inset-y-0 left-0 bg-background/70 rounded-l pointer-events-none"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-background/70 rounded-r pointer-events-none"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Active region highlight */}
        <div
          className="absolute inset-y-0 border-y border-primary/20 pointer-events-none"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Start marker */}
        <div
          className="absolute inset-y-0 group"
          style={{ left: `${startPct}%` }}
        >
          {/* Vertical line */}
          <div className="absolute inset-y-0 -translate-x-[1px] w-[2px] bg-primary" />
          {/* Drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-10 rounded-sm bg-primary cursor-ew-resize flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
            onPointerDown={(e) => { e.preventDefault(); setDragging("start"); }}
          >
            <div className="w-[2px] h-4 bg-primary-foreground/60 rounded-full" />
          </div>
          {/* Time label */}
          <div className="absolute -bottom-5 -translate-x-1/2 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            {formatTime(markerStart)}
          </div>
        </div>

        {/* End marker */}
        <div
          className="absolute inset-y-0 group"
          style={{ left: `${endPct}%` }}
        >
          {/* Vertical line */}
          <div className="absolute inset-y-0 -translate-x-[1px] w-[2px] bg-primary" />
          {/* Drag handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-10 rounded-sm bg-primary cursor-ew-resize flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
            onPointerDown={(e) => { e.preventDefault(); setDragging("end"); }}
          >
            <div className="w-[2px] h-4 bg-primary-foreground/60 rounded-full" />
          </div>
          {/* Time label */}
          <div className="absolute -bottom-5 -translate-x-1/2 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            {formatTime(markerEnd)}
          </div>
        </div>
      </div>

      {/* Duration footer */}
      <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono pt-1">
        <span>0:00</span>
        <span className="text-muted-foreground/40">Drag markers to set comparison region</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
