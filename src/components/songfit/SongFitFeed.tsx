import { useState, useEffect, useCallback } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { SongFitPost } from "./types";
import { SongFitPostCard } from "./SongFitPostCard";
import { SongFitComments } from "./SongFitComments";
import { SongFitLikesList } from "./SongFitLikesList";
import { SongFitInlineComposer } from "./SongFitInlineComposer";

export function SongFitFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState<SongFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("songfit_posts")
      .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id)")
      .limit(50)
      .order("created_at", { ascending: false });

    const { data } = await query;
    let enriched = (data || []) as unknown as SongFitPost[];

    if (user && enriched.length > 0) {
      const postIds = enriched.map(p => p.id);
      const [likesRes, savesRes] = await Promise.all([
        supabase.from("songfit_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
        supabase.from("songfit_saves").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      ]);
      const likedSet = new Set((likesRes.data || []).map(l => l.post_id));
      const savedSet = new Set((savesRes.data || []).map(s => s.post_id));
      enriched = enriched.map(p => ({
        ...p,
        user_has_liked: likedSet.has(p.id),
        user_has_saved: savedSet.has(p.id),
      }));
    }

    setPosts(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  return (
    <div className="w-full max-w-[470px] mx-auto">
      {user ? (
        <SongFitInlineComposer onPostCreated={fetchPosts} />
      ) : (
        <div
          className="border-b border-border/40 cursor-pointer"
          onClick={() => navigate("/auth?mode=signup", { state: { returnTab: "songfit" } })}
        >
          <div className="flex gap-3 px-4 pt-3 pb-3">
            <div className="h-10 w-10 rounded-full bg-muted border border-border shrink-0 mt-1 flex items-center justify-center">
              <User size={16} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <span className="text-base text-muted-foreground/60">Sign Up to post your song</span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">No posts yet. Share what you're listening to!</p>
        </div>
      ) : (
        <div>
          {posts.map(post => (
            <SongFitPostCard
              key={post.id}
              post={post}
              onOpenComments={setCommentPostId}
              onOpenLikes={setLikesPostId}
              onRefresh={fetchPosts}
            />
          ))}
        </div>
      )}

      <SongFitComments postId={commentPostId} onClose={() => setCommentPostId(null)} />
      <SongFitLikesList postId={likesPostId} onClose={() => setLikesPostId(null)} />
    </div>
  );
}
