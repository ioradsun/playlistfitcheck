import { motion } from "framer-motion";
import { Users } from "lucide-react";

export interface VibeAnalysis {
  genres: string[];
  mood: string;
  vibe: string;
  idealSubmission: string;
  energyLevel: "low" | "medium" | "high" | "mixed";
  standoutArtists: string[];
}

const ENERGY_LABEL = {
  low: "Low Energy",
  medium: "Medium Energy",
  high: "High Energy",
  mixed: "Mixed Energy",
};

export function VibeCard({ analysis, loading, playlistName }: { analysis: VibeAnalysis | null; loading: boolean; playlistName?: string }) {
  if (loading) {
    return (
      <div className="py-8 space-y-4">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">
          {playlistName ? `"${playlistName}" Vibe Analysis` : "Playlist Vibe Analysis"}
        </p>
        <div className="space-y-2">
          <div className="h-3 bg-border/40 animate-pulse w-3/4" />
          <div className="h-3 bg-border/40 animate-pulse w-1/2" />
          <div className="h-3 bg-border/40 animate-pulse w-5/6" />
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">
        {playlistName ? `"${playlistName}" Vibe Analysis` : "Playlist Vibe Analysis"}
      </p>

      {/* Genres + Energy */}
      <div className="flex flex-wrap gap-2">
        {analysis.genres.map((genre) => (
          <span
            key={genre}
            className="font-mono text-[10px] tracking-wide uppercase border border-border/40 px-2.5 py-1 text-muted-foreground"
          >
            {genre}
          </span>
        ))}
        <span className="font-mono text-[10px] tracking-wide uppercase border border-foreground/20 px-2.5 py-1 text-foreground">
          {ENERGY_LABEL[analysis.energyLevel] || "Mixed Energy"}
        </span>
      </div>

      {/* Mood */}
      <div className="space-y-1">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Mood</p>
        <p className="text-sm text-foreground leading-relaxed">{analysis.mood}</p>
      </div>

      {/* Vibe */}
      <div className="space-y-1">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Sonic Character</p>
        <p className="text-sm text-foreground leading-relaxed">{analysis.vibe}</p>
      </div>

      {/* Ideal Submission */}
      <div className="space-y-1">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Ideal Submission</p>
        <p className="text-sm text-foreground leading-relaxed">{analysis.idealSubmission}</p>
      </div>

      {/* Standout Artists */}
      {analysis.standoutArtists.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Key Artists</p>
          <p className="text-xs font-mono text-muted-foreground">
            {analysis.standoutArtists.join(" · ")}
          </p>
        </div>
      )}
    </motion.div>
  );
}
