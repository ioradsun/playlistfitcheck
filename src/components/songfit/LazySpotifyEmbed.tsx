import { useState, useEffect, useRef, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { cn } from "@/lib/utils";
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
  reelsMode?: boolean;
  onPlay?: () => void; // ← NEW: calls activate() in the lifecycle
}

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  artistName,
  cardState, // ← CHANGED: was _cardState (unused). Now actively used.
  reelsMode = false,
  onPlay, // ← NEW
}: Props) {
  const { user } = useAuth();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [revealReady, setRevealReady] = useState(false);

  // ── NEW: Audio solo enforcement ──────────────────────────────────
  // When true, the iframe src is blanked → audio dies instantly.
  const [silenced, setSilenced] = useState(false);
  // After the user taps the gate overlay, we remove it so the next
  // tap reaches the actual Spotify iframe.
  const [gateOpen, setGateOpen] = useState(false);
  const prevCardStateRef = useRef<CardState>(cardState);

  // Listen for the global "only one card should play" broadcast.
  useEffect(() => {
    if (!postId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ activeCardId?: string }>;
      if (ce.detail?.activeCardId !== postId) {
        setSilenced(true);
        setGateOpen(false); // re-arm the tap gate
        setIframeLoaded(false);
        setRevealReady(false);
      } else {
        // This card is the new active card — un-silence it.
        setSilenced(false);
      }
    };
    window.addEventListener("crowdfit:audio-solo", handler);
    return () => window.removeEventListener("crowdfit:audio-solo", handler);
  }, [postId]);

  // When the card goes cold (exits render window), kill the iframe.
  // When it comes back to warm, un-silence so it can reload.
  useEffect(() => {
    if (cardState === "cold") {
      setSilenced(true);
      setGateOpen(false);
      setIframeLoaded(false);
      setRevealReady(false);
    } else if (prevCardStateRef.current === "cold" && cardState === "warm") {
      // Card re-entered the render window — allow iframe to load again.
      setSilenced(false);
    }
    prevCardStateRef.current = cardState;
  }, [cardState]);
  // ── END audio solo enforcement ───────────────────────────────────

  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";

  const embedSrc =
    platform === "soundcloud" && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  useEffect(() => {
    setIframeLoaded(false);
    setRevealReady(false);
  }, [embedSrc]);

  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = setTimeout(() => setRevealReady(true), 300);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  const handleClick = () => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  };

  // ── NEW: Tap gate handler ────────────────────────────────────────
  // First tap on the embed area: claim active status (silences others),
  // then open the gate so the next tap reaches Spotify's iframe.
  const handleGateTap = () => {
    if (onPlay) onPlay(); // → activate() → crowdfit:audio-solo fires
    setGateOpen(true);
  };
  // ── END tap gate ─────────────────────────────────────────────────

  // When silenced, render the poster only (no iframe = no audio).
  const renderIframe = !silenced;

  return (
    <div
      className={cn(
        "w-full overflow-hidden relative",
        reelsMode ? "h-full" : "",
      )}
      style={
        reelsMode
          ? { background: "#000" }
          : {
              height: platform === "soundcloud" ? 166 : 232,
              background: "#0a0a0a",
              borderRadius: 12,
              overflow: "hidden",
              WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' rx='12' ry='12'/%3E%3C/svg%3E")`,
              WebkitMaskSize: "100% 100%",
              maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' rx='12' ry='12'/%3E%3C/svg%3E")`,
              maskSize: "100% 100%",
            }
      }
      onClick={handleClick}
    >
      {reelsMode ? (
        <>
          {/* Blurred album art fills entire viewport */}
          {albumArtUrl && (
            <div className="absolute inset-0 z-[1]">
              <img
                src={albumArtUrl}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-60"
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          )}

          {/* Centered iframe with constrained width */}
          <div className="relative z-[10] flex items-center justify-center h-full px-6">
            <div
              className="w-full max-w-[400px]"
              style={{ borderRadius: 12, overflow: "hidden" }}
            >
              {/* Poster visible until iframe dark theme renders */}
              {albumArtUrl && (
                <div
                  className="absolute inset-0 z-[2] pointer-events-none transition-opacity duration-500"
                  style={{ opacity: revealReady ? 0 : 1 }}
                >
                  <img
                    src={albumArtUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <p className="text-sm font-bold text-white drop-shadow-md truncate">
                      {trackTitle}
                    </p>
                  </div>
                </div>
              )}
              {renderIframe && (
                <iframe
                  src={embedSrc}
                  width="100%"
                  height={platform === "soundcloud" ? 166 : 232}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  className="border-0 block w-full"
                  style={{ background: "#000" }}
                  title={`Play ${trackTitle}`}
                  scrolling={platform === "soundcloud" ? "no" : undefined}
                  onLoad={() => setIframeLoaded(true)}
                />
              )}

              {/* ── NEW: Tap gate overlay ── */}
              {!gateOpen && (
                <div
                  className="absolute inset-0 z-[20] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGateTap();
                  }}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Full-bleed album art poster */}
          <div
            className="absolute inset-0 w-full h-full z-[6] pointer-events-none transition-opacity duration-700"
            style={{ opacity: revealReady ? 0 : 1 }}
          >
            {albumArtUrl ? (
              <>
                <img
                  src={albumArtUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">
                      {trackTitle}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
            )}
          </div>

          {/* Iframe — only rendered when not silenced */}
          {renderIframe && (
            <iframe
              src={embedSrc}
              width="100%"
              height={platform === "soundcloud" ? 166 : 232}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="absolute inset-0 border-0 block w-full transition-opacity duration-700"
              style={{
                background: "#000",
                opacity: revealReady ? 1 : 0,
                zIndex: revealReady ? 8 : 5,
              }}
              title={`Play ${trackTitle}`}
              scrolling={platform === "soundcloud" ? "no" : undefined}
              onLoad={() => setIframeLoaded(true)}
            />
          )}

          {/* ── NEW: Tap gate overlay ── */}
          {!gateOpen && (
            <div
              className="absolute inset-0 z-[20] cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleGateTap();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
