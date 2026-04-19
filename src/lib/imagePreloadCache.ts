/**
 * imagePreloadCache — Deduped image preloads.
 *
 * Two separate caches keyed by CORS mode:
 *   • display cache   — no crossOrigin, matches plain <img> tags
 *   • canvas cache    — crossOrigin="anonymous", safe for canvas pixel reads
 *
 * Browsers treat CORS and non-CORS requests as different cache entries.
 * Mixing them means one fetches while the other stays warm but unused.
 * Each code path picks the function matching how the image will be consumed.
 */

type Priority = "high" | "low" | "auto";

const displayPending = new Map<string, Promise<HTMLImageElement>>();
const displayResolved = new Map<string, HTMLImageElement>();
const canvasPending = new Map<string, Promise<HTMLImageElement>>();
const canvasResolved = new Map<string, HTMLImageElement>();

// Hard ceiling so a stalled fetch (CORS credentials-mode mismatch, slow CDN
// cold cache, dropped connection) can never keep a card looking dead. We do
// NOT cache the fallback in `resolved`, so a slow image that arrives later
// still benefits a subsequent caller.
const LOAD_TIMEOUT_MS = 8_000;

function load(
  url: string,
  cors: boolean,
  pending: Map<string, Promise<HTMLImageElement>>,
  resolved: Map<string, HTMLImageElement>,
  priority?: Priority,
): Promise<HTMLImageElement> {
  if (resolved.has(url)) return Promise.resolve(resolved.get(url)!);
  const existing = pending.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolveP) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    if (priority) (img as { fetchPriority?: Priority }).fetchPriority = priority;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolved.set(url, img);
      pending.delete(url);
      resolveP(img);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      pending.delete(url);
      resolveP(img);
    }, LOAD_TIMEOUT_MS);
    img.onload = done;
    img.onerror = done;   // same shape as today — errored images resolve
    img.src = url;
  });

  pending.set(url, promise);
  return promise;
}

/**
 * Preload an image for plain <img> display.
 * No CORS headers. Matches default browser <img> behavior so the browser
 * HTTP cache entry is shared between this preload and the displayed <img>.
 */
export function preloadImage(
  url: string,
  options?: { priority?: Priority },
): Promise<HTMLImageElement> {
  return load(url, false, displayPending, displayResolved, options?.priority);
}

/**
 * Preload an image for canvas pixel access (sampling, drawing, export).
 * Sets crossOrigin="anonymous" so canvas reads don't throw a SecurityError.
 * Requires the server to return Access-Control-Allow-Origin.
 *
 * Use this ONLY when the image will be drawn into a canvas AND its pixels
 * read. For plain <img> display, use preloadImage() instead.
 */
export function preloadImageForCanvas(
  url: string,
  options?: { priority?: Priority },
): Promise<HTMLImageElement> {
  return load(url, true, canvasPending, canvasResolved, options?.priority);
}

/**
 * Synchronous getter for the display cache. Returns the element if a
 * preloadImage() for the same URL has resolved, null otherwise.
 * Mirrors what the browser's HTTP cache is holding for a plain <img>.
 */
export function getPreloadedImage(url: string): HTMLImageElement | null {
  return displayResolved.get(url) ?? null;
}
