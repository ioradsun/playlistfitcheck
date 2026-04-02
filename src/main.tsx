

import "./lib/prefetch"; // side-effect: starts network requests immediately
import { isEmbedRoute } from "./lib/prefetch";
import { hydrateLightningBarFlag, refreshLightningBarFlagFromBackend } from "./lib/lyricDanceFlags";

// Buffer polyfill — only needed by crypto/wallet features, never on embed routes
if (!isEmbedRoute) {
  import("buffer").then(({ Buffer }) => { (window as any).Buffer = Buffer; });
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

hydrateLightningBarFlag();
if (!isEmbedRoute) {
  void refreshLightningBarFlagFromBackend();
}

// --- Cache invalidation (bump CACHE_VERSION to force-clear all caches) ---
const CACHE_VERSION = 2;
const CACHE_VERSION_KEY = "tfm:cache_version";
(() => {
  try {
    const prev = parseInt(localStorage.getItem(CACHE_VERSION_KEY) || "0", 10);
    if (prev < CACHE_VERSION) {
      // Clear localStorage caches
      const keysToRemove = Object.keys(localStorage).filter(
        (k) => k.startsWith("tfm:transcript_cache") || k.startsWith("profit_history")
      );
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Clear all Cache Storage (Workbox, sw-claim, etc.)
      if ("caches" in window) {
        caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
      }

      // Unregister all service workers so fresh ones install
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) =>
          regs.forEach((r) => r.unregister())
        );
      }

      localStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));
      console.info("[cache] Invalidated all caches — version", CACHE_VERSION);
    }
  } catch {}
})();

// Clear in-memory session audio cache on every full page load
import("@/lib/sessionAudioCache").then(({ sessionAudio }) => sessionAudio.clearAll()).catch(() => {});

if (isEmbedRoute && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw-claim.js").catch(() => {});
}

const syncAppViewportHeight = () => {
  if (typeof window === "undefined") return;
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
};

syncAppViewportHeight();
window.addEventListener("resize", syncAppViewportHeight, { passive: true });
window.addEventListener("orientationchange", syncAppViewportHeight, { passive: true });

// Warm lyric engine font binaries — triggers .woff2 downloads in parallel.
// On embed routes, only warm fonts likely used by the lyric engine preset.
// On main app routes, warm the full set.
if (document.fonts) {
  const coreFonts = [
    "Montserrat",        // clean-modern (default)
    "Oswald",            // bold-impact
  ];
  const extraFonts = [
    "Playfair Display",  // elegant-serif
    "Barlow Condensed",  // raw-condensed
    "Nunito",            // whisper-soft
    "JetBrains Mono",    // tech-mono
    "Bebas Neue",        // display-heavy
    "Cormorant Garamond",// editorial-light
  ];
  const fontsToWarm = isEmbedRoute ? coreFonts : [...coreFonts, ...extraFonts];
  for (const family of fontsToWarm) {
    document.fonts.load(`400 16px "${family}"`).catch(() => {});
    document.fonts.load(`700 16px "${family}"`).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);
