import React from "react";

interface LyricDanceCoverProps {
  songName: string;
  claimArtistName?: string;
  claimSongName?: string;
  isMarketingCover?: boolean;
  artistName?: string | null;
  avatarUrl?: string | null;
  initial?: string;
  waiting: boolean;
  onListen?: (e: React.MouseEvent) => void;
  badge?: string | null;
  onExpand?: () => void;
  hideBackground?: boolean;
}

export function LyricDanceCover({
  songName,
  claimSongName = "",
  isMarketingCover = false,
  waiting,
  onListen,
  badge,
  onExpand,
  hideBackground = false,
}: LyricDanceCoverProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center"
      style={{ cursor: waiting ? "default" : "pointer" }}
      onClick={(e) => {
        if (!waiting && onListen) onListen(e);
      }}
    >
      {/* Scrim — lets canvas preview show through */}
      <div
        className="absolute inset-0"
        style={{
          background: hideBackground
            ? "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.50) 100%)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.78) 100%)",
        }}
      />

      {/* Badge + expand */}
      {(badge || onExpand) && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 z-10">
          {badge ? (
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 rounded px-1.5 py-0.5">
              {badge}
            </span>
          ) : <span />}
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="p-1.5 rounded-full bg-black/40 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7,1 11,1 11,5" />
                <line x1="11" y1="1" x2="6" y2="6" />
                <polyline points="5,11 1,11 1,7" />
                <line x1="1" y1="11" x2="6" y2="6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Song title + Listen Now */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center" style={{ marginBottom: 24 }}>
        {isMarketingCover ? (
          <button
            onClick={(e) => e.stopPropagation()}
            className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
            style={{
              color: waiting ? "transparent" : "rgba(255,255,255,1)",
              borderColor: waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)",
              background: waiting ? "rgba(255,255,255,0.02)" : undefined,
            }}
          >
            {`${(claimSongName || songName || "Lyric").trim()} Dance`}
          </button>
        ) : (
          <>
            {songName ? (
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4 whitespace-nowrap">
                {songName}
              </p>
            ) : (
              <div className="h-4 mb-4" />
            )}
            <button
              onClick={(e) => e.stopPropagation()}
              className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
              style={{
                color: waiting ? "transparent" : "rgba(255,255,255,1)",
                borderColor: waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)",
                background: waiting ? "rgba(255,255,255,0.02)" : undefined,
              }}
            >
              Listen Now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
