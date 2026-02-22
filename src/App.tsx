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

import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import SongDetail from "./pages/SongDetail";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import ArtistStage from "./pages/ArtistStage";
// Lazy-load ShareableHook — standalone page, no need in main bundle
const ShareableHook = lazy(() => import("./pages/ShareableHook"));

const queryClient = new QueryClient();

/** Skeleton fallback for the hook embed — feels instant */
const HookEmbedFallback = () => (
  <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-6">
    {/* Title area */}
    <div className="w-full max-w-md space-y-3">
      <div className="h-6 w-3/4 mx-auto rounded-md bg-white/10 animate-pulse" />
      <div className="h-4 w-1/2 mx-auto rounded-md bg-white/[0.06] animate-pulse" />
    </div>
    {/* Canvas placeholder */}
    <div className="w-full max-w-lg aspect-square rounded-xl bg-white/[0.04] animate-pulse" />
    {/* Controls bar */}
    <div className="w-full max-w-md flex items-center justify-center gap-4">
      <div className="h-10 w-10 rounded-full bg-white/10 animate-pulse" />
      <div className="h-10 flex-1 rounded-lg bg-white/[0.06] animate-pulse" />
      <div className="h-10 w-10 rounded-full bg-white/10 animate-pulse" />
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
                    <Route path="/about" element={<PageLayout title="toolsFM story" subtitle="What we built and why."><About /></PageLayout>} />
                    <Route path="/admin" element={<Admin />} />
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
