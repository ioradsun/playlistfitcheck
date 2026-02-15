import { useState } from "react";
import { Heart, MessageCircle, User, MoreHorizontal, UserPlus, UserMinus, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SongFitPost } from "./types";
import { formatDistanceToNow } from "date-fns";
import { ProfileHoverCard } from "./ProfileHoverCard";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  post: SongFitPost;
  onOpenComments: (postId: string) => void;
  onOpenLikes: (postId: string) => void;
  onRefresh: () => void;
}

export function SongFitPostCard({ post, onOpenComments, onOpenLikes, onRefresh }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.user_has_liked ?? false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followChecked, setFollowChecked] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const isOwnPost = user?.id === post.user_id;

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
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const displayName = post.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  return (
    <div className="border-b border-border/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <ProfileHoverCard userId={post.user_id}>
          <div className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
            onClick={() => navigate(`/u/${post.user_id}`)}
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

        {/* 3-dot menu */}
        <DropdownMenu onOpenChange={(open) => { if (open) checkFollow(); }}>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate(`/u/${post.user_id}`)}>
              <ExternalLink size={14} className="mr-2" />
              View Profile
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Spotify Embed Player */}
      <div className="w-full">
        <iframe
          src={`https://open.spotify.com/embed/track/${post.spotify_track_id}?utm_source=generator&theme=1`}
          width="100%"
          height="352"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="border-0 block"
          title={`Play ${post.track_title}`}
        />
      </div>

      {/* Action Row */}
      <div className="flex items-center px-3 pt-1 pb-1">
        <div className="flex items-center -ml-1">
          <button onClick={toggleLike} className="flex items-center gap-1 p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <Heart size={22} className={liked ? "fill-red-500 text-red-500" : "text-foreground"} />
          </button>
          {likesCount > 0 && (
            <button onClick={() => onOpenLikes(post.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors -ml-1 mr-2">
              {likesCount}
            </button>
          )}
          <button onClick={() => onOpenComments(post.id)} className="flex items-center gap-1 p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <MessageCircle size={22} className="text-foreground" />
            {post.comments_count > 0 && <span className="text-xs text-muted-foreground">{post.comments_count}</span>}
          </button>
        </div>
      </div>

      {/* Caption - Instagram style */}
      {post.caption && post.caption.trim() && (
        <div className="px-3 pb-2.5">
          {post.caption.length <= 125 || captionExpanded ? (
            <p className="text-sm leading-snug">
              <span className="font-semibold mr-1.5">{displayName}</span>
              {post.caption}
            </p>
          ) : (
            <p className="text-sm leading-snug">
              <span className="font-semibold mr-1.5">{displayName}</span>
              {post.caption.slice(0, 125).trimEnd()}
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
      )}
    </div>
  );
}
