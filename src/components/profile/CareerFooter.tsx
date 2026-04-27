import type { CareerStats } from "@/components/profile/types";

interface Props {
  stats: CareerStats;
}

export function CareerFooter({ stats }: Props) {
  if (!stats.songs && !stats.fires) return null;

  return (
    <footer className="rounded-xl border border-white/10 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tracking-wide">
        <div>
          <p className="text-muted-foreground">SONGS</p>
          <p>{stats.songs}</p>
        </div>
        <div>
          <p className="text-muted-foreground">FIRES</p>
          <p className="text-orange-300">{stats.fires}</p>
        </div>
        <div>
          <p className="text-muted-foreground">AVG/SONG</p>
          <p>{stats.avgFires}</p>
        </div>
        <div>
          <p className="text-muted-foreground">TENURE</p>
          <p>{stats.tenureDays}d</p>
        </div>
      </div>
    </footer>
  );
}
