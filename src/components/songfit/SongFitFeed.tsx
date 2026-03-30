import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Loader2, Plus, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { SongFitPost, FeedView, BillboardMode } from "./types";
import { SongFitPostCardMemo } from "./SongFitPostCard";
import { SongFitComments } from "./SongFitComments";
import { SongFitLikesList } from "./SongFitLikesList";
import { SongFitInlineComposer } from "./SongFitInlineComposer";
import { BillboardToggle } from "./BillboardToggle";
import {
  CardLifecycleProvider,
  useCardLifecycleStore,
  useCardState,
} from "./useCardLifecycle";
import { useFeedWindow } from "./useFeedWindow";
import { logImpression } from "@/lib/engagementTracking";
import { RealtimeFeedHubProvider } from "./RealtimeFeedHub";
import { consumeFeedPrefetch, getCachedFeed, getCachedLyricData, cacheWrite } from "@/lib/prefetch";
import { cn } from "@/lib/utils";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { preloadImage } from "@/lib/imagePreloadCache";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { useVoteGate } from "@/hooks/useVoteGate";
import { PanelShell } from "@/components/shared/panel/PanelShell";

const FEED_PAGE_SIZE = 20;
const FEED_CARD_MIN_HEIGHT = 530;
const FEED_MAX_POSTS = 200;
const LYRIC_COVER_COLUMNS =
  "id,artist_name,song_name,audio_url,section_images,lyrics," +
  "palette,auto_palettes,album_art_url,beat_grid,empowerment_promise";

const LYRIC_HEAVY_COLUMNS =
  "id,lyrics,words,cinematic_direction,motion_profile_spec:physics_spec," +
  "scene_context,scene_manifest,system_type,seed,artist_dna";
const sharedResizeObserver = (() => {
  let observer: ResizeObserver | null = null;
  const handlers = new WeakMap<Element, (height: number) => void>();
  const getObserver = () => {
    if (!observer) {
      observer = new ResizeObserver((entries) => {
        entries.forEach((entry) =>
          handlers.get(entry.target)?.(entry.contentRect.height),
        );
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

function MeasuredFeedCard({
  post,
  onHeight,
  reelsMode = false,
  lyricDanceData,
  ...props
}: {
  post: SongFitPost;
  onHeight: (height: number) => void;
  rank?: number;
  onOpenComments: (postId: string) => void;
  onOpenLikes: (postId: string) => void;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: {
    total: number;
    replay_yes: number;
    saves_count?: number;
    signal_velocity?: number;
  };
  reelsMode?: boolean;
  isFirst?: boolean;
  lyricDanceData?: LyricDanceData | null;
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
    <div
      ref={ref}
      className={cn("shrink-0", reelsMode && "h-[100dvh] snap-start")}
    >
      <SongFitPostCardMemo
        post={post}
        cardState={state}
        reelsMode={reelsMode}
        lyricDanceData={lyricDanceData}
        {...props}
      />
    </div>
  );
}

const _WindowedFeedList = memo(function WindowedFeedList({
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
  reelsMode = false,
  lyricDataMap,
}: {
  posts: SongFitPost[];
  feedView: FeedView;
  fetchPosts: () => void;
  setCommentPostId: (v: string | null) => void;
  setLikesPostId: (v: string | null) => void;
  signalMap: Record<
    string,
    {
      total: number;
      replay_yes: number;
      saves_count: number;
      signal_velocity: number;
    }
  >;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasTrimmedNewer: boolean;
  loadMore: () => Promise<void>;
  loadPrevious: () => Promise<void>;
  onCenterChange: (idx: number) => void;
  reelsMode?: boolean;
  isFirst?: boolean;
  lyricDataMap: Map<string, LyricDanceData>;
}) {
  const store = useCardLifecycleStore();
  const prevMapRef = useRef(new Map<string, boolean>());
  const {
    windowedPosts,
    registerHeight,
    impressions,
    windowRange,
    centerIndex,
  } = useFeedWindow(posts, "songfit-scroll-container", reelsMode);

  useEffect(() => {
    onCenterChange(centerIndex);
  }, [centerIndex, onCenterChange]);

  useEffect(() => {
    impressions.forEach((postId) => logImpression(postId));
  }, [impressions]);

  useEffect(() => {
    const prev = prevMapRef.current;
    windowedPosts.forEach(({ post, shouldRender }) => {
      const prevRendered = prev.get(post.id) ?? false;
      if (prevRendered !== shouldRender) {
        store?.setState(post.id, shouldRender ? "warm" : "cold");
      }
      prev.set(post.id, shouldRender);
    });
  }, [store, windowedPosts]);

  useEffect(() => {
    if (feedView === "billboard") return;
    if (windowRange.end >= posts.length - 15 && hasMore && !isLoadingMore) {
      void loadMore();
    }
    if (windowRange.start <= 0 && hasTrimmedNewer && !isLoadingMore) {
      void loadPrevious();
    }
  }, [
    feedView,
    hasMore,
    hasTrimmedNewer,
    isLoadingMore,
    loadMore,
    loadPrevious,
    posts.length,
    windowRange.end,
    windowRange.start,
  ]);

  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {windowedPosts.map(({ post, shouldRender }, idx) => (
        <MeasuredFeedCard
          key={post.id}
          post={post}
          onHeight={(h) => registerHeight(post.id, h)}
          rank={feedView === "billboard" ? idx + 1 : undefined}
          onOpenComments={(id) => setCommentPostId(id)}
          onOpenLikes={(id) => setLikesPostId(id)}
          onRefresh={fetchPosts}
          isBillboard={feedView === "billboard"}
          signalData={
            feedView === "billboard" ? signalMap[post.id] : undefined
          }
          reelsMode={reelsMode}
          isFirst={idx === 0}
          lyricDanceData={post.lyric_dance_id ? lyricDataMap.get(post.lyric_dance_id) ?? null : null}
        />
      ))}
      {isLoadingMore && (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
});

interface SongFitFeedProps {
  reelsMode?: boolean;
}

export function SongFitFeed({ reelsMode = false }: SongFitFeedProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState<SongFitPost[]>(() => {
    const cached = getCachedFeed();
    if (!cached || cached.length === 0) return [];
    return (cached as unknown as SongFitPost[]).map((p) => ({
      ...p,
      user_has_liked: false,
      user_has_saved: false,
      saves_count: 0,
    }));
  });
  const [loading, setLoading] = useState(() => {
    const cached = getCachedFeed();
    return !cached || cached.length === 0;
  });
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [likesPostId, setLikesPostId] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("all");
  const [billboardMode, setBillboardMode] =
    useState<BillboardMode>("this_week");
  const [showFloatingAnchor, setShowFloatingAnchor] = useState(false);
  const [reelsComposerOpen, setReelsComposerOpen] = useState(false);
  const [signalMap, setSignalMap] = useState<
    Record<
      string,
      {
        total: number;
        replay_yes: number;
        saves_count: number;
        signal_velocity: number;
      }
    >
  >({});
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newestCreatedAt, setNewestCreatedAt] = useState<string | null>(null);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);
  const [hasTrimmedNewer, setHasTrimmedNewer] = useState(false);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [lyricDataMap, setLyricDataMap] = useState<Map<string, LyricDanceData>>(() => {
    const cached = getCachedLyricData();
    if (!cached) return new Map();
    const map = new Map<string, LyricDanceData>();
    for (const [id, row] of Object.entries(cached)) {
      map.set(id, row as LyricDanceData);
    }
    return map;
  });
  const centerIndexRef = useRef(0);
  const postsRef = useRef(posts);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const hasMoreRef = useRef(hasMore);
  const newestCreatedAtRef = useRef<string | null>(null);
  const hasFadedIn = useRef(false);
  const { canCreate, credits, required } = useVoteGate();

  postsRef.current = posts;
  isLoadingMoreRef.current = isLoadingMore;
  hasMoreRef.current = hasMore;
  newestCreatedAtRef.current = newestCreatedAt;

  const handleCenterChange = useCallback((idx: number) => {
    centerIndexRef.current = idx;
  }, []);

  const capPosts = useCallback((next: SongFitPost[]) => {
    if (next.length <= FEED_MAX_POSTS) return next;
    const center = Math.min(
      Math.max(centerIndexRef.current, 0),
      next.length - 1,
    );
    const start = Math.max(
      0,
      Math.min(
        center - Math.floor(FEED_MAX_POSTS / 2),
        next.length - FEED_MAX_POSTS,
      ),
    );
    const end = start + FEED_MAX_POSTS;
    if (start > 0) setHasTrimmedNewer(true);
    return next.slice(start, end);
  }, []);

  const fetchPosts = useCallback(async () => {
    // If switching feed views and we have posts, filter immediately
    // from existing data to avoid skeleton flash on tab switch
    if (postsRef.current.length > 0 && feedView !== "billboard") {
      const filtered = postsRef.current.filter((p) => {
        if (feedView === "now_streaming") return !!p.spotify_track_id;
        if (feedView === "in_studio") return !!p.lyric_dance_url && !!p.lyric_dance_id;
        if (feedView === "in_battle") return !!p.lyric_dance_url && !p.lyric_dance_id && !p.spotify_track_id;
        return true;
      });
      if (filtered.length > 0) {
        setPosts(filtered);
        // Don't show loading — we have something to show
        // Revalidation continues below in the background
      }
    }

    // If we already have posts (e.g. from cache), don't flash the skeleton
    // during revalidation. Only show loading state on truly empty first loads.
    if (postsRef.current.length === 0) {
      setLoading(true);
    }

    if (feedView !== "billboard") {
      setSignalMap({});
      // Use prefetched data on first mount (one-shot)
      const prefetched = consumeFeedPrefetch();
      const { data: allPosts } = prefetched
        ? await prefetched
        : await supabase
            .from("songfit_posts")
            .select(
              "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)",
            )
            .eq("status", "live")
            .limit(FEED_PAGE_SIZE)
            .order("created_at", { ascending: false });

      let enriched = (allPosts || []) as unknown as SongFitPost[];
      if (feedView === "now_streaming")
        enriched = enriched.filter((p) => !!p.spotify_track_id);
      else if (feedView === "in_studio")
        enriched = enriched.filter(
          (p) => !!p.lyric_dance_url && !!p.lyric_dance_id,
        );
      else if (feedView === "in_battle")
        enriched = enriched.filter(
          (p) =>
            !!p.lyric_dance_url && !p.lyric_dance_id && !p.spotify_track_id,
        );

      const normalized = enriched.map((p: SongFitPost) => ({
        ...p,
        user_has_liked: false,
        user_has_saved: false,
        saves_count: 0,
      }));
      
      // Preload album art for Spotify posts
      enriched
        .filter((p) => !p.lyric_dance_id && p.album_art_url)
        .forEach((p) => preloadImage(p.album_art_url!));

      // Fetch lyric cover data (section_images + lyrics) BEFORE rendering cards.
      // This ensures covers are never black on first visit — cards render with data.
      const lyricIds = enriched
        .filter((p) => p.lyric_dance_id)
        .map((p) => p.lyric_dance_id as string);
      if (lyricIds.length > 0) {
        // Await Phase 1 so section_images and lyrics are ready when cards mount
        const { data: coverRows } = await supabase
          .from("shareable_lyric_dances" as any)
          .select(LYRIC_COVER_COLUMNS)
          .in("id", lyricIds);

        const map = new Map<string, LyricDanceData>();
        for (const row of (coverRows ?? []) as any[]) {
          map.set(row.id, { ...row } as LyricDanceData);
          const img = row.section_images?.[0];
          if (img) preloadImage(img);
        }
        setLyricDataMap(new Map(map));

        // Now render cards — lyric data is available
        postsRef.current = normalized;
        setPosts(normalized);
        setNewestCreatedAt(normalized[0]?.created_at ?? null);
        setOldestCreatedAt(normalized[normalized.length - 1]?.created_at ?? null);
        setHasTrimmedNewer(false);
        hasMoreRef.current = enriched.length === FEED_PAGE_SIZE;
        setHasMore(enriched.length === FEED_PAGE_SIZE);
        setLoading(false);
        setPendingNewCount(0);

        // Phase 2: heavy columns (cinematic_direction, words etc), deferred
        const visibleIds = lyricIds.slice(0, 4);
        setTimeout(() => {
          supabase
            .from("shareable_lyric_dances" as any)
            .select(LYRIC_HEAVY_COLUMNS)
            .in("id", visibleIds)
            .then(({ data: heavyRows }) => {
              const updated = new Map(map);
              const cacheObj: Record<string, any> = {};
              for (const row of (heavyRows ?? []) as any[]) {
                const base = updated.get(row.id) ?? {};
                const merged = {
                  ...base,
                  ...row,
                  cinematic_direction: normalizeCinematicDirection(
                    row.cinematic_direction,
                  ),
                } as LyricDanceData;
                updated.set(row.id, merged);
                cacheObj[row.id] = merged;
              }
              setLyricDataMap(new Map(updated));
              cacheWrite("lyric_data", cacheObj);
            });
        }, 300);
      } else {
        // No lyric dance posts — render immediately
        setLyricDataMap(new Map());
        postsRef.current = normalized;
        setPosts(normalized);
        setNewestCreatedAt(normalized[0]?.created_at ?? null);
        setOldestCreatedAt(normalized[normalized.length - 1]?.created_at ?? null);
        setHasTrimmedNewer(false);
        hasMoreRef.current = enriched.length === FEED_PAGE_SIZE;
        setHasMore(enriched.length === FEED_PAGE_SIZE);
        setLoading(false);
        setPendingNewCount(0);
      }

      // Non-billboard path done — loading already set to false in branch above.
      return;
    } else {
      let cutoff: string | null = null;
      let ceiling: string | null = null;
      if (billboardMode === "this_week")
        cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (billboardMode === "last_week") {
        cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        ceiling = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { data: poolData } = await supabase
        .from("songfit_posts")
        .select(
          "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)",
        )
        .eq("status", "live")
        .limit(100)
        .order("created_at", { ascending: false });

      const pool = (poolData || []) as unknown as SongFitPost[];
      if (pool.length === 0) {
        postsRef.current = [];
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

      const [reviewsRes, commentsRes, followsRes, savesRes] = await Promise.all(
        [
          applyWindow(
            supabase
              .from("songfit_hook_reviews")
              .select("post_id, would_replay")
              .in("post_id", postIds),
          ),
          applyWindow(
            supabase
              .from("songfit_comments")
              .select("post_id")
              .in("post_id", postIds),
          ),
          applyWindow(
            supabase
              .from("songfit_follows")
              .select("followed_user_id")
              .in("followed_user_id", ownerIds),
          ),
          applyWindow(
            supabase
              .from("songfit_saves")
              .select("post_id")
              .in("post_id", postIds),
          ),
        ],
      );

      const hookMap: Record<
        string,
        { run_it_back: number; skip: number; total: number; replay_yes: number }
      > = {};
      for (const r of reviewsRes.data || []) {
        if (!hookMap[r.post_id])
          hookMap[r.post_id] = {
            run_it_back: 0,
            skip: 0,
            total: 0,
            replay_yes: 0,
          };
        hookMap[r.post_id].total++;
        if (r.would_replay) {
          hookMap[r.post_id].run_it_back++;
          hookMap[r.post_id].replay_yes++;
        } else hookMap[r.post_id].skip++;
      }
      const commentMap: Record<string, number> = {};
      for (const c of commentsRes.data || [])
        commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1;
      const followByOwner: Record<string, number> = {};
      for (const f of followsRes.data || [])
        followByOwner[f.followed_user_id] =
          (followByOwner[f.followed_user_id] || 0) + 1;
      const savesMap: Record<string, number> = {};
      for (const s of savesRes.data || [])
        savesMap[s.post_id] = (savesMap[s.post_id] || 0) + 1;

      const scored = pool.map((p) => {
        const h = hookMap[p.id] || {
          run_it_back: 0,
          skip: 0,
          total: 0,
          replay_yes: 0,
        };
        const velocity =
          h.run_it_back +
          3 * (commentMap[p.id] || 0) +
          8 * (followByOwner[p.user_id] || 0) +
          12 * (savesMap[p.id] || 0) -
          2 * h.skip;
        return { post: p, velocity, h, saves: savesMap[p.id] || 0 };
      });

      scored.sort((a, b) => b.velocity - a.velocity);
      const top40 = scored.slice(0, 40);
      const rankedPosts = top40.map((s, i) => ({
        ...s.post,
        current_rank: i + 1,
      }));
      postsRef.current = rankedPosts;
      setPosts(rankedPosts);
      hasMoreRef.current = false;
      setHasMore(false);
      const newSignalMap: Record<
        string,
        {
          total: number;
          replay_yes: number;
          saves_count: number;
          signal_velocity: number;
        }
      > = {};
      for (const s of top40)
        newSignalMap[s.post.id] = {
          total: s.h.total,
          replay_yes: s.h.replay_yes,
          saves_count: s.saves,
          signal_velocity: s.velocity,
        };
      setSignalMap(newSignalMap);
    }

    setLoading(false);
  }, [billboardMode, feedView]);

  const handleLoadNewDrops = useCallback(() => {
    setPendingNewCount(0);
    void fetchPosts();
    const scrollEl = document.getElementById("songfit-scroll-container");
    if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
  }, [fetchPosts]);

  const loadMore = useCallback(async () => {
    if (
      feedView === "billboard" ||
      isLoadingMoreRef.current ||
      !hasMoreRef.current ||
      postsRef.current.length === 0
    )
      return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const currentPosts = postsRef.current;
      const cursor =
        oldestCreatedAt ?? currentPosts[currentPosts.length - 1]?.created_at;
      if (!cursor) return;

      const { data } = await supabase
        .from("songfit_posts")
        .select(
          "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)",
        )
        .eq("status", "live")
        .lt("created_at", cursor)
        .order("created_at", { ascending: false })
        .limit(FEED_PAGE_SIZE);

      let nextPosts = (data || []) as unknown as SongFitPost[];
      if (feedView === "now_streaming")
        nextPosts = nextPosts.filter((p) => !!p.spotify_track_id);
      else if (feedView === "in_studio")
        nextPosts = nextPosts.filter(
          (p) => !!p.lyric_dance_url && !!p.lyric_dance_id,
        );
      else if (feedView === "in_battle")
        nextPosts = nextPosts.filter(
          (p) =>
            !!p.lyric_dance_url && !p.lyric_dance_id && !p.spotify_track_id,
        );

      if (nextPosts.length > 0) {
        setPosts((prev) => {
          const merged = [
            ...prev,
            ...nextPosts.map((p: SongFitPost) => ({
              ...p,
              user_has_liked: false,
              user_has_saved: false,
              saves_count: 0,
            })),
          ];
          const capped = capPosts(merged);
          postsRef.current = capped;
          setNewestCreatedAt(capped[0]?.created_at ?? null);
          setPendingNewCount(0);
          setOldestCreatedAt(capped[capped.length - 1]?.created_at ?? null);
          return capped;
        });
      }
      hasMoreRef.current = (data || []).length === FEED_PAGE_SIZE;
      setHasMore((data || []).length === FEED_PAGE_SIZE);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [capPosts, feedView, oldestCreatedAt]);

  const loadPrevious = useCallback(async () => {
    if (
      feedView === "billboard" ||
      isLoadingMoreRef.current ||
      !newestCreatedAt
    )
      return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const { data } = await supabase
        .from("songfit_posts")
        .select(
          "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)",
        )
        .eq("status", "live")
        .gt("created_at", newestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(FEED_PAGE_SIZE);
      const previous = ((data || []) as unknown as SongFitPost[]).map(
        (p: SongFitPost) => ({
          ...p,
          user_has_liked: false,
          user_has_saved: false,
          saves_count: 0,
        }),
      );
      if (previous.length > 0) {
        setPosts((prev) => {
          const merged = [...previous, ...prev];
          const capped = capPosts(merged);
          postsRef.current = capped;
          setNewestCreatedAt(capped[0]?.created_at ?? null);
          setPendingNewCount(0);
          setOldestCreatedAt(capped[capped.length - 1]?.created_at ?? null);
          return capped;
        });
        setHasTrimmedNewer((data || []).length === FEED_PAGE_SIZE);
      } else {
        setHasTrimmedNewer(false);
      }
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [capPosts, feedView, newestCreatedAt]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  // ── Realtime: count new posts arriving after the current feed head ──
  useEffect(() => {
    const channel = supabase
      .channel("crowdfit-new-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "songfit_posts", filter: "status=eq.live" },
        (payload) => {
          const newRow = payload.new as { created_at?: string; user_id?: string };
          if (!newRow?.created_at) return;
          if (user?.id && newRow.user_id === user.id) return;
          const head = newestCreatedAtRef.current;
          if (head && newRow.created_at <= head) return;
          setPendingNewCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const handler = () => void fetchPosts();
    window.addEventListener("songfit:dance-published", handler);
    return () => window.removeEventListener("songfit:dance-published", handler);
  }, [fetchPosts]);

  useEffect(() => {
    if (!canCreate || reelsMode) {
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
  }, [canCreate, reelsMode]);

  return (
    <div className={reelsMode ? "w-full" : "w-full max-w-[470px] mx-auto"}>
      <style>{"@keyframes fadeIn{from{opacity:0}to{opacity:1}}"}</style>
      {reelsMode ? (
        <>
          <div className="fixed top-14 left-0 right-0 z-30 flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-black/50 backdrop-blur-md rounded-full px-1 border border-white/10">
              <BillboardToggle
                view={feedView}
                onViewChange={setFeedView}
                billboardMode={billboardMode}
                onModeChange={setBillboardMode}
                isLoggedIn={!!user}
                compact
              />
            </div>
          </div>
          {pendingNewCount > 0 && !loading && (
            <div className="fixed top-[6.5rem] left-0 right-0 z-30 flex justify-center pointer-events-none">
              <button
                onClick={handleLoadNewDrops}
                className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full px-4 py-1.5 border border-white/10 text-[10px] font-mono tracking-[0.12em] text-green-400 hover:text-green-300 transition-colors"
              >
                {pendingNewCount} New Drop{pendingNewCount !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {user ? (
            <div className="animate-fade-in">
              <SongFitInlineComposer onPostCreated={fetchPosts} />
            </div>
          ) : (
            <div
              className="border-b border-border/40 cursor-pointer"
              onClick={() =>
                navigate("/auth?mode=signup", {
                  state: { returnTab: "songfit" },
                })
              }
            >
              <div className="flex gap-3 px-4 pt-3 pb-3">
                <div className="h-10 w-10 rounded-full bg-muted border border-border shrink-0 mt-1 flex items-center justify-center">
                  <User size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 flex items-center">
                  <span className="text-base text-muted-foreground/60">
                    Drop your song and get signals
                  </span>
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
        </>
      )}

      {pendingNewCount > 0 && !loading && !reelsMode && (
        <button
          onClick={handleLoadNewDrops}
          className="w-full py-2 text-center text-[11px] font-mono tracking-[0.1em] text-primary hover:text-primary/80 transition-colors border-b border-border/30"
        >
          {pendingNewCount} New Drop{pendingNewCount !== 1 ? "s" : ""}
        </button>
      )}

      
      {loading ? (
        reelsMode ? (
          <div className="h-[100dvh] snap-start bg-black" />
        ) : (
          <div className="space-y-3 pt-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-2 pb-3">
                <div className="rounded-2xl overflow-hidden" style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}>
                  {/* Header — px-3 py-2.5, avatar h-8 w-8 + label */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full bg-white/[0.04]" />
                    <div className="h-3 w-32 rounded bg-white/[0.04]" />
                  </div>
                  {/* Canvas — 320px, same as style={{ height: 320 }} */}
                  <div style={{ height: 320 }} />
                  {/* Bottom bar — h-[48px], 3-section strip */}
                  <div className="flex items-stretch" style={{ height: 48 }}>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-3 w-16 rounded bg-white/[0.03]" />
                    </div>
                    <div className="w-px bg-white/[0.04] self-stretch my-3" />
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-3 w-16 rounded bg-white/[0.03]" />
                    </div>
                    <div className="w-px bg-white/[0.04] self-stretch my-3" />
                    <div className="w-16 flex items-center justify-center">
                      <div className="h-3 w-3 rounded bg-white/[0.03]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            No live submissions yet. Be the first!
          </p>
        </div>
      ) : (
        <div
          style={{
            animation: hasFadedIn.current ? "none" : "fadeIn 0.3s ease forwards",
          }}
          ref={() => {
            hasFadedIn.current = true;
          }}
        >
          <CardLifecycleProvider>
            <RealtimeFeedHubProvider>
              <_WindowedFeedList
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
                onCenterChange={handleCenterChange}
                reelsMode={reelsMode}
                lyricDataMap={lyricDataMap}
              />
            </RealtimeFeedHubProvider>
          </CardLifecycleProvider>
        </div>
      )}

      {reelsMode && (
        <>
          <button
            onClick={() => canCreate && setReelsComposerOpen(true)}
            className="fixed top-3 right-3 z-[60] flex items-center justify-center rounded-full transition-all"
            style={{
              width: 40,
              height: 40,
              background: canCreate ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
              backdropFilter: "blur(8px)",
            }}
          >
            {canCreate ? (
              <Plus size={18} className="text-white/80" />
            ) : (
              <div className="flex gap-0.5">
                {Array.from({ length: required }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: i < credits ? "#22c55e" : "rgba(255,255,255,0.2)" }}
                  />
                ))}
              </div>
            )}
          </button>

          <div className="fixed inset-x-0 bottom-0 z-[70]">
            <div className="relative">
              <PanelShell isOpen={reelsComposerOpen} variant="embedded" maxHeight="60%">
                <div className="px-4 pt-3 pb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono tracking-wide uppercase text-white/40">Post your song</span>
                    <button onClick={() => setReelsComposerOpen(false)} className="p-1 text-white/30 hover:text-white/60">
                      <X size={14} />
                    </button>
                  </div>
                  <SongFitInlineComposer
                    onPostCreated={() => {
                      setReelsComposerOpen(false);
                      fetchPosts();
                    }}
                    onNavigateLyricDance={() => setReelsComposerOpen(false)}
                  />
                </div>
              </PanelShell>
            </div>
          </div>
        </>
      )}

      <SongFitComments
        postId={commentPostId}
        onClose={() => setCommentPostId(null)}
        onCommentAdded={async (pid) => {
          const { data } = await supabase
            .from("songfit_posts")
            .select("comments_count")
            .eq("id", pid)
            .maybeSingle();
          if (data)
            setPosts((prev) =>
              prev.map((p) =>
                p.id === pid
                  ? { ...p, comments_count: data.comments_count }
                  : p,
              ),
            );
        }}
      />
      <SongFitLikesList
        postId={likesPostId}
        onClose={() => setLikesPostId(null)}
      />

      {showFloatingAnchor && !reelsMode && (
        <button
          onClick={() => {
            const scrollEl = document.getElementById(
              "songfit-scroll-container",
            );
            if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="sticky bottom-6 left-1/2 -translate-x-1/2 z-[500] border border-border/50 bg-background text-foreground/70 hover:text-foreground hover:border-border text-[11px] font-mono tracking-wide px-5 py-2 rounded-full shadow-sm transition-all duration-200"
        >
          + Drop Your Song
        </button>
      )}
    </div>
  );
}
