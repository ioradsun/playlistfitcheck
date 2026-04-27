import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PersonChip } from "@/components/profile/types";

interface Props {
  title: string;
  people: PersonChip[];
  emptyText?: string;
  onOpenPerson: (userId: string) => void;
}

export function PeopleRow({ title, people, emptyText, onOpenPerson }: Props) {
  if (!people.length && !emptyText) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-mono tracking-[0.18em] text-muted-foreground">{title}</p>
      {!people.length ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <button
              key={`${title}-${person.user_id}`}
              onClick={() => onOpenPerson(person.user_id)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-2.5 py-1.5"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={person.avatar_url ?? undefined} />
                <AvatarFallback>{person.display_name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-xs">{person.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
