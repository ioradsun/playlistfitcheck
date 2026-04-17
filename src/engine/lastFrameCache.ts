const cache = new Map<string, string>();
const MAX_ENTRIES = 20;

export function setLastFrame(postId: string, dataUrl: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(postId, dataUrl);
}

export function getLastFrame(postId: string): string | null {
  return cache.get(postId) ?? null;
}

export function clearLastFrame(postId: string): void {
  cache.delete(postId);
}
