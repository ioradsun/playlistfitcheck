import { motion } from "framer-motion";
import { ArrowLeft, Info, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { PitchBadge } from "@/components/PitchBadge";
import { VibeCard, type VibeAnalysis } from "@/components/VibeCard";
import type { HealthOutput } from "@/lib/playlistHealthEngine";
import type { PlaylistInput } from "@/lib/playlistHealthEngine";

interface Props {
  result: HealthOutput;
  inputData?: PlaylistInput;
  playlistName?: string;
  vibeAnalysis?: VibeAnalysis | null;
  vibeLoading?: boolean;
  onBack: () => void;
}

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

// Priority order per spec: Song Activity, Focus Level, Curator Type, Recent Activity, Reach Per Song, Rotation Style, Song Placement
const CATEGORY_META: { key: keyof HealthOutput["scoreBreakdown"]; label: string; max: number; description: string }[] = [
  { key: "songActivity", label: "Song Activity", max: 20, description: "Do people actually listen here? Average track popularity reflects saves, streams, and real listener behavior." },
  { key: "focusLevel", label: "Focus Level", max: 20, description: "Is it a niche fit or a crowded mess? Smaller, focused playlists = deeper listener engagement." },
  { key: "curatorType", label: "Curator Type", max: 15, description: "Who owns this playlist and how should you pitch? Detects editorial, submission, and pay-for-play signals." },
  { key: "recentActivity", label: "Recent Activity", max: 15, description: "Is the curator still paying attention? Dead playlists = dead ends." },
  { key: "reachPerSong", label: "Reach Per Song", max: 15, description: "How many followers per track? This is the exposure each song gets." },
  { key: "rotationStyle", label: "Rotation Style", max: 20, description: "Will your song stick around or get deleted quickly? Track add/remove rate over 30 days." },
  { key: "songPlacement", label: "Song Placement", max: 15, description: "Are new tracks placed thoughtfully or dumped at the bottom? Bottom-dumping = lazy curation." },
];

function getScoreIndicator(score: number | null, max: number): { icon: string; color: string } {
  if (score === null) return { icon: "—", color: "text-muted-foreground" };
  const pct = (score / max) * 100;
  if (pct >= 75) return { icon: "✅", color: "text-score-excellent" };
  if (pct >= 45) return { icon: "⚠️", color: "text-score-ok" };
  return { icon: "❌", color: "text-score-bad" };
}

function getDataLabel(key: string, input?: PlaylistInput): string | undefined {
  if (!input) return undefined;
  switch (key) {
    case "focusLevel":
      return input.tracksTotal != null ? `${fmt(input.tracksTotal)} tracks` : undefined;
    case "reachPerSong": {
      if (input.followersTotal != null && input.tracksTotal != null && input.tracksTotal > 0) {
        const ratio = Math.round(input.followersTotal / input.tracksTotal);
        return `${fmt(input.followersTotal)} followers ÷ ${fmt(input.tracksTotal)} tracks = ${ratio}:1 ratio`;
      }
      if (input.followersTotal != null) return `${fmt(input.followersTotal)} followers`;
      return undefined;
    }
    case "songActivity":
      return input.avgTrackPopularity != null ? `Avg popularity: ${input.avgTrackPopularity}/100` : undefined;
    case "recentActivity":
      return input.lastUpdatedDays != null
        ? input.lastUpdatedDays === 0 ? "Updated today" : `Updated ${input.lastUpdatedDays} day${input.lastUpdatedDays !== 1 ? "s" : ""} ago`
        : undefined;
    case "curatorType": {
      const parts: string[] = [];
      if (input.ownerName) parts.push(`by ${input.ownerName}`);
      if (input.playlistOwnerIsSpotifyEditorial) parts.push("(Spotify Editorial)");
      if (input.submissionLanguageDetected) parts.push("⚠ submission language");
      return parts.length > 0 ? parts.join(" ") : undefined;
    }
    case "rotationStyle":
      return input.churnRate30d != null ? `${Math.round(input.churnRate30d * 100)}% churn over 30 days` : undefined;
    case "songPlacement":
      return input.bottomDumpScore != null ? `${Math.round(input.bottomDumpScore * 100)}% of new tracks placed at bottom` : undefined;
    default:
      return undefined;
  }
}

export function ResultsDashboard({ result, inputData, playlistName, vibeAnalysis, vibeLoading, onBack }: Props) {
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
          {CATEGORY_META.map((cat, i) => {
            const indicator = getScoreIndicator(result.scoreBreakdown[cat.key], cat.max);
            return (
              <CategoryBar
                key={cat.key}
                label={cat.label}
                description={cat.description}
                dataLabel={getDataLabel(cat.key, inputData)}
                score={result.scoreBreakdown[cat.key]}
                max={cat.max}
                delay={0.3 + i * 0.08}
                indicator={indicator.icon}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Narrative */}
      {result.narrative && (
        <motion.div
          className="glass-card rounded-xl p-5 space-y-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MessageSquare size={14} className="text-primary" />
            Why this {result.summary.healthScore >= 75 ? "works" : result.summary.healthScore >= 60 ? "might work" : "doesn't work"} for you
          </div>
          <p className="text-sm text-secondary-foreground leading-relaxed">
            {result.narrative}
          </p>
        </motion.div>
      )}

      {/* Recommendation */}
      {result.recommendation && (
        <motion.div
          className="glass-card rounded-xl p-5 space-y-2 border-primary/20"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ArrowRight size={14} />
            What to do
          </div>
          <p className="text-sm text-secondary-foreground leading-relaxed">
            {result.recommendation}
          </p>
        </motion.div>
      )}

      {/* Vibe Analysis */}
      {(vibeLoading || vibeAnalysis) && (
        <VibeCard analysis={vibeAnalysis || null} loading={!!vibeLoading} />
      )}

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
