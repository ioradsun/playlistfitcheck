import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { type LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";

interface Props {
  player: LyricDancePlayer | null;
  data: LyricDanceData;
  palette: string[];
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

const withScaledAlpha = (color: string, alphaScale: number): string => {
  const c = color.trim();
  const hexMatch = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alphaScale})`;
  }

  const rgbaMatch = c.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((part) => part.trim());
    if (parts.length >= 3) {
      const r = parts[0];
      const g = parts[1];
      const b = parts[2];
      const baseAlpha = parts[3] ? Number.parseFloat(parts[3]) : 1;
      const clampedAlpha = Number.isFinite(baseAlpha) ? Math.max(0, Math.min(1, baseAlpha)) : 1;
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha * alphaScale})`;
    }
  }

  return `rgba(255, 255, 255, ${0.35 * alphaScale})`;
};

export const LyricDanceProgressBar = React.forwardRef<HTMLDivElement, Props>(
  function LyricDanceProgressBar({ player, data, palette, onSeekStart, onSeekEnd }, _ref) {
    const [isDragging, setIsDragging] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);
    const fillRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const wasPlaying = useRef(false);
    const progressRef = useRef(0);

    const fillColor = useMemo(() => withScaledAlpha(palette[1] ?? "rgba(255,255,255,0.35)", 0.6), [palette]);

    const applyVisualProgress = useCallback((clamped: number) => {
      progressRef.current = clamped;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${clamped})`;
      }
      if (thumbRef.current && barRef.current) {
        const barW = barRef.current.offsetWidth;
        const dpr = window.devicePixelRatio || 1;
        const tx = Math.round((barW * clamped - 5) * dpr) / dpr;
        thumbRef.current.style.transform = `translateX(${tx}px)`;
      }
    }, []);

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
        applyVisualProgress(clamped);
        if (audio.paused || document.hidden) {
          rafId = 0;
          return;
        }
        rafId = requestAnimationFrame(update);
      };
      const start = () => {
        if (!rafId && !audio.paused && !document.hidden) rafId = requestAnimationFrame(update);
      };
      applyVisualProgress(duration > 0 ? Math.max(0, Math.min(1, (audio.currentTime - songStart) / duration)) : 0);
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
    }, [player, data, applyVisualProgress]);

    const seekTo = useCallback((clientX: number) => {
      if (!barRef.current || !player) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      applyVisualProgress(ratio);
      const lines = data.lyrics;
      const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
      const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
      player.seek(songStart + ratio * (songEnd - songStart));
    }, [player, data, applyVisualProgress]);

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
        className="relative w-full z-10 h-1 cursor-pointer"
        style={{ touchAction: "none", transform: "translateZ(0)" }}
      >
        <div className="absolute inset-0 bg-white/5" />
        <div
          ref={fillRef}
          className="absolute left-0 top-0 h-full w-full transition-none origin-left will-change-transform"
          style={{ transform: "scaleX(0)", background: fillColor }}
        />
        <div
          ref={thumbRef}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md transition-opacity will-change-transform"
          style={{
            transform: "translateX(-5px)",
            opacity: isDragging ? 1 : 0,
          }}
        />
      </div>
    );
  },
);
