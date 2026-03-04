/**
 * InlineLyricDance — Embeds the full lyric dance player inside a card.
 * Shows a cover with "Listen Now" button, then plays with audio — 
 * consistent with the shareable lyric dance page experience.
 */

import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { Loader2, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withInitLimit } from "@/engine/initQueue";

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,words,section_images,cinematic_direction,artist_dna";

export interface InlineLyricDanceHandle {
  getPlayer: () => LyricDancePlayer | null;
}

interface Props {
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName: string;
  /** Pre-fetched dance data — skips the internal Supabase fetch when provided */
  prefetchedData?: LyricDanceData | null;
}

type VisibilityListener = (visible: boolean) => void;

const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedVisibilityObserver: IntersectionObserver | null = null;

function getSharedVisibilityObserver() {
  if (!sharedVisibilityObserver) {
    sharedVisibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const listener = visibilityListeners.get(entry.target);
          if (listener) {
            listener(entry.isIntersecting && entry.intersectionRatio > 0.2);
          }
        }
      },
      { threshold: [0, 0.2, 0.6], rootMargin: "180px" },
    );
  }
  return sharedVisibilityObserver;
}

function InlineLyricDanceInner({ lyricDanceId, lyricDanceUrl, songTitle, artistName, prefetchedData }: Props) {
  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LyricDancePlayer | null>(null);
  const initRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  // Use prefetched data if available, otherwise fetch
  useEffect(() => {
    if (prefetchedData) {
      setData(prefetchedData);
      setLoading(false);
      return;
    }
    if (!lyricDanceId) return;
    setLoading(true);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (err || !row) {
          setError(true);
          setLoading(false);
          return;
        }
        setData(row as any as LyricDanceData);
        setLoading(false);
      });
  }, [lyricDanceId, prefetchedData]);

  // Visibility updates via shared observer
  useEffect(() => {
    if (!data || !data.words?.length || !data.cinematic_direction) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = getSharedVisibilityObserver();
    visibilityListeners.set(el, setIsVisible);
    observer.observe(el);

    return () => {
      visibilityListeners.delete(el);
      observer.unobserve(el);
    };
  }, [data]);

  // Auto-init player when visible + data ready — plays muted in background behind cover
  useEffect(() => {
    if (initRef.current) return;
    if (!isVisible || !data || !data.words?.length || !data.cinematic_direction) return;
    if (!canvasRef.current || !textCanvasRef.current || !containerRef.current) return;

    initRef.current = true;
    let destroyed = false;
    let ro: ResizeObserver | null = null;

    withInitLimit(async () => {
      if (destroyed) return;
      const player = new LyricDancePlayer(
        data,
        canvasRef.current!,
        textCanvasRef.current!,
        containerRef.current as HTMLDivElement,
        { bootMode: "minimal" },
      );
      playerRef.current = player;

      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) player.resize(width, height);
      });
      ro.observe(containerRef.current!);

      await player.init();

      if (!destroyed) {
        player.audio.muted = true;
        // Start playing muted behind the cover — gives visual life
        player.play();
        setPlayerReady(true);
        console.info("[InlineLyricDance boot]", player.getBootMetrics());
      }
    }).catch((err) => {
      console.error("[InlineLyricDance] init failed:", err);
    });

    return () => {
      destroyed = true;
      ro?.disconnect();
      playerRef.current?.destroy();
      playerRef.current = null;
      initRef.current = false;
      setPlayerReady(false);
    };
  }, [isVisible, data?.id, data?.words?.length, !!data?.cinematic_direction]);

  // Pause/resume based on visibility
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, playerReady]);

  // Mute sync
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.audio.muted = muted;
    }
  }, [muted]);

  const handleListenNow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (player) {
      player.seek(0);
      player.setMuted(false);
      player.play();
    }
    setMuted(false);
    setShowCover(false);
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted(m => !m);
  }, []);

  const openFullPage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(lyricDanceUrl, "_blank");
  }, [lyricDanceUrl]);

  const handleCanvasClick = useCallback(() => {
    if (showCover) return; // cover handles its own click
    setMuted(m => !m);
  }, [showCover]);

  if (error) {
    return (
      <a
        href={lyricDanceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mx-3 my-2 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors p-4 text-center"
      >
        <p className="text-sm font-semibold">{songTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">Tap to watch lyric dance →</p>
      </a>
    );
  }

  const canPlay = data && data.words?.length && data.cinematic_direction;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black cursor-pointer rounded-xl"
      style={{ minHeight: 352, height: 352 }}
      onClick={handleCanvasClick}
    >
      {/* Canvas — always rendered so player can draw behind cover */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: playerReady ? "block" : "none" }}
      />
      <canvas
        ref={textCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "none" }}
      />

      {/* Loading state */}
      {(loading || (!canPlay && !error && !playerReady)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center space-y-2">
            <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Loading dance…</p>
          </div>
        </div>
      )}

      {/* Cover overlay — matches the full shareable page "Listen Now" experience */}
      {playerReady && showCover && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-4">
            {/* Artist initial */}
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-lg font-mono text-white/40">
                {(artistName || data?.artist_name || songTitle || "?")[0].toUpperCase()}
              </span>
            </div>
            {/* Song info */}
            <div className="text-center px-6">
              <h3 className="text-lg font-bold text-white leading-tight">{songTitle}</h3>
              {(artistName || data?.artist_name) && (
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mt-1">
                  {artistName || data?.artist_name}
                </p>
              )}
            </div>
            {/* Listen Now button */}
            <button
              onClick={handleListenNow}
              className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors mt-2"
            >
              Listen Now
            </button>
          </div>
        </div>
      )}

      {/* Title + expand — shown after cover dismissed */}
      {!showCover && playerReady && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5">
            {songTitle}
          </span>
          <button
            onClick={openFullPage}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Bottom mute control — shown after cover dismissed */}
      {!showCover && playerReady && (
        <div className="absolute bottom-0 left-0 p-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

export const InlineLyricDance = memo(InlineLyricDanceInner);
