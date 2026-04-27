import { memo, useEffect, useState } from "react";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import { CARD_MODES } from "@/components/lyric/modes/registry";
import { getPreloadedImage } from "@/lib/imagePreloadCache";
import { cdnImage } from "@/lib/cdnImage";
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
  spotifyEmbedUrl,
  avatarUrl,
  isVerified,
  userId,
  onProfileClick,
  previewPaletteColor,
  previewImageUrl,
  onRequestPrimary,
}: LyricDanceEmbedProps) {
  const posterUrl = previewImageUrl
    ?? prefetchedData?.section_images?.[0]
    ?? prefetchedData?.album_art_url
    ?? null;
  const posterSrc = posterUrl ? cdnImage(posterUrl, "live") : TRANSPARENT_PIXEL;

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
        spotifyEmbedUrl={spotifyEmbedUrl}
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
            transform: "scale(1.296)",
            transformOrigin: "center center",
            filter: "brightness(0.58) saturate(0.75) contrast(1.05)",
            opacity: posterLoaded ? 1 : 0,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: `linear-gradient(to bottom,
              rgba(0,0,0,0.075) 0%,
              rgba(0,0,0,0.175) 25%,
              rgba(0,0,0,0.25) 50%,
              rgba(0,0,0,0.175) 75%,
              rgba(0,0,0,0.075) 100%)`,
          }}
        />
        <ShellLyricPreview firstLine={prefetchedData?.lines?.[0]?.text} />
      </div>

      <div
        className="w-full flex-shrink-0"
        style={{
          height: 44,
          background: "#0a0a0a",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      />
    </div>
  );
});
