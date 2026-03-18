import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
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
import { SubmissionBadge } from "./SubmissionBadge";
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
import { useCardState, type CardState } from "./useCardLifecycle";
import { PostCommentPanel } from "./PostCommentPanel";
import { useCardVote } from "@/hooks/useCardVote";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import { useTopPostReaction } from "@/hooks/useTopPostReaction";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  post: SongFitPost;
  rank?: number;
  onOpenComments: (postId: string) => void;
  onOpenLikes: (postId: string) => void;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: {
    total: number;
    replay_yes: number;
    saves_count?: number;
    signal_velocity?: number;
  };
  cardState: CardState;
  reelsMode?: boolean;
  isFirst?: boolean;
}

export function SongFitPostCard({
  post,
  rank,
  onOpenComments,
  onOpenLikes,
  onRefresh,
  isBillboard,
  signalData,
  cardState,
  reelsMode = false,
  isFirst = false,
}: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const cryptoEnabled = siteCopy.features?.crypto_tipping ?? false;
  
  const hottestHooksEnabled =
    siteCopy.features?.hookfit_hottest_hooks !== false;
  const navigate = useNavigate();
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
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const topPostReaction = useTopPostReaction(
    post.id,
    panelOpen || cardState !== "cold",
  );
  const { votedSide, score, note, setNote, handleVote } = useCardVote(post.id, {
    enabled: cardState !== "cold",
  });

  const handleCommentFromBar = useCallback(async () => {
    const content = note.trim();
    if (!content || !user) return;
    try {
      await supabase
        .from("songfit_comments")
        .insert({ post_id: post.id, user_id: user.id, content });
    } catch {
      // silent
    }
    setNote("");
    setCommentRefreshKey((k) => k + 1);
  }, [note, user, post.id, setNote]);

  const isOwnPost = user?.id === post.user_id;
  const hasLyricDancePost = !!(
    post.lyric_dance_url &&
    post.lyric_dance_id &&
    !post.spotify_track_id
  );
  const isBattlePost =
    hottestHooksEnabled &&
    !!(post.lyric_dance_url && !post.lyric_dance_id && !post.spotify_track_id);
  const isSpotifyEmbed =
    !hasLyricDancePost && !isBattlePost && !!post.spotify_track_id;
  const CAPTION_MAX = 300;

  const { activate } = useCardState(post.id);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("songfit_posts")
        .update({ caption: editCaption.trim() })
        .eq("id", post.id);
      if (error) throw error;
      setLocalCaption(editCaption.trim());
      setEditing(false);
      toast.success("Post updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase
        .from("songfit_posts")
        .delete()
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const toggleLike = async () => {
    if (!user) {
      toast.error("Sign in to like posts");
      return;
    }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((c) => (wasLiked ? c - 1 : c + 1));
    try {
      if (wasLiked) {
        await supabase
          .from("songfit_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("songfit_likes")
          .insert({ post_id: post.id, user_id: user.id });
        logEngagementEvent(post.id, user.id, "like");
      }
    } catch {
      setLiked(wasLiked);
      setLikesCount((c) => (wasLiked ? c + 1 : c - 1));
    }
  };

  const checkFollow = async () => {
    if (!user || isOwnPost || followChecked) return;
    const { data } = await supabase
      .from("songfit_follows")
      .select("id")
      .eq("follower_user_id", user.id)
      .eq("followed_user_id", post.user_id)
      .maybeSingle();
    setIsFollowing(!!data);
    setFollowChecked(true);
  };

  const toggleFollow = async () => {
    if (!user) {
      toast.error("Sign in to follow");
      return;
    }
    try {
      if (isFollowing) {
        await supabase
          .from("songfit_follows")
          .delete()
          .eq("follower_user_id", user.id)
          .eq("followed_user_id", post.user_id);
        setIsFollowing(false);
        toast.success("Unfollowed");
      } else {
        await supabase.from("songfit_follows").insert({
          follower_user_id: user.id,
          followed_user_id: post.user_id,
        });
        setIsFollowing(true);
        toast.success("Following!");
        logEngagementEvent(post.id, user.id, "follow_from_post");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const handleProfileClick = () => {
    if (user && user.id !== post.user_id) {
      logEngagementEvent(post.id, user.id, "profile_visit");
    }
    navigate(`/u/${post.user_id}`);
  };

  const toggleSave = async () => {
    if (!user) {
      toast.error("Sign in to save posts");
      return;
    }
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) {
        await supabase
          .from("songfit_saves")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("songfit_saves")
          .insert({ post_id: post.id, user_id: user.id });
        logEngagementEvent(post.id, user.id, "save");
      }
    } catch {
      setSaved(wasSaved);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/song/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
      if (user) logEngagementEvent(post.id, user.id, "share");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const displayName = post.profiles?.display_name || "Anonymous";

  return (
    <div className={reelsMode ? "h-full" : "px-2 pb-3"}>
      <div
        className={cn(
          "relative overflow-hidden",
          reelsMode ? "h-full bg-black" : "rounded-2xl",
        )}
        style={
          reelsMode
            ? undefined
            : {
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.04)",
              }
        }
      >
        {reelsMode && (
          <div className="absolute top-0 left-0 right-0 h-24 z-[5] bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
        )}

        {/* Header */}
        <div
          className={cn(
            "relative flex items-center justify-between px-3 py-2.5",
            reelsMode && "hidden",
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ProfileHoverCard userId={post.user_id}>
              <div
                className="flex items-center gap-2 cursor-pointer shrink-0"
                onClick={handleProfileClick}
              >
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

            {(hasLyricDancePost || isSpotifyEmbed) && (
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 rounded px-1.5 py-0.5 shrink-0">
                {hasLyricDancePost ? `In Studio · ${displayName}` : `Now Streaming · ${displayName}`}
              </span>
            )}
          </div>

          {/* 3-dot menu */}
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) checkFollow();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-white/[0.04] text-white/15 hover:text-white/40 transition-colors shrink-0 focus:outline-none">
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleProfileClick}>
                <ExternalLink size={14} className="mr-2" />
                Artist Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/song/${post.id}`)}>
                <Trophy size={14} className="mr-2" />
                Song Record
              </DropdownMenuItem>
              {!isOwnPost && user && (
                <DropdownMenuItem onClick={toggleFollow}>
                  {isFollowing ? (
                    <>
                      <UserMinus size={14} className="mr-2" /> Unfollow
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} className="mr-2" /> Follow
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {isOwnPost && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditCaption(localCaption);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} className="mr-2" />
                    Edit Caption
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={handleDeletePost}
                  >
                    <Trash2 size={14} className="mr-2" />
                    Delete Post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tiered media rendering */}
        <div
          className={cn(
            "relative transition-all duration-500",
            reelsMode && "absolute inset-0",
          )}
        >
          {post.lyric_dance_url &&
          post.lyric_dance_id &&
          !post.spotify_track_id ? (
            <div
              className="relative"
              style={reelsMode ? { height: "100%" } : { height: 320 }}
            >
              <LyricDanceEmbed
                lyricDanceId={post.lyric_dance_id}
                lyricDanceUrl={post.lyric_dance_url}
                songTitle={post.track_title}
                artistName={displayName}
                cardState={cardState}
                onPlay={activate}
                postId={post.id}
                coverImageUrl={post.album_art_url}
                hideReactButton
                reelsMode={reelsMode}
                externalPanelOpen={panelOpen}
                onExternalPanelOpenChange={setPanelOpen}
                onOpenReactions={() => setPanelOpen(true)}
              />
            </div>
          ) : post.lyric_dance_url &&
            !post.lyric_dance_id &&
            !post.spotify_track_id ? (
            <div
              className="relative overflow-hidden"
              style={reelsMode ? { height: "100%" } : { height: 320 }}
            >
              <BattleEmbed
                battleUrl={post.lyric_dance_url}
                songTitle={post.track_title}
                showSplitCover={true}
                cardState={cardState}
                onPlay={activate}
                initialVotedSide={(post as any).voted_side ?? null}
              />
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "relative overflow-hidden",
                  reelsMode
                    ? "h-full flex flex-col items-center justify-center"
                    : "",
                )}
                style={reelsMode ? undefined : { background: "#0a0a0a" }}
              >
                <LazySpotifyEmbed
                  reelsMode={reelsMode}
                  trackId={post.spotify_track_id}
                  trackTitle={post.track_title}
                  trackUrl={post.spotify_track_url}
                  postId={post.id}
                  albumArtUrl={post.album_art_url}
                  artistName={(post.track_artists_json as any[])
                    ?.map((a: any) => a.name)
                    .join(", ")}
                  genre={((post.tags_json as any[]) || [])[0] || null}
                  cardState={cardState}
                />
              </div>

                {/* Caption — directly below embed (desktop only; reels shows in bottom overlay) */}
                {!reelsMode && !editing && localCaption && localCaption.trim() && (
                  <div
                    className="px-3 pt-1.5 pb-1"
                    style={{ background: "#0a0a0a" }}
                  >
                    {localCaption.length <= 100 || captionExpanded ? (
                      <p className="text-[13px] leading-snug text-white/50">
                        {localCaption}
                      </p>
                    ) : (
                      <p className="text-[13px] leading-snug text-white/50">
                        {localCaption.slice(0, 100).trimEnd()}
                        <span className="text-white/20">… </span>
                        <button
                          onClick={() => setCaptionExpanded(true)}
                          className="text-white/20 hover:text-white/40 text-[13px]"
                        >
                          more
                        </button>
                      </p>
                    )}
                  </div>
                )}

                {isSpotifyEmbed && !reelsMode && (
                  <div
                    className={`relative ${panelOpen ? "z-[500]" : "z-[300]"}`}
                  >
                    <CardBottomBar
                      variant="fullscreen"
                      votedSide={votedSide}
                      score={score}
                      note={note}
                      onNoteChange={setNote}
                      onVoteYes={() => handleVote(true)}
                      onVoteNo={() => handleVote(false)}
                      onSubmit={handleCommentFromBar}
                      onOpenReactions={() => setPanelOpen(true)}
                      onClose={() => setPanelOpen(false)}
                      panelOpen={panelOpen}
                      topReaction={topPostReaction}
                      trackTitle={post.track_title}
                    />
                  </div>
                )}

              {/* PostCommentPanel — outside overflow-hidden, positioned relative to outer card wrapper */}
              {isSpotifyEmbed && (
                <PostCommentPanel
                  postId={post.id}
                  isOpen={panelOpen}
                  onClose={() => setPanelOpen(false)}
                  refreshKey={commentRefreshKey}
                  variant={reelsMode ? "reels" : "embedded"}
                />
              )}

            </>
          )}
        </div>

        {reelsMode ? (
          <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
            {/* Transparent top area — allows tap-through to canvas/embed */}
            <div className="flex-1" />
            {/* Bottom content with gradient scrim */}
            <div className="pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={handleProfileClick}
                >
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
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
                {(hasLyricDancePost || isSpotifyEmbed) && (
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 rounded px-1.5 py-0.5 shrink-0">
                    {hasLyricDancePost ? `In Studio · ${displayName}` : `Now Streaming · ${displayName}`}
                  </span>
                )}
              </div>


              {localCaption && localCaption.trim() && !editing && (
                <p className="text-[12px] leading-snug text-white/50 mt-1">
                  {localCaption.length <= 80 ? (
                    localCaption
                  ) : (
                    <>
                      {captionExpanded
                        ? localCaption
                        : localCaption.slice(0, 80).trimEnd()}
                      {!captionExpanded && (
                        <>
                          <span className="text-white/20">… </span>
                          <button
                            onClick={() => setCaptionExpanded(true)}
                            className="text-white/30 hover:text-white/50 text-[12px]"
                          >
                            more
                          </button>
                        </>
                      )}
                    </>
                  )}
                </p>
              )}

              <div className="mt-3 rounded-lg overflow-hidden">
                <CardBottomBar
                  variant="fullscreen"
                  votedSide={votedSide}
                  score={score}
                  note={note}
                  onNoteChange={setNote}
                  onVoteYes={() => handleVote(true)}
                  onVoteNo={() => handleVote(false)}
                  onSubmit={handleCommentFromBar}
                  onOpenReactions={() => setPanelOpen(true)}
                  onClose={() => setPanelOpen(false)}
                  panelOpen={panelOpen}
                  topReaction={topPostReaction}
                  trackTitle={post.track_title}
                />
              </div>

              {isFirst && (
                <div className="flex flex-col items-center gap-1 mt-4 animate-bounce">
                  <ChevronDown size={14} className="text-white/20 rotate-180" />
                  <span className="text-[9px] text-white/15 font-mono">
                    swipe
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Caption - Instagram style */}
            {!isSpotifyEmbed && (
              <>
                {editing ? (
                  <div className="relative px-3 pt-2 pb-1 space-y-2">
                    <textarea
                      value={editCaption}
                      onChange={(e) =>
                        setEditCaption(e.target.value.slice(0, CAPTION_MAX))
                      }
                      rows={3}
                      className="w-full bg-white/5 text-sm text-white/90 placeholder:text-white/20 outline-none resize-none rounded-lg p-2 border border-white/10 focus:border-white/20"
                      autoFocus
                    />
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] ${editCaption.length >= CAPTION_MAX ? "text-white/60" : "text-white/20"}`}
                      >
                        {editCaption.length}/{CAPTION_MAX}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setEditing(false)}
                          className="p-1.5 rounded-full hover:bg-white/5 text-white/40"
                        >
                          <X size={14} />
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="p-1.5 rounded-full hover:bg-white/5 text-white/60"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : localCaption && localCaption.trim() ? (
                  <div
                    className="relative px-3 pt-1.5 pb-1"
                    style={{ background: "#0a0a0a" }}
                  >
                    {localCaption.length <= 125 || captionExpanded ? (
                      <p className="text-[13px] leading-snug text-white/50">
                        {localCaption}
                      </p>
                    ) : (
                      <p className="text-[13px] leading-snug text-white/50">
                        {localCaption.slice(0, 125).trimEnd()}
                        <span className="text-white/20">… </span>
                        <button
                          onClick={() => setCaptionExpanded(true)}
                          className="text-white/20 hover:text-white/40 text-[13px]"
                        >
                          more
                        </button>
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {/* Action Row */}
            {!hasLyricDancePost &&
              !isBattlePost &&
              !isSpotifyEmbed && (
                <div className="relative flex items-center justify-between px-1 py-1">
                  {/* Left group: comment, share, like, bookmark */}
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        onOpenComments(post.id);
                        if (user)
                          logEngagementEvent(post.id, user.id, "comment");
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group focus:outline-none"
                    >
                      <MessageCircle
                        size={17}
                        className="text-white/25 group-hover:text-white/60 transition-colors"
                      />
                      {post.comments_count > 0 && (
                        <span className="text-[11px] text-white/20 font-mono group-hover:text-white/50">
                          {post.comments_count}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group focus:outline-none"
                    >
                      <Share2
                        size={17}
                        className="text-white/25 group-hover:text-white/60 transition-colors"
                      />
                    </button>

                    <button
                      onClick={toggleLike}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group focus:outline-none"
                    >
                      <Flame
                        size={17}
                        className={
                          liked
                            ? "fill-white/80 text-white/80"
                            : "text-white/25 group-hover:text-white/60 transition-colors"
                        }
                      />
                      {likesCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLikes(post.id);
                          }}
                          className="text-[11px] text-white/20 font-mono group-hover:text-white/50 focus:outline-none"
                        >
                          {likesCount}
                        </button>
                      )}
                    </button>

                    <button
                      onClick={toggleSave}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group focus:outline-none"
                    >
                      <Bookmark
                        size={17}
                        className={
                          saved
                            ? "fill-white/80 text-white/80"
                            : "text-white/25 group-hover:text-white/60 transition-colors"
                        }
                      />
                      {(post as any).saves_count > 0 && (
                        <span className="text-[11px] text-white/20 font-mono group-hover:text-white/50">
                          {(post as any).saves_count}
                        </span>
                      )}
                    </button>

                    {cryptoEnabled && (
                      <div className="flex items-center">
                        <TipButton
                          recipientAddress={
                            (post.profiles as any)?.wallet_address
                          }
                          recipientName={displayName}
                          postId={post.id}
                          recipientUserId={post.user_id}
                          onTipLogged={(amount) =>
                            setTipsTotal((t) => t + amount)
                          }
                        />
                        {tipsTotal > 0 && (
                          <span className="text-[11px] text-white/35 font-mono -ml-1">
                            {tipsTotal.toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: game mechanics */}
                  <TooltipProvider delayDuration={350}>
                    <div className="flex items-center gap-2 text-white/20">
                      {post.engagement_score > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none"
                            >
                              <Trophy size={13} />
                              <span className="text-[11px] font-mono">
                                {Math.round(post.engagement_score)}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="text-xs max-w-48"
                          >
                            Engagement score — weighted total of likes,
                            comments, saves, shares &amp; clicks
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {post.status === "live" && post.expires_at && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none"
                            >
                              <Clock size={13} />
                              <span className="text-[11px] font-mono">
                                {Math.max(
                                  0,
                                  Math.ceil(
                                    (new Date(post.expires_at).getTime() -
                                      Date.now()) /
                                      (1000 * 60 * 60 * 24),
                                  ),
                                )}
                                d
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="text-xs max-w-48"
                          >
                            Days remaining in this submission cycle
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {rank && rank <= 50 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-[11px] font-bold text-white/50 font-mono px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help focus:outline-none"
                            >
                              #{rank}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Billboard rank
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </div>
              )}

            <div className="h-px" />
          </>
        )}
      </div>
    </div>
  );
}
