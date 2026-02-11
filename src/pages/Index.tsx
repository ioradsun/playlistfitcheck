import { useState, useCallback } from "react";
import { PlaylistInputSection } from "@/components/PlaylistInput";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { computePlaylistHealth, type PlaylistInput, type HealthOutput } from "@/lib/playlistHealthEngine";
import { supabase } from "@/integrations/supabase/client";
import type { VibeAnalysis } from "@/components/VibeCard";

interface AnalysisResult {
  output: HealthOutput;
  input: PlaylistInput;
  name?: string;
  key: number;
  trackList?: { name: string; artists: string }[];
}

const Index = () => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [vibeAnalysis, setVibeAnalysis] = useState<VibeAnalysis | null>(null);
  const [vibeLoading, setVibeLoading] = useState(false);

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

  const handleAnalyze = useCallback((data: PlaylistInput & { _trackList?: { name: string; artists: string }[] }) => {
    const trackList = data._trackList;
    const output = computePlaylistHealth(data);
    setVibeAnalysis(null);
    setResult({ output, input: data, name: data.playlistName, key: Date.now(), trackList });
    // Trigger vibe analysis in background
    if (trackList && trackList.length > 0) {
      fetchVibeAnalysis(data, trackList);
    }
  }, [fetchVibeAnalysis]);

  const handleBack = useCallback(() => {
    setResult(null);
    setVibeAnalysis(null);
    setVibeLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        {result ? (
          <ResultsDashboard
            key={result.key}
            result={result.output}
            inputData={result.input}
            playlistName={result.name}
            vibeAnalysis={vibeAnalysis}
            vibeLoading={vibeLoading}
            onBack={handleBack}
          />
        ) : (
          <PlaylistInputSection onAnalyze={handleAnalyze} />
        )}
      </div>
      <footer className="text-center py-4 text-xs text-muted-foreground font-mono">
        PlaylistHealthChecker · Deterministic Scoring Engine
      </footer>
    </div>
  );
};

export default Index;
