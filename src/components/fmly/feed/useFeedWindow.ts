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

  const renderedIdsVersionRef = useRef(0);
  const lastRenderedIdsKeyRef = useRef<string>("");
  const renderedIdsVersion = useMemo(() => {
    const key = Array.from(renderedIds).sort().join(",");
    if (key !== lastRenderedIdsKeyRef.current) {
      lastRenderedIdsKeyRef.current = key;
      renderedIdsVersionRef.current += 1;
    }
    return renderedIdsVersionRef.current;
  }, [renderedIds]);

  const onCardMeasure = useCallback((id: string, h: number) => {
    if (h > 0) heights.current.set(id, h);
  }, []);

  const estimateHeight = useCallback((i: number): number => {
    const id = postIds[i];
    if (!id) return 420;
    const measured = heights.current.get(id);
    if (measured) return measured;
    const all = Array.from(heights.current.values());
    if (!all.length) return 420;
    all.sort((a, b) => a - b);
    return all[Math.floor(all.length / 2)];
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
