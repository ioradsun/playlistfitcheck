import { useState, useEffect, useRef } from "react";
import { Heart, MessageCircle, User, MoreHorizontal, UserPlus, UserMinus, ExternalLink, Pencil, Trash2, X, Check, Trophy, Bookmark, Share2, Clock } from "lucide-react";
import { TipButton } from "@/components/crypto/TipButton";
import { LazySpotifyEmbed } from "./LazySpotifyEmbed";
import { SubmissionBadge } from "./SubmissionBadge";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { SongFitPost } from "./types";
import { formatDistanceToNow } from "date-fns";
import { ProfileHoverCard } from "./ProfileHoverCard";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { useNavigate } from "react-router-dom";
import { logEngagementEvent, logImpression } from "@/lib/engagementTracking";
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
}

export function SongFitPostCard({ post, rank, onOpenComments, onOpenLikes, onRefresh }: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const cryptoEnabled = siteCopy.features?.crypto_tipping ?? false;
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
  const impressionRef = useRef<HTMLDivElement>(null);
  const impressionLogged = useRef(false);

  const isOwnPost = user?.id === post.user_id;
  const CAPTION_MAX = 300;

  // Impression tracking via IntersectionObserver
  useEffect(() => {
    const el = impressionRef.current;
    if (!el || impressionLogged.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionLogged.current) {
          impressionLogged.current = true;
          logImpression(post.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id]);

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
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase.from("songfit_posts").delete().eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const toggleLike = async () => {
    if (!user) { toast.error("Sign in to like posts"); return; }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount(c => wasLiked ? c - 1 : c + 1);
    try {
      if (wasLiked) {
        await supabase.from("songfit_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      } else {
        await supabase.from("songfit_likes").insert({ post_id: post.id, user_id: user.id });
        logEngagementEvent(post.id, user.id, "like");
      }
    } catch {
      setLiked(wasLiked);
      setLikesCount(c => wasLiked ? c + 1 : c - 1);
    }
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
        setIsFollowing(false);
        toast.success("Unfollowed");
      } else {
        await supabase.from("songfit_follows").insert({ follower_user_id: user.id, followed_user_id: post.user_id });
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
    if (!user) { toast.error("Sign in to save posts"); return; }
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) {
        await supabase.from("songfit_saves").delete().eq("post_id", post.id).eq("user_id", user.id);
      } else {
        await supabase.from("songfit_saves").insert({ post_id: post.id, user_id: user.id });
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
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  return (
    <div ref={impressionRef} className="border-b border-border/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">

          <ProfileHoverCard userId={post.user_id}>
            <div className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={handleProfileClick}
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20 shrink-0">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={16} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
              </div>
            </div>
          </ProfileHoverCard>
          <TrailblazerBadge userId={post.user_id} compact />
          
        </div>

        {/* 3-dot menu */}
        <DropdownMenu onOpenChange={(open) => { if (open) checkFollow(); }}>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <MoreHorizontal size={18} />
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
                  <><UserMinus size={14} className="mr-2" /> Unfollow</>
                ) : (
                  <><UserPlus size={14} className="mr-2" /> Follow</>
                )}
              </DropdownMenuItem>
            )}
            {isOwnPost && (
              <>
                <DropdownMenuItem onClick={() => { setEditCaption(localCaption); setEditing(true); }}>
                  <Pencil size={14} className="mr-2" />
                  Edit Caption
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeletePost}>
                  <Trash2 size={14} className="mr-2" />
                  Delete Post
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Music Embed Player */}
      <LazySpotifyEmbed
        trackId={post.spotify_track_id}
        trackTitle={post.track_title}
        trackUrl={post.spotify_track_url}
        postId={post.id}
        albumArtUrl={post.album_art_url}
        artistName={(post.track_artists_json as any[])?.map((a: any) => a.name).join(", ")}
        genre={((post.tags_json as any[]) || [])[0] || null}
      />

      {/* Action Row — X-style metrics toolbar */}
      <div className="flex items-center justify-between px-1 py-0.5">
        {/* Left group: comment, share, like, bookmark */}
        <div className="flex items-center">
          <button
            onClick={() => {
              onOpenComments(post.id);
              if (user) logEngagementEvent(post.id, user.id, "comment");
            }}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-primary/10 transition-colors group"
          >
            <MessageCircle size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
            {post.comments_count > 0 && (
              <span className="text-xs text-muted-foreground group-hover:text-primary">{post.comments_count}</span>
            )}
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-primary/10 transition-colors group"
          >
            <Share2 size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          <button
            onClick={toggleLike}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-red-500/10 transition-colors group"
          >
            <Heart size={18} className={liked ? "fill-red-500 text-red-500" : "text-muted-foreground group-hover:text-red-500 transition-colors"} />
            {likesCount > 0 && (
              <button onClick={(e) => { e.stopPropagation(); onOpenLikes(post.id); }} className="text-xs text-muted-foreground group-hover:text-red-500">
                {likesCount}
              </button>
            )}
          </button>

          <button onClick={toggleSave} className="flex items-center gap-1.5 px-2.5 py-2 rounded-full hover:bg-primary/10 transition-colors group">
            <Bookmark size={18} className={saved ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-primary transition-colors"} />
            {(post as any).saves_count > 0 && (
              <span className="text-xs text-muted-foreground group-hover:text-primary">{(post as any).saves_count}</span>
            )}
          </button>

          {cryptoEnabled && (
            <div className="flex items-center">
              <TipButton
                recipientAddress={(post.profiles as any)?.wallet_address}
                recipientName={displayName}
                postId={post.id}
                recipientUserId={post.user_id}
                onTipLogged={(amount) => setTipsTotal(t => t + amount)}
              />
              {tipsTotal > 0 && (
                <span className="text-xs text-muted-foreground font-mono -ml-1">
                  {tipsTotal.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: game mechanics */}
        <TooltipProvider delayDuration={350}>
          <div className="flex items-center gap-2 text-muted-foreground">
            {post.engagement_score > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-muted/60 transition-colors cursor-help">
                    <Trophy size={14} />
                    <span className="text-xs font-mono">{Math.round(post.engagement_score)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-48">
                  Engagement score — weighted total of likes, comments, saves, shares &amp; clicks
                </TooltipContent>
              </Tooltip>
            )}
            {post.status === "live" && post.expires_at && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-muted/60 transition-colors cursor-help">
                    <Clock size={14} />
                    <span className="text-xs font-mono">
                      {Math.max(0, Math.ceil((new Date(post.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-48">
                  Days remaining in this submission cycle
                </TooltipContent>
              </Tooltip>
            )}
            {rank && rank <= 50 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-xs font-bold text-primary font-mono px-2 py-1.5 rounded-full hover:bg-primary/10 transition-colors cursor-help">#{rank}</button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Billboard rank</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Caption - Instagram style */}
      {editing ? (
        <div className="px-3 pb-2.5 space-y-2">
          <textarea
            value={editCaption}
            onChange={e => setEditCaption(e.target.value.slice(0, CAPTION_MAX))}
            rows={3}
            className="w-full bg-muted/60 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none resize-none rounded-lg p-2 border border-border/50"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className={`text-[10px] ${editCaption.length >= CAPTION_MAX ? "text-destructive" : "text-muted-foreground/50"}`}>
              {editCaption.length}/{CAPTION_MAX}
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground">
                <X size={14} />
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="p-1.5 rounded-full hover:bg-accent/50 text-primary">
                <Check size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : localCaption && localCaption.trim() ? (
        <div className="px-3 pb-2.5">
          {localCaption.length <= 125 || captionExpanded ? (
            <p className="text-sm leading-snug">
              <span className="font-semibold mr-1.5">{displayName}</span>
              {localCaption}
            </p>
          ) : (
            <p className="text-sm leading-snug">
              <span className="font-semibold mr-1.5">{displayName}</span>
              {localCaption.slice(0, 125).trimEnd()}
              <span className="text-muted-foreground">… </span>
              <button
                onClick={() => setCaptionExpanded(true)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                more
              </button>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
