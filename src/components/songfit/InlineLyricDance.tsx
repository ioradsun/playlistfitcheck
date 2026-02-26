/**
 * InlineLyricDance — Renders a live lyric dance canvas inside a CrowdFit card.
 * Fetches dance data on mount, initializes LyricDancePlayer on tap.
 * Muted autoplay on visibility, tap to unmute & open full page.
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Loader2, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,words,motion_profile_spec,beat_grid,palette,system_type,artist_dna,seed,frame_state,section_images,scene_context,cinematic_direction";

interface Props {
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName: string;
}

function InlineLyricDanceInner({ lyricDanceId, lyricDanceUrl, songTitle, artistName }: Props) {
  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [started, setStarted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LyricDancePlayer | null>(null);
  const initRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  // Fetch dance data
  useEffect(() => {
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
  }, [lyricDanceId]);

  // Visibility-gated startup and playback
  useEffect(() => {
    if (!data || !data.words?.length || !data.cinematic_direction) return;
    const el = containerRef.current;
    if (!el) return;

    let startTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio > 0.2;
        setIsVisible(visible);

        if (visible && !started && !startTimer) {
          startTimer = setTimeout(() => {
            setStarted(true);
            startTimer = null;
          }, 350);
        }

        if (!visible && startTimer) {
          clearTimeout(startTimer);
          startTimer = null;
        }
      },
      { threshold: [0, 0.2, 0.6], rootMargin: "180px" }
    );
    observer.observe(el);

    return () => {
      if (startTimer) clearTimeout(startTimer);
      observer.disconnect();
    };
  }, [data, started]);

  // Init player
  useEffect(() => {
    if (initRef.current) return;
    if (!started || !data || !data.words?.length || !data.cinematic_direction) return;
    if (!canvasRef.current || !textCanvasRef.current || !containerRef.current) return;

    initRef.current = true;
    let destroyed = false;

    const player = new LyricDancePlayer(
      data,
      canvasRef.current,
      textCanvasRef.current,
      containerRef.current as HTMLDivElement,
      { bootMode: "minimal" },
    );
    playerRef.current = player;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) player.resize(width, height);
    });
    ro.observe(containerRef.current);

    player.init()
      .then(() => {
        if (!destroyed) {
          player.audio.muted = true;
          player.play();
          console.info("[InlineLyricDance boot]", player.getBootMetrics());
        }
      })
      .catch((err) => {
        console.error("[InlineLyricDance] init failed:", err);
      });

    return () => {
      destroyed = true;
      ro.disconnect();
      player.destroy();
      playerRef.current = null;
      initRef.current = false;
    };
  }, [started, data?.id, data?.words?.length, !!data?.cinematic_direction]);


  useEffect(() => {
    const player = playerRef.current;
    if (!player || !started) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, started]);

  // Mute toggle
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.audio.muted = muted;
    }
  }, [muted]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted(m => !m);
  }, []);

  const openFullPage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(lyricDanceUrl, "_blank");
  }, [lyricDanceUrl]);

  const handleCanvasClick = useCallback(() => {
    setMuted(m => !m);
  }, []);

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
      {/* Canvases */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: started ? "block" : "none" }}
      />
      <canvas
        ref={textCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "none" }}
      />

      {/* Loading state */}
      {(loading || (!canPlay && !error)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center space-y-2">
            <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Loading dance…</p>
          </div>
        </div>
      )}

      {/* Title overlay top-left */}
      {started && (
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

      {/* Bottom controls */}
      {started && (
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
