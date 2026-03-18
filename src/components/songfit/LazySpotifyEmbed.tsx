import { useState, useEffect, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";
import type { CardState } from "./useCardLifecycle";

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
  albumArtUrl?: string | null;
  artistName?: string;
  genre?: string | null;
  cardState: CardState;
  reelsMode?: boolean;
}

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  artistName,
  cardState: _cardState,
  reelsMode = false,
}: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // Extra delay after iframe onload — gives Spotify's internal JS time to
  // apply dark theme before we fade the poster out. Without this, the iframe's
  // white default background shows through during the crossfade.
  const [revealReady, setRevealReady] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const embedHeight = platform === "soundcloud" ? 166 : 352;

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  useEffect(() => {
    setIframeLoaded(false);
    setRevealReady(false);
  }, [embedSrc]);

  useEffect(() => {
    if (!iframeLoaded) return;
    // Wait 150ms after iframe onload for Spotify's internal dark theme to paint.
    // This prevents a white flash during the crossfade.
    const timer = setTimeout(() => setRevealReady(true), 150);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden relative",
        reelsMode ? "h-full" : "",
      )}
      style={
        reelsMode
          ? { background: "#000" }
          : {
              height: embedHeight,
              background: "#0a0a0a",
              borderRadius: 12,
              overflow: "hidden",
              WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' rx='12' ry='12'/%3E%3C/svg%3E")`,
              WebkitMaskSize: "100% 100%",
              maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' rx='12' ry='12'/%3E%3C/svg%3E")`,
              maskSize: "100% 100%",
            }
      }
      onClick={handleClick}
    >
      {reelsMode ? (
        <>
          {/* Blurred album art fills entire viewport */}
          {albumArtUrl && (
            <div className="absolute inset-0 z-[1]">
              <img
                src={albumArtUrl}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-60"
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          )}

          {/* Centered iframe with constrained width */}
          <div className="relative z-[10] flex items-center justify-center h-full px-6">
            <div
              className="w-full max-w-[400px] relative"
              style={{ borderRadius: 12, overflow: "hidden", height: embedHeight }}
            >
              {/* Song info poster — visible until iframe fully renders */}
              {albumArtUrl && (
                <div
                  className="absolute inset-0 z-[2] transition-opacity duration-500 pointer-events-none"
                  style={{ opacity: revealReady ? 0 : 1 }}
                >
                  <img
                    src={albumArtUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <p className="text-sm font-bold text-white drop-shadow-md truncate">
                      {trackTitle}
                    </p>
                  </div>
                </div>
              )}
              <iframe
                src={embedSrc}
                width="100%"
                height={embedHeight}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="border-0 block w-full relative z-[1]"
                style={{ background: "#000" }}
                title={`Play ${trackTitle}`}
                scrolling={platform === "soundcloud" ? "no" : undefined}
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Full-bleed album art poster — sits behind iframe, fades out when ready */}
          <div
            className="absolute inset-0 w-full h-full z-[6] pointer-events-none transition-opacity duration-700"
            style={{ opacity: revealReady ? 0 : 1 }}
          >
            {albumArtUrl ? (
              <>
                <img
                  src={albumArtUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">
                      {trackTitle}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
            )}
          </div>

          {/* Iframe — pinned to exact embed height, dark bg masks white flash */}
          <iframe
            src={embedSrc}
            width="100%"
            height={embedHeight}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            className="absolute inset-x-0 top-0 border-0 block w-full"
            style={{
              height: embedHeight,
              background: "#000",
              opacity: revealReady ? 1 : 0,
              transition: "opacity 700ms ease",
            }}
            title={`Play ${trackTitle}`}
            scrolling={platform === "soundcloud" ? "no" : undefined}
            onLoad={() => setIframeLoaded(true)}
          />
        </>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
