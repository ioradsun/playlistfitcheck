import { useRef, useState, useEffect } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";

interface Props {
  /** Spotify track ID or full SoundCloud URL */
  trackId: string;
  trackTitle: string;
  /** Full track URL (needed for SoundCloud) */
  trackUrl?: string;
}

export function LazySpotifyEmbed({ trackId, trackTitle, trackUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Detect platform from trackUrl if available
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

  const embedSrc = platform === "soundcloud" && trackUrl
    ? toSoundCloudEmbedUrl(trackUrl)
    : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`;

  const height = platform === "soundcloud" ? 166 : 352;

  return (
    <div ref={ref} className="w-full" style={{ minHeight: height }}>
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
