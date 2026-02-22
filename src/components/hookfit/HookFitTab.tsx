import { useEffect } from "react";
import { HookFitFeed } from "./HookFitFeed";

// Heavy shared chunks used by every hook battle iframe.
// Preloading them warms the browser cache so subsequent iframes load near-instantly.
const PRELOAD_MODULES = [
  "/node_modules/.vite/deps/chunk-W6L2VRDA.js",      // React internals
  "/node_modules/.vite/deps/framer-motion.js",
  "/node_modules/.vite/deps/@supabase_supabase-js.js",
  "/node_modules/.vite/deps/lucide-react.js",
  "/node_modules/.vite/deps/dist-HG7KAB5G.js",       // Radix/UI chunk
];

export function HookFitTab() {
  // Inject modulepreload links on mount so shared deps are cached
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    for (const href of PRELOAD_MODULES) {
      // Skip if already preloaded
      if (document.querySelector(`link[href*="${href.split("/").pop()}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "modulepreload";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => { links.forEach(l => l.remove()); };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <HookFitFeed />
    </div>
  );
}
