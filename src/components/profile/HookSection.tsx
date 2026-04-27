import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { ProfileRecord, ProfileSong } from "@/components/profile/types";

interface Props {
  song: ProfileSong | null;
  lyricData: LyricDanceData | null;
  profile: ProfileRecord;
  isOwner: boolean;
  onCreateFirstSong: () => void;
}

export function HookSection({ song, lyricData, profile, isOwner, onCreateFirstSong }: Props) {
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

  const lp = song.lyric_projects;
  const lyricDanceUrl = lp?.artist_slug && lp?.url_slug ? `/${lp.artist_slug}/${lp.url_slug}/lyric-dance` : null;

  return (
    <section
      className="w-full rounded-2xl overflow-hidden border border-white/10"
      style={{ height: 320, background: "#0a0a0a" }}
    >
      <LyricDanceEmbed
        lyricDanceId={lp?.id ?? ""}
        postId={song.id}
        songTitle={lp?.title ?? song.caption ?? "Untitled"}
        artistName={profile.display_name ?? undefined}
        avatarUrl={profile.avatar_url}
        isVerified={profile.is_verified}
        userId={song.user_id}
        spotifyTrackId={lyricData?.spotify_track_id ?? null}
        spotifyArtistId={profile.spotify_artist_id}
        spotifyEmbedUrl={profile.spotify_embed_url}
        lyricDanceUrl={lyricDanceUrl}
        prefetchedData={lyricData}
        previewPaletteColor={lyricData?.auto_palettes?.[0]?.[0] ?? lyricData?.palette?.[0] ?? lp?.palette?.[0] ?? null}
        previewImageUrl={lyricData?.section_images?.[0] ?? lp?.album_art_url ?? null}
        live={true}
        autoPlay={false}
      />
    </section>
  );
}
