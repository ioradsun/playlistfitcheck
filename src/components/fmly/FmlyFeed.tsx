/**
 * FmlyFeed — the FMLY feed.
 *
 * Uses usePrimaryArbiter (single scroll-driven center-distance check) to pick
 * one card as LIVE at a time by rendering FeedCard with live=true.
 * Non-primary cards render FeedCard with live=false shell behavior.
 * PostCommentPanel is the sole comment UX (inline in card).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeedPosts } from "./useFeedPosts";
import { PlusMenu } from "./PlusMenu";
import { BillboardToggle } from "./BillboardToggle";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { cn } from "@/lib/utils";
import { useFeedWindow } from "@/components/fmly/feed/useFeedWindow";
import { usePrimaryArbiter } from "@/components/fmly/feed/usePrimaryArbiter";
import { usePrefetchNearbyScenes } from "@/components/fmly/feed/usePrefetchNearbyScenes";
import { FeedCard } from "@/components/fmly/feed/FeedCard";
import type { ContentFilter } from "./types";

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

// ── Feed list ───────────────────────────────────────────────────────────────
function FeedList({
  posts,
  feedView,
  loadingMore,
  hasMore,
  loadMore,
  lyricDataMap,
  reelsMode,
}: {
  posts: any[];
  feedView: string;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  lyricDataMap: Map<string, any>;
  reelsMode: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainer = typeof document !== "undefined"
    ? document.getElementById("fmly-feed-scroll")
    : null;
  const supportsCV = typeof CSS !== "undefined"
    && CSS.supports("content-visibility: auto");

  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const feedWindow = useFeedWindow(posts.length, postIds);
  const [explicitPrimaryId, setExplicitPrimaryId] = useState<string | null>(null);
  const explicitSetAtScrollY = useRef<number | null>(null);
  const { primaryId: scrollPrimaryId, closestIndex } = usePrimaryArbiter(
    scrollContainer,
    feedWindow.cardRefs,
    feedWindow.renderedIds,
    postIds,
    feedWindow.renderedIdsVersion,
  );
  const primaryId = explicitPrimaryId ?? scrollPrimaryId;
  const primaryIndex = useMemo(
    () => (primaryId ? postIds.indexOf(primaryId) : null),
    [postIds, primaryId],
  );
  const prefetchPosts = useMemo(
    () => posts.map((post) => ({
      lyric_project: (post.project_id ? lyricDataMap.get(post.project_id) : null) ?? (post as any).lyric_projects,
    })),
    [lyricDataMap, posts],
  );

  usePrefetchNearbyScenes({
    posts: prefetchPosts,
    primaryIndex,
  });

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) feedWindow.cardRefs.current.set(id, el);
    else feedWindow.cardRefs.current.delete(id);
  }, [feedWindow.cardRefs]);

  const explicitPrimary = useCallback((postId: string | null) => {
    explicitSetAtScrollY.current = scrollContainer
      ? scrollContainer.scrollTop
      : window.scrollY;
    setExplicitPrimaryId(postId);
  }, [scrollContainer]);

  const handleRequestPrimary = useCallback((postId: string) => {
    explicitPrimary(postId);
    // Smooth-scroll tapped card to viewport center
    const el = feedWindow.cardRefs.current.get(postId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vpCenter = window.innerHeight / 2;
    const cardCenter = rect.top + rect.height / 2;
    const offset = cardCenter - vpCenter;

    if (scrollContainer) {
      scrollContainer.scrollBy({ top: offset, behavior: "smooth" });
    } else {
      window.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [explicitPrimary, feedWindow.cardRefs, scrollContainer]);

  // Sync virtual window to the arbiter's measurement.
  // Arbiter runs one scroll listener; we just consume its output.
  useEffect(() => {
    if (closestIndex >= 0 && closestIndex !== feedWindow.activeIndex) {
      feedWindow.setActiveIndex(closestIndex);
    }
  }, [closestIndex, feedWindow.activeIndex, feedWindow.setActiveIndex]);

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
  }, [feedView, hasMore, loadMore, loadingMore]);

  useEffect(() => {
    if (!explicitPrimaryId) return;
    const target = scrollContainer ?? window;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);

    const onScroll = () => {
      if (explicitSetAtScrollY.current === null) return;
      const delta = Math.abs(getY() - explicitSetAtScrollY.current);
      if (delta > 200) {
        setExplicitPrimaryId(null);
        explicitSetAtScrollY.current = null;
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [explicitPrimaryId, scrollContainer]);

  const topSpacerHeight = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < feedWindow.windowStart; i += 1) sum += feedWindow.estimateHeight(i);
    return sum;
  }, [feedWindow]);

  const bottomSpacerHeight = useMemo(() => {
    let sum = 0;
    for (let i = feedWindow.windowEnd + 1; i < posts.length; i += 1) sum += feedWindow.estimateHeight(i);
    return sum;
  }, [feedWindow, posts.length]);

  const renderedPosts = posts.slice(feedWindow.windowStart, feedWindow.windowEnd + 1);
  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {feedWindow.windowStart > 0 && <div style={{ height: topSpacerHeight }} />}

      {renderedPosts.map((post) => (
        <div
          key={post.id}
          style={post.id !== primaryId && !reelsMode && supportsCV
            ? {
              contentVisibility: "auto",
              containIntrinsicSize: "0 420px",
            }
            : undefined}
        >
          <FeedCard
            post={post}
            lyricData={post.project_id ? lyricDataMap.get(post.project_id) ?? null : null}
            live={post.id === primaryId}
            registerRef={registerRef}
            onMeasure={feedWindow.onCardMeasure}
            onRequestPrimary={handleRequestPrimary}
            reelsMode={reelsMode}
          />
        </div>
      ))}

      {feedWindow.windowEnd < posts.length - 1 && <div style={{ height: bottomSpacerHeight }} />}

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
interface FmlyFeedProps {
  reelsMode?: boolean;
}

export function FmlyFeed({ reelsMode = false }: FmlyFeedProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plusOpen, setPlusOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const feed = useFeedPosts();
  const hasSearchQuery = feed.searchTerm.trim().length > 0;
  const searchUiVisible = reelsMode ? (searchOpen || searchFocused || hasSearchQuery) : (searchFocused || hasSearchQuery);
  const displayPosts = hasSearchQuery
    ? (feed.searchLoading && feed.searchResults.length === 0 ? feed.posts : feed.searchResults)
    : feed.posts;
  const filteredPosts = useMemo(() => {
    if (contentFilter === "all") return displayPosts;
    return displayPosts.filter((post) => {
      if (!post.project_id) return contentFilter === "lyrics";
      const danceData = feed.lyricDataMap.get(post.project_id);
      const lines = (danceData as any)?.lines;
      const isInstrumental = !Array.isArray(lines) || lines.length === 0;
      return contentFilter === "beats" ? isInstrumental : !isInstrumental;
    });
  }, [displayPosts, contentFilter, feed.lyricDataMap]);
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
    document.getElementById("fmly-feed-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
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
                      contentFilter={contentFilter}
                      onContentFilterChange={setContentFilter}
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
                             onClick={() => { setPlusOpen(false); navigate("/the-director?mode=song"); }}
                             className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                           >
                             song
                           </button>
                           <button
                             onClick={() => { setPlusOpen(false); navigate("/the-director?mode=beat"); }}
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
                    contentFilter={contentFilter}
                    onContentFilterChange={setContentFilter}
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
                          onClick={() => { setPlusOpen(false); navigate("/the-director?mode=song"); }}
                          className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                        >
                          song
                        </button>
                        <button
                          onClick={() => { setPlusOpen(false); navigate("/the-director?mode=beat"); }}
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
        <FeedSkeleton reelsMode={reelsMode} />
      ) : filteredPosts.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {hasSearchQuery
              ? `No results for “${feed.searchTerm.trim()}”`
              : "No live submissions yet. Be the first!"}
          </p>
        </div>
      ) : (
        <FeedList
          posts={filteredPosts}
          feedView={feed.feedView}
          loadingMore={hasSearchQuery ? false : feed.loadingMore}
          hasMore={hasSearchQuery ? false : feed.hasMore}
          loadMore={hasSearchQuery ? async () => {} : feed.loadMore}
          lyricDataMap={feed.lyricDataMap}
          reelsMode={reelsMode}
        />
      )}

    </div>
  );
}
