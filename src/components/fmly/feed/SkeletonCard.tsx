import { memo } from "react";
import { LyricDanceShell } from "@/components/lyric/LyricDanceShell";
import type { LyricDanceEmbedProps } from "@/components/lyric/LyricDanceEmbed";
import { cn } from "@/lib/utils";
import { CARD_CONTENT_HEIGHT_PX } from "./constants";

const EMPTY_PROPS: LyricDanceEmbedProps = {
  lyricDanceId: "",
  songTitle: "",
  artistName: undefined,
  prefetchedData: null,
  live: false,
  spotifyTrackId: null,
  avatarUrl: null,
  previewImageUrl: null,
  previewPaletteColor: null,
};

export const SkeletonCard = memo(function SkeletonCard({
  reelsMode = false,
}: { reelsMode?: boolean }) {
  return (
    <div
      className={cn("shrink-0", reelsMode ? "h-[100dvh] snap-start" : "px-2 pb-3")}
      aria-hidden
    >
      <div
        className={cn(
          "relative overflow-hidden",
          reelsMode ? "h-full w-full" : "rounded-2xl",
        )}
        style={{
          background: "#0a0a0a",
          border: reelsMode ? "none" : "1px solid rgba(255,255,255,0.04)",
          paddingBottom: reelsMode ? "env(safe-area-inset-bottom, 0px)" : undefined,
          transform: "translateZ(0)",
          contain: "layout paint",
        }}
      >
        <div
          className="relative"
          style={{
            height: reelsMode ? "100%" : CARD_CONTENT_HEIGHT_PX,
            width: "100%",
          }}
        >
          <LyricDanceShell {...EMPTY_PROPS} />
        </div>
      </div>
    </div>
  );
});
