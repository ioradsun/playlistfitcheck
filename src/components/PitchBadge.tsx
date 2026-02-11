import type { HealthOutput } from "@/lib/playlistHealthEngine";

const CONFIG: Record<HealthOutput["summary"]["pitchSuitability"], { label: string; className: string }> = {
  GOOD_TARGET: { label: "Good Target", className: "bg-primary/15 text-primary border-primary/30" },
  LOW_PRIORITY: { label: "Low Priority", className: "bg-score-weak/15 text-score-weak border-score-weak/30" },
  RISKY_SUBMISSION_FUNNEL: { label: "Risky — Submission Funnel", className: "bg-score-bad/15 text-score-bad border-score-bad/30" },
  DO_NOT_PITCH_SPOTIFY_OWNED: { label: "Spotify Editorial — Do Not Pitch", className: "bg-score-ok/15 text-score-ok border-score-ok/30" },
};

export function PitchBadge({ suitability }: { suitability: HealthOutput["summary"]["pitchSuitability"] }) {
  const { label, className } = CONFIG[suitability];
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${className}`}>
      {label}
    </span>
  );
}
