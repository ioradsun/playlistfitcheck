import React, { useEffect, useRef, useState } from "react";
import { getPreloadedImage, preloadImage } from "@/lib/imagePreloadCache";

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
}: LyricDanceCoverProps) {
  // Determine which images to cycle. Use section images if available, fall back to album art.
  const images: string[] = (sectionImages && sectionImages.length > 0)
    ? sectionImages
    : (coverImageUrl ? [coverImageUrl] : []);

  // Preload all section images so crossfade doesn't flash on first cycle
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
  }, [images.join(",")]);

  const showPreview = !hideBackground && !waiting && previewLines && previewLines.length > 0;

  // Each image is visible for (cycleTime) seconds, crossfade (fadeTime) seconds
  const cycleTime = 4; // seconds per image
  const totalDuration = cycleTime * images.length;

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

      {/* Section image layers — each crossfades in turn via animation-delay */}
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
            // First image starts visible immediately; others start at 0 opacity
            // via keyframe definition — no need for separate initial state
            transition: "opacity 0.5s ease",
          }}
        />
      ))}

      {/* Dark gradient overlay — pulses slightly */}
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

      {/* Badge + expand, pinned top */}
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

      {/* CSS lyric preview lines — fade cycle */}
      {showPreview && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[5]"
          style={{ paddingBottom: "4rem" }}
        >
          {previewLines!.map((line, i) => {
            const isHook = hookPhrase && line === hookPhrase;
            const lineDuration = 4;
            const lineDelay = i * (lineDuration * 0.6);
            return (
              <div
                key={i}
                style={{
                  fontFamily: "monospace",
                  fontSize: "clamp(11px, 2.8vw, 15px)",
                  letterSpacing: "0.04em",
                  textAlign: "center",
                  padding: "0 1.5rem",
                  marginBottom: "0.6rem",
                  color: isHook ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                  fontWeight: isHook ? 600 : 400,
                  animation: `lyricCycle ${lineDuration * 2}s ease-in-out infinite`,
                  animationDelay: `${lineDelay}s`,
                  opacity: 0,
                  maxWidth: "85%",
                  lineHeight: 1.5,
                  textShadow: "0 1px 10px rgba(0,0,0,0.9)",
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
