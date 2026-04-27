import { Flame } from "lucide-react";
import { cdnImage } from "@/lib/cdnImage";
import type { ProfileSong } from "@/components/profile/types";

interface Props {
  song: ProfileSong | null;
  onOpenSong: (song: ProfileSong) => void;
}

export function HookSection({ song, onOpenSong }: Props) {
  if (!song) return null;

  return (
    <button
      type="button"
      onClick={() => onOpenSong(song)}
      className="w-full rounded-2xl border border-white/10 p-4 text-left hover:border-white/20 transition-colors"
    >
      <p className="text-xs font-mono tracking-[0.18em] text-orange-300 mb-2">FEATURED HOOK</p>
      <div className="flex items-center gap-3">
        {song.lyric_projects?.album_art_url && (
          <img src={cdnImage(song.lyric_projects.album_art_url, "live")} alt="cover" className="h-14 w-14 rounded-xl object-cover" />
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">{song.lyric_projects?.title ?? song.caption ?? "Untitled"}</p>
          <p className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-1">
            <Flame size={12} className="text-orange-300" />
            {song.fires_count} fires
          </p>
        </div>
      </div>
    </button>
  );
}
