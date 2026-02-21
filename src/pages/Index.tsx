import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import MixFitCheck from "@/pages/MixFitCheck";
import type { MixProjectData } from "@/hooks/useMixProjectStorage";
import { LyricFitTab } from "@/components/lyric/LyricFitTab";
import { HitFitTab } from "@/components/hitfit/HitFitTab";
import { ProFitTab } from "@/components/profit/ProFitTab";
import { SongFitTab } from "@/components/songfit/SongFitTab";
import { DreamFitTab } from "@/components/dreamfit/DreamFitTab";
import { VibeFitTab } from "@/components/vibefit/VibeFitTab";
import { AppSidebar } from "@/components/AppSidebar";

import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Music, ChevronRight, ArrowLeft } from "lucide-react";

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

const PATH_TO_TAB: Record<string, string> = {
  "/CrowdFit": "songfit",
  "/HookFit": "songfit",
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
  const TAB_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(siteCopy.tools).map(([k, v]) => [k, v.label])
  );
  const TAB_SUBTITLES: Record<string, string> = Object.fromEntries(
    Object.entries(siteCopy.tools).map(([k, v]) => [k, v.pill])
  );
  const location = useLocation();
  const navigate = useNavigate();
  const autoRunRef = useRef(false);
  const profitAutoRef = useRef(false);
  const playlistQuota = useUsageQuota("playlist");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  // Derive active tab from URL path
  const tabFromPath = PATH_TO_TAB[location.pathname] || "songfit";
  const [activeTab, setActiveTabState] = useState(tabFromPath);
  
  // Sync tab when path changes (e.g. browser back/forward)
  useEffect(() => {
    const t = PATH_TO_TAB[location.pathname];
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
    if (location.pathname === "/SongFit" || location.pathname === "/HookFit") {
      navigate("/CrowdFit", { replace: true });
    }
  }, [location.pathname]);

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
      if (inserted) savedSearchIdRef.current = inserted.id;
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
    }
    prevUserRef.current = user;
  }, [user, authLoading]);

  const handleNewLyric = useCallback(() => setLoadedLyric(null), []);
  const handleNewMix = useCallback(() => setLoadedMixProject(null), []);
  const handleNewHitFit = useCallback(() => setLoadedHitFitAnalysis(null), []);

  const handleLoadProject = useCallback((type: string, data: any) => {
    // Reset everything first
    setResult(null);
    setVibeAnalysis(null);
    setSongFitAnalysis(null);
    setLoadedMixProject(null);
    setProfitArtistUrl(null);
    setProfitSavedReport(null);
    setLoadedHitFitAnalysis(null);
    setLoadedVibeFitResult(null);

    switch (type) {
      case "profit": {
        if (data?.reportId && data?.blueprint && data?.artist) {
          // Load saved report directly — no re-analysis needed
          setProfitSavedReport(data);
          setProfitLoadKey(k => k + 1);
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
        } else if (data?.playlist_url) {
          // Re-run analysis from scratch
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
        }
        break;
      }
      case "lyric": {
        if (data) {
          setLoadedLyric(data);
        }
        break;
      }
      case "vibefit": {
        if (data) {
          setLoadedVibeFitResult(data);
          setVibeFitLoadKey((k) => k + 1);
        }
        break;
      }
    }
  }, [handleAnalyze]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "profit":
        return <div className="flex-1 flex flex-col min-h-0 overflow-y-auto"><ProFitTab key={profitLoadKey} initialArtistUrl={profitArtistUrl} initialSavedReport={profitSavedReport} onProjectSaved={refreshSidebar} onHeaderProject={setHeaderProject} /></div>;
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
        return <div className="flex-1 overflow-y-auto px-4 py-6"><DreamFitTab /></div>;
      case "vibefit":
        return <div className="flex-1 flex flex-col overflow-y-auto px-4 py-6"><VibeFitTab key={`vibefit-${vibeFitLoadKey}`} initialResult={loadedVibeFitResult} onProjectSaved={refreshSidebar} onHeaderProject={setHeaderProject} /></div>;
      default:
        return null;
    }
  };

  const persistedTabs = ["songfit", "lyric", "mix", "hitfit"];

  return (
    <>
      <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} onLoadProject={handleLoadProject} refreshKey={sidebarRefreshKey} />
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
              <span className="text-xs font-semibold truncate max-w-[200px]">{headerProject.title}</span>
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
          <div
            id="songfit-scroll-container"
            className={`flex-1 overflow-y-auto px-4 py-6 ${activeTab === "songfit" ? "" : "hidden"}`}
          >
            <SongFitTab />
          </div>
          {/* LyricFitTab stays mounted to preserve audio state — hidden when not active */}
          <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${activeTab === "lyric" ? "" : "hidden"}`}>
            <LyricFitTab key={loadedLyric?.id || "new"} initialLyric={loadedLyric} onProjectSaved={refreshSidebar} onNewProject={handleNewLyric} onHeaderProject={setHeaderProject} />
          </div>
          {/* MixFitTab stays mounted to preserve audio state — hidden when not active */}
          <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${activeTab === "mix" ? "" : "hidden"}`}>
            <MixFitCheck key={loadedMixProject?.id || "new"} initialProject={loadedMixProject} onProjectSaved={refreshSidebar} onNewProject={handleNewMix} onHeaderProject={setHeaderProject} />
          </div>
          {/* HitFitTab stays mounted to preserve audio state — hidden when not active */}
          <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-6 ${activeTab === "hitfit" ? "" : "hidden"}`}>
            {loadedHitFitAnalysis
              ? <HitFitTab key="loaded" initialAnalysis={loadedHitFitAnalysis} onProjectSaved={refreshSidebar} onNewProject={handleNewHitFit} onHeaderProject={setHeaderProject} />
              : <HitFitTab key="new" initialAnalysis={null} onProjectSaved={refreshSidebar} onNewProject={handleNewHitFit} onHeaderProject={setHeaderProject} />
            }
          </div>
          {!persistedTabs.includes(activeTab) && renderTabContent()}
        </div>
      </SidebarInset>
      
    </>
  );
};

export default Index;
