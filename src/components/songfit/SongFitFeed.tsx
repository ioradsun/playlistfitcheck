import { useState, useEffect, useCallback } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { SongFitPost, FeedView, BillboardMode } from "./types";
import { SongFitPostCard } from "./SongFitPostCard";
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
  const [billboardMode, setBillboardMode] = useState<BillboardMode>("trending");

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    if (feedView === "recent") {
      // Recent: live submissions, chronological
      const { data } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address)")
        .eq("status", "live")
        .limit(50)
        .order("created_at", { ascending: false });

      let enriched = (data || []) as unknown as SongFitPost[];
      enriched = await enrichWithUserData(enriched);
      setPosts(enriched);
    } else {
      // Billboard mode
      const { data } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address)")
        .eq("status", "live")
        .limit(50)
        .order("engagement_score", { ascending: false });

      let enriched = (data || []) as unknown as SongFitPost[];
      enriched = await enrichWithUserData(enriched);
      enriched = applyBillboardRanking(enriched, billboardMode);
      setPosts(enriched);
    }

    setLoading(false);
  }, [user, feedView, billboardMode]);

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

  const applyBillboardRanking = (posts: SongFitPost[], mode: BillboardMode): SongFitPost[] => {
    let ranked = [...posts];

    switch (mode) {
      case "trending": {
        // Velocity: sort by engagement_score with recency boost
        ranked.sort((a, b) => {
          const ageA = (Date.now() - new Date(a.submitted_at).getTime()) / (1000 * 60 * 60);
          const ageB = (Date.now() - new Date(b.submitted_at).getTime()) / (1000 * 60 * 60);
          const velocityA = a.engagement_score / Math.max(ageA / 24, 0.1);
          const velocityB = b.engagement_score / Math.max(ageB / 24, 0.1);
          return velocityB - velocityA;
        });
        break;
      }
      case "top": {
        // Top with time decay
        ranked.sort((a, b) => {
          const scoreA = a.engagement_score * getDecayMultiplier(a.submitted_at);
          const scoreB = b.engagement_score * getDecayMultiplier(b.submitted_at);
          return scoreB - scoreA;
        });
        break;
      }
      case "best_fit": {
        // Engagement rate = score / impressions (min 50 impressions)
        ranked = ranked.filter(p => p.impressions >= 50);
        ranked.sort((a, b) => {
          const rateA = a.engagement_score / Math.max(a.impressions, 1);
          const rateB = b.engagement_score / Math.max(b.impressions, 1);
          return rateB - rateA;
        });
        break;
      }
      case "all_time": {
        // Just by raw engagement_score
        ranked.sort((a, b) => b.engagement_score - a.engagement_score);
        break;
      }
    }

    return ranked.map((p, i) => ({ ...p, current_rank: i + 1 }));
  };

  const getDecayMultiplier = (submittedAt: string): number => {
    const days = (Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 3) return 1.0;
    if (days <= 10) return 0.8;
    if (days <= 21) return 0.6;
    return 0.4;
  };

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
        billboardMode={billboardMode}
        onModeChange={setBillboardMode}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            {feedView === "billboard" && billboardMode === "best_fit"
              ? "No submissions with enough impressions yet."
              : "No live submissions yet. Be the first!"}
          </p>
        </div>
      ) : (
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
