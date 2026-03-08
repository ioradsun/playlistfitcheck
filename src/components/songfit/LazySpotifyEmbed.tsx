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

function LazySpotifyEmbedInner({ trackId, trackTitle, trackUrl, postId, albumArtUrl, cardState: _cardState }: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc = platform === "soundcloud" && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`;

  useEffect(() => {
    setIframeLoaded(false);
  }, [embedSrc]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  const height = platform === "soundcloud" ? 166 : 152;

  return (
    <div
      className="w-full rounded-xl overflow-hidden relative"
      style={{ height, backgroundColor: "#121212" }}
      onClick={handleClick}
    >
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

      <div className="w-full h-full">
        <iframe
          src={embedSrc}
          width="100%"
          height={height}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="border-0 block relative z-10 transition-opacity duration-300 w-full h-full"
          style={{ opacity: iframeLoaded ? 1 : 0 }}
          title={`Play ${trackTitle}`}
          scrolling={platform === "soundcloud" ? "no" : undefined}
          onLoad={() => setIframeLoaded(true)}
        />
      </div>

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
