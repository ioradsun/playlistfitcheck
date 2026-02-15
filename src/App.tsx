import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PageLayout } from "@/components/PageLayout";
import Index from "./pages/Index";
import HowScoringWorks from "./pages/HowScoringWorks";

import About from "./pages/About";

import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SidebarProvider defaultOpen={true}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/SongFit" element={<Index />} />
              <Route path="/ProFit" element={<Index />} />
              <Route path="/PlaylistFit" element={<Index />} />
              <Route path="/MixFit" element={<Index />} />
              <Route path="/LyricFit" element={<Index />} />
              <Route path="/HitFit" element={<Index />} />
              <Route path="/DreamFit" element={<Index />} />
              <Route path="/how-scoring-works" element={<PageLayout title="How Scoring Works"><HowScoringWorks /></PageLayout>} />
              <Route path="/about" element={<PageLayout title="tools.fm story" subtitle="What we built and why."><About /></PageLayout>} />
              <Route path="/admin" element={<PageLayout title="Admin"><Admin /></PageLayout>} />
              <Route path="/auth" element={<PageLayout title="Account"><Auth /></PageLayout>} />
              <Route path="/terms" element={<PageLayout title="Terms"><Terms /></PageLayout>} />
              <Route path="/profile" element={<PageLayout title="Profile"><Profile /></PageLayout>} />
              <Route path="/reset-password" element={<PageLayout title="Reset Password"><ResetPassword /></PageLayout>} />
              <Route path="/u/:userId" element={<PageLayout><PublicProfile /></PageLayout>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<PageLayout><NotFound /></PageLayout>} />
            </Routes>
          </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
