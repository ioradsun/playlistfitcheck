import { memo, useCallback, useEffect, useRef } from "react";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { FmlyPost } from "@/components/fmly/types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface Props {
  post: FmlyPost;
  lyricData: LyricDanceData | null;
  /** When true, the card hosts the live player (engine, audio, FMLY bar, modes).
   *  When false, it's a static shell (poster + DOM lyrics + header). */
  live: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onMeasure: (id: string, height: number) => void;
  /** Called when user taps a non-primary card. Parent handles promotion. */
  onRequestPrimary?: (postId: string) => void;
}

export const FeedCard = memo(function FeedCard({
  post,
  lyricData,
  live,
  registerRef,
  onMeasure,
  onRequestPrimary,
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
  const handleRequestPrimary = useCallback(() => {
    onRequestPrimary?.(post.id);
  }, [onRequestPrimary, post.id]);

  return (
    <div ref={rootRef} className="px-2 pb-3">
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}
      >
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
            live={live}
            menuSlot={
              <SidebarTrigger
                className="p-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors md:hidden"
                style={{ flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="4" x2="14" y2="4" />
                  <line x1="2" y1="8" x2="14" y2="8" />
                  <line x1="2" y1="12" x2="14" y2="12" />
                </svg>
              </SidebarTrigger>
            }
            onRequestPrimary={handleRequestPrimary}
          />
        </div>
      </div>
    </div>
  );
});
