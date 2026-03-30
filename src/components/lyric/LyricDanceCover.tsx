import React from "react";

interface LyricDanceCoverTypography {
  fontFamily: string;
  fontWeight: number;
  textTransform: "none" | "uppercase";
  letterSpacing: number;
}

interface LyricDanceCoverProps {
  songName: string;
  claimArtistName?: string;
  claimSongName?: string;
  isMarketingCover?: boolean;
  artistName?: string | null;
  avatarUrl?: string | null;
  initial?: string;
  waiting: boolean;
  onListen?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  badge?: string | null;
  onExpand?: () => void;
  coverImageUrl?: string | null;
  sectionImages?: string[];
  hideBackground?: boolean;
  previewLines?: string[];
  hookPhrase?: string | null;
  typography?: LyricDanceCoverTypography;
}

export function LyricDanceCover({
  songName,
  claimSongName = "",
  isMarketingCover = false,
  waiting,
  onListen,
  badge,
  onExpand,
  coverImageUrl,
  sectionImages,
  hideBackground = false,
  previewLines,
  hookPhrase,
  typography,
}: LyricDanceCoverProps) {
  // Images to cycle: section images first, fall back to coverImageUrl, then nothing
  const images: string[] = sectionImages?.length
    ? sectionImages
    : coverImageUrl
    ? [coverImageUrl]
    : [];

  const showPreview = !hideBackground && !waiting && previewLines && previewLines.length > 0;
  const cycleTime = 4;
  const totalDuration = cycleTime * Math.max(images.length, 1);

  const fontFamily = typography?.fontFamily ?? '"Montserrat", sans-serif';
  const fontWeight = typography?.fontWeight ?? 600;
  const textTransform = typography?.textTransform ?? "none";
  const letterSpacing = typography ? `${typography.letterSpacing}em` : "0.03em";

  // Base image: first available. CSS background-image loads gracefully —
  // shows nothing while fetching, appears instantly when cached. No JS opacity gate.
  const baseImage = images[0] ?? null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
      <style>{`
        @keyframes coverPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.82; }
        }
        @keyframes imgCycle {
          0%   { opacity: 0; transform: scale(1.06); }
          8%   { opacity: 1; transform: scale(1.08); }
          80%  { opacity: 1; transform: scale(1.13); }
          92%  { opacity: 0; transform: scale(1.15); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        @keyframes lyricCycle {
          0%, 15%  { opacity: 0; transform: translateY(6px); }
          25%, 75% { opacity: 1; transform: translateY(0); }
          85%, 100%{ opacity: 0; transform: translateY(-6px); }
        }
      `}</style>

      {/* Base layer — always-visible first image via CSS, no JS load gate */}
      {baseImage && !hideBackground && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${baseImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px) saturate(0.5)",
            transform: "scale(1.08)",
          }}
        />
      )}

      {/* Cycling section images — fade in over the base layer once loaded */}
      {images.length > 1 && !hideBackground && images.map((url, i) => (
        <div
          key={url}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px) saturate(0.6)",
            animation: `imgCycle ${totalDuration}s ease-in-out infinite`,
            animationDelay: `${i * cycleTime}s`,
            opacity: 0,
          }}
        />
      ))}

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: isMarketingCover
            ? "rgba(0,0,0,0.75)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.78) 100%)",
          opacity: hideBackground ? (isMarketingCover ? 0.6 : 0.7) : 1,
          animation: hideBackground ? "none" : "coverPulse 6s ease-in-out infinite",
          animationDelay: "1.5s",
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
              onClick={(e) => { e.stopPropagation(); onExpand(); }}
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

      {/* Lyric preview */}
      {showPreview && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[5]"
          style={{ paddingBottom: "4rem" }}
        >
          {previewLines!.map((line, i) => {
            const isHook = !!(hookPhrase && line === hookPhrase);
            return (
              <div
                key={i}
                style={{
                  fontFamily,
                  fontSize: "clamp(13px, 3.5vw, 18px)",
                  fontWeight: isHook ? Math.max(fontWeight, 700) : fontWeight,
                  textTransform,
                  letterSpacing,
                  textAlign: "center",
                  padding: "0 1.5rem",
                  marginBottom: "0.75rem",
                  color: isHook ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.6)",
                  animation: `lyricCycle ${8}s ease-in-out infinite`,
                  animationDelay: `${i * 4.8}s`,
                  opacity: 0,
                  maxWidth: "88%",
                  lineHeight: 1.4,
                  textShadow: "0 1px 12px rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.6)",
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      )}

      {/* Song title + Listen Now */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center" style={{ marginBottom: 24 }}>
        {isMarketingCover ? (
          <button
            onClick={waiting ? undefined : onListen}
            className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
            style={{
              color: waiting ? "transparent" : "rgba(255,255,255,1)",
              borderColor: waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)",
              cursor: waiting ? "default" : "pointer",
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
              onClick={waiting ? undefined : onListen}
              className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
              style={{
                color: waiting ? "transparent" : "rgba(255,255,255,1)",
                borderColor: waiting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.20)",
                cursor: waiting ? "default" : "pointer",
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
