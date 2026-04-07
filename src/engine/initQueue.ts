let active = 0;
const MAX_CONCURRENT = 2;
const priorityWaiting: Array<() => void> = [];
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
    // Drain priority queue first, then normal queue
    const next = priorityWaiting.shift() ?? waiting.shift();
    next?.();
  }
}

export async function withPriorityInitLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => priorityWaiting.push(resolve));
  }

  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = priorityWaiting.shift() ?? waiting.shift();
    next?.();
  }
}
