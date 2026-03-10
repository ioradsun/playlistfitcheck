/**
 * LyricDanceEmbed — Single canonical lyric dance player.
 * Used by both ShareableLyricDance (full screen) and the CrowdFit feed (inline).
 *
 * Feed-specific behaviour is controlled by three optional props:
 *   cardState  — warm/active/cold lifecycle from the feed window
 *   regionStart / regionEnd — clip to a hook window (battle mode)
 *   onPlay     — called when user taps Listen Now (feed activates the card)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import {
  ReactionPanel,
  type CanonicalAudioSection,
} from "@/components/lyric/ReactionPanel";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { CardState } from "@/components/songfit/useCardLifecycle";

// ── Shared IntersectionObserver ────────────────────────────────────────
type VisibilityState = "visible" | "near" | "far";
type VisibilityListener = (v: VisibilityState) => void;
const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedIO: IntersectionObserver | null = null;
function getSharedIO() {
  if (!sharedIO) {
    sharedIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v: VisibilityState = !e.isIntersecting
            ? "far"
            : e.intersectionRatio > 0.2
              ? "visible"
              : "near";
          visibilityListeners.get(e.target)?.(v);
        }
      },
      { threshold: [0, 0.2, 0.6], rootMargin: "180px" },
    );
  }
  return sharedIO;
}

// ── topReaction — derived from live reactionData ────────────────────
const EMOJI_SYMBOLS: Record<string, string> = {
  fire: "🔥",
  dead: "💀",
  mind_blown: "🤯",
  emotional: "😭",
  respect: "🙏",
  accurate: "🎯",
};

function computeTopReaction(
  reactionData: Record<string, { line: Record<number, number>; total: number }>,
  lyrics: any[],
) {
  const lineTotals = new Map<number, number>();
  for (const d of Object.values(reactionData)) {
    for (const [idxStr, count] of Object.entries(d.line)) {
      const idx = Number(idxStr);
      lineTotals.set(idx, (lineTotals.get(idx) ?? 0) + count);
    }
  }
  if (lineTotals.size === 0) return null;

  let bestIdx = -1,
    bestTotal = 0;
  for (const [idx, total] of lineTotals.entries()) {
    if (total > bestTotal) {
      bestTotal = total;
      bestIdx = idx;
    }
  }

  let topKey: string | null = null,
    topCount = 0;
  for (const [key, d] of Object.entries(reactionData)) {
    const count = d.line[bestIdx] ?? 0;
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  }

  const symbol = topKey ? (EMOJI_SYMBOLS[topKey] ?? "🔥") : "🔥";
  const lineText = ((lyrics as any[])[bestIdx]?.text ?? "").slice(0, 60);
  if (!lineText || bestTotal <= 0) return null;
  return { symbol, count: bestTotal, lineText, lineReactionCount: bestTotal };
}

// ── Props ───────────────────────────────────────────────────────────

interface LyricDanceEmbedProps {
  // Data — pass either lyricDanceId (feed fetches) or prefetchedData
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName?: string;
  prefetchedData?: LyricDanceData | null;

  // Feed lifecycle — omit for fullscreen/shareable usage
  cardState?: CardState; // warm | active | cold
  onPlay?: () => void; // called when user taps Listen Now

  // Battle clip windowing — omit for full song
  regionStart?: number;
  regionEnd?: number;

  // Display
  showExpandButton?: boolean;
  disableReactionPanel?: boolean;
  hideReactButton?: boolean;
  externalPanelOpen?: boolean;
  onExternalPanelOpenChange?: (open: boolean) => void;
  /** Skip cover overlay and start playing immediately (muted). */
  autoPlay?: boolean;
  onVoteYes?: () => void;
  onVoteNo?: () => void;
  votedSide?: "a" | "b" | null;
  scorePill?: { total: number; replay_yes: number } | null;
  canvasNote?: string;
  onCanvasNoteChange?: (note: string) => void;
  onCanvasSubmit?: () => void;
  onOpenReactions?: () => void;
}

// ── Component ────────────────────────────────────────────────────────

export function LyricDanceEmbed({
  lyricDanceId,
  lyricDanceUrl,
  songTitle,
  artistName,
  prefetchedData,
  cardState,
  onPlay,
  regionStart,
  regionEnd,
  showExpandButton = true,
  disableReactionPanel = false,
  hideReactButton = false,
  externalPanelOpen,
  onExternalPanelOpenChange,
  autoPlay = false,
  onVoteYes,
  onVoteNo,
  votedSide,
  scorePill,
  canvasNote = "",
  onCanvasNoteChange,
  onCanvasSubmit,
  onOpenReactions,
}: LyricDanceEmbedProps) {
  const isFeedEmbed = cardState !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;

  // Single cover state — identical to ShareableLyricDance.
  // Battle tiles never show a cover (sub-regions of a full song).
  // autoPlay skips the cover entirely for workspace/review embeds.
  const [showCover, setShowCover] = useState(!isBattleMode && !autoPlay);
  const effectiveShowCover = showCover;

  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(
    prefetchedData ?? null,
  );
  const [loading, setLoading] = useState(!prefetchedData);
  const [muted, setMuted] = useState(true);
  const [visibility, setVisibility] = useState<VisibilityState>(
    isFeedEmbed ? "far" : "visible",
  );
  const [playerEvicted, setPlayerEvicted] = useState(false);
  const [reactionData, setReactionData] = useState<
    Record<string, { line: Record<number, number>; total: number }>
  >({});
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
  const [engagementMode, setEngagementMode] = useState<
    "spectator" | "freezing" | "engaged"
  >("spectator");
  const [commentFocused, setCommentFocused] = useState(false);
  const [frozenLineIndex, setFrozenLineIndex] = useState<number | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [forceDemoted, setForceDemoted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const farTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freezeAtSecRef = useRef<number | null>(null);
  const engagementModeRef = useRef<"spectator" | "freezing" | "engaged">(
    "spectator",
  );
  const currentTimeSecRef = useRef(0);

  // Sync external open control
  useEffect(() => {
    if (externalPanelOpen !== undefined) {
      setReactionPanelOpen(externalPanelOpen);
    }
  }, [externalPanelOpen]);

  const openPanel = useCallback(() => {
    setReactionPanelOpen(true);
    onExternalPanelOpenChange?.(true);
    if (hideReactButton && votedSide != null) setCommentFocused(true);
  }, [onExternalPanelOpenChange, hideReactButton, votedSide]);

  const closePanel = useCallback(() => {
    setReactionPanelOpen(false);
    onExternalPanelOpenChange?.(false);
    setCommentFocused(false);
  }, [onExternalPanelOpenChange]);

  // ── Data fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!lyricDanceId) return;
    if (prefetchedData) {
      setFetchedData(prefetchedData);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error || !row) {
          setLoading(false);
          return;
        }
        setFetchedData(row as unknown as LyricDanceData);
        setLoading(false);
      });
  }, [lyricDanceId, prefetchedData]);

  // ── Player data (apply region constraints) ─────────────────────────
  const playerData = useMemo(() => {
    if (playerEvicted) return null;
    if (!fetchedData) return null;
    if (regionStart == null && regionEnd == null) return fetchedData;
    return { ...fetchedData, region_start: regionStart, region_end: regionEnd };
  }, [fetchedData, regionStart, regionEnd, playerEvicted]);

  // ── Player lifecycle ───────────────────────────────────────────────
  const { player, playerReady, data } = useLyricDancePlayer(
    playerData,
    canvasRef,
    textCanvasRef,
    containerRef,
    { bootMode: "full" },
  );

  // ── Text vertical bias — shift canvas text above the bottom bar ────
  useEffect(() => {
    if (!player || !playerReady) return;
    // Battle tiles have no bottom bar of their own (BattleEmbed owns that)
    player.setTextVerticalBias(isBattleMode ? 0 : 60);
  }, [player, playerReady, isBattleMode]);

  // ── Scroll visibility (feed only) ─────────────────────────────────
  useEffect(() => {
    if (!isFeedEmbed) return;
    const el = containerRef.current;
    if (!el) return;
    visibilityListeners.set(el, setVisibility);
    getSharedIO().observe(el);
    return () => {
      visibilityListeners.delete(el);
      sharedIO?.unobserve(el);
    };
  }, [isFeedEmbed, data]);

  // ── Eviction when scrolled far away (feed only) ────────────────────
  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) return;
    if (!player && !playerReady) return;

    if (visibility === "far") {
      if (farTimerRef.current) return;
      farTimerRef.current = setTimeout(() => {
        farTimerRef.current = null;
        setPlayerEvicted(true);
      }, 3000);
      return;
    }
    if (farTimerRef.current) {
      clearTimeout(farTimerRef.current);
      farTimerRef.current = null;
    }
    setPlayerEvicted((prev) => (prev ? false : prev));
  }, [visibility, isFeedEmbed, isBattleMode, player, playerReady]);

  // ── Media deactivate event (feed only) ────────────────────────────
  useEffect(() => {
    if (!isFeedEmbed || !lyricDanceId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ cardId?: string }>;
      if (ce.detail?.cardId !== lyricDanceId) return;
      setForceDemoted(true);
    };
    window.addEventListener("crowdfit:media-deactivate", handler);
    return () =>
      window.removeEventListener("crowdfit:media-deactivate", handler);
  }, [isFeedEmbed, lyricDanceId]);

  useEffect(() => {
    if (cardState === "active") setForceDemoted(false);
  }, [cardState]);

  // ── Reset cover when card scrolls out of view ─────────────────────
  // When the card goes "far" (fully off-screen), restore the cover so it's
  // always fresh on scroll-back — animation runs behind it immediately.
  // Also fire media-deactivate so the parent resets cardState → audio mutes.
  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) return;
    if (visibility === "far") {
      setShowCover(true);
      if (lyricDanceId) {
        window.dispatchEvent(
          new CustomEvent("crowdfit:media-deactivate", {
            detail: { cardId: lyricDanceId },
          }),
        );
      }
    }
  }, [visibility, isFeedEmbed, isBattleMode, lyricDanceId]);

  // ── Play/pause/mute logic ──────────────────────────────────────────
  useEffect(() => {
    if (!player || !playerReady) return;

    if (isBattleMode) {
      // Battle: active side plays, inactive side renders silently
      if (cardState === "active") {
        player.play();
        player.setMuted(false);
        setMuted(false);
      } else {
        player.stopRendering?.();
        player.setMuted(true);
        setMuted(true);
      }
      return;
    }

    if (!isFeedEmbed) {
      // Fullscreen: player always runs, cover controls mute
      return;
    }

    // Feed embed:
    // "near" = partially in viewport — keep playing muted so animation is live when scrolled in.
    // Only fully pause when "far" (off-screen entirely).
    // When cover is showing, always mute — audio only starts after "Listen Now".
    const coverUp = showCover;
    const shouldUnmuted =
      !coverUp &&
      cardState === "active" &&
      visibility === "visible" &&
      !forceDemoted;
    const shouldMuted =
      !coverUp &&
      cardState !== "active" &&
      (visibility === "visible" || visibility === "near");

    if (shouldUnmuted) {
      player.play();
      player.setMuted(false);
      setMuted(false);
    } else if (shouldMuted || coverUp) {
      // Keep animation running (muted) so it's live behind the cover
      player.play();
      player.setMuted(true);
      setMuted(true);
    } else {
      player.pause();
      player.setMuted(true);
      setMuted(true);
    }
  }, [
    player,
    playerReady,
    cardState,
    visibility,
    forceDemoted,
    isFeedEmbed,
    isBattleMode,
  ]);

  // ── Reactions fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.id) return;
    supabase
      .from("lyric_dance_reactions" as any)
      .select("emoji, line_index")
      .eq("dance_id", data.id)
      .then(({ data: rows }) => {
        if (!rows) return;
        const agg: Record<
          string,
          { line: Record<number, number>; total: number }
        > = {};
        for (const row of rows as any[]) {
          const { emoji, line_index } = row;
          if (!agg[emoji]) agg[emoji] = { line: {}, total: 0 };
          agg[emoji].total++;
          if (line_index != null)
            agg[emoji].line[line_index] =
              (agg[emoji].line[line_index] ?? 0) + 1;
        }
        setReactionData(agg);
      });
  }, [data?.id]);

  // ── Realtime reactions ─────────────────────────────────────────────
  useEffect(() => {
    if (!data?.id) return;
    const channel = supabase
      .channel(`reactions-embed-${data.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lyric_dance_reactions",
          filter: `dance_id=eq.${data.id}`,
        },
        (payload: any) => {
          const { emoji, line_index } = payload.new;
          setReactionData((prev) => {
            const next = { ...prev };
            if (!next[emoji]) next[emoji] = { line: {}, total: 0 };
            next[emoji] = {
              ...next[emoji],
              total: next[emoji].total + 1,
              line: {
                ...next[emoji].line,
                ...(line_index != null
                  ? { [line_index]: (next[emoji].line[line_index] ?? 0) + 1 }
                  : {}),
              },
            };
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.id]);

  // ── Current time tracking ─────────────────────────────────────────
  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    let rafId = 0;
    const tick = () => {
      const t = audio.currentTime;

      if (engagementModeRef.current === "freezing") {
        const freezeAt = freezeAtSecRef.current ?? t;
        if (t >= freezeAt) {
          audio.pause();
          setCurrentTimeSec(Math.min(t, freezeAt));
          setEngagementMode("engaged");
          freezeAtSecRef.current = null;
          return;
        }
      }

      if (Math.abs(t - currentTimeSecRef.current) > 0.05) {
        currentTimeSecRef.current = t;
        setCurrentTimeSec(t);
      }
      if (engagementModeRef.current === "engaged") {
        rafId = 0;
        return;
      }
      if (!audio.paused && !document.hidden)
        rafId = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    if (!audio.paused) onPlay();
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [player]);

  useEffect(() => {
    engagementModeRef.current = engagementMode;
  }, [engagementMode]);

  // ── Song ended → open reaction panel ─────────────────────────────
  useEffect(() => {
    if (!player) return;
    const onEnded = () => setTimeout(() => openPanel(), 800);
    player.audio.addEventListener("ended", onEnded);
    return () => player.audio.removeEventListener("ended", onEnded);
  }, [player, openPanel]);

  // ── Derived values ────────────────────────────────────────────────
  const durationSec = useMemo(() => {
    const lines = data?.lyrics ?? [];
    if (!lines.length) return 0;
    return (lines[lines.length - 1] as any).end ?? 0;
  }, [data?.lyrics]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );

  const activeLine = useMemo(() => {
    if (!lyricSections.isReady) return null;
    const line =
      engagementMode === "engaged" && frozenLineIndex != null
        ? (lyricSections.allLines.find(
            (l) => l.lineIndex === frozenLineIndex,
          ) ?? null)
        : (lyricSections.allLines.find(
            (l) =>
              currentTimeSec >= l.startSec && currentTimeSec < l.endSec + 0.1,
          ) ?? null);
    if (!line) return null;
    const section =
      lyricSections.sections.find((s) =>
        s.lines.some((sl) => sl.lineIndex === line.lineIndex),
      ) ?? null;
    return {
      text: line.text,
      lineIndex: line.lineIndex,
      sectionLabel: section?.label ?? null,
    };
  }, [lyricSections, currentTimeSec, engagementMode, frozenLineIndex]);

  const audioSections = useMemo<CanonicalAudioSection[]>(() => {
    const sections = data?.cinematic_direction?.sections;
    if (!Array.isArray(sections) || !sections.length || !durationSec) return [];
    return sections
      .map((s: any, i: number): CanonicalAudioSection | null => {
        const start = Number(s?.startRatio);
        const end = Number(s?.endRatio);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        return {
          sectionIndex: Number.isFinite(Number(s?.sectionIndex))
            ? Number(s.sectionIndex)
            : i,
          startSec: start * durationSec,
          endSec: end * durationSec,
          role: s?.mood ?? null,
        };
      })
      .filter((s): s is CanonicalAudioSection => s != null);
  }, [data?.cinematic_direction?.sections, durationSec]);

  const palette = useMemo(
    () => (Array.isArray(data?.palette) ? (data!.palette as string[]) : []),
    [data?.palette],
  );

  const topReaction = useMemo(
    () => computeTopReaction(reactionData, data?.lyrics ?? []),
    [reactionData, data?.lyrics],
  );

  const isWaiting = loading || !fetchedData;

  // ── Engagement handlers ────────────────────────────────────────────
  const handleEngagementStart = useCallback(
    (targetLineIndex?: number) => {
      if (!player) return;
      if (engagementModeRef.current === "engaged") {
        if (targetLineIndex != null) setFrozenLineIndex(targetLineIndex);
        return;
      }
      const t = player.audio.currentTime;
      const liveLine = lyricSections.allLines.find(
        (l) => t >= l.startSec && t < l.endSec + 0.1,
      );
      if (targetLineIndex != null) setFrozenLineIndex(targetLineIndex);
      else if (liveLine) setFrozenLineIndex(liveLine.lineIndex);
      freezeAtSecRef.current = liveLine?.endSec ?? t;
      setEngagementMode("freezing");
    },
    [player, lyricSections.allLines],
  );

  const handlePanelClose = useCallback(() => {
    closePanel();
    freezeAtSecRef.current = null;
    setEngagementMode("spectator");
    setFrozenLineIndex(null);
    if (!player || player.audio.ended) return;
    try {
      player.play();
    } catch {}
  }, [player, closePanel]);

  const toggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!player) return;
      const next = !muted;
      player.setMuted(next);
      setMuted(next);
    },
    [muted, player],
  );

  // ── Progress tracking for playbar ─────────────────────────────────
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!player || !playerReady || !data?.lyrics) return;
    const audio = player.audio;
    const lines = data.lyrics;
    const songStart = Math.max(0, (lines[0] as any).start - 0.5);
    const songEnd = (lines[lines.length - 1] as any).end + 1;
    const dur = songEnd - songStart;
    let rafId = 0;
    let lastP = 0;
    const tick = () => {
      const p = Math.max(0, Math.min(1, (audio.currentTime - songStart) / dur));
      if (Math.abs(p - lastP) > 0.005) {
        lastP = p;
        setProgress(p);
      }
      if (!audio.paused) rafId = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    if (!audio.paused) onPlay();
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [player, playerReady, data?.lyrics]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#0a0a0a" }}
      onClick={(e) => {
        if (!effectiveShowCover && !isWaiting) toggleMute(e);
      }}
    >
      {/* Canvas — always rendered, player controls content */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <canvas
        ref={textCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {scorePill && (() => {
        const { total, replay_yes } = scorePill;
        const pct = total > 0 ? Math.round((replay_yes / total) * 100) : null;
        return (
          <div
            className="absolute top-2 right-2 z-[90] flex items-center gap-1.5 px-2 py-1 rounded-full pointer-events-none"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/70">
              {pct !== null ? `${pct}% REPLAY` : "CALIBRATING"}
            </span>
          </div>
        );
      })()}

      {/* Cover overlay */}
      <AnimatePresence>
        {(effectiveShowCover || isWaiting) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute inset-x-0 top-0"
            style={{ bottom: 60 }}
          >
            <LyricDanceCover
              songName={songTitle}
              waiting={isWaiting}
              badge="In Studio"
              onExpand={
                showExpandButton
                  ? () => window.open(lyricDanceUrl, "_blank")
                  : undefined
              }
              topReaction={topReaction}
              onListen={(e) => {
                e.stopPropagation();
                setShowCover(false);
                onPlay?.();
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

      {/* Top bar — song title + expand (when playing) */}
      {playerReady && !effectiveShowCover && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5">
            {songTitle}
          </span>
          {showExpandButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(lyricDanceUrl, "_blank");
              }}
              className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* Bottom bar — progress + now-playing chip + React button */}
      {(!reactionPanelOpen || (hideReactButton && votedSide != null)) && (
        <div
          className={`absolute bottom-0 left-0 right-0 ${reactionPanelOpen ? "z-[101]" : "z-[100]"}`}
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(12px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div
            className="w-full h-1 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)" }}
            onClick={(e) => {
              if (!player || !data?.lyrics) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              const lines = data.lyrics;
              const start = Math.max(0, (lines[0] as any).start - 0.5);
              const end = (lines[lines.length - 1] as any).end + 1;
              player.seek(start + ratio * (end - start));
            }}
          >
            <div
              className="h-full transition-none"
              style={{
                width: `${progress * 100}%`,
                background: palette[1] ?? "#a855f7",
                opacity: 0.6,
              }}
            />
          </div>

          {/* Single row — two-state */}
          <div className="flex items-stretch" onClick={e => e.stopPropagation()}>
            {hideReactButton && votedSide == null ? (
              /* Pre-vote: Run it back / Skip */
              <>
                <button
                  onClick={onVoteYes}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
                    Run it back
                  </span>
                </button>
                <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
                <button
                  onClick={onVoteNo}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
                    Skip
                  </span>
                </button>
              </>
            ) : hideReactButton && commentFocused ? (
              /* Post-vote comment focused: input + send arrow */
              <>
                <input
                  type="text"
                  value={canvasNote}
                  onChange={e => onCanvasNoteChange?.(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onCanvasSubmit?.();
                      setCommentFocused(false);
                    }
                    if (e.key === "Escape") setCommentFocused(false);
                  }}
                  onBlur={() => { if (!canvasNote) setCommentFocused(false); }}
                  placeholder="Signal locked · drop your take"
                  autoFocus
                  className="flex-1 bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/30 outline-none px-3 py-3 tracking-wide min-w-0"
                />
                <button
                  onClick={() => { onCanvasSubmit?.(); setCommentFocused(false); }}
                  className="flex items-center justify-center px-4 py-3 hover:bg-white/[0.04] transition-colors group shrink-0"
                >
                  <span className={`text-[13px] transition-colors ${
                    canvasNote ? "text-white/70 group-hover:text-white" : "text-white/20"
                  }`}>Send</span>
                </button>
              </>
            ) : hideReactButton ? (
              /* Post-vote default: lyric pill + React */
              <>
                <button
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left overflow-hidden min-w-0"
                  onClick={() => setCommentFocused(true)}
                >
                  {activeLine ? (
                    <>
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                        style={{ background: palette[1] ?? "#ffffff", opacity: 0.5 }}
                      />
                      <span className="text-[10px] font-mono text-white/30 truncate">
                        {activeLine.text}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] font-mono text-white/20 truncate">
                      {lyricSections.isReady ? "listening..." : "..."}
                    </span>
                  )}
                </button>
                <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
                <button
                  onClick={() => { onOpenReactions?.(); setCommentFocused(true); }}
                  className="flex items-center justify-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors group shrink-0"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/30 group-hover:text-white/60 transition-colors">
                    React
                  </span>
                </button>
              </>
            ) : (
              /* Standalone (not card mode): existing lyric pill + React button */
              <>
                <button
                  className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-md border text-left overflow-hidden min-w-0 mx-3 my-2 transition-all duration-300 ${
                    reactionPanelOpen ? "border-white/15" : "border-white/[0.05]"
                  }`}
                  style={{ background: "rgba(255,255,255,0.02)" }}
                  onClick={openPanel}
                >
                  {activeLine ? (
                    <>
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                        style={{ background: palette[1] ?? "#ffffff", opacity: 0.6 }}
                      />
                      <span className="text-[10px] font-mono text-white/30 truncate">{activeLine.text}</span>
                    </>
                  ) : (
                    <span className="text-[10px] font-mono text-white/20 truncate">
                      {lyricSections.isReady ? "listening..." : "..."}
                    </span>
                  )}
                </button>
                <button
                  onClick={openPanel}
                  className="flex items-center justify-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors group shrink-0"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/30 group-hover:text-white/60 transition-colors">
                    React
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reaction panel */}
      {!disableReactionPanel && (
        <ReactionPanel
          displayMode="embedded"
          isOpen={reactionPanelOpen}
          onClose={handlePanelClose}
          danceId={data?.id ?? ""}
          activeLine={activeLine}
          allLines={lyricSections.allLines}
          audioSections={audioSections}
          currentTimeSec={currentTimeSec}
          palette={palette}
          onSeekTo={(sec) => player?.seek(sec)}
          player={player}
          durationSec={durationSec}
          reactionData={reactionData}
          onReactionDataChange={setReactionData}
          onReactionFired={(emoji) => player?.fireComment(emoji)}
          engagementMode={engagementMode}
          frozenLineIndex={frozenLineIndex}
          onEngagementStart={handleEngagementStart}
          onResetEngagement={() => {
            setEngagementMode("spectator");
            setFrozenLineIndex(null);
            freezeAtSecRef.current = null;
          }}
        />
      )}
    </div>
  );
}
