import React from "react";
import { RotateCcw } from "lucide-react";

interface LyricDanceCoverProps {
  songName: string;
  artistName: string;
  avatarUrl?: string | null;
  initial?: string;
  waiting: boolean;
  onListen?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function LyricDanceCover({
  songName,
  artistName,
  avatarUrl,
  initial,
  waiting,
  onListen,
}: LyricDanceCoverProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
    >
      {/* Top-left: artist identity (small) */}
      <div className="flex items-center gap-2 px-4 pt-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={artistName || songName}
            className="w-7 h-7 rounded-full object-cover border border-white/10"
          />
        ) : initial ? (
          <div className="w-7 h-7 rounded-full border border-white/10 bg-white/10 flex items-center justify-center">
            <span className="text-xs font-mono text-white/40">{initial}</span>
          </div>
        ) : null}
        {artistName ? (
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">{artistName}</span>
        ) : (
          <div className="h-3 w-20 rounded bg-white/[0.05] animate-pulse" />
        )}
      </div>

      {/* Center: song title + Replay button */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {songName ? (
          <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[85%] mb-6">{songName}</h2>
        ) : (
          <div className="h-8 w-48 rounded bg-white/[0.07] animate-pulse mb-6" />
        )}

        {waiting ? (
          <div className="flex items-end gap-[3px] h-4">
            {[0.5, 0.8, 1, 0.7, 0.4].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-white/20"
                style={{ height: `${h * 100}%`, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        ) : (
          <button
            onClick={onListen}
            className="flex items-center gap-2 px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
          >
            <RotateCcw size={14} />
            Replay
          </button>
        )}
      </div>
    </div>
  );
}
