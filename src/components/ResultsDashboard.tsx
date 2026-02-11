import { motion } from "framer-motion";
import { ArrowLeft, AlertTriangle, Info, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { PitchBadge } from "@/components/PitchBadge";
import type { HealthOutput } from "@/lib/playlistHealthEngine";

interface Props {
  result: HealthOutput;
  playlistName?: string;
  onBack: () => void;
}

const CATEGORY_META: { key: keyof HealthOutput["scoreBreakdown"]; label: string; max: number; description: string }[] = [
  { key: "sizeFocus", label: "Size vs Focus", max: 20, description: "Ideal playlists have 30–80 tracks. Oversized playlists dilute listener attention." },
  { key: "followerTrackRatio", label: "Follower/Track Ratio", max: 15, description: "Higher follower-to-track ratio means more listeners per song — a quality signal." },
  { key: "updateCadence", label: "Update Cadence", max: 15, description: "How recently the playlist was updated. Improves with repeated analyses over time." },
  { key: "curatorIntentQuality", label: "Curator Intent", max: 15, description: "Evaluates owner type, description quality, and submission language signals." },
  { key: "churnStability", label: "Churn vs Stability", max: 20, description: "Track add/remove rate over 30 days. Requires 2+ analyses spaced over time." },
  { key: "trackPlacementBehavior", label: "Track Placement", max: 15, description: "Detects if new tracks are dumped at the bottom vs placed thoughtfully. Requires 2+ analyses." },
];

export function ResultsDashboard({ result, playlistName, onBack }: Props) {
  return (
    <motion.div
      className="w-full max-w-3xl mx-auto space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h2 className="text-xl font-bold">{playlistName || "Playlist Analysis"}</h2>
          <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
            {result.input.playlistUrl}
          </p>
        </div>
      </div>

      {/* Top section: Score + Pitch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <ScoreGauge score={result.summary.healthScore} label={result.summary.healthLabel} />
          <div className="mt-4">
            <PitchBadge suitability={result.summary.pitchSuitability} />
          </div>
        </motion.div>

        {/* Breakdown */}
        <motion.div
          className="glass-card rounded-2xl p-6 space-y-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Score Breakdown
          </h3>
          {CATEGORY_META.map((cat, i) => (
            <CategoryBar
              key={cat.key}
              label={cat.label}
              description={cat.description}
              score={result.scoreBreakdown[cat.key]}
              max={cat.max}
              delay={0.3 + i * 0.08}
            />
          ))}
        </motion.div>
      </div>

      {/* Flags, Missing, Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {result.flags.length > 0 && (
          <motion.div
            className="glass-card rounded-xl p-4 space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center gap-2 text-score-weak text-sm font-semibold">
              <Flag size={14} /> Flags
            </div>
            {result.flags.map(f => (
              <div key={f} className="text-xs font-mono text-secondary-foreground bg-muted rounded px-2 py-1">
                {f}
              </div>
            ))}
          </motion.div>
        )}

        {result.missingFields.length > 0 && (
          <motion.div
            className="glass-card rounded-xl p-4 space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-center gap-2 text-score-ok text-sm font-semibold">
              <AlertTriangle size={14} /> Missing Data
            </div>
            {result.missingFields.map(f => (
              <div key={f} className="text-xs font-mono text-muted-foreground">
                {f}
              </div>
            ))}
          </motion.div>
        )}

        {result.notes.length > 0 && (
          <motion.div
            className="glass-card rounded-xl p-4 space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <div className="flex items-center gap-2 text-primary text-sm font-semibold">
              <Info size={14} /> Notes
            </div>
            {result.notes.map((n, i) => (
              <p key={i} className="text-xs text-secondary-foreground">{n}</p>
            ))}
          </motion.div>
        )}
      </div>

      {/* Raw JSON toggle */}
      <motion.details
        className="glass-card rounded-xl p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <summary className="text-xs text-muted-foreground cursor-pointer font-mono hover:text-foreground transition-colors">
          View Raw JSON Output
        </summary>
        <pre className="mt-3 text-xs font-mono text-secondary-foreground overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      </motion.details>
    </motion.div>
  );
}
