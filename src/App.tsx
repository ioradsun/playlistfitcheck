import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { ShareableHookImport, ShareableLyricDanceImport } from "@/lib/routePrefetch";

// ── Route detection — skip heavy imports on embed routes ──
const _segs = typeof window !== "undefined"
  ? window.location.pathname.replace(/^\//, "").split("/").filter(Boolean)
  : [];
const _isEmbed = _segs.length === 3;

// ── Embed-only lazy pages ──
const ShareableHook = lazy(ShareableHookImport);
const ShareableLyricDance = lazy(ShareableLyricDanceImport);
const ArtistClaimPage = lazy(() => import("./pages/ArtistClaimPage"));
const CreateArtistPage = lazy(() => import("./pages/CreateArtistPage"));

// ── Main app shell — lazy so embed routes never download providers, Index, Toasters, etc. ──
// Retry with cache-bust on stale-chunk failures (e.g. after a deploy)
const importWithRetry = (importer: () => Promise<any>, retries = 1): Promise<any> =>
  importer().catch((err) => {
    if (retries > 0 && err?.message?.includes("Failed to fetch dynamically imported module")) {
      return importWithRetry(
        () => import(/* @vite-ignore */ `./MainAppShell?t=${Date.now()}`),
        retries - 1,
      );
    }
    // All retries exhausted — force full reload so the user gets fresh assets
    window.location.reload();
    return new Promise(() => {}); // never resolves; page is reloading
  });

const MainAppShell = _isEmbed
  ? null
  : lazy(() => importWithRetry(() => import("./MainAppShell")));

const queryClient = new QueryClient();

const HookEmbedFallback = () => (
  <div className="fixed inset-0 bg-[#0a0a0a] z-50" />
);

const LyricDanceFallback = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-end" style={{ background: "#0a0a0a" }}>
    <div className="flex flex-col items-center mb-24">
      <div className="h-2 w-28 rounded bg-white/[0.03] mb-4" />
      <div className="h-[44px] w-36 rounded-lg bg-white/[0.02]" />
    </div>
  </div>
);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="tfm-theme">
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              {/* ── Lyric Dance: lightweight path ── */}
              <Route path="/:artistSlug/:songSlug/lyric-dance" element={
                <Suspense fallback={<LyricDanceFallback />}><ShareableLyricDance /></Suspense>
              } />
              <Route path="/artist/:username/claim-page" element={<Suspense fallback={null}><ArtistClaimPage /></Suspense>} />
              <Route path="/create" element={<Suspense fallback={null}><CreateArtistPage /></Suspense>} />
              {/* ── Hook embed: lightweight path ── */}
              <Route path="/:artistSlug/:songSlug/:hookSlug" element={
                <Suspense fallback={<HookEmbedFallback />}><ShareableHook /></Suspense>
              } />

              {/* ── Main app: full provider tree (lazy-loaded shell) ── */}
              <Route path="/*" element={
                MainAppShell ? (
                  <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#090a10" }} />}>
                    <MainAppShell />
                  </Suspense>
                ) : null
              } />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
