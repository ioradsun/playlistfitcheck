let active = 0;
// Allow more concurrent inits to match the larger pool.
// Caps simultaneous p.init() calls — each does async font/image work.
const MAX_CONCURRENT = 3;
const waiting: Array<() => void> = [];

export async function withInitLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  active++;
  try {
    return await fn();
  } finally {
    active--;
    if (waiting.length > 0) {
      waiting.shift()?.();
    }
  }
}
