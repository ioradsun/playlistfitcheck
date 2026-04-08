/**
 * useFeedPosts — all CrowdFit feed data in one hook.
 *
 * Responsibilities:
 *  - Initial fetch (with optional prefetch consumption)
 *  - Cursor-based infinite scroll (loadMore)
 *  - Feed view filtering (all / now_streaming / in_studio)
 *  - Billboard scoring (client-side, from reviews/comments/follows/saves)
 *  - Lyric dance data hydration (full columns with cached reuse)
 *  - Realtime new-post counter
 *  - Like/save state hydration for logged-in users
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SongFitPost, FeedView, BillboardMode } from "./types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { consumeFeedPrefetch, consumeLyricDataPrefetch, getCachedFeed, getCachedLyricData, cacheWrite } from "@/lib/prefetch";
import { preloadImage } from "@/lib/imagePreloadCache";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";

const PAGE_SIZE = 20;

const POST_SELECT =
  "*, profiles:user_id(display_name, avatar_url, spotify_artist_id, wallet_address, is_verified)," +
  "lyric_projects(title, artist_name, artist_slug, url_slug, audio_url, album_art_url, spotify_track_id, palette, cinematic_direction, beat_grid, section_images)";

// ── Filter helpers ──────────────────────────────────────────────────────────
function matchesView(p: SongFitPost, view: FeedView): boolean {
  if (view === "all" || view === "billboard") return true;
  if (view === "now_streaming") return !!p.spotify_track_id;
  if (view === "in_studio") return !!p.project_id;
  return true;
}

function hydrateDefaults(p: SongFitPost): SongFitPost {
  return { ...p, user_has_liked: false, user_has_saved: false, saves_count: 0 };
}

// ── Billboard scoring ───────────────────────────────────────────────────────
async function scoreBillboard(
  mode: BillboardMode,
): Promise<{ posts: SongFitPost[]; signalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }> }> {
  let cutoff: string | null = null;
  let ceiling: string | null = null;
  if (mode === "this_week") cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  else if (mode === "last_week") {
    cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    ceiling = new Date(Date.now() - 7 * 86_400_000).toISOString();
  }

  const { data: pool } = await supabase
    .from("feed_posts" as any)
    .select(POST_SELECT)
    .eq("status", "live")
    .limit(100)
    .order("created_at", { ascending: false });

  const posts = (pool ?? []) as unknown as SongFitPost[];
  if (posts.length === 0) return { posts: [], signalMap: {} };

  const postIds = posts.map((p) => p.id);
  const ownerIds = [...new Set(posts.map((p) => p.user_id))];

  const applyWindow = (q: any) => {
    if (cutoff) q = q.gte("created_at", cutoff);
    if (ceiling) q = q.lte("created_at", ceiling);
    return q;
  };

  const [reviewsRes, commentsRes, followsRes, savesRes] = await Promise.all([
    applyWindow(supabase.from("feed_hook_reviews" as any).select("post_id, would_replay").in("post_id", postIds)),
    applyWindow(supabase.from("feed_comments" as any).select("post_id").in("post_id", postIds)),
    applyWindow(supabase.from("songfit_follows").select("followed_user_id").in("followed_user_id", ownerIds)),
    applyWindow(supabase.from("feed_saves" as any).select("post_id").in("post_id", postIds)),
  ]);

  // Aggregate signals
  const hookMap: Record<string, { run_it_back: number; skip: number; total: number; replay_yes: number }> = {};
  for (const r of reviewsRes.data ?? []) {
    if (!hookMap[r.post_id]) hookMap[r.post_id] = { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
    hookMap[r.post_id].total++;
    if (r.would_replay) { hookMap[r.post_id].run_it_back++; hookMap[r.post_id].replay_yes++; }
    else hookMap[r.post_id].skip++;
  }
  const commentMap: Record<string, number> = {};
  for (const c of commentsRes.data ?? []) commentMap[c.post_id] = (commentMap[c.post_id] ?? 0) + 1;
  const followByOwner: Record<string, number> = {};
  for (const f of followsRes.data ?? []) followByOwner[f.followed_user_id] = (followByOwner[f.followed_user_id] ?? 0) + 1;
  const savesMap: Record<string, number> = {};
  for (const s of savesRes.data ?? []) savesMap[s.post_id] = (savesMap[s.post_id] ?? 0) + 1;

  const scored = posts.map((p) => {
    const h = hookMap[p.id] ?? { run_it_back: 0, skip: 0, total: 0, replay_yes: 0 };
    const velocity = h.run_it_back + 3 * (commentMap[p.id] ?? 0) + 8 * (followByOwner[p.user_id] ?? 0) + 12 * (savesMap[p.id] ?? 0) - 2 * h.skip;
    return { post: p, velocity, h, saves: savesMap[p.id] ?? 0 };
  });
  scored.sort((a, b) => b.velocity - a.velocity);

  const top40 = scored.slice(0, 40);
  const signalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }> = {};
  for (const s of top40) {
    signalMap[s.post.id] = { total: s.h.total, replay_yes: s.h.replay_yes, saves_count: s.saves, signal_velocity: s.velocity };
  }

  return {
    posts: top40.map((s, i) => ({ ...s.post, current_rank: i + 1 })),
    signalMap,
  };
}

// ── Lyric data fetching ─────────────────────────────────────────────────────
// Fetch full lyric columns for all cards so player-ready fields are present.

const LYRIC_FULL_COLUMNS =
  "id,user_id,artist_slug,url_slug,artist_name,title,audio_url,lines,words," +
  "physics_spec,cinematic_direction,section_images," +
  "auto_palettes,beat_grid,palette,album_art_url,empowerment_promise,spotify_track_id";

async function fetchLyricData(
  ids: string[],
  existingMap: Map<string, LyricDanceData>,
): Promise<Map<string, LyricDanceData>> {
  if (ids.length === 0) return new Map();

  const map = new Map(existingMap);

  // Fetch full columns for all IDs that don't already have cinematic_direction
  const needed = ids.filter((id) => !(map.get(id) as any)?.cinematic_direction);

  if (needed.length > 0) {
    const { data: rows } = await supabase
      .from("lyric_projects" as any)
      .select(LYRIC_FULL_COLUMNS)
      .in("id", needed);

    const cacheObj: Record<string, any> = {};
    for (const row of ((rows ?? []) as any[])) {
      const merged = {
        ...row,
        cinematic_direction: row.cinematic_direction
          ? normalizeCinematicDirection(row.cinematic_direction)
          : row.cinematic_direction,
      } as LyricDanceData;
      map.set(row.id, merged);
      cacheObj[row.id] = merged;
    }

    // Cache full rows for next visit
    if (Object.keys(cacheObj).length > 0) {
      const existing = getCachedLyricData() ?? {};
      cacheWrite("lyric_data", { ...existing, ...cacheObj });
    }
  }

  // Preload first section image for all rows
  for (const id of ids) {
    const img = (map.get(id) as any)?.section_images?.[0];
    if (img) preloadImage(img);
  }

  return map;
}


// ── Hook ────────────────────────────────────────────────────────────────────
export interface FeedState {
  posts: SongFitPost[];
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: SongFitPost[];
  searchLoading: boolean;
  isSearching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pendingNewCount: number;
  feedView: FeedView;
  billboardMode: BillboardMode;
  signalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }>;
  lyricDataMap: Map<string, LyricDanceData>;

  setFeedView: (v: FeedView) => void;
  setBillboardMode: (m: BillboardMode) => void;
  loadMore: () => Promise<void>;
  refresh: () => void;
  consumeNewDrops: () => void;
  setPosts: React.Dispatch<React.SetStateAction<SongFitPost[]>>;
}

export function useFeedPosts(): FeedState {
  const { user } = useAuth();

  // ── Core state ──
  const [posts, setPosts] = useState<SongFitPost[]>(() => {
    const cached = getCachedFeed();
    return cached?.length ? (cached as unknown as SongFitPost[]).map(hydrateDefaults) : [];
  });
  const [loading, setLoading] = useState(() => !getCachedFeed()?.length);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SongFitPost[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);

  // ── Feed controls ──
  const [feedView, setFeedView] = useState<FeedView>("all");
  const [billboardMode, setBillboardMode] = useState<BillboardMode>("this_week");

  // ── Billboard signals ──
  const [signalMap, setSignalMap] = useState<Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }>>({});

  // ── Lyric dance data ──
  const [lyricDataMap, setLyricDataMap] = useState<Map<string, LyricDanceData>>(() => {
    const cached = getCachedLyricData();
    if (!cached) return new Map();
    const map = new Map<string, LyricDanceData>();
    for (const [id, row] of Object.entries(cached)) map.set(id, row as LyricDanceData);
    return map;
  });

  // ── Refs for stable callbacks ──
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const newestRef = useRef<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fetchPosts: initial load & refresh ────────────────────────────────
  const fetchPosts = useCallback(async () => {
    console.log("[useFeedPosts] fetchPosts called, feedView:", feedView);
    if (feedView === "billboard") {
      if (posts.length === 0) setLoading(true);
      const result = await scoreBillboard(billboardMode);
      setPosts(result.posts);
      setSignalMap(result.signalMap);
      setHasMore(false);
      setLoading(false);
      setPendingNewCount(0);
      return;
    }

    // Non-billboard path
    if (posts.length === 0) setLoading(true);

    const prefetched = consumeFeedPrefetch();
    const { data: raw } = prefetched
      ? await prefetched
      : await supabase
          .from("feed_posts" as any)
          .select(POST_SELECT)
          .eq("status", "live")
          .limit(PAGE_SIZE)
          .order("created_at", { ascending: false });

    let allPosts = (raw ?? []) as unknown as SongFitPost[];
    console.log("[useFeedPosts] raw posts:", allPosts.length, "feedView:", feedView);
    const filtered = allPosts.filter((p) => matchesView(p, feedView));
    console.log("[useFeedPosts] filtered posts:", filtered.length);
    const normalized = filtered.map(hydrateDefaults);

    // Preload album art for Spotify posts
    filtered
      .filter((p) => !p.project_id && p.album_art_url)
      .forEach((p) => preloadImage(p.album_art_url!));

    // ── Render cards IMMEDIATELY — don't wait for lyric data ──
    setPosts(normalized);
    cursorRef.current = normalized[normalized.length - 1]?.created_at ?? null;
    newestRef.current = normalized[0]?.created_at ?? null;
    setHasMore(allPosts.length === PAGE_SIZE);
    setLoading(false);
    setPendingNewCount(0);

    // ── Fetch lyric data in background — cards show covers while waiting ──
    // On return visits, lyricDataPrefetch has FULL columns for uncached lyric IDs
    // (fired at module eval in parallel with feed posts — zero waterfall).
    const lyricIds = filtered.filter((p) => p.project_id).map((p) => p.project_id as string);
    if (lyricIds.length > 0) {
      // Seed map from parallel prefetch (has cinematic_direction — player-ready)
      const lyricPrefetch = consumeLyricDataPrefetch();
      let seededMap = new Map(lyricDataMap);
      if (lyricPrefetch) {
        const { data: prefetchedRows } = await lyricPrefetch;
        const cacheObj: Record<string, any> = {};
        for (const row of (prefetchedRows ?? []) as any[]) {
          const merged = {
            ...row,
            cinematic_direction: row.cinematic_direction
              ? normalizeCinematicDirection(row.cinematic_direction)
              : row.cinematic_direction,
          } as LyricDanceData;
          seededMap.set(row.id, merged);
          cacheObj[row.id] = merged;
        }
        // Cache prefetched rows so they survive tab switches.
        if (Object.keys(cacheObj).length > 0) {
          const existing = getCachedLyricData() ?? {};
          cacheWrite("lyric_data", { ...existing, ...cacheObj });
        }
      }
      const newMap = await fetchLyricData(lyricIds, seededMap);
      setLyricDataMap(new Map(newMap));
    }
  }, [feedView, billboardMode]);

  // ── loadMore: cursor-based pagination ─────────────────────────────────
  const loadMore = useCallback(async () => {
    if (feedView === "billboard" || loadingMoreRef.current || !cursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const { data } = await supabase
        .from("feed_posts" as any)
        .select(POST_SELECT)
        .eq("status", "live")
        .lt("created_at", cursorRef.current)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      let nextPosts = (data ?? []) as unknown as SongFitPost[];
      nextPosts = nextPosts.filter((p) => matchesView(p, feedView));

      if (nextPosts.length > 0) {
        const normalized = nextPosts.map(hydrateDefaults);

        // Render new cards immediately
        setPosts((prev) => {
          const merged = [...prev, ...normalized];
          cursorRef.current = merged[merged.length - 1]?.created_at ?? null;
          return merged;
        });

        // Fetch lyric data in background
        const newLyricIds = normalized
          .filter((p) => p.project_id && !lyricDataMap.has(p.project_id))
          .map((p) => p.project_id as string);
        if (newLyricIds.length > 0) {
          fetchLyricData(newLyricIds, lyricDataMap).then((newMap) => {
            setLyricDataMap(new Map(newMap));
          });
        }
      }
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedView, lyricDataMap]);

  // ── Initial fetch + re-fetch on view/mode change ──────────────────────
  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  // ── Realtime: count new posts ─────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("crowdfit-new-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_posts", filter: "status=eq.live" },
        (payload) => {
          const newRow = payload.new as { created_at?: string; user_id?: string };
          if (!newRow?.created_at) return;
          if (user?.id && newRow.user_id === user.id) return;
          const head = newestRef.current;
          if (head && newRow.created_at <= head) return;
          setPendingNewCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    const q = searchTerm.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await supabase
          .from("feed_posts" as any)
          .select(POST_SELECT)
          .eq("status", "live")
          .or(`caption.ilike."%${q}%"`)
          .order("created_at", { ascending: false })
          .limit(40);

        const results = ((data ?? []) as unknown as SongFitPost[]).map(hydrateDefaults);
        setSearchResults(results);

        const lyricIds = results
          .filter((p) => p.project_id)
          .map((p) => p.project_id as string);

        if (lyricIds.length > 0) {
          fetchLyricData(lyricIds, lyricDataMap).then((newMap) => {
            setLyricDataMap(newMap);
          });
        }
      } catch (err) {
        console.error("[useFeedPosts] search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm, lyricDataMap]);

  // ── Dance-published event ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => void fetchPosts();
    window.addEventListener("songfit:dance-published", handler);
    return () => window.removeEventListener("songfit:dance-published", handler);
  }, [fetchPosts]);

  // ── Public API ────────────────────────────────────────────────────────
  const refresh = useCallback(() => void fetchPosts(), [fetchPosts]);

  const consumeNewDrops = useCallback(() => {
    setPendingNewCount(0);
    void fetchPosts();
  }, [fetchPosts]);

  return {
    posts,
    loading,
    searchTerm,
    setSearchTerm,
    searchResults,
    searchLoading,
    isSearching: searchTerm.trim().length > 0,
    loadingMore,
    hasMore,
    pendingNewCount,
    feedView,
    billboardMode,
    signalMap,
    lyricDataMap,
    setFeedView,
    setBillboardMode,
    loadMore,
    refresh,
    consumeNewDrops,
    setPosts,
  };
}
