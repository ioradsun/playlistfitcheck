import { useRef, useState, useEffect, memo, createContext, useContext } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";

// Feed-level counter: first N embeds load eagerly
const EagerCountContext = createContext<{ claim: () => number }>({
  claim: () => 999,
});

const EAGER_LIMIT = 2;

export function EagerEmbedProvider({ children }: { children: React.ReactNode }) {
  const counterRef = useRef(0);
  const claim = () => ++counterRef.current;
  // Reset counter when feed re-mounts (e.g. tab switch)
  useEffect(() => { counterRef.current = 0; }, []);
  return (
    <EagerCountContext.Provider value={{ claim }}>
      {children}
    </EagerCountContext.Provider>
  );
}

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
  albumArtUrl?: string | null;
  artistName?: string;
}

function LazySpotifyEmbedInner({ trackId, trackTitle, trackUrl, postId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { claim } = useContext(EagerCountContext);
  const [isEager] = useState(() => claim() <= EAGER_LIMIT);
  const [visible, setVisible] = useState(isEager);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  useEffect(() => {
    if (isEager) return; // already visible
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEager]);

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
          loading={isEager ? "eager" : "lazy"}
          className="border-0 block"
          title={`Play ${trackTitle}`}
          scrolling={platform === "soundcloud" ? "no" : undefined}
        />
      ) : (
        <div className="w-full bg-muted/30 animate-pulse rounded-xl" style={{ height }} />
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
