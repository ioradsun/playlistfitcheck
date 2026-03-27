import { useState, useEffect, useRef, useCallback, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";
import type { CardState } from "./useCardLifecycle";
import {
  loadSpotifyIframeApi,
  type SpotifyEmbedController,
} from "@/lib/spotifyIframeApi";

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
  onPlay?: () => void;
}

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  artistName,
  cardState,
  reelsMode = false,
  onPlay,
}: Props) {
  const { user } = useAuth();
  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const isSpotify = platform === "spotify";

  // ── Spotify IFrame API controller ──────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const hasActivatedRef = useRef(false);
  const prevCardStateRef = useRef<CardState>(cardState);

  // Track whether this controller is currently playing so we only call
  // onPlay (→ activate) once per play session, not on every update tick.
  const isPlayingRef = useRef(false);

  // ── Poster / reveal state (shared by both Spotify API + SoundCloud fallback) ──
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [revealReady, setRevealReady] = useState(false);

  // ── SoundCloud fallback: src-blanking ──
  const [scSilenced, setScSilenced] = useState(false);

  const embedSrc =
    !isSpotify && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  const spotifyUri = `spotify:track:${trackId}`;
  const embedHeight = platform === "soundcloud" ? 166 : 232;

  // ── Reveal delay (same timing as before) ──
  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = setTimeout(() => setRevealReady(true), 300);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  // ── Reset reveal on track change ──
  useEffect(() => {
    setIframeLoaded(false);
    setRevealReady(false);
  }, [trackId, trackUrl]);

  // ── Engagement tracking ──
  const handleClick = useCallback(() => {
    if (user && postId) {
      logEngagementEvent(postId, user.id, "spotify_click");
    }
  }, [user, postId]);

  // ════════════════════════════════════════════════════════════════════
  // SPOTIFY IFRAME API PATH
  // ════════════════════════════════════════════════════════════════════

  // Create (or recreate) the Spotify controller when the container is
  // ready and the card is not cold.
  useEffect(() => {
    if (!isSpotify) return;
    if (!containerRef.current) return;
    // Don't create a controller for cold cards (outside render window)
    if (cardState === "cold") return;
    // Already have a live controller — nothing to do
    if (controllerRef.current) return;

    let destroyed = false;

    loadSpotifyIframeApi()
      .then((IFrameAPI) => {
        if (destroyed || !containerRef.current) return;
        // Clear any previous content (e.g. after cold→warm transition)
        containerRef.current.innerHTML = "";

        IFrameAPI.createController(
          containerRef.current,
          { uri: spotifyUri, width: "100%", height: embedHeight },
          (controller) => {
            if (destroyed) {
              controller.destroy();
              return;
            }
            controllerRef.current = controller;
            setIframeLoaded(true);

            // ── Detect playback start → call activate() ──
            controller.addListener(
              "playback_update",
              (e: { data: { isPaused: boolean } }) => {
                if (destroyed) return;
                const nowPlaying = !e.data.isPaused;
                const wasPlaying = isPlayingRef.current;
                isPlayingRef.current = nowPlaying;

                // On play start (transition from paused→playing), claim
                // active status so every other media source gets silenced.
                if (nowPlaying && !wasPlaying) {
                  if (onPlay) onPlay();
                  hasActivatedRef.current = true;
                }
              },
            );
          },
        );
      })
      .catch((err) => {
        // API failed to load — fall back to raw iframe.
        // This happens if the script is blocked (ad-blocker, CSP, etc).
        console.warn("[LazySpotifyEmbed] IFrame API unavailable:", err);
        if (!destroyed && containerRef.current) {
          const iframe = document.createElement("iframe");
          iframe.src = embedSrc;
          iframe.width = "100%";
          iframe.height = String(embedHeight);
          iframe.allow =
            "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
          iframe.style.border = "0";
          iframe.style.display = "block";
          iframe.style.background = "#000";
          iframe.title = `Play ${trackTitle}`;
          iframe.onload = () => {
            if (!destroyed) setIframeLoaded(true);
          };
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(iframe);
        }
      });

    return () => {
      destroyed = true;
      if (controllerRef.current) {
        try {
          controllerRef.current.destroy();
        } catch {
          /* ignore */
        }
        controllerRef.current = null;
      }
      isPlayingRef.current = false;
      hasActivatedRef.current = false;
    };
  }, [isSpotify, spotifyUri, embedHeight, cardState]);

  // ── Cold → warm: recreate controller. Cold: destroy it. ──
  useEffect(() => {
    if (!isSpotify) return;
    const prev = prevCardStateRef.current;
    prevCardStateRef.current = cardState;

    if (cardState === "cold" && prev !== "cold") {
      // Card left the render window — kill the controller
      if (controllerRef.current) {
        try {
          controllerRef.current.destroy();
        } catch {
          /* ignore */
        }
        controllerRef.current = null;
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
      isPlayingRef.current = false;
      hasActivatedRef.current = false;
      setIframeLoaded(false);
      setRevealReady(false);
    }
    // cold→warm recreation: the main effect above will re-run on next render
    // since the container ref is now visible again. Force it by clearing and
    // re-triggering via a state toggle would be over-engineering. The
    // audio-solo listener already covers silence. If the card re-enters the
    // window, useFeedWindow sets it to warm → MeasuredFeedCard renders →
    // containerRef populates → the main effect's cleanup+re-run handles it.
  }, [isSpotify, cardState]);

  // ── Audio solo: pause if this card is not the active one ──
  useEffect(() => {
    if (!postId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ activeCardId?: string }>;
      if (ce.detail?.activeCardId !== postId) {
        // Another card claimed active — pause this controller
        if (controllerRef.current && isPlayingRef.current) {
          controllerRef.current.pause();
          isPlayingRef.current = false;
        }
        // SoundCloud fallback
        if (!isSpotify) {
          setScSilenced(true);
          setIframeLoaded(false);
          setRevealReady(false);
        }
      }
    };
    window.addEventListener("crowdfit:audio-solo", handler);
    return () => window.removeEventListener("crowdfit:audio-solo", handler);
  }, [postId, isSpotify]);

  // ════════════════════════════════════════════════════════════════════
  // SOUNDCLOUD FALLBACK: restore iframe when card re-activates
  // ════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (isSpotify || !scSilenced) return;
    if (cardState === "active") {
      setScSilenced(false);
    }
  }, [isSpotify, scSilenced, cardState]);

  // Cold eviction for SoundCloud
  useEffect(() => {
    if (isSpotify) return;
    if (cardState === "cold") {
      setScSilenced(true);
      setIframeLoaded(false);
      setRevealReady(false);
    } else if (prevCardStateRef.current === "cold" && cardState === "warm") {
      setScSilenced(false);
    }
    prevCardStateRef.current = cardState;
  }, [isSpotify, cardState]);

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════

  const posterElement = albumArtUrl ? (
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
  );

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
              height: embedHeight,
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

          {/* Centered embed with constrained width */}
          <div className="relative z-[10] flex items-center justify-center h-full px-6">
            <div
              className="w-full max-w-[400px] relative"
              style={{ borderRadius: 12, overflow: "hidden" }}
            >
              {/* Poster — fades when embed is ready */}
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

              {isSpotify ? (
                /* Spotify IFrame API: controller renders iframe into this div */
                <div
                  ref={containerRef}
                  style={{ width: "100%", height: embedHeight, background: "#000" }}
                />
              ) : (
                /* SoundCloud fallback: raw iframe with src-blanking */
                !scSilenced && (
                  <iframe
                    src={embedSrc}
                    width="100%"
                    height={embedHeight}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    className="border-0 block w-full"
                    style={{ background: "#000" }}
                    title={`Play ${trackTitle}`}
                    scrolling="no"
                    onLoad={() => setIframeLoaded(true)}
                  />
                )
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Poster — fades when embed is ready */}
          <div
            className="absolute inset-0 w-full h-full z-[6] pointer-events-none transition-opacity duration-700"
            style={{ opacity: revealReady ? 0 : 1 }}
          >
            {posterElement}
          </div>

          {isSpotify ? (
            /* Spotify IFrame API container */
            <div
              ref={containerRef}
              className="absolute inset-0 w-full transition-opacity duration-700"
              style={{
                background: "#000",
                opacity: revealReady ? 1 : 0,
                zIndex: revealReady ? 8 : 5,
              }}
            />
          ) : (
            /* SoundCloud fallback */
            !scSilenced && (
              <iframe
                src={embedSrc}
                width="100%"
                height={embedHeight}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="absolute inset-0 border-0 block w-full transition-opacity duration-700"
                style={{
                  background: "#000",
                  opacity: revealReady ? 1 : 0,
                  zIndex: revealReady ? 8 : 5,
                }}
                title={`Play ${trackTitle}`}
                scrolling="no"
                onLoad={() => setIframeLoaded(true)}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
