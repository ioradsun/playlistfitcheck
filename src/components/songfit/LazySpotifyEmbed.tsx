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

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  artistName,
  cardState: _cardState,
}: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

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
      style={{ height: platform === "soundcloud" ? 166 : 232, background: "#0a0a0a", borderRadius: 12 }}
      onClick={handleClick}
    >
      {/* Full-bleed album art poster — sits behind iframe */}
      <div className="absolute inset-0 w-full h-full z-[6] pointer-events-none">
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
                {artistName && (
                  <span className="text-xs text-white/70 drop-shadow-sm line-clamp-1">
                    {artistName}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
        )}
      </div>

      {/* Iframe */}
      <iframe
        src={embedSrc}
        width="100%"
        height={platform === "soundcloud" ? 166 : 232}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        className={`absolute inset-0 border-0 block w-full transition-opacity duration-700 ${iframeLoaded ? "z-[8]" : "z-[5]"}`}
        style={{ opacity: iframeLoaded ? 1 : 0, clipPath: "inset(0 round 12px)" }}
        title={`Play ${trackTitle}`}
        scrolling={platform === "soundcloud" ? "no" : undefined}
        onLoad={() => setIframeLoaded(true)}
      />

    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
