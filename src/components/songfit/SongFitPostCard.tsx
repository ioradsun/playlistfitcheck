/**
 * SongFitPostCard — a single card in the CrowdFit feed.
 *
 * Two media types:
 *   1. In Studio     — LyricDanceEmbed (has lyric_dance_id)
 *
 * Supports reels mode (full-height, snap) and standard mode.
 */
import { useState } from "react";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  MoreHorizontal,
  UserPlus,
  UserMinus,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  Check,
  Trophy,
  Bookmark,
  Share2,
  Clock,
  Flame,
} from "lucide-react";
import { TipButton } from "@/components/crypto/TipButton";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { SongFitPost } from "./types";
import { useNavigate } from "react-router-dom";
import { logEngagementEvent } from "@/lib/engagementTracking";
import { buildShareUrl, parseLyricDanceUrl } from "@/lib/shareUrl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CAPTION_MAX = 300;

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
  reelsMode?: boolean;
  isFirst?: boolean;
  /** When true, this card is at viewport center — pre-warm the player behind cover. */
  preload?: boolean;
}

export function SongFitPostCard({
  post,
  rank,
  onRefresh,
  isBillboard,
  signalData,
  lyricDanceData,
  visible,
  reelsMode = false,
  preload = false,
}: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const navigate = useNavigate();
  const cryptoEnabled = siteCopy.features?.crypto_tipping ?? false;

  // ── Local UI state ──
  const [liked, setLiked] = useState(post.user_has_liked ?? false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [tipsTotal, setTipsTotal] = useState(post.tips_total || 0);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followChecked, setFollowChecked] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || "");
  const [localCaption, setLocalCaption] = useState(post.caption || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(post.user_has_saved ?? false);

  // ── Derived ──
  const isOwnPost = user?.id === post.user_id;
  const hasLyricDance = !!(post.lyric_dance_url && post.lyric_dance_id);
  const isSpotifyOnly = !hasLyricDance && !!post.spotify_track_id && !post.lyric_dance_url;
  const displayName = post.profiles?.display_name || "Anonymous";
  if (isSpotifyOnly) return null;

  // ── Actions ──
  const handleProfileClick = () => {
    if (user && user.id !== post.user_id) logEngagementEvent(post.id, user.id, "profile_visit");
    navigate(`/u/${post.user_id}`);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("songfit_posts").update({ caption: editCaption.trim() }).eq("id", post.id);
      if (error) throw error;
      setLocalCaption(editCaption.trim());
      setEditing(false);
      toast.success("Post updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally { setSaving(false); }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase.from("songfit_posts").delete().eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      onRefresh();
    } catch (e: any) { toast.error(e.message || "Failed to delete"); }
  };

  const toggleLike = async () => {
    if (!user) { toast.error("Sign in to like posts"); return; }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((c) => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) await supabase.from("songfit_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      else { await supabase.from("songfit_likes").insert({ post_id: post.id, user_id: user.id }); logEngagementEvent(post.id, user.id, "like"); }
    } catch { setLiked(wasLiked); setLikesCount((c) => wasLiked ? c + 1 : c - 1); }
  };

  const toggleSave = async () => {
    if (!user) { toast.error("Sign in to save posts"); return; }
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) await supabase.from("songfit_saves").delete().eq("post_id", post.id).eq("user_id", user.id);
      else { await supabase.from("songfit_saves").insert({ post_id: post.id, user_id: user.id }); logEngagementEvent(post.id, user.id, "save"); }
    } catch { setSaved(wasSaved); }
  };

  const checkFollow = async () => {
    if (!user || isOwnPost || followChecked) return;
    const { data } = await supabase.from("songfit_follows").select("id").eq("follower_user_id", user.id).eq("followed_user_id", post.user_id).maybeSingle();
    setIsFollowing(!!data);
    setFollowChecked(true);
  };

  const toggleFollow = async () => {
    if (!user) { toast.error("Sign in to follow"); return; }
    try {
      if (isFollowing) {
        await supabase.from("songfit_follows").delete().eq("follower_user_id", user.id).eq("followed_user_id", post.user_id);
        setIsFollowing(false); toast.success("Unfollowed");
      } else {
        await supabase.from("songfit_follows").insert({ follower_user_id: user.id, followed_user_id: post.user_id });
        setIsFollowing(true); toast.success("Following!"); logEngagementEvent(post.id, user.id, "follow_from_post");
      }
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  const handleShare = async () => {
    let url: string;
    if (post.lyric_dance_url) {
      const parsed = parseLyricDanceUrl(post.lyric_dance_url);
      url = parsed ? buildShareUrl(parsed.artistSlug, parsed.songSlug) : `${window.location.origin}/song/${post.id}`;
    } else { url = `${window.location.origin}/song/${post.id}`; }
    try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); if (user) logEngagementEvent(post.id, user.id, "share"); }
    catch { toast.error("Failed to copy link"); }
  };

  // ── Render ──
  return (
    <div
      className={reelsMode ? "h-full" : "px-2 pb-3"}
    >
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

        {/* ── Header (standard mode only, hidden for lyric dance — embed owns it) ── */}
        <div className={cn("relative", (reelsMode || hasLyricDance) && "hidden")}>
          <PlayerHeader
            avatarUrl={post.profiles?.avatar_url}
            artistName={displayName}
            songTitle={post.track_title}
            spotifyArtistId={(post.profiles as any)?.spotify_artist_id}
            isVerified={(post.profiles as any)?.is_verified}
            userId={post.user_id}
            onProfileClick={handleProfileClick}
            cardMode="dance"
            onModeChange={() => {}}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
            <DropdownMenu onOpenChange={(open) => { if (open) checkFollow(); }}>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-full hover:bg-white/[0.04] text-white/15 hover:text-white/40 transition-colors shrink-0 focus:outline-none">
                  <MoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleProfileClick}><ExternalLink size={14} className="mr-2" /> Artist Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/song/${post.id}`)}><Trophy size={14} className="mr-2" /> Song Record</DropdownMenuItem>
                {!isOwnPost && user && (
                  <DropdownMenuItem onClick={toggleFollow}>
                    {isFollowing ? (<><UserMinus size={14} className="mr-2" /> Unfollow</>) : (<><UserPlus size={14} className="mr-2" /> Follow</>)}
                  </DropdownMenuItem>
                )}
                {isOwnPost && (
                  <>
                    <DropdownMenuItem onClick={() => { setEditCaption(localCaption); setEditing(true); }}><Pencil size={14} className="mr-2" /> Edit Caption</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeletePost}><Trash2 size={14} className="mr-2" /> Delete Post</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Media ── */}
        <div className={cn("relative", reelsMode ? "absolute inset-0" : "")}>
          {hasLyricDance ? (
            <div className="relative" style={reelsMode ? { height: "100%" } : { height: 320 }}>
              <LyricDanceEmbed
                lyricDanceId={post.lyric_dance_id!}
                songTitle={post.track_title}
                artistName={displayName}
                visible={visible}
                postId={post.id}
                lyricDanceUrl={post.lyric_dance_url ?? null}
                spotifyTrackId={post.spotify_track_id}
                spotifyArtistId={(post.profiles as any)?.spotify_artist_id}
                prefetchedData={lyricDanceData ?? null}
                avatarUrl={post.profiles?.avatar_url}
                isVerified={(post.profiles as any)?.is_verified}
                userId={post.user_id}
                onProfileClick={handleProfileClick}
                preload={preload}
              />
            </div>
          ) : (
            null
          )}
        </div>
        <>
            {/* ── Standard: caption ── */}
            {!reelsMode && (
              <>
                {editing ? (
                  <div className="relative px-3 pt-2 pb-1 space-y-2">
                    <textarea
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value.slice(0, CAPTION_MAX))}
                      rows={3}
                      className="w-full bg-white/5 text-sm text-white/90 placeholder:text-white/20 outline-none resize-none rounded-lg p-2 border border-white/10 focus:border-white/20"
                      autoFocus
                    />
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] ${editCaption.length >= CAPTION_MAX ? "text-white/60" : "text-white/20"}`}>
                        {editCaption.length}/{CAPTION_MAX}
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditing(false)} className="p-1.5 rounded-full hover:bg-white/5 text-white/40"><X size={14} /></button>
                        <button onClick={handleSaveEdit} disabled={saving} className="p-1.5 rounded-full hover:bg-white/5 text-white/60"><Check size={14} /></button>
                      </div>
                    </div>
                  </div>
                ) : localCaption?.trim() ? (
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
              </>
            )}

            {/* ── Action row (non-embed posts only, standard mode) ── */}
            {!hasLyricDance && !reelsMode && (
              <div className="relative flex items-center justify-between px-1 py-1">
                <div className="flex items-center">
                  <ActionBtn icon={<MessageCircle size={17} />} count={post.comments_count} onClick={() => { if (user) logEngagementEvent(post.id, user.id, "comment"); }} />
                  <ActionBtn icon={<Share2 size={17} />} onClick={handleShare} />
                  <ActionBtn icon={<Flame size={17} className={liked ? "fill-white/80 text-white/80" : ""} />} count={likesCount} onClick={toggleLike} />
                  <ActionBtn icon={<Bookmark size={17} className={saved ? "fill-white/80 text-white/80" : ""} />} count={(post as any).saves_count} onClick={toggleSave} />
                  {cryptoEnabled && (
                    <div className="flex items-center">
                      <TipButton recipientAddress={(post.profiles as any)?.wallet_address} recipientName={displayName} postId={post.id} recipientUserId={post.user_id} onTipLogged={(amount) => setTipsTotal((t) => t + amount)} />
                      {tipsTotal > 0 && <span className="text-[11px] text-white/35 font-mono -ml-1">{tipsTotal.toLocaleString()}</span>}
                    </div>
                  )}
                </div>

                <TooltipProvider delayDuration={350}>
                  <div className="flex items-center gap-2 text-white/20">
                    {post.engagement_score > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none">
                            <Trophy size={13} /><span className="text-[11px] font-mono">{Math.round(post.engagement_score)}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-48">Engagement score</TooltipContent>
                      </Tooltip>
                    )}
                    {post.status === "live" && post.expires_at && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none">
                            <Clock size={13} /><span className="text-[11px] font-mono">{Math.max(0, Math.ceil((new Date(post.expires_at).getTime() - Date.now()) / 86_400_000))}d</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-48">Days remaining</TooltipContent>
                      </Tooltip>
                    )}
                    {rank && rank <= 50 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-[11px] font-bold text-white/50 font-mono px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none">#{rank}</button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Billboard rank</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              </div>
            )}
          </>

        <div className="h-px" />
      </div>
    </div>
  );
}

// ── Tiny action button ──────────────────────────────────────────────────────
function ActionBtn({ icon, count, onClick }: { icon: React.ReactNode; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group focus:outline-none">
      <span className="text-white/25 group-hover:text-white/60 transition-colors">{icon}</span>
      {(count ?? 0) > 0 && <span className="text-[11px] text-white/20 font-mono group-hover:text-white/50">{count}</span>}
    </button>
  );
}
