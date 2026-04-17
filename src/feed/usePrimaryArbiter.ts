import { useEffect, useRef, useState } from "react";
import { liveCard } from "@/lib/liveCard";

const SETTLE_MS = 80;
const VELOCITY_THRESHOLD_PX_PER_SEC = 2500;

interface Rect { id: string; top: number; height: number }

export function usePrimaryArbiter(
  scrollContainer: HTMLElement | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  renderedIds: Set<string>,
): string | null {
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const lastScrollY = useRef(0);
  const lastScrollT = useRef(performance.now());
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const velocityRef = useRef(0);

  useEffect(() => {
    const target = scrollContainer ?? window;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);

    lastScrollY.current = getY();

    const measure = () => {
      const vpCenter = window.innerHeight / 2;
      const rects: Rect[] = [];
      for (const id of renderedIds) {
        const el = cardRefs.current.get(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        rects.push({ id, top: r.top, height: r.height });
      }

      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const r of rects) {
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - vpCenter);
        if (dist > r.height / 2) continue;
        if (dist < bestDist) {
          bestDist = dist;
          bestId = r.id;
        }
      }

      setPrimaryId((prev) => (prev === bestId ? prev : bestId));
      liveCard.set(bestId);
    };

    const schedule = () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        if (velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC) {
          setPrimaryId((prev) => (prev === null ? prev : null));
          liveCard.set(null);
          return;
        }
        measure();
      }, SETTLE_MS);
    };

    const onScroll = () => {
      const now = performance.now();
      const y = getY();
      const dt = now - lastScrollT.current;
      if (dt > 0) velocityRef.current = Math.abs((y - lastScrollY.current) / dt) * 1000;
      lastScrollY.current = y;
      lastScrollT.current = now;
      schedule();
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    measure();

    return () => {
      target.removeEventListener("scroll", onScroll);
      if (settleRef.current) clearTimeout(settleRef.current);
      liveCard.set(null);
    };
  }, [cardRefs, renderedIds, scrollContainer]);

  return primaryId;
}
