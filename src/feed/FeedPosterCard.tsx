import { memo, useEffect, useRef } from "react";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import type { SongFitPost } from "@/components/songfit/types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface Props {
  post: SongFitPost;
  lyricData: LyricDanceData | null;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onMeasure: (id: string, height: number) => void;
}

export const FeedPosterCard = memo(function FeedPosterCard({
  post,
  lyricData,
  registerRef,
  onMeasure,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

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

  const lp = post.lyric_projects;
  const lyricDanceUrl = lp?.artist_slug && lp?.url_slug
    ? `/${lp.artist_slug}/${lp.url_slug}/lyric-dance`
    : null;

  return (
    <div ref={rootRef} className="px-2 pb-3">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="relative" style={{ height: 320 }}>
          <LyricDanceEmbed
            lyricDanceId={post.project_id ?? ""}
            postId={post.id}
            songTitle={lp?.title ?? post.caption}
            artistName={post.profiles?.display_name ?? "Anonymous"}
            avatarUrl={post.profiles?.avatar_url}
            isVerified={(post.profiles as any)?.is_verified}
            userId={post.user_id}
            spotifyTrackId={lp?.spotify_track_id ?? null}
            spotifyArtistId={(post.profiles as any)?.spotify_artist_id}
            lyricDanceUrl={lyricDanceUrl}
            prefetchedData={lyricData}
            previewPaletteColor={
              (lp as any)?.auto_palettes?.[0]?.[0]
              ?? lp?.palette?.[0]
              ?? null
            }
            previewImageUrl={lp?.album_art_url ?? lp?.section_images?.[0] ?? null}
            live={false}
          />
        </div>
      </div>
    </div>
  );
});
