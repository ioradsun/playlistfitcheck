import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteCopyProvider } from "@/hooks/useSiteCopy";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WalletProvider } from "@/components/crypto/WalletProvider";
import { PageLayout } from "@/components/PageLayout";
import { FitWidget } from "@/components/FitWidget";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";

import About from "./pages/About";

const Admin = lazy(() => import("./pages/Admin"));
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import SongDetail from "./pages/SongDetail";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import ArtistStage from "./pages/ArtistStage";
import SeoPages from "./pages/SeoPages";
// Lazy-load ShareableHook — standalone page, no need in main bundle
const ShareableHook = lazy(() => import("./pages/ShareableHook"));
// Lazy-load ShareableLyricDance — standalone page
const ShareableLyricDance = lazy(() => import("./pages/ShareableLyricDance"));

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
              <Suspense fallback={<HookEmbedFallback />}><ShareableLyricDance /></Suspense>
            } />
            {/* ── Hook embed: lightweight path — no Auth/SiteCopy/Wallet/Sidebar overhead ── */}
            <Route path="/:artistSlug/:songSlug/:hookSlug" element={
              <Suspense fallback={<HookEmbedFallback />}><ShareableHook /></Suspense>
            } />

            {/* ── Main app: full provider tree ── */}
            <Route path="/*" element={
              <AuthProvider>
                <SiteCopyProvider>
                <WalletProvider>
                <SidebarProvider defaultOpen={true}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/CrowdFit" element={<Index />} />
                    <Route path="/HookFit" element={<Index />} />
                    <Route path="/SongFit" element={<Index />} />
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
                    <Route path="/crowdfit" element={<SeoPages />} />
                    <Route path="/lyricfit" element={<SeoPages />} />
                    <Route path="/hookfit" element={<SeoPages />} />
                    <Route path="/mixfit" element={<SeoPages />} />
                    <Route path="/hitfit" element={<SeoPages />} />
                    <Route path="/playlistfit" element={<SeoPages />} />
                    <Route path="/dreamfit" element={<SeoPages />} />
                    <Route path="/answers/:slug" element={<SeoPages />} />
                    <Route path="/blog/:slug" element={<SeoPages />} />
                    <Route path="/about" element={<PageLayout title="toolsFM story" subtitle="What we built and why."><About /></PageLayout>} />
                    <Route
                      path="/admin"
                      element={
                        <Suspense fallback={<PageLayout subtitle="Admin" />}>
                          <Admin />
                        </Suspense>
                      }
                    />
                    <Route path="/auth" element={<PageLayout title="Join the FMly" subtitle="Come for the tools. Stay for the FMLY."><Auth /></PageLayout>} />
                    <Route path="/terms" element={<PageLayout title="Let's agree" subtitle="Play nice, make music, have fun"><Terms /></PageLayout>} />
                    <Route path="/profile" element={<PageLayout title="Profile"><Profile /></PageLayout>} />
                    <Route path="/reset-password" element={<PageLayout title="Reset Password"><ResetPassword /></PageLayout>} />
                    <Route path="/u/:userId" element={<PageLayout title="Artist Profile" subtitle="Fit for the spotlight"><PublicProfile /></PageLayout>} />
                    <Route path="/song/:postId" element={<PageLayout title="Song Details" subtitle="Submission stats"><SongDetail /></PageLayout>} />
                    <Route path="/artist/:username" element={<ArtistStage />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<PageLayout><NotFound /></PageLayout>} />
                  </Routes>
                </SidebarProvider>
                <FitWidget />
                </WalletProvider>
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
