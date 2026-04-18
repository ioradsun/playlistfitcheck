import { useEffect, useMemo, useRef, useState } from "react";
import { liveCard } from "@/lib/liveCard";

const SETTLE_MS = 80;
const VELOCITY_THRESHOLD_PX_PER_SEC = 2500;

export interface ArbiterResult {
  /** Currently-live card id. Null during fast scroll or when no card overlaps viewport center. */
  primaryId: string | null;
  /** Index (in postIds) of the card whose center is closest to the viewport center.
   *  Updated on every scroll, not debounced, not velocity-gated. Drives the virtual window. */
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
  // Refs that mirror the latest values of renderedIds and postIds without retriggering listeners.
  const renderedIdsRef = useRef(renderedIds);
  const postIdsRef = useRef(postIds);
  renderedIdsRef.current = renderedIds;
  postIdsRef.current = postIds;
  const renderedIdsKey = useMemo(
    () => Array.from(renderedIds).sort().join(","),
    [renderedIds],
  );

  const lastScrollY = useRef(0);
  const lastScrollT = useRef(performance.now());
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafPendingRef = useRef<number | null>(null);
  const velocityRef = useRef(0);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const iosMajor = isIOS
    ? parseInt((ua.match(/OS (\d+)_/) || [])[1] || "0", 10)
    : 999;
  const useIO = typeof window !== "undefined"
    && "IntersectionObserver" in window
    && (!isIOS || iosMajor >= 16);

  useEffect(() => {
    if (!useIO) return;

    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);
    const root = scrollContainer ?? null;

    const measureFromEntries = (
      entries: IntersectionObserverEntry[],
    ): { primaryId: string | null; closestIndex: number } => {
      const visible = entries
        .map((entry) => {
          const target = entry.target as HTMLElement;
          const id = target.dataset.fmlyPostId;
          if (!id || !renderedIdsRef.current.has(id)) return null;
          return { id, ratio: entry.intersectionRatio };
        })
        .filter((item): item is { id: string; ratio: number } => !!item);

      if (!visible.length) {
        return { primaryId: null, closestIndex: -1 };
      }

      visible.sort((a, b) => b.ratio - a.ratio);
      const best = visible[0];
      const closestIndex = postIdsRef.current.indexOf(best.id);
      return {
        primaryId: best.ratio > 0 ? best.id : null,
        closestIndex,
      };
    };

    const commitPrimary = (measurement: { primaryId: string | null; closestIndex: number }) => {
      const fast = velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC;
      const primaryId = fast ? null : measurement.primaryId;
      setResult((prev) =>
        prev.primaryId === primaryId && prev.closestIndex === measurement.closestIndex
          ? prev
          : { primaryId, closestIndex: measurement.closestIndex }
      );
      liveCard.set(primaryId);
    };

    const scheduleSettle = (measurement: { primaryId: string | null; closestIndex: number }) => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        commitPrimary(measurement);
      }, SETTLE_MS);
    };

    const observedEntries = new Map<Element, IntersectionObserverEntry>();
    const prevEntryTimeRef = { current: 0 };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          observedEntries.set(entry.target, entry);
        }

        const latestEntry = entries.reduce<IntersectionObserverEntry | null>((latest, entry) => {
          if (!latest || entry.time > latest.time) return entry;
          return latest;
        }, null);

        if (latestEntry) {
          const y = getY();
          const dt = latestEntry.time - prevEntryTimeRef.current;
          if (dt > 0) velocityRef.current = Math.abs((y - lastScrollY.current) / dt) * 1000;
          lastScrollY.current = y;
          lastScrollT.current = latestEntry.time;
          prevEntryTimeRef.current = latestEntry.time;
        }

        const measurement = measureFromEntries(Array.from(observedEntries.values()));
        setResult((prev) =>
          prev.closestIndex === measurement.closestIndex
            ? prev
            : { ...prev, closestIndex: measurement.closestIndex }
        );
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
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = null;
      }
      liveCard.set(null);
    };
  }, [useIO, scrollContainer, cardRefs, renderedIdsVersion]);

  useEffect(() => {
    if (useIO) return;

    const target = scrollContainer ?? window;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);

    lastScrollY.current = getY();

    /**
     * One measurement pass. Reads latest renderedIds/postIds from refs so it
     * always sees the current window without triggering listener re-subscription.
     */
    const measure = (): { primaryId: string | null; closestIndex: number } => {
      const ids = renderedIdsRef.current;
      const pIds = postIdsRef.current;
      const vpCenter = window.innerHeight / 2;
      let primaryBestId: string | null = null;
      let primaryBestDist = Infinity;
      let closestId: string | null = null;
      let closestDist = Infinity;

      for (const id of ids) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - vpCenter);

        if (dist < closestDist) {
          closestDist = dist;
          closestId = id;
        }

        if (dist > r.height / 2) continue;
        if (dist < primaryBestDist) {
          primaryBestDist = dist;
          primaryBestId = id;
        }
      }

      const closestIndex = closestId ? pIds.indexOf(closestId) : -1;
      return { primaryId: primaryBestId, closestIndex };
    };

    const commitPrimary = () => {
      const m = measure();
      const fast = velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC;
      const primaryId = fast ? null : m.primaryId;
      setResult((prev) =>
        prev.primaryId === primaryId && prev.closestIndex === m.closestIndex
          ? prev
          : { primaryId, closestIndex: m.closestIndex }
      );
      liveCard.set(primaryId);
    };

    const scheduleSettle = () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        commitPrimary();
      }, SETTLE_MS);
    };

    const onScroll = () => {
      const now = performance.now();
      const y = getY();
      const dt = now - lastScrollT.current;
      if (dt > 0) velocityRef.current = Math.abs((y - lastScrollY.current) / dt) * 1000;
      lastScrollY.current = y;
      lastScrollT.current = now;

      // Measurement + state update is rAF-batched. During fast fling (iOS momentum
      // especially), multiple scroll events fire per frame. Batching to one measure
      // per paint cycle removes redundant layout reads and React reconciliations
      // without changing observable behavior — browser paints once per frame anyway.
      // Velocity stays on every event (needs every sample for accuracy).
      if (rafPendingRef.current === null) {
        rafPendingRef.current = requestAnimationFrame(() => {
          rafPendingRef.current = null;
          const m = measure();
          setResult((prev) =>
            prev.closestIndex === m.closestIndex ? prev : { ...prev, closestIndex: m.closestIndex }
          );
        });
      }
      scheduleSettle();
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) commitPrimary();
    });

    return () => {
      cancelled = true;
      target.removeEventListener("scroll", onScroll);
      if (settleRef.current) clearTimeout(settleRef.current);
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = null;
      }
      liveCard.set(null);
    };
  }, [useIO, scrollContainer, cardRefs, renderedIdsKey]);

  return result;
}
