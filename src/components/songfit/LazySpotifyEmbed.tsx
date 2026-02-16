import { useRef, useState, useEffect } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
}

export function LazySpotifyEmbed({ trackId, trackTitle, trackUrl, postId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { user } = useAuth();

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  const embedSrc = platform === "soundcloud" && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`;

  const height = platform === "soundcloud" ? 166 : 352;

  return (
    <div ref={ref} className="w-full rounded-xl overflow-hidden" style={{ minHeight: height }} onClick={handleClick}>
      {visible ? (
        <iframe
          src={embedSrc}
          width="100%"
          height={height}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="border-0 block"
          title={`Play ${trackTitle}`}
          scrolling={platform === "soundcloud" ? "no" : undefined}
        />
      ) : (
        <div className="w-full bg-muted/30 animate-pulse rounded" style={{ height }} />
      )}
    </div>
  );
}
