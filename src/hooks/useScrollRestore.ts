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
    if (savedPosition !== undefined) {
      container.scrollTop = savedPosition;
    } else if (!visitedRef.current.has(pathname)) {
      container.scrollTop = 0;
    }

    visitedRef.current.add(pathname);

    return () => {
      const current = containerRef.current;
      if (!current) return;
      positionsRef.current.set(pathname, current.scrollTop);
    };
  }, [pathname, containerRef]);
};
