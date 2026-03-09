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
}

function LazySpotifyEmbedInner({ trackId, trackTitle, trackUrl, postId, albumArtUrl, artistName, cardState: _cardState }: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc = platform === "soundcloud" && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

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
      className="w-full overflow-hidden relative"
      style={{ height: platform === "soundcloud" ? 166 : 232 }}
      onClick={handleClick}
    >
      {/* Full-bleed album art poster */}
      <div
        className="absolute inset-0 w-full h-full transition-opacity duration-500"
        style={{ opacity: iframeLoaded ? 0 : 1, pointerEvents: iframeLoaded ? "none" : "auto" }}
      >
        {albumArtUrl ? (
          <>
            <img
              src={albumArtUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">{trackTitle}</span>
                {artistName && (
                  <span className="text-xs text-white/70 drop-shadow-sm line-clamp-1">{artistName}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
        )}
      </div>

      {/* Iframe fades in on top when loaded */}
      <iframe
        src={embedSrc}
        width="100%"
        height={platform === "soundcloud" ? 166 : 260}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="absolute inset-0 border-0 block w-full transition-opacity duration-500 z-10"
        style={{ opacity: iframeLoaded ? 1 : 0 }}
        title={`Play ${trackTitle}`}
        scrolling={platform === "soundcloud" ? "no" : undefined}
        onLoad={() => setIframeLoaded(true)}
      />

      {/* Mask overlays to hide Spotify's light strips */}
      <div className="absolute top-0 left-0 right-0 bg-card pointer-events-none z-20" style={{ height: 10 }} />
      <div className="absolute bottom-0 left-0 right-0 bg-card pointer-events-none z-20" style={{ height: 10 }} />
      {iframeLoaded && (
        <div className="absolute top-3 left-3 z-30 pointer-events-none">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
            Now Streaming
          </span>
        </div>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
