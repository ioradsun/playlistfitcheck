import { useState, useEffect, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
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

// Spotify mini player (compact strip with play controls)
const SPOTIFY_MINI_HEIGHT = 152;
const SOUNDCLOUD_HEIGHT = 166;

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
  const [revealReady, setRevealReady] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const isSoundCloud = platform === "soundcloud";
  const embedHeight = isSoundCloud ? SOUNDCLOUD_HEIGHT : SPOTIFY_MINI_HEIGHT;

  const embedSrc =
    isSoundCloud && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  useEffect(() => {
    setIframeLoaded(false);
    setRevealReady(false);
  }, [embedSrc]);

  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = setTimeout(() => setRevealReady(true), 150);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  if (reelsMode) {
    return (
      <div className="w-full h-full overflow-hidden relative" style={{ background: "#000" }} onClick={handleClick}>
        {/* Blurred album art fills entire viewport */}
        {albumArtUrl && (
          <div className="absolute inset-0 z-[1]">
            <img src={albumArtUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-60" />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        )}

        {/* Centered card: album art hero + mini player */}
        <div className="relative z-[10] flex items-center justify-center h-full px-6">
          <div className="w-full max-w-[400px] relative overflow-hidden" style={{ borderRadius: 12 }}>
            {/* Album art hero */}
            <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
              {albumArtUrl ? (
                <>
                  <img src={albumArtUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <p className="text-sm font-bold text-white drop-shadow-md truncate">{trackTitle}</p>
                    {artistName && (
                      <p className="text-xs text-white/60 drop-shadow-md truncate mt-0.5">{artistName}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full h-full bg-muted/20" />
              )}
            </div>

            {/* Mini player pinned below art */}
            <div className="relative" style={{ height: embedHeight, background: "#000" }}>
              {/* Loading placeholder */}
              {!revealReady && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center bg-[#181818]">
                  <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                </div>
              )}
              <iframe
                src={embedSrc}
                width="100%"
                height={embedHeight}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="border-0 block w-full relative z-[1]"
                style={{
                  background: "#000",
                  opacity: revealReady ? 1 : 0,
                  transition: "opacity 500ms ease",
                }}
                title={`Play ${trackTitle}`}
                scrolling={isSoundCloud ? "no" : undefined}
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Non-reels: 320px card with album art hero + mini player at bottom ──
  return (
    <div
      className="w-full overflow-hidden relative"
      style={{ height: 320, background: "#0a0a0a" }}
      onClick={handleClick}
    >
      {/* Album art hero — fills entire 320px */}
      <div className="absolute inset-0 z-[1]">
        {albumArtUrl ? (
          <>
            <img src={albumArtUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="w-full h-full animate-pulse bg-muted" />
        )}
      </div>

      {/* Song info overlaid on art — positioned above the mini player */}
      <div className="absolute left-3 right-3 z-[5]" style={{ bottom: embedHeight + 8 }}>
        <p className="text-sm font-bold text-white drop-shadow-md line-clamp-1">{trackTitle}</p>
        {artistName && (
          <p className="text-xs text-white/50 drop-shadow-md truncate mt-0.5">{artistName}</p>
        )}
      </div>

      {/* Mini player pinned to bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[8]"
        style={{ height: embedHeight, background: "#000" }}
      >
        {/* Loading placeholder — matches Spotify's dark bg */}
        {!revealReady && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center bg-[#181818] rounded-b-xl">
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
          </div>
        )}
        <iframe
          src={embedSrc}
          width="100%"
          height={embedHeight}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="border-0 block w-full relative z-[1]"
          style={{
            background: "#000",
            opacity: revealReady ? 1 : 0,
            transition: "opacity 700ms ease",
          }}
          title={`Play ${trackTitle}`}
          scrolling={isSoundCloud ? "no" : undefined}
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
