import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteCopyProvider } from "@/hooks/useSiteCopy";
import { SidebarProvider } from "@/components/ui/sidebar";
// WalletProvider disabled — uncomment when crypto features are re-enabled
// import { WalletProvider } from "@/components/crypto/WalletProvider";
import { PageLayout } from "@/components/PageLayout";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import { AdminPageImport, ShareableHookImport, ShareableLyricDanceImport } from "@/lib/routePrefetch";

// ── Lazy-loaded pages — not needed on the CrowdFit critical path ──
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

const Admin = lazy(AdminPageImport);
// Lazy-load ShareableHook — standalone page, no need in main bundle
const ShareableHook = lazy(ShareableHookImport);
// Lazy-load ShareableLyricDance — standalone page
const ShareableLyricDance = lazy(ShareableLyricDanceImport);

const queryClient = new QueryClient();

/** Skeleton fallback matching battle layout — two video panels + bottom bar */
const HookEmbedFallback = () => (
  <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col z-50">
    {/* Header */}
    <div className="px-5 pt-4 pb-2 flex justify-center">
      <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse" />
    </div>
    {/* Split-screen canvases */}
    <div className="flex-1 flex flex-col sm:flex-row gap-1 px-1 min-h-0">
      <div className="relative flex-1 min-h-[35vh] sm:min-h-0 rounded-lg bg-white/[0.03] animate-pulse">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="h-3 w-16 rounded bg-white/[0.08] animate-pulse" />
        </div>
      </div>
      <div className="relative flex-1 min-h-[35vh] sm:min-h-0 rounded-lg bg-white/[0.03] animate-pulse">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="h-3 w-16 rounded bg-white/[0.08] animate-pulse" />
        </div>
      </div>
    </div>
    {/* Bottom bar */}
    <div className="h-[120px] px-4 flex items-center justify-center">
      <div className="h-10 w-64 rounded-lg bg-white/[0.05] animate-pulse" />
    </div>
  </div>
);

/** Skeleton fallback for lyric dance — single fullscreen player */
const LyricDanceFallback = () => (
  <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col z-50">
    {/* Single canvas area */}
    <div className="flex-1 relative bg-white/[0.02] animate-pulse">
      {/* Centered song title + button placeholder */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className="h-2 w-32 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-10 w-36 rounded-lg bg-white/[0.04] animate-pulse" />
      </div>
    </div>
    {/* Progress bar */}
    <div className="h-1 w-full bg-white/[0.04]" />
    {/* Bottom bar */}
    <div className="h-12 flex items-center justify-center gap-4 px-4">
      <div className="flex-1 h-3 rounded bg-white/[0.04] animate-pulse" />
      <div className="w-px h-6 bg-white/[0.06]" />
      <div className="w-12 h-3 rounded bg-white/[0.04] animate-pulse" />
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="tfm-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* ── Lyric Dance: lightweight path ── */}
            <Route path="/:artistSlug/:songSlug/lyric-dance" element={
              <Suspense fallback={<LyricDanceFallback />}><ShareableLyricDance /></Suspense>
            } />
            <Route path="/artist/:username/claim-page" element={<Suspense fallback={null}><ArtistClaimPage /></Suspense>} />
            <Route path="/create" element={<Suspense fallback={null}><CreateArtistPage /></Suspense>} />
            {/* ── Hook embed: lightweight path — no Auth/SiteCopy/Wallet/Sidebar overhead ── */}
            <Route path="/:artistSlug/:songSlug/:hookSlug" element={
              <Suspense fallback={<HookEmbedFallback />}><ShareableHook /></Suspense>
            } />

            {/* ── Main app: full provider tree ── */}
            <Route path="/*" element={
              <AuthProvider>
                <SiteCopyProvider>
                
                <SidebarProvider defaultOpen={true}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/CrowdFit" replace />} />
                    <Route path="/CrowdFit" element={<Index />} />
                    <Route path="/HookFit" element={<Index />} />
                    <Route path="/SongFit" element={<Navigate to="/CrowdFit" replace />} />
                    <Route path="/ProFit" element={<Index />} />
                    <Route path="/ProFit/:projectId" element={<Index />} />
                    <Route path="/PlaylistFit" element={<Index />} />
                    <Route path="/PlaylistFit/:projectId" element={<Index />} />
                    <Route path="/MixFit" element={<Index />} />
                    <Route path="/MixFit/:projectId" element={<Index />} />
                    <Route path="/LyricFit" element={<Index />} />
                    <Route path="/LyricFit/:projectId" element={<Index />} />
                    <Route path="/HitFit" element={<Index />} />
                    <Route path="/HitFit/:projectId" element={<Index />} />
                    <Route path="/DreamFit" element={<Index />} />
                    <Route path="/VibeFit" element={<Index />} />
                    <Route path="/VibeFit/:projectId" element={<Index />} />
                    <Route path="/crowdfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/lyricfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/hookfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/mixfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/hitfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/playlistfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/dreamfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/answers/:slug" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/blog/:slug" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                    <Route path="/about" element={<Suspense fallback={<PageLayout title="toolsFM story" subtitle="What we built and why." />}><PageLayout title="toolsFM story" subtitle="What we built and why."><About /></PageLayout></Suspense>} />
                    <Route
                      path="/admin"
                      element={
                        <Suspense fallback={<PageLayout subtitle="Admin"><div className="p-6 space-y-4"><div className="h-5 w-48 rounded bg-muted animate-pulse" /><div className="h-[400px] w-full rounded-xl bg-muted/50 animate-pulse" /></div></PageLayout>}>
                          <Admin />
                        </Suspense>
                      }
                    />
                    <Route path="/auth" element={<Suspense fallback={<PageLayout title="Join the FMly" subtitle="Come for the tools. Stay for the FMLY." />}><PageLayout title="Join the FMly" subtitle="Come for the tools. Stay for the FMLY."><Auth /></PageLayout></Suspense>} />
                    <Route path="/terms" element={<Suspense fallback={<PageLayout title="Let's agree" subtitle="Play nice, make music, have fun" />}><PageLayout title="Let's agree" subtitle="Play nice, make music, have fun"><Terms /></PageLayout></Suspense>} />
                    <Route path="/Signals" element={
                      <Suspense fallback={<PageLayout title="Signals" subtitle="What your music is doing right now" />}>
                        <PageLayout title="Signals" subtitle="What your music is doing right now">
                          <SignalsPanel />
                        </PageLayout>
                      </Suspense>
                    } />
                    <Route path="/profile" element={<Suspense fallback={<PageLayout title="Profile" />}><PageLayout title="Profile"><Profile /></PageLayout></Suspense>} />
                    <Route path="/reset-password" element={<Suspense fallback={<PageLayout title="Reset Password" />}><PageLayout title="Reset Password"><ResetPassword /></PageLayout></Suspense>} />
                    <Route path="/u/:userId" element={<Suspense fallback={<PageLayout title="Artist Profile" subtitle="Fit for the spotlight" />}><PageLayout title="Artist Profile" subtitle="Fit for the spotlight"><PublicProfile /></PageLayout></Suspense>} />
                    <Route path="/song/:postId" element={<Suspense fallback={<PageLayout title="Song Details" subtitle="Submission stats" />}><PageLayout title="Song Details" subtitle="Submission stats"><SongDetail /></PageLayout></Suspense>} />
                    <Route path="/artist/:username" element={<Suspense fallback={null}><ArtistStage /></Suspense>} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<Suspense fallback={<PageLayout />}><PageLayout><NotFound /></PageLayout></Suspense>} />
                  </Routes>
                </SidebarProvider>
                <Suspense fallback={<div aria-hidden className="pointer-events-none fixed bottom-0 right-0 h-12 w-12 opacity-0" />}>
                  <FitWidget />
                </Suspense>
                </SiteCopyProvider>
              </AuthProvider>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
