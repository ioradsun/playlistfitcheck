/**
 * MainAppShell — Full provider tree + routes for the main app.
 * Lazy-loaded so embed routes (lyric-dance, hook) never download
 * AuthProvider, SiteCopyProvider, SidebarProvider, Toasters, Index, etc.
 */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteCopyProvider } from "@/hooks/useSiteCopy";
import { SidebarProvider } from "@/components/ui/sidebar";
import { VoteGateProvider } from "@/hooks/useVoteGate";
import { Navigate, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AdminPageImport } from "@/lib/routePrefetch";
import { importWithRetry } from "@/lib/importWithRetry";

const Index = lazy(() =>
  importWithRetry(
    () => import("./pages/Index"),
    () => import(/* @vite-ignore */ `./pages/Index.tsx?t=${Date.now()}`),
  ),
);
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
const FitWidget = lazy(() => import("@/components/FitWidget").then(m => ({ default: m.FitWidget })));
const SignalsPanel = lazy(() => import("@/components/signals/SignalsPanel").then(m => ({ default: m.SignalsPanel })));
const PageLayout = lazy(() => import("@/components/PageLayout").then(m => ({ default: m.PageLayout })));
const Admin = lazy(AdminPageImport);

export default function MainAppShell() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('__LYRIC_DANCE_LIGHTNING_BAR')) {
        (window as any).__LYRIC_DANCE_LIGHTNING_BAR = true;
      }
    } catch {}
  }, []);

  return (
    <AuthProvider>
      <SiteCopyProvider>
        <Toaster />
        <Sonner />
        <SidebarProvider defaultOpen={true}>
          <VoteGateProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/CrowdFit" replace />} />
              <Route path="/CrowdFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/HookFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/SongFit" element={<Navigate to="/CrowdFit" replace />} />
              <Route path="/ProFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/ProFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/PlaylistFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/PlaylistFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/MixFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/MixFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/LyricFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/LyricFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/HitFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/HitFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/DreamFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/VibeFit" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/VibeFit/:projectId" element={<Suspense fallback={null}><Index /></Suspense>} />
              <Route path="/crowdfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/lyricfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/hookfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/mixfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/hitfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/playlistfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/dreamfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/answers/:slug" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/blog/:slug" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
              <Route path="/about" element={<Suspense fallback={null}><PageLayout title="toolsFM story" subtitle="What we built and why."><About /></PageLayout></Suspense>} />
              <Route
                path="/admin"
                element={
                  <Suspense fallback={null}>
                    <Admin />
                  </Suspense>
                }
              />
              <Route path="/auth" element={<Suspense fallback={null}><PageLayout title="Join the FMly" subtitle="Come for the tools. Stay for the FMLY."><Auth /></PageLayout></Suspense>} />
              <Route path="/terms" element={<Suspense fallback={null}><PageLayout title="Let's agree" subtitle="Play nice, make music, have fun"><Terms /></PageLayout></Suspense>} />
              <Route path="/Signals" element={
                <Suspense fallback={null}>
                  <PageLayout title="Signals" subtitle="What your music is doing right now">
                    <SignalsPanel />
                  </PageLayout>
                </Suspense>
              } />
              <Route path="/profile" element={<Suspense fallback={null}><PageLayout title="Profile"><Profile /></PageLayout></Suspense>} />
              <Route path="/reset-password" element={<Suspense fallback={null}><PageLayout title="Reset Password"><ResetPassword /></PageLayout></Suspense>} />
              <Route path="/u/:userId" element={<Suspense fallback={null}><PageLayout title="Artist Profile" subtitle="Fit for the spotlight"><PublicProfile /></PageLayout></Suspense>} />
              <Route path="/song/:postId" element={<Suspense fallback={null}><PageLayout title="Song Details" subtitle="Submission stats"><SongDetail /></PageLayout></Suspense>} />
              <Route path="/artist/:username" element={<Suspense fallback={null}><ArtistStage /></Suspense>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<Suspense fallback={null}><PageLayout><NotFound /></PageLayout></Suspense>} />
            </Routes>
          </VoteGateProvider>
        </SidebarProvider>
        <Suspense fallback={<div aria-hidden className="pointer-events-none fixed bottom-0 right-0 h-12 w-12 opacity-0" />}>
          <FitWidget />
        </Suspense>
      </SiteCopyProvider>
    </AuthProvider>
  );
}