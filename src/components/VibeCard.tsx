import { motion } from "framer-motion";
import { Music, Sparkles, Zap, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface VibeAnalysis {
  genres: string[];
  mood: string;
  vibe: string;
  idealSubmission: string;
  energyLevel: "low" | "medium" | "high" | "mixed";
  standoutArtists: string[];
}

const ENERGY_CONFIG = {
  low: { label: "Low Energy", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  medium: { label: "Medium Energy", className: "bg-score-ok/15 text-score-ok border-score-ok/30" },
  high: { label: "High Energy", className: "bg-score-excellent/15 text-score-excellent border-score-excellent/30" },
  mixed: { label: "Mixed Energy", className: "bg-primary/15 text-primary border-primary/30" },
};

export function VibeCard({ analysis, loading }: { analysis: VibeAnalysis | null; loading: boolean }) {
  if (loading) {
    return (
      <motion.div
        className="glass-card rounded-2xl p-6 space-y-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Sparkles size={14} className="animate-pulse text-primary" />
          Analyzing Playlist Vibe...
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
        </div>
      </motion.div>
    );
  }

  if (!analysis) return null;

  const energy = ENERGY_CONFIG[analysis.energyLevel] || ENERGY_CONFIG.mixed;

  return (
    <motion.div
      className="glass-card rounded-2xl p-6 space-y-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        <Sparkles size={14} className="text-primary" />
        Playlist Vibe Analysis
      </div>

      {/* Genres + Energy */}
      <div className="flex flex-wrap gap-2">
        {analysis.genres.map((genre) => (
          <Badge key={genre} variant="secondary" className="font-mono text-xs">
            {genre}
          </Badge>
        ))}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${energy.className}`}>
          <Zap size={10} /> {energy.label}
        </span>
      </div>

      {/* Mood */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Music size={12} /> Mood
        </div>
        <p className="text-sm text-secondary-foreground">{analysis.mood}</p>
      </div>

      {/* Vibe */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sonic Character</div>
        <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.vibe}</p>
      </div>

      {/* Ideal Submission */}
      <div className="space-y-1 bg-primary/5 rounded-lg p-3 border border-primary/10">
        <div className="text-xs font-semibold text-primary uppercase tracking-wider">🎯 Ideal Submission</div>
        <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.idealSubmission}</p>
      </div>

      {/* Standout Artists */}
      {analysis.standoutArtists.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Users size={12} /> Key Artists
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {analysis.standoutArtists.join(" · ")}
          </p>
        </div>
      )}
    </motion.div>
  );
}
