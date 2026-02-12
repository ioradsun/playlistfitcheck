import { motion } from "framer-motion";
import { ArrowLeft, Info, MessageSquare, ArrowRight, Target, ThumbsUp, AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { PitchBadge } from "@/components/PitchBadge";
import { VibeCard, type VibeAnalysis } from "@/components/VibeCard";
import { type SongFitAnalysis, FIT_CONFIG } from "@/components/SongFitCard";
import { PitchDraftCard } from "@/components/PitchDraftCard";
import type { HealthOutput } from "@/lib/playlistHealthEngine";
import type { PlaylistInput } from "@/lib/playlistHealthEngine";

interface Props {
  result: HealthOutput;
  inputData?: PlaylistInput;
  playlistName?: string;
  vibeAnalysis?: VibeAnalysis | null;
  vibeLoading?: boolean;
  songFitAnalysis?: SongFitAnalysis | null;
  songFitLoading?: boolean;
  onBack: () => void;
}

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

// Priority order per spec: Song Activity, Focus Level, Curator Type, Recent Activity, Reach Per Song, Rotation Style, Song Placement
const CATEGORY_META: { key: keyof HealthOutput["scoreBreakdown"]; label: string; max: number; description: string }[] = [
  { key: "songActivity", label: "Song Activity", max: 20, description: "Are the songs on this playlist generally active on Spotify? Active songs usually indicate real listener demand." },
  { key: "focusLevel", label: "Focus Level", max: 20, description: "Is it a niche fit or a crowded playlist? Focused playlists tend to drive deeper engagement per track." },
  { key: "curatorType", label: "Curator Type", max: 15, description: "Who owns this playlist and how should you approach it? Detects editorial, submission, and pay-for-play signals." },
  { key: "recentActivity", label: "Recent Activity", max: 15, description: "Is the curator still paying attention? Inactive playlists are unlikely to help your song gain traction." },
  { key: "reachPerSong", label: "Reach Per Song", max: 15, description: "How many followers per track? This reflects the potential exposure each song receives." },
  { key: "rotationStyle", label: "Rotation Style", max: 20, description: "Will your song stick around or get removed quickly? Measures how often songs are changed over 30 days." },
  { key: "songPlacement", label: "Song Placement", max: 15, description: "Are new tracks placed thoughtfully or added at the bottom? Thoughtful placement suggests active curation." },
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

export function ResultsDashboard({ result, inputData, playlistName, vibeAnalysis, vibeLoading, songFitAnalysis, songFitLoading, onBack }: Props) {
  const hasBlendedScore = !!songFitAnalysis;

  // Map blended labels to health labels for the ScoreGauge
  const BLENDED_TO_HEALTH: Record<string, HealthOutput["summary"]["healthLabel"]> = {
    PERFECT_FIT: "GREAT_FIT",
    STRONG_FIT: "GOOD_FIT",
    DECENT_FIT: "POSSIBLE_FIT",
    WEAK_FIT: "WEAK_FIT",
    POOR_FIT: "POOR_FIT",
  };

  const displayScore = hasBlendedScore ? songFitAnalysis.blendedScore : result.summary.healthScore;
  const displayLabel = hasBlendedScore
    ? (BLENDED_TO_HEALTH[songFitAnalysis.blendedLabel] || "POSSIBLE_FIT")
    : result.summary.healthLabel;
  const fit = hasBlendedScore ? (FIT_CONFIG[songFitAnalysis.blendedLabel] || FIT_CONFIG.DECENT_FIT) : null;

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
          <h2 className="text-xl font-bold">
            {hasBlendedScore && songFitAnalysis.songName
              ? `${songFitAnalysis.songName} × ${playlistName || "Playlist"}`
              : playlistName || "Playlist Analysis"}
          </h2>
          <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
            {result.input.playlistUrl}
          </p>
        </div>
      </div>

      {/* Top section: Score + Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          {songFitLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-32 h-32 rounded-full border-4 border-muted animate-pulse flex items-center justify-center">
                <Target size={24} className="text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Analyzing fit...</p>
            </div>
          ) : (
            <>
              <ScoreGauge score={displayScore} label={displayLabel} />
              {hasBlendedScore && fit ? (
                <div className="mt-4">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-mono border ${fit.className}`}>
                    {fit.emoji} {fit.text}
                  </span>
                </div>
              ) : (
                <div className="mt-4">
                  <PitchBadge suitability={result.summary.pitchSuitability} />
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Breakdown */}
        <motion.div
          className="glass-card rounded-2xl p-6 space-y-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {hasBlendedScore ? "Playlist Breakdown" : "Score Breakdown"}
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

      {/* Blended Song Fit Details (replaces narrative/recommendation when present) */}
      {hasBlendedScore && (
        <>
          {/* Summary */}
          <motion.div
            className="glass-card rounded-xl p-5 space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Target size={14} className="text-primary" />
              {songFitAnalysis.songName ? `"${songFitAnalysis.songName}" Fit Analysis` : "Fit Analysis"}
            </div>
            <p className="text-sm text-secondary-foreground leading-relaxed">{songFitAnalysis.summary}</p>

            {/* Sub-scores */}
            {(songFitAnalysis.sonicFitScore != null || songFitAnalysis.playlistQualityScore != null) && (
              <div className="flex gap-4 pt-2">
                {songFitAnalysis.sonicFitScore != null && (
                  <div className="text-xs text-muted-foreground font-mono">
                    Sonic Fit: <span className="text-foreground font-bold">{songFitAnalysis.sonicFitScore}/100</span>
                  </div>
                )}
                {songFitAnalysis.playlistQualityScore != null && (
                  <div className="text-xs text-muted-foreground font-mono">
                    Playlist Quality: <span className="text-foreground font-bold">{songFitAnalysis.playlistQualityScore}/100</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Strengths & Concerns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {songFitAnalysis.strengths.length > 0 && (
              <motion.div
                className="glass-card rounded-xl p-5 space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-score-excellent uppercase tracking-wider">
                  <ThumbsUp size={12} /> Strengths
                </div>
                <ul className="space-y-1.5">
                  {songFitAnalysis.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-secondary-foreground flex items-start gap-2">
                      <span className="text-score-excellent mt-0.5">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
            {songFitAnalysis.concerns.length > 0 && (
              <motion.div
                className="glass-card rounded-xl p-5 space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-score-ok uppercase tracking-wider">
                  <AlertTriangle size={12} /> Concerns
                </div>
                <ul className="space-y-1.5">
                  {songFitAnalysis.concerns.map((c, i) => (
                    <li key={i} className="text-sm text-secondary-foreground flex items-start gap-2">
                      <span className="text-score-ok mt-0.5">•</span> {c}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </div>

          {/* Suggestion */}
          {songFitAnalysis.suggestion && (
            <motion.div
              className="glass-card rounded-xl p-5 space-y-2 border-primary/20"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Lightbulb size={14} />
                Suggestion
              </div>
              <p className="text-sm text-secondary-foreground leading-relaxed">
                {songFitAnalysis.suggestion}
              </p>
            </motion.div>
          )}
        </>
      )}

      {/* Narrative (only when no blended score) */}
      {!hasBlendedScore && result.narrative && (
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

      {/* Recommendation (only when no blended score) */}
      {!hasBlendedScore && result.recommendation && (
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

      {/* Pitch Draft */}
      {hasBlendedScore && songFitAnalysis.songName && playlistName && (
        <PitchDraftCard
          songName={songFitAnalysis.songName}
          artistName={undefined}
          playlistName={playlistName}
          curatorName={inputData?.ownerName}
          fitLabel={songFitAnalysis.blendedLabel}
          strengths={songFitAnalysis.strengths}
          concerns={songFitAnalysis.concerns}
          suggestion={songFitAnalysis.suggestion}
          inputData={inputData}
          blendedScore={songFitAnalysis.blendedScore}
        />
      )}

      {/* Vibe Analysis */}
      {(vibeLoading || vibeAnalysis) && (
        <VibeCard analysis={vibeAnalysis || null} loading={!!vibeLoading} playlistName={playlistName} />
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
