import { useEffect, useRef, useState } from "react";
import { liveCard } from "@/lib/liveCard";

const SETTLE_MS = 80;
const VELOCITY_THRESHOLD_PX_PER_SEC = 2500;

export interface ArbiterResult {
  primaryId: string | null;
}

export function usePrimaryArbiter(
  scrollContainer: HTMLElement | null,
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  renderedIds: Set<string>,
  renderedIdsVersion = 0,
): ArbiterResult {
  const [result, setResult] = useState<ArbiterResult>({ primaryId: null });
  const renderedIdsRef = useRef(renderedIds);
  renderedIdsRef.current = renderedIds;

  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const velocityRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const lastScrollTRef = useRef(performance.now());

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      liveCard.set(null);
      setResult({ primaryId: null });
      return;
    }

    const root = scrollContainer ?? null;
    const getY = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY);
    lastScrollYRef.current = getY();
    lastScrollTRef.current = performance.now();

    const observedEntries = new Map<Element, IntersectionObserverEntry>();

    const BOUNDARY_PX = 50;

    const measure = (): { primaryId: string | null } => {
      const visible = Array.from(observedEntries.values())
        .map((entry) => {
          const id = (entry.target as HTMLElement).dataset.fmlyPostId;
          if (!id || !renderedIdsRef.current.has(id)) return null;
          return { id, ratio: entry.intersectionRatio, target: entry.target as HTMLElement };
        })
        .filter((item): item is { id: string; ratio: number; target: HTMLElement } => !!item);

      // ── Boundary fallback ─────────────────────────────────────────────
      // First-principles: a user at the top of the feed IS attending to the
      // first card, regardless of where its geometric center falls. Same at
      // the bottom. Geometry-only IO misses these edges on tall viewports.
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
      const scrollHeight = scrollContainer ? scrollContainer.scrollHeight : document.documentElement.scrollHeight;
      const clientHeight = scrollContainer ? scrollContainer.clientHeight : window.innerHeight;
      const atTop = scrollTop <= BOUNDARY_PX;
      const atBottom = scrollTop + clientHeight >= scrollHeight - BOUNDARY_PX;

      if (atTop || atBottom) {
        // Pick the rendered card with the smallest/largest offsetTop accordingly.
        const cardsByPos = visible
          .filter((v) => v.ratio > 0)
          .sort((a, b) => a.target.offsetTop - b.target.offsetTop);
        if (cardsByPos.length) {
          return { primaryId: atTop ? cardsByPos[0].id : cardsByPos[cardsByPos.length - 1].id };
        }
      }

      if (!visible.length) return { primaryId: null };

      visible.sort((a, b) => b.ratio - a.ratio);
      const best = visible[0];
      return {
        primaryId: best.ratio > 0 ? best.id : null,
      };
    };

    const commit = (measurement: { primaryId: string | null }) => {
      const fast = velocityRef.current > VELOCITY_THRESHOLD_PX_PER_SEC;
      const primaryId = fast ? null : measurement.primaryId;
      setResult((prev) => (prev.primaryId === primaryId ? prev : { primaryId }));
      liveCard.set(primaryId);
    };

    const scheduleSettle = (measurement: { primaryId: string | null }) => {
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
        scheduleSettle(measurement);
      },
      {
        root,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        // Widened from -40% to -25%: 50% center band instead of 20%.
        // Matches natural attention zone; boundary fallback in measure()
        // covers top/bottom edges where geometry alone misses.
        rootMargin: "-25% 0px -25% 0px",
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
