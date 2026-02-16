import { useRef, useState, useEffect, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";
import { Play } from "lucide-react";

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
  albumArtUrl?: string | null;
  artistName?: string;
}

// Singleton: only one iframe loaded at a time across the entire feed
let globalActiveId: string | null = null;
const listeners = new Set<() => void>();
function setGlobalActive(id: string) {
  globalActiveId = id;
  listeners.forEach(fn => fn());
}

function LazySpotifyEmbedInner({ trackId, trackTitle, trackUrl, postId, albumArtUrl, artistName }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [activated, setActivated] = useState(false);
  const { user } = useAuth();

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const instanceId = postId || trackId;

  // Deactivate if another embed takes over
  useEffect(() => {
    const handler = () => {
      if (globalActiveId !== instanceId) setActivated(false);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, [instanceId]);

  // IntersectionObserver — just marks "near viewport" for prefetch hints
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleActivate = () => {
    setGlobalActive(instanceId);
    setActivated(true);
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  const embedSrc = platform === "soundcloud" && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`;

  const height = platform === "soundcloud" ? 166 : 352;

  return (
    <>
      {/* DNS/connection prefetch when near viewport */}
      {nearViewport && !activated && platform === "spotify" && (
        <link rel="preconnect" href="https://open.spotify.com" />
      )}

      <div ref={ref} className="w-full rounded-xl overflow-hidden" style={{ minHeight: height }}>
        {activated ? (
          <iframe
            src={embedSrc}
            width="100%"
            height={height}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            className="border-0 block"
            title={`Play ${trackTitle}`}
            scrolling={platform === "soundcloud" ? "no" : undefined}
          />
        ) : (
          <button
            onClick={handleActivate}
            className="relative w-full group cursor-pointer block text-left"
            style={{ height }}
            aria-label={`Play ${trackTitle}`}
          >
            {/* Background: album art or gradient */}
            {albumArtUrl ? (
              <img
                src={albumArtUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/60" />
            )}

            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/40 transition-colors" />

            {/* Content */}
            <div className="relative h-full flex flex-col items-center justify-center gap-3 px-4">
              <div className="w-14 h-14 rounded-full bg-primary/90 group-hover:bg-primary group-hover:scale-110 transition-all flex items-center justify-center shadow-lg">
                <Play size={24} className="text-primary-foreground ml-0.5" fill="currentColor" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-semibold truncate max-w-[280px]">{trackTitle}</p>
                {artistName && (
                  <p className="text-white/70 text-xs mt-0.5 truncate max-w-[240px]">{artistName}</p>
                )}
              </div>
              <span className="text-white/50 text-[10px] uppercase tracking-wider">
                Tap to load {platform === "soundcloud" ? "SoundCloud" : "Spotify"} player
              </span>
            </div>
          </button>
        )}
      </div>
    </>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
