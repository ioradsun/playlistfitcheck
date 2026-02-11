import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Zap, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlaylistInput as PlaylistInputType } from "@/lib/playlistHealthEngine";
import { SAMPLE_PLAYLIST, SAMPLE_EDITORIAL } from "@/lib/playlistHealthEngine";

interface Props {
  onAnalyze: (data: PlaylistInputType) => void;
}

export function PlaylistInputSection({ onAnalyze }: Props) {
  const [url, setUrl] = useState("");

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
          Score any Spotify playlist on curation quality, update cadence, and pitch suitability.
        </p>
      </div>

      <div className="glass-card rounded-xl p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste Spotify playlist URL..."
            className="pl-10 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button
          onClick={() => {
            if (url.trim()) {
              onAnalyze({ ...SAMPLE_PLAYLIST, playlistUrl: url.trim() });
            }
          }}
          className="glow-primary"
        >
          <Zap size={16} className="mr-1" /> Analyze
        </Button>
      </div>

      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>Try a demo:</span>
        <button
          onClick={() => onAnalyze(SAMPLE_PLAYLIST)}
          className="text-primary hover:underline underline-offset-2 font-mono"
        >
          Indie Playlist
        </button>
        <span>·</span>
        <button
          onClick={() => onAnalyze(SAMPLE_EDITORIAL)}
          className="text-primary hover:underline underline-offset-2 font-mono"
        >
          Spotify Editorial
        </button>
      </div>
    </motion.div>
  );
}
