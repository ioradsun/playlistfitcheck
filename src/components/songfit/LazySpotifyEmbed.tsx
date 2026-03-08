import { useState, useEffect, memo, useRef } from "react";
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
}

/**
 * Spotify embeds render their internal layout based on the iframe `height` attribute:
 *   • 152px → compact (no artwork)
 *   • 352px → full (with artwork + tracklist)
 *
 * We use 352 (Spotify's native full-track height) and let the container match.
 * The embed is preconnected to Spotify's CDN for faster cold starts.
 */
const SPOTIFY_FULL_HEIGHT = 352;
const SOUNDCLOUD_HEIGHT = 166;

function LazySpotifyEmbedInner({ trackId, trackTitle, trackUrl, postId, albumArtUrl, cardState: _cardState }: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const preconnected = useRef(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const isSpotify = platform === "spotify";

  const embedSrc = !isSpotify && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`;

  const nativeHeight = isSpotify ? SPOTIFY_FULL_HEIGHT : SOUNDCLOUD_HEIGHT;

  // Preconnect to Spotify CDN on first mount for faster iframe load
  useEffect(() => {
    if (preconnected.current || !isSpotify) return;
    preconnected.current = true;
    const origins = ["https://open.spotify.com", "https://i.scdn.co"];
    origins.forEach((origin) => {
      if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    });
  }, [isSpotify]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [embedSrc]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  return (
    <div
      className="w-full rounded-xl overflow-hidden relative"
      style={{ height: nativeHeight, backgroundColor: "#121212" }}
      onClick={handleClick}
    >
      {/* Blurred album art placeholder while iframe loads */}
      {!iframeLoaded && albumArtUrl && (
        <img
          src={albumArtUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm"
        />
      )}

      {!iframeLoaded && (
        <div className="absolute inset-0 w-full rounded-xl animate-pulse" style={{ backgroundColor: "#1a1a1a" }} />
      )}

      {/* iframe uses the native height as an HTML attribute so Spotify renders the correct layout */}
      <iframe
        src={embedSrc}
        width="100%"
        height={nativeHeight}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="border-0 block relative z-10 transition-opacity duration-300"
        style={{ opacity: iframeLoaded ? 1 : 0, borderRadius: 12 }}
        title={`Play ${trackTitle}`}
        scrolling={isSpotify ? undefined : "no"}
        onLoad={() => setIframeLoaded(true)}
      />

      {iframeLoaded && (
        <div className="absolute top-3 left-3 z-20 pointer-events-none">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
            Now Streaming
          </span>
        </div>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
