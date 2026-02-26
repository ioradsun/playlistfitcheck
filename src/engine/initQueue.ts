let active = 0;
const MAX_CONCURRENT = 2;
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
