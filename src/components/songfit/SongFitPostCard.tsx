import { useState, useRef } from "react";
import { Heart, MessageCircle, Bookmark, Share2, ExternalLink, User, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [playing, setPlaying] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const artists = (post.track_artists_json as any[]) || [];
  const primaryArtist = artists[0];

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
    const url = post.spotify_track_url;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Spotify link copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const togglePlay = () => {
    if (!post.preview_url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(post.preview_url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const displayName = post.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const tags = (post.tags_json as string[]) || [];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {post.profiles?.avatar_url ? (
            <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={14} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground">{timeAgo}</p>
        </div>
      </div>

      {/* Album Art */}
      <div className="relative aspect-square bg-muted">
        {post.album_art_url ? (
          <img src={post.album_art_url} alt={post.track_title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No artwork</div>
        )}
        {/* Preview play button overlay */}
        {post.preview_url && (
          <button
            onClick={togglePlay}
            className="absolute bottom-3 right-3 w-12 h-12 rounded-full bg-primary/90 hover:bg-primary flex items-center justify-center text-primary-foreground shadow-lg transition-colors"
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
        )}
      </div>

      {/* Track Info */}
      <div className="px-4 pt-3 space-y-1">
        <h3 className="font-bold text-base truncate">{post.track_title}</h3>
        <p className="text-sm text-muted-foreground truncate">
          {artists.map((a: any) => a.name).join(", ")}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleLike}>
            <Heart size={20} className={liked ? "fill-red-500 text-red-500" : ""} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onOpenComments(post.id)}>
            <MessageCircle size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleShare}>
            <Share2 size={20} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleSave}>
            <Bookmark size={20} className={saved ? "fill-primary text-primary" : ""} />
          </Button>
        </div>
      </div>

      {/* Likes count */}
      {likesCount > 0 && (
        <p className="px-4 text-sm font-semibold">{likesCount} {likesCount === 1 ? "like" : "likes"}</p>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pb-1">
          <p className={`text-sm ${captionExpanded ? "" : "line-clamp-2"}`}>
            <span className="font-semibold mr-1">{displayName}</span>
            {post.caption}
          </p>
          {post.caption.length > 100 && !captionExpanded && (
            <button onClick={() => setCaptionExpanded(true)} className="text-xs text-muted-foreground">more</button>
          )}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-4 flex flex-wrap gap-1 pb-2">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
          ))}
        </div>
      )}

      {/* Comments link */}
      {post.comments_count > 0 && (
        <button onClick={() => onOpenComments(post.id)} className="px-4 pb-2 text-sm text-muted-foreground hover:text-foreground">
          View {post.comments_count} comment{post.comments_count !== 1 ? "s" : ""}
        </button>
      )}

      {/* CTAs */}
      <div className="px-4 pb-4 flex gap-2">
        <Button size="sm" className="flex-1 gap-1.5" onClick={() => window.open(post.spotify_track_url, "_blank")}>
          <ExternalLink size={14} /> Open in Spotify
        </Button>
        {primaryArtist?.spotifyUrl && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(primaryArtist.spotifyUrl, "_blank")}>
            <User size={14} /> Visit Artist
          </Button>
        )}
      </div>
    </div>
  );
}
