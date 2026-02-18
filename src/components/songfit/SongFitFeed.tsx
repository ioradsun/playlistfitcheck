import { useState, useEffect, useCallback } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { SongFitPost, FeedView } from "./types";
import { SongFitPostCard } from "./SongFitPostCard";
import { EagerEmbedProvider } from "./LazySpotifyEmbed";
import { SongFitComments } from "./SongFitComments";
import { SongFitLikesList } from "./SongFitLikesList";
import { SongFitInlineComposer } from "./SongFitInlineComposer";
import { BillboardToggle } from "./BillboardToggle";

export function SongFitFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState<SongFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("recent");

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    if (feedView === "recent") {
      // Recent: live submissions, chronological
      const { data } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
        .eq("status", "live")
        .limit(50)
        .order("created_at", { ascending: false });

      let enriched = (data || []) as unknown as SongFitPost[];
      enriched = await enrichWithUserData(enriched);
      setPosts(enriched);
    } else {
      // FMLY 40: ranked by raw engagement score
      const { data } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
        .eq("status", "live")
        .limit(50)
        .order("engagement_score", { ascending: false });

      let enriched = (data || []) as unknown as SongFitPost[];
      enriched = await enrichWithUserData(enriched);
      enriched = enriched.map((p, i) => ({ ...p, current_rank: i + 1 }));
      setPosts(enriched);
    }

    setLoading(false);
  }, [user, feedView]);

  const enrichWithUserData = async (posts: SongFitPost[]) => {
    if (posts.length === 0) return posts;
    const postIds = posts.map(p => p.id);

    // Fetch saves counts for all posts
    const savesCountRes = await supabase
      .from("songfit_saves")
      .select("post_id")
      .in("post_id", postIds);
    const savesCountMap = new Map<string, number>();
    (savesCountRes.data || []).forEach(s => {
      savesCountMap.set(s.post_id, (savesCountMap.get(s.post_id) || 0) + 1);
    });

    let enriched = posts.map(p => ({
      ...p,
      saves_count: savesCountMap.get(p.id) || 0,
    }));

    if (!user) return enriched;

    const [likesRes, savesRes] = await Promise.all([
      supabase.from("songfit_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      supabase.from("songfit_saves").select("post_id").eq("user_id", user.id).in("post_id", postIds),
    ]);
    const likedSet = new Set((likesRes.data || []).map(l => l.post_id));
    const savedSet = new Set((savesRes.data || []).map(s => s.post_id));
    return enriched.map(p => ({
      ...p,
      user_has_liked: likedSet.has(p.id),
      user_has_saved: savedSet.has(p.id),
    }));
  };

  // Commented out - previously used for multi-mode billboard ranking
  // const applyBillboardRanking = ...


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
              <span className="text-base text-muted-foreground/60">Share your song and get feedback</span>
            </div>
          </div>
        </div>
      )}

      <BillboardToggle
        view={feedView}
        onViewChange={setFeedView}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            No live submissions yet. Be the first!
          </p>
        </div>
      ) : (
        <EagerEmbedProvider>
          <div>
            {posts.map((post, idx) => (
              <SongFitPostCard
                key={post.id}
                post={post}
                rank={feedView === "billboard" ? idx + 1 : undefined}
                onOpenComments={setCommentPostId}
                onOpenLikes={setLikesPostId}
                onRefresh={fetchPosts}
              />
            ))}
          </div>
        </EagerEmbedProvider>
      )}

      <SongFitComments
        postId={commentPostId}
        onClose={() => setCommentPostId(null)}
        onCommentAdded={async (pid) => {
          const { data } = await supabase.from("songfit_posts").select("comments_count").eq("id", pid).maybeSingle();
          if (data) setPosts(prev => prev.map(p => p.id === pid ? { ...p, comments_count: data.comments_count } : p));
        }}
      />
      <SongFitLikesList postId={likesPostId} onClose={() => setLikesPostId(null)} />
    </div>
  );
}
