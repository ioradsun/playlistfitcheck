/* cache-bust: 2026-03-05-V1 */
/**
 * InlineLyricDance — Embeds the lyric dance player inside a card.
 * Player lifecycle is fully owned by useLyricDancePlayer.
 */

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from "react";
import { Maximize2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { LYRIC_DANCE_COLUMNS, LYRIC_DANCE_FEED_COLUMNS } from "@/lib/lyricDanceColumns";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { InlineLyricDancePlaybar } from "./InlineLyricDancePlaybar";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { type DanceUpdatePayload, useRealtimeFeedHub } from "./RealtimeFeedHub";
import type { CardState } from "./useCardLifecycle";

export interface InlineLyricDanceHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
  reloadTranscript: (lines: any[], words?: any[] | null) => Promise<void>;
}

interface Props {
  postId?: string;
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName: string;
  prefetchedData?: LyricDanceData | null;
  bootMode?: "minimal" | "full";
  albumArtUrl?: string;
  isActive?: boolean;
  cardState?: CardState;
  /** Constrain playback to start at this time in seconds. Used by hook battles. */
  regionStart?: number;
  /** Constrain playback to end at this time in seconds. Used by hook battles. */
  regionEnd?: number;
  onPlay?: () => void;
  preloadedImages?: HTMLImageElement[];
  /** External mute override — when true, audio stays muted regardless of isActive. */
  forceMuted?: boolean;
}

// Shared IntersectionObserver across all embedded players
type VisibilityState = "visible" | "near" | "far";
type VisibilityListener = (visibility: VisibilityState) => void;
const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedIO: IntersectionObserver | null = null;
function getSharedIO() {
  if (!sharedIO) {
    sharedIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const visibility: VisibilityState = !e.isIntersecting
            ? "far"
            : e.intersectionRatio > 0.2
              ? "visible"
              : "near";
          visibilityListeners.get(e.target)?.(visibility);
        }
      },
      { threshold: [0, 0.2, 0.6], rootMargin: "180px" },
    );
  }
  return sharedIO;
}

function InlineLyricDanceInner(
  { postId, lyricDanceId, lyricDanceUrl, songTitle, prefetchedData, bootMode = "full", isActive = false, cardState = "warm", regionStart, regionEnd, onPlay, preloadedImages, forceMuted = false }: Props,
  ref: React.Ref<InlineLyricDanceHandle>,
) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [fetchError, setFetchError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [visibility, setVisibility] = useState<VisibilityState>("far");
  const [playerEvicted, setPlayerEvicted] = useState(false);
  // In battle mode (region set), skip cover — player renders immediately
  const isBattleMode = regionStart != null && regionEnd != null;
  const [showCover, setShowCover] = useState(!isBattleMode && !isActive);
  const [reactionData, setReactionData] = useState<Record<string, { line: Record<number, number>; total: number }>>({});
  const [forceDemoted, setForceDemoted] = useState(false);
  const [battleContentReady, setBattleContentReady] = useState(false);
  const [fullDataRequested, setFullDataRequested] = useState(bootMode === "full" || isBattleMode || isActive);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const farTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ lines: any[]; words?: any[] | null } | null>(null);
  const realtimeHub = useRealtimeFeedHub();

  // ── Fetch (skipped when prefetchedData provided) ──────────────────────
  useEffect(() => {
    if (prefetchedData) { setFetchedData(prefetchedData); setLoading(false); return; }
    if (!lyricDanceId) return;

    const needsFull = fullDataRequested || isBattleMode;
    setLoading(true);
    setFetchError(false);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(needsFull ? LYRIC_DANCE_COLUMNS : LYRIC_DANCE_FEED_COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error || !row) { setFetchError(true); setLoading(false); return; }
        setFetchedData((prev) => ({ ...(prev ?? {}), ...(row as unknown as Record<string, unknown>) } as LyricDanceData));
        setLoading(false);
      });
  }, [lyricDanceId, prefetchedData, fullDataRequested, isBattleMode]);

  // Realtime — only when we own the fetch (no prefetchedData)
  useEffect(() => {
    if (prefetchedData || !lyricDanceId) return;
    if (realtimeHub) {
      return realtimeHub.subscribeDance(lyricDanceId, (payload: DanceUpdatePayload) => {
        const next = payload.new;
        if (!next) return;
        setFetchedData(prev => {
          if (!prev) return prev;
          const n = next as Record<string, unknown>;
          return {
            ...prev,
            ...(Array.isArray(n.lyrics) && { lyrics: n.lyrics as LyricDanceData["lyrics"] }),
            ...(n.words !== undefined && { words: n.words as LyricDanceData["words"] }),
            ...(n.auto_palettes !== undefined && { auto_palettes: n.auto_palettes as LyricDanceData["auto_palettes"] }),
            ...(n.section_images !== undefined && { section_images: n.section_images as LyricDanceData["section_images"] }),
          } as LyricDanceData;
        });
      });
    }

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
          ...(next.auto_palettes !== undefined && { auto_palettes: next.auto_palettes }),
          ...(next.section_images !== undefined && { section_images: next.section_images }),
        } : prev);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [lyricDanceId, prefetchedData, realtimeHub]);

  const topReaction = useMemo(() => {
    const precomputed = (fetchedData as any)?.top_reaction;
    if (!precomputed || typeof precomputed !== "object") return null;

    const EMOJI_SYMBOLS: Record<string, string> = {
      fire: "🔥", dead: "💀", mind_blown: "🤯",
      emotional: "😭", respect: "🙏", accurate: "🎯",
    };

    const emoji = typeof precomputed.emoji === "string" ? precomputed.emoji : "fire";
    const count = Number(precomputed.count ?? 0);
    const lineText = typeof precomputed.line_text === "string" ? precomputed.line_text : "";

    if (!lineText || !Number.isFinite(count) || count <= 0) return null;

    return {
      symbol: EMOJI_SYMBOLS[emoji] ?? emoji,
      count,
      lineText: lineText.slice(0, 60),
      lineReactionCount: count,
    };
  }, [fetchedData]);

  // When data is available, apply region constraints
  const playerData = useMemo(() => {
    if (playerEvicted) return null;
    const base = fetchedData;
    if (!base) return null;
    if (regionStart == null && regionEnd == null) return base;
    return { ...base, region_start: regionStart, region_end: regionEnd };
  }, [fetchedData, regionStart, regionEnd, playerEvicted]);

  // ── Player lifecycle ──────────────────────────────────────────────────
  const { player, playerReady, data } = useLyricDancePlayer(
    playerData, canvasRef, textCanvasRef, containerRef, { bootMode, preloadedImages },
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
    visibilityListeners.set(el, setVisibility);
    io.observe(el);
    return () => { visibilityListeners.delete(el); io.unobserve(el); };
  }, [data]);

  useEffect(() => {
    // Battle mode players are managed by activePlaying, not scroll visibility.
    // Evicting the inactive side breaks round 2 handoff.
    if (isBattleMode) return;
    if (!player && !playerReady) return;

    if (visibility === "far") {
      if (farTimerRef.current) return;
      farTimerRef.current = setTimeout(() => {
        farTimerRef.current = null;
        setPlayerEvicted(true);
        setShowCover(true);
      }, 3000);
      return;
    }

    if (farTimerRef.current) {
      clearTimeout(farTimerRef.current);
      farTimerRef.current = null;
    }

    setPlayerEvicted((prev) => (prev ? false : prev));
  }, [visibility, isBattleMode, player, playerReady]);

  useEffect(() => {
    return () => {
      if (!farTimerRef.current) return;
      clearTimeout(farTimerRef.current);
      farTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleMediaDeactivate = (event: Event) => {
      const customEvent = event as CustomEvent<{ cardId?: string }>;
      if (!postId || customEvent.detail?.cardId !== postId) return;
      setForceDemoted(true);
    };

    window.addEventListener("crowdfit:media-deactivate", handleMediaDeactivate);
    return () => window.removeEventListener("crowdfit:media-deactivate", handleMediaDeactivate);
  }, [postId]);

  useEffect(() => {
    if (cardState === "active") setForceDemoted(false);
  }, [cardState]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (isBattleMode) {
      if (isActive) {
        // Active side: play video + audio, respect mute toggle
        player.play();
        player.setMuted(forceMuted);
        setMuted(forceMuted);
      } else {
        // Inactive side: stop RAF loop but keep audio loading/buffered.
        // Using stopRendering() instead of pause() so the Audio element
        // continues buffering — prevents the stale audio bug where hook B
        // never plays because its audio was paused before finishing load.
        player.stopRendering();
        player.setMuted(true);
        setMuted(true);
      }
      return;
    }

    const shouldRun = cardState === "active" && visibility === "visible" && !forceDemoted;
    if (shouldRun) {
      player.play();
      player.setMuted(false);
      setMuted(false);
    } else {
      player.pause();
      player.setMuted(true);
      setMuted(true);
    }
  }, [visibility, isBattleMode, isActive, cardState, forceDemoted, playerReady, player, forceMuted]);

  // Battle mode: fade out poster once player has been active long enough to render real frames
  useEffect(() => {
    if (!isBattleMode) return;
    if (!isActive || !playerReady) {
      setBattleContentReady(false);
      return;
    }
    const timer = setTimeout(() => setBattleContentReady(true), 600);
    return () => clearTimeout(timer);
  }, [isBattleMode, isActive, playerReady]);

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
        className="block mx-3 my-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 text-center">
        <p className="text-sm font-semibold text-white/80">{songTitle}</p>
        <p className="text-xs text-white/40 mt-1">Tap to watch lyric dance →</p>
      </a>
    );
  }

  const hasFullPlayerData = !!(fetchedData?.cinematic_direction && !Array.isArray(fetchedData.cinematic_direction));
  const isWaitingForPlayer = loading || (fullDataRequested && !hasFullPlayerData);

  // ── Battle mode: bare canvas, no chrome ────────────────────────────────
  if (isBattleMode) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
            style={{ display: playerReady ? "block" : "none" }} />
          <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ display: "none" }} />
        </div>

        {/* Poster overlay — sits ON TOP of opaque canvas, fades out when real frames render */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{ opacity: battleContentReady ? 0 : 1 }}
        >
          {fetchedData?.section_images?.[0] ? (
            <img
              src={fetchedData.section_images[0] as string}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/80 via-zinc-900/80 to-black/80" />
          )}
          <div className="absolute inset-0 bg-black/30" />
        </div>

        {/* Spinner — only before player initializes */}
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // ── Standard mode: full card with cover, playbar, title ────────────────

  return (
    <div className="w-full overflow-hidden relative" style={{ height: 320 }}>
      {/* Canvas area — matches tier 1 height exactly */}
      <div ref={containerRef}
        className="absolute inset-0 w-full overflow-hidden cursor-pointer"
        onClick={(e) => {
          if (!showCover && !isWaitingForPlayer) toggleMute(e);
        }}
      >
        {!playerReady && (
          <>
            {(fetchedData?.section_images?.[0]) ? (
              <img
                src={(fetchedData?.section_images?.[0]) as string}
                alt={songTitle}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/60 via-zinc-900/60 to-black/60" />
            )}
          </>
        )}
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
                  setFullDataRequested(true);
                  setPlayerEvicted(false);
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
      <div className="absolute bottom-0 left-0 right-0 z-[100]">
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

export const InlineLyricDance = forwardRef<InlineLyricDanceHandle, Props>(InlineLyricDanceInner);
InlineLyricDance.displayName = "InlineLyricDance";
