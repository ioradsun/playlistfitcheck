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

createRoot(document.getElementById("root")!).render(<App />);
