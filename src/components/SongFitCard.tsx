import { motion } from "framer-motion";
import { Music, Target, ThumbsUp, AlertTriangle, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SongFitAnalysis {
  blendedScore: number;
  blendedLabel: "PERFECT_FIT" | "STRONG_FIT" | "DECENT_FIT" | "WEAK_FIT" | "POOR_FIT";
  summary: string;
  strengths: string[];
  concerns: string[];
  suggestion: string;
  songName?: string;
  artistName?: string;
  sonicFitScore?: number;
  playlistQualityScore?: number;
}

const FIT_CONFIG: Record<string, { emoji: string; text: string; className: string }> = {
  PERFECT_FIT: { emoji: "🎯", text: "Perfect Fit", className: "bg-score-excellent/15 text-score-excellent border-score-excellent/30" },
  STRONG_FIT: { emoji: "🔥", text: "Strong Fit", className: "bg-score-excellent/15 text-score-excellent border-score-excellent/30" },
  DECENT_FIT: { emoji: "👍", text: "Decent Fit", className: "bg-score-ok/15 text-score-ok border-score-ok/30" },
  WEAK_FIT: { emoji: "⚠️", text: "Weak Fit", className: "bg-score-bad/15 text-score-bad border-score-bad/30" },
  POOR_FIT: { emoji: "❌", text: "Poor Fit", className: "bg-score-bad/15 text-score-bad border-score-bad/30" },
};

export { FIT_CONFIG };

export function SongFitCard({ analysis, loading }: { analysis: SongFitAnalysis | null; loading: boolean }) {
  if (loading) {
    return (
      <motion.div
        className="glass-card rounded-2xl p-6 space-y-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Target size={14} className="animate-pulse text-primary" />
          Analyzing Song Fit...
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

  const fit = FIT_CONFIG[analysis.blendedLabel] || FIT_CONFIG.DECENT_FIT;

  return (
    <motion.div
      className="glass-card rounded-2xl p-6 space-y-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Target size={14} className="text-primary" />
          {analysis.songName ? `"${analysis.songName}" Fit Analysis` : "Song Fit Analysis"}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border ${fit.className}`}>
            {fit.emoji} {fit.text}
          </span>
          <span className="text-lg font-bold text-foreground">{analysis.blendedScore}/100</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.summary}</p>

      {/* Strengths */}
      {analysis.strengths.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-score-excellent uppercase tracking-wider">
            <ThumbsUp size={12} /> Strengths
          </div>
          <ul className="space-y-1">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="text-sm text-secondary-foreground flex items-start gap-2">
                <span className="text-score-excellent mt-0.5">✓</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns */}
      {analysis.concerns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-score-ok uppercase tracking-wider">
            <AlertTriangle size={12} /> Concerns
          </div>
          <ul className="space-y-1">
            {analysis.concerns.map((c, i) => (
              <li key={i} className="text-sm text-secondary-foreground flex items-start gap-2">
                <span className="text-score-ok mt-0.5">•</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestion */}
      {analysis.suggestion && (
        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
            <Lightbulb size={12} /> Suggestion
          </div>
          <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.suggestion}</p>
        </div>
      )}
    </motion.div>
  );
}
