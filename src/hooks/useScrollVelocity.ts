import { useEffect, useState } from "react";

export function useScrollVelocity(
  target: HTMLElement | Window | null,
  threshold = 2500,
  settleMs = 150,
) {
  const [isFastScrolling, setFast] = useState(false);

  useEffect(() => {
    if (!target) return;
    let lastY = 0;
    let lastT = performance.now();
    let settle: ReturnType<typeof setTimeout> | null = null;

    const getY = () =>
      target instanceof Window ? target.scrollY : target.scrollTop;

    lastY = getY();

    const onScroll = () => {
      const now = performance.now();
      const dt = now - lastT;
      if (dt <= 0) return;
      const y = getY();
      const velocity = Math.abs((y - lastY) / dt) * 1000;
      lastY = y;
      lastT = now;

      if (velocity > threshold) {
        setFast(true);
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => setFast(false), settleMs);
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (settle) clearTimeout(settle);
    };
  }, [target, threshold, settleMs]);

  return { isFastScrolling };
}
