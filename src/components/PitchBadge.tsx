import type { HealthOutput } from "@/lib/playlistHealthEngine";

const CONFIG: Record<HealthOutput["summary"]["pitchSuitability"], { label: string; className: string }> = {
  WORTH_PITCHING: { label: "Worth Pitching", className: "bg-primary/15 text-primary border-primary/30" },
  LOW_PRIORITY: { label: "Low Priority", className: "bg-score-weak/15 text-score-weak border-score-weak/30" },
  ACCEPTS_SUBMISSIONS: { label: "Accepts Submissions", className: "bg-score-strong/15 text-score-strong border-score-strong/30" },
  HIGH_RISK: { label: "⚠ High Risk", className: "bg-score-bad/15 text-score-bad border-score-bad/30" },
  SPOTIFY_EDITORIAL: { label: "Spotify Editorial — Use S4A", className: "bg-score-ok/15 text-score-ok border-score-ok/30" },
};

export function PitchBadge({ suitability }: { suitability: HealthOutput["summary"]["pitchSuitability"] }) {
  const { label, className } = CONFIG[suitability];
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${className}`}>
      {label}
    </span>
  );
}
