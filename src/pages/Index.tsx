import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, startTransition } from "react";
import { flushSync } from "react-dom";
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
import { useScrollRestore } from "@/hooks/useScrollRestore";
import {
  AppSidebarImport,
  DreamFitTabImport,
  HitFitTabImport,
  HookFitTabImport,
  LyricFitTabImport,
  MixFitCheckImport,
  ProFitTabImport,
  SongFitTabImport,
  VibeFitTabImport,
} from "@/lib/routePrefetch";

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ChevronRight, ArrowLeft } from "lucide-react";
import {
  CrowdFitSkeleton,
  DreamFitSkeleton,
  HitFitSkeleton,
  LyricFitSkeleton,
  MixFitSkeleton,
  PlaylistFitSkeleton,
} from "@/components/ui/PageSkeletons";

const MixFitCheck = lazy(MixFitCheckImport);
const LyricFitTab = lazy(() => LyricFitTabImport().then((module) => ({ default: module.LyricFitTab })));
const HitFitTab = lazy(() => HitFitTabImport().then((module) => ({ default: module.HitFitTab })));
const ProFitTab = lazy(() => ProFitTabImport().then((module) => ({ default: module.ProFitTab })));
const SongFitTab = lazy(() => SongFitTabImport().then((module) => ({ default: module.SongFitTab })));
const HookFitTab = lazy(() => HookFitTabImport().then((module) => ({ default: module.HookFitTab })));
const DreamFitTab = lazy(() => DreamFitTabImport().then((module) => ({ default: module.DreamFitTab })));
const VibeFitTab = lazy(() => VibeFitTabImport().then((module) => ({ default: module.VibeFitTab })));
const AppSidebar = lazy(() => AppSidebarImport().then((module) => {
  const Comp = module.AppSidebar;
  return { default: (props: any) => <Comp {...props} /> };
}));

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
  <div className="w-full px-4 py-6">
    <PlaylistFitSkeleton variant="new" />
  </div>
);

const ToolSkeleton = ({ tab, variant = "new" }: { tab: string; variant?: "new" | "existing" }) => {
  switch (tab) {
    case "songfit":
    case "hookfit":
      return <div className="px-4 py-6"><CrowdFitSkeleton variant={variant} /></div>;
    case "lyric":
      return <LyricFitSkeleton variant={variant} />;
    case "hitfit":
      return <div className="px-4 py-6"><HitFitSkeleton variant={variant} /></div>;
    case "mix":
      return <div className="px-4 py-6"><MixFitSkeleton variant={variant} /></div>;
    case "dreamfit":
      return <div className="px-4 py-6"><DreamFitSkeleton variant={variant} /></div>;
    default:
      return <TabChunkFallback />;
  }
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
  const transitionNavigate = useCallback((to: string, options?: { replace?: boolean; state?: any }) => {
    startTransition(() => {
      navigate(to, options);
    });
  }, [navigate]);
  const autoRunRef = useRef(false);
  const profitAutoRef = useRef(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  // Derive active tab from URL path (strip /:projectId suffix)
  const basePath = location.pathname.replace(/\/[0-9a-f-]{36}$/, "");
  const rawTabFromPath = PATH_TO_TAB[basePath] || PATH_TO_TAB[location.pathname] || "songfit";
  const tabFromPath = !hookfitEnabled && rawTabFromPath === "hookfit" ? "songfit" : rawTabFromPath;
  const [activeTab, setActiveTabState] = useState(tabFromPath);
  const playlistQuota = useUsageQuota("playlist", { enabled: activeTab === "playlist" });
  
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

  const [loadedLyric, setLoadedLyric] = useState<any>(null);

  // Auto-load project from URL param for any tool
  const projectLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId) {
      projectLoadedRef.current = null;
    }
  }, [projectId]);

  // When projectId changes, mark lyric loading; when cleared, reset
  const prevProjectIdRef = useRef<string | undefined>(projectId);
  useEffect(() => {
    if (activeTab !== "lyric") return;

    if (projectId) {
      // Only reset loadedLyric when the projectId actually changed
      if (prevProjectIdRef.current !== projectId) {
        setLoadedLyric(null);
        setLyricLoadingState("loading");
      }
    } else {
      setLyricLoadingState("ready");
      setLoadedLyric(null);
    }
    prevProjectIdRef.current = projectId;
  }, [activeTab, projectId]);


  useEffect(() => {
    if (activeTab !== "lyric" || !projectId) return;

    // Hold skeleton until auth settles so we never render New Project mid-hydration.
    if (authLoading) return;

    // Route points to a project but there is no authenticated user to load it.
    if (!user) {
      setLoadedLyric(null);
      setLyricLoadingState("missing");
      return;
    }

    // Only skip fetch when both ref + actual payload match.
    if (projectLoadedRef.current === projectId && loadedLyric?.id === projectId) {
      setLyricLoadingState("ready");
      return;
    }

    let cancelled = false;
    setLyricLoadingState("loading");

    (async () => {
      const { data, error } = await supabase
        .from("saved_lyrics")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setLoadedLyric(null);
        setLyricLoadingState("missing");
        return;
      }

      projectLoadedRef.current = projectId;
      // Commit atomically to avoid intermediate "ready + null" frames.
      flushSync(() => {
        setLoadedLyric(data);
        setLyricLoadingState("ready");
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, projectId, authLoading, user?.id, loadedLyric?.id]);

  useEffect(() => {
    if (!projectId || projectLoadedRef.current === projectId || !user) return;
    const tab = activeTab;
    
    // Lyric projects are handled by the dedicated lyric loader effect
    if (tab === "lyric") {
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
    setLoadingProjectType(tab);

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
        setLoadingProjectType(null);
        toast.error("Project not found");
        navigate(pathMap[tab] || "/CrowdFit", { replace: true });
        return;
      }
      setLoadingProjectType(null);
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
  const [vibeAnalysis, setVibeAnalysis] = useState<VibeAnalysis | null>(null);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [songFitAnalysis, setSongFitAnalysis] = useState<SongFitAnalysis | null>(null);
  const [songFitLoading, setSongFitLoading] = useState(false);
  const savedSearchIdRef = useRef<string | null>(null);
  
  const [deferSidebarReady, setDeferSidebarReady] = useState(false);
  const [optimisticSidebarItem, setOptimisticSidebarItem] = useState<{ id: string; label: string; meta: string; type: string; rawData?: any } | null>(null);
  const [lyricLoadingState, setLyricLoadingState] = useState<"loading" | "ready" | "missing">(
    tabFromPath === "lyric" && projectId ? "loading" : "ready"
  );
  // Tracks when we're loading a project from URL/sidebar — shows skeleton instead of uploader
  const [loadingProjectType, setLoadingProjectType] = useState<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useScrollRestore(location.pathname, contentScrollRef);

  // Shared header UI persists across route transitions, so clear route-scoped
  // project chrome immediately whenever the pathname changes.
  useEffect(() => {
    setHeaderProject(null);
  }, [location.pathname]);

  useEffect(() => {
    const idle = window.setTimeout(() => setDeferSidebarReady(true), 250);
    return () => window.clearTimeout(idle);
  }, []);

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
        // Optimistic update — inject into sidebar immediately, no refetch needed
        setOptimisticSidebarItem({
          id: inserted.id,
          label: data.playlistName || "Playlist Analysis",
          meta: "just now",
          type: "playlist",
          rawData: { playlist_url: (data as any).playlistUrl, song_url: songUrl },
        });
      }
    } catch (e) {
      console.error("Failed to save search:", e);
    }
  }, [user, navigate]);

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
    });
  }, [isFullyLoaded, result, vibeAnalysis, songFitAnalysis]);

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
      setOptimisticSidebarItem(null);
      setProfitLoadKey(k => k + 1);
      setVibeFitLoadKey(k => k + 1);
      
      setHeaderProject(null);
      // Clear all cached audio on logout
      sessionAudio.clearAll();
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  const handleNewLyric = useCallback(() => { setLoadedLyric(null); transitionNavigate("/LyricFit", { replace: true }); }, [transitionNavigate]);
  const handleNewMix = useCallback(() => { setLoadedMixProject(null); transitionNavigate("/MixFit", { replace: true }); }, [transitionNavigate]);
  const handleNewHitFit = useCallback(() => { setLoadedHitFitAnalysis(null); transitionNavigate("/HitFit", { replace: true }); }, [transitionNavigate]);

  const handleSidebarTabChange = useCallback((tab: string) => {
    setLoadingProjectType(null);
    // If switching FROM a different tab TO this one, preserve any active project
    // Only reset to "New Project" if the user is ALREADY on this tab (double-click)
    const isAlreadyOnTab = activeTab === tab;
    if (isAlreadyOnTab) {
      if (tab === "lyric") { setLoadedLyric(null); transitionNavigate("/LyricFit", { replace: true }); }
      else if (tab === "mix") { setLoadedMixProject(null); transitionNavigate("/MixFit", { replace: true }); }
      else if (tab === "hitfit") { setLoadedHitFitAnalysis(null); transitionNavigate("/HitFit", { replace: true }); }
    } else {
      // Switching tabs — navigate to the active project URL if one exists
      if (tab === "lyric" && loadedLyric?.id) { transitionNavigate(`/LyricFit/${loadedLyric.id}`, { replace: true }); }
      else if (tab === "mix" && loadedMixProject?.id) { transitionNavigate(`/MixFit/${loadedMixProject.id}`, { replace: true }); }
      else if (tab === "hitfit" && loadedHitFitAnalysis) { /* keep current state */ }
      else {
        const pathMap: Record<string, string> = { songfit: "/CrowdFit", hookfit: "/HookFit", profit: "/ProFit", playlist: "/PlaylistFit", mix: "/MixFit", lyric: "/LyricFit", hitfit: "/HitFit", dreamfit: "/DreamFit", vibefit: "/VibeFit" };
        transitionNavigate(pathMap[tab] || "/CrowdFit", { replace: true });
      }
    }
    startTransition(() => {
      setActiveTab(tab);
    });
  }, [activeTab, setActiveTab, navigate, loadedLyric, loadedMixProject, loadedHitFitAnalysis]);

  const handleLoadProject = useCallback((type: string, data: any) => {
    // Collect the navigate target so we can call it AFTER flushSync
    let navTarget: string | null = null;

    // Use flushSync so data is committed BEFORE React processes the next
    // render frame — this prevents the "New Project" screen from flashing.
    flushSync(() => {
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
            navTarget = `/ProFit/${data.reportId}`;
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
            if (data.id) navTarget = `/HitFit/${data.id}`;
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
            if (data.id) navTarget = `/PlaylistFit/${data.id}`;
          }
          // NOTE: playlist_url re-fetch path handled below outside flushSync
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
            if (data.id) navTarget = `/MixFit/${data.id}`;
          }
          break;
        }
        case "lyric": {
          if (data) {
            setLoadedLyric(data);
            setLoadingProjectType(null);
            if (data.id) navTarget = `/LyricFit/${data.id}`;
          }
          break;
        }
        case "vibefit": {
          if (data) {
            setLoadedVibeFitResult(data);
            setVibeFitLoadKey((k) => k + 1);
            if (data.id) navTarget = `/VibeFit/${data.id}`;
          }
          break;
        }
      }
    });

    // Navigate AFTER flushSync so state is already committed
    if (navTarget) navigate(navTarget, { replace: true });

    // Handle async playlist re-fetch outside flushSync (existing project — do NOT re-save)
    if (type === "playlist" && !data?.report_data && data?.playlist_url) {
      (async () => {
        setVibeLoading(true);
        try {
          const { data: plData, error } = await supabase.functions.invoke("spotify-playlist", {
            body: { playlistUrl: data.playlist_url, sessionId: null, songUrl: data.song_url || null },
          });
          if (error) throw new Error(error.message);
          if (plData?.error) throw new Error(plData.error);
          // Set result directly without saving (project already exists)
          const plInput = plData as PlaylistInput;
          const output = computePlaylistHealth(plInput);
          const trackList = (plData as any)._trackList;
          const songUrl = data.song_url || undefined;
          setResult({ output, input: plInput, name: plInput.playlistName, key: Date.now(), trackList, songUrl });
          // Update the existing saved_search with report data
          savedSearchIdRef.current = data.id;
          if (trackList && trackList.length > 0) {
            fetchVibeAnalysis(plInput, trackList);
            if (songUrl) {
              fetchSongFitAnalysis(songUrl, plInput, trackList, output);
            }
          }
        } catch (e) {
          console.error("Re-run error:", e);
          toast.error("Failed to load report. Try running PlaylistFit again.");
          setVibeLoading(false);
        }
      })();
    }
  }, [handleAnalyze, navigate]);

  const navigateToProject = useCallback((tool: string, id: string) => {
    const pathMap: Record<string, string> = { profit: "ProFit", playlist: "PlaylistFit", mix: "MixFit", lyric: "LyricFit", hitfit: "HitFit", vibefit: "VibeFit" };
    const prefix = pathMap[tool];
    if (prefix && id && location.pathname !== `/${prefix}/${id}`) {
      transitionNavigate(`/${prefix}/${id}`, { replace: true });
    }
  }, [transitionNavigate, location.pathname]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "songfit":
        return <div id="songfit-scroll-container" className="flex-1 px-4 py-6"><Suspense fallback={<ToolSkeleton tab="songfit" variant={projectId ? "existing" : "new"} />}><SongFitTab /></Suspense></div>;
      case "hookfit":
        return hookfitEnabled ? <div className="flex-1 px-4 py-6"><Suspense fallback={<ToolSkeleton tab="hookfit" variant={projectId ? "existing" : "new"} />}><HookFitTab /></Suspense></div> : null;
      case "lyric": {
        const isHydratingExistingLyricProject = Boolean(
          projectId &&
            (authLoading ||
              lyricLoadingState === "loading" ||
              (lyricLoadingState !== "missing" && loadedLyric?.id !== projectId))
        );

        return (
          <div className="flex-1 flex flex-col min-h-0">
            {isHydratingExistingLyricProject ? (
              <ToolSkeleton tab="lyric" variant={projectId ? "existing" : "new"} />
            ) : (
              <Suspense fallback={<ToolSkeleton tab="lyric" variant={projectId ? "existing" : "new"} />}>
                <LyricFitTab
                  key={loadedLyric?.id || "new"}
                  initialLyric={loadedLyric}
                  onNewProject={handleNewLyric}
                  onHeaderProject={setHeaderProject}
                  onSavedId={(id) => {
                    projectLoadedRef.current = id;
                    navigateToProject("lyric", id);
                  }}
                  onUploadStarted={(payload) => {
                    if (payload.projectId) {
                      projectLoadedRef.current = payload.projectId;
                      setOptimisticSidebarItem({
                        id: payload.projectId,
                        label: payload.title || "Untitled",
                        meta: "just now",
                        type: "lyric",
                        rawData: { id: payload.projectId, title: payload.title, lines: [], filename: payload.file.name },
                      });
                      navigate(`/LyricFit/${payload.projectId}`, { replace: true });
                    }
                  }}
                />
              </Suspense>
            )}
          </div>
        );
      }
      case "mix": {
        const isHydratingMix = Boolean(projectId && (authLoading || loadingProjectType === "mix" || (loadedMixProject?.id !== projectId && projectLoadedRef.current !== projectId)));
        return (
          <div className="flex-1 flex flex-col min-h-0">
            {isHydratingMix ? <ToolSkeleton tab="mix" variant={projectId ? "existing" : "new"} /> : (
              <Suspense fallback={<ToolSkeleton tab="mix" variant={projectId ? "existing" : "new"} />}>
                <MixFitCheck key={loadedMixProject?.id || "new"} initialProject={loadedMixProject} onNewProject={handleNewMix} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("mix", id)} />
              </Suspense>
            )}
          </div>
        );
      }
      case "hitfit": {
        const isHydratingHitFit = Boolean(projectId && (authLoading || loadingProjectType === "hitfit") && !loadedHitFitAnalysis);
        return (
          <div className="flex-1 flex flex-col min-h-0 px-4 py-6">
            {isHydratingHitFit ? <ToolSkeleton tab="hitfit" variant={projectId ? "existing" : "new"} /> : (
              <Suspense fallback={<ToolSkeleton tab="hitfit" variant={projectId ? "existing" : "new"} />}>
                <HitFitTab
                  key={loadedHitFitAnalysis ? "loaded" : "new"}
                  initialAnalysis={loadedHitFitAnalysis}
                  onNewProject={handleNewHitFit}
                  onHeaderProject={setHeaderProject}
                  onSavedId={(id) => navigateToProject("hitfit", id)}
                  onOptimisticItem={(item) => {
                    projectLoadedRef.current = item.id;
                    setOptimisticSidebarItem(item);
                  }}
                />
              </Suspense>
            )}
          </div>
        );
      }
      case "profit": {
        const isHydratingProfit = Boolean(projectId && (authLoading || loadingProjectType === "profit") && !profitSavedReport);
        return (
          <div className="flex-1 flex flex-col min-h-0">
            {isHydratingProfit ? <TabChunkFallback /> : (
              <Suspense fallback={<TabChunkFallback />}>
                <ProFitTab key={profitLoadKey} initialArtistUrl={profitArtistUrl} initialSavedReport={profitSavedReport} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("profit", id)} />
              </Suspense>
            )}
          </div>
        );
      }
      case "playlist": {
        const isHydratingPlaylist = Boolean(projectId && (authLoading || loadingProjectType === "playlist") && !result);
        if (isHydratingPlaylist) return <div className="px-4 py-6"><PlaylistFitSkeleton variant="existing" /></div>;
        return result ? (
          <div className="flex-1 px-4 py-6">
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
      }
      case "dreamfit":
        return <div className="flex-1 px-4 py-6"><Suspense fallback={<ToolSkeleton tab="dreamfit" variant={projectId ? "existing" : "new"} />}><DreamFitTab /></Suspense></div>;
      case "vibefit": {
        const isHydratingVibeFit = Boolean(projectId && (authLoading || loadingProjectType === "vibefit") && !loadedVibeFitResult);
        return (
          <div className="flex-1 flex flex-col px-4 py-6">
            {isHydratingVibeFit ? <TabChunkFallback /> : (
              <Suspense fallback={<TabChunkFallback />}>
                <VibeFitTab key={`vibefit-${vibeFitLoadKey}`} initialResult={loadedVibeFitResult} onHeaderProject={setHeaderProject} onSavedId={(id) => navigateToProject("vibefit", id)} />
              </Suspense>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      {deferSidebarReady && (
        <Suspense fallback={null}>
          <AppSidebar activeTab={activeTab} onTabChange={handleSidebarTabChange} onLoadProject={handleLoadProject} optimisticItem={optimisticSidebarItem} />
        </Suspense>
      )}
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
        <main ref={contentScrollRef} className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {renderTabContent()}
        </main>
      </SidebarInset>
      
    </>
  );
};

export default Index;
