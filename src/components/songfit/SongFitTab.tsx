import { SongFitFeed } from "./SongFitFeed";
import { PageBadge } from "@/components/PageBadge";

export function SongFitTab() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <PageBadge label="CrowdFit" subtitle="See how your song fits listeners." />
      <SongFitFeed />
    </div>
  );
}
