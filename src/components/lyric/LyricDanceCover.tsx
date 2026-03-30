import React, { useEffect, useRef, useState } from "react";
import { getPreloadedImage, preloadImage } from "@/lib/imagePreloadCache";

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
  /** All section images — cycled with CSS crossfade. Falls back to coverImageUrl. */
  sectionImages?: string[];
  /** When true, fades out the background (canvas is ready, lyrics show through) */
  hideBackground?: boolean;
  /** First two lyric lines shown as animated preview text */
  previewLines?: string[];
  /** Hook phrase — highlighted in the preview */
  hookPhrase?: string | null;
  /** Resolved typography from the song's cinematic_direction — matches player font exactly */
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
  const images: string[] = (sectionImages && sectionImages.length > 0)
    ? sectionImages
    : (coverImageUrl ? [coverImageUrl] : []);

  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (images.length === 0) return;
    let cancelled = false;
    images.forEach((url) => {
      const cached = getPreloadedImage(url);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        setLoadedImages((prev) => new Set([...prev, url]));
        return;
      }
      preloadImage(url).then(() => {
        if (!cancelled) setLoadedImages((prev) => new Set([...prev, url]));
      });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.join(",")]);

  const showPreview = !hideBackground && !waiting && previewLines && previewLines.length > 0;

  const cycleTime = 4;
  const totalDuration = cycleTime * Math.max(images.length, 1);

  // Typography fallback — matches player default
  const fontFamily = typography?.fontFamily ?? '"Montserrat", sans-serif';
  const fontWeight = typography?.fontWeight ?? 600;
  const textTransform = typography?.textTransform ?? "none";
  // letterSpacing from resolver is in em units
  const letterSpacing = typography ? `${typography.letterSpacing}em` : "0.03em";

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

      {/* Base layer — album art always visible, never waits for preload */}
      {coverImageUrl && !hideBackground && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px) saturate(0.5)",
            transform: "scale(1.08)",
          }}
        />
      )}

      {/* Section image layers — each crossfades in turn */}
      {images.map((url, i) => (
        <div
          key={url}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px) saturate(0.6)",
            opacity: hideBackground ? 0 : loadedImages.has(url) ? 1 : 0,
            animation: hideBackground || !loadedImages.has(url)
              ? "none"
              : `imgCycle ${totalDuration}s ease-in-out infinite`,
            animationDelay: `${i * cycleTime}s`,
            transition: "opacity 0.5s ease",
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

      {/* Lyric preview — uses the actual player font */}
      {showPreview && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[5]"
          style={{ paddingBottom: "4rem" }}
        >
          {previewLines!.map((line, i) => {
            const isHook = !!(hookPhrase && line === hookPhrase);
            const lineDuration = 4;
            const lineDelay = i * (lineDuration * 0.6);
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
                  animation: `lyricCycle ${lineDuration * 2}s ease-in-out infinite`,
                  animationDelay: `${lineDelay}s`,
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
