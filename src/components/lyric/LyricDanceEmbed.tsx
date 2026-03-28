/**
 * LyricDanceEmbed — Feed player (inline, reels, battle).
 * All shared player logic lives in useLyricDanceCore.
 * This file adds: feed visibility lifecycle, cardState, eviction, battle mode.
 */
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Volume2, VolumeX, RotateCcw, User } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import { LyricDanceProgressBar } from "@/components/lyric/LyricDanceProgressBar";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { emitFire, emitExposure, fetchFireData } from "@/lib/fire";
import type { CardState } from "@/components/songfit/useCardLifecycle";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

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

interface LyricDanceEmbedProps {
  lyricDanceId: string;
  lyricDanceUrl: string;
  songTitle: string;
  artistName?: string;
  coverImageUrl?: string | null;
  prefetchedData?: LyricDanceData | null;
  cardState?: CardState;
  onPlay?: () => void;
  regionStart?: number;
  regionEnd?: number;
  showExpandButton?: boolean;
  disableReactionPanel?: boolean;
  hideReactButton?: boolean;
  reelsMode?: boolean;
  postId?: string;
  externalPanelOpen?: boolean;
  onExternalPanelOpenChange?: (open: boolean) => void;
  autoPlay?: boolean;
  forceMuted?: boolean;
  onOpenReactions?: () => void;
  avatarUrl?: string | null;
  isVerified?: boolean;
  onProfileClick?: () => void;
}

export interface LyricDanceEmbedHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
}

export const LyricDanceEmbed = forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed({
  lyricDanceId,
  lyricDanceUrl,
  songTitle,
  artistName,
  coverImageUrl,
  prefetchedData,
  cardState,
  onPlay,
  regionStart,
  regionEnd,
  showExpandButton = true,
  disableReactionPanel = false,
  hideReactButton = false,
  reelsMode = false,
  postId,
  externalPanelOpen,
  onExternalPanelOpenChange,
  autoPlay = false,
  forceMuted = false,
  onOpenReactions,
  avatarUrl,
  isVerified,
  onProfileClick,
}, ref) {
  const isFeedEmbed = cardState !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;
  const siteCopy = useSiteCopy();
  const empowermentPromise = (prefetchedData as any)?.empowerment_promise ?? null;
  const fmlyHookEnabled = siteCopy.features?.fmly_hook === true;

  // For battle embeds: patch region_start/region_end onto a derived data copy
  // so LyricDancePlayer knows to window playback to the hook region.
  // Never mutates the shared prefetchedData object.
  const prefetchedDataWithRegion = useMemo(() => {
    if (!isBattleMode || !prefetchedData) return prefetchedData;
    return { ...prefetchedData, region_start: regionStart, region_end: regionEnd };
  }, [prefetchedData, isBattleMode, regionStart, regionEnd]);

  const {
    canvasRef,
    textCanvasRef,
    containerRef,
    player,
    playerReady,
    data,
    fetchedData,
    muted,
    setMuted,
    showCover,
    setShowCover,
    currentTimeSec,
    reactionPanelOpen,
    openPanel,
    closePanel,
    handlePanelClose,
    reactionData,
    setReactionData,
    durationSec,
    lyricSections,
    audioSections,
    activeLine,
    palette,
    votedSide,
    score,
    note,
    setNote,
    handleVote,
    toggleMute,
    handleReplay,
    handleListenNow,
    handlePauseForInput,
    handleResumeAfterInput,
    handleCommentFromBar,
    topReaction,
    isWaiting,
    commentRefreshKey,
    lightningBarEnabled,
  } = useLyricDanceCore({
    lyricDanceId,
    prefetchedData: prefetchedDataWithRegion,
    postId,
    autoPlay,
    onPlay,
  });

  useImperativeHandle(ref, () => ({ getPlayer: () => player ?? null }), [player]);


  const [visibility, setVisibility] = useState<VisibilityState>(
    isFeedEmbed ? "far" : "visible",
  );
  const [playerEvicted, setPlayerEvicted] = useState(false);
  const [forceDemoted, setForceDemoted] = useState(false);
  const [fireStrengthByLine, setFireStrengthByLine] = useState<Record<number, number>>({});
  const farTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActivatedRef = useRef(false);

  const isControlled = externalPanelOpen !== undefined;
  const handleClosePanelAndSync = useCallback(() => {
    handlePanelClose();
    if (isControlled) onExternalPanelOpenChange?.(false);
  }, [handlePanelClose, isControlled, onExternalPanelOpenChange]);
  const handleOpenReactions = useCallback(() => {
    if (hideReactButton) {
      onOpenReactions?.();
      return;
    }
    if (isControlled) onExternalPanelOpenChange?.(true);
    else openPanel();
    if (showCover) {
      userActivatedRef.current = true;
      onPlay?.();
    }
  }, [
    hideReactButton,
    onOpenReactions,
    isControlled,
    onExternalPanelOpenChange,
    openPanel,
    showCover,
    onPlay,
  ]);

  useEffect(() => {
    if (!isControlled) return;
    if (externalPanelOpen) openPanel();
    else closePanel();
  }, [isControlled, externalPanelOpen, openPanel, closePanel]);

  useEffect(() => {
    if (!isFeedEmbed || reelsMode) return;
    const el = containerRef.current;
    if (!el) return;
    visibilityListeners.set(el, setVisibility);
    getSharedIO().observe(el);
    return () => {
      visibilityListeners.delete(el);
      sharedIO?.unobserve(el);
    };
  }, [isFeedEmbed, reelsMode, containerRef]);

  // In reels mode, derive visibility from cardState instead of IO.
  // The windowing system is the source of truth; IO fires late on mount.
  useEffect(() => {
    if (!reelsMode || !isFeedEmbed) return;
    if (cardState === "warm" || cardState === "active") {
      setVisibility("visible");
    } else {
      setVisibility("far");
    }
  }, [reelsMode, isFeedEmbed, cardState]);

  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (reelsMode && (cardState === "warm" || cardState === "active")) {
      player.scheduleFullModeUpgrade();
      return;
    }
    if (visibility === "near" || visibility === "visible")
      player.scheduleFullModeUpgrade();
  }, [player, playerReady, visibility, isFeedEmbed, reelsMode, cardState]);

  // Full-mode upgrade for non-feed embeds now handled by useLyricDanceCore

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) return;
    if (visibility === "far") {
      if (!player && !playerReady) return;
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

  useEffect(() => {
    if (!isFeedEmbed || !lyricDanceId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ cardId?: string }>;
      if (ce.detail?.cardId !== lyricDanceId) return;
      userActivatedRef.current = false;
      setForceDemoted(true);
    };
    window.addEventListener("crowdfit:media-deactivate", handler);
    return () =>
      window.removeEventListener("crowdfit:media-deactivate", handler);
  }, [isFeedEmbed, lyricDanceId]);

  useEffect(() => {
    if (cardState === "active") setForceDemoted(false);
  }, [cardState]);

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) return;
    if (visibility === "far") {
      setShowCover(true);
      userActivatedRef.current = false;
      if (lyricDanceId) {
        window.dispatchEvent(
          new CustomEvent("crowdfit:media-deactivate", {
            detail: { cardId: lyricDanceId },
          }),
        );
      }
    }
  }, [visibility, isFeedEmbed, isBattleMode, lyricDanceId, setShowCover]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (isBattleMode) {
      if (cardState === "active") {
        player.play();
        player.setMuted(forceMuted);
        player.scheduleFullModeUpgrade();
        setMuted(forceMuted);
      } else {
        player.stopRendering?.();
        player.setMuted(true);
        setMuted(true);
      }
      return;
    }
    if (!isFeedEmbed) return;
    const coverUp = showCover;
    const isUserEngaged = cardState === "active" || userActivatedRef.current;
    if (reactionPanelOpen) return;
    const shouldUnmuted =
      !coverUp && isUserEngaged && visibility === "visible" && !forceDemoted;
    const shouldMuted = !coverUp && !isUserEngaged;
    if (shouldUnmuted) {
      player.play();
      player.setMuted(false);
      setMuted(false);
    } else if (shouldMuted || coverUp) {
      player.play();
      player.setMuted(true);
      setMuted(true);
    }
  }, [
    player,
    playerReady,
    cardState,
    forceMuted,
    visibility,
    forceDemoted,
    isFeedEmbed,
    isBattleMode,
    showCover,
    setMuted,
    reactionPanelOpen,
  ]);

  useEffect(() => {
    if (!reelsMode || !isFeedEmbed || cardState !== "active" || !showCover) return;
    setShowCover(false);
  }, [reelsMode, isFeedEmbed, cardState, showCover, setShowCover]);

  useEffect(() => {
    if (!player || !playerReady) return;
    player.setTextVerticalBias(0);
  }, [player, playerReady]);

  useEffect(() => {
    const id = (data ?? prefetchedData as any)?.id;
    if (!player || !id) return;
    fetchFireData(id).then((fires) => {
      player.setHistoricalFires(fires);
    });
  }, [player, (data ?? prefetchedData as any)?.id]);

  const activeLineFireCount = useMemo(() => {
    if (!activeLine) return 0;
    return fireStrengthByLine[activeLine.lineIndex] ?? 0;
  }, [activeLine, fireStrengthByLine]);

  const hookPhrase = ((data ?? prefetchedData) as any)?.hook_phrase ?? null;

  const effectiveShowCover = showCover;
  void artistName;
  void playerEvicted;

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        onClick={(e) => {
          if (!effectiveShowCover && !isWaiting) toggleMute(e);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <canvas
          ref={textCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {!isBattleMode && (
          <AnimatePresence>
            {(effectiveShowCover || isWaiting) && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <LyricDanceCover
                  songName={songTitle}
                  waiting={isWaiting}
                  coverImageUrl={fetchedData?.section_images?.[0] ?? coverImageUrl}
                  hideBackground={playerReady}
                  badge={null}
                  onListen={(e) => {
                    userActivatedRef.current = true;
                    handleListenNow(e);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {!isBattleMode && playerReady && (
          <div
            className="absolute top-0 left-0 right-0 z-[510] flex items-center justify-between p-2 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <span />
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded px-1 py-0.5 pointer-events-auto">
              <button
                onClick={toggleMute}
                className="p-1 text-white/40 hover:text-white/70 transition-colors"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                onClick={handleReplay}
                className="p-1 text-white/40 hover:text-white/70 transition-colors"
                aria-label="Replay"
              >
                <RotateCcw size={14} />
              </button>
              {showExpandButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(lyricDanceUrl, "_blank");
                  }}
                  className="p-1 text-white/40 hover:text-white/70 transition-colors"
                  aria-label="Expand"
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!isBattleMode && !reactionPanelOpen && (
        <div
          className="w-full flex-shrink-0"
          style={{ background: "#0a0a0a" }}
          onClick={(e) => e.stopPropagation()}
        >
          {reelsMode && artistName && effectiveShowCover && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div
                className="relative shrink-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick?.();
                }}
              >
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={13} className="text-white/40" />
                  )}
                </div>
                {isVerified && (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <VerifiedBadge size={11} />
                  </span>
                )}
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 min-w-0 truncate max-w-[60vw]">
                {`In Studio · ${artistName}`}
              </span>
            </div>
          )}

          {!effectiveShowCover && !isWaiting && playerReady && data && !lightningBarEnabled && (
            <LyricDanceProgressBar
              player={player}
              data={data}
              onSeekStart={() => {}}
              onSeekEnd={() => {}}
              palette={palette.length ? palette : ["#ffffff", "#ffffff", "#ffffff"]}
            />
          )}

          <CardBottomBar
            variant={reelsMode ? "fullscreen" : "embedded"}
            votedSide={votedSide}
            score={score}
            note={note}
            onNoteChange={setNote}
            onVoteYes={() => handleVote(true)}
            onVoteNo={() => handleVote(false)}
            onSubmit={handleCommentFromBar}
            onOpenReactions={handleOpenReactions}
            onClose={handleClosePanelAndSync}
            panelOpen={reactionPanelOpen}
            onFireTap={() => {
              const id = (data ?? prefetchedData as any)?.id;
              if (!id || !activeLine) return;
              player?.fireFire(0);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0);
              setFireStrengthByLine((prev) => ({
                ...prev,
                [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + 1,
              }));
            }}
            onFireHoldStart={() => {
              /* nothing — visual handled by FireButton */
            }}
            onFireHoldEnd={(holdMs) => {
              const id = (data ?? prefetchedData as any)?.id;
              if (!id || !activeLine) return;
              player?.fireFire(holdMs);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs);
              const weight = holdMs < 300 ? 1 : holdMs < 1000 ? 2 : holdMs < 3000 ? 4 : 8;
              setFireStrengthByLine((prev) => ({
                ...prev,
                [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + weight,
              }));
            }}
            activeLineFireCount={activeLineFireCount}
            hookPhrase={hookPhrase}
            activeLineText={activeLine?.text ?? null}
            topReaction={
              topReaction
                ? { symbol: topReaction.symbol, count: topReaction.count }
                : null
            }
            trackTitle={songTitle}
          />
        </div>
      )}

      {!disableReactionPanel && (
        <ReactionPanel
          displayMode={reelsMode ? "fullscreen" : "embedded"}
          isOpen={reactionPanelOpen}
          refreshKey={commentRefreshKey}
          onClose={handleClosePanelAndSync}
          onCloseWithPosition={(timeSec) => {
            if (player && timeSec != null) {
              player.seek(timeSec);
              player.setMuted(false);
              player.play();
            }
            setMuted(false);
          }}
          votedSide={votedSide}
          score={score}
          onVoteYes={() => handleVote(true)}
          onVoteNo={() => handleVote(false)}
          danceId={data?.id ?? ""}
          activeLine={muted ? null : activeLine}
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
          onPause={handlePauseForInput}
          onResume={handleResumeAfterInput}
          onFireLine={(lineIndex, holdMs) => {
            const id = (data ?? (prefetchedData as any))?.id;
            if (!id) return;
            player?.fireFire(holdMs);
            emitFire(id, lineIndex, player?.audio.currentTime ?? 0, holdMs);
          }}
          onLineVisible={(lineIndex) => {
            const id = (data ?? (prefetchedData as any))?.id;
            if (!id) return;
            emitExposure(id, lineIndex);
          }}
          empowermentPromise={empowermentPromise}
          fmlyHookEnabled={fmlyHookEnabled}
        />
      )}
    </div>
  );
});
