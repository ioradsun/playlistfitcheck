import { useEffect, useRef, useState } from "react";
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
): ArbiterResult {
  const [result, setResult] = useState<ArbiterResult>({ primaryId: null, closestIndex: 0 });
  const lastScrollY = useRef(0);
  const lastScrollT = useRef(performance.now());
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const velocityRef = useRef(0);

  useEffect(() => {
    const target = scrollContainer ?? window;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);

    lastScrollY.current = getY();

    /**
     * One measurement pass. Returns both the primary candidate (gated on center-overlap)
     * and the closest rendered card index (no gate).
     */
    const measure = (): { primaryId: string | null; closestIndex: number } => {
      const vpCenter = window.innerHeight / 2;
      let primaryBestId: string | null = null;
      let primaryBestDist = Infinity;
      let closestId: string | null = null;
      let closestDist = Infinity;

      for (const id of renderedIds) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - vpCenter);

        // Closest (for window advance) — unconditional
        if (dist < closestDist) {
          closestDist = dist;
          closestId = id;
        }

        // Primary (for engine hosting) — requires card to overlap viewport center
        if (dist > r.height / 2) continue;
        if (dist < primaryBestDist) {
          primaryBestDist = dist;
          primaryBestId = id;
        }
      }

      const closestIndex = closestId ? postIds.indexOf(closestId) : -1;
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

      // Update closestIndex immediately; primary is debounced via scheduleSettle
      const m = measure();
      setResult((prev) =>
        prev.closestIndex === m.closestIndex ? prev : { ...prev, closestIndex: m.closestIndex }
      );
      scheduleSettle();
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    commitPrimary(); // initial measurement

    return () => {
      target.removeEventListener("scroll", onScroll);
      if (settleRef.current) clearTimeout(settleRef.current);
      liveCard.set(null);
    };
  }, [cardRefs, renderedIds, scrollContainer, postIds]);

  return result;
}
