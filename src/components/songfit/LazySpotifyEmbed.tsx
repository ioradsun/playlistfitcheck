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

  const panelOpen = externalPanelOpen || commentFocused;

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

  useEffect(() => {
    setIframeLoaded(false);
  }, [embedSrc]);

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
      <div className="absolute inset-0 w-full h-full z-[1]">
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

      {/* NOW STREAMING badge — top left */}
      <div className="absolute top-3 left-3 z-30 pointer-events-none">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
          Now Streaming
        </span>
      </div>

      {/* Score pill — top right */}
      {scorePill && scorePill.total > 0 && (() => {
        const { total, replay_yes } = scorePill;
        const pct = Math.round((replay_yes / total) * 100);
        return (
          <div
            className="absolute top-2 right-2 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full pointer-events-none"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/70">
              {pct}% REPLAY
            </span>
          </div>
        );
      })()}

      {/* Vote bar — only shown when vote handlers provided */}
      {(onVoteYes || onVoteNo) && (
        <div
          className={`absolute bottom-0 left-0 right-0 flex items-stretch ${panelOpen ? "z-[201]" : "z-30"}`}
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {votedSide == null ? (

            /* ── State 1: Pre-vote — Run it back / Skip ── */
            <>
              <button
                onClick={onVoteYes}
                className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
              >
                <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
                  Run it back
                </span>
              </button>
              <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
              <button
                onClick={onVoteNo}
                className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
              >
                <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
                  Skip
                </span>
              </button>
            </>

          ) : panelOpen ? (

            /* ── State 2: Panel open — input + X ── */
            <>
              <input
                type="text"
                value={canvasNote}
                onChange={(e) => onCanvasNoteChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCanvasSubmit?.();
                    setCommentFocused(false);
                  }
                  if (e.key === "Escape") setCommentFocused(false);
                }}
                onBlur={() => {
                  if (!canvasNote && !externalPanelOpen) setCommentFocused(false);
                }}
                placeholder="drop your take..."
                autoFocus={commentFocused}
                className="flex-1 bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/30 outline-none px-3 py-3 tracking-wide min-w-0"
              />
              <button
                onClick={() => {
                  setCommentFocused(false);
                  if (externalPanelOpen) onOpenReactions?.();
                }}
                className="flex items-center justify-center px-4 py-3 hover:bg-white/[0.04] transition-colors group shrink-0"
              >
                <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
              </button>
            </>

          ) : (

            /* ── State 3: Post-vote default — social proof + 🔥 ── */
            <>
              <div className="flex-1 flex items-center px-3 py-2.5 overflow-hidden min-w-0">
                {scorePill && scorePill.total > 0 ? (
                  <span className="text-[10px] font-mono text-white/40 truncate">
                    {votedSide === "a"
                      ? `You + ${Math.max(0, scorePill.replay_yes - 1)} FMLY would Replay this`
                      : `${scorePill.replay_yes} / ${scorePill.total} FMLY would Replay this`
                    }
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-white/20 truncate">
                    calibrating...
                  </span>
                )}
              </div>
              <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
              <button
                onClick={() => {
                  onOpenReactions?.();
                  setCommentFocused(true);
                }}
                className="flex items-center justify-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors group shrink-0"
              >
                <span className="text-[15px] grayscale opacity-40 group-hover:opacity-70 transition-opacity">🔥</span>
              </button>
            </>

          )}
        </div>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
