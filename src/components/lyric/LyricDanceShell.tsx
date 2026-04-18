import { memo } from "react";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import { CARD_MODES } from "@/components/lyric/modes/registry";
import { LyricTextLayer } from "@/components/lyric/LyricTextLayer";
import { getPreloadedImage } from "@/lib/imagePreloadCache";
import type { LyricDanceEmbedProps } from "@/components/lyric/LyricDanceEmbed";
import type { CardMode } from "@/components/lyric/modes/types";

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const SHELL_DISABLED_MODES = new Set<CardMode>(CARD_MODES.map((mode) => mode.id));

const SHELL_TYPOGRAPHY = {
  fontFamily: '"Montserrat", sans-serif',
  fontWeight: 700,
  textTransform: "none" as const,
  letterSpacing: 0.2,
  heroWeight: 800,
};

export const LyricDanceShell = memo(function LyricDanceShell({
  songTitle,
  artistName,
  prefetchedData,
  lyricDanceUrl = null,
  spotifyArtistId,
  avatarUrl,
  isVerified,
  userId,
  onProfileClick,
  previewPaletteColor,
  previewImageUrl,
  onRequestPrimary,
}: LyricDanceEmbedProps) {
  const posterAlbumArt = prefetchedData?.album_art_url ?? null;
  const posterSectionImage = previewImageUrl ?? null;
  const posterSrc = posterSectionImage && getPreloadedImage(posterSectionImage)
    ? posterSectionImage
    : (posterAlbumArt || posterSectionImage || TRANSPARENT_PIXEL);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyArtistId={spotifyArtistId}
        lyricDanceUrl={lyricDanceUrl}
        menuSlot={undefined}
        isVerified={isVerified}
        userId={userId}
        onProfileClick={onProfileClick}
        cardMode="listen"
        onModeChange={() => {}}
        disabledModes={SHELL_DISABLED_MODES}
      />

      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{
          background: previewPaletteColor
            ? `radial-gradient(ellipse at 50% 40%, ${previewPaletteColor}33 0%, #0a0a0a 70%)`
            : "#0a0a0a",
        }}
        onClick={() => onRequestPrimary?.()}
      >
        <img
          src={posterSrc}
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          style={{ objectFit: "cover", zIndex: 1, opacity: 1 }}
        />

        {prefetchedData && (
          <LyricTextLayer
            lines={prefetchedData.lines ?? []}
            words={prefetchedData.words}
            phrases={prefetchedData.cinematic_direction?.phrases}
            typography={SHELL_TYPOGRAPHY}
            currentTimeSec={0}
            ownsText
          />
        )}
      </div>

      <div className="w-full flex-shrink-0" style={{ height: 44, background: "#0a0a0a" }} />
    </div>
  );
});
