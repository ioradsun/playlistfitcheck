import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import MixFitCheck from "@/pages/MixFitCheck";
import type { MixProjectData } from "@/hooks/useMixProjectStorage";
import { LyricFitTab } from "@/components/lyric/LyricFitTab";
import { HitFitTab } from "@/components/hitfit/HitFitTab";
import { ProFitTab } from "@/components/profit/ProFitTab";
import { SongFitTab } from "@/components/songfit/SongFitTab";
import { Navbar } from "@/components/Navbar";

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
    className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-24"
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
  "/SongFit": "songfit",
  "/ProFit": "profit",
  "/PlaylistFit": "playlist",
  "/MixFit": "mix",
  "/LyricFit": "lyric",
  "/HitFit": "hitfit",
};

const Index = () => {
  const { user, loading: authLoading, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const autoRunRef = useRef(false);
  const profitAutoRef = useRef(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  // Derive active tab from URL path
  const tabFromPath = PATH_TO_TAB[location.pathname] || "songfit";
  const [activeTab, setActiveTabState] = useState(tabFromPath);
  
  // Sync tab when path changes (e.g. browser back/forward)
  useEffect(() => {
    const t = PATH_TO_TAB[location.pathname];
    if (t && t !== activeTab) setActiveTabState(t);
    // Redirect bare "/" to "/SongFit"
    if (location.pathname === "/" && !location.state) {
      navigate("/SongFit", { replace: true });
    }
  }, [location.pathname]);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
  }, []);
  
  // Auto-switch to ProFit tab on first login if user has a Spotify artist linked
  useEffect(() => {
    if (profitAutoRef.current || !profile?.spotify_artist_id) return;
    // Only auto-switch if no location state is driving a specific tab
    const state = location.state as any;
    if (state?.reportData || state?.autoRun || state?.loadMixProject || state?.loadLyric) return;
    // Only auto-switch if on default route
    if (location.pathname !== "/") return;
    profitAutoRef.current = true;
    setActiveTabState("profit");
    navigate("/ProFit", { replace: true });
  }, [profile, location.state, location.pathname, navigate]);
  const [loadedMixProject, setLoadedMixProject] = useState<MixProjectData | null>(null);
  const [loadedLyric, setLoadedLyric] = useState<any>(null);
  const [vibeAnalysis, setVibeAnalysis] = useState<VibeAnalysis | null>(null);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [songFitAnalysis, setSongFitAnalysis] = useState<SongFitAnalysis | null>(null);
  const [songFitLoading, setSongFitLoading] = useState(false);
  const savedSearchIdRef = useRef<string | null>(null);

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
    const trackList = data._trackList;
    const songUrl = data._songUrl;
    const output = computePlaylistHealth(data);
    setVibeAnalysis(null);
    setSongFitAnalysis(null);
    setVibeLoading(false);
    setSongFitLoading(false);
    setResult({ output, input: data, name: data.playlistName, key: Date.now(), trackList, songUrl });
    saveSearch(data, output, songUrl);
    if (trackList && trackList.length > 0) {
      fetchVibeAnalysis(data, trackList);
      if (songUrl) {
        fetchSongFitAnalysis(songUrl, data, trackList, output);
      }
    }
  }, [fetchVibeAnalysis, fetchSongFitAnalysis, saveSearch]);

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
      // Came back from auth – restore previous tab
      const TAB_TO_PATH: Record<string, string> = { songfit: "/SongFit", profit: "/ProFit", playlist: "/PlaylistFit", mix: "/MixFit", lyric: "/LyricFit", hitfit: "/HitFit" };
      setActiveTab(state.returnTab);
      navigate(TAB_TO_PATH[state.returnTab] || "/SongFit", { replace: true });
      // Don't set autoRunRef so other state handlers can still fire if combined
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

  const renderTabContent = () => {
    switch (activeTab) {
      case "profit":
        return <div className="flex-1 flex items-start justify-center px-4 py-8"><ProFitTab /></div>;
      case "songfit":
        return <div className="flex-1 flex items-start justify-center px-4 py-8"><SongFitTab /></div>;
      case "playlist":
        return (
           <div className="flex-1 flex items-start justify-center px-4 py-8">
            {result && !isFullyLoaded ? (
              <AnalysisLoadingScreen hasSong={!!result?.songUrl} />
            ) : result && isFullyLoaded ? (
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
              />
            ) : (
              <PlaylistInputSection onAnalyze={handleAnalyze} />
            )}
          </div>
        );
      case "mix":
        return <div className="flex-1 flex items-start justify-center px-4 py-8"><MixFitCheck initialProject={loadedMixProject} /></div>;
      case "lyric":
        return <div className="flex-1 flex items-start justify-center px-4 py-8"><LyricFitTab initialLyric={loadedLyric} /></div>;
      case "hitfit":
        return <div className="flex-1 flex items-start justify-center px-4 py-8"><HitFitTab /></div>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex flex-col pt-14">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default Index;
