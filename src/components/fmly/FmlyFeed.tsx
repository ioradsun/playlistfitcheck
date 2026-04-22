/**
 * FmlyFeed — the FMLY feed.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeedPosts } from "./useFeedPosts";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { useFeedWindow } from "@/components/fmly/feed/useFeedWindow";
import { usePrimaryArbiter } from "@/components/fmly/feed/usePrimaryArbiter";
import { usePrefetchNearbyScenes } from "@/components/fmly/feed/usePrefetchNearbyScenes";
import { FeedCard } from "@/components/fmly/feed/FeedCard";
import { FeedHeader } from "@/components/fmly/feed/FeedHeader";
import { SkeletonCard } from "@/components/fmly/feed/SkeletonCard";
import { FEED_MAX_WIDTH_PX } from "@/components/fmly/feed/constants";
import type { ContentFilter } from "./types";

function FeedList({
  posts,
  feedView,
  loadingMore,
  hasMore,
  loadMore,
  lyricDataMap,
  reelsMode,
  onScrolledChange,
}: {
  posts: any[];
  feedView: string;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  lyricDataMap: Map<string, any>;
  reelsMode: boolean;
  onScrolledChange?: (scrolled: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reelsTopSentinelRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setScrollContainer(document.getElementById("fmly-feed-scroll"));
  }, []);

  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const feedWindow = useFeedWindow(posts.length, postIds, reelsMode, scrollContainer);
  const { primaryId: arbiterPrimaryId } = usePrimaryArbiter(
    scrollContainer,
    feedWindow.cardRefs,
    feedWindow.renderedIds,
    { cardHeight: feedWindow.cardHeight, reelsMode },
  );

  // Manual override: when the user taps a non-primary card, we promote it
  // immediately. This wins over the arbiter until the next scroll event,
  // ensuring tap-to-activate works even when the card cannot reach center
  // (e.g. last card in feed).
  const [manualPrimaryId, setManualPrimaryId] = useState<string | null>(null);
  const primaryId = manualPrimaryId ?? arbiterPrimaryId;

  // Clear manual override on scroll so the arbiter can resume.
  useEffect(() => {
    if (!scrollContainer || !manualPrimaryId) return;
    const onScroll = () => setManualPrimaryId(null);
    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, [scrollContainer, manualPrimaryId]);

  const primaryIndex = useMemo(
    () => (primaryId ? postIds.indexOf(primaryId) : null),
    [postIds, primaryId],
  );

  usePrefetchNearbyScenes({ posts, lyricDataMap, primaryIndex });

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) feedWindow.cardRefs.current.set(id, el);
    else feedWindow.cardRefs.current.delete(id);
  }, [feedWindow.cardRefs]);

  const handleRequestPrimary = useCallback((postId: string) => {
    // Promote immediately — don't wait for scroll/arbiter.
    setManualPrimaryId(postId);

    const el = feedWindow.cardRefs.current.get(postId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vpCenter = window.innerHeight / 2;
    const cardCenter = rect.top + rect.height / 2;
    const offset = cardCenter - vpCenter;

    // Only scroll if there's meaningful offset (>50px). For the last card
    // when already at the bottom, scrolling is a no-op — promotion alone
    // is enough.
    if (Math.abs(offset) > 50) {
      if (scrollContainer) scrollContainer.scrollBy({ top: offset, behavior: "smooth" });
      else window.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [feedWindow.cardRefs, scrollContainer]);

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
    if (!reelsMode || !onScrolledChange || !scrollContainer) return;
    const sentinel = reelsTopSentinelRef.current;
    if (!sentinel || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      ([entry]) => onScrolledChange(!entry.isIntersecting),
      { root: scrollContainer, threshold: 1 },
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [onScrolledChange, reelsMode, scrollContainer]);

  const topSpacerHeight = feedWindow.windowStart * feedWindow.cardHeight;
  const bottomSpacerHeight = Math.max(0, posts.length - 1 - feedWindow.windowEnd) * feedWindow.cardHeight;

  const renderedPosts = posts.slice(feedWindow.windowStart, feedWindow.windowEnd + 1);

  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {reelsMode && <div ref={reelsTopSentinelRef} className="h-px w-full" />}
      {feedWindow.windowStart > 0 && <div style={{ height: topSpacerHeight }} />}

      {renderedPosts.map((post) => {
        const lyricData = post.project_id ? lyricDataMap.get(post.project_id) ?? null : null;
        return (
          <div key={post.id}>
            <FeedCard
              post={post}
              lyricData={lyricData}
              live={post.id === primaryId && !!lyricData}
              registerRef={registerRef}
              onRequestPrimary={handleRequestPrimary}
              reelsMode={reelsMode}
            />
          </div>
        );
      })}

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

interface FmlyFeedProps {
  reelsMode?: boolean;
  onScrolledChange?: (scrolled: boolean) => void;
}

export function FmlyFeed({ reelsMode = false, onScrolledChange }: FmlyFeedProps) {
  const { user } = useAuth();
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const feed = useFeedPosts();
  const hasSearchQuery = feed.searchTerm.trim().length > 0;

  const displayPosts = hasSearchQuery
    ? (feed.searchLoading && feed.searchResults.length === 0 ? feed.posts : feed.searchResults)
    : feed.posts;

  const filteredPosts = useMemo(() => {
    if (contentFilter === "all") return displayPosts;
    return displayPosts.filter((post) => {
      if (!post.project_id) return contentFilter === "lyrics";
      const isInstrumental = !!post.is_instrumental;
      return contentFilter === "beats" ? isInstrumental : !isInstrumental;
    });
  }, [displayPosts, contentFilter]);

  const displayLoading = !hasSearchQuery && feed.loading && feed.posts.length === 0;

  const handleLoadNewDrops = useCallback(() => {
    feed.consumeNewDrops();
    document.getElementById("fmly-feed-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [feed]);

  useEffect(() => {
    const handler = () => {
      unlockAudio();
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
    <div
      className={reelsMode ? "w-full" : "w-full mx-auto"}
      style={reelsMode ? undefined : { maxWidth: FEED_MAX_WIDTH_PX }}
    >
      <FeedHeader
        reelsMode={reelsMode}
        feed={feed}
        contentFilter={contentFilter}
        setContentFilter={setContentFilter}
        user={user}
        hasSearchQuery={hasSearchQuery}
      />

      {feed.pendingNewCount > 0 && !feed.loading && (
        reelsMode ? (
          <div className="fixed top-14 left-0 right-0 z-[58] flex justify-center pointer-events-none">
            <button
              onClick={handleLoadNewDrops}
              className="pointer-events-auto rounded-full bg-background/80 backdrop-blur-md px-4 py-1.5 text-[10px] font-mono tracking-[0.12em] text-primary transition-colors hover:text-primary/80"
            >
              {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
            </button>
          </div>
        ) : (
          <button
            onClick={handleLoadNewDrops}
            className="w-full border-b border-border/30 py-2 text-center text-[11px] font-mono tracking-[0.1em] text-primary transition-colors hover:text-primary/80"
          >
            {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
          </button>
        )
      )}

      {displayLoading ? (
        Array.from({ length: reelsMode ? 1 : 3 }, (_, i) => (
          <SkeletonCard key={i} reelsMode={reelsMode} />
        ))
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
          onScrolledChange={onScrolledChange}
        />
      )}
    </div>
  );
}
