import type { ProfileSong } from "@/components/profile/types";
import { SongCard } from "@/components/profile/SongCard";

interface Props {
  songs: ProfileSong[];
  isOwner: boolean;
  onOpenSong: (song: ProfileSong) => void;
}

export function CatalogGrid({ songs, isOwner, onOpenSong }: Props) {
  if (!songs.length) {
    if (!isOwner) return null;
    return (
      <section className="rounded-xl border border-white/10 p-4">
        <p className="text-sm text-muted-foreground">Drop your first song.</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <p className="text-xs font-mono tracking-[0.18em] text-muted-foreground">CATALOG</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} isOwner={isOwner} onOpenSong={onOpenSong} />
        ))}
      </div>
    </section>
  );
}
