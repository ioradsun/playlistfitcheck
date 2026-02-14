import { useState } from "react";
import { Heart, MessageCircle, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SongFitPost } from "./types";
import { formatDistanceToNow } from "date-fns";

interface Props {
  post: SongFitPost;
  onOpenComments: (postId: string) => void;
  onRefresh: () => void;
}

export function SongFitPostCard({ post, onOpenComments, onRefresh }: Props) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.user_has_liked ?? false);
  const [saved, setSaved] = useState(post.user_has_saved ?? false);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const artists = (post.track_artists_json as any[]) || [];
  const primaryArtist = artists[0];

  // Spotify embed URL for iframe player
  const embedUrl = `https://open.spotify.com/embed/track/${post.spotify_track_id}?utm_source=generator&theme=0`;

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

  const toggleSave = async () => {
    if (!user) { toast.error("Sign in to save posts"); return; }
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) {
        await supabase.from("songfit_saves").delete().eq("post_id", post.id).eq("user_id", user.id);
      } else {
        await supabase.from("songfit_saves").insert({ post_id: post.id, user_id: user.id });
      }
    } catch {
      setSaved(wasSaved);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(post.spotify_track_url);
      toast.success("Spotify link copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const displayName = post.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const tags = (post.tags_json as string[]) || [];

  return (
    <div className="border-b border-border/40">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20">
          {post.profiles?.avatar_url ? (
            <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={16} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
        </div>
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
      <div className="flex items-center justify-between px-2 pt-1 pb-1">
        <div className="flex items-center -ml-1">
          <button onClick={toggleLike} className="p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <Heart size={24} className={liked ? "fill-red-500 text-red-500" : "text-foreground"} />
          </button>
          <button onClick={() => onOpenComments(post.id)} className="p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <MessageCircle size={24} className="text-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
