import { useRef, useEffect, useCallback, useState, type RefObject, type MutableRefObject } from "react";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricHook, LyricLine } from "./LyricDisplay";

const MAX_HOOK_SEC = 10;
const MIN_HOOK_SEC = 3;
const HANDLE_HIT_PX = 32; // touch target width for end handle

interface Props {
  waveform: WaveformData | null;
  lines: LyricLine[];
  audioRef: RefObject<HTMLAudioElement>;
  loopRegionRef: MutableRefObject<{ start: number; end: number } | null>;
  aiHint?: LyricHook | null;
  onSave: (hook: LyricHook) => void;
  onCancel: () => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function HookWaveformPicker({
  waveform, lines, audioRef, loopRegionRef, aiHint, onSave, onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startSec, setStartSec] = useState<number | null>(null);
  const [endSec, setEndSec] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const loopRef = useRef<(() => void) | null>(null);

  const duration = waveform?.duration ?? 0;

  // ── Draw ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const peaks = waveform.peaks;
    const n = peaks.length;
    const barW = Math.max(1, (W - n) / n);
    const gap = 1;
    const hasSelection = startSec !== null && endSec !== null;
    const selStartPct = hasSelection ? startSec! / duration : null;
    const selEndPct = hasSelection ? endSec! / duration : null;

    // AI hint tick
    if (aiHint && duration > 0) {
      const hintX = (aiHint.start / duration) * W;
      ctx.fillStyle = "rgba(251,191,36,0.25)";
      ctx.fillRect(hintX - 1, 0, 2, H);
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const x = i * (barW + gap);
      const pct = i / n;
      const barH = Math.max(2, peaks[i] * H * 0.85);
      const y = (H - barH) / 2;

      let color: string;
      if (hasSelection && selStartPct! <= pct && pct <= selEndPct!) {
        color = `rgba(251,191,36,${0.5 + peaks[i] * 0.5})`; // amber, energy-mapped
      } else if (hasSelection) {
        color = "rgba(255,255,255,0.12)"; // dimmed outside selection
      } else {
        color = `rgba(255,255,255,${0.15 + peaks[i] * 0.25})`; // neutral
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 1);
      ctx.fill();
    }

    // End handle — white pill on right edge of selection
    if (hasSelection) {
      const handleX = selEndPct! * W;
      const handleH = 24;
      const handleW = 4;
      const handleY = (H - handleH) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.roundRect(handleX - handleW / 2, handleY, handleW, handleH, 2);
      ctx.fill();
    }
  }, [waveform, startSec, endSec, duration, aiHint]);

  useEffect(() => { draw(); }, [draw]);

  // ── Loop management ───────────────────────────────────────────
  const startLoop = useCallback((start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    loopRegionRef.current = { start, end };

    if (loopRef.current) {
      audio.removeEventListener("timeupdate", loopRef.current);
    }
    const onTime = () => {
      if (audio.currentTime >= end) audio.currentTime = start;
    };
    loopRef.current = onTime;
    audio.addEventListener("timeupdate", onTime);
    audio.currentTime = start;
    audio.play().catch(() => {});
  }, [audioRef, loopRegionRef]);

  const stopLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loopRef.current) {
      audio.removeEventListener("timeupdate", loopRef.current);
      loopRef.current = null;
    }
    audio.pause();
    loopRegionRef.current = null;
  }, [audioRef, loopRegionRef]);

  useEffect(() => () => { stopLoop(); }, [stopLoop]);

  // ── Pointer helpers ───────────────────────────────────────────
  const xToSec = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  };

  const isOnHandle = (clientX: number): boolean => {
    if (endSec === null || !canvasRef.current || !duration) return false;
    const rect = canvasRef.current.getBoundingClientRect();
    const handleX = (endSec / duration) * rect.width + rect.left;
    return Math.abs(clientX - handleX) <= HANDLE_HIT_PX / 2;
  };

  const applyStart = useCallback((sec: number) => {
    const start = Math.max(0, Math.min(sec, duration - MIN_HOOK_SEC));
    const end = Math.min(start + MAX_HOOK_SEC, duration);
    setStartSec(start);
    setEndSec(end);
    startLoop(start, end);
  }, [duration, startLoop]);

  // ── Pointer events ────────────────────────────────────────────
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
    const sec = xToSec(e.clientX);
    const newEnd = Math.max(startSec + MIN_HOOK_SEC, Math.min(sec, startSec + MAX_HOOK_SEC, duration));
    setEndSec(newEnd);
    if (loopRegionRef.current) loopRegionRef.current.end = newEnd;
    const audio = audioRef.current;
    if (audio && audio.currentTime >= newEnd) audio.currentTime = startSec;
  }, [startSec, duration, loopRegionRef, audioRef, xToSec]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = () => {
    if (startSec === null || endSec === null) return;
    stopLoop();
    const hookLines = lines.filter(l => l.start < endSec! && l.end > startSec!);
    const previewText = hookLines.map(l => l.text).join(" / ") || `${fmt(startSec)} – ${fmt(endSec)}`;
    const hook: LyricHook = {
      start: startSec,
      end: endSec,
      score: 0,
      reasonCodes: ["user_selected"],
      previewText,
      status: "confirmed",
    };
    onSave(hook);
  };

  const handleCancel = () => {
    stopLoop();
    onCancel();
  };

  const selDuration = startSec !== null && endSec !== null ? endSec - startSec : null;

  return (
    <div className="space-y-3">
      {/* Waveform canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-16 rounded-lg cursor-crosshair touch-none"
          style={{ background: "rgba(255,255,255,0.03)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {!waveform && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-wider">
              Loading waveform…
            </span>
          </div>
        )}
        {waveform && startSec === null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
              Tap to set hook start
            </span>
          </div>
        )}
      </div>

      {/* Time label */}
      <div className="h-4 flex items-center justify-center">
        {selDuration !== null ? (
          <span className="text-[11px] font-mono text-amber-400/80 tracking-wider">
            {fmt(startSec!)} – {fmt(endSec!)} · {selDuration.toFixed(1)}s
          </span>
        ) : (
          <span className="text-[10px] font-mono text-white/15 tracking-wider">
            Drag the end handle to shorten
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleCancel}
          className="flex-1 rounded-lg border border-border/30 py-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={startSec === null}
          className="flex-1 rounded-lg bg-amber-500 py-2 text-[11px] font-semibold text-black disabled:opacity-30 transition-opacity"
        >
          Use This Hook
        </button>
      </div>
    </div>
  );
}
