import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WINDOW_RADIUS = 3;

export interface FeedWindow {
  activeIndex: number;
  windowStart: number;
  windowEnd: number;
  renderedIds: Set<string>;
  renderedIdsVersion: number;
  onCardMeasure: (id: string, height: number) => void;
  estimateHeight: (index: number) => number;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  setActiveIndex: (index: number) => void;
}

export function useFeedWindow(postCount: number, postIds: string[]): FeedWindow {
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const heights = useRef<Map<string, number>>(new Map());
  const medianHeightRef = useRef(420);

  useEffect(() => {
    if (activeIndex > postCount - 1 && postCount > 0) {
      setActiveIndex(postCount - 1);
    }
  }, [activeIndex, postCount]);

  const windowStart = Math.max(0, activeIndex - WINDOW_RADIUS);
  const windowEnd = Math.min(postCount - 1, activeIndex + WINDOW_RADIUS);

  const renderedIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = windowStart; i <= windowEnd; i += 1) {
      if (postIds[i]) s.add(postIds[i]);
    }
    return s;
  }, [windowStart, windowEnd, postIds]);

  const renderedIdsVersion = windowStart * 100000 + windowEnd + postIds.length;

  const onCardMeasure = useCallback((id: string, h: number) => {
    if (h <= 0 || heights.current.has(id)) return;
    heights.current.set(id, h);
    const all = Array.from(heights.current.values()).sort((a, b) => a - b);
    medianHeightRef.current = all[Math.floor(all.length / 2)] ?? 420;
  }, []);

  const estimateHeight = useCallback((i: number): number => {
    const id = postIds[i];
    if (!id) return 420;
    return heights.current.get(id) ?? medianHeightRef.current;
  }, [postIds]);

  return {
    activeIndex,
    windowStart,
    windowEnd,
    renderedIds,
    renderedIdsVersion,
    onCardMeasure,
    estimateHeight,
    cardRefs,
    setActiveIndex,
  };
}
