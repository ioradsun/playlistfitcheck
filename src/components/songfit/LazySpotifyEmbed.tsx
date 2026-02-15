import { useRef, useState, useEffect } from "react";

interface Props {
  trackId: string;
  trackTitle: string;
}

export function LazySpotifyEmbed({ trackId, trackTitle }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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
      { rootMargin: "200px" } // start loading 200px before entering viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ minHeight: 352 }}>
      {visible ? (
        <iframe
          src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=1`}
          width="100%"
          height="352"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="border-0 block"
          title={`Play ${trackTitle}`}
        />
      ) : (
        <div className="w-full h-[352px] bg-muted/30 animate-pulse rounded" />
      )}
    </div>
  );
}
