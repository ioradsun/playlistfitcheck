import type { PersonChip } from "@/components/profile/types";
import { PeopleRow } from "@/components/profile/PeopleRow";

interface Props {
  isOwner: boolean;
  topSupporters: PersonChip[];
  whoTheyBack: PersonChip[];
  mutuals: PersonChip[];
  recentLocks: PersonChip[];
  onOpenPerson: (userId: string) => void;
}

export function FmlyFabric({ isOwner, topSupporters, whoTheyBack, mutuals, recentLocks, onOpenPerson }: Props) {
  const hasData = topSupporters.length || whoTheyBack.length || mutuals.length || recentLocks.length;
  if (!hasData && !isOwner) return null;

  return (
    <section className="rounded-2xl border border-white/10 p-4 space-y-4">
      <p className="text-xs font-mono tracking-[0.2em] text-primary">FMLY FABRIC</p>
      <PeopleRow
        title="Top supporters"
        people={topSupporters}
        emptyText={isOwner ? "Top supporters will appear here once fans fire your songs." : undefined}
        onOpenPerson={onOpenPerson}
      />
      <PeopleRow
        title="Who they back"
        people={whoTheyBack}
        emptyText={isOwner ? "When you fire someone's song, they'll show up here." : undefined}
        onOpenPerson={onOpenPerson}
      />
      <PeopleRow
        title="In your FMLY"
        people={mutuals}
        emptyText={isOwner ? "Mutual energy shows up here." : undefined}
        onOpenPerson={onOpenPerson}
      />
      <PeopleRow
        title="Recent locks"
        people={recentLocks}
        emptyText={isOwner ? "Recent lock-ins show up here." : undefined}
        onOpenPerson={onOpenPerson}
      />
    </section>
  );
}
