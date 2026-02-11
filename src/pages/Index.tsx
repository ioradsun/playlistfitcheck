import { useState, useCallback } from "react";
import { PlaylistInputSection } from "@/components/PlaylistInput";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { computePlaylistHealth, type PlaylistInput, type HealthOutput } from "@/lib/playlistHealthEngine";

const Index = () => {
  const [result, setResult] = useState<{ output: HealthOutput; name?: string; key: number } | null>(null);

  const handleAnalyze = useCallback((data: PlaylistInput) => {
    const output = computePlaylistHealth(data);
    setResult({ output, name: data.playlistName, key: Date.now() });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        {result ? (
          <ResultsDashboard
            key={result.key}
            result={result.output}
            playlistName={result.name}
            onBack={() => setResult(null)}
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
