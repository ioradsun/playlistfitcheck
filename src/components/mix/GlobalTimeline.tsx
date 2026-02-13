import { useRef, useEffect, useCallback } from "react";
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

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  startPct: number,
  endPct: number
) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  ctx.clearRect(0, 0, cw, ch);

  // Background region
  const startX = startPct * cw;
  const endX = endPct * cw;
  ctx.fillStyle = "hsla(var(--primary), 0.08)";
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = "hsla(var(--primary), 0.18)";
  ctx.fillRect(startX, 0, endX - startX, ch);

  // Draw peaks
  const barW = cw / peaks.length;
  peaks.forEach((peak, i) => {
    const x = i * barW;
    const barH = peak * ch * 0.8;
    const inRange = x >= startX && x <= endX;
    ctx.fillStyle = inRange
      ? "hsl(var(--primary))"
      : "hsla(var(--primary), 0.3)";
    ctx.fillRect(x, (ch - barH) / 2, Math.max(barW - 1, 1), barH);
  });

  // Marker lines
  ctx.strokeStyle = "hsl(var(--primary))";
  ctx.lineWidth = 2;
  [startX, endX].forEach((mx) => {
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, ch);
    ctx.stroke();
  });

  // Marker handles
  [startX, endX].forEach((mx) => {
    ctx.fillStyle = "hsl(var(--primary))";
    ctx.beginPath();
    ctx.arc(mx, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx, ch - 8, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function GlobalTimeline({ waveform, markerStart, markerEnd, onMarkersChange }: GlobalTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);
  const duration = waveform?.duration || 1;

  const startPct = markerStart / duration;
  const endPct = markerEnd / duration;

  useEffect(() => {
    if (!canvasRef.current || !waveform) return;
    drawWaveform(canvasRef.current, waveform.peaks, startPct, endPct);
  }, [waveform, startPct, endPct]);

  const getPctFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    },
    []
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pct = getPctFromEvent(e);
      const dStart = Math.abs(pct - startPct);
      const dEnd = Math.abs(pct - endPct);
      dragging.current = dStart < dEnd ? "start" : "end";
    },
    [getPctFromEvent, startPct, endPct]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = pct * duration;
      if (dragging.current === "start") {
        onMarkersChange(Math.min(time, markerEnd - 0.5), markerEnd);
      } else {
        onMarkersChange(markerStart, Math.max(time, markerStart + 0.5));
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [duration, markerStart, markerEnd, onMarkersChange]);

  if (!waveform) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Global Comparison Region</span>
        <span className="font-mono">
          Comparing: {formatTime(markerStart)} – {formatTime(markerEnd)}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-16 rounded-md border border-border/50 cursor-col-resize"
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
