import { useState, useEffect, useCallback } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { SongFitPost, FeedView, BillboardMode } from "./types";
import { SongFitPostCard } from "./SongFitPostCard";
import { EagerEmbedProvider } from "./LazySpotifyEmbed";
import { SongFitComments } from "./SongFitComments";
import { SongFitLikesList } from "./SongFitLikesList";
import { SongFitInlineComposer } from "./SongFitInlineComposer";
import { BillboardToggle } from "./BillboardToggle";
import { StagePresence } from "./StagePresence";

export function SongFitFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState<SongFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("recent");

  const [billboardMode, setBillboardMode] = useState<BillboardMode>("this_week");
  const [userVoteCount, setUserVoteCount] = useState<number | null>(null);
  const [composerUnlocked, setComposerUnlocked] = useState(false);
  const [showFloatingAnchor, setShowFloatingAnchor] = useState(false);
  const [hasPosted, setHasPosted] = useState(false);
  const [hasEverPosted, setHasEverPosted] = useState<boolean | null>(null);
  const [signalMap, setSignalMap] = useState<Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }>>({});

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    if (feedView === "recent" || feedView === "pending" || feedView === "resolved") {
      setSignalMap({});
      const { data: allPosts } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
        .eq("status", "live")
        .limit(100)
        .order("created_at", { ascending: false });

      let enriched = (allPosts || []) as unknown as SongFitPost[];

      if (feedView === "pending" || feedView === "resolved") {
        // Fetch signal counts for all posts
        const postIds = enriched.map(p => p.id);
        const { data: reviews } = postIds.length > 0
          ? await supabase.from("songfit_hook_reviews").select("post_id").in("post_id", postIds)
          : { data: [] };
        const signaled = new Set((reviews || []).map(r => r.post_id));
        if (feedView === "pending") {
          enriched = enriched.filter(p => !signaled.has(p.id));
        } else {
          enriched = enriched.filter(p => signaled.has(p.id));
        }
      }

      enriched = await enrichWithUserData(enriched);
      setPosts(enriched);
    } else {
      // Billboard: Signal Velocity scoring
      // Time-window cutoffs applied to SIGNAL created_at, not post submitted_at
      let cutoff: string | null = null;
      let ceiling: string | null = null;
      if (billboardMode === "this_week") {
        cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (billboardMode === "last_week") {
        cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        ceiling = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      // Broad pool of posts — ranked by signal velocity, not engagement_score
      const { data: poolData } = await supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
        .eq("status", "live")
        .limit(100)
        .order("created_at", { ascending: false });

      const pool = (poolData || []) as unknown as SongFitPost[];
      if (pool.length === 0) {
        setPosts([]);
        setSignalMap({});
        setLoading(false);
        return;
      }

      const postIds = pool.map(p => p.id);
      const ownerIds = [...new Set(pool.map(p => p.user_id))];

      // Build time-window filter helper
      const applyWindow = (q: any) => {
        if (cutoff) q = q.gte("created_at", cutoff);
        if (ceiling) q = q.lte("created_at", ceiling);
        return q;
      };

      // 4 parallel signal queries, all time-windowed
      const [reviewsRes, commentsRes, followsRes, savesRes] = await Promise.all([
        applyWindow(supabase.from("songfit_hook_reviews").select("post_id, would_replay").in("post_id", postIds)),
        applyWindow(supabase.from("songfit_comments").select("post_id").in("post_id", postIds)),
        applyWindow(supabase.from("songfit_follows").select("followed_user_id").in("followed_user_id", ownerIds)),
        applyWindow(supabase.from("songfit_saves").select("post_id").in("post_id", postIds)),
      ]);

      // Aggregate per post
      const hookMap: Record<string, { run_it_back: number; skip: number; total: number; replay_yes: number }> = {};
      for (const r of (reviewsRes.data || [])) {
        if (!hookMap[r.post_id]) hookMap[r.post_id] = { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
        hookMap[r.post_id].total++;
        if (r.would_replay) { hookMap[r.post_id].run_it_back++; hookMap[r.post_id].replay_yes++; }
        else hookMap[r.post_id].skip++;
      }

      const commentMap: Record<string, number> = {};
      for (const c of (commentsRes.data || [])) {
        commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1;
      }

      // follows are per-artist; map followed_user_id → count, then assign per post by post.user_id
      const followByOwner: Record<string, number> = {};
      for (const f of (followsRes.data || [])) {
        followByOwner[f.followed_user_id] = (followByOwner[f.followed_user_id] || 0) + 1;
      }

      const savesMap: Record<string, number> = {};
      for (const s of (savesRes.data || [])) {
        savesMap[s.post_id] = (savesMap[s.post_id] || 0) + 1;
      }

      // Compute Signal Velocity per post
      // Formula: (1×RunItBack) + (3×Comments) + (8×Follows) + (12×Saves) − (2×Skips)
      const scored = pool.map(p => {
        const h = hookMap[p.id] || { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
        const comments = commentMap[p.id] || 0;
        const follows = followByOwner[p.user_id] || 0;
        const saves = savesMap[p.id] || 0;
        const velocity = (1 * h.run_it_back) + (3 * comments) + (8 * follows) + (12 * saves) - (2 * h.skip);
        return { post: p, velocity, h, saves };
      });

      // Sort descending, take top 40, assign ranks
      scored.sort((a, b) => b.velocity - a.velocity);
      const top40 = scored.slice(0, 40);

      let enriched = await enrichWithUserData(top40.map(s => s.post));
      enriched = enriched.map((p, i) => ({ ...p, current_rank: i + 1 }));
      setPosts(enriched);

      // Build signalMap with extended data for display
      const newSignalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }> = {};
      for (const s of top40) {
        newSignalMap[s.post.id] = {
          total: s.h.total,
          replay_yes: s.h.replay_yes,
          saves_count: s.saves,
          signal_velocity: s.velocity,
        };
      }
      setSignalMap(newSignalMap);
    }

    setLoading(false);
  }, [user, feedView, billboardMode]);

  const enrichWithUserData = async (posts: SongFitPost[]) => {
    if (posts.length === 0) return posts;
    const postIds = posts.map(p => p.id);

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

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Check if user has ever posted — first-timers skip the gate
  useEffect(() => {
    if (!user) return;
    supabase
      .from("songfit_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        const everPosted = (count ?? 0) > 0;
        setHasEverPosted(everPosted);
        if (!everPosted) setComposerUnlocked(true); // first-timer: skip gate
      });
  }, [user]);

  // Fetch user vote count on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("songfit_hook_reviews")
      .select("id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const count = (data || []).length;
        setUserVoteCount(count);
        if (count >= 3) setComposerUnlocked(true);
      });
  }, [user]);

  // Listen for vote events from HookReview
  useEffect(() => {
    const handler = () => {
      setUserVoteCount(prev => {
        const next = (prev ?? 0) + 1;
        if (next >= 3) setComposerUnlocked(true);
        return next;
      });
    };
    window.addEventListener("crowdfit:vote", handler);
    return () => window.removeEventListener("crowdfit:vote", handler);
  }, []);

  // Re-lock on post-created event (circular economy) — gate activates after first post
  useEffect(() => {
    const handler = () => {
      setHasEverPosted(true); // now they've posted, future drops need 3 signals
      setComposerUnlocked(false);
      setUserVoteCount(0);
      setHasPosted(true);
    };
    window.addEventListener("crowdfit:post-created", handler);
    return () => window.removeEventListener("crowdfit:post-created", handler);
  }, []);

  // Floating anchor: show when composer is unlocked and user scrolled > 300px
  // The actual scroll container for CrowdFit is #songfit-scroll-container in Index.tsx
  useEffect(() => {
    if (!composerUnlocked) {
      setShowFloatingAnchor(false);
      return;
    }

    const handleScroll = () => {
      const scrollEl = document.getElementById("songfit-scroll-container");
      if (scrollEl) setShowFloatingAnchor(scrollEl.scrollTop > 300);
    };

    // Capture phase catches scroll events from all elements (scroll doesn't bubble)
    document.addEventListener("scroll", handleScroll, true);

    // Check immediately in case already scrolled past threshold
    handleScroll();

    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [composerUnlocked]);

  return (
    <div className="w-full max-w-[470px] mx-auto">
      {user ? (
        composerUnlocked ? (
          <div className="animate-fade-in">
            <SongFitInlineComposer onPostCreated={fetchPosts} />
          </div>
        ) : hasEverPosted === null ? null : (
          <StagePresence
            currentVotes={userVoteCount ?? 0}
            onUnlocked={() => setComposerUnlocked(true)}
            hasPosted={hasPosted}
          />
        )
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
              <span className="text-base text-muted-foreground/60">Drop your song and get signals</span>
            </div>
          </div>
        </div>
      )}

      <BillboardToggle
        view={feedView}
        onViewChange={setFeedView}
        billboardMode={billboardMode}
        onModeChange={setBillboardMode}
        isLoggedIn={!!user}
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
          <div className="pb-24">
            {posts.map((post, idx) => (
              <SongFitPostCard
                key={post.id}
                post={post}
                rank={feedView === "billboard" ? idx + 1 : undefined}
                onOpenComments={setCommentPostId}
                onOpenLikes={setLikesPostId}
                onRefresh={fetchPosts}
                isBillboard={feedView === "billboard"}
                signalData={feedView === "billboard" ? signalMap[post.id] : undefined}
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

      {showFloatingAnchor && (
        <button
          onClick={() => {
            const scrollEl = document.getElementById("songfit-scroll-container");
            if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 border border-border/50 bg-background text-foreground/70 hover:text-foreground hover:border-border text-[11px] font-mono tracking-wide px-5 py-2 rounded-full shadow-sm transition-all duration-200"
        >
          + Drop Your Song
        </button>
      )}
    </div>
  );
}
