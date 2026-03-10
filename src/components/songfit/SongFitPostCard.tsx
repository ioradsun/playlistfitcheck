import { useState } from "react";
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
import { formatDistanceToNow } from "date-fns";
import { ProfileHoverCard } from "./ProfileHoverCard";
import { FmlyBadge } from "@/components/FmlyBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useNavigate } from "react-router-dom";
import { logEngagementEvent } from "@/lib/engagementTracking";
import { useCardState, type CardState } from "./useCardLifecycle";
import { PostCommentPanel } from "./PostCommentPanel";
import { useCardVote } from "@/hooks/useCardVote";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
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
}: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const cryptoEnabled = siteCopy.features?.crypto_tipping ?? false;
  const crowdfitMode = siteCopy.features?.crowdfit_mode ?? "reactions";
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
  
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const { votedSide, score, note, setNote, handleVote, handleSubmit } = useCardVote(post.id);

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
        await supabase
          .from("songfit_follows")
          .insert({
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
  const timeAgo = formatDistanceToNow(new Date(post.created_at), {
    addSuffix: true,
  });

  return (
    <div className="px-2 pb-3">
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ background: "#121212" }}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ProfileHoverCard userId={post.user_id}>
              <div
                className="flex items-center gap-2.5 cursor-pointer min-w-0"
                onClick={handleProfileClick}
              >
                <div className="relative shrink-0">
                  <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                    {post.profiles?.avatar_url ? (
                      <img
                        src={post.profiles.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={13} className="text-white/40" />
                    )}
                  </div>
                  {(post.profiles as any)?.is_verified && (
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <VerifiedBadge size={12} />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-medium leading-tight truncate text-white/70">
                      {displayName}
                    </p>
                    <FmlyBadge userId={post.user_id} compact />
                  </div>
                  <p className="font-mono text-[10px] text-white/30 leading-tight">
                    {timeAgo}
                  </p>
                </div>
              </div>
            </ProfileHoverCard>
          </div>

          {/* 3-dot menu */}
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) checkFollow();
            }}
          >
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-white/5 text-white/20 hover:text-white/50 transition-colors shrink-0">
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
          )}
        >
          {post.lyric_dance_url &&
          post.lyric_dance_id &&
          !post.spotify_track_id ? (
            <div className="relative overflow-hidden" style={{ height: 320 }}>
              <LyricDanceEmbed
                lyricDanceId={post.lyric_dance_id}
                lyricDanceUrl={post.lyric_dance_url}
                songTitle={post.track_title}
                artistName={displayName}
                cardState={cardState}
                onPlay={activate}
                hideReactButton
                externalPanelOpen={reactionPanelOpen}
                onExternalPanelOpenChange={setReactionPanelOpen}
                onOpenReactions={() => setReactionPanelOpen(true)}
              />
            </div>
          ) : post.lyric_dance_url &&
            !post.lyric_dance_id &&
            !post.spotify_track_id ? (
            <div className="relative overflow-hidden" style={{ height: 320 }}>
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
              <div className="relative">
              <LazySpotifyEmbed
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
              <PostCommentPanel
                postId={post.id}
                isOpen={postPanelOpen}
                onClose={() => setPostPanelOpen(false)}
                hideOwnInput
              />
              </div>

              {/* Caption — directly below embed */}
              {!editing && localCaption && localCaption.trim() && (
                <div className="px-3 pt-1 pb-0.5">
                  {localCaption.length <= 100 || captionExpanded ? (
                    <p className="text-[13px] leading-snug text-white/70">
                      {localCaption}
                    </p>
                  ) : (
                    <p className="text-[13px] leading-snug text-white/70">
                      {localCaption.slice(0, 100).trimEnd()}
                      <span className="text-white/30">… </span>
                      <button
                        onClick={() => setCaptionExpanded(true)}
                        className="text-white/30 hover:text-white/50 text-[13px]"
                      >
                        more
                      </button>
                    </p>
                  )}
                </div>
              )}

              {isSpotifyEmbed && crowdfitMode === "hook_review" && (
                <CardBottomBar
                  variant="fullscreen"
                  votedSide={votedSide}
                  score={score}
                  note={note}
                  onNoteChange={setNote}
                  onVoteYes={() => handleVote(true)}
                  onVoteNo={() => handleVote(false)}
                  onSubmit={handleSubmit}
                  onOpenReactions={() => setPostPanelOpen(true)}
                  onClose={() => setPostPanelOpen(false)}
                />
              )}

              {/* Action row — stacked below caption inside 320px */}
              {crowdfitMode !== "hook_review" && (
                <div className="flex items-center justify-between px-1 py-0.5">
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        onOpenComments(post.id);
                        if (user)
                          logEngagementEvent(post.id, user.id, "comment");
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-white/5 transition-colors group"
                    >
                      <MessageCircle
                        size={16}
                        className="text-white/35 group-hover:text-white/80 transition-colors"
                      />
                      {post.comments_count > 0 && (
                        <span className="text-[11px] text-white/35 font-mono group-hover:text-white/80">
                          {post.comments_count}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-white/5 transition-colors group"
                    >
                      <Share2
                        size={16}
                        className="text-white/35 group-hover:text-white/80 transition-colors"
                      />
                    </button>
                    <button
                      onClick={toggleLike}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-white/5 transition-colors group"
                    >
                      <Flame
                        size={16}
                        className={
                          liked
                            ? "fill-green-400 text-green-400"
                            : "text-white/35 group-hover:text-white/80 transition-colors"
                        }
                      />
                      {likesCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLikes(post.id);
                          }}
                          className="text-[11px] text-white/35 font-mono group-hover:text-white/80"
                        >
                          {likesCount}
                        </button>
                      )}
                    </button>
                    <button
                      onClick={toggleSave}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full hover:bg-white/5 transition-colors group"
                    >
                      <Bookmark
                        size={16}
                        className={
                          saved
                            ? "fill-green-400 text-green-400"
                            : "text-white/35 group-hover:text-white/80 transition-colors"
                        }
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-white/30">
                    {post.status === "live" && post.expires_at && (
                      <span className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono">
                        <Clock size={12} />
                        {Math.max(
                          0,
                          Math.ceil(
                            (new Date(post.expires_at).getTime() - Date.now()) /
                              (1000 * 60 * 60 * 24),
                          ),
                        )}
                        d
                      </span>
                    )}
                    {rank && rank <= 50 && (
                      <span className="text-[11px] font-bold text-green-400 font-mono px-2 py-1">
                        #{rank}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>

          )}
        </div>

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
                    className={`text-[10px] ${editCaption.length >= CAPTION_MAX ? "text-red-400" : "text-white/20"}`}
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
                      className="p-1.5 rounded-full hover:bg-white/5 text-green-400"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : localCaption && localCaption.trim() ? (
              <div className="relative px-3 pt-2 pb-1">
                {localCaption.length <= 125 || captionExpanded ? (
                  <p className="text-sm leading-snug text-white/70">
                    {localCaption}
                  </p>
                ) : (
                  <p className="text-sm leading-snug text-white/70">
                    {localCaption.slice(0, 125).trimEnd()}
                    <span className="text-white/30">… </span>
                    <button
                      onClick={() => setCaptionExpanded(true)}
                      className="text-white/30 hover:text-white/50 text-sm"
                    >
                      more
                    </button>
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* Action Row — reactions mode only here */}
        {crowdfitMode !== "hook_review" &&
          !hasLyricDancePost &&
          !isBattlePost &&
          !isSpotifyEmbed && (
            <div className="relative flex items-center justify-between px-1 py-1">
              {/* Left group: comment, share, like, bookmark */}
              <div className="flex items-center">
                <button
                  onClick={() => {
                    onOpenComments(post.id);
                    if (user) logEngagementEvent(post.id, user.id, "comment");
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group"
                >
                  <MessageCircle
                    size={17}
                    className="text-white/35 group-hover:text-white/80 transition-colors"
                  />
                  {post.comments_count > 0 && (
                    <span className="text-[11px] text-white/35 font-mono group-hover:text-white/80">
                      {post.comments_count}
                    </span>
                  )}
                </button>

                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group"
                >
                  <Share2
                    size={17}
                    className="text-white/35 group-hover:text-white/80 transition-colors"
                  />
                </button>

                <button
                  onClick={toggleLike}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group"
                >
                  <Flame
                    size={17}
                    className={
                      liked
                        ? "fill-green-400 text-green-400"
                        : "text-white/35 group-hover:text-white/80 transition-colors"
                    }
                  />
                  {likesCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLikes(post.id);
                      }}
                      className="text-[11px] text-white/35 font-mono group-hover:text-white/80"
                    >
                      {likesCount}
                    </button>
                  )}
                </button>

                <button
                  onClick={toggleSave}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-white/5 transition-colors group"
                >
                  <Bookmark
                    size={17}
                    className={
                      saved
                        ? "fill-green-400 text-green-400"
                        : "text-white/35 group-hover:text-white/80 transition-colors"
                    }
                  />
                  {(post as any).saves_count > 0 && (
                    <span className="text-[11px] text-white/35 font-mono group-hover:text-white/80">
                      {(post as any).saves_count}
                    </span>
                  )}
                </button>

                {cryptoEnabled && (
                  <div className="flex items-center">
                    <TipButton
                      recipientAddress={(post.profiles as any)?.wallet_address}
                      recipientName={displayName}
                      postId={post.id}
                      recipientUserId={post.user_id}
                      onTipLogged={(amount) => setTipsTotal((t) => t + amount)}
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
                <div className="flex items-center gap-2 text-white/30">
                  {post.engagement_score > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help"
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
                        Engagement score — weighted total of likes, comments,
                        saves, shares &amp; clicks
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {post.status === "live" && post.expires_at && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help"
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
                          className="text-[11px] font-bold text-green-400 font-mono px-2 py-1.5 rounded-full hover:bg-white/5 transition-colors cursor-help"
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

        <div className="h-1" />
      </div>
    </div>
  );
}
