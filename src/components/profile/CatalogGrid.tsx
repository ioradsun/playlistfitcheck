import type { ProfileSong } from "@/components/profile/types";
import { SongCard } from "@/components/profile/SongCard";

interface Props {
  songs: ProfileSong[];
  isOwner: boolean;
  onOpenSong: (song: ProfileSong) => void;
}

export function CatalogGrid({ songs, isOwner, onOpenSong }: Props) {
  if (!songs.length) return null;

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
