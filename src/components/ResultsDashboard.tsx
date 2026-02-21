import { useEffect } from "react";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { PitchBadge } from "@/components/PitchBadge";
import { VibeCard, type VibeAnalysis } from "@/components/VibeCard";
import { type SongFitAnalysis, FIT_CONFIG } from "@/components/SongFitCard";
import { PitchDraftCard } from "@/components/PitchDraftCard";

import type { HealthOutput } from "@/lib/playlistHealthEngine";
import type { PlaylistInput } from "@/lib/playlistHealthEngine";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

interface Props {
  result: HealthOutput;
  inputData?: PlaylistInput;
  playlistName?: string;
  vibeAnalysis?: VibeAnalysis | null;
  vibeLoading?: boolean;
  songFitAnalysis?: SongFitAnalysis | null;
  songFitLoading?: boolean;
  onBack: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
}

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

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
  if (score === null) return { icon: "○", color: "text-muted-foreground" };
  const pct = (score / max) * 100;
  if (pct >= 75) return { icon: "●", color: "text-foreground" };
  if (pct >= 45) return { icon: "◐", color: "text-muted-foreground" };
  return { icon: "○", color: "text-muted-foreground/50" };
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/50 mb-3">
      {children}
    </p>
  );
}

export function ResultsDashboard({ result, inputData, playlistName, vibeAnalysis, vibeLoading, songFitAnalysis, songFitLoading, onBack, onHeaderProject }: Props) {
  const hasBlendedScore = !!songFitAnalysis;

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

  const headerTitle = hasBlendedScore && songFitAnalysis.songName
    ? `${songFitAnalysis.songName}${songFitAnalysis.artistName ? ` · ${songFitAnalysis.artistName}` : ""}`
    : playlistName || "Playlist Analysis";

  useEffect(() => {
    onHeaderProject?.({ title: headerTitle, onBack });
    return () => onHeaderProject?.(null);
  }, [headerTitle, onBack, onHeaderProject]);

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 space-y-10 px-0 sm:px-0">

      {/* Sub-header */}
      <div>
        {hasBlendedScore && playlistName && (
          <p className="text-xs text-muted-foreground">vs {playlistName}</p>
        )}
        {!hasBlendedScore && (
          <p className="text-xs text-muted-foreground/60 truncate">{result.input.playlistUrl}</p>
        )}
      </div>

      {/* Score + Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col items-center justify-center gap-4 py-4">
          {songFitLoading ? (
            <div className="w-32 h-32 rounded-full border border-border/40 flex items-center justify-center">
              <span className="text-xs text-muted-foreground tracking-wide">Analyzing…</span>
            </div>
          ) : (
            <>
              <ScoreGauge score={displayScore} label={displayLabel} hideLabel={hasBlendedScore} />
              {hasBlendedScore && fit ? (
                <span className={`text-xs font-medium tracking-wide uppercase border border-border/40 px-3 py-1 rounded-sm ${fit.className}`}>
                  {fit.text}
                </span>
              ) : (
                <PitchBadge suitability={result.summary.pitchSuitability} />
              )}
            </>
          )}
        </div>

        <div className="space-y-3 py-4">
          <Label>{hasBlendedScore ? "Playlist Breakdown" : "Score Breakdown"}</Label>
          {CATEGORY_META.map((cat) => {
            const indicator = getScoreIndicator(result.scoreBreakdown[cat.key], cat.max);
            return (
              <CategoryBar
                key={cat.key}
                label={cat.label}
                description={cat.description}
                dataLabel={getDataLabel(cat.key, inputData)}
                score={result.scoreBreakdown[cat.key]}
                max={cat.max}
                delay={0}
                indicator={indicator.icon}
              />
            );
          })}
        </div>
      </div>

      {/* Blended Song Fit */}
      {hasBlendedScore && (
        <>
          {/* Fit Analysis */}
          <div className="space-y-4">
            <Label>
              {songFitAnalysis.songName ? `"${songFitAnalysis.songName}" · Fit Analysis` : "Fit Analysis"}
            </Label>
            <p className="text-sm text-foreground/80 leading-relaxed">{songFitAnalysis.summary}</p>

            {(songFitAnalysis.sonicFitScore != null || songFitAnalysis.playlistQualityScore != null) && (
              <div className="flex gap-6 pt-2">
                {songFitAnalysis.sonicFitScore != null && (
                  <div>
                    <p className="text-xs text-muted-foreground/50 mb-0.5">Sonic Fit</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-lg font-semibold">{songFitAnalysis.sonicFitScore}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>
                )}
                {songFitAnalysis.playlistQualityScore != null && (
                  <div>
                    <p className="text-xs text-muted-foreground/50 mb-0.5">Playlist Quality</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-lg font-semibold">{songFitAnalysis.playlistQualityScore}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strengths & Concerns */}
          {(songFitAnalysis.strengths.length > 0 || songFitAnalysis.concerns.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {songFitAnalysis.strengths.length > 0 && (
                <div>
                  <Label>Strengths</Label>
                  <ul className="space-y-1.5">
                    {songFitAnalysis.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
                        <span className="text-score-excellent shrink-0 text-xs mt-0.5">✓</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {songFitAnalysis.concerns.length > 0 && (
                <div>
                  <Label>Concerns</Label>
                  <ul className="space-y-1.5">
                    {songFitAnalysis.concerns.map((c, i) => (
                      <li key={i} className="text-sm text-foreground/70 flex items-start gap-2">
                        <span className="text-muted-foreground/40 shrink-0 text-xs mt-0.5">—</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Suggestion */}
          {songFitAnalysis.suggestion && (
            <div>
              <Label>Suggestion</Label>
              <p className="text-sm text-foreground/80 leading-relaxed">{songFitAnalysis.suggestion}</p>
            </div>
          )}
        </>
      )}

      {/* Narrative */}
      {!hasBlendedScore && result.narrative && (
        <div>
          <Label>
            Why this {result.summary.healthScore >= 75 ? "works" : result.summary.healthScore >= 60 ? "might work" : "doesn't work"} for you
          </Label>
          <p className="text-sm text-foreground/80 leading-relaxed">{result.narrative}</p>
        </div>
      )}

      {/* Recommendation */}
      {!hasBlendedScore && result.recommendation && (
        <div>
          <Label>What to do</Label>
          <p className="text-sm text-foreground/80 leading-relaxed">{result.recommendation}</p>
        </div>
      )}

      {/* Pitch Draft */}
      {hasBlendedScore && songFitAnalysis.songName && playlistName && (
        <PitchDraftCard
          songName={songFitAnalysis.songName}
          artistName={songFitAnalysis.artistName}
          soundDescription={songFitAnalysis.soundDescription}
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

      <SignUpToSaveBanner />
    </div>
  );
}
