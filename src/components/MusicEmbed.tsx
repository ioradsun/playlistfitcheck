import { useRef, useState, useEffect } from "react";
import { detectPlatform, toSpotifyEmbedUrl, toSoundCloudEmbedUrl, type MusicPlatform } from "@/lib/platformUtils";

interface Props {
  url: string;
  title?: string;
  height?: number;
  /** If true, lazy-load with IntersectionObserver */
  lazy?: boolean;
}

/**
 * Universal music embed that supports Spotify and SoundCloud URLs.
 * Automatically detects the platform and renders the appropriate embed.
 */
export function MusicEmbed({ url, title = "Music embed", height = 352, lazy = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const platform = detectPlatform(url);

  useEffect(() => {
    if (!lazy) return;
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
  }, [lazy]);

  const embedSrc = platform === "spotify"
    ? toSpotifyEmbedUrl(url)
    : platform === "soundcloud"
    ? toSoundCloudEmbedUrl(url)
    : null;

  if (!embedSrc) return null;

  const iframeHeight = platform === "soundcloud" ? Math.max(height, 166) : height;

  return (
    <div ref={ref} className="w-full" style={{ minHeight: iframeHeight }}>
      {visible ? (
        <iframe
          src={embedSrc}
          width="100%"
          height={iframeHeight}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="border-0 block rounded-lg"
          title={title}
          scrolling={platform === "soundcloud" ? "no" : undefined}
        />
      ) : (
        <div className="w-full bg-muted/30 animate-pulse rounded" style={{ height: iframeHeight }} />
      )}
    </div>
  );
}
