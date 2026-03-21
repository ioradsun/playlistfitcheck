import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { AdminPageImport, ShareableHookImport, ShareableLyricDanceImport } from "@/lib/routePrefetch";

// ── Route detection — skip heavy imports on embed routes ──
const _segs = typeof window !== "undefined"
  ? window.location.pathname.replace(/^\//, "").split("/").filter(Boolean)
  : [];
const _isEmbed = _segs.length === 3;

// ── Lazy-loaded pages ──
// Index is lazy so embed routes don't pay for its 1400-line bundle + deps
const Index = lazy(() => import("./pages/Index"));
const About = lazy(() => import("./pages/About"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const SongDetail = lazy(() => import("./pages/SongDetail"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Terms = lazy(() => import("./pages/Terms"));
const ArtistStage = lazy(() => import("./pages/ArtistStage"));
const SeoPages = lazy(() => import("./pages/SeoPages"));
const ArtistClaimPage = lazy(() => import("./pages/ArtistClaimPage"));
const CreateArtistPage = lazy(() => import("./pages/CreateArtistPage"));
const FitWidget = lazy(() => import("@/components/FitWidget").then(m => ({ default: m.FitWidget })));
const SignalsPanel = lazy(() => import("@/components/signals/SignalsPanel").then(m => ({ default: m.SignalsPanel })));
const PageLayout = lazy(() => import("@/components/PageLayout").then(m => ({ default: m.PageLayout })));

const Admin = lazy(AdminPageImport);
const ShareableHook = lazy(ShareableHookImport);
const ShareableLyricDance = lazy(ShareableLyricDanceImport);

// ── Providers + Toasters — only eagerly imported on main app routes ──
// On embed routes these modules are never downloaded.
const MainAppShell = _isEmbed
  ? null
  : lazy(() =>
      import("./MainAppShell").then(m => ({ default: m.default }))
    );

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

// Index uses the HTML shell skeleton as its Suspense fallback (already visible)
const IndexFallback = () => null;

const App = () => (
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
                <Suspense fallback={null}>
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

export default App;
