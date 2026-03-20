import {
  useRef, useEffect, useCallback, useState, useMemo,
  type RefObject, type MutableRefObject,
} from "react";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricHook, LyricLine } from "./LyricDisplay";

const MAX_HOOK_SEC = 10;
const MIN_HOOK_SEC = 2;
const HANDLE_HIT_PX = 44;

interface Props {
  waveform: WaveformData | null;
  lines: LyricLine[];
  audioRef: RefObject<HTMLAudioElement>;
  loopRegionRef: MutableRefObject<{ start: number; end: number } | null>;
  aiHint?: LyricHook | null;
  initialHook?: LyricHook | null;
  onSave: (hook: LyricHook) => void;
  isLast?: boolean;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fillBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(
    Math.round(x), Math.round(y),
    Math.max(1, Math.round(w)), Math.max(1, Math.round(h)),
  );
}

export function HookWaveformPicker({
  waveform, lines, audioRef, loopRegionRef,
  aiHint, initialHook, onSave, isLast = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Seed from initialHook so returning to a tab shows prior selection
  const [startSec, setStartSec] = useState<number | null>(
    () => initialHook?.start ?? null,
  );
  const [endSec, setEndSec] = useState<number | null>(
    () => initialHook?.end ?? null,
  );
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  // Show lyrics immediately if we have an initial hook, else wait for audio
  const [lyricsVisible, setLyricsVisible] = useState(
    () => initialHook != null,
  );
  const draggingRef = useRef(false);
  const loopListenerRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  const duration = waveform?.duration ?? 0;

  const hookLines = useMemo(() => {
    if (startSec === null || endSec === null) return [];
    return lines.filter(l => l.end > startSec && l.start < endSec);
  }, [lines, startSec, endSec]);

  const draw = useCallback((playheadSec?: number) => {
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

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);

    const peaks = waveform.peaks;
    const n = peaks.length;
    const barW = Math.max(1, (W - n + 1) / n);
    const hasSelection = startSec !== null && endSec !== null;
    const selStartX = hasSelection ? (startSec! / duration) * W : null;
    const selEndX   = hasSelection ? (endSec!   / duration) * W : null;

    if (aiHint && duration > 0) {
      fillBar(ctx,
        (aiHint.start / duration) * W - 1, 4, 2, H - 8,
        "rgba(168,85,247,0.2)");
    }

    for (let i = 0; i < n; i++) {
      const x    = i * (barW + 1);
      const barH = Math.max(2, peaks[i] * H * 0.78);
      const y    = (H - barH) / 2;
      const midX = x + barW / 2;
      const inSel = hasSelection && midX >= selStartX! && midX <= selEndX!;
      let color: string;
      if (inSel) {
        color = `rgba(168,85,247,${(0.45 + peaks[i] * 0.55).toFixed(2)})`;
      } else if (hasSelection) {
        color = `rgba(255,255,255,${(0.06 + peaks[i] * 0.08).toFixed(2)})`;
      } else {
        color = `rgba(255,255,255,${(0.18 + peaks[i] * 0.32).toFixed(2)})`;
      }
      fillBar(ctx, x, y, barW, barH, color);
    }

    if (playheadSec != null && hasSelection &&
        playheadSec >= startSec! && playheadSec <= endSec!) {
      fillBar(ctx,
        (playheadSec / duration) * W, 0, 1, H,
        "rgba(255,255,255,0.8)");
    }

    if (hasSelection && selEndX !== null) {
      fillBar(ctx, selEndX - 2, (H - 22) / 2, 4, 22, "rgba(168,85,247,1)");
      ctx.fillStyle = "rgba(168,85,247,0.5)";
      ctx.beginPath();
      ctx.moveTo(selEndX - 6,  H / 2);
      ctx.lineTo(selEndX - 11, H / 2 - 4);
      ctx.lineTo(selEndX - 11, H / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }
  }, [waveform, startSec, endSec, duration, aiHint]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw(currentTime ?? undefined));
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw, currentTime]);

  useEffect(() => {
    draw(currentTime ?? undefined);
  }, [draw, currentTime]);

  const startTicker = useCallback(() => {
    // Always stop any existing ticker first to prevent leaks
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) setCurrentTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [audioRef]);

  const stopTicker = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback((start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // Stop any previous ticker before starting new one
    stopTicker();
    if (loopListenerRef.current)
      audio.removeEventListener("timeupdate", loopListenerRef.current);
    loopRegionRef.current = { start, end };
    // FIX: read loopRegionRef.current.end dynamically — not captured end —
    // so dragging the handle updates the loop boundary in real time.
    const onTime = () => {
      const region = loopRegionRef.current;
      if (!region) return;
      if (audio.currentTime >= region.end || audio.currentTime < region.start - 0.5)
        audio.currentTime = region.start;
    };
    loopListenerRef.current = onTime;
    audio.addEventListener("timeupdate", onTime);
    audio.currentTime = start;
    audio.play().catch(() => {});
    setTimeout(() => setLyricsVisible(true), 400);
    startTicker();
  }, [audioRef, loopRegionRef, stopTicker, startTicker]);

  const stopLoop = useCallback(() => {
    stopTicker();
    const audio = audioRef.current;
    if (audio && loopListenerRef.current) {
      audio.removeEventListener("timeupdate", loopListenerRef.current);
      loopListenerRef.current = null;
    }
    if (audio) audio.pause();
    loopRegionRef.current = null;
    setCurrentTime(null);
    setLyricsVisible(false);
  }, [audioRef, loopRegionRef, stopTicker]);

  useEffect(() => () => { stopLoop(); }, [stopLoop]);

  const xToSec = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const isOnHandle = useCallback((clientX: number) => {
    if (endSec === null || !canvasRef.current || !duration) return false;
    const rect = canvasRef.current.getBoundingClientRect();
    const handleX = (endSec / duration) * rect.width + rect.left;
    return Math.abs(clientX - handleX) <= HANDLE_HIT_PX / 2;
  }, [endSec, duration]);

  const applyStart = useCallback((sec: number) => {
    const start = Math.max(0, Math.min(sec, duration - MIN_HOOK_SEC));
    const end   = Math.min(start + MAX_HOOK_SEC, duration);
    setLyricsVisible(false);
    setStartSec(start);
    setEndSec(end);
    startLoop(start, end);
  }, [duration, startLoop]);

  // Dynamic cursor feedback
  const updateCursor = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (draggingRef.current) {
      canvas.style.cursor = "grabbing";
    } else if (isOnHandle(clientX)) {
      canvas.style.cursor = "ew-resize";
    } else {
      canvas.style.cursor = "pointer";
    }
  }, [isOnHandle]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (isOnHandle(e.clientX)) {
      draggingRef.current = true;
      e.currentTarget.style.cursor = "grabbing";
    } else {
      draggingRef.current = false;
      applyStart(xToSec(e.clientX));
    }
  }, [applyStart, isOnHandle, xToSec]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    updateCursor(e.clientX);
    if (!draggingRef.current || startSec === null) return;
    const newEnd = Math.max(
      startSec + MIN_HOOK_SEC,
      Math.min(xToSec(e.clientX), startSec + MAX_HOOK_SEC, duration),
    );
    setEndSec(newEnd);
    // Update loopRegionRef — the loop listener reads this dynamically
    if (loopRegionRef.current) loopRegionRef.current.end = newEnd;
  }, [startSec, duration, loopRegionRef, xToSec, updateCursor]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    updateCursor(e.clientX);
  }, [updateCursor]);

  const handleSave = () => {
    if (startSec === null || endSec === null) return;
    stopLoop();
    const savedLines = lines.filter(l => l.start < endSec! && l.end > startSec!);
    onSave({
      start: startSec,
      end: endSec,
      score: 0,
      reasonCodes: ["user_selected"],
      previewText: savedLines.map(l => l.text).join(" / ")
        || `${fmt(startSec)}–${fmt(endSec)}`,
      status: "confirmed",
    });
  };

  const timeLabel = (() => {
    if (startSec === null || endSec === null) return null;
    if (currentTime != null) {
      const elapsed = Math.max(0, currentTime - startSec);
      const total   = endSec - startSec;
      return `${fmt(currentTime)} · ${elapsed.toFixed(1)}s / ${total.toFixed(1)}s`;
    }
    return `${fmt(startSec)} – ${fmt(endSec)} · ${(endSec - startSec).toFixed(1)}s`;
  })();

  return (
    <div className="space-y-3">
      {/* Waveform canvas */}
      <div className="relative rounded-lg overflow-hidden" style={{ height: 64 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ display: "block", cursor: "pointer" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {waveform && startSec === null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.15em]">
              Tap to set start
            </span>
          </div>
        )}
        {!waveform && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
              Loading waveform…
            </span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="h-5 flex items-center justify-center">
        {timeLabel ? (
          <span className="text-[11px] font-mono tracking-wider text-primary/70">
            {timeLabel}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground/25 tracking-wider">
            tap waveform to set hook start
          </span>
        )}
      </div>

      {/* Lyrics — fixed height, scrollable, fades in */}
      <div
        className="h-24 overflow-y-auto transition-opacity duration-500 px-1"
        style={{ opacity: lyricsVisible ? 1 : 0 }}
      >
        <div className="space-y-0.5">
          {hookLines.map((line, i) => (
            <p
              key={i}
              className="text-[11px] leading-snug font-mono"
              style={{
                color: "rgba(255,255,255,1)",
                opacity:
                  currentTime != null &&
                  currentTime >= line.start &&
                  currentTime <= line.end
                    ? 1
                    : 0.35,
                transition: "opacity 150ms ease",
              }}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>

      {/* Action */}
      <button
        onClick={handleSave}
        disabled={startSec === null}
        className="w-full rounded-lg py-2.5 text-[11px] font-semibold tracking-[0.1em] uppercase border transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary border-primary/30 hover:bg-primary/10"
      >
        {isLast ? "Start FMLY Feud" : "Use This Hook →"}
      </button>
    </div>
  );
}
