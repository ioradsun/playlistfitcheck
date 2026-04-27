import { Flame, MessageCircle } from "lucide-react";
import { cdnImage } from "@/lib/cdnImage";
import type { ProfileSong } from "@/components/profile/types";

interface Props {
  song: ProfileSong;
  isOwner: boolean;
  onOpenSong: (song: ProfileSong) => void;
}

export function SongCard({ song, isOwner, onOpenSong }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpenSong(song)}
      className="rounded-xl border border-white/10 p-2 text-left hover:border-white/20 transition-colors"
    >
      {song.lyric_projects?.album_art_url ? (
        <img
          src={cdnImage(song.lyric_projects.album_art_url, "live")}
          alt={song.lyric_projects?.title ?? "song cover"}
          className="w-full aspect-square rounded-lg object-cover"
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-secondary/50" />
      )}
      <p className="mt-2 text-sm truncate">{song.lyric_projects?.title ?? song.caption ?? "Untitled"}</p>
      <div className="mt-1 text-[11px] font-mono text-muted-foreground flex items-center gap-2">
        <span className="inline-flex items-center gap-1"><Flame size={11} className="text-orange-300" />{song.fires_count}</span>
        <span className="inline-flex items-center gap-1"><MessageCircle size={11} />{song.comments_count}</span>
      </div>
      {isOwner && song.status !== "live" && <span className="mt-1 inline-block text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{song.status}</span>}
    </button>
  );
}
