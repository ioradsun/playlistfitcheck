const SWELL_TICK_MS = 50;
const CANVAS_TRIGGER_INTERVAL = 3;

export interface FireHoldController {
  start: () => void;
  stop: () => { holdMs: number } | null;
  destroy: () => void;
}

export const fireWeight = (holdMs: number) => {
  if (holdMs < 300) return 1;
  if (holdMs < 1000) return 2;
  if (holdMs < 3000) return 4;
  return 8;
};

export function createFireHold(opts: {
  onScaleUpdate: (scale: number) => void;
  onCanvasTrigger?: () => void;
}): FireHoldController {
  let intervalId: number | null = null;
  let startTime: number | null = null;
  let tickCount = 0;

  return {
    start() {
      startTime = performance.now();
      tickCount = 0;
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => {
        tickCount += 1;
        const elapsed = performance.now() - (startTime ?? 0);
        const intensity = Math.min(1, elapsed / 2000);
        opts.onScaleUpdate(1 + intensity * 0.5);
        if (opts.onCanvasTrigger && tickCount % CANVAS_TRIGGER_INTERVAL === 0) {
          opts.onCanvasTrigger();
        }
      }, SWELL_TICK_MS);
    },
    stop() {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      opts.onScaleUpdate(1);
      if (startTime == null) return null;
      const holdMs = performance.now() - startTime;
      startTime = null;
      return { holdMs };
    },
    destroy() {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      startTime = null;
    },
  };
}
