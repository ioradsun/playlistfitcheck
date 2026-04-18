import { useEffect, useMemo, useRef, useState } from "react";
import { CARD_TOTAL_HEIGHT_PX } from "@/components/fmly/feed/constants";

const WINDOW_RADIUS = 3;

export interface FeedWindow {
  activeIndex: number;
  windowStart: number;
  windowEnd: number;
  renderedIds: Set<string>;
  renderedIdsVersion: number;
  cardHeight: number;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  setActiveIndex: (index: number) => void;
}

export function useFeedWindow(postCount: number, postIds: string[], reelsMode: boolean): FeedWindow {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewportH, setViewportH] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

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

  useEffect(() => {
    if (!reelsMode) return;
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setViewportH(window.innerHeight);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reelsMode]);

  const cardHeight = reelsMode ? viewportH : CARD_TOTAL_HEIGHT_PX;

  return {
    activeIndex,
    windowStart,
    windowEnd,
    renderedIds,
    renderedIdsVersion,
    cardHeight,
    cardRefs,
    setActiveIndex,
  };
}
