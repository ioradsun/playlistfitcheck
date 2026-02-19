import type { HealthOutput } from "@/lib/playlistHealthEngine";

const CONFIG: Record<HealthOutput["summary"]["pitchSuitability"], { label: string }> = {
  WORTH_PITCHING: { label: "Worth Pitching" },
  LOW_PRIORITY: { label: "Low Priority" },
  ACCEPTS_SUBMISSIONS: { label: "Accepts Submissions" },
  HIGH_RISK: { label: "High Risk" },
  SPOTIFY_EDITORIAL: { label: "Spotify Editorial — Use S4A" },
};

export function PitchBadge({ suitability }: { suitability: HealthOutput["summary"]["pitchSuitability"] }) {
  const { label } = CONFIG[suitability];
  return (
    <span className="inline-flex items-center px-3 py-1 font-mono text-[11px] tracking-widest uppercase border border-border/40 rounded-sm text-foreground">
      {label}
    </span>
  );
}
