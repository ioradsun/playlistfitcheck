/**
 * SongFitFeed — CrowdFit feed.
 *
 * Clean rewrite. IntersectionObserver for infinite scroll + card lifecycle.
 * Supports reels mode (full-screen snap scroll) and standard mode.
 * PostCommentPanel is the sole comment UX (inline in card).
 */
import { memo, useState, useEffect, useCallback, useMemo, useRef, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeedPosts } from "./useFeedPosts";
import { PlusMenu } from "./PlusMenu";
import { BillboardToggle } from "./BillboardToggle";
import { primeAudioPool } from "@/lib/audioPool";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { logImpression } from "@/lib/engagementTracking";
import { cn } from "@/lib/utils";
import { useFeedWindow } from "@/feed/useFeedWindow";
import { usePrimaryArbiter } from "@/feed/usePrimaryArbiter";
import { FeedCard } from "@/feed/FeedCard";
import { LivePlayerMount } from "@/feed/LivePlayerMount";
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
    ? document.getElementById("songfit-scroll-container")
    : null;

  const postIds = posts.map((p) => p.id);
  const feedWindow = useFeedWindow(posts.length, postIds);
  const primaryId = usePrimaryArbiter(scrollContainer, feedWindow.cardRefs, feedWindow.renderedIds);

  const liveCanvasSlot = useRef<HTMLDivElement | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) feedWindow.cardRefs.current.set(id, el);
    else feedWindow.cardRefs.current.delete(id);
  }, [feedWindow.cardRefs]);

  useEffect(() => {
    const target = scrollContainer ?? document.scrollingElement ?? document.documentElement;
    if (!target) return;
    const onScroll = () => {
      const vpCenter = window.innerHeight / 2;
      let closest = feedWindow.activeIndex;
      let closestDist = Infinity;

      for (let i = feedWindow.windowStart; i <= feedWindow.windowEnd; i += 1) {
        const id = postIds[i];
        const el = feedWindow.cardRefs.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dist = Math.abs((r.top + r.height / 2) - vpCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }

      if (closest !== feedWindow.activeIndex) feedWindow.setActiveIndex(closest);
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [feedWindow, postIds, scrollContainer]);

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
  const primaryPost = posts.find((post) => post.id === primaryId) ?? null;
  const primaryLyricData = primaryPost?.project_id ? lyricDataMap.get(primaryPost.project_id) ?? null : null;

  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {feedWindow.windowStart > 0 && <div style={{ height: topSpacerHeight }} />}

      {renderedPosts.map((post) => (
        <FeedCard
          key={post.id}
          post={post}
          lyricData={post.project_id ? lyricDataMap.get(post.project_id) ?? null : null}
          isLive={post.id === primaryId}
          currentTimeSec={post.id === primaryId ? currentTimeSec : 0}
          registerRef={registerRef}
          onMeasure={feedWindow.onCardMeasure}
          liveCanvasSlot={post.id === primaryId ? liveCanvasSlot : undefined}
        />
      ))}

      {feedWindow.windowEnd < posts.length - 1 && <div style={{ height: bottomSpacerHeight }} />}

      {hasMore && feedView !== "billboard" && <div ref={sentinelRef} className="h-1" />}

      {loadingMore && (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {primaryLyricData && (
        <LivePlayerMount
          data={primaryLyricData}
          slotRef={liveCanvasSlot}
          onTimeUpdate={setCurrentTimeSec}
        />
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
      const isInstrumental = !!(danceData?.cinematic_direction as any)?._instrumental;
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
    document.getElementById("songfit-scroll-container")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [feed]);

  // Unlock audio on first touch anywhere in the feed
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      primeAudioPool();
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
