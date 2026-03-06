/* cache-bust: 2026-03-05-V1 */
/**
 * InlineLyricDance — Embeds the lyric dance player inside a card.
 * Player lifecycle is fully owned by useLyricDancePlayer.
 */

import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { Volume2, VolumeX, Maximize2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { InlineLyricDancePlaybar } from "./InlineLyricDancePlaybar";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";

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
  albumArtUrl?: string;
  avatarUrl?: string | null;
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
  { lyricDanceId, lyricDanceUrl, songTitle, artistName, prefetchedData, bootMode = "minimal", albumArtUrl, avatarUrl }: Props,
  ref: React.Ref<InlineLyricDanceHandle>,
) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [fetchError, setFetchError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [showCover, setShowCover] = useState(true);

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
    if (isVisible && !showCover) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, playerReady, player, showCover]);

  // Mute sync
  useEffect(() => { if (player) player.audio.muted = muted; }, [muted, player]);

  // ── Handlers ─────────────────────────────────────────────────────────

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

  const isWaitingForPlayer =
    loading || !fetchedData || !fetchedData.cinematic_direction || Array.isArray(fetchedData.cinematic_direction);

  return (
    <div className="w-full overflow-hidden bg-black rounded-xl flex flex-col relative" style={{ height: 354 }}>
      {/* Canvas area — matches tier 1 height exactly */}
      <div ref={containerRef}
        className="relative w-full overflow-hidden cursor-pointer"
        style={{ minHeight: 310, height: 310 }}
        onClick={() => { setMuted(m => !m); }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
          style={{ display: playerReady ? "block" : "none" }} />
        <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ display: "none" }} />

        {/* Shared cover — same as shareable page */}
        <AnimatePresence>
          {(showCover || isWaitingForPlayer) && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-0"
            >
              <LyricDanceCover
                songName={songTitle}
                artistName={artistName || fetchedData?.artist_name || ""}
                avatarUrl={avatarUrl ?? null}
                initial={(artistName || songTitle || "♪")[0]?.toUpperCase()}
                waiting={isWaitingForPlayer}
                onListen={(e) => {
                  e.stopPropagation();
                  setShowCover(false);
                  if (player) {
                    player.setMuted(false);
                    player.seek(0);
                    player.play();
                  }
                  setMuted(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {playerReady && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 z-10"
            onClick={e => e.stopPropagation()}>
            <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5">
              {songTitle}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={toggleMute}
                className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button onClick={openFullPage}
                className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Playbar — always visible */}
      <InlineLyricDancePlaybar player={player} playerReady={playerReady} data={data} />
    </div>
  );
}

export const InlineLyricDance = memo(forwardRef(InlineLyricDanceInner));
