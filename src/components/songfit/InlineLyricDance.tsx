/* cache-bust: 2026-03-05-V1 */
/**
 * InlineLyricDance — Embeds the lyric dance player inside a card.
 * Player lifecycle is fully owned by useLyricDancePlayer.
 */

import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { Volume2, VolumeX, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";

export interface InlineLyricDanceHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
  reloadTranscript: (lines: any[], words?: any[] | null) => Promise<void>;
}

interface Props {
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName: string;
  prefetchedData?: LyricDanceData | null;
  bootMode?: "minimal" | "full";
}

// Shared IntersectionObserver across all embedded players
type VisibilityListener = (visible: boolean) => void;
const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedIO: IntersectionObserver | null = null;
function getSharedIO() {
  if (!sharedIO) {
    sharedIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visibilityListeners.get(e.target)?.(e.isIntersecting && e.intersectionRatio > 0.2);
      },
      { threshold: [0, 0.2, 0.6], rootMargin: "180px" },
    );
  }
  return sharedIO;
}

function InlineLyricDanceInner(
  { lyricDanceId, lyricDanceUrl, songTitle, artistName, prefetchedData, bootMode = "minimal" }: Props,
  ref: React.Ref<InlineLyricDanceHandle>,
) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [fetchError, setFetchError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const pendingRef = useRef<{ lines: any[]; words?: any[] | null } | null>(null);

  // ── Fetch (skipped when prefetchedData provided) ──────────────────────
  useEffect(() => {
    if (prefetchedData) { setFetchedData(prefetchedData); setLoading(false); return; }
    if (!lyricDanceId) return;
    setLoading(true);
    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error || !row) { setFetchError(true); setLoading(false); return; }
        setFetchedData(row as any as LyricDanceData);
        setLoading(false);
      });
  }, [lyricDanceId, prefetchedData]);

  // Realtime — only when we own the fetch (no prefetchedData)
  useEffect(() => {
    if (prefetchedData || !lyricDanceId) return;
    const ch = supabase
      .channel(`inline-dance-${lyricDanceId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public",
        table: "shareable_lyric_dances", filter: `id=eq.${lyricDanceId}`,
      }, ({ new: next }: any) => {
        if (!next) return;
        setFetchedData(prev => prev ? {
          ...prev,
          ...(next.lyrics && { lyrics: next.lyrics }),
          ...(next.words !== undefined && { words: next.words }),
        } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lyricDanceId, !!prefetchedData]);

  // ── Player lifecycle ──────────────────────────────────────────────────
  const { player, playerReady, data } = useLyricDancePlayer(
    fetchedData, canvasRef, textCanvasRef, containerRef, { bootMode },
  );

  // Apply transcript buffered before player was ready
  useEffect(() => {
    if (!playerReady || !player) return;
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    player.updateTranscript(p.lines as any, p.words as any ?? undefined);
  }, [playerReady, player]);

  // Hot-patch when data.lyrics changes (realtime path)
  const transcriptMountRef = useRef(false);
  useEffect(() => {
    if (!player || !playerReady || !data?.lyrics) return;
    if (!transcriptMountRef.current) { transcriptMountRef.current = true; return; }
    const t = setTimeout(() => player.updateTranscript(data.lyrics, data.words ?? null), 300);
    return () => clearTimeout(t);
  }, [data?.lyrics, data?.words, playerReady, player]);

  // Expose handle to FitTab
  useImperativeHandle(ref, () => ({
    getPlayer: () => player,
    reloadTranscript: async (lines: any[], newWords?: any[] | null) => {
      if (!player) { pendingRef.current = { lines, words: newWords }; return; }
      player.updateTranscript(lines as any, newWords as any ?? undefined);
    },
  }), [player]);

  // Visibility
  useEffect(() => {
    if (!data?.words?.length || !data?.cinematic_direction) return;
    const el = containerRef.current;
    if (!el) return;
    const io = getSharedIO();
    visibilityListeners.set(el, setIsVisible);
    io.observe(el);
    return () => { visibilityListeners.delete(el); io.unobserve(el); };
  }, [data]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (isVisible) player.play(); else player.pause();
  }, [isVisible, playerReady, player]);

  // Mute sync
  useEffect(() => { if (player) player.audio.muted = muted; }, [muted, player]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleListenNow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    player?.seek(0); player?.setMuted(false); player?.play();
    setMuted(false); setShowCover(false);
  }, [player]);

  const toggleMute = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setMuted(m => !m); }, []);
  const openFullPage = useCallback((e: React.MouseEvent) => { e.stopPropagation(); window.open(lyricDanceUrl, "_blank"); }, [lyricDanceUrl]);

  // ── Render ────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <a href={lyricDanceUrl} target="_blank" rel="noopener noreferrer"
        className="block mx-3 my-2 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors p-4 text-center">
        <p className="text-sm font-semibold">{songTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">Tap to watch lyric dance →</p>
      </a>
    );
  }

  return (
    <div ref={containerRef}
      className="relative w-full overflow-hidden bg-black cursor-pointer rounded-xl"
      style={{ minHeight: 352, height: 352 }}
      onClick={() => { if (!showCover) setMuted(m => !m); }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
        style={{ display: playerReady ? "block" : "none" }} />
      <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "none" }} />

      {(loading || (!playerReady && !fetchError)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          {/* Artist initial */}
          <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center mb-4">
            <span className="text-base font-mono text-white/30">
              {(artistName || songTitle || "?")[0].toUpperCase()}
            </span>
          </div>
          {/* Song title */}
          <p className="text-sm font-semibold text-white/80 mb-1 px-6 text-center truncate max-w-[80%]">{songTitle}</p>
          {artistName && (
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mb-5">{artistName}</p>
          )}
          {/* Waveform shimmer — 5 bars pulsing in sequence */}
          <div className="flex items-end gap-[3px] h-6">
            {[0.5, 0.8, 1, 0.7, 0.4].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-white/20"
                style={{
                  height: `${h * 100}%`,
                  animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {playerReady && showCover && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-lg font-mono text-white/40">
                {(artistName || data?.artist_name || songTitle || "?")[0].toUpperCase()}
              </span>
            </div>
            <div className="text-center px-6">
              <h3 className="text-lg font-bold text-white leading-tight">{songTitle}</h3>
              {(artistName || data?.artist_name) && (
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mt-1">
                  {artistName || data?.artist_name}
                </p>
              )}
            </div>
            <button onClick={handleListenNow}
              className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors mt-2">
              Listen Now
            </button>
          </div>
        </div>
      )}

      {!showCover && playerReady && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 z-10"
          onClick={e => e.stopPropagation()}>
          <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5">
            {songTitle}
          </span>
          <button onClick={openFullPage}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {!showCover && playerReady && (
        <div className="absolute bottom-0 left-0 p-2 z-10" onClick={e => e.stopPropagation()}>
          <button onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

export const InlineLyricDance = memo(forwardRef(InlineLyricDanceInner));
