import React from "react";

interface LyricDanceCoverProps {
  songName: string;
  artistName?: string | null;
  avatarUrl?: string | null;
  claimArtistName?: string;
  claimSongName?: string;
  isMarketingCover?: boolean;
  waiting: boolean;
  onListen?: (e: React.MouseEvent) => void;
  onExpand?: () => void;
  hideBackground?: boolean;
  duration?: string;
}

export function LyricDanceCover({
  songName,
  artistName,
  avatarUrl,
  claimSongName = "",
  isMarketingCover = false,
  waiting,
  onListen,
  onExpand,
  hideBackground = false,
  duration,
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
            ? "linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.26) 40%, rgba(0,0,0,0.40) 100%)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.40) 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {onExpand && (
        <div className="absolute top-3 left-3 z-10">
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
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-8">
        {avatarUrl && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        {artistName && (
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 500,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {artistName}
          </p>
        )}

        {isMarketingCover ? (
          <div
            className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
            style={{
              color: waiting ? "transparent" : "rgba(255,255,255,1)",
              borderColor: waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)",
              background: waiting ? "rgba(255,255,255,0.02)" : undefined,
            }}
          >
            {`${(claimSongName || songName || "Lyric").trim()} Dance`}
          </div>
        ) : (
          <>
            {songName ? (
              <p
                style={{
                  fontSize: 24,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.9)",
                  lineHeight: 1.15,
                  marginBottom: 6,
                  letterSpacing: "-0.01em",
                }}
              >
                {songName}
              </p>
            ) : (
              <div className="h-8 mb-2" />
            )}
            {duration && (
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.28)",
                  marginBottom: 28,
                }}
              >
                {duration}
              </p>
            )}
            <div
              style={{
                padding: "12px 32px",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.12em",
                fontFamily: "monospace",
                textTransform: "uppercase",
                color: waiting ? "transparent" : "rgba(255,255,255,0.85)",
                border: `1.5px solid ${waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)"}`,
                borderRadius: 28,
                background: waiting ? "rgba(255,255,255,0.02)" : "transparent",
              }}
              className="transition-all duration-700"
            >
              Listen Now
            </div>
          </>
        )}
      </div>
    </div>
  );
}
