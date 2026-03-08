/* cache-bust: 2026-03-05-V1 */
/**
 * InlineLyricDance — Embeds the lyric dance player inside a card.
 * Player lifecycle is fully owned by useLyricDancePlayer.
 */

import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle, useMemo } from "react";
import { Maximize2 } from "lucide-react";
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
  isActive?: boolean;
  /** Constrain playback to start at this time in seconds. Used by hook battles. */
  regionStart?: number;
  /** Constrain playback to end at this time in seconds. Used by hook battles. */
  regionEnd?: number;
  onPlay?: () => void;
  reactionData?: Record<string, { line: Record<number, number>; total: number }>;
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
  { lyricDanceId, lyricDanceUrl, songTitle, prefetchedData, bootMode = "minimal", isActive = false, regionStart, regionEnd, onPlay, reactionData: reactionDataProp }: Props,
  ref: React.Ref<InlineLyricDanceHandle>,
) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [fetchError, setFetchError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  // In battle mode (region set), skip cover — player renders immediately
  const isBattleMode = regionStart != null && regionEnd != null;
  const [showCover, setShowCover] = useState(!isBattleMode);
  const [reactionData, setReactionData] = useState<Record<string, { line: Record<number, number>; total: number }>>(reactionDataProp ?? {});

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


  useEffect(() => {
    if (reactionDataProp) setReactionData(reactionDataProp);
  }, [reactionDataProp]);

  // Fetch reactions when data is available
  useEffect(() => {
    if (reactionDataProp || !fetchedData?.id) return;
    supabase
      .from("lyric_dance_reactions" as any)
      .select("emoji, line_index")
      .eq("dance_id", fetchedData.id)
      .then(({ data: rows }) => {
        if (!rows) return;
        const agg: Record<string, { line: Record<number, number>; total: number }> = {};
        for (const row of rows as any[]) {
          const { emoji, line_index } = row;
          if (!agg[emoji]) agg[emoji] = { line: {}, total: 0 };
          agg[emoji].total++;
          if (line_index != null) {
            agg[emoji].line[line_index] = (agg[emoji].line[line_index] ?? 0) + 1;
          }
        }
        setReactionData(agg);
      });
  }, [fetchedData?.id, reactionDataProp]);

  // Realtime reactions
  useEffect(() => {
    if (reactionDataProp || !fetchedData?.id) return;
    const channel = supabase
      .channel(`inline-reactions-${fetchedData.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "lyric_dance_reactions",
        filter: `dance_id=eq.${fetchedData.id}`,
      }, (payload: any) => {
        const { emoji, line_index } = payload.new;
        setReactionData(prev => {
          const updated = { ...prev };
          if (!updated[emoji]) updated[emoji] = { line: {}, total: 0 };
          updated[emoji] = {
            ...updated[emoji],
            total: updated[emoji].total + 1,
            line: {
              ...updated[emoji].line,
              ...(line_index != null ? { [line_index]: (updated[emoji].line[line_index] ?? 0) + 1 } : {}),
            },
          };
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchedData?.id, reactionDataProp]);

  const topReaction = useMemo(() => {
    if (!reactionData || !fetchedData?.lyrics) return null;

    const EMOJI_SYMBOLS: Record<string, string> = {
      fire: '🔥', dead: '💀', mind_blown: '🤯',
      emotional: '😭', respect: '🙏', accurate: '🎯',
    };

    const lineTotals = new Map<number, number>();
    for (const data of Object.values(reactionData)) {
      for (const [lineIdxStr, count] of Object.entries(data.line)) {
        const idx = Number(lineIdxStr);
        lineTotals.set(idx, (lineTotals.get(idx) ?? 0) + count);
      }
    }

    if (lineTotals.size === 0) return null;

    let bestLineIndex = -1;
    let bestLineTotal = 0;
    for (const [idx, total] of lineTotals.entries()) {
      if (total > bestLineTotal) { bestLineTotal = total; bestLineIndex = idx; }
    }

    let topEmojiKey: string | null = null;
    let topEmojiCount = 0;
    for (const [key, data] of Object.entries(reactionData)) {
      const count = data.line[bestLineIndex] ?? 0;
      if (count > topEmojiCount) { topEmojiCount = count; topEmojiKey = key; }
    }

    const symbol = topEmojiKey ? (EMOJI_SYMBOLS[topEmojiKey] ?? '🔥') : '🔥';
    const line = (fetchedData.lyrics as any[])[bestLineIndex];
    const lineText = (line?.text ?? '').slice(0, 60);

    return {
      symbol,
      count: topEmojiCount,
      lineText,
      lineReactionCount: bestLineTotal,
    };
  }, [reactionData, fetchedData?.lyrics]);

  // When data is available, apply region constraints
  const playerData = useMemo(() => {
    const base = fetchedData;
    if (!base) return null;
    if (regionStart == null && regionEnd == null) return base;
    return { ...base, region_start: regionStart, region_end: regionEnd };
  }, [fetchedData, regionStart, regionEnd]);

  // ── Player lifecycle ──────────────────────────────────────────────────
  const { player, playerReady, data } = useLyricDancePlayer(
    playerData, canvasRef, textCanvasRef, containerRef, { bootMode },
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
    if (isBattleMode) {
      // Battle mode: only the active side runs. Inactive side fully pauses (stops RAF + audio)
      if (isActive) {
        player.play();
        player.setMuted(false);
        setMuted(false);
      } else {
        player.pause();
        player.setMuted(true);
        setMuted(true);
      }
    } else if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, isBattleMode, isActive, playerReady, player]);


  useEffect(() => {
    if (!player || isBattleMode) return; // Battle mode handled above
    if (!isActive) {
      player.setMuted(true);
      setMuted(true);
    }
  }, [isActive, isBattleMode, player]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!player) return;
    const next = !muted;
    player.setMuted(next);
    setMuted(next);
  }, [muted, player]);
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

  // ── Battle mode: bare canvas, no chrome ────────────────────────────────
  if (isBattleMode) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-black">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
            style={{ display: playerReady ? "block" : "none" }} />
          <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ display: "none" }} />
        </div>
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // ── Standard mode: full card with cover, playbar, title ────────────────

  return (
    <div className="w-full overflow-hidden bg-black rounded-xl relative" style={{ height: 320 }}>
      {/* Canvas area — matches tier 1 height exactly */}
      <div ref={containerRef}
        className="absolute inset-0 w-full overflow-hidden cursor-pointer"
        onClick={(e) => {
          if (!showCover && !isWaitingForPlayer) toggleMute(e);
        }}
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
                waiting={isWaitingForPlayer}
                badge="In Studio"
                onExpand={() => window.open(lyricDanceUrl, "_blank")}
                topReaction={!isWaitingForPlayer ? topReaction : null}
                onListen={(e) => {
                  e.stopPropagation();
                  onPlay?.();
                  setShowCover(false);
                  if (player) {
                    player.setMuted(false);
                    player.seek(regionStart ?? 0);
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
            <button onClick={openFullPage}
              className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors">
              <Maximize2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Playbar — overlaid at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <InlineLyricDancePlaybar
        player={player}
        playerReady={playerReady}
        data={data}
        reactionData={reactionData}
          onReactionDataChange={setReactionData}
        />
      </div>
    </div>
  );
}

export const InlineLyricDance = memo(forwardRef(InlineLyricDanceInner));
