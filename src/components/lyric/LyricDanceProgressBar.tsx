import React, { useState, useEffect, useRef, useCallback } from "react";
import { type LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";

interface Props {
  player: LyricDancePlayer | null;
  data: LyricDanceData;
  palette: string[];
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

export const LyricDanceProgressBar = React.forwardRef<HTMLDivElement, Props>(
  function LyricDanceProgressBar({ player, data, palette, onSeekStart, onSeekEnd }, _ref) {
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const wasPlaying = useRef(false);
    const lastProgressRef = useRef(0);

    useEffect(() => {
      if (!player) return;
      const audio = player.audio;
      const lines = data.lyrics;
      const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
      const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
      const duration = songEnd - songStart;
      let rafId = 0;
      const stop = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };
      const update = () => {
        const p = duration > 0 ? (audio.currentTime - songStart) / duration : 0;
        const clamped = Math.max(0, Math.min(1, p));
        if (Math.abs(clamped - lastProgressRef.current) > 0.005) {
          lastProgressRef.current = clamped;
          setProgress(clamped);
        }
        if (audio.paused || document.hidden) {
          rafId = 0;
          return;
        }
        rafId = requestAnimationFrame(update);
      };
      const start = () => {
        if (!rafId && !audio.paused && !document.hidden) rafId = requestAnimationFrame(update);
      };
      if (!audio.paused && !document.hidden) start();
      const handlePlay = () => start();
      const handlePause = () => stop();
      const handleVis = () => {
        if (document.hidden) stop();
        else start();
      };
      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      document.addEventListener("visibilitychange", handleVis);
      return () => {
        stop();
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        document.removeEventListener("visibilitychange", handleVis);
      };
    }, [player, data]);

    const seekTo = useCallback((clientX: number) => {
      if (!barRef.current || !player) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const lines = data.lyrics;
      const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
      const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
      player.seek(songStart + ratio * (songEnd - songStart));
    }, [player, data]);

    const handleDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
      if (!player) return;
      e.stopPropagation();
      dragging.current = true;
      setIsDragging(true);
      wasPlaying.current = !player.audio.paused;
      player.pause();
      onSeekStart?.();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      seekTo(clientX);
      const onMove = (ev: MouseEvent | TouchEvent) => {
        const cx = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
        seekTo(cx);
      };
      const onUp = () => {
        dragging.current = false;
        setIsDragging(false);
        onSeekEnd?.();
        if (wasPlaying.current) player.play();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    }, [player, seekTo, onSeekStart, onSeekEnd]);

    return (
      <div
        ref={barRef}
        onMouseDown={handleDown}
        onTouchStart={handleDown}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full z-10 h-3 cursor-pointer group"
        style={{ touchAction: "none" }}
      >
        <div className="absolute inset-0 bg-white/5" />
        <div
          className="absolute left-0 top-0 h-full transition-none"
          style={{ width: `${progress * 100}%`, background: palette[1] ?? "rgba(255,255,255,0.35)", opacity: 0.6 }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>
    );
  },
);
