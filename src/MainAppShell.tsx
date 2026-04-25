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
import { DmProvider } from "@/hooks/useDmContext";
import { DmCompose } from "@/components/signals/DmCompose";
import { Navigate, Routes, Route, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AdminPageImport } from "@/lib/routePrefetch";
import { importWithRetry } from "@/lib/importWithRetry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ROUTES, LEGACY_REDIRECTS } from "@/lib/routes";

const Index = lazy(() =>
  importWithRetry(
    () => import("./pages/Index"),
    () => import(/* @vite-ignore */ `./pages/Index.tsx?t=${Date.now()}`),
  ),
);
const About = lazy(() => import("./pages/About"));
const Auth = lazy(() => import("./pages/Auth"));
const ArtistDashboard = lazy(() => import("./pages/ArtistDashboard"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const SongDetail = lazy(() => import("./pages/SongDetail"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Terms = lazy(() => import("./pages/Terms"));
const ArtistStage = lazy(() => import("./pages/ArtistStage"));
const SeoPages = lazy(() => import("./pages/SeoPages"));
const FitWidget = lazy(() => importWithRetry(() => import("@/components/FitWidget").then(m => ({ default: m.FitWidget }))));
const SignalsPanel = lazy(() => importWithRetry(() => import("@/components/signals/SignalsPanel").then(m => ({ default: m.SignalsPanel }))));
const PageLayout = lazy(() => importWithRetry(() => import("@/components/PageLayout").then(m => ({ default: m.PageLayout }))));
const Admin = lazy(AdminPageImport);

/** Redirects legacy paths like /LyricFit/abc123 → /the-director/abc123 */
function LegacyWildcardRedirect({ target }: { target: string }) {
  const { "*": rest } = useParams<{ "*": string }>();
  return <Navigate to={rest ? `${target}/${rest}` : target} replace />;
}

export default function MainAppShell() {
  return (
    <AuthProvider>
      <SiteCopyProvider>
        <Toaster />
        <Sonner />
        <DmProvider>
          <SidebarProvider defaultOpen={true}>
            <VoteGateProvider>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Navigate to={ROUTES.fmly} replace />} />

                  {/* ── Primary tool routes ── */}
                  <Route path={ROUTES.fmly} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.manager} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.manager}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.plug} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.plug}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.engineer} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.engineer}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.director} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.director}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.ar} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.ar}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.fmlyMatters} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={ROUTES.creative} element={<Suspense fallback={null}><Index /></Suspense>} />
                  <Route path={`${ROUTES.creative}/:projectId`} element={<Suspense fallback={null}><Index /></Suspense>} />

                  {/* ── Legacy redirects (exact + wildcard) ── */}
                  {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                    <Route key={from} path={from} element={<Navigate to={to} replace />} />
                  ))}
                  {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                    <Route key={`${from}/*`} path={`${from}/*`} element={<LegacyWildcardRedirect target={to} />} />
                  ))}

                  {/* ── SEO pages ── */}
                  <Route path="/fmly-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/the-director-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/the-engineer-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/the-ar-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/the-plug-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/fmly-matters-seo" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  {/* Legacy SEO paths */}
                  <Route path="/crowdfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
                  <Route path="/lyricfit" element={<Suspense fallback={null}><SeoPages /></Suspense>} />
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
                      <PageLayout title="Signals" subtitle="Your music connections">
                        <SignalsPanel />
                      </PageLayout>
                    </Suspense>
                  } />
                  <Route path="/profile" element={<Suspense fallback={null}><PageLayout title="Profile"><PublicProfile /></PageLayout></Suspense>} />
                  <Route path="/dashboard" element={<Suspense fallback={null}><ArtistDashboard /></Suspense>} />
                  <Route path="/reset-password" element={<Suspense fallback={null}><PageLayout title="Reset Password"><ResetPassword /></PageLayout></Suspense>} />
                  <Route path="/u/:userId" element={<Suspense fallback={null}><PageLayout title="Profile"><PublicProfile /></PageLayout></Suspense>} />
                  <Route path="/song/:postId" element={<Suspense fallback={null}><PageLayout title="Song Details" subtitle="Submission stats"><SongDetail /></PageLayout></Suspense>} />
                  <Route path="/artist/:username" element={<Suspense fallback={null}><ArtistStage /></Suspense>} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<Suspense fallback={null}><PageLayout><NotFound /></PageLayout></Suspense>} />
                </Routes>
              </ErrorBoundary>
            </VoteGateProvider>
          </SidebarProvider>
          <DmCompose />
        </DmProvider>
        <Suspense fallback={<div aria-hidden className="pointer-events-none fixed bottom-0 right-0 h-12 w-12 opacity-0" />}>
          <FitWidget />
        </Suspense>
      </SiteCopyProvider>
    </AuthProvider>
  );
}
