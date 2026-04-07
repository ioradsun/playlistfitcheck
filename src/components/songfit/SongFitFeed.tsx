/**
 * SongFitFeed — CrowdFit feed.
 *
 * Clean rewrite. IntersectionObserver for infinite scroll + card lifecycle.
 * Supports reels mode (full-screen snap scroll) and standard mode.
 * PostCommentPanel is the sole comment UX (inline in card).
 */
import { memo, useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeedPosts } from "./useFeedPosts";
import { PlusMenu } from "./PlusMenu";
import { SongFitPostCard } from "./SongFitPostCard";
import { BillboardToggle } from "./BillboardToggle";
import { audioController } from "@/lib/audioController";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { logImpression } from "@/lib/engagementTracking";
import { cn } from "@/lib/utils";

// ── Skeleton ────────────────────────────────────────────────────────────────
function FeedSkeleton({ reelsMode }: { reelsMode: boolean }) {
  if (reelsMode) return <div className="h-[100dvh] snap-start bg-black" />;
  return (
    <div className="space-y-3 pt-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-2 pb-3">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="h-8 w-8 rounded-full bg-white/[0.04]" />
              <div className="h-3 w-32 rounded bg-white/[0.04]" />
            </div>
            <div style={{ height: 320 }} />
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
  );
}

// ── Observed card: two IntersectionObservers ────────────────────────────────
// 1. Wide margin (200px): drives cold/warm lifecycle
// 2. Tight margin (center 20%): reports "I'm at center" to FeedList
const ObservedCard = memo(function ObservedCard({
  post,
  rank,
  onRefresh,
  isBillboard,
  signalData,
  lyricDanceData,
  reelsMode,
  isFirst,
  preload,
  onCenterEnter,
  onCenterLeave,
  cardRefsMap,
  onMeasure,
}: {
  post: any;
  rank?: number;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: any;
  lyricDanceData?: any;
  reelsMode?: boolean;
  isFirst?: boolean;
  preload?: boolean;
  onCenterEnter: (postId: string) => void;
  onCenterLeave: (postId: string) => void;
  cardRefsMap: MutableRefObject<Map<string, HTMLDivElement>>;
  onMeasure?: (postId: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const loggedRef = useRef(false);

  // Register DOM ref for geometric center scoring
  useEffect(() => {
    const el = ref.current;
    if (el) cardRefsMap.current.set(post.id, el);
    return () => {
      cardRefsMap.current.delete(post.id);
    };
  }, [post.id, cardRefsMap]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onMeasure) return;
    const measure = () => onMeasure(post.id, el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [post.id, onMeasure]);

  // Wide observer: visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          if (!loggedRef.current) {
            loggedRef.current = true;
            logImpression(post.id);
          }
        }
      },
      { rootMargin: reelsMode ? "10% 0px" : "200px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, reelsMode]);

  // Tight observer: center detection — only the middle 30% of viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onCenterEnter(post.id);
        else onCenterLeave(post.id);
      },
      { rootMargin: reelsMode ? "-45% 0px -45% 0px" : "-35% 0px -35% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, onCenterEnter, onCenterLeave, reelsMode]);

  return (
    <div ref={ref} className={cn("shrink-0", reelsMode && "h-[100dvh] snap-start")}>
      <SongFitPostCard
        post={post}
        rank={rank}
        onRefresh={onRefresh}
        isBillboard={isBillboard}
        signalData={signalData}
        lyricDanceData={lyricDanceData}
        visible={visible}
        reelsMode={reelsMode}
        isFirst={isFirst}
        preload={preload}
      />
    </div>
  );
});

// ── Feed list ───────────────────────────────────────────────────────────────
function FeedList({
  posts,
  feedView,
  signalMap,
  loadingMore,
  hasMore,
  loadMore,
  onRefresh,
  lyricDataMap,
  reelsMode,
}: {
  posts: any[];
  feedView: string;
  signalMap: any;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  onRefresh: () => void;
  lyricDataMap: Map<string, any>;
  reelsMode: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [preloadId, setPreloadId] = useState<string | null>(null);
  const centerSetRef = useRef<Set<string>>(new Set());
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const WINDOW_RADIUS = 2;
  const windowStart = Math.max(0, activeIndex - WINDOW_RADIUS);
  const windowEnd = Math.min(posts.length - 1, activeIndex + WINDOW_RADIUS);
  const renderedPosts = posts.slice(windowStart, windowEnd + 1);

  const pickBestCandidate = useCallback((): string | null => {
    const set = centerSetRef.current;
    if (set.size === 0) return null;
    if (set.size === 1) return set.values().next().value!;
    const vpCenter = window.innerHeight / 2;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const id of set) {
      const el = cardRefsMap.current.get(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - vpCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }, []);

  const scheduleSettle = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      audioController.setAutoPrimary(pickBestCandidate());
    }, 120);
  }, [pickBestCandidate]);

  const onCenterEnter = useCallback((postId: string) => {
    const idx = posts.findIndex((p) => p.id === postId);
    if (idx >= 0) setActiveIndex(idx);
    centerSetRef.current.add(postId);
    setPreloadId(postId);
    scheduleSettle();
  }, [posts, scheduleSettle]);

  const onCenterLeave = useCallback((postId: string) => {
    centerSetRef.current.delete(postId);
    audioController.clearExplicitIf(postId);
    // If the leaving card was the preload target, pick the last remaining
    setPreloadId((prev) => {
      if (prev !== postId) return prev;
      const remaining = centerSetRef.current;
      if (remaining.size === 0) return null;
      return Array.from(remaining).pop()!;
    });
    scheduleSettle();
  }, [scheduleSettle]);

  const onMeasure = useCallback((postId: string, height: number) => {
    if (height > 0) measuredHeightsRef.current.set(postId, height);
  }, []);

  useEffect(() => {
    if (!reelsMode) return;
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reelsMode]);

  useEffect(() => {
    if (!reelsMode || windowStart <= 0) return;
    const el = topSpacerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveIndex((idx) => Math.max(0, idx - 1));
        }
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reelsMode, windowStart]);

  useEffect(() => {
    if (!reelsMode || windowEnd >= posts.length - 1) return;
    const el = bottomSpacerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveIndex((idx) => Math.min(posts.length - 1, idx + 1));
        }
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reelsMode, windowEnd, posts.length]);

  useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      audioController.setAutoPrimary(null);
    };
  }, []);

  // Infinite scroll sentinel
  useEffect(() => {
    if (feedView === "billboard" || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feedView, hasMore, loadingMore, loadMore]);

  const estimateHeightAtIndex = useCallback((idx: number): number => {
    if (reelsMode) return viewportHeight || 0;
    const post = posts[idx];
    if (!post) return 420;
    return measuredHeightsRef.current.get(post.id) ?? 420;
  }, [reelsMode, viewportHeight, posts]);

  const topSpacerHeight = Array.from({ length: windowStart }).reduce((sum, _, idx) => sum + estimateHeightAtIndex(idx), 0);
  const bottomSpacerHeight = Array.from({ length: Math.max(0, posts.length - windowEnd - 1) }).reduce(
    (sum, _, idx) => sum + estimateHeightAtIndex(windowEnd + 1 + idx),
    0,
  );

  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {windowStart > 0 && <div ref={topSpacerRef} style={{ height: topSpacerHeight }} />}

      {renderedPosts.map((post, offset) => {
        const idx = windowStart + offset;
        return (
        <ObservedCard
          key={post.id}
          post={post}
          rank={feedView === "billboard" ? idx + 1 : undefined}
          onRefresh={onRefresh}
          isBillboard={feedView === "billboard"}
          signalData={feedView === "billboard" ? signalMap[post.id] : undefined}
          lyricDanceData={post.lyric_dance_id ? lyricDataMap.get(post.lyric_dance_id) ?? null : null}
          reelsMode={reelsMode}
          isFirst={idx === 0}
          preload={post.id === preloadId}
          cardRefsMap={cardRefsMap}
          onCenterEnter={onCenterEnter}
          onCenterLeave={onCenterLeave}
          onMeasure={onMeasure}
        />
      );
      })}

      {windowEnd < posts.length - 1 && <div ref={bottomSpacerRef} style={{ height: bottomSpacerHeight }} />}

      {hasMore && feedView !== "billboard" && <div ref={sentinelRef} className="h-1" />}

      {loadingMore && (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ── Main feed ───────────────────────────────────────────────────────────────
interface SongFitFeedProps {
  reelsMode?: boolean;
}

export function SongFitFeed({ reelsMode = false }: SongFitFeedProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasFadedIn = useRef(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const feed = useFeedPosts();
  const hasSearchQuery = feed.searchTerm.trim().length > 0;
  const searchUiVisible = reelsMode ? (searchOpen || searchFocused || hasSearchQuery) : (searchFocused || hasSearchQuery);
  const displayPosts = hasSearchQuery
    ? (feed.searchLoading && feed.searchResults.length === 0 ? feed.posts : feed.searchResults)
    : feed.posts;
  const displayLoading = !hasSearchQuery && feed.loading && feed.posts.length === 0;

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    focusSearchInput();
  }, [focusSearchInput]);

  const clearSearch = useCallback(() => {
    feed.setSearchTerm("");
    setSearchFocused(false);
    if (reelsMode) setSearchOpen(false);
    window.requestAnimationFrame(() => searchInputRef.current?.blur());
  }, [feed, reelsMode]);

  const handleLoadNewDrops = useCallback(() => {
    feed.consumeNewDrops();
    document.getElementById("songfit-scroll-container")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [feed]);

  // Unlock audio on first touch anywhere in the feed
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      // One-shot: remove after first fire
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
    };
    document.addEventListener("touchstart", handler, { once: true, passive: true });
    document.addEventListener("click", handler, { once: true });
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
    };
  }, []);

  return (
    <div className={reelsMode ? "w-full" : "w-full max-w-[470px] mx-auto"}>
      {reelsMode ? (
        <>
           <div className="fixed top-14 left-0 right-0 z-[60] flex justify-center pointer-events-none">
             <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/80 backdrop-blur-md px-1">
                {!searchUiVisible && (
                  <>
                    <BillboardToggle
                      view={feed.feedView}
                      onViewChange={feed.setFeedView}
                      billboardMode={feed.billboardMode}
                      onModeChange={feed.setBillboardMode}
                      isLoggedIn={!!user}
                      compact
                    />
                    <div className="h-4 w-px bg-border/60" />
                  </>
                )}

                 {!searchUiVisible && (
                   <div className="flex items-center">
                     <button
                       type="button"
                       onClick={openSearch}
                       className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                       aria-label="Open search"
                     >
                       <Search size={14} />
                     </button>
                     <button
                       onClick={() => setPlusOpen((v) => !v)}
                       className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                       aria-label="Add music"
                     >
                       <Plus size={16} />
                     </button>
                     <AnimatePresence>
                       {plusOpen && (
                         <motion.div
                           initial={{ opacity: 0, width: 0 }}
                           animate={{ opacity: 1, width: "auto" }}
                           exit={{ opacity: 0, width: 0 }}
                           transition={{ duration: 0.15, ease: "easeOut" }}
                           className="flex items-center gap-1 overflow-hidden"
                         >
                           <button
                             onClick={() => { setPlusOpen(false); navigate("/LyricFit?mode=song"); }}
                             className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                           >
                             song
                           </button>
                           <button
                             onClick={() => { setPlusOpen(false); navigate("/LyricFit?mode=beat"); }}
                             className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                           >
                             beat
                           </button>
                         </motion.div>
                       )}
                     </AnimatePresence>
                   </div>
                 )}

                 {searchUiVisible && (
                   <div className="flex items-center w-[220px] bg-card/70 px-2 rounded-full">
                     <button
                       type="button"
                       onClick={clearSearch}
                       className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                       aria-label="Close search"
                     >
                       <X size={14} />
                     </button>
                     <input
                       ref={searchInputRef}
                       value={feed.searchTerm}
                       onChange={(e) => feed.setSearchTerm(e.target.value)}
                       onFocus={() => {
                         setSearchFocused(true);
                         setSearchOpen(true);
                       }}
                       onBlur={() => {
                         setSearchFocused(false);
                         if (!feed.searchTerm.trim()) setSearchOpen(false);
                       }}
                       placeholder="Search artists or songs"
                       className="w-full bg-transparent py-2 pr-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
                       onKeyDown={(e) => {
                         if (e.key === "Escape") clearSearch();
                       }}
                     />
                   </div>
                 )}
             </div>
           </div>
           {hasSearchQuery && (
             <div className="fixed top-14 left-0 right-0 z-[59] flex justify-center pointer-events-none">
               <div className="pointer-events-auto rounded-full bg-background/80 backdrop-blur-md px-3 py-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
                 {feed.searchLoading
                   ? `Searching "${feed.searchTerm.trim()}"...`
                   : `${feed.searchResults.length} result${feed.searchResults.length !== 1 ? "s" : ""} for "${feed.searchTerm.trim()}"`}
               </div>
             </div>
           )}
           {feed.pendingNewCount > 0 && !feed.loading && (
             <div className="fixed top-14 left-0 right-0 z-[58] flex justify-center pointer-events-none">
               <button
                 onClick={handleLoadNewDrops}
                 className="pointer-events-auto rounded-full bg-background/80 backdrop-blur-md px-4 py-1.5 text-[10px] font-mono tracking-[0.12em] text-primary transition-colors hover:text-primary/80"
               >
                 {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
               </button>
             </div>
           )}
        </>
      ) : (
        <div className="border-b border-border/40">
          <div className="flex items-center justify-center px-3 py-2">
            <div className="flex w-full items-center justify-center gap-2">
              {!searchUiVisible && (
                <>
                  <BillboardToggle
                    view={feed.feedView}
                    onViewChange={feed.setFeedView}
                    billboardMode={feed.billboardMode}
                    onModeChange={feed.setBillboardMode}
                    isLoggedIn={!!user}
                  />
                  <div className="h-4 w-px bg-border/60" />
                </>
              )}

              <div
                className={cn(
                  "flex items-center overflow-hidden rounded-full transition-all duration-200",
                  searchUiVisible ? "w-[220px] bg-card/70 px-2" : "w-10 px-0.5",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (searchUiVisible || hasSearchQuery) clearSearch();
                    else openSearch();
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={searchUiVisible || hasSearchQuery ? "Close search" : "Open search"}
                >
                  {searchUiVisible || hasSearchQuery ? <X size={14} /> : <Search size={14} />}
                </button>
                <input
                  ref={searchInputRef}
                  value={feed.searchTerm}
                  onChange={(e) => feed.setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search artists or songs"
                  className={cn(
                    "w-full bg-transparent py-2 pr-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground transition-opacity",
                    searchUiVisible ? "opacity-100" : "pointer-events-none w-0 opacity-0",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clearSearch();
                  }}
                />
              </div>

              {!searchUiVisible && (
                <>
                  <div className="h-4 w-px bg-border/60" />
                  <button
                    onClick={() => setPlusOpen((v) => !v)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Add music"
                  >
                    <Plus size={16} />
                  </button>
                  <AnimatePresence>
                    {plusOpen && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex items-center gap-1 overflow-hidden"
                      >
                        <button
                          onClick={() => { setPlusOpen(false); navigate("/LyricFit?mode=song"); }}
                          className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                        >
                          song
                        </button>
                        <button
                          onClick={() => { setPlusOpen(false); navigate("/LyricFit?mode=beat"); }}
                          className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                        >
                          beat
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>

          {hasSearchQuery && (
            <div className="px-3 pb-2 text-center font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
              {feed.searchLoading
                ? `Searching “${feed.searchTerm.trim()}”...`
                : `${feed.searchResults.length} result${feed.searchResults.length !== 1 ? "s" : ""} for “${feed.searchTerm.trim()}”`}
            </div>
          )}
        </div>
      )}

      {feed.pendingNewCount > 0 && !feed.loading && !reelsMode && (
        <button
          onClick={handleLoadNewDrops}
          className="w-full border-b border-border/30 py-2 text-center text-[11px] font-mono tracking-[0.1em] text-primary transition-colors hover:text-primary/80"
        >
          {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
        </button>
      )}

      {displayLoading ? (
        (() => { console.log("[SongFitFeed] rendering skeleton, loading=true"); return null; })()
        || <FeedSkeleton reelsMode={reelsMode} />
      ) : displayPosts.length === 0 ? (
        (() => { console.log("[SongFitFeed] rendering empty state, posts.length=0"); return null; })()
        || <div className="space-y-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {hasSearchQuery
              ? `No results for “${feed.searchTerm.trim()}”`
              : "No live submissions yet. Be the first!"}
          </p>
        </div>
      ) : (
        <div
          style={{ animation: hasFadedIn.current ? "none" : "fadeIn 0.3s ease forwards" }}
          ref={() => { hasFadedIn.current = true; }}
        >
          <style>{"@keyframes fadeIn{from{opacity:0}to{opacity:1}}"}</style>
          <FeedList
            posts={displayPosts}
            feedView={feed.feedView}
            signalMap={feed.signalMap}
            loadingMore={hasSearchQuery ? false : feed.loadingMore}
            hasMore={hasSearchQuery ? false : feed.hasMore}
            loadMore={hasSearchQuery ? async () => {} : feed.loadMore}
            onRefresh={feed.refresh}
            lyricDataMap={feed.lyricDataMap}
            reelsMode={reelsMode}
          />
        </div>
      )}

    </div>
  );
}
