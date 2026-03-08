import { useLayoutEffect, useRef, type RefObject } from "react";

export const useScrollRestore = (pathname: string, containerRef: RefObject<HTMLElement>) => {
  const positionsRef = useRef<Map<string, number>>(new Map());
  const visitedRef = useRef<Set<string>>(new Set());
  const prevPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousPath = prevPathnameRef.current;
    if (previousPath !== pathname) {
      positionsRef.current.set(previousPath, container.scrollTop);
      prevPathnameRef.current = pathname;
    }

    const savedPosition = positionsRef.current.get(pathname);

    const raf = window.requestAnimationFrame(() => {
      const current = containerRef.current;
      if (!current) return;

      if (savedPosition !== undefined) {
        if (current.scrollHeight >= savedPosition) {
          current.scrollTop = savedPosition;
        } else {
          window.requestAnimationFrame(() => {
            const settled = containerRef.current;
            if (settled && settled.scrollHeight >= savedPosition) {
              settled.scrollTop = savedPosition;
            }
          });
        }
      } else if (!visitedRef.current.has(pathname)) {
        current.scrollTop = 0;
      }

      visitedRef.current.add(pathname);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      const current = containerRef.current;
      if (!current) return;
      positionsRef.current.set(pathname, current.scrollTop);
    };
  }, [pathname, containerRef]);
};
