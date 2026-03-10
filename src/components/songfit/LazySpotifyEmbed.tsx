import { useState, useEffect, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";
import type { CardState } from "./useCardLifecycle";

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
  albumArtUrl?: string | null;
  artistName?: string;
  genre?: string | null;
  cardState: CardState;
  onVoteYes?: () => void;
  onVoteNo?: () => void;
  votedSide?: "a" | "b" | null;
  canvasStep?: "vote" | "cta" | "done";
  canvasNote?: string;
  onCanvasNoteChange?: (note: string) => void;
  onCanvasSubmit?: () => void;
  onOpenReactions?: () => void;
}

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  artistName,
  cardState: _cardState,
  onVoteYes,
  onVoteNo,
  votedSide,
  canvasStep = "vote",
  canvasNote = "",
  onCanvasNoteChange,
  onCanvasSubmit,
  onOpenReactions,
}: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

  useEffect(() => {
    setIframeLoaded(false);
  }, [embedSrc]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  return (
    <div
      className="w-full overflow-hidden relative"
      style={{ height: platform === "soundcloud" ? 166 : 232 }}
      onClick={handleClick}
    >
      {/* Full-bleed album art poster — sits behind iframe */}
      <div
        className="absolute inset-0 w-full h-full transition-opacity duration-500 z-[1]"
        style={{
          opacity: iframeLoaded ? 0 : 1,
          pointerEvents: iframeLoaded ? "none" : "auto",
        }}
      >
        {albumArtUrl ? (
          <>
            <img
              src={albumArtUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">
                  {trackTitle}
                </span>
                {artistName && (
                  <span className="text-xs text-white/70 drop-shadow-sm line-clamp-1">
                    {artistName}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
        )}
      </div>

      {/* Iframe fades in on top when loaded */}
      <iframe
        src={embedSrc}
        width="100%"
        height={platform === "soundcloud" ? 166 : 260}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        className="absolute inset-0 border-0 block w-full transition-opacity duration-700 z-[5]"
        style={{ opacity: iframeLoaded ? 1 : 0 }}
        title={`Play ${trackTitle}`}
        scrolling={platform === "soundcloud" ? "no" : undefined}
        onLoad={() => setIframeLoaded(true)}
      />

      {/* Mask overlays to hide Spotify's light strips */}
      <div
        className="absolute top-0 left-0 right-0 bg-black pointer-events-none z-20"
        style={{ height: 10 }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-black pointer-events-none z-20"
        style={{ height: 10 }}
      />
      {iframeLoaded && (
        <div className="absolute top-3 left-3 z-30 pointer-events-none">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
            Now Streaming
          </span>
        </div>
      )}
      {/* Vote bar — always visible in card mode when handlers provided */}
      {canvasStep !== "done" && (onVoteYes || onVoteNo || canvasStep === "cta") && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 flex items-stretch"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {canvasStep === "vote" && (
            <>
              <button
                onClick={onVoteYes}
                className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
              >
                <span
                  className={`text-[11px] font-mono tracking-[0.15em] uppercase transition-colors ${
                    votedSide === "a"
                      ? "text-white/90"
                      : "text-white/30 group-hover:text-white/60"
                  }`}
                >
                  {votedSide === "a" ? "✓ Run it back" : "Run it back"}
                </span>
              </button>
              <div
                style={{ width: "0.5px" }}
                className="bg-white/10 self-stretch my-2"
              />
              <button
                onClick={onVoteNo}
                className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
              >
                <span
                  className={`text-[11px] font-mono tracking-[0.15em] uppercase transition-colors ${
                    votedSide === "b"
                      ? "text-white/90"
                      : "text-white/30 group-hover:text-white/60"
                  }`}
                >
                  {votedSide === "b" ? "✓ Skip" : "Skip"}
                </span>
              </button>
            </>
          )}

          {canvasStep === "cta" && (
            <>
              <input
                type="text"
                value={canvasNote}
                onChange={(e) => onCanvasNoteChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCanvasSubmit?.();
                  }
                }}
                placeholder="Signal locked · drop your take"
                autoFocus
                className="flex-1 bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/30 outline-none px-4 py-3 tracking-wide"
              />
              <div
                style={{ width: "0.5px" }}
                className="bg-white/10 self-stretch my-2"
              />
              <button
                onClick={onOpenReactions}
                className="flex items-center justify-center px-5 hover:bg-white/[0.04] transition-colors group"
              >
                <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/30 group-hover:text-white/60 transition-colors">
                  React
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
