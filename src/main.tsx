// Auto-reload on stale chunk errors (after deploy, cached HTML references old hashes)
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("chunk-reload")) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});

import "./lib/prefetch"; // side-effect: starts network requests immediately
// Lazy-load Buffer polyfill — only needed by crypto/wallet features, not on critical path
import("buffer").then(({ Buffer }) => { (window as any).Buffer = Buffer; });

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const syncAppViewportHeight = () => {
  if (typeof window === "undefined") return;
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
};

syncAppViewportHeight();
window.addEventListener("resize", syncAppViewportHeight, { passive: true });
window.addEventListener("orientationchange", syncAppViewportHeight, { passive: true });

// Warm lyric engine font binaries — triggers .woff2 downloads in parallel with
// everything else. The Google Fonts CSS is preloaded in index.html, but the
// actual font files only download on first document.fonts.load() call. Without
// this, the first InStudio card waits 500ms-2s for fonts inside player.init().
if (document.fonts) {
  const engineFonts = [
    "Montserrat",        // clean-modern (default) + kickFontStabilizationLoad
    "Oswald",            // bold-impact
    "Playfair Display",  // elegant-serif
    "Barlow Condensed",  // raw-condensed
    "Nunito",            // whisper-soft
    "JetBrains Mono",    // tech-mono
    "Bebas Neue",        // display-heavy
    "Cormorant Garamond",// editorial-light
  ];
  for (const family of engineFonts) {
    // Load weight 400 + 700 — enough to trigger the .woff2 download.
    // The browser caches the full family once any weight is fetched.
    document.fonts.load(`400 16px "${family}"`).catch(() => {});
    document.fonts.load(`700 16px "${family}"`).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);
