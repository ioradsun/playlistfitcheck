import type { Momentum } from "@/components/profile/types";

interface Props {
  momentum: Momentum;
}

function formatDate(ts: string | null) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ts));
}

export function MomentumStrip({ momentum }: Props) {
  if (!momentum.latestDropAt && momentum.lockedInCount === 0 && momentum.firesThisWeek === 0) return null;

  return (
    <section className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-white/10 px-3 py-2">
        <p className="text-[10px] font-mono tracking-[0.15em] text-muted-foreground">LATEST DROP</p>
        <p className="text-sm mt-1">{formatDate(momentum.latestDropAt)}</p>
      </div>
      <div className="rounded-xl border border-white/10 px-3 py-2">
        <p className="text-[10px] font-mono tracking-[0.15em] text-muted-foreground">LOCKED-IN</p>
        <p className="text-sm mt-1 text-primary">{momentum.lockedInCount}</p>
      </div>
      <div className="rounded-xl border border-white/10 px-3 py-2">
        <p className="text-[10px] font-mono tracking-[0.15em] text-muted-foreground">FIRES / 7D</p>
        <p className="text-sm mt-1 text-orange-300">{momentum.firesThisWeek}</p>
      </div>
    </section>
  );
}
