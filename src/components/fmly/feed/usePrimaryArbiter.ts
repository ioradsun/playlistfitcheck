import { useEffect, useRef, useState } from "react";
import { liveCard } from "@/lib/liveCard";

const SETTLE_MS = 80;
const VELOCITY_THRESHOLD_PX_PER_SEC = 2500;

export interface ArbiterResult {
  primaryId: string | null;
  closestIndex: number;
}

export function usePrimaryArbiter(
  scrollContainer: HTMLElement | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  renderedIds: Set<string>,
  postIds: string[],
  renderedIdsVersion = 0,
): ArbiterResult {
  const [result, setResult] = useState<ArbiterResult>({ primaryId: null, closestIndex: 0 });
  const renderedIdsRef = useRef(renderedIds);
  const postIdsRef = useRef(postIds);
  renderedIdsRef.current = renderedIds;
  postIdsRef.current = postIds;

  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const velocityRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const lastScrollTRef = useRef(performance.now());

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      liveCard.set(null);
      setResult({ primaryId: null, closestIndex: 0 });
      return;
    }

    const root = scrollContainer ?? null;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);
    lastScrollYRef.current = getY();
    lastScrollTRef.current = performance.now();

    const observedEntries = new Map<Element, IntersectionObserverEntry>();

    const measure = (): { primaryId: string | null; closestIndex: number } => {
      const visible = Array.from(observedEntries.values())
        .map((entry) => {
          const id = (entry.target as HTMLElement).dataset.fmlyPostId;
          if (!id || !renderedIdsRef.current.has(id)) return null;
          return { id, ratio: entry.intersectionRatio };
        })
        .filter((item): item is { id: string; ratio: number } => !!item);

      if (!visible.length) return { primaryId: null, closestIndex: 0 };

      visible.sort((a, b) => b.ratio - a.ratio);
      const best = visible[0];
      const closestIndex = Math.max(0, postIdsRef.current.indexOf(best.id));
      return {
        primaryId: best.ratio > 0 ? best.id : null,
        closestIndex,
      };
    };

    const commit = (measurement: { primaryId: string | null; closestIndex: number }) => {
      const fast = velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC;
      const primaryId = fast ? null : measurement.primaryId;
      setResult((prev) => (
        prev.primaryId === primaryId && prev.closestIndex === measurement.closestIndex
          ? prev
          : { primaryId, closestIndex: measurement.closestIndex }
      ));
      liveCard.set(primaryId);
    };

    const scheduleSettle = (measurement: { primaryId: string | null; closestIndex: number }) => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        commit(measurement);
      }, SETTLE_MS);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) observedEntries.set(entry.target, entry);

        const latest = entries.reduce<IntersectionObserverEntry | null>((acc, entry) => {
          if (!acc || entry.time > acc.time) return entry;
          return acc;
        }, null);

        if (latest) {
          const y = getY();
          const dt = latest.time - lastScrollTRef.current;
          if (dt > 0) velocityRef.current = Math.abs((y - lastScrollYRef.current) / dt) * 1000;
          lastScrollYRef.current = y;
          lastScrollTRef.current = latest.time;
        }

        const measurement = measure();
        setResult((prev) => (
          prev.closestIndex === measurement.closestIndex
            ? prev
            : { ...prev, closestIndex: measurement.closestIndex }
        ));
        scheduleSettle(measurement);
      },
      {
        root,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        rootMargin: "-40% 0px -40% 0px",
      },
    );

    for (const id of renderedIdsRef.current) {
      const el = cardRefs.current.get(id);
      if (!el) continue;
      el.dataset.fmlyPostId = id;
      io.observe(el);
    }

    return () => {
      io.disconnect();
      if (settleRef.current) clearTimeout(settleRef.current);
      liveCard.set(null);
    };
  }, [scrollContainer, cardRefs, renderedIdsVersion]);

  return result;
}
