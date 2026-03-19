import React, { useEffect, useRef, useState } from "react";

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
  /** When true, fades out the background image (canvas is ready, lyrics show through) */
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
  coverImageUrl,
  hideBackground = false,
}: LyricDanceCoverProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const loadedImageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coverImageUrl) {
      setImageLoaded(false);
      loadedImageRef.current = null;
      return;
    }

    if (loadedImageRef.current === coverImageUrl) {
      setImageLoaded(true);
      return;
    }

    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImageRef.current = coverImageUrl;
      setImageLoaded(true);
    };
    img.onerror = () => {
      loadedImageRef.current = coverImageUrl;
      setImageLoaded(true);
    };
    img.src = coverImageUrl;
  }, [coverImageUrl]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
      {/* Layer 1 — album art, blurred */}
      {coverImageUrl && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            backgroundImage: `url(${coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(8px) saturate(0.5)",
            transform: "scale(1.08)",
            opacity: hideBackground ? 0 : imageLoaded ? 1 : 0,
          }}
        />
      )}

      {/* Layer 2 — dark gradient over the image */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: isMarketingCover
            ? "rgba(0,0,0,0.75)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%)",
          opacity: hideBackground ? (isMarketingCover ? 0.6 : 0.7) : 1,
        }}
      />

      {/* Layer 3 — badge + expand, pinned top */}
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

      {/* Layer 3 — song title + Listen Now */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center" style={{ marginBottom: 24 }}>
        {isMarketingCover ? (
          <>
            {/* Play button — no explanatory text, the banner + badge handle context */}
            <button
              onClick={waiting ? undefined : onListen}
              className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
              style={{
                color: waiting ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,1)",
                borderColor: waiting ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.20)",
                cursor: waiting ? "default" : "pointer",
              }}
            >
              {waiting ? "Loading…" : `${(claimSongName || songName || "Lyric").trim()} Dance`}
            </button>
          </>
        ) : (
          <>
            {songName ? (
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4 max-w-[85%]">
                {songName}
              </p>
            ) : (
              <div className="h-4 mb-4" />
            )}
            <button
              onClick={waiting ? undefined : onListen}
              className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] border rounded-lg transition-all duration-700"
              style={{
                color: waiting ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,1)",
                borderColor: waiting ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.20)",
                cursor: waiting ? "default" : "pointer",
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
