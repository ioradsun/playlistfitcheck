/**
 * useFeedPosts — all FMLY feed data in one hook.
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
import type { FmlyPost, FeedView, BillboardMode } from "./types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import {
  consumeFeedShellPrefetch,
  consumeFeedFullPrefetch,
  FEED_SHELL_COLUMNS,
  getCachedFeed,
  getCachedLyricData,
  getCachedLyricScene,
  getCachedLyricText,
  cacheWrite,
} from "@/lib/prefetch";
import { preloadImage } from "@/lib/imagePreloadCache";
import { cdnImage } from "@/lib/cdnImage";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";

const PAGE_SIZE = 20;

const POST_SELECT =
  "id, user_id, project_id, caption, created_at, status, " +
  "profiles:user_id(display_name, avatar_url, spotify_artist_id, spotify_embed_url, wallet_address, is_verified), " +
  "lyric_projects(id, title, artist_name, artist_slug, url_slug, audio_url, album_art_url, spotify_track_id, palette, cinematic_direction, beat_grid, section_images, auto_palettes, lines, words, physics_spec, empowerment_promise)";

// ── Filter helpers ──────────────────────────────────────────────────────────
function matchesView(p: FmlyPost, view: FeedView): boolean {
  if (view === "all" || view === "billboard") return true;
  if (view === "now_streaming") return !!p.lyric_projects?.spotify_track_id;
  if (view === "in_studio") return !!p.project_id;
  return true;
}

function withInstrumentalFlag(p: FmlyPost): FmlyPost {
  const lines = (p as any).lyric_projects?.lines;
  (p as FmlyPost).is_instrumental = Array.isArray(lines) ? lines.length === 0 : true;
  return p;
}

function hydratePosts(rows: FmlyPost[]): FmlyPost[] {
  for (const row of rows) withInstrumentalFlag(row);
  return rows;
}

/**
 * Merge incoming lyric_projects rows into the map. Returns the next map and
 * an object of entries that should be written to the split localStorage caches.
 * Side effect: triggers preloadImage() for section_images + album_art.
 */
function hydrateLyricRows(
  posts: FmlyPost[],
  currentMap: Map<string, LyricDanceData>,
): { nextMap: Map<string, LyricDanceData>; cachePatch: Record<string, LyricDanceData>; grew: boolean } {
  const nextMap = new Map(currentMap);
  const cachePatch: Record<string, LyricDanceData> = {};

  for (const post of posts) {
    const lp = (post as any).lyric_projects;
    const lpHasLines = Array.isArray(lp?.lines) && lp.lines.length > 0;
    if (!lp?.id || !lpHasLines) continue;

    const existingRow = nextMap.get(lp.id) as any;
    // Skip unless this row is an upgrade (existing lacks cinematic_direction and new one has it)
    if (existingRow && (existingRow.cinematic_direction || !lp.cinematic_direction)) continue;

    const merged = {
      ...lp,
      cinematic_direction: lp.cinematic_direction
        ? normalizeCinematicDirection(lp.cinematic_direction)
        : null,
    } as LyricDanceData;
    nextMap.set(lp.id, merged);
    cachePatch[lp.id] = merged;

    // Preload the CDN-resized (WebP) variants — that's what the shell + engine
    // will actually consume. Raw PNGs are 1.5 MB; transformed are ~30–100 KB.
    (lp.section_images ?? []).filter(Boolean).forEach((url: string) => preloadImage(cdnImage(url, "live")));
    if (lp.album_art_url) preloadImage(cdnImage(lp.album_art_url, "live"));
  }

  return { nextMap, cachePatch, grew: nextMap.size > currentMap.size };
}

/**
 * Inject <link rel="preload" as="image"> for a URL — elevates resource priority
 * above all other page fetches. Deduped via a module-level Set.
 */
const injectedPreloadLinks = new Set<string>();
function injectImagePreloadLink(url: string): void {
  if (typeof document === "undefined" || !url || injectedPreloadLinks.has(url)) return;
  injectedPreloadLinks.add(url);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  // No crossOrigin: matches the plain <img> consumer in LyricDanceShell.
  // Setting crossOrigin="anonymous" here would create a CORS-mode preload
  // that the no-CORS <img> tag can't reuse, triggering the
  // "credentials mode does not match" warning and a duplicate fetch.
  (link as any).fetchPriority = "high";
  document.head.appendChild(link);
}

/**
 * Prioritize poster decodes for the top-of-feed cards.
 * Top 3 also get <link rel="preload"> injected to elevate above all page resources.
 */
function preloadFirstVisible(posts: FmlyPost[], count = 3): void {
  posts.slice(0, count).forEach((post) => {
    const lp = (post as any).lyric_projects;
    const rawPoster = lp?.section_images?.[0] || lp?.album_art_url;
    const poster = rawPoster ? cdnImage(rawPoster, "live") : null;
    if (poster) injectImagePreloadLink(poster);
    if (lp?.album_art_url) void preloadImage(cdnImage(lp.album_art_url, "live"), { priority: "high" });
    if (lp?.section_images?.[0]) void preloadImage(cdnImage(lp.section_images[0], "live"), { priority: "high" });
  });
  posts.slice(count).forEach((post) => {
    const lp = (post as any).lyric_projects;
    if (lp?.album_art_url) void preloadImage(cdnImage(lp.album_art_url, "live"));
    if (lp?.section_images?.[0]) void preloadImage(cdnImage(lp.section_images[0], "live"));
  });
}

// ── Billboard scoring ───────────────────────────────────────────────────────
async function scoreBillboard(
  mode: BillboardMode,
): Promise<{ posts: FmlyPost[]; signalMap: Record<string, { total: number; replay_yes: number; saves_count: number; signal_velocity: number }> }> {
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

  const posts = (pool ?? []) as unknown as FmlyPost[];
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
    posts: hydratePosts(top40.map((s, i) => ({ ...s.post, current_rank: i + 1 }))),
    signalMap,
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────
export interface FeedState {
  posts: FmlyPost[];
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: FmlyPost[];
  searchLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pendingNewCount: number;
  feedView: FeedView;
  billboardMode: BillboardMode;
  artistFilter: string | null;
  lyricDataMap: Map<string, LyricDanceData>;

  setFeedView: (v: FeedView) => void;
  setBillboardMode: (m: BillboardMode) => void;
  clearArtistFilter: () => void;
  loadMore: () => Promise<void>;
  consumeNewDrops: () => void;
}

export function useFeedPosts(opts?: { artistFilter?: string | null }): FeedState {
  const { user } = useAuth();
  const artistFilter = opts?.artistFilter ?? null;

  // ── Core state ──
  const [posts, setPosts] = useState<FmlyPost[]>(() => {
    const cached = getCachedFeed();
    return cached?.length ? hydratePosts(cached as unknown as FmlyPost[]) : [];
  });
  const [loading, setLoading] = useState(() => !getCachedFeed()?.length);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<FmlyPost[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);

  // ── Feed controls ──
  const [feedView, setFeedView] = useState<FeedView>("all");
  const [billboardMode, setBillboardMode] = useState<BillboardMode>("this_week");


  // ── Lyric dance data ──
  const [lyricDataMap, setLyricDataMap] = useState<Map<string, LyricDanceData>>(() => {
    const textCached = getCachedLyricText() ?? {};
    const sceneCached = getCachedLyricScene() ?? {};
    const legacyCached = getCachedLyricData() ?? {};
    const mergedCached = { ...legacyCached, ...textCached };
    for (const [id, scene] of Object.entries(sceneCached)) {
      mergedCached[id] = { ...(mergedCached[id] ?? {}), ...(scene as Record<string, unknown>) };
    }
    if (Object.keys(mergedCached).length === 0) return new Map();
    const map = new Map<string, LyricDanceData>();
    for (const [id, row] of Object.entries(mergedCached)) map.set(id, row as LyricDanceData);
    return map;
  });

  const mergeLyricCaches = useCallback((rows: Record<string, LyricDanceData>) => {
    if (Object.keys(rows).length === 0) return;
    const textExisting = getCachedLyricText() ?? {};
    const sceneExisting = getCachedLyricScene() ?? {};
    const textPatch: Record<string, any> = {};
    const scenePatch: Record<string, any> = {};
    for (const [id, row] of Object.entries(rows)) {
      textPatch[id] = {
        id,
        lines: (row as any).lines,
        words: (row as any).words,
        audio_url: (row as any).audio_url,
        title: (row as any).title,
        artist_name: (row as any).artist_name,
        album_art_url: (row as any).album_art_url,
        spotify_track_id: (row as any).spotify_track_id,
      };
      if ((row as any).cinematic_direction) {
        scenePatch[id] = {
          id,
          cinematic_direction: (row as any).cinematic_direction,
          section_images: (row as any).section_images,
          palette: (row as any).palette,
          auto_palettes: (row as any).auto_palettes,
          beat_grid: (row as any).beat_grid,
          physics_spec: (row as any).physics_spec,
          empowerment_promise: (row as any).empowerment_promise,
        };
      }
    }
    cacheWrite("lyric_text", { ...textExisting, ...textPatch });
    if (Object.keys(scenePatch).length > 0) {
      cacheWrite("lyric_scene", { ...sceneExisting, ...scenePatch });
    }
  }, []);

  // ── Refs for stable callbacks ──
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const newestRef = useRef<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fetchPosts: initial load & refresh ────────────────────────────────
  const fetchPosts = useCallback(async () => {
    
    if (feedView === "billboard" && !artistFilter) {
      if (posts.length === 0) setLoading(true);
      const { posts: billboardPosts } = await scoreBillboard(billboardMode);
      setPosts(billboardPosts);
      setHasMore(false);
      setLoading(false);
      setPendingNewCount(0);

      // scoreBillboard fetches with POST_SELECT (full columns), so each row
      // already contains lines/words/beat_grid/cinematic_direction. Hydrate
      // directly instead of letting LyricDanceEmbed's fallback fetch
      // re-request the same data per-card when each becomes primary.
      const { nextMap, cachePatch, grew } = hydrateLyricRows(billboardPosts, lyricDataMap);
      if (Object.keys(cachePatch).length > 0) mergeLyricCaches(cachePatch);
      if (grew) setLyricDataMap(nextMap);

      return;
    }

    // Non-billboard path
    if (posts.length === 0) setLoading(true);

    // Stage 1: Shell query — render posters quickly while full lyric rows hydrate.
    const shellPrefetched = consumeFeedShellPrefetch();
    const { data: shellRaw } = shellPrefetched
      ? await shellPrefetched
      : await (() => {
          let q = supabase
            .from("feed_posts" as any)
            .select(FEED_SHELL_COLUMNS)
            .eq("status", "live")
            .limit(PAGE_SIZE)
            .order("created_at", { ascending: false });
          if (artistFilter) q = q.eq("user_id", artistFilter);
          return q;
        })();

    const shellPosts = (shellRaw ?? []) as unknown as FmlyPost[];
    const shellFiltered = shellPosts.filter((p) => matchesView(p, feedView));
    const shellNormalized = hydratePosts(shellFiltered);

    // ── Only update if data actually changed — prevents cache→fresh double render ──
    // On warm-cache visits, the prefetch returns the same posts that were already
    // loaded from localStorage. Without this check, every card re-renders with
    // identical data but new object references, causing a visible flash.
    setPosts((prev) => {
      if (
        prev.length === shellNormalized.length &&
        prev.length > 0 &&
        prev.every((p, i) => p.id === shellNormalized[i].id)
      ) {
        return prev; // Same posts, same order — keep reference stable
      }
      return shellNormalized;
    });
    cursorRef.current = shellNormalized[shellNormalized.length - 1]?.created_at ?? null;
    newestRef.current = shellNormalized[0]?.created_at ?? null;
    setHasMore(shellPosts.length === PAGE_SIZE);
    setLoading(false);
    setPendingNewCount(0);
    preloadFirstVisible(shellNormalized);

    // Stage 2: Full query — hydrate lyric rows so cards can go live.
    const fullPrefetched = consumeFeedFullPrefetch();
    const { data: fullRaw } = fullPrefetched
      ? await fullPrefetched
      : await (() => {
          let q = supabase
            .from("feed_posts" as any)
            .select(POST_SELECT)
            .eq("status", "live")
            .limit(PAGE_SIZE)
            .order("created_at", { ascending: false });
          if (artistFilter) q = q.eq("user_id", artistFilter);
          return q;
        })();

    const fullPosts = (fullRaw ?? []) as unknown as FmlyPost[];
    const fullFiltered = fullPosts.filter((p) => matchesView(p, feedView));
    const fullNormalized = hydratePosts(fullFiltered);

    setPosts((prev) => {
      if (
        prev.length === fullNormalized.length &&
        prev.length > 0 &&
        prev.every((p, i) => p.id === fullNormalized[i].id)
      ) {
        return prev;
      }
      return fullNormalized;
    });

    const { nextMap, cachePatch, grew } = hydrateLyricRows(fullFiltered, lyricDataMap);
    if (Object.keys(cachePatch).length > 0) mergeLyricCaches(cachePatch);
    if (grew) setLyricDataMap(nextMap);

    try {
      cacheWrite("feed_posts", fullPosts);
    } catch {}

    // Font preloading handled by prefetch.ts (module eval) and engine (kickFontStabilizationLoad).
    // ensureFontReady deduplicates, so this was a no-op burning dynamic import overhead.
  }, [feedView, billboardMode, lyricDataMap, mergeLyricCaches, posts.length, artistFilter]);

  // ── loadMore: cursor-based pagination ─────────────────────────────────
  const loadMore = useCallback(async () => {
    if ((feedView === "billboard" && !artistFilter) || loadingMoreRef.current || !cursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      let query = supabase
        .from("feed_posts" as any)
        .select(POST_SELECT)
        .eq("status", "live")
        .lt("created_at", cursorRef.current)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (artistFilter) query = query.eq("user_id", artistFilter);
      const { data } = await query;

      let nextPosts = (data ?? []) as unknown as FmlyPost[];
      nextPosts = nextPosts.filter((p) => matchesView(p, feedView));

      if (nextPosts.length > 0) {
        const normalized = hydratePosts(nextPosts);

        // Render new cards immediately
        setPosts((prev) => {
          const merged = [...prev, ...normalized];
          cursorRef.current = merged[merged.length - 1]?.created_at ?? null;
          return merged;
        });

        const { nextMap, cachePatch, grew } = hydrateLyricRows(normalized, lyricDataMap);
        if (Object.keys(cachePatch).length > 0) mergeLyricCaches(cachePatch);
        if (grew) setLyricDataMap(nextMap);
        preloadFirstVisible(normalized);
      }
      setHasMore((data ?? []).length === PAGE_SIZE);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedView, lyricDataMap, mergeLyricCaches, artistFilter]);

  // ── Initial fetch + re-fetch on view/mode change ──────────────────────
  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  // ── Realtime: count new posts ─────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("fmly-new-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_posts", filter: "status=eq.live" },
        (payload) => {
          const newRow = payload.new as { created_at?: string; user_id?: string };
          if (!newRow?.created_at) return;
          if (artistFilter && newRow.user_id !== artistFilter) return;
          if (user?.id && newRow.user_id === user.id) return;
          const head = newestRef.current;
          if (head && newRow.created_at <= head) return;
          setPendingNewCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, artistFilter]);

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

        const results = hydratePosts((data ?? []) as unknown as FmlyPost[]);
        setSearchResults(results);

        const { nextMap, cachePatch, grew } = hydrateLyricRows(results, lyricDataMap);
        if (Object.keys(cachePatch).length > 0) mergeLyricCaches(cachePatch);
        if (grew) setLyricDataMap(nextMap);
        preloadFirstVisible(results);
      } catch (err) {
        console.error("[useFeedPosts] search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm, lyricDataMap, mergeLyricCaches]);

  // ── Dance-published event ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => void fetchPosts();
    window.addEventListener("fmly:dance-published", handler);
    return () => window.removeEventListener("fmly:dance-published", handler);
  }, [fetchPosts]);

  // ── Public API ────────────────────────────────────────────────────────
  const consumeNewDrops = useCallback(() => {
    setPendingNewCount(0);
    void fetchPosts();
  }, [fetchPosts]);

  const clearArtistFilter = useCallback(() => {}, []);

  return {
    posts,
    loading,
    searchTerm,
    setSearchTerm,
    searchResults,
    searchLoading,
    loadingMore,
    hasMore,
    pendingNewCount,
    feedView,
    billboardMode,
    artistFilter,
    lyricDataMap,
    setFeedView,
    setBillboardMode,
    clearArtistFilter,
    loadMore,
    consumeNewDrops,
  };
}
