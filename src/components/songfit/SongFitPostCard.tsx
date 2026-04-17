/**
 * SongFitPostCard — a single card in the CrowdFit feed.
 *
 * Only renders posts that have a LyricDance.
 * The ONE player (LyricDanceEmbed) owns header, canvas, and FMLY bar.
 *
 * Supports reels mode (full-height, snap) and standard mode.
 */
import { useState, memo } from "react";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { cn } from "@/lib/utils";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { logEngagementEvent } from "@/lib/engagementTracking";
import type { SongFitPost } from "./types";

interface Props {
  post: SongFitPost;
  rank?: number;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: {
    total: number;
    replay_yes: number;
    saves_count?: number;
    signal_velocity?: number;
  };
  lyricDanceData?: LyricDanceData | null;
  visible?: boolean;
  fastScrolling?: boolean;
  reelsMode?: boolean;
  isFirst?: boolean;
}

export const SongFitPostCard = memo(function SongFitPostCard({
  post,
  lyricDanceData,
  visible,
  fastScrolling = false,
  reelsMode = false,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [captionExpanded, setCaptionExpanded] = useState(false);

  // ── Derived ──
  const lyricDanceUrl = post.lyric_projects?.artist_slug && post.lyric_projects?.url_slug
    ? `/${post.lyric_projects.artist_slug}/${post.lyric_projects.url_slug}/lyric-dance` : null;
  const hasLyricDance = !!(lyricDanceUrl && post.project_id);
  const displayName = post.profiles?.display_name || "Anonymous";
  const localCaption = post.caption || "";

  // Only render posts with a lyric dance — single player everywhere
  if (!hasLyricDance) return null;

  const handleProfileClick = () => {
    if (user && user.id !== post.user_id) logEngagementEvent(post.id, user.id, "profile_visit");
    navigate(`/u/${post.user_id}`);
  };

  return (
    <div className={reelsMode ? "h-full" : "px-2 pb-3"}>
      <div
        className={cn(
          "relative overflow-hidden",
          reelsMode ? "h-full bg-black" : "rounded-2xl",
        )}
        style={reelsMode ? undefined : { background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}
      >
        {/* Reels top gradient scrim */}
        {reelsMode && (
          <div className="absolute top-0 left-0 right-0 h-24 z-[5] bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
        )}

        {/* ── Media: LyricDanceEmbed owns header, canvas, and FMLY bar ── */}
        <div className={cn("relative", reelsMode ? "absolute inset-0" : "")}>
          <div className="relative" style={reelsMode ? { height: "100%" } : { height: 320 }}>
            <LyricDanceEmbed
              lyricDanceId={post.project_id!}
              songTitle={post.lyric_projects?.title ?? post.caption}
              artistName={displayName}
              visible={visible}
              postId={post.id}
              lyricDanceUrl={lyricDanceUrl}
              spotifyTrackId={post.lyric_projects?.spotify_track_id ?? null}
              spotifyArtistId={(post.profiles as any)?.spotify_artist_id}
              prefetchedData={lyricDanceData ?? null}
              avatarUrl={post.profiles?.avatar_url}
              isVerified={(post.profiles as any)?.is_verified}
              userId={post.user_id}
              onProfileClick={handleProfileClick}
              fastScrolling={fastScrolling}
              previewPaletteColor={
                (post.lyric_projects as any)?.auto_palettes?.[0]?.[0]
                ?? post.lyric_projects?.palette?.[0]
                ?? null
              }
              previewImageUrl={
                post.lyric_projects?.album_art_url
                ?? post.lyric_projects?.section_images?.[0]
                ?? null
              }
            />
          </div>
        </div>

        {/* ── Standard: caption ── */}
        {!reelsMode && localCaption?.trim() ? (
          <div className="relative px-3 pt-1.5 pb-1" style={{ background: "#0a0a0a" }}>
            {localCaption.length <= 125 || captionExpanded ? (
              <p className="text-[13px] leading-snug text-white/50">{localCaption}</p>
            ) : (
              <p className="text-[13px] leading-snug text-white/50">
                {localCaption.slice(0, 125).trimEnd()}
                <span className="text-white/20">… </span>
                <button onClick={() => setCaptionExpanded(true)} className="text-white/20 hover:text-white/40 text-[13px]">more</button>
              </p>
            )}
          </div>
        ) : null}

        <div className="h-px" />
      </div>
    </div>
  );
});
