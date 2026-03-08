import { useState, useEffect, useCallback, useRef, useContext } from "react";
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
import { StagePresence } from "./StagePresence";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { CardLifecycleProvider, CardLifecycleContext, useCardState } from "./useCardLifecycle";
import { useFeedWindow } from "./useFeedWindow";
import { logImpression } from "@/lib/engagementTracking";
import { RealtimeFeedHubProvider } from "./RealtimeFeedHub";
import { consumeFeedPrefetch } from "@/lib/prefetch";

const FEED_PAGE_SIZE = 20;
const FEED_CARD_MIN_HEIGHT = 530;
const FEED_MAX_POSTS = 200;

const sharedResizeObserver = (() => {
  let observer: ResizeObserver | null = null;
  const handlers = new WeakMap<Element, (height: number) => void>();
  const getObserver = () => {
    if (!observer) {
      observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => handlers.get(entry.target)?.(entry.contentRect.height));
      });
    }
    return observer;
  };
  return {
    observe: (el: Element, cb: (height: number) => void) => {
      handlers.set(el, cb);
      getObserver().observe(el);
    },
    unobserve: (el: Element) => {
      handlers.delete(el);
      observer?.unobserve(el);
    },
  };
})();

function MeasuredFeedCard({ post, onHeight, ...props }: {
  post: SongFitPost;
  onHeight: (height: number) => void;
  rank?: number;
  onOpenComments: (postId: string) => void;
  onOpenLikes: (postId: string) => void;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: { total: number; replay_yes: number; saves_count?: number; signal_velocity?: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { state } = useCardState(post.id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sharedResizeObserver.observe(el, onHeight);
    onHeight(el.getBoundingClientRect().height);
    return () => sharedResizeObserver.unobserve(el);
  }, [onHeight]);

  return (
    <div ref={ref} className="shrink-0">
      <SongFitPostCard post={post} cardState={state} {...props} />
    </div>
  );
}

function WindowedFeedList({
  posts,
  feedView,
  fetchPosts,
  setCommentPostId,
  setLikesPostId,
  signalMap,
  isLoadingMore,
  hasMore,
  hasTrimmedNewer,
  loadMore,
  loadPrevious,
  onCenterChange,
}: {
  posts: SongFitPost[];
  feedView: FeedView;
  fetchPosts: () => void;
  setCommentPostId: (v: string | null) => void;
  setLikesPostId: (v: string | null) => void;
  signalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }>;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasTrimmedNewer: boolean;
  loadMore: () => Promise<void>;
  loadPrevious: () => Promise<void>;
  onCenterChange: (idx: number) => void;
}) {
  const lifecycle = useContext(CardLifecycleContext);
  const prevMapRef = useRef(new Map<string, boolean>());
  const { windowedPosts, heightMap, registerHeight, impressions, windowRange, centerIndex } = useFeedWindow(posts, "songfit-scroll-container");

  useEffect(() => {
    onCenterChange(centerIndex);
  }, [centerIndex, onCenterChange]);

  useEffect(() => {
    impressions.forEach((postId) => logImpression(postId));
  }, [impressions]);

  useEffect(() => {
    if (!lifecycle) return;
    const prev = prevMapRef.current;
    windowedPosts.forEach(({ post, shouldRender }) => {
      const prevRendered = prev.get(post.id) ?? false;
      if (prevRendered !== shouldRender) {
        lifecycle.setCardState(post.id, shouldRender ? "warm" : "cold");
      }
      prev.set(post.id, shouldRender);
    });
  }, [lifecycle, windowedPosts]);

  useEffect(() => {
    if (feedView === "billboard") return;
    if (windowRange.end >= posts.length - 15 && hasMore && !isLoadingMore) {
      void loadMore();
    }
    if (windowRange.start <= 0 && hasTrimmedNewer && !isLoadingMore) {
      void loadPrevious();
    }
  }, [feedView, hasMore, hasTrimmedNewer, isLoadingMore, loadMore, loadPrevious, posts.length, windowRange.end, windowRange.start]);

  return (
    <div className="pb-24">
      {windowedPosts.map(({ post, shouldRender }, idx) => (
        shouldRender ? (
          <MeasuredFeedCard
            key={post.id}
            post={post}
            onHeight={(h) => registerHeight(post.id, h)}
            rank={feedView === "billboard" ? idx + 1 : undefined}
            onOpenComments={(id) => setCommentPostId(id)}
            onOpenLikes={(id) => setLikesPostId(id)}
            onRefresh={fetchPosts}
            isBillboard={feedView === "billboard"}
            signalData={feedView === "billboard" ? signalMap[post.id] : undefined}
          />
        ) : (
          <div key={post.id} style={{ height: heightMap.get(post.id) ?? FEED_CARD_MIN_HEIGHT }} className="shrink-0" />
        )
      ))}
      {isLoadingMore && (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function SongFitFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.email === "sunpatel@gmail.com" || user?.email === "spatel@iorad.com";
  const [posts, setPosts] = useState<SongFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("all");
  const [billboardMode, setBillboardMode] = useState<BillboardMode>("this_week");
  const [userVoteCount, setUserVoteCount] = useState<number | null>(null);
  const [composerUnlocked, setComposerUnlocked] = useState(false);
  const [showFloatingAnchor, setShowFloatingAnchor] = useState(false);
  const [hasPosted, setHasPosted] = useState(false);
  const [hasEverPosted, setHasEverPosted] = useState<boolean | null>(null);
  const [signalMap, setSignalMap] = useState<Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }>>({});
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newestCreatedAt, setNewestCreatedAt] = useState<string | null>(null);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);
  const [hasTrimmedNewer, setHasTrimmedNewer] = useState(false);
  const centerIndexRef = useRef(0);

  const normalizePosts = useCallback((input: SongFitPost[]) => input.map((p) => ({ ...p, user_has_liked: false, user_has_saved: false, saves_count: 0 })), []);

  const capPosts = useCallback((next: SongFitPost[]) => {
    if (next.length <= FEED_MAX_POSTS) return next;
    const center = Math.min(Math.max(centerIndexRef.current, 0), next.length - 1);
    const start = Math.max(0, Math.min(center - Math.floor(FEED_MAX_POSTS / 2), next.length - FEED_MAX_POSTS));
    const end = start + FEED_MAX_POSTS;
    if (start > 0) setHasTrimmedNewer(true);
    return next.slice(start, end);
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    if (feedView !== "billboard") {
      setSignalMap({});
      // Use prefetched data on first mount (one-shot)
      const prefetched = consumeFeedPrefetch();
      const { data: allPosts } = prefetched
        ? await prefetched
        : await supabase
            .from("songfit_posts")
            .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
            .eq("status", "live")
            .limit(FEED_PAGE_SIZE)
            .order("created_at", { ascending: false });

      let enriched = (allPosts || []) as unknown as SongFitPost[];
      if (feedView === "now_streaming") enriched = enriched.filter((p) => !!p.spotify_track_id);
      else if (feedView === "in_studio") enriched = enriched.filter((p) => !!p.lyric_dance_url && !!p.lyric_dance_id);
      else if (feedView === "in_battle") enriched = enriched.filter((p) => !!p.lyric_dance_url && !p.lyric_dance_id && !p.spotify_track_id);

      const normalized = normalizePosts(enriched);
      setPosts(normalized);
      setNewestCreatedAt(normalized[0]?.created_at ?? null);
      setOldestCreatedAt(normalized[normalized.length - 1]?.created_at ?? null);
      setHasTrimmedNewer(false);
      setHasMore(enriched.length === FEED_PAGE_SIZE);
    } else {
      let cutoff: string | null = null;
      let ceiling: string | null = null;
      if (billboardMode === "this_week") cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (billboardMode === "last_week") {
        cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        ceiling = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      }

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

      const postIds = pool.map((p) => p.id);
      const ownerIds = [...new Set(pool.map((p) => p.user_id))];
      const applyWindow = (q: any) => {
        if (cutoff) q = q.gte("created_at", cutoff);
        if (ceiling) q = q.lte("created_at", ceiling);
        return q;
      };

      const [reviewsRes, commentsRes, followsRes, savesRes] = await Promise.all([
        applyWindow(supabase.from("songfit_hook_reviews").select("post_id, would_replay").in("post_id", postIds)),
        applyWindow(supabase.from("songfit_comments").select("post_id").in("post_id", postIds)),
        applyWindow(supabase.from("songfit_follows").select("followed_user_id").in("followed_user_id", ownerIds)),
        applyWindow(supabase.from("songfit_saves").select("post_id").in("post_id", postIds)),
      ]);

      const hookMap: Record<string, { run_it_back: number; skip: number; total: number; replay_yes: number }> = {};
      for (const r of reviewsRes.data || []) {
        if (!hookMap[r.post_id]) hookMap[r.post_id] = { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
        hookMap[r.post_id].total++;
        if (r.would_replay) {
          hookMap[r.post_id].run_it_back++;
          hookMap[r.post_id].replay_yes++;
        } else hookMap[r.post_id].skip++;
      }
      const commentMap: Record<string, number> = {};
      for (const c of commentsRes.data || []) commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1;
      const followByOwner: Record<string, number> = {};
      for (const f of followsRes.data || []) followByOwner[f.followed_user_id] = (followByOwner[f.followed_user_id] || 0) + 1;
      const savesMap: Record<string, number> = {};
      for (const s of savesRes.data || []) savesMap[s.post_id] = (savesMap[s.post_id] || 0) + 1;

      const scored = pool.map((p) => {
        const h = hookMap[p.id] || { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
        const velocity = h.run_it_back + 3 * (commentMap[p.id] || 0) + 8 * (followByOwner[p.user_id] || 0) + 12 * (savesMap[p.id] || 0) - 2 * h.skip;
        return { post: p, velocity, h, saves: savesMap[p.id] || 0 };
      });

      scored.sort((a, b) => b.velocity - a.velocity);
      const top40 = scored.slice(0, 40);
      setPosts(top40.map((s, i) => ({ ...s.post, current_rank: i + 1 })));
      setHasMore(false);
      const newSignalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }> = {};
      for (const s of top40) newSignalMap[s.post.id] = { total: s.h.total, replay_yes: s.h.replay_yes, saves_count: s.saves, signal_velocity: s.velocity };
      setSignalMap(newSignalMap);
    }

    setLoading(false);
  }, [billboardMode, feedView, normalizePosts]);

  const loadMore = useCallback(async () => {
    if (feedView === "billboard" || isLoadingMore || !hasMore || posts.length === 0) return;
    setIsLoadingMore(true);
    const cursor = oldestCreatedAt ?? posts[posts.length - 1]?.created_at;
    const { data } = await supabase
      .from("songfit_posts")
      .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
      .eq("status", "live")
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE);

    let nextPosts = (data || []) as unknown as SongFitPost[];
    if (feedView === "now_streaming") nextPosts = nextPosts.filter((p) => !!p.spotify_track_id);
    else if (feedView === "in_studio") nextPosts = nextPosts.filter((p) => !!p.lyric_dance_url && !!p.lyric_dance_id);
    else if (feedView === "in_battle") nextPosts = nextPosts.filter((p) => !!p.lyric_dance_url && !p.lyric_dance_id && !p.spotify_track_id);

    if (nextPosts.length > 0) {
      setPosts((prev) => {
        const merged = [...prev, ...normalizePosts(nextPosts)];
        const capped = capPosts(merged);
        setNewestCreatedAt(capped[0]?.created_at ?? null);
        setOldestCreatedAt(capped[capped.length - 1]?.created_at ?? null);
        return capped;
      });
    }
    setHasMore((data || []).length === FEED_PAGE_SIZE);
    setIsLoadingMore(false);
  }, [capPosts, feedView, hasMore, isLoadingMore, normalizePosts, oldestCreatedAt, posts]);

  const loadPrevious = useCallback(async () => {
    if (feedView === "billboard" || isLoadingMore || !newestCreatedAt) return;
    setIsLoadingMore(true);
    const { data } = await supabase
      .from("songfit_posts")
      .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)")
      .eq("status", "live")
      .gt("created_at", newestCreatedAt)
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE);
    const previous = normalizePosts((data || []) as unknown as SongFitPost[]);
    if (previous.length > 0) {
      setPosts((prev) => {
        const merged = [...previous, ...prev];
        const capped = capPosts(merged);
        setNewestCreatedAt(capped[0]?.created_at ?? null);
        setOldestCreatedAt(capped[capped.length - 1]?.created_at ?? null);
        return capped;
      });
      setHasTrimmedNewer((data || []).length === FEED_PAGE_SIZE);
    } else {
      setHasTrimmedNewer(false);
    }
    setIsLoadingMore(false);
  }, [capPosts, feedView, isLoadingMore, newestCreatedAt, normalizePosts]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (!user) return;
    supabase.from("songfit_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }) => {
      const everPosted = (count ?? 0) > 0;
      setHasEverPosted(everPosted);
      if (!everPosted || isAdmin) setComposerUnlocked(true);
    });
  }, [isAdmin, user]);

  useEffect(() => {
    if (!user) return;
    supabase.from("songfit_hook_reviews").select("id").eq("user_id", user.id).then(({ data }) => {
      const count = (data || []).length;
      setUserVoteCount(count);
      if (count >= 3) setComposerUnlocked(true);
    });
  }, [user]);

  useEffect(() => {
    const handler = () => {
      setUserVoteCount((prev) => {
        const next = (prev ?? 0) + 1;
        if (next >= 3) setComposerUnlocked(true);
        return next;
      });
    };
    window.addEventListener("crowdfit:vote", handler);
    return () => window.removeEventListener("crowdfit:vote", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setHasEverPosted(true);
      if (!isAdmin) {
        setComposerUnlocked(false);
        setUserVoteCount(0);
      }
      setHasPosted(true);
    };
    window.addEventListener("crowdfit:post-created", handler);
    return () => window.removeEventListener("crowdfit:post-created", handler);
  }, [isAdmin]);

  useEffect(() => {
    const handler = () => void fetchPosts();
    window.addEventListener("songfit:dance-published", handler);
    return () => window.removeEventListener("songfit:dance-published", handler);
  }, [fetchPosts]);

  useEffect(() => {
    if (!composerUnlocked) {
      setShowFloatingAnchor(false);
      return;
    }

    const handleScroll = () => {
      const scrollEl = document.getElementById("songfit-scroll-container");
      if (scrollEl) setShowFloatingAnchor(scrollEl.scrollTop > 300);
    };

    document.addEventListener("scroll", handleScroll, true);
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
          <StagePresence currentVotes={userVoteCount ?? 0} onUnlocked={() => setComposerUnlocked(true)} hasPosted={hasPosted} />
        )
      ) : (
        <div className="border-b border-border/40 cursor-pointer" onClick={() => navigate("/auth?mode=signup", { state: { returnTab: "songfit" } })}>
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

      <BillboardToggle view={feedView} onViewChange={setFeedView} billboardMode={billboardMode} onModeChange={setBillboardMode} isLoggedIn={!!user} />

      {loading ? (
        <div className="space-y-0 pt-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-2 pb-3">
              <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: "#121212" }}>
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="h-8 w-8 rounded-full bg-white/10" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-24 rounded bg-white/10" />
                    <div className="h-2.5 w-16 rounded bg-white/5" />
                  </div>
                </div>
                <div className="relative overflow-hidden" style={{ height: 320 }}>
                  <LyricDanceCover songName="" artistName="" avatarUrl={null} initial="" waiting />
                </div>
                <div className="px-3 pt-2 pb-1 space-y-1">
                  <div className="h-2.5 w-3/4 rounded bg-white/10" />
                </div>
                <div className="flex items-center gap-3 px-3 py-2">
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="h-4 w-4 rounded-full bg-white/10" />
                  ))}
                </div>
                <div className="h-1" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3"><p className="text-muted-foreground text-sm">No live submissions yet. Be the first!</p></div>
      ) : (
        <CardLifecycleProvider>
          <RealtimeFeedHubProvider>
              <WindowedFeedList
                posts={posts}
                feedView={feedView}
                fetchPosts={fetchPosts}
                setCommentPostId={setCommentPostId}
                setLikesPostId={setLikesPostId}
                signalMap={signalMap}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                hasTrimmedNewer={hasTrimmedNewer}
                loadMore={loadMore}
                loadPrevious={loadPrevious}
                onCenterChange={(idx) => { centerIndexRef.current = idx; }}
              />
            </RealtimeFeedHubProvider>
        </CardLifecycleProvider>
      )}

      <SongFitComments
        postId={commentPostId}
        onClose={() => setCommentPostId(null)}
        onCommentAdded={async (pid) => {
          const { data } = await supabase.from("songfit_posts").select("comments_count").eq("id", pid).maybeSingle();
          if (data) setPosts((prev) => prev.map((p) => (p.id === pid ? { ...p, comments_count: data.comments_count } : p)));
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
