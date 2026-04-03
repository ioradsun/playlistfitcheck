/**
 * SongFitPostCard — a single card in the CrowdFit feed.
 *
 * Three media types:
 *   1. In Studio     — LyricDanceEmbed (has lyric_dance_id)
 *   2. In Battle     — BattleEmbed     (has lyric_dance_url, no lyric_dance_id)
 *   3. Now Streaming — LazySpotifyEmbed (has spotify_track_id)
 *
 * Supports reels mode (full-height, snap, bottom overlay) and standard mode.
 * PostCommentPanel is the sole comment UX (inline in Spotify cards).
 * LyricDance and Battle embeds own their own reaction/battle panels.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { cn } from "@/lib/utils";
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";
import {
  MessageCircle,
  User,
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
  ChevronDown,
} from "lucide-react";
import { TipButton } from "@/components/crypto/TipButton";
import { LazySpotifyEmbed } from "./LazySpotifyEmbed";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { BattleEmbed } from "@/components/hookfit/BattleEmbed";
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
import { ProfileHoverCard } from "./ProfileHoverCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useNavigate } from "react-router-dom";
import { logEngagementEvent } from "@/lib/engagementTracking";
import { buildShareUrl, parseLyricDanceUrl } from "@/lib/shareUrl";
import { useCardState } from "./useCardLifecycle";
import { PostCommentPanel } from "./PostCommentPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CAPTION_MAX = 300;

// Module-level palette cache — keyed by album_art_url.
// Survives component unmount/remount. Shared across all cards with same URL.
// Only used as fallback for old posts that don't have palette in DB yet.
const _paletteCache = new Map<string, string[]>();

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
  reelsMode = false,
  isFirst = false,
  preload = false,
}: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const navigate = useNavigate();
  const cryptoEnabled = siteCopy.features?.crypto_tipping ?? false;
  const hottestHooksEnabled = siteCopy.features?.hookfit_hottest_hooks !== false;

  // ── Card lifecycle ──
  const { state: cardState, activate, deactivate } = useCardState(post.id);

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
  const [panelOpen, setPanelOpen] = useState(false);

  // ── Derived ──
  const isOwnPost = user?.id === post.user_id;
  const hasLyricDance = !!(post.lyric_dance_url && post.lyric_dance_id);
  const isBattle = hottestHooksEnabled && !!(post.lyric_dance_url && !post.lyric_dance_id);
  const isSpotify = !hasLyricDance && !isBattle && !!post.spotify_track_id;
  const displayName = post.profiles?.display_name || "Anonymous";

  // Spotify palette
  const [spotifyPalette, setSpotifyPalette] = useState<string[] | undefined>();
  useEffect(() => {
    if (!isSpotify || !post.album_art_url) return;
    // Check DB palette first (set by persist-palette migration)
    if (post.palette && Array.isArray(post.palette) && post.palette.length > 0) {
      setSpotifyPalette(post.palette as string[]);
      return;
    }
    // Fallback for old posts without stored palette
    // Check module cache first
    const cached = _paletteCache.get(post.album_art_url);
    if (cached) {
      setSpotifyPalette(cached);
      return;
    }
    let cancelled = false;
    computeAutoPalettesFromUrls([post.album_art_url])
      .then((palettes) => {
        if (cancelled) return;
        if (palettes[0]?.length) {
          _paletteCache.set(post.album_art_url!, palettes[0]);
          setSpotifyPalette(palettes[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSpotify, post.album_art_url, post.palette]);

  // Card type label
  const typeLabel = useMemo(() => {
    if (isBattle) return `FMLY Feud · ${displayName}`;
    if (hasLyricDance) return `In Studio · ${displayName}`;
    if (isSpotify) return `Now Streaming · ${displayName}`;
    return displayName;
  }, [isBattle, hasLyricDance, isSpotify, displayName]);

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

  const handleOpenPanel = useCallback(() => setPanelOpen(true), []);
  const handleClosePanel = useCallback(() => setPanelOpen(false), []);

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

        {/* ── Header (standard mode only) ── */}
        <div className={cn("relative flex items-center justify-between px-3 py-2.5", reelsMode && "hidden")}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ProfileHoverCard userId={post.user_id}>
              <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={handleProfileClick}>
                <div className="relative shrink-0">
                  <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/[0.06]">
                    {post.profiles?.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={13} className="text-white/40" />
                    )}
                  </div>
                  {(post.profiles as any)?.is_verified && (
                    <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge size={11} /></span>
                  )}
                </div>
              </div>
            </ProfileHoverCard>
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 rounded px-1.5 py-0.5 min-w-0 truncate max-w-[60vw]">
              {typeLabel}
            </span>
          </div>

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

        {/* ── Media ── */}
        <div className={cn("relative", reelsMode ? "absolute inset-0" : "")}>
          {hasLyricDance ? (
            <div className="relative" style={reelsMode ? { height: "100%" } : { height: 320 }}>
              <LyricDanceEmbed
                lyricDanceId={post.lyric_dance_id!}
                lyricDanceUrl={post.lyric_dance_url!}
                songTitle={post.track_title}
                artistName={displayName}
                cardState={cardState}
                onPlay={activate}
                postId={post.id}
                spotifyTrackId={post.spotify_track_id}
                coverImageUrl={post.album_art_url}
                hideReactButton
                onOpenReactions={handleOpenPanel}
                prefetchedData={lyricDanceData ?? null}
                avatarUrl={post.profiles?.avatar_url}
                isVerified={(post.profiles as any)?.is_verified}
                onProfileClick={handleProfileClick}
                preload={preload}
              />
            </div>
          ) : isBattle ? (
            <div className="relative overflow-hidden" style={reelsMode ? { height: "100%" } : { height: 320 }}>
              <BattleEmbed
                battleUrl={post.lyric_dance_url!}
                songTitle={post.track_title}
                showSplitCover={true}
                cardState={cardState}
                onPlay={activate}
                onDeactivate={deactivate}
                initialVotedSide={(post as any).voted_side ?? null}
                avatarUrl={post.profiles?.avatar_url}
                displayName={displayName}
                isVerified={(post.profiles as any)?.is_verified}
                onProfileClick={handleProfileClick}
              />
            </div>
          ) : (
            <div
              className={cn("relative overflow-hidden", reelsMode ? "h-full flex flex-col items-center justify-center" : "")}
              style={reelsMode ? undefined : { background: "#0a0a0a", height: 320 }}
            >
              <LazySpotifyEmbed
                trackId={post.spotify_track_id}
                trackTitle={post.track_title}
                trackUrl={post.spotify_track_url}
                postId={post.id}
                albumArtUrl={post.album_art_url}
                artistName={(post.track_artists_json as any[])?.map((a: any) => a.name).join(", ")}
                genre={((post.tags_json as any[]) || [])[0] || null}
                onPlay={activate}
              />
              <PostCommentPanel
                postId={post.id}
                isOpen={panelOpen}
                onOpen={handleOpenPanel}
                onClose={handleClosePanel}
                cardState={cardState}
                trackTitle={post.track_title}
                variant={reelsMode ? "reels" : "embedded"}
                caption={!reelsMode && !editing ? localCaption : undefined}
                palette={spotifyPalette}
              />
            </div>
          )}
        </div>

        {/* ── Reels bottom overlay (for Spotify cards) ── */}
        {reelsMode && !hasLyricDance && !isBattle ? (
          <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
            <div className="flex-1" />
            <div className="pointer-events-auto bg-gradient-to-t from-[#0a0a0a]/90 via-[#0a0a0a]/50 to-transparent pt-20 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative shrink-0 cursor-pointer" onClick={handleProfileClick}>
                  <div className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                    {post.profiles?.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={14} className="text-white/40" />
                    )}
                  </div>
                  {(post.profiles as any)?.is_verified && (
                    <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge size={11} /></span>
                  )}
                </div>
                <span className="text-[12px] font-mono uppercase tracking-[0.12em] text-green-400 rounded px-1.5 py-0.5 min-w-0 truncate max-w-[60vw]">
                  {typeLabel}
                </span>
              </div>

              {localCaption?.trim() && !editing && (
                <p className="text-[14px] leading-snug text-white/50 mt-1">
                  {localCaption.length <= 80 ? localCaption : (
                    <>
                      {captionExpanded ? localCaption : localCaption.slice(0, 80).trimEnd()}
                      {!captionExpanded && (
                        <>
                          <span className="text-white/20">… </span>
                          <button onClick={() => setCaptionExpanded(true)} className="text-white/30 hover:text-white/50 text-[14px]">more</button>
                        </>
                      )}
                    </>
                  )}
                </p>
              )}

              {isFirst && (
                <div className="flex flex-col items-center gap-1 mt-4 animate-bounce">
                  <ChevronDown size={14} className="text-white/20 rotate-180" />
                  <span className="text-[9px] text-white/15 font-mono">swipe</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Standard: caption ── */}
            {!isSpotify && !reelsMode && (
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
            {!hasLyricDance && !isBattle && !isSpotify && !reelsMode && (
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
        )}

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
