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

let _activeController: SpotifyEmbedController | null = null;

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
  cardState,
  reelsMode = false,
  onPlay,
}: Props) {
  const { user } = useAuth();
  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const isSpotify = platform === "spotify";

  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  // Once true, we never try to load again — Spotify iframes are cheap to keep alive
  const hasLoadedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const scPrevCardStateRef = useRef<CardState>(cardState);

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const [scSilenced, setScSilenced] = useState(false);

  const embedSrc =
    !isSpotify && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  const spotifyUri = `spotify:track:${trackId}`;
  const embedHeight = platform === "soundcloud" ? 166 : 232;

  // Reveal delay
  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = setTimeout(() => setRevealReady(true), 300);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  // Reset on track change
  useEffect(() => {
    setIframeLoaded(false);
    setRevealReady(false);
    hasLoadedRef.current = false;
    if (controllerRef.current) {
      try { controllerRef.current.destroy(); } catch { /* ignore */ }
      controllerRef.current = null;
    }
  }, [trackId, trackUrl]);

  // Engagement tracking
  const handleClick = useCallback(() => {
    if (user && postId) logEngagementEvent(postId, user.id, "spotify_click");
  }, [user, postId]);

  // ── Spotify: load once on first warm, never destroy ────────────────
  // iframes are cheap. Destroying and recreating on every cold/warm cycle
  // causes the "never wakes up" bug under fast scroll. Load once, keep alive.
  useEffect(() => {
    if (!isSpotify) return;
    // Only load when card first becomes non-cold
    if (cardState === "cold") return;
    // Already loaded — nothing to do
    if (hasLoadedRef.current) return;
    if (!containerRef.current) return;

    hasLoadedRef.current = true;

    loadSpotifyIframeApi()
      .then((IFrameAPI) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = "";

        IFrameAPI.createController(
          containerRef.current,
          { uri: spotifyUri, width: "100%", height: embedHeight },
          (controller) => {
            if (!containerRef.current) return;
            controllerRef.current = controller;
            setIframeLoaded(true);

            controller.addListener(
              "playback_update",
              (e: { data: { isPaused: boolean } }) => {
                const nowPlaying = !e.data.isPaused;
                const wasPlaying = isPlayingRef.current;
                isPlayingRef.current = nowPlaying;

                if (nowPlaying && !wasPlaying) {
                  if (_activeController && _activeController !== controllerRef.current) {
                    _activeController.pause();
                  }
                  _activeController = controllerRef.current;
                  if (onPlay) onPlay();
                }
              },
            );
          },
        );
      })
      .catch((err) => {
        console.warn("[LazySpotifyEmbed] IFrame API unavailable:", err);
        hasLoadedRef.current = false; // allow retry on next warm
        if (containerRef.current) {
          const iframe = document.createElement("iframe");
          iframe.src = embedSrc;
          iframe.width = "100%";
          iframe.height = String(embedHeight);
          iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
          iframe.style.border = "0";
          iframe.style.display = "block";
          iframe.style.background = "#000";
          iframe.title = `Play ${trackTitle}`;
          iframe.onload = () => setIframeLoaded(true);
          containerRef.current.innerHTML = "";
          containerRef.current.appendChild(iframe);
          hasLoadedRef.current = true;
        }
      });
    // No cleanup that destroys the controller — intentional.
    // The controller lives for the lifetime of the component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState, isSpotify]);

  // ── Spotify: audio solo — pause when another card goes active ──────
  useEffect(() => {
    if (!isSpotify || !postId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ activeCardId?: string }>;
      if (ce.detail?.activeCardId !== postId && controllerRef.current) {
        try { controllerRef.current.pause(); } catch { /* ignore */ }
        isPlayingRef.current = false;
      }
    };
    window.addEventListener("crowdfit:audio-solo", handler);
    return () => window.removeEventListener("crowdfit:audio-solo", handler);
  }, [isSpotify, postId]);

  // ── SoundCloud: audio solo pause ───────────────────────────────────
  useEffect(() => {
    if (!postId || isSpotify) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ activeCardId?: string }>;
      if (ce.detail?.activeCardId !== postId) {
        setScSilenced(true);
        setIframeLoaded(false);
        setRevealReady(false);
      }
    };
    window.addEventListener("crowdfit:audio-solo", handler);
    return () => window.removeEventListener("crowdfit:audio-solo", handler);
  }, [postId, isSpotify]);

  // ── SoundCloud: restore on re-activate ────────────────────────────
  useEffect(() => {
    if (isSpotify || !scSilenced) return;
    if (cardState === "active") setScSilenced(false);
  }, [isSpotify, scSilenced, cardState]);

  // ── SoundCloud: cold eviction (raw iframe, cheap to recreate) ──────
  useEffect(() => {
    if (isSpotify) return;
    if (cardState === "cold") {
      setScSilenced(true);
      setIframeLoaded(false);
      setRevealReady(false);
    } else if (scPrevCardStateRef.current === "cold" && cardState === "warm") {
      setScSilenced(false);
    }
    scPrevCardStateRef.current = cardState;
  }, [isSpotify, cardState]);

  // ── Render ─────────────────────────────────────────────────────────
  // CSS background-image: appears instantly when cached, loads gracefully when not.
  // No onLoad state = no permanent opacity:0 when browser has image cached.
  const posterElement = albumArtUrl ? (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${albumArtUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">{trackTitle}</span>
        </div>
      </div>
    </>
  ) : (
    <div className="absolute inset-0 w-full h-full animate-pulse bg-muted" />
  );

  return (
    <div
      className={cn("w-full overflow-hidden relative", reelsMode ? "h-full" : "")}
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
          {albumArtUrl && (
            <div className="absolute inset-0 z-[1]">
              <img src={albumArtUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-60" />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          )}
          <div className="relative z-[10] flex items-center justify-center h-full px-6">
            <div className="w-full max-w-[400px] relative" style={{ borderRadius: 12, overflow: "hidden" }}>
              {albumArtUrl && (
                <div
                  className="absolute inset-0 z-[2] pointer-events-none transition-opacity duration-500"
                  style={{ opacity: revealReady ? 0 : 1 }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(${albumArtUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <p className="text-sm font-bold text-white drop-shadow-md truncate">{trackTitle}</p>
                  </div>
                </div>
              )}
              {isSpotify ? (
                <div ref={containerRef} style={{ width: "100%", height: embedHeight, background: "#000" }} />
              ) : (
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
          <div
            className="absolute inset-0 w-full h-full z-[5] pointer-events-none"
          >
            {posterElement}
          </div>
          {isSpotify ? (
            <div
              ref={containerRef}
              className="absolute inset-0 w-full"
              style={{ zIndex: 6 }}
            />
          ) : (
            !scSilenced && (
              <iframe
                src={embedSrc}
                width="100%"
                height={embedHeight}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="absolute inset-0 border-0 block w-full"
                style={{ zIndex: 6 }}
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
