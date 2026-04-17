import { useState, useEffect, useRef, useCallback, memo } from "react";
import { detectPlatform, toSoundCloudEmbedUrl } from "@/lib/platformUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { logEngagementEvent } from "@/lib/engagementTracking";
import {
  loadSpotifyIframeApi,
  type SpotifyEmbedController,
} from "@/lib/spotifyIframeApi";
import { liveCard } from "@/lib/liveCard";

let _activeController: SpotifyEmbedController | null = null;

interface Props {
  trackId: string;
  trackTitle: string;
  trackUrl?: string;
  postId?: string;
  albumArtUrl?: string | null;
  artistName?: string;
  genre?: string | null;
  reelsMode?: boolean;
  onPlay?: () => void;
}

function LazySpotifyEmbedInner({
  trackId,
  trackTitle,
  trackUrl,
  postId,
  albumArtUrl,
  reelsMode = false,
  onPlay,
}: Props) {
  const { user } = useAuth();
  const platform = trackUrl ? detectPlatform(trackUrl) : "spotify";
  const isSpotify = platform === "spotify";

  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const isPlayingRef = useRef(false);

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [revealReady, setRevealReady] = useState(false);

  const embedSrc =
    !isSpotify && trackUrl
      ? toSoundCloudEmbedUrl(trackUrl)
      : `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;

  const spotifyUri = `spotify:track:${trackId}`;
  const embedHeight = platform === "soundcloud" ? 166 : 232;

  // Poster → player reveal
  useEffect(() => {
    if (!iframeLoaded) return;
    const timer = setTimeout(() => setRevealReady(true), 800);
    return () => clearTimeout(timer);
  }, [iframeLoaded]);

  // ── Spotify: load on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!isSpotify || !containerRef.current) return;

    let cancelled = false;
    let controllerTimeout: ReturnType<typeof setTimeout> | null = null;

    const fallbackToRawIframe = () => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
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
        if (!cancelled) setIframeLoaded(true);
      };
      containerRef.current.appendChild(iframe);
    };

    loadSpotifyIframeApi()
      .then((IFrameAPI) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";

        controllerTimeout = setTimeout(() => {
          controllerTimeout = null;
          console.warn("[SpotifyEmbed] createController timed out — raw iframe fallback");
          fallbackToRawIframe();
        }, 8_000);

        IFrameAPI.createController(
          containerRef.current,
          { uri: spotifyUri, width: "100%", height: embedHeight },
          (controller) => {
            if (controllerTimeout) {
              clearTimeout(controllerTimeout);
              controllerTimeout = null;
            }
            if (cancelled || !containerRef.current) return;

            controllerRef.current = controller;
            setIframeLoaded(true);

            controller.addListener(
              "playback_update",
              (e: { data: { isPaused: boolean } }) => {
                const nowPlaying = !e.data.isPaused;
                const wasPlaying = isPlayingRef.current;
                isPlayingRef.current = nowPlaying;

                if (nowPlaying && !wasPlaying) {
                  // Pause previous Spotify controller
                  if (_activeController && _activeController !== controller) {
                    try {
                      _activeController.pause();
                    } catch {
                      /* ignore */
                    }
                  }
                  _activeController = controller;
                  // Notify card-level playback flow.
                  onPlay?.();
                }
              },
            );
          },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[SpotifyEmbed] API unavailable:", err);
        fallbackToRawIframe();
      });

    return () => {
      cancelled = true;
      if (controllerTimeout) clearTimeout(controllerTimeout);
      // Don't destroy controller — iframe persists until unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, trackUrl]);

  // ── SoundCloud: simple iframe, loads on mount ─────────────────────────
  // (Rendered inline in JSX — no effect needed. Unmount = gone.)

  // ── Pause when this card is no longer primary ─────────────────────────
  useEffect(() => {
    if (!postId || !isSpotify) return;
    return liveCard.subscribe(() => {
      const primaryId = liveCard.getSnapshot();
      if (primaryId !== postId && isPlayingRef.current) {
        _activeController?.pause();
        isPlayingRef.current = false;
      }
    });
  }, [postId, isSpotify]);

  // Engagement tracking
  const handleClick = useCallback(() => {
    if (user && postId) logEngagementEvent(postId, user.id, "spotify_click");
  }, [user, postId]);

  // ── Poster (shows while iframe loads) ─────────────────────────────────
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
                <div
                  ref={containerRef}
                  className="transition-opacity duration-500"
                  style={{ width: "100%", height: embedHeight, background: "#000", opacity: revealReady ? 1 : 0 }}
                />
              ) : (
                <iframe
                  src={embedSrc}
                  width="100%"
                  height={embedHeight}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  className="border-0 block w-full transition-opacity duration-500"
                  style={{ background: "#000", opacity: revealReady ? 1 : 0 }}
                  title={`Play ${trackTitle}`}
                  scrolling="no"
                  onLoad={() => setIframeLoaded(true)}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            className="absolute inset-0 w-full h-full z-[5] pointer-events-none transition-opacity duration-500"
            style={{ opacity: revealReady ? 0 : 1 }}
          >
            {posterElement}
          </div>
          {isSpotify ? (
            <div
              ref={containerRef}
              className="absolute inset-0 w-full transition-opacity duration-500"
              style={{ zIndex: 6, opacity: revealReady ? 1 : 0 }}
            />
          ) : (
            <iframe
              src={embedSrc}
              width="100%"
              height={embedHeight}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="absolute inset-0 border-0 block w-full transition-opacity duration-500"
              style={{ zIndex: 6, opacity: revealReady ? 1 : 0 }}
              title={`Play ${trackTitle}`}
              scrolling="no"
              onLoad={() => setIframeLoaded(true)}
            />
          )}
        </>
      )}
    </div>
  );
}

export const LazySpotifyEmbed = memo(LazySpotifyEmbedInner);
