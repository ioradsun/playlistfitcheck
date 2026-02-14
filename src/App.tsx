import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import Index from "./pages/Index";
import HowScoringWorks from "./pages/HowScoringWorks";
import OurStory from "./pages/OurStory";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

const WithNavbar = ({ children }: { children: ReactNode }) => (
  <>
    <Navbar />
    {children}
  </>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/SongFit" element={<Index />} />
            <Route path="/ProFit" element={<Index />} />
            <Route path="/PlaylistFit" element={<Index />} />
            <Route path="/MixFit" element={<Index />} />
            <Route path="/LyricFit" element={<Index />} />
            <Route path="/HitFit" element={<Index />} />
            <Route path="/how-scoring-works" element={<WithNavbar><HowScoringWorks /></WithNavbar>} />
            <Route path="/our-story" element={<WithNavbar><OurStory /></WithNavbar>} />
            <Route path="/admin" element={<WithNavbar><Admin /></WithNavbar>} />
            <Route path="/auth" element={<WithNavbar><Auth /></WithNavbar>} />
            <Route path="/profile" element={<WithNavbar><Profile /></WithNavbar>} />
            <Route path="/reset-password" element={<WithNavbar><ResetPassword /></WithNavbar>} />
            <Route path="/u/:userId" element={<WithNavbar><PublicProfile /></WithNavbar>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<WithNavbar><NotFound /></WithNavbar>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
