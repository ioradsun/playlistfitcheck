import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SongFitPost } from "./types";

const FEED_CARD_MIN_HEIGHT = 530;
const WINDOW_RADIUS = 4;

type WindowedPost = { post: SongFitPost; shouldRender: boolean };

export function useFeedWindow(posts: SongFitPost[], scrollContainerId: string) {
  const heightMapRef = useRef(new Map<string, number>());
  const [windowRange, setWindowRange] = useState({ start: 0, end: Math.min(posts.length - 1, WINDOW_RADIUS * 2) });
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [impressions, setImpressions] = useState<string[]>([]);
  const seenImpressions = useRef(new Set<string>());
  const rafRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [centerIndex, setCenterIndex] = useState(0);

  const registerHeight = useCallback((postId: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    heightMapRef.current.set(postId, height);
  }, []);

  const getHeight = useCallback((post: SongFitPost) => heightMapRef.current.get(post.id) ?? FEED_CARD_MIN_HEIGHT, []);

  const calculateRanges = useCallback((scrollTop: number, viewportHeight: number) => {
    if (posts.length === 0) {
      return { center: 0, visibleStart: 0, visibleEnd: 0, windowStart: 0, windowEnd: -1 };
    }

    const centerY = scrollTop + viewportHeight / 2;
    const viewportBottom = scrollTop + viewportHeight;
    let acc = 0;
    let visibleStart = 0;
    let visibleEnd = posts.length - 1;
    let center = posts.length - 1;

    for (let i = 0; i < posts.length; i++) {
      const h = getHeight(posts[i]);
      const top = acc;
      const bottom = acc + h;

      if (top <= scrollTop && scrollTop < bottom) visibleStart = i;
      if (top <= centerY && centerY < bottom) center = i;
      if (top < viewportBottom) visibleEnd = i;
      acc = bottom;
    }

    return {
      center,
      visibleStart,
      visibleEnd,
      windowStart: Math.max(0, center - WINDOW_RADIUS),
      windowEnd: Math.min(posts.length - 1, center + WINDOW_RADIUS),
    };
  }, [getHeight, posts]);

  useEffect(() => {
    const container = document.getElementById(scrollContainerId);
    if (!container) return;

    const topSentinel = document.createElement("div");
    const bottomSentinel = document.createElement("div");
    topSentinel.style.cssText = "height:1px; width:1px; pointer-events:none;";
    bottomSentinel.style.cssText = "height:1px; width:1px; pointer-events:none;";
    container.prepend(topSentinel);
    container.append(bottomSentinel);

    const io = new IntersectionObserver(
      () => {},
      { root: container, threshold: 0 }
    );
    io.observe(topSentinel);
    io.observe(bottomSentinel);

    const run = () => {
      rafRef.current = null;
      const { center, visibleStart, visibleEnd, windowStart, windowEnd } = calculateRanges(container.scrollTop, container.clientHeight);
      setCenterIndex(center);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setVisibleRange({ start: visibleStart, end: visibleEnd });
        setWindowRange({ start: windowStart, end: windowEnd });
      }, 150);
    };

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(run);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
      io.disconnect();
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      topSentinel.remove();
      bottomSentinel.remove();
    };
  }, [calculateRanges, scrollContainerId]);

  const windowedPosts = useMemo<WindowedPost[]>(() => posts.map((post, idx) => ({ post, shouldRender: idx >= windowRange.start && idx <= windowRange.end })), [posts, windowRange.end, windowRange.start]);

  useEffect(() => {
    const nextImpressions: string[] = [];
    windowedPosts.forEach(({ post, shouldRender }, idx) => {
      if (shouldRender && idx >= visibleRange.start && idx <= visibleRange.end && !seenImpressions.current.has(post.id)) {
        seenImpressions.current.add(post.id);
        nextImpressions.push(post.id);
      }
    });
    setImpressions(nextImpressions);
  }, [visibleRange.end, visibleRange.start, windowedPosts]);

  return {
    windowedPosts,
    heightMap: heightMapRef.current,
    registerHeight,
    impressions,
    windowRange,
    visibleRange,
    centerIndex,
  };
}
