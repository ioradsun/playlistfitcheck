import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Zap, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PlaylistInput as PlaylistInputType } from "@/lib/playlistHealthEngine";
import { SAMPLE_PLAYLIST, SAMPLE_EDITORIAL } from "@/lib/playlistHealthEngine";

interface Props {
  onAnalyze: (data: PlaylistInputType) => void;
}

export function PlaylistInputSection({ onAnalyze }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Please paste a Spotify playlist URL");
      return;
    }

    if (!trimmedUrl.includes("spotify.com/playlist/")) {
      toast.error("Please enter a valid Spotify playlist URL");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-playlist", {
        body: { playlistUrl: trimmedUrl },
      });

      if (error) {
        throw new Error(error.message || "Failed to fetch playlist data");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      onAnalyze(data as PlaylistInputType);
    } catch (e) {
      console.error("Analyze error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to analyze playlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center space-y-3">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <BarChart3 size={14} />
          Deterministic Scoring Engine
        </motion.div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Playlist <span className="text-gradient-primary">Health</span> Check
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Paste a Spotify playlist URL to score curation quality, update cadence, and pitch suitability.
        </p>
      </div>

      {/* URL input */}
      <div className="glass-card rounded-xl p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste Spotify playlist URL..."
            className="pl-10 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
            onKeyDown={e => e.key === "Enter" && !loading && handleAnalyze()}
            disabled={loading}
          />
        </div>
        <Button onClick={handleAnalyze} className="glow-primary" disabled={loading}>
          {loading ? (
            <Loader2 size={16} className="mr-1 animate-spin" />
          ) : (
            <Zap size={16} className="mr-1" />
          )}
          {loading ? "Fetching..." : "Analyze"}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Note: Churn rate, update cadence, and track placement data require deeper analysis beyond the basic Spotify API.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        <a
          href="https://open.spotify.com/playlist/3wtgtkdE8aDOf3V0LYoAXa"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline underline-offset-2"
        >
          I only listen to one playlist.
        </a>
      </p>
    </motion.div>
  );
}
