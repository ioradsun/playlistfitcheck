import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { PlaylistInputSection } from "@/components/PlaylistInput";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { computePlaylistHealth, type PlaylistInput, type HealthOutput } from "@/lib/playlistHealthEngine";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { VibeAnalysis } from "@/components/VibeCard";
import type { SongFitAnalysis } from "@/components/SongFitCard";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { sessionAudio } from "@/lib/sessionAudioCache";
import type { MixProjectData } from "@/hooks/useMixProjectStorage";
import { AppSidebar } from "@/components/AppSidebar";

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Music, ChevronRight, ArrowLeft } from "lucide-react";

const MixFitCheck = lazy(() => import("@/pages/MixFitCheck"));
const LyricFitTab = lazy(() => import("@/components/lyric/LyricFitTab").then((module) => ({ default: module.LyricFitTab })));
const HitFitTab = lazy(() => import("@/components/hitfit/HitFitTab").then((module) => ({ default: module.HitFitTab })));
const ProFitTab = lazy(() => import("@/components/profit/ProFitTab").then((module) => ({ default: module.ProFitTab })));
const SongFitTab = lazy(() => import("@/components/songfit/SongFitTab").then((module) => ({ default: module.SongFitTab })));
const HookFitTab = lazy(() => import("@/components/hookfit/HookFitTab").then((module) => ({ default: module.HookFitTab })));
const DreamFitTab = lazy(() => import("@/components/dreamfit/DreamFitTab").then((module) => ({ default: module.DreamFitTab })));
const VibeFitTab = lazy(() => import("@/components/vibefit/VibeFitTab").then((module) => ({ default: module.VibeFitTab })));

interface AnalysisResult {
  output: HealthOutput;
  input: PlaylistInput;
  name?: string;
  key: number;
  trackList?: { name: string; artists: string }[];
  songUrl?: string;
}

const AnalysisLoadingScreen = ({ hasSong }: { hasSong: boolean }) => (
  <motion.div
    className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <div className="relative">
      <div className="w-20 h-20 rounded-full border-2 border-primary/30 flex items-center justify-center">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    </div>
    <div className="text-center space-y-2">
      <h2 className="text-lg font-semibold">Analyzing{hasSong ? " fit" : " playlist"}...</h2>
      <p className="text-sm text-muted-foreground">
        {hasSong
          ? "Running sonic fit analysis and playlist health check"
          : "Evaluating playlist health and generating vibe analysis"}
      </p>
    </div>
  </motion.div>
);

const TabChunkFallback = () => (
  <div className="flex-1 flex items-center justify-center py-8 text-muted-foreground">
    <Loader2 size={18} className="animate-spin" />
  </div>
);

/** Contextual skeleton shown during project transitions — prevents blank flash */
const ProjectTransitionSkeleton = ({ tool }: { tool: string }) => {
  if (tool === "lyric") {
    return (
      <div className="flex-1 flex flex-col min-h-0 animate-pulse">
        {/* Toggle bar */}
        <div className="border-b border-border/40 h-11 flex items-center justify-center gap-8">
          <div className="h-3 w-12 rounded bg-muted" />
          <div className="h-3 w-8 rounded bg-muted/60" />
        </div>
        {/* Waveform area */}
        <div className="h-16 mx-4 mt-4 rounded-lg bg-muted/30" />
        {/* Lyrics lines */}
        <div className="flex-1 px-4 py-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-muted/20" style={{ width: `${60 + Math.random() * 30}%` }} />
          ))}
        </div>
      </div>
    );
  }
  if (tool === "mix") {
    return (
      <div className="flex-1 flex flex-col min-h-0 animate-pulse px-4 py-6 space-y-4">
        <div className="h-8 w-48 rounded bg-muted/30" />
        <div className="h-32 rounded-lg bg-muted/20" />
        <div className="h-32 rounded-lg bg-muted/20" />
      </div>
    );
  }
  if (tool === "hitfit") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center animate-pulse px-4 py-6 space-y-4">
        <div className="w-20 h-20 rounded-full bg-muted/20" />
        <div className="h-4 w-40 rounded bg-muted/30" />
        <div className="h-3 w-56 rounded bg-muted/20" />
      </div>
    );
  }
  return <TabChunkFallback />;
};

const PATH_TO_TAB: Record<string, string> = {
  "/CrowdFit": "songfit",
  "/HookFit": "hookfit",
  "/SongFit": "songfit", // legacy redirect support
  "/ProFit": "profit",
  "/PlaylistFit": "playlist",
  "/MixFit": "mix",
  "/LyricFit": "lyric",
  "/HitFit": "hitfit",
  "/DreamFit": "dreamfit",
  "/VibeFit": "vibefit",
};

// Labels and subtitles are now driven by useSiteCopy in the component below

const Index = () => {
  const { user, loading: authLoading, profile } = useAuth();
  const siteCopy = useSiteCopy();
  const { projectId } = useParams<{ projectId?: string }>();
  const TAB_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(siteCopy.tools).map(([k, v]) => [k, v.label])
  );
  const TAB_SUBTITLES: Record<string, string> = Object.fromEntries(
    Object.entries(siteCopy.tools).map(([k, v]) => [k, v.pill])
  );
  const hookfitEnabled = siteCopy.features?.tools_enabled?.hookfit !== false;
  const location = useLocation();
  const navigate = useNavigate();
  const autoRunRef = useRef(false);
  const profitAutoRef = useRef(false);
  const playlistQuota = useUsageQuota("playlist");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  // Derive active tab from URL path (strip /:projectId suffix)
  const basePath = location.pathname.replace(/\/[0-9a-f-]{36}$/, "");
  const rawTabFromPath = PATH_TO_TAB[basePath] || PATH_TO_TAB[location.pathname] || "songfit";
  const tabFromPath = !hookfitEnabled && rawTabFromPath === "hookfit" ? "songfit" : rawTabFromPath;
  const [activeTab, setActiveTabState] = useState(tabFromPath);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([tabFromPath]));
  
  // Sync tab when path changes (e.g. browser back/forward)
  useEffect(() => {
    const bp = location.pathname.replace(/\/[0-9a-f-]{36}$/, "");
    const tRaw = PATH_TO_TAB[bp] || PATH_TO_TAB[location.pathname];
    const t = !hookfitEnabled && tRaw === "hookfit" ? "songfit" : tRaw;
    if (t && t !== activeTab) setActiveTabState(t);
    // Redirect bare "/" to "/CrowdFit" — but NOT if there's a code/token in the URL (auth callback)
    // If there's a ref param, redirect to signup
    const refParam = new URLSearchParams(location.search).get("ref");
    if (location.pathname === "/" && refParam) {
      navigate(`/auth?mode=signup&ref=${refParam}`, { replace: true });
      return;
    }
    if (location.pathname === "/" && !location.state && !location.search && !window.location.hash) {
      navigate("/CrowdFit", { replace: true });
    }
    if (location.pathname === "/SongFit") {
      navigate("/CrowdFit", { replace: true });
    }
    if (!hookfitEnabled && (bp === "/HookFit" || location.pathname === "/HookFit")) {
      navigate("/CrowdFit", { replace: true });
    }
  }, [location.pathname, hookfitEnabled]);

  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Auto-load project from URL param for any tool
  const projectLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId) {
      projectLoadedRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab !== "lyric" || !projectId || !user) return;
    // Skip re-fetch if we already have this project loaded
    if (projectLoadedRef.current === projectId) return;

    (async () => {
      const { data, error } = await supabase
        .from("saved_lyrics")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) return;
      setLoadedLyric(data);
      projectLoadedRef.current = projectId;
    })();
  }, [activeTab, projectId, user?.id]);

  useEffect(() => {
    if (!projectId || projectLoadedRef.current === projectId || !user) return;
    const tab = activeTab;
    
    // Lyric projects are handled by the dedicated effect above
    if (tab === "lyric") {
      projectLoadedRef.current = projectId;
      return;
    }
    
    // If already loaded via sidebar, just mark as loaded
    const alreadyLoaded = 
      (tab === "mix" && loadedMixProject?.id === projectId) ||
      (tab === "profit" && profitSavedReport?.reportId === projectId);
    if (alreadyLoaded) {
      projectLoadedRef.current = projectId;
      return;
    }
    projectLoadedRef.current = projectId;

    const pathMap: Record<string, string> = { lyric: "/LyricFit", mix: "/MixFit", hitfit: "/HitFit", profit: "/ProFit", vibefit: "/VibeFit", playlist: "/PlaylistFit" };

    (async () => {
      let data: any = null;
      let error: any = null;
      if (tab === "mix") {
        const r = await supabase.from("mix_projects").select("*").eq("id", projectId).maybeSingle();
        data = r.data; error = r.error;
      } else if (tab === "hitfit") {
        const r = await supabase.from("saved_hitfit").select("*").eq("id", projectId).maybeSingle();
        data = r.data; error = r.error;
      } else if (tab === "profit") {
        const r = await supabase.from("profit_reports").select("*, profit_artists(*)").eq("id", projectId).maybeSingle();
        data = r.data; error = r.error;
      } else if (tab === "vibefit") {
        const r = await supabase.from("saved_vibefit").select("*").eq("id", projectId).maybeSingle();
        data = r.data; error = r.error;
      } else if (tab === "playlist") {
        const r = await supabase.from("saved_searches").select("*").eq("id", projectId).maybeSingle();
        data = r.data; error = r.error;
      }
      if (error || !data) {
        toast.error("Project not found");
        navigate(pathMap[tab] || "/CrowdFit", { replace: true });
        return;
      }
      // For profit, reshape data to match expected format
      if (tab === "profit" && data.blueprint_json) {
        const artist = (data as any).profit_artists;
        handleLoadProject("profit", {
          reportId: data.id,
          shareToken: data.share_token,
          blueprint: data.blueprint_json,
          artist,
        });
      } else if (tab === "hitfit" && data.analysis_json) {
        handleLoadProject("hitfit", { id: data.id, analysis: data.analysis_json });
      } else {
        handleLoadProject(tab, data);
      }
    })();
  }, [projectId, activeTab, user?.id]);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    setHeaderProject(null);
  }, []);
  
  // profitAutoRef kept for other auto-run logic
  
  const [headerProject, setHeaderProject] = useState<{ title: string; onBack: () => void; rightContent?: React.ReactNode } | null>(null);
  const [loadedMixProject, setLoadedMixProject] = useState<MixProjectData | null>(null);
  const [loadedLyric, setLoadedLyric] = useState<any>(null);
  const [vibeAnalysis, setVibeAnalysis] = useState<VibeAnalysis | null>(null);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [songFitAnalysis, setSongFitAnalysis] = useState<SongFitAnalysis | null>(null);
  const [songFitLoading, setSongFitLoading] = useState(false);
  const savedSearchIdRef = useRef<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const refreshSidebar = useCallback(() => setSidebarRefreshKey(k => k + 1), []);

  const isFullyLoaded = useMemo(() => {
    if (!result) return false;
    if (vibeLoading) return false;
    if (songFitLoading) return false;
    return true;
  }, [result, vibeLoading, songFitLoading]);

  const fetchVibeAnalysis = useCallback(async (data: PlaylistInput, trackList?: { name: string; artists: string }[]) => {
    if (!trackList || trackList.length === 0) return;
    setVibeLoading(true);
    try {
      const { data: analysis, error } = await supabase.functions.invoke("playlist-vibe", {
        body: {
          playlistName: data.playlistName,
          description: data.description,
          ownerName: data.ownerName,
          trackList,
        },
      });
      if (error) throw error;
      if (analysis?.error) throw new Error(analysis.error);
      setVibeAnalysis(analysis as VibeAnalysis);
    } catch (e) {
      console.error("Vibe analysis error:", e);
    } finally {
      setVibeLoading(false);
    }
  }, []);

  const fetchSongFitAnalysis = useCallback(async (songUrl: string, data: PlaylistInput, trackList: { name: string; artists: string }[] | undefined, healthOutput: HealthOutput) => {
    if (!trackList || trackList.length === 0) return;
    setSongFitLoading(true);
    try {
      const { data: analysis, error } = await supabase.functions.invoke("song-fit", {
        body: {
          songUrl,
          playlistName: data.playlistName,
          description: data.description,
          ownerName: data.ownerName,
          trackList,
          healthScore: healthOutput.summary.healthScore,
          healthLabel: healthOutput.summary.healthLabel,
          scoreBreakdown: healthOutput.scoreBreakdown,
          narrative: healthOutput.narrative,
          recommendation: healthOutput.recommendation,
          pitchSuitability: healthOutput.summary.pitchSuitability,
        },
      });
      if (error) throw error;
      if (analysis?.error) throw new Error(analysis.error);
      setSongFitAnalysis(analysis as SongFitAnalysis);
    } catch (e) {
      console.error("Song fit analysis error:", e);
    } finally {
      setSongFitLoading(false);
    }
  }, []);

  const saveSearch = useCallback(async (data: PlaylistInput, output: HealthOutput, songUrl?: string) => {
    if (!user) return;
    try {
      const { data: inserted } = await supabase.from("saved_searches").insert({
        user_id: user.id,
        playlist_url: (data as any).playlistUrl ?? "",
        playlist_name: data.playlistName,
        song_url: songUrl ?? null,
        song_name: (data as any)._songName ?? null,
        health_score: output.summary.healthScore,
        health_label: output.summary.healthLabel,
      }).select("id").single();
      if (inserted) {
        savedSearchIdRef.current = inserted.id;
        navigate(`/PlaylistFit/${inserted.id}`, { replace: true });
      }
    } catch (e) {
      console.error("Failed to save search:", e);
    }
  }, [user]);

  const handleAnalyze = useCallback((data: PlaylistInput & { _trackList?: { name: string; artists: string }[]; _songUrl?: string }) => {
    if (!playlistQuota.canUse) {
      toast.error(playlistQuota.tier === "anonymous" ? "Sign up for more uses" : "Invite an artist to unlock unlimited");
      return;
    }
    const trackList = data._trackList;
    const songUrl = data._songUrl;
    const output = computePlaylistHealth(data);
    setVibeAnalysis(null);
    setSongFitAnalysis(null);
    setVibeLoading(false);
    setSongFitLoading(false);
    setResult({ output, input: data, name: data.playlistName, key: Date.now(), trackList, songUrl });
    saveSearch(data, output, songUrl);
    playlistQuota.increment();
    if (trackList && trackList.length > 0) {
      fetchVibeAnalysis(data, trackList);
      if (songUrl) {
        fetchSongFitAnalysis(songUrl, data, trackList, output);
      }
    }
  }, [fetchVibeAnalysis, fetchSongFitAnalysis, saveSearch, playlistQuota]);

  useEffect(() => {
    if (!isFullyLoaded || !result || !savedSearchIdRef.current) return;
    const reportData = {
      input: result.input,
      output: result.output,
      trackList: result.trackList,
      songUrl: result.songUrl,
      vibeAnalysis,
      songFitAnalysis,
    };
    supabase.from("saved_searches").update({
      report_data: reportData as any,
      blended_score: songFitAnalysis?.blendedScore ?? null,
      blended_label: songFitAnalysis?.blendedLabel ?? null,
    }).eq("id", savedSearchIdRef.current).then(() => {
      savedSearchIdRef.current = null;
      refreshSidebar();
    });
  }, [isFullyLoaded, result, vibeAnalysis, songFitAnalysis, refreshSidebar]);

  const handleBack = useCallback(() => {
    setResult(null);
    setVibeAnalysis(null);
    setVibeLoading(false);
    setSongFitAnalysis(null);
    setSongFitLoading(false);
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (autoRunRef.current) return;
    
    if (state?.returnTab) {
      const crowdfitPath = "/CrowdFit";
      const TAB_TO_PATH: Record<string, string> = { songfit: crowdfitPath, profit: "/ProFit", playlist: "/PlaylistFit", mix: "/MixFit", lyric: "/LyricFit", hitfit: "/HitFit", dreamfit: "/DreamFit", vibefit: "/VibeFit" };
      setActiveTab(state.returnTab);
      navigate(TAB_TO_PATH[state.returnTab] || crowdfitPath, { replace: true });
      if (!state.reportData && !state.autoRun && !state.loadMixProject && !state.loadLyric) return;
    }

    if (state?.reportData) {
      autoRunRef.current = true;
      navigate("/PlaylistFit", { replace: true });
      const { input, output, vibeAnalysis: vibe, songFitAnalysis: songFit, trackList, songUrl } = state.reportData;
      setResult({ output, input, name: input.playlistName, key: Date.now(), trackList, songUrl });
      setVibeAnalysis(vibe ?? null);
      setSongFitAnalysis(songFit ?? null);
      setVibeLoading(false);
      setSongFitLoading(false);
    } else if (state?.autoRun) {
      autoRunRef.current = true;
      const { playlistUrl, songUrl } = state.autoRun;
      navigate("/PlaylistFit", { replace: true });
      if (!playlistUrl) return;

      (async () => {
        setVibeLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke("spotify-playlist", {
            body: { playlistUrl, sessionId: null, songUrl: songUrl || null },
          });
          if (error) throw new Error(error.message);
          if (data?.error) throw new Error(data.error);
          handleAnalyze({ ...(data as PlaylistInput), _songUrl: songUrl || undefined });
        } catch (e) {
          console.error("Auto-run error:", e);
          toast.error("Failed to load report. Try running PlaylistFit again.");
          setVibeLoading(false);
        }
      })();
    } else if (state?.loadMixProject) {
      autoRunRef.current = true;
      navigate("/MixFit", { replace: true });
      setLoadedMixProject(state.loadMixProject);
      setActiveTab("mix");
    } else if (state?.loadLyric) {
      autoRunRef.current = true;
      navigate("/LyricFit", { replace: true });
      setLoadedLyric(state.loadLyric);
      setActiveTab("lyric");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [profitArtistUrl, setProfitArtistUrl] = useState<string | null>(null);
  const [profitSavedReport, setProfitSavedReport] = useState<any>(null);
  const [profitLoadKey, setProfitLoadKey] = useState(0);
  const [loadedHitFitAnalysis, setLoadedHitFitAnalysis] = useState<any>(null);
  const [loadedVibeFitResult, setLoadedVibeFitResult] = useState<any>(null);
  const [vibeFitLoadKey, setVibeFitLoadKey] = useState(0);

  // Reset all tool state when user logs out
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user && !authLoading) {
      setResult(null);
      setVibeAnalysis(null);
      setSongFitAnalysis(null);
      setLoadedMixProject(null);
      setLoadedLyric(null);
      setProfitArtistUrl(null);
      setProfitSavedReport(null);
      setLoadedHitFitAnalysis(null);
      setLoadedVibeFitResult(null);
      setProfitLoadKey(k => k + 1);
      setVibeFitLoadKey(k => k + 1);
      setSidebarRefreshKey(k => k + 1);
      setHeaderProject(null);
      // Clear all cached audio on logout
      sessionAudio.clearAll();
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  const handleNewLyric = useCallback(() => { setLoadedLyric(null); navigate("/LyricFit", { replace: true }); }, [navigate]);
  const handleNewMix = useCallback(() => { setLoadedMixProject(null); navigate("/MixFit", { replace: true }); }, [navigate]);
  const handleNewHitFit = useCallback(() => { setLoadedHitFitAnalysis(null); navigate("/HitFit", { replace: true }); }, [navigate]);

  // Track if a project transition is in progress for smooth skeleton display
  const [transitionTool, setTransitionTool] = useState<string | null>(null);

  const handleSidebarTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setHeaderProject(null);
    // Reset loaded project for the clicked tool so it opens fresh/new
    // but only if we actually have a loaded project (avoid no-op remounts)
    if (tab === "lyric" && loadedLyric) {
      setTransitionTool("lyric");
      setLoadedLyric(null);
      navigate("/LyricFit", { replace: true });
      // Clear transition after React re-renders with new key
      requestAnimationFrame(() => setTransitionTool(null));
    } else if (tab === "mix" && loadedMixProject) {
      setTransitionTool("mix");
      setLoadedMixProject(null);
      navigate("/MixFit", { replace: true });
      requestAnimationFrame(() => setTransitionTool(null));
    } else if (tab === "hitfit" && loadedHitFitAnalysis) {
      setTransitionTool("hitfit");
      setLoadedHitFitAnalysis(null);
      navigate("/HitFit", { replace: true });
      requestAnimationFrame(() => setTransitionTool(null));
    } else if (tab === "profit") {
      setProfitArtistUrl(null);
      setProfitSavedReport(null);
      setProfitLoadKey(k => k + 1);
      navigate("/ProFit", { replace: true });
    } else if (tab === "vibefit") {
      setLoadedVibeFitResult(null);
      setVibeFitLoadKey(k => k + 1);
      navigate("/VibeFit", { replace: true });
    } else if (tab === "playlist") {
      setResult(null);
      setVibeAnalysis(null);
      setSongFitAnalysis(null);
      navigate("/PlaylistFit", { replace: true });
    }
  }, [setActiveTab, navigate, loadedLyric, loadedMixProject, loadedHitFitAnalysis]);

  const handleLoadProject = useCallback((type: string, data: any) => {
    // Only reset state for the tool being loaded — don't touch other tools'
    // persisted state (e.g. loadedLyric) to prevent unnecessary remounts.
    setResult(null);
    setVibeAnalysis(null);
    setSongFitAnalysis(null);
    if (type === "mix") setLoadedMixProject(null);
    if (type === "profit") { setProfitArtistUrl(null); setProfitSavedReport(null); }
    if (type === "hitfit") setLoadedHitFitAnalysis(null);
    if (type === "vibefit") setLoadedVibeFitResult(null);

    switch (type) {
      case "profit": {
        if (data?.reportId && data?.blueprint && data?.artist) {
          setProfitSavedReport(data);
          setProfitLoadKey(k => k + 1);
          navigate(`/ProFit/${data.reportId}`, { replace: true });
        } else {
          const artistId = data?.spotify_artist_id;
          if (artistId) {
            setProfitArtistUrl(`https://open.spotify.com/artist/${artistId}`);
            setProfitLoadKey(k => k + 1);
          }
        }
        break;
      }
      case "hitfit": {
        if (data?.analysis) {
          setLoadedHitFitAnalysis(data.analysis);
          if (data.id) navigate(`/HitFit/${data.id}`, { replace: true });
        }
        break;
      }
      case "playlist": {
        if (data?.report_data) {
          const { input, output, vibeAnalysis: vibe, songFitAnalysis: songFit, trackList, songUrl } = data.report_data;
          setResult({ output, input, name: input?.playlistName, key: Date.now(), trackList, songUrl });
          setVibeAnalysis(vibe ?? null);
          setSongFitAnalysis(songFit ?? null);
          setVibeLoading(false);
          setSongFitLoading(false);
          if (data.id) navigate(`/PlaylistFit/${data.id}`, { replace: true });
        } else if (data?.playlist_url) {
          (async () => {
            setVibeLoading(true);
            try {
              const { data: plData, error } = await supabase.functions.invoke("spotify-playlist", {
                body: { playlistUrl: data.playlist_url, sessionId: null, songUrl: data.song_url || null },
              });
              if (error) throw new Error(error.message);
              if (plData?.error) throw new Error(plData.error);
              handleAnalyze({ ...(plData as PlaylistInput), _songUrl: data.song_url || undefined });
            } catch (e) {
              console.error("Re-run error:", e);
              toast.error("Failed to load report. Try running PlaylistFit again.");
              setVibeLoading(false);
            }
          })();
        }
        break;
      }
      case "mix": {
        if (data) {
          const mixData: MixProjectData = {
            id: data.id,
            title: data.title || "",
            notes: data.notes || "",
            mixes: Array.isArray(data.mixes) ? data.mixes : [],
            markerStart: 0,
            markerEnd: 10,
            createdAt: data.created_at || new Date().toISOString(),
            updatedAt: data.updated_at || new Date().toISOString(),
          };
          setLoadedMixProject(mixData);
          if (data.id) navigate(`/MixFit/${data.id}`, { replace: true });
        }
        break;
      }
      case "lyric": {
        if (data) {
          setLoadedLyric(data);
          if (data.id) navigate(`/LyricFit/${data.id}`, { replace: true });
        }
        break;
      }
      case "vibefit": {
        if (data) {
          setLoadedVibeFitResult(data);
          setVibeFitLoadKey((k) => k + 1);
          if (data.id) navigate(`/VibeFit/${data.id}`, { replace: true });
        }
        break;
      }
    }
  }, [handleAnalyze, navigate]);

  const navigateToProject = useCallback((tool: string, id: string) => {
    const pathMap: Record<string, string> = { profit: "ProFit", playlist: "PlaylistFit", mix: "MixFit", lyric: "LyricFit", hitfit: "HitFit", vibefit: "VibeFit" };
    const prefix = pathMap[tool];
    if (prefix && id && location.pathname !== `/${prefix}/${id}`) {
      navigate(`/${prefix}/${id}`, { replace: true });
    }
  }, [navigate, location.pathname]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "profit":
        return <div className="flex-1 flex flex-col min-h-0 overflow-y-auto"><Suspense fallback={<TabChunkFallback />}><ProFitTab key={profitLoadKey} initialArtistUrl={profitArtistUrl} initialSavedReport={profitSavedReport} onProjectSaved={refreshSidebar} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("profit", id)} /></Suspense></div>;
      case "playlist":
        return result ? (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            {!isFullyLoaded ? (
              <div className="flex-1 flex items-center justify-center"><AnalysisLoadingScreen hasSong={!!result?.songUrl} /></div>
            ) : (
              <div className="w-full">
                <ResultsDashboard
                  key={result.key}
                  result={result.output}
                  inputData={result.input}
                  playlistName={result.name}
                  vibeAnalysis={vibeAnalysis}
                  vibeLoading={false}
                  songFitAnalysis={songFitAnalysis}
                  songFitLoading={false}
                  onBack={handleBack}
                  onHeaderProject={setHeaderProject}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
            <PlaylistInputSection onAnalyze={handleAnalyze} />
          </div>
        );
      case "dreamfit":
        return <div className="flex-1 overflow-y-auto px-4 py-6"><Suspense fallback={<TabChunkFallback />}><DreamFitTab /></Suspense></div>;
      case "vibefit":
        return <div className="flex-1 flex flex-col overflow-y-auto px-4 py-6"><Suspense fallback={<TabChunkFallback />}><VibeFitTab key={`vibefit-${vibeFitLoadKey}`} initialResult={loadedVibeFitResult} onProjectSaved={refreshSidebar} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("vibefit", id)} /></Suspense></div>;
      default:
        return null;
    }
  };

  const persistedTabs = ["songfit", "lyric", "mix", "hitfit", ...(hookfitEnabled ? ["hookfit"] : [])];

  return (
    <>
      <AppSidebar activeTab={activeTab} onTabChange={handleSidebarTabChange} onLoadProject={handleLoadProject} refreshKey={sidebarRefreshKey} />
      <SidebarInset className="h-svh !min-h-0 overflow-hidden">
        {/* Minimal top header with pill badge */}
        <header className="sticky top-0 z-40 flex items-center gap-3 h-12 border-b border-border bg-background/80 backdrop-blur-md px-3">
          <SidebarTrigger data-sidebar="trigger" className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground md:hidden">
            <ChevronRight size={16} />
          </SidebarTrigger>
          {headerProject ? (
            <>
              <button onClick={headerProject.onBack} className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <ArrowLeft size={16} />
              </button>
              <span className="text-xs font-semibold">{headerProject.title}</span>
              {headerProject.rightContent && <div className="ml-auto flex items-center gap-2">{headerProject.rightContent}</div>}
            </>
          ) : (
            TAB_SUBTITLES[activeTab] && (
              <span className="font-mono text-[11px] tracking-widest text-primary">
                {TAB_SUBTITLES[activeTab]}
              </span>
            )
          )}
        </header>
        <div className="flex-1 flex flex-col min-h-0">
          {/* SongFitTab stays mounted to preserve feed state — hidden when not active */}
          {visitedTabs.has("songfit") && (
            <div
              id="songfit-scroll-container"
              className={`flex-1 overflow-y-auto px-4 py-6 ${activeTab === "songfit" ? "" : "hidden"}`}
            >
              <Suspense fallback={<TabChunkFallback />}><SongFitTab /></Suspense>
            </div>
          )}
          {/* HookFitTab stays mounted to preserve feed state — hidden when not active */}
          {hookfitEnabled && visitedTabs.has("hookfit") && (
            <div
              className={`flex-1 overflow-y-auto px-4 py-6 ${activeTab === "hookfit" ? "" : "hidden"}`}
            >
              <Suspense fallback={<TabChunkFallback />}><HookFitTab /></Suspense>
            </div>
          )}
          {/* LyricFitTab stays mounted to preserve audio state — hidden when not active */}
          {visitedTabs.has("lyric") && (
            <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${activeTab === "lyric" ? "" : "hidden"}`}>
              {transitionTool === "lyric"
                ? <ProjectTransitionSkeleton tool="lyric" />
                : <Suspense fallback={<ProjectTransitionSkeleton tool="lyric" />}><LyricFitTab key={loadedLyric?.id || "new"} initialLyric={loadedLyric} onProjectSaved={refreshSidebar} onNewProject={handleNewLyric} onHeaderProject={setHeaderProject} onSavedId={(id) => { projectLoadedRef.current = id; navigateToProject("lyric", id); }} /></Suspense>
              }
            </div>
          )}
          {/* MixFitTab stays mounted to preserve audio state — hidden when not active */}
          {visitedTabs.has("mix") && (
            <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${activeTab === "mix" ? "" : "hidden"}`}>
              {transitionTool === "mix"
                ? <ProjectTransitionSkeleton tool="mix" />
                : <Suspense fallback={<ProjectTransitionSkeleton tool="mix" />}><MixFitCheck key={loadedMixProject?.id || "new"} initialProject={loadedMixProject} onProjectSaved={refreshSidebar} onNewProject={handleNewMix} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("mix", id)} /></Suspense>
              }
            </div>
          )}
          {/* HitFitTab stays mounted to preserve audio state — hidden when not active */}
          {visitedTabs.has("hitfit") && (
            <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-6 ${activeTab === "hitfit" ? "" : "hidden"}`}>
              {transitionTool === "hitfit"
                ? <ProjectTransitionSkeleton tool="hitfit" />
                : loadedHitFitAnalysis
                  ? <Suspense fallback={<ProjectTransitionSkeleton tool="hitfit" />}><HitFitTab key="loaded" initialAnalysis={loadedHitFitAnalysis} onProjectSaved={refreshSidebar} onNewProject={handleNewHitFit} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("hitfit", id)} /></Suspense>
                  : <Suspense fallback={<ProjectTransitionSkeleton tool="hitfit" />}><HitFitTab key="new" initialAnalysis={null} onProjectSaved={refreshSidebar} onNewProject={handleNewHitFit} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("hitfit", id)} /></Suspense>
              }
            </div>
          )}
          {!persistedTabs.includes(activeTab) && renderTabContent()}
        </div>
      </SidebarInset>
      
    </>
  );
};

export default Index;
