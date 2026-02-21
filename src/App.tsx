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
import ShareableHook from "./pages/ShareableHook";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="tfm-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
                <Route path="/:artistSlug/:songSlug/:hookSlug" element={<ShareableHook />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<PageLayout><NotFound /></PageLayout>} />
              </Routes>
            </SidebarProvider>
            <FitWidget />
            </WalletProvider>
            </SiteCopyProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
