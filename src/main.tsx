

import "./lib/prefetch"; // side-effect: starts network requests immediately
import { isEmbedRoute } from "./lib/prefetch";

// Buffer polyfill — only needed by crypto/wallet features, never on embed routes
if (!isEmbedRoute) {
  import("buffer").then(({ Buffer }) => { (window as any).Buffer = Buffer; });
}

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
