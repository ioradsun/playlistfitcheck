import React from "react";

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
      className="absolute inset-0 z-20 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
    >
      <div className="mb-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={artistName || songName}
            className="w-20 h-20 rounded-full object-cover border border-white/10"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full border flex items-center justify-center transition-colors ${waiting && !initial ? "border-white/5 bg-white/[0.04] animate-pulse" : "border-white/10 bg-white/10"}`}
          >
            {initial && <span className="text-2xl font-mono text-white/40">{initial}</span>}
          </div>
        )}
      </div>

      {songName ? (
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[80%] mb-1">{songName}</h2>
      ) : (
        <div className="h-8 w-48 rounded bg-white/[0.07] animate-pulse mb-1" />
      )}

      {artistName ? (
        <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/40 mb-8">{artistName}</p>
      ) : (
        <div className="h-3 w-28 rounded bg-white/[0.05] animate-pulse mb-8" />
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
          className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
        >
          Listen Now
        </button>
      )}
    </div>
  );
}
