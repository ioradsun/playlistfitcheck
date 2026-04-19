import { useEffect, useRef, useState } from "react";
import { liveCard } from "@/lib/liveCard";

const SETTLE_MS = 80;
const SCROLL_REST_MS = 150;
const VELOCITY_THRESHOLD_PX_PER_SEC = 2500;

export interface ArbiterResult {
  primaryId: string | null;
}

interface ArbiterOptions {
  cardHeight?: number;
  reelsMode?: boolean;
}

export function usePrimaryArbiter(
  scrollContainer: HTMLElement | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  renderedIds: Set<string>,
  opts?: ArbiterOptions,
): ArbiterResult {
  const [result, setResult] = useState<ArbiterResult>({ primaryId: null });

  const renderedIdsRef = useRef(renderedIds);
  renderedIdsRef.current = renderedIds;

  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const lastScrollTRef = useRef(performance.now());

  useEffect(() => {
    if (typeof window === "undefined" || !scrollContainer || !("IntersectionObserver" in window)) {
      liveCard.set(null);
      setResult({ primaryId: null });
      return;
    }

    const observedEntries = new Map<Element, IntersectionObserverEntry>();
    const observedElements = new Set<Element>();

    const getY = () => scrollContainer.scrollTop;

    const getMaxScroll = () => Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

    const getCardHeight = () => opts?.cardHeight ?? scrollContainer.clientHeight;

    const BOUNDARY_PX = 8;

    const atTopBoundary = () => scrollContainer.scrollTop <= BOUNDARY_PX;
    const atBottomBoundary = () => scrollContainer.scrollTop >= getMaxScroll() - BOUNDARY_PX;

    const isExtremeScroll = () => {
      const maxScroll = getMaxScroll();
      const halfCard = getCardHeight() * 0.5;
      return scrollContainer.scrollTop <= halfCard || scrollContainer.scrollTop >= maxScroll - halfCard;
    };

    /** Pick by document position among rendered cards. dir='first' = topmost, 'last' = bottommost. */
    const pickByPosition = (dir: "first" | "last"): string | null => {
      let chosenId: string | null = null;
      let chosenTop = dir === "first" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      for (const id of renderedIdsRef.current) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        const top = el.offsetTop;
        if (dir === "first" ? top < chosenTop : top > chosenTop) {
          chosenTop = top;
          chosenId = id;
        }
      }
      return chosenId;
    };

    const hitTestCenter = (): string | null => {
      const rootRect = scrollContainer.getBoundingClientRect();
      const midpoint = rootRect.top + rootRect.height / 2;
      let nearestId: string | null = null;
      let nearestDist = Number.POSITIVE_INFINITY;

      for (const id of renderedIdsRef.current) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= midpoint && rect.bottom >= midpoint) return id;
        const dist = Math.min(Math.abs(rect.top - midpoint), Math.abs(rect.bottom - midpoint));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = id;
        }
      }

      return nearestId;
    };

    const measure = (): { primaryId: string | null } => {
      // Boundary override: at the very top, always pick the first card; at the very
      // bottom, always pick the last. This prevents the "card #2 wins by intersection
      // ratio" bug when the user lands at the top of the feed.
      if (atTopBoundary()) {
        const first = pickByPosition("first");
        if (first) return { primaryId: first };
      }
      if (atBottomBoundary()) {
        const last = pickByPosition("last");
        if (last) return { primaryId: last };
      }

      let best: { id: string; ratio: number } | null = null;
      for (const entry of observedEntries.values()) {
        const id = (entry.target as HTMLElement).dataset.fmlyPostId;
        if (!id || !renderedIdsRef.current.has(id)) continue;
        if (!best || entry.intersectionRatio > best.ratio) {
          best = { id, ratio: entry.intersectionRatio };
        }
      }

      if (best) return { primaryId: best.id };
      return { primaryId: hitTestCenter() };
    };

    const applyMeasurement = (measurement: { primaryId: string | null }) => {
      const fastMidScroll = velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC && !isExtremeScroll();
      const resolvedPrimary = fastMidScroll ? null : measurement.primaryId ?? hitTestCenter();
      setResult((prev) => (prev.primaryId === resolvedPrimary ? prev : { primaryId: resolvedPrimary }));
      liveCard.set(resolvedPrimary);
    };

    const commit = (measurement: { primaryId: string | null }, immediate = false) => {
      if (settleRef.current) {
        clearTimeout(settleRef.current);
        settleRef.current = null;
      }

      if (immediate || isExtremeScroll()) {
        applyMeasurement(measurement);
        return;
      }

      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        applyMeasurement(measurement);
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

        commit(measure(), isExtremeScroll());
      },
      {
        root: scrollContainer,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        rootMargin: "-25% 0px -25% 0px",
      },
    );

    const syncObserved = () => {
      const next = new Set<Element>();
      for (const id of renderedIdsRef.current) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        el.dataset.fmlyPostId = id;
        next.add(el);
      }

      for (const observed of observedElements) {
        if (next.has(observed)) continue;
        io.unobserve(observed);
        observedEntries.delete(observed);
        observedElements.delete(observed);
      }

      for (const target of next) {
        if (observedElements.has(target)) continue;
        observedElements.add(target);
        io.observe(target);
      }
    };

    const scheduleSync = () => {
      if (syncRafRef.current != null) return;
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null;
        syncObserved();
      });
    };

    const onScroll = () => {
      scheduleSync();
      const now = performance.now();
      const y = getY();
      const dt = now - lastScrollTRef.current;
      if (dt > 0) velocityRef.current = Math.abs((y - lastScrollYRef.current) / dt) * 1000;
      lastScrollYRef.current = y;
      lastScrollTRef.current = now;

      if (restTimerRef.current) clearTimeout(restTimerRef.current);
      restTimerRef.current = setTimeout(() => {
        restTimerRef.current = null;
        syncObserved();
        commit(measure(), true);
      }, SCROLL_REST_MS);
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });

    lastScrollYRef.current = getY();
    lastScrollTRef.current = performance.now();

    syncObserved();
    commit(measure(), true);

    return () => {
      io.disconnect();
      scrollContainer.removeEventListener("scroll", onScroll);
      if (syncRafRef.current != null) cancelAnimationFrame(syncRafRef.current);
      if (restTimerRef.current) clearTimeout(restTimerRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
      liveCard.set(null);
    };
  }, [scrollContainer, cardRefs, opts?.cardHeight, opts?.reelsMode]);

  return result;
}
