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
    <div className="border-b border-border/40">
      {/* Header — IG style: avatar + name + time */}
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

      {/* Album Art — full-width, 1:1 square like IG */}
      <div className="relative w-full aspect-square bg-black/20">
        {post.album_art_url ? (
          <img
            src={post.album_art_url}
            alt={post.track_title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No artwork
          </div>
        )}

        {/* Track name + artist overlay at bottom of art */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10">
          <h3 className="font-bold text-white text-lg leading-tight drop-shadow-md truncate">
            {post.track_title}
          </h3>
          <p className="text-white/80 text-sm leading-tight truncate drop-shadow-md">
            {artists.map((a: any) => a.name).join(", ")}
          </p>
        </div>

        {/* Preview play button */}
        {post.preview_url && (
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center text-white shadow-2xl transition-all active:scale-90"
          >
            {playing ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
          </button>
        )}
      </div>

      {/* Action Row — IG layout */}
      <div className="flex items-center justify-between px-2 pt-1">
        <div className="flex items-center -ml-1">
          <button
            onClick={toggleLike}
            className="p-2.5 hover:opacity-70 active:scale-90 transition-all"
          >
            <Heart
              size={24}
              className={liked ? "fill-red-500 text-red-500" : "text-foreground"}
            />
          </button>
          <button
            onClick={() => onOpenComments(post.id)}
            className="p-2.5 hover:opacity-70 active:scale-90 transition-all"
          >
            <MessageCircle size={24} className="text-foreground" />
          </button>
          <button
            onClick={handleShare}
            className="p-2.5 hover:opacity-70 active:scale-90 transition-all"
          >
            <Share2 size={24} className="text-foreground" />
          </button>
        </div>
        <button
          onClick={toggleSave}
          className="p-2.5 hover:opacity-70 active:scale-90 transition-all"
        >
          <Bookmark
            size={24}
            className={saved ? "fill-foreground text-foreground" : "text-foreground"}
          />
        </button>
      </div>

      {/* Likes */}
      {likesCount > 0 && (
        <p className="px-3 text-sm font-semibold">
          {likesCount.toLocaleString()} {likesCount === 1 ? "like" : "likes"}
        </p>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-3 pt-0.5">
          <p className={`text-sm ${captionExpanded ? "" : "line-clamp-2"}`}>
            <span className="font-semibold mr-1">{displayName}</span>
            {post.caption}
          </p>
          {post.caption.length > 100 && !captionExpanded && (
            <button
              onClick={() => setCaptionExpanded(true)}
              className="text-xs text-muted-foreground mt-0.5"
            >
              more
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-3 pt-1 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="text-[11px] px-2 py-0 h-5">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Comments link */}
      {post.comments_count > 0 && (
        <button
          onClick={() => onOpenComments(post.id)}
          className="px-3 pt-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View all {post.comments_count} comment{post.comments_count !== 1 ? "s" : ""}
        </button>
      )}

      {/* CTAs — compact row */}
      <div className="px-3 pt-2 pb-4 flex gap-2">
        <Button
          size="sm"
          className="flex-1 gap-1.5 h-9 text-xs font-semibold"
          onClick={() => window.open(post.spotify_track_url, "_blank")}
        >
          <ExternalLink size={14} /> Open in Spotify
        </Button>
        {primaryArtist?.spotifyUrl && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-9 text-xs font-semibold"
            onClick={() => window.open(primaryArtist.spotifyUrl, "_blank")}
          >
            <User size={14} /> Visit Artist
          </Button>
        )}
      </div>
    </div>
  );
}
