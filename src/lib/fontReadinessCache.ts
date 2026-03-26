/**
 * fontReadinessCache — Deduplicates font loading across engine instances.
 * First caller triggers the load; all subsequent callers get the same promise.
 */

const cache = new Map<string, Promise<boolean>>();

/**
 * Load a Google Font family (all weights 400-900) once.
 * Returns a promise that resolves to true if the font loaded, false otherwise.
 */
export function ensureFontReady(fontName: string): Promise<boolean> {
  const key = fontName.toLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (typeof document !== "undefined") {
        const encodedFamily = fontName.replace(/\s+/g, "+");
        const linkId = `gfont-${encodedFamily}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@400;500;600;700;800;900&display=swap`;
          document.head.appendChild(link);
        }
      }

      const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (!fontsApi) return false;

      const weightsToLoad = [400, 500, 600, 700, 800, 900].map((w) =>
        fontsApi.load(`${w} 48px "${fontName}"`),
      );
      await Promise.race([
        Promise.all(weightsToLoad),
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
      ]);

      const loaded = fontsApi.check(`600 48px "${fontName}"`) || fontsApi.check(`700 48px "${fontName}"`);

      // If font didn't load in time, remove from cache so future calls can retry.
      // The Google Fonts stylesheet is still in the DOM — the font will eventually arrive.
      if (!loaded) {
        cache.delete(key);
      }

      return loaded;
    } catch {
      cache.delete(key);
      return false;
    }
  })();

  cache.set(key, promise);
  return promise;
}

/** Synchronous check — returns true only if font is already loaded. */
export function isFontReady(fontName: string): boolean {
  const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fontsApi) return false;
  return fontsApi.check(`600 48px "${fontName}"`);
}
