import { useState, useEffect, memo } from "react";
import { X } from "lucide-react";
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
  scorePill?: { total: number; replay_yes: number } | null;
  canvasNote?: string;
  onCanvasNoteChange?: (note: string) => void;
  onCanvasSubmit?: () => void;
  onOpenReactions?: () => void;
  externalPanelOpen?: boolean;
  onRegisterCommentSubmit?: (fn: () => void) => void;
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
  scorePill,
  canvasNote = "",
  onCanvasNoteChange,
  onCanvasSubmit,
  onOpenReactions,
  externalPanelOpen = false,
  onRegisterCommentSubmit,
}: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);

  const panelOpen = commentFocused;

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

  useEffect(() => {
    setIframeLoaded(false);
  }, [embedSrc]);

  // Reset comment input when external panel closes
  useEffect(() => {
    if (!externalPanelOpen) setCommentFocused(false);
  }, [externalPanelOpen]);

  useEffect(() => {
    if (!onRegisterCommentSubmit) return;
    onRegisterCommentSubmit(() => onCanvasSubmit?.());
  }, [onCanvasSubmit, onRegisterCommentSubmit]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  return (
    <div
      className="w-full overflow-hidden relative"
      style={{ height: platform === "soundcloud" ? 166 : 232, background: "#121212" }}
      onClick={handleClick}
    >
      {/* Full-bleed album art poster — sits behind iframe */}
      <div
        className="absolute inset-0 w-full h-full z-[1]"
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
        height={platform === "soundcloud" ? 166 : 232}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        className="absolute inset-0 border-0 block w-full transition-opacity duration-700 z-[5] rounded-xl"
        style={{ opacity: iframeLoaded ? 1 : 0, clipPath: "inset(0 round 12px)" }}
        title={`Play ${trackTitle}`}
        scrolling={platform === "soundcloud" ? "no" : undefined}
        onLoad={() => setIframeLoaded(true)}
      />

      <div
        className={`absolute bottom-0 left-0 right-0 flex items-stretch ${externalPanelOpen ? "z-[201]" : "z-30"}`}
      >
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-black/55 backdrop-blur-sm border-t border-white/10">
          <input
            value={canvasNote}
            onChange={(e) => onCanvasNoteChange?.(e.target.value)}
            onFocus={() => setCommentFocused(true)}
            onBlur={() => setCommentFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onCanvasSubmit?.();
              }
            }}
            placeholder="Drop your take..."
            className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/35 outline-none font-mono"
          />
          <button
            onClick={() => {
              if (externalPanelOpen) {
                setCommentFocused(false);
                onOpenReactions?.();
                return;
              }
              onOpenReactions?.();
              setCommentFocused(true);
            }}
            className="flex items-center justify-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors group shrink-0"
          >
            {externalPanelOpen ? (
              <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
            ) : (
              <span className="text-[15px] grayscale opacity-40 group-hover:opacity-70 transition-opacity">🔥</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
