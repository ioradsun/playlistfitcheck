/**
 * imagePreloadCache — Global deduplication for <img> preloads.
 * Call preloadImage(url) as early as you have the URL.
 * All subsequent calls for the same URL return the same promise/element.
 */

const pending = new Map<string, Promise<HTMLImageElement>>();
const resolved = new Map<string, HTMLImageElement>();

export function preloadImage(
  url: string,
  options?: { priority?: "high" | "low" | "auto" },
): Promise<HTMLImageElement> {
  if (resolved.has(url)) return Promise.resolve(resolved.get(url)!);
  const existing = pending.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    if (options?.priority) {
      (img as any).fetchPriority = options.priority;
    }
    img.onload = () => {
      resolved.set(url, img);
      pending.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      resolved.set(url, img);
      pending.delete(url);
      resolve(img);
    };
    img.src = url;
  });

  pending.set(url, promise);
  return promise;
}

/** Sync getter — returns the element only if already loaded, null otherwise. */
export function getPreloadedImage(url: string): HTMLImageElement | null {
  return resolved.get(url) ?? null;
}
