import { Flame, Play } from "lucide-react";
import { cdnImage } from "@/lib/cdnImage";
import type { ProfileSong } from "@/components/profile/types";

interface Props {
  song: ProfileSong | null;
  isOwner: boolean;
  onOpenSong: (song: ProfileSong) => void;
  onCreateFirstSong: () => void;
}

export function HookSection({ song, isOwner, onOpenSong, onCreateFirstSong }: Props) {
  if (!song) {
    if (!isOwner) return null;

    return (
      <button
        type="button"
        onClick={onCreateFirstSong}
        className="w-full rounded-2xl border border-dashed border-white/15 p-5 text-left hover:border-primary/40 hover:bg-primary/[0.03] transition-colors"
      >
        <p className="text-sm font-medium">Drop your first song</p>
        <p className="text-xs text-muted-foreground mt-1">One track turns this page from an empty stage into a stage with you on it.</p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenSong(song)}
      className="w-full rounded-2xl border border-white/10 overflow-hidden text-left hover:border-white/20 transition-colors"
    >
      <div className="relative aspect-[16/9]">
        {song.lyric_projects?.album_art_url ? (
          <img
            src={cdnImage(song.lyric_projects.album_art_url, "live")}
            alt={song.lyric_projects?.title ?? "song cover"}
            className="absolute inset-0 h-full w-full object-cover brightness-50"
          />
        ) : (
          <div className="absolute inset-0 bg-[#101218]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0e]" />

        <div className="absolute left-3 top-3 rounded-full border border-orange-300/50 bg-black/35 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-orange-300">
          Featured
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-black">
            <Play size={20} fill="currentColor" className="ml-0.5" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="truncate text-base font-semibold text-white">{song.lyric_projects?.title ?? song.caption ?? "Untitled"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-mono text-white/85">
            <Flame size={12} className="text-orange-300" />
            {song.fires_count ?? 0} fires
          </p>
        </div>
      </div>
    </button>
  );
}
