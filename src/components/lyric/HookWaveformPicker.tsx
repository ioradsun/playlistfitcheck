import { useRef, useEffect, useCallback, useState, type RefObject, type MutableRefObject } from "react";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricHook, LyricLine } from "./LyricDisplay";

const MAX_HOOK_SEC = 10;
const MIN_HOOK_SEC = 2;
const HANDLE_HIT_PX = 36;

interface Props {
  waveform: WaveformData | null;
  lines: LyricLine[];
  audioRef: RefObject<HTMLAudioElement>;
  loopRegionRef: MutableRefObject<{ start: number; end: number } | null>;
  aiHint?: LyricHook | null;
  onSave: (hook: LyricHook) => void;
  isLast?: boolean;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getCssPrimary(alpha = 1): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary").trim();
  return val ? `hsla(${val}, ${alpha})` : `rgba(168,85,247,${alpha})`;
}

export function HookWaveformPicker({
  waveform, lines, audioRef, loopRegionRef, aiHint, onSave, isLast = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startSec, setStartSec] = useState<number | null>(null);
  const [endSec, setEndSec] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const loopListenerRef = useRef<(() => void) | null>(null);

  const duration = waveform?.duration ?? 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W === 0 || H === 0) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const peaks = waveform.peaks;
    const n = peaks.length;
    const barW = Math.max(1, (W - (n - 1)) / n);
    const hasSelection = startSec !== null && endSec !== null;
    const selStartX = hasSelection ? (startSec / duration) * W : null;
    const selEndX = hasSelection ? (endSec / duration) * W : null;

    if (aiHint && duration > 0) {
      const hintX = (aiHint.start / duration) * W;
      ctx.fillStyle = getCssPrimary(0.2);
      ctx.fillRect(hintX - 1, 4, 2, H - 8);
    }

    for (let i = 0; i < n; i++) {
      const x = i * (barW + 1);
      const barH = Math.max(2, peaks[i] * H * 0.8);
      const y = (H - barH) / 2;
      const barMidX = x + barW / 2;
      const inSelection = hasSelection && barMidX >= selStartX! && barMidX <= selEndX!;
      let color: string;
      if (inSelection) {
        color = getCssPrimary(0.4 + peaks[i] * 0.6);
      } else if (hasSelection) {
        color = "rgba(255,255,255,0.08)";
      } else {
        color = `rgba(255,255,255,${0.12 + peaks[i] * 0.22})`;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 1);
      ctx.fill();
    }

    if (hasSelection && selEndX !== null) {
      const handleH = 20;
      const handleW = 3;
      ctx.fillStyle = getCssPrimary(0.9);
      ctx.beginPath();
      ctx.roundRect(selEndX - handleW / 2, (H - handleH) / 2, handleW, handleH, 2);
      ctx.fill();
      ctx.fillStyle = getCssPrimary(0.5);
      ctx.beginPath();
      ctx.moveTo(selEndX - 5, H / 2);
      ctx.lineTo(selEndX - 9, H / 2 - 3);
      ctx.lineTo(selEndX - 9, H / 2 + 3);
      ctx.fill();
    }
  }, [waveform, startSec, endSec, duration, aiHint]);

  // ResizeObserver handles all draws including initial mount inside Dialog
  // (canvas.clientWidth is 0 until Dialog finishes opening)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    draw();
    return () => ro.disconnect();
  }, [draw]);

  const startLoop = useCallback((start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loopListenerRef.current) {
      audio.removeEventListener("timeupdate", loopListenerRef.current);
    }
    loopRegionRef.current = { start, end };
    const onTime = () => {
      if (audio.currentTime >= end || audio.currentTime < start - 0.5) {
        audio.currentTime = start;
      }
    };
    loopListenerRef.current = onTime;
    audio.addEventListener("timeupdate", onTime);
    audio.currentTime = start;
    audio.play().catch(() => {});
  }, [audioRef, loopRegionRef]);

  const stopLoop = useCallback(() => {
    const audio = audioRef.current;
    if (audio && loopListenerRef.current) {
      audio.removeEventListener("timeupdate", loopListenerRef.current);
      loopListenerRef.current = null;
    }
    if (audio) audio.pause();
    loopRegionRef.current = null;
  }, [audioRef, loopRegionRef]);

  useEffect(() => () => { stopLoop(); }, [stopLoop]);

  const xToSec = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const isOnHandle = useCallback((clientX: number): boolean => {
    if (endSec === null || !canvasRef.current || !duration) return false;
    const rect = canvasRef.current.getBoundingClientRect();
    const handleX = (endSec / duration) * rect.width + rect.left;
    return Math.abs(clientX - handleX) <= HANDLE_HIT_PX / 2;
  }, [endSec, duration]);

  const applyStart = useCallback((sec: number) => {
    const start = Math.max(0, Math.min(sec, duration - MIN_HOOK_SEC));
    const end = Math.min(start + MAX_HOOK_SEC, duration);
    setStartSec(start);
    setEndSec(end);
    startLoop(start, end);
  }, [duration, startLoop]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (isOnHandle(e.clientX)) {
      draggingRef.current = true;
    } else {
      draggingRef.current = false;
      applyStart(xToSec(e.clientX));
    }
  }, [applyStart, isOnHandle, xToSec]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || startSec === null) return;
    const newEnd = Math.max(
      startSec + MIN_HOOK_SEC,
      Math.min(xToSec(e.clientX), startSec + MAX_HOOK_SEC, duration),
    );
    setEndSec(newEnd);
    if (loopRegionRef.current) loopRegionRef.current.end = newEnd;
    const audio = audioRef.current;
    if (audio && audio.currentTime >= newEnd) audio.currentTime = startSec;
  }, [startSec, duration, loopRegionRef, audioRef, xToSec]);

  const onPointerUp = useCallback(() => { draggingRef.current = false; }, []);

  const handleSave = () => {
    if (startSec === null || endSec === null) return;
    stopLoop();
    const hookLines = lines.filter(l => l.start < endSec && l.end > startSec);
    onSave({
      start: startSec,
      end: endSec,
      score: 0,
      reasonCodes: ["user_selected"],
      previewText: hookLines.map(l => l.text).join(" / ") || `${fmt(startSec)} – ${fmt(endSec)}`,
      status: "confirmed",
    });
  };

  const selDuration = startSec !== null && endSec !== null ? endSec - startSec : null;

  return (
    <div className="space-y-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg cursor-crosshair touch-none"
          style={{ height: 64, background: "rgba(255,255,255,0.03)", display: "block" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!waveform && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
              Loading…
            </span>
          </div>
        )}
        {waveform && startSec === null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-[0.15em]">
              Tap to set start
            </span>
          </div>
        )}
      </div>

      <div className="h-5 flex items-center justify-center">
        {selDuration !== null ? (
          <span className="text-[11px] font-mono text-primary/70 tracking-wider">
            {fmt(startSec!)} – {fmt(endSec!)} · {selDuration.toFixed(1)}s
          </span>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground/30 tracking-wider">
            drag end handle to shorten
          </span>
        )}
      </div>

      <div className="flex items-center pt-1">
        <button
          onClick={handleSave}
          disabled={startSec === null}
          className="w-full rounded-lg py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLast ? "Start FMLY Feud" : "Use This Hook →"}
        </button>
      </div>
    </div>
  );
}
