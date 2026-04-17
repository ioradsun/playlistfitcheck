import { memo, useEffect, useRef } from "react";
import { LyricTextLayer } from "@/components/lyric/LyricTextLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import type { SongFitPost } from "@/components/songfit/types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface Props {
  post: SongFitPost;
  lyricData: LyricDanceData | null;
  isLive: boolean;
  currentTimeSec: number;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onMeasure: (id: string, height: number) => void;
  liveCanvasSlot?: React.MutableRefObject<HTMLDivElement | null>;
}

export const FeedCard = memo(function FeedCard({
  post,
  lyricData,
  isLive,
  currentTimeSec,
  registerRef,
  onMeasure,
  liveCanvasSlot,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerRef(post.id, rootRef.current);
    return () => registerRef(post.id, null);
  }, [post.id, registerRef]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => onMeasure(post.id, el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [post.id, onMeasure]);

  useEffect(() => {
    if (isLive && liveCanvasSlot) {
      liveCanvasSlot.current = canvasHostRef.current;
      return () => {
        if (liveCanvasSlot.current === canvasHostRef.current) liveCanvasSlot.current = null;
      };
    }
    return undefined;
  }, [isLive, liveCanvasSlot]);

  const lp = post.lyric_projects;
  const posterSrc =
    lp?.album_art_url ??
    lp?.section_images?.[0] ??
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  const lines = (lyricData as any)?.lines ?? [];
  const hasLyrics = Array.isArray(lines) && lines.length > 0;
  const phrases = (lyricData as any)?.cinematic_direction?.phrases;
  const typographyPlan = (lyricData as any)?.cinematic_direction?.typographyPlan ?? null;
  const words = (lyricData as any)?.words;
  const bpm = (lyricData as any)?.beat_grid?.bpm;

  return (
    <div ref={rootRef} className="px-2 pb-3">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}>
        <PlayerHeader
          avatarUrl={post.profiles?.avatar_url}
          artistName={post.profiles?.display_name ?? "Anonymous"}
          songTitle={lp?.title ?? post.caption}
          spotifyArtistId={(post.profiles as any)?.spotify_artist_id}
          lyricDanceUrl={lp?.artist_slug && lp?.url_slug ? `/${lp.artist_slug}/${lp.url_slug}/lyric-dance` : null}
          showMenuButton
          isVerified={(post.profiles as any)?.is_verified}
          userId={post.user_id}
          cardMode="listen"
          onModeChange={() => {}}
        />

        <div className="relative" style={{ height: 320 }}>
          <img
            src={posterSrc}
            alt=""
            aria-hidden
            decoding="async"
            fetchPriority={isLive ? "high" : "low"}
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
            style={{ objectFit: "cover", zIndex: 1, opacity: 1 }}
          />

          <div ref={canvasHostRef} className="absolute inset-0" style={{ zIndex: 2 }} />

          {hasLyrics ? (
            <LyricTextLayer
              lines={lines}
              words={words}
              phrases={phrases}
              typographyPlan={typographyPlan}
              currentTimeSec={currentTimeSec}
              ownsText
            />
          ) : (
            bpm ? <div className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/80" style={{ zIndex: 3 }}>{Math.round(Number(bpm))} BPM</div> : null
          )}
        </div>
      </div>
    </div>
  );
});
