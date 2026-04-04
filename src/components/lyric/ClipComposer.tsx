import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, Download, X, ChevronLeft, ChevronRight } from "lucide-react";
import { FitExportModal } from "./FitExportModal";

interface FireRow {
  time_sec: number;
  hold_ms: number;
  line_index: number;
}

interface LineInfo {
  lineIndex: number;
  text: string;
  startSec: number;
  endSec: number;
}

interface ClipComposerProps {
  visible: boolean;
  player: any;
  durationSec: number;
  fires: FireRow[];
  lines: LineInfo[];
  initialStart: number;
  initialEnd: number;
  initialCaption: string | null;
  songTitle: string;
  onClose: () => void;
}

// ── Snap to nearest line boundary ────────────────────────────────────────

function snapToLine(timeSec: number, lines: LineInfo[], snapType: "start" | "end"): number {
  if (lines.length === 0) return timeSec;
  let best = lines[0];
  let bestDist = Infinity;
  for (const line of lines) {
    const target = snapType === "start" ? line.startSec : line.endSec;
    const dist = Math.abs(target - timeSec);
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  // Only snap if within 1.5s of a boundary
  const snapTarget = snapType === "start" ? best.startSec : best.endSec;
  return bestDist < 1.5 ? snapTarget : timeSec;
}

// ── Fire density for heatmap ─────────────────────────────────────────────

function buildFireBuckets(fires: FireRow[], duration: number, count: number): Float64Array {
  const buckets = new Float64Array(count);
  for (const fire of fires) {
    const idx = Math.min(count - 1, Math.max(0, Math.floor((fire.time_sec / duration) * count)));
    const weight = fire.hold_ms < 300 ? 1 : fire.hold_ms < 1000 ? 2 : fire.hold_ms < 3000 ? 4 : 8;
    buckets[idx] += weight;
  }
  let max = 0;
  for (let i = 0; i < count; i++) if (buckets[i] > max) max = buckets[i];
  if (max > 0) for (let i = 0; i < count; i++) buckets[i] /= max;
  return buckets;
}

// ── Heatmap with draggable handles ───────────────────────────────────────

function DraggableHeatmap({
  fires,
  duration,
  clipStart,
  clipEnd,
  onRegionChange,
}: {
  fires: FireRow[];
  duration: number;
  clipStart: number;
  clipEnd: number;
  onRegionChange: (start: number, end: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  // Draw heatmap + region
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || duration <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = el.clientWidth * dpr;
    el.height = el.clientHeight * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    ctx.clearRect(0, 0, cw, ch);

    const bucketCount = Math.max(Math.round(cw / 2), 60);
    const buckets = buildFireBuckets(fires, duration, bucketCount);

    // Region highlight
    const x1 = (clipStart / duration) * cw;
    const x2 = (clipEnd / duration) * cw;

    // Dimmed outside region
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, x1, ch);
    ctx.fillRect(x2, 0, cw - x2, ch);

    // Region background
    ctx.fillStyle = "rgba(255,120,30,0.06)";
    ctx.fillRect(x1, 0, x2 - x1, ch);

    // Bars
    const barW = cw / bucketCount;
    for (let i = 0; i < bucketCount; i++) {
      const heat = buckets[i];
      const barH = Math.max(heat * ch * 0.85, heat > 0 ? 3 : 1);
      const x = (i / bucketCount) * cw;
      const inRegion = x >= x1 && x <= x2;
      if (heat > 0.01) {
        const a = inRegion ? 0.3 + heat * 0.65 : 0.1 + heat * 0.2;
        ctx.fillStyle = `rgba(255,${Math.round(160 - heat * 120)},30,${a})`;
      } else {
        ctx.fillStyle = inRegion ? "rgba(150,150,150,0.2)" : "rgba(150,150,150,0.08)";
      }
      ctx.fillRect(x, (ch - barH) / 2, Math.max(barW, 1), barH);
    }

    // Handle lines
    ctx.strokeStyle = "rgba(255,120,30,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, ch);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, 0);
    ctx.lineTo(x2, ch);
    ctx.stroke();

    // Handle grips (small triangles)
    ctx.fillStyle = "rgba(255,120,30,0.9)";
    // Left handle
    ctx.beginPath();
    ctx.moveTo(x1, ch / 2 - 8);
    ctx.lineTo(x1 + 6, ch / 2);
    ctx.lineTo(x1, ch / 2 + 8);
    ctx.fill();
    // Right handle
    ctx.beginPath();
    ctx.moveTo(x2, ch / 2 - 8);
    ctx.lineTo(x2 - 6, ch / 2);
    ctx.lineTo(x2, ch / 2 + 8);
    ctx.fill();

    // Time labels
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    ctx.fillText(fmt(clipStart), x1 + 4, 10);
    ctx.fillText(fmt(clipEnd), x2 - 28, 10);
  }, [fires, duration, clipStart, clipEnd]);

  // Drag handlers
  const getTimePct = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pct = getTimePct(e);
      const time = pct * duration;
      const startDist = Math.abs(time - clipStart);
      const endDist = Math.abs(time - clipEnd);
      // Grab whichever handle is closer (within 2s)
      const threshold = duration * 0.05; // 5% of duration or ~2s
      if (startDist < endDist && startDist < threshold) draggingRef.current = "start";
      else if (endDist < threshold) draggingRef.current = "end";
      else draggingRef.current = null;
    },
    [getTimePct, duration, clipStart, clipEnd],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const pct = Math.max(
        0,
        Math.min(
          1,
          (() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return 0;
            return (e.clientX - rect.left) / rect.width;
          })(),
        ),
      );
      const time = pct * duration;

      if (draggingRef.current === "start") {
        const newStart = Math.max(0, Math.min(time, clipEnd - 4)); // min 4s clip
        onRegionChange(newStart, clipEnd);
      } else {
        const newEnd = Math.min(duration, Math.max(time, clipStart + 4)); // min 4s clip
        onRegionChange(clipStart, newEnd);
      }
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [duration, clipStart, clipEnd, onRegionChange]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !touch) return;
      const pct = (touch.clientX - rect.left) / rect.width;
      const time = pct * duration;
      const startDist = Math.abs(time - clipStart);
      const endDist = Math.abs(time - clipEnd);
      const threshold = duration * 0.08;
      if (startDist < endDist && startDist < threshold) draggingRef.current = "start";
      else if (endDist < threshold) draggingRef.current = "end";
    },
    [duration, clipStart, clipEnd],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      if (!touch) return;
      const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const time = pct * duration;

      if (draggingRef.current === "start") {
        onRegionChange(Math.max(0, Math.min(time, clipEnd - 4)), clipEnd);
      } else {
        onRegionChange(clipStart, Math.min(duration, Math.max(time, clipStart + 4)));
      }
    };

    const handleTouchEnd = () => {
      draggingRef.current = null;
    };

    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [duration, clipStart, clipEnd, onRegionChange]);

  return (
    <div
      ref={containerRef}
      className="relative cursor-col-resize select-none"
      style={{ height: 80, touchAction: "none" }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// ── Main ClipComposer ────────────────────────────────────────────────────

export function ClipComposer({
  visible,
  player,
  durationSec,
  fires,
  lines,
  initialStart,
  initialEnd,
  initialCaption,
  songTitle,
  onClose,
}: ClipComposerProps) {
  const [clipStart, setClipStart] = useState(initialStart);
  const [clipEnd, setClipEnd] = useState(initialEnd);
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const playCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync to initial values when they change
  useEffect(() => {
    setClipStart(initialStart);
  }, [initialStart]);
  useEffect(() => {
    setClipEnd(initialEnd);
  }, [initialEnd]);
  useEffect(() => {
    setCaption(initialCaption ?? "");
  }, [initialCaption]);

  // Fires in current clip window
  const firesInClip = useMemo(
    () => fires.filter((f) => f.time_sec >= clipStart && f.time_sec <= clipEnd).length,
    [fires, clipStart, clipEnd],
  );

  const clipDuration = Math.round(clipEnd - clipStart);

  // Lines in clip window
  const clipLines = useMemo(
    () => lines.filter((l) => l.startSec >= clipStart - 0.5 && l.startSec <= clipEnd + 0.5),
    [lines, clipStart, clipEnd],
  );

  // Region change handler with line snapping
  const handleRegionChange = useCallback(
    (start: number, end: number) => {
      const snappedStart = snapToLine(start, lines, "start");
      const snappedEnd = snapToLine(end, lines, "end");
      setClipStart(Math.max(0, snappedStart - 0.3));
      setClipEnd(Math.min(durationSec, snappedEnd + 0.3));
    },
    [lines, durationSec],
  );

  // Nudge buttons
  const nudge = useCallback(
    (which: "start" | "end", dir: number) => {
      const step = 0.5;
      if (which === "start") {
        setClipStart((s) => Math.max(0, Math.min(s + dir * step, clipEnd - 4)));
      } else {
        setClipEnd((e) => Math.min(durationSec, Math.max(e + dir * step, clipStart + 4)));
      }
    },
    [clipEnd, clipStart, durationSec],
  );

  // Preview
  const handlePreview = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
      player.setRegion(undefined, undefined);
      setIsPlaying(false);
      if (playCheckRef.current) {
        clearInterval(playCheckRef.current);
        playCheckRef.current = null;
      }
      return;
    }
    player.setRegion(clipStart, clipEnd);
    player.seek(clipStart);
    player.play();
    player.setMuted(false);
    setIsPlaying(true);

    // Auto-stop when region ends
    playCheckRef.current = setInterval(() => {
      if (player.audio && player.audio.currentTime >= clipEnd - 0.1) {
        player.pause();
        player.setRegion(undefined, undefined);
        setIsPlaying(false);
        if (playCheckRef.current) {
          clearInterval(playCheckRef.current);
          playCheckRef.current = null;
        }
      }
    }, 100);
  }, [player, clipStart, clipEnd, isPlaying]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (playCheckRef.current) clearInterval(playCheckRef.current);
      if (player) {
        player.setRegion(undefined, undefined);
      }
    };
  }, [player]);

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  if (!visible) return null;

  return (
    <>
      <div className="glass-card rounded-xl overflow-hidden border border-orange-500/15">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[14px]">✂️</span>
            <span className="text-[10px] font-mono text-orange-400/70 uppercase tracking-wider">clip editor</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Draggable heatmap */}
        <div className="px-3 pb-2">
          <DraggableHeatmap
            fires={fires}
            duration={durationSec}
            clipStart={clipStart}
            clipEnd={clipEnd}
            onRegionChange={handleRegionChange}
          />
        </div>

        {/* Clip info + nudge controls */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => nudge("start", -1)} className="p-1 rounded hover:bg-muted/20">
              <ChevronLeft size={12} className="text-muted-foreground/50" />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground">{fmt(clipStart)}</span>
            <button onClick={() => nudge("start", 1)} className="p-1 rounded hover:bg-muted/20">
              <ChevronRight size={12} className="text-muted-foreground/50" />
            </button>
          </div>
          <div className="text-center">
            <span className="text-[11px] font-mono text-foreground/70">{clipDuration}s</span>
            <span className="text-[9px] font-mono text-orange-400/50 ml-2">🔥 {firesInClip}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => nudge("end", -1)} className="p-1 rounded hover:bg-muted/20">
              <ChevronLeft size={12} className="text-muted-foreground/50" />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground">{fmt(clipEnd)}</span>
            <button onClick={() => nudge("end", 1)} className="p-1 rounded hover:bg-muted/20">
              <ChevronRight size={12} className="text-muted-foreground/50" />
            </button>
          </div>
        </div>

        {/* Lines in clip */}
        {clipLines.length > 0 && (
          <div className="px-4 pb-2 space-y-0.5">
            {clipLines.slice(0, 4).map((line) => (
              <p key={line.lineIndex} className="text-[10px] text-foreground/50 truncate italic">
                "{line.text}"
              </p>
            ))}
            {clipLines.length > 4 && (
              <p className="text-[9px] text-muted-foreground/30">+{clipLines.length - 4} more lines</p>
            )}
          </div>
        )}

        {/* Caption */}
        <div className="px-4 pb-3">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 100))}
            placeholder="Caption for your clip..."
            className="w-full bg-white/[0.03] border border-border/20 rounded-lg px-3 py-2 text-[11px] text-foreground/70 placeholder:text-muted-foreground/30 focus:outline-none focus:border-orange-500/30"
          />
        </div>

        {/* Actions */}
        <div className="flex border-t border-border/10">
          <button
            onClick={handlePreview}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors border-r border-border/10"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            {isPlaying ? "Stop" : "Preview"}
          </button>
          <button
            onClick={() => {
              if (player) player.setRegion(clipStart, clipEnd);
              setShowExport(true);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-mono uppercase tracking-wider text-orange-400/70 hover:text-orange-400 transition-colors"
          >
            <Download size={12} />
            Export Video
          </button>
        </div>
      </div>

      <FitExportModal
        isOpen={showExport}
        onClose={() => {
          setShowExport(false);
          if (player) player.setRegion(undefined, undefined);
        }}
        getPlayer={() => player}
        songTitle={songTitle}
        artistName=""
        clipStart={clipStart}
        clipEnd={clipEnd}
        captionBar={caption.trim() || undefined}
      />
    </>
  );
}
