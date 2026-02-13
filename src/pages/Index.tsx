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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MixFitCheck from "@/pages/MixFitCheck";
import type { MixProjectData } from "@/hooks/useMixProjectStorage";

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

const Index = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const autoRunRef = useRef(false);
  const cameFromDashboardRef = useRef(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState("playlist");
  const [loadedMixProject, setLoadedMixProject] = useState<MixProjectData | null>(null);
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

    // Save search for logged-in users (without song fit initially)
    saveSearch(data, output, songUrl);

    if (trackList && trackList.length > 0) {
      fetchVibeAnalysis(data, trackList);
      if (songUrl) {
        fetchSongFitAnalysis(songUrl, data, trackList, output);
      }
    }
  }, [fetchVibeAnalysis, fetchSongFitAnalysis, saveSearch]);

  // Update saved search with full report data once all analyses complete
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
    if (cameFromDashboardRef.current) {
      cameFromDashboardRef.current = false;
      navigate("/dashboard");
      return;
    }
    setResult(null);
    setVibeAnalysis(null);
    setVibeLoading(false);
    setSongFitAnalysis(null);
    setSongFitLoading(false);
  }, [navigate]);

  // Load cached report from dashboard navigation state
  useEffect(() => {
    const state = location.state as any;
    if (autoRunRef.current) return;
    
    if (state?.reportData) {
      // Cached report from dashboard
      autoRunRef.current = true;
      cameFromDashboardRef.current = true;
      window.history.replaceState({}, "", "/");
      const { input, output, vibeAnalysis: vibe, songFitAnalysis: songFit, trackList, songUrl } = state.reportData;
      setResult({ output, input, name: input.playlistName, key: Date.now(), trackList, songUrl });
      setVibeAnalysis(vibe ?? null);
      setSongFitAnalysis(songFit ?? null);
      setVibeLoading(false);
      setSongFitLoading(false);
    } else if (state?.autoRun) {
      // No cached data — re-run analysis
      autoRunRef.current = true;
      cameFromDashboardRef.current = true;
      const { playlistUrl, songUrl } = state.autoRun;
      window.history.replaceState({}, "", "/");
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
          toast.error("Failed to load report. Try running the fit check again.");
          setVibeLoading(false);
        }
      })();
    } else if (state?.loadMixProject) {
      autoRunRef.current = true;
      cameFromDashboardRef.current = true;
      window.history.replaceState({}, "", "/");
      setLoadedMixProject(state.loadMixProject);
      setActiveTab("mix");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex justify-center pt-20 pb-2">
          <TabsList>
            <TabsTrigger value="playlist">PlaylistFit</TabsTrigger>
            <TabsTrigger value="mix">MixFit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="playlist" className="flex-1 flex items-center justify-center px-4 py-8 mt-0 data-[state=inactive]:hidden">
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
        </TabsContent>

        <TabsContent value="mix" className="flex-1 flex items-start justify-center px-4 py-8 mt-0 data-[state=inactive]:hidden">
          <MixFitCheck initialProject={loadedMixProject} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
