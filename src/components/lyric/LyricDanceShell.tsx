import { memo, useEffect, useState } from "react";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import { CARD_MODES } from "@/components/lyric/modes/registry";
import { getPreloadedImage } from "@/lib/imagePreloadCache";
import { cn } from "@/lib/utils";
import type { LyricDanceEmbedProps } from "@/components/lyric/LyricDanceEmbed";
import type { CardMode } from "@/components/lyric/modes/types";
import { ShellLyricPreview } from "@/components/fmly/feed/ShellLyricPreview";

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const SHELL_DISABLED_MODES = new Set<CardMode>(CARD_MODES.map((mode) => mode.id));

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

  const [posterLoaded, setPosterLoaded] = useState<boolean>(() => {
    if (!posterSrc || posterSrc === TRANSPARENT_PIXEL) return false;
    return !!getPreloadedImage(posterSrc);
  });

  useEffect(() => {
    if (!posterSrc || posterSrc === TRANSPARENT_PIXEL) {
      setPosterLoaded(false);
      return;
    }
    setPosterLoaded(!!getPreloadedImage(posterSrc));
  }, [posterSrc]);

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
        style={{ background: "#0a0a0a" }}
        onClick={() => onRequestPrimary?.()}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: previewPaletteColor
              ? `radial-gradient(ellipse at 50% 40%, ${previewPaletteColor}33 0%, #0a0a0a 70%)`
              : "linear-gradient(135deg, #0a0a0a 0%, #141418 100%)",
          }}
        />
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 animate-skeleton-shimmer transition-opacity duration-300",
            posterLoaded ? "opacity-0" : "opacity-100",
          )}
          style={{
            background:
              "linear-gradient(110deg, rgba(255,255,255,0.015) 20%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.015) 60%)",
            backgroundSize: "200% 100%",
          }}
        />
        <img
          src={posterSrc}
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          loading="eager"
          onLoad={() => {
            if (posterSrc !== TRANSPARENT_PIXEL) setPosterLoaded(true);
          }}
          className="absolute inset-0 w-full h-full pointer-events-none select-none transition-opacity duration-200"
          style={{
            objectFit: "cover",
            opacity: posterLoaded ? 1 : 0,
          }}
        />
        <ShellLyricPreview firstLine={prefetchedData?.lines?.[0]?.text} />
      </div>

      <div className="w-full flex-shrink-0" style={{ height: 44, background: "#0a0a0a" }} />
    </div>
  );
});
