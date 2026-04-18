import { useEffect, useRef } from "react";
import { precompileSceneForData, type LyricDanceData } from "@/engine/LyricDancePlayer";

/**
 * Proactively warm the scene compilation cache for cards within PREFETCH_RADIUS
 * of the current primary. Runs inside requestIdleCallback to avoid contending
 * with active rendering. Concurrency-limited to one compile at a time.
 *
 * Zero observable behavior change if this hook is a no-op — engine falls back
 * to lazy compilation at boot time.
 */

const PREFETCH_RADIUS = 2; // ±2 cards from primary
const DEFAULT_VIEWPORT = { width: 540, height: 540 };

type PrefetchItem = {
  data: LyricDanceData;
  width: number;
  height: number;
};

interface Options {
  posts: Array<{ lyric_project?: LyricDanceData | null } | LyricDanceData>;
  primaryIndex: number | null;
  viewportWidth?: number;
  viewportHeight?: number;
}

export function usePrefetchNearbyScenes({
  posts,
  primaryIndex,
  viewportWidth,
  viewportHeight,
}: Options): void {
  const queueRef = useRef<PrefetchItem[]>([]);
  const runningRef = useRef(false);
  const scheduledHandleRef = useRef<number | null>(null);

  useEffect(() => {
    if (primaryIndex == null) return;
    if (!posts?.length) return;

    const w = viewportWidth || DEFAULT_VIEWPORT.width;
    const h = viewportHeight || DEFAULT_VIEWPORT.height;

    const nextQueue: PrefetchItem[] = [];
    for (let offset = 1; offset <= PREFETCH_RADIUS; offset += 1) {
      for (const delta of [offset, -offset]) {
        const idx = primaryIndex + delta;
        if (idx < 0 || idx >= posts.length) continue;
        const entry = posts[idx];
        const data = (entry as { lyric_project?: LyricDanceData | null })?.lyric_project ?? (entry as LyricDanceData);
        if (!data?.id && !data?.song_slug) continue;
        nextQueue.push({ data, width: w, height: h });
      }
    }

    queueRef.current = nextQueue;

    drainQueue();

    function drainQueue() {
      if (runningRef.current) return;
      if (queueRef.current.length === 0) return;

      if (scheduledHandleRef.current !== null) {
        cancelIdle(scheduledHandleRef.current);
        scheduledHandleRef.current = null;
      }

      scheduledHandleRef.current = scheduleIdle((deadline) => {
        scheduledHandleRef.current = null;
        if (runningRef.current) return;
        runningRef.current = true;

        try {
          const item = queueRef.current.shift();
          if (!item) return;
          if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 5) {
            queueRef.current.unshift(item);
            return;
          }
          precompileSceneForData(item.data, item.width, item.height);
        } catch {
          // Swallow — orchestrator must never disrupt the feed
        } finally {
          runningRef.current = false;
          if (queueRef.current.length > 0) {
            drainQueue();
          }
        }
      });
    }

    return () => {
      if (scheduledHandleRef.current !== null) {
        cancelIdle(scheduledHandleRef.current);
        scheduledHandleRef.current = null;
      }
    };
  }, [primaryIndex, posts, viewportWidth, viewportHeight]);
}

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining: () => number;
}

function scheduleIdle(cb: (deadline: IdleDeadline) => void): number {
  const ric = (globalThis as unknown as {
    requestIdleCallback?: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    return ric(cb, { timeout: 2000 });
  }
  return window.setTimeout(() => {
    const start = performance.now();
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (performance.now() - start)),
    });
  }, 250);
}

function cancelIdle(handle: number): void {
  const cic = (globalThis as unknown as {
    cancelIdleCallback?: (handle: number) => void;
  }).cancelIdleCallback;
  if (typeof cic === "function") {
    cic(handle);
  } else {
    clearTimeout(handle);
  }
}
