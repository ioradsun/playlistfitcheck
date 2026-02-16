import type { HealthOutput } from "@/lib/playlistHealthEngine";

const CONFIG: Record<HealthOutput["summary"]["pitchSuitability"], { label: string; className: string }> = {
  WORTH_PITCHING: { label: "Worth Pitching", className: "bg-primary text-primary-foreground border-primary" },
  LOW_PRIORITY: { label: "Low Priority", className: "bg-score-weak text-white border-score-weak" },
  ACCEPTS_SUBMISSIONS: { label: "Accepts Submissions", className: "bg-score-strong text-white border-score-strong" },
  HIGH_RISK: { label: "⚠ High Risk", className: "bg-score-bad text-white border-score-bad" },
  SPOTIFY_EDITORIAL: { label: "Spotify Editorial — Use S4A", className: "bg-score-ok text-white border-score-ok" },
};

export function PitchBadge({ suitability }: { suitability: HealthOutput["summary"]["pitchSuitability"] }) {
  const { label, className } = CONFIG[suitability];
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${className}`}>
      {label}
    </span>
  );
}
