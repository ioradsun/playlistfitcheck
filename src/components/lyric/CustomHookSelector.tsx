import { useMemo, useState, type MutableRefObject, type RefObject } from "react";
import { Pause, Play, X } from "lucide-react";
import type { LyricHook, LyricLine, SavedCustomHook } from "./LyricDisplay";

interface CustomHookSelectorProps {
  lines: LyricLine[];
  aiHooks: LyricHook[];
  audioRef: RefObject<HTMLAudioElement>;
  loopRegionRef: MutableRefObject<{ start: number; end: number } | null>;
  activeHookIndex: number | null;
  setActiveHookIndex: (idx: number | null) => void;
  clipProgress: number;
  setClipProgress: (p: number) => void;
  clipProgressRafRef: MutableRefObject<number | null>;
  setIsPlaying: (playing: boolean) => void;
  onSaveHook: (hook: LyricHook) => void;
  savedCustomHooks: SavedCustomHook[];
  onRemoveHook: (idx: number) => void;
}

const CUSTOM_INDEX_OFFSET = 100;

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getLineEnergy(line: LyricLine): number {
  if (typeof line.confidence === "number") {
    return Math.max(0.15, Math.min(line.confidence, 1));
  }
  const words = line.text.split(/\s+/).filter(Boolean).length;
  const duration = Math.max(line.end - line.start, 0.5);
  const density = words / duration;
  return Math.max(0.12, Math.min(density / 3, 1));
}

function regionProgressTime(start: number, end: number, clipProgress: number): number {
  const duration = Math.max(end - start, 0.001);
  return start + duration * clipProgress;
}

export function CustomHookSelector({
  lines,
  aiHooks,
  audioRef,
  loopRegionRef,
  activeHookIndex,
  setActiveHookIndex,
  clipProgress,
  setClipProgress,
  clipProgressRafRef,
  setIsPlaying,
  onSaveHook,
  savedCustomHooks,
  onRemoveHook,
}: CustomHookSelectorProps) {
  const [mode, setMode] = useState<"browse" | "selecting">("browse");
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  const selectionRegion =
    selStart !== null && selEnd !== null
      ? { start: lines[selStart].start, end: lines[selEnd].end }
      : null;

  const activeSavedHookIdx =
    activeHookIndex !== null && activeHookIndex >= CUSTOM_INDEX_OFFSET
      ? activeHookIndex - CUSTOM_INDEX_OFFSET
      : null;

  const activeRegion = useMemo(() => {
    if (mode === "selecting" && selectionRegion) return selectionRegion;
    if (activeSavedHookIdx !== null && savedCustomHooks[activeSavedHookIdx]) {
      const hook = savedCustomHooks[activeSavedHookIdx];
      return { start: hook.start, end: hook.end };
    }
    return null;
  }, [activeSavedHookIdx, mode, savedCustomHooks, selectionRegion]);

  const playbackTime = activeRegion
    ? regionProgressTime(activeRegion.start, activeRegion.end, clipProgress)
    : null;

  const clearPlayback = () => {
    const audio = audioRef.current;
    loopRegionRef.current = null;
    setActiveHookIndex(null);
    setClipProgress(0);
    if (clipProgressRafRef.current) {
      cancelAnimationFrame(clipProgressRafRef.current);
      clipProgressRafRef.current = null;
    }
    if (audio) {
      audio.pause();
    }
    setIsPlaying(false);
  };

  const loopSelection = (startIdx: number, endIdx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const region = { start: lines[startIdx].start, end: lines[endIdx].end };
    loopRegionRef.current = region;
    setActiveHookIndex(null);
    audio.currentTime = region.start;
    audio.play().catch(() => {});
    setIsPlaying(true);
  };

  const startSelection = (lineIdx: number) => {
    setMode("selecting");
    setSelStart(lineIdx);
    setSelEnd(lineIdx);
    loopSelection(lineIdx, lineIdx);
  };

  const onTapLine = (lineIdx: number) => {
    if (mode !== "selecting" || selStart === null || selEnd === null) {
      startSelection(lineIdx);
      return;
    }
    let nextStart = selStart;
    let nextEnd = selEnd;
    if (lineIdx < selStart) nextStart = lineIdx;
    else if (lineIdx > selEnd) nextEnd = lineIdx;
    else if (lineIdx - selStart <= selEnd - lineIdx) nextStart = lineIdx;
    else nextEnd = lineIdx;

    if (nextStart > nextEnd) [nextStart, nextEnd] = [nextEnd, nextStart];
    setSelStart(nextStart);
    setSelEnd(nextEnd);
    loopSelection(nextStart, nextEnd);
  };

  const adjustStart = (delta: number) => {
    if (selStart === null || selEnd === null) return;
    const nextStart = Math.min(Math.max(selStart + delta, 0), selEnd);
    setSelStart(nextStart);
    loopSelection(nextStart, selEnd);
  };

  const adjustEnd = (delta: number) => {
    if (selStart === null || selEnd === null) return;
    const nextEnd = Math.max(Math.min(selEnd + delta, lines.length - 1), selStart);
    setSelEnd(nextEnd);
    loopSelection(selStart, nextEnd);
  };

  const cancelSelection = () => {
    clearPlayback();
    setSelStart(null);
    setSelEnd(null);
    setMode("browse");
  };

  const playSavedHook = (hook: SavedCustomHook, idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextIdx = CUSTOM_INDEX_OFFSET + idx;
    if (activeHookIndex === nextIdx) {
      clearPlayback();
      return;
    }

    const startPlayback = () => {
      loopRegionRef.current = { start: hook.start, end: hook.end };
      setActiveHookIndex(nextIdx);
      audio.currentTime = hook.start;
      audio.play().catch(() => {});
      setIsPlaying(true);
    };

    if (activeHookIndex !== null) {
      const original = audio.volume;
      audio.volume = Math.max(0, original * 0.2);
      setTimeout(() => {
        startPlayback();
        audio.volume = original;
      }, 120);
      return;
    }

    startPlayback();
  };

  const saveHook = () => {
    if (selStart === null || selEnd === null) return;
    const hook: LyricHook = {
      start: lines[selStart].start,
      end: lines[selEnd].end,
      score: 0,
      reasonCodes: ["user_selected"],
      previewText: lines
        .slice(selStart, selEnd + 1)
        .map((line) => line.text)
        .join(" / "),
      status: "candidate",
    };
    onSaveHook(hook);
    cancelSelection();
  };

  const selectedLineCount =
    selStart !== null && selEnd !== null ? selEnd - selStart + 1 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {savedCustomHooks.map((hook, idx) => {
          const active = activeSavedHookIdx === idx;
          const lineCount = lines.filter(
            (line) => line.start >= hook.start && line.end <= hook.end,
          ).length;
          return (
            <div
              key={`${hook.start}-${hook.end}-${idx}`}
              className="rounded-full border px-2 py-1 text-[10px] font-mono flex items-center gap-1.5"
              style={{
                borderColor: active ? hook.color : `${hook.color}66`,
                boxShadow: active ? `0 0 10px ${hook.color}66` : undefined,
                backgroundColor: active ? `${hook.color}22` : `${hook.color}12`,
              }}
            >
              <button
                onClick={() => playSavedHook(hook, idx)}
                className="rounded-full"
                title={active ? "Stop" : "Play"}
              >
                {active ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <span>{`Hook ${String.fromCharCode(65 + idx)}`}</span>
              <span className="text-muted-foreground">{formatDuration(hook.end - hook.start)} · {lineCount} lines</span>
              <button onClick={() => onRemoveHook(idx)} title="Remove hook">
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border/30 bg-background/10 p-2 space-y-1">
        {lines.map((line, idx) => {
          const inSelection =
            selStart !== null && selEnd !== null && idx >= selStart && idx <= selEnd;
          const muted = mode === "selecting" && !inSelection;
          const lineEnergy = getLineEnergy(line);
          const aiCandidate = aiHooks.some(
            (hook) => line.start >= hook.start && line.start < hook.end,
          );
          const isPlayingLine =
            playbackTime !== null &&
            playbackTime >= line.start &&
            playbackTime <= line.end &&
            (mode === "selecting" || activeSavedHookIdx !== null);

          return (
            <div key={`${line.start}-${idx}`} className="relative">
              {mode === "selecting" && selStart === idx && (
                <button
                  onClick={() => adjustStart(-1)}
                  className="absolute -top-3 left-2 z-20 h-7 w-7 rounded-full bg-amber-500 text-black text-sm font-bold"
                >
                  ↑
                </button>
              )}
              {mode === "selecting" && selEnd === idx && (
                <button
                  onClick={() => adjustEnd(1)}
                  className="absolute -bottom-3 left-2 z-20 h-7 w-7 rounded-full bg-amber-500 text-black text-sm font-bold"
                >
                  ↓
                </button>
              )}

              <button
                onClick={() => onTapLine(idx)}
                className="relative w-full overflow-hidden rounded-md px-3 py-2 text-left transition-all"
                style={{
                  borderLeft: inSelection ? "3px solid #f59e0b" : "3px solid transparent",
                  backgroundColor: inSelection ? "#f59e0b0c" : "transparent",
                  opacity: muted ? 0.2 : 1,
                  filter: muted ? "blur(1px)" : "none",
                }}
              >
                <div
                  className="absolute inset-y-1 left-0 rounded-r-sm bg-primary/20"
                  style={{ width: `${Math.max(6, Math.round(lineEnergy * 100))}%` }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {aiCandidate && <span className="h-1.5 w-1.5 rounded-full bg-green-400" />}
                    <span className="text-xs leading-relaxed">{line.text}</span>
                    {isPlayingLine && (
                      <span className="inline-flex items-end gap-0.5 h-3">
                        <span className="w-[2px] h-1.5 bg-amber-400 animate-pulse" />
                        <span className="w-[2px] h-2.5 bg-amber-400 animate-pulse [animation-delay:80ms]" />
                        <span className="w-[2px] h-2 bg-amber-400 animate-pulse [animation-delay:160ms]" />
                      </span>
                    )}
                  </div>
                  {(inSelection || isPlayingLine) && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatClock(line.start)}
                    </span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {mode === "selecting" && selectionRegion && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[11px]">
              {formatDuration(selectionRegion.end - selectionRegion.start)} · {selectedLineCount} lines
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={cancelSelection}
              className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveHook}
              disabled={savedCustomHooks.length >= 3}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
            >
              Use This Hook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
