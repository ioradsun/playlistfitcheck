/**
 * LyricDanceEmbed — Feed player (inline, reels, battle).
 * All shared player logic lives in useLyricDanceCore.
 *
 * Lifecycle (cardState + preload):
 *   cold              → evict player after 300ms debounce
 *   warm + no preload → evicted (React cover only, zero GPU cost)
 *   warm + preload    → player behind cover, scene pre-bakes
 *                       Reels: plays muted (RAF running, scene visually alive)
 *                       Standard: paused (no RAF, scene compiles on CPU only)
 *   active            → unmuted, playing
 */
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Volume2, VolumeX, RotateCcw, User } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { LyricDanceProgressBar } from "@/components/lyric/LyricDanceProgressBar";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { ReelsGestureLayer } from "./ReelsGestureLayer";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { emitFire, emitExposure, fetchFireData } from "@/lib/fire";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { isAudioUnlocked, onAudioUnlocked, unlockAudio } from "@/lib/reelsAudioUnlock";
import type { CardState } from "@/components/songfit/useCardLifecycle";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

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
  /** When true, this card is at viewport center — create the player behind the cover
   *  so the scene is pre-baked when the user taps Listen Now. */
  preload?: boolean;
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
  preload = false,
}, ref) {
  const isFeedEmbed = cardState !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;
  const siteCopy = useSiteCopy();
  const empowermentPromise = (prefetchedData as any)?.empowerment_promise ?? null;
  const fmlyHookEnabled = siteCopy.features?.fmly_hook === true;

  // ── Eviction: controls whether a player exists ─────────────────────
  // Warm/active cards keep a player; cold cards evict after a short debounce.
  // The canvas pool itself caps total concurrent players.
  //
  // Non-feed embeds (shareable, FitTab) never evict.
  const [evicted, setEvicted] = useState(true);
  const [reelsPaused, setReelsPaused] = useState(false);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) {
      setEvicted(false);
      return;
    }

    if (cardState === "active") {
      // User tapped play → create immediately, no debounce
      if (warmTimerRef.current) { clearTimeout(warmTimerRef.current); warmTimerRef.current = null; }
      if (evicted) setEvicted(false);
    } else if (cardState === "cold") {
      // Offscreen → destroy immediately, free pool slot for the next card
      if (warmTimerRef.current) { clearTimeout(warmTimerRef.current); warmTimerRef.current = null; }
      if (!evicted) setEvicted(true);
    } else {
      if (reelsMode) {
        // Reels: create immediately — snap scroll = only 1-2 warm cards at once
        if (evicted) setEvicted(false);
      } else {
        // Standard: debounce so fast-scroll cards don't create players
        if (warmTimerRef.current) return;
        if (!evicted) return;
        warmTimerRef.current = setTimeout(() => {
          warmTimerRef.current = null;
          setEvicted(false);
        }, 200);
      }
    }

    return () => {
      if (warmTimerRef.current) {
        clearTimeout(warmTimerRef.current);
        warmTimerRef.current = null;
      }
    };
  }, [cardState, isFeedEmbed, isBattleMode, evicted, reelsMode]);

  // Patch region onto prefetchedData for battle mode
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
    muted,
    setMuted,
    showCover,
    setShowCover,
    currentTimeSec,
    reactionData,
    setReactionData,
    durationSec,
    lyricSections,
    audioSections,
    activeLine,
    palette,
    toggleMute,
    handleReplay,
    handleListenNow,
    handlePauseForInput,
    handleResumeAfterInput,
    isWaiting,
    commentRefreshKey,
    lightningBarEnabled,
    handleCommentFromBar,
  } = useLyricDanceCore({
    lyricDanceId,
    prefetchedData: prefetchedDataWithRegion,
    postId,
    autoPlay,
    onPlay,
    usePool: isFeedEmbed,
    evicted,
  });

  useImperativeHandle(ref, () => ({ getPlayer: () => player ?? null }), [player]);

  const [forceDemoted, setForceDemoted] = useState(false);
  const [, setFireStrengthByLine] = useState<Record<number, number>>({});
  const [firedSections, setFiredSections] = useState<Set<number>>(new Set());
  const [closingVisible, setClosingVisible] = useState(false);
  const [, setClosingAnswered] = useState(false);
  const [totalFireCount, setTotalFireCount] = useState(0);
  const [lastFiredAt, setLastFiredAt] = useState<string | null>(null);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userActivatedRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(externalPanelOpen ?? false);

  useEffect(() => {
    if (externalPanelOpen !== undefined) setPanelOpen(externalPanelOpen);
  }, [externalPanelOpen]);

  const handlePanelOpenChange = useCallback((open: boolean) => {
    if (open && hideReactButton) {
      onOpenReactions?.();
      setPanelOpen(false);
      onExternalPanelOpenChange?.(false);
      return;
    }
    setPanelOpen(open);
    onExternalPanelOpenChange?.(open);
    if (open && showCover) {
      userActivatedRef.current = true;
      onPlay?.();
    }
  }, [hideReactButton, onOpenReactions, onExternalPanelOpenChange, onPlay, showCover]);

  // ── Full-mode upgrade: when player is ready and card is warm/active ──
  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (cardState === "warm" || cardState === "active") {
      player.scheduleFullModeUpgrade();
    }
  }, [player, playerReady, isFeedEmbed, cardState]);

  // ── Media deactivate listener ──────────────────────────────────────
  useEffect(() => {
    if (!isFeedEmbed || !postId) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ cardId?: string }>;
      if (ce.detail?.cardId !== postId) return;
      userActivatedRef.current = false;
      setForceDemoted(true);
    };
    window.addEventListener("crowdfit:media-deactivate", handler);
    return () => window.removeEventListener("crowdfit:media-deactivate", handler);
  }, [isFeedEmbed, postId]);

  useEffect(() => {
    if (cardState === "active") setForceDemoted(false);
  }, [cardState]);

  // ── Reset cover + deactivate when card leaves active ───────────────
  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) return;
    if (cardState === "cold") {
      setShowCover(true);
      userActivatedRef.current = false;
      if (postId) {
        window.dispatchEvent(new CustomEvent("crowdfit:media-deactivate", {
          detail: { cardId: postId },
        }));
      }
    } else if (reelsMode && cardState === "warm") {
      // Reels: restore cover when swiped away (warm = adjacent card).
      // Next time this card enters center, the auto-dismiss effect
      // will clear the cover if audio is already unlocked.
      setShowCover(true);
      userActivatedRef.current = false;
    }
  }, [cardState, isFeedEmbed, isBattleMode, lyricDanceId, setShowCover, reelsMode]);

  // ── Audio / mute driven purely by cardState ────────────────────────
  useEffect(() => {
    if (!player || !playerReady) return;
    if (isBattleMode) {
      if (cardState === "active") {
        player.setCoverMode(false);
        player.play();
        player.setMuted(forceMuted);
        player.scheduleFullModeUpgrade();
        setMuted(forceMuted);
      } else {
        player.setCoverMode(false);
        player.stopRendering?.();
        player.setMuted(true);
        setMuted(true);
      }
      return;
    }
    // ── Reels mode ──
    if (reelsMode && isFeedEmbed) {
      if (cardState === "active" && !reelsPaused) {
        player.setCoverMode(false);
        player.play();
        // Unmute only if user has provided a gesture (cover tap or previous card)
        if (isAudioUnlocked()) {
          player.setMuted(false);
          setMuted(false);
        } else {
          // No gesture yet — play muted, cover is still showing for gesture
          player.setMuted(true);
          setMuted(true);
        }
      } else {
        player.setMuted(true);
        setMuted(true);
        if (cardState === "cold" || reelsPaused) {
          player.pause();
        }
      }
      return;
    }
    if (!isFeedEmbed) return;
    const coverUp = showCover;
    const isUserEngaged = cardState === "active" || userActivatedRef.current;
    if (panelOpen) return;
    const shouldUnmuted = !coverUp && isUserEngaged && cardState !== "cold" && !forceDemoted;
    const shouldMuted = !coverUp && !isUserEngaged;
    if (shouldUnmuted) {
      player.setCoverMode(false);
      player.play();
      player.setMuted(false);
      setMuted(false);
    } else if (shouldMuted) {
      // Cover is down, user hasn't engaged — play muted so scene renders
      player.setCoverMode(false);
      player.play();
      player.setMuted(true);
      setMuted(true);
    } else if (coverUp) {
      // Play muted behind cover — canvas is the preview.
      // Engine throttles to half frame rate in cover mode.
      player.setCoverMode(true);
      player.play();
      player.setMuted(true);
      setMuted(true);
    }
  }, [player, playerReady, cardState, forceMuted, forceDemoted, isFeedEmbed, isBattleMode, showCover, setMuted, panelOpen, reelsMode, reelsPaused]);

  // ── Reels: auto-dismiss cover when audio is already unlocked ──
  // First card: cover stays (user must tap to unlock audio)
  // Card 2+: audio already unlocked → dismiss cover immediately → auto-play
  useEffect(() => {
    if (!reelsMode || !isFeedEmbed) return;
    if (cardState === "active" && showCover && isAudioUnlocked()) {
      setShowCover(false);
    }
  }, [reelsMode, isFeedEmbed, cardState, showCover, setShowCover]);

  // Listen for global audio unlock (user tapped cover on another card)
  // → dismiss this card's cover if it's active
  useEffect(() => {
    if (!reelsMode || !isFeedEmbed || cardState !== "active" || !showCover) return;
    return onAudioUnlocked(() => {
      setShowCover(false);
    });
  }, [reelsMode, isFeedEmbed, cardState, showCover, setShowCover]);

  useEffect(() => {
    if (!player || !playerReady) return;
    player.setTextVerticalBias(0);
  }, [player, playerReady]);

  // ── Closing screen ─────────────────────────────────────────────────
  useEffect(() => {
    if (!durationSec || !player) return;
    // Don't trigger while cover is up — audio is playing behind scrim, not "ended"
    if (showCover) return;
    // Show closing screen ~2.2s after song ends (after shatter animation)
    if (currentTimeSec > durationSec + 2.2 && !closingVisible) {
      setClosingVisible(true);
      // Stop the audio — no looping back to start.
      // The closing screen is the end state until user seeks or replays.
      player.audio.loop = false;
      player.pause();
    }
  }, [currentTimeSec, durationSec, closingVisible, player, showCover]);

  // ── Dismiss closing screen on replay or seek ───────────────────────
  const dismissClosingAndReplay = useCallback(() => {
    setClosingVisible(false);
    setClosingAnswered(false);
    if (player) player.audio.loop = false;
    handleReplay();
  }, [handleReplay, player]);

  const dismissClosingAndSeek = useCallback((timeSec: number) => {
    if (closingVisible) {
      setClosingVisible(false);
      setClosingAnswered(false);
    }
    player?.seek(timeSec);
    player?.play();
    player?.setMuted(false);
    setMuted(false);
  }, [closingVisible, player, setMuted]);

  // ── Fire data ──────────────────────────────────────────────────────
  useEffect(() => {
    const id = (data ?? prefetchedData as any)?.id;
    if (!player || !id) return;
    let cancelled = false;
    fetchFireData(id).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
      setTotalFireCount(fires.length);
      if (fires.length > 0) {
        const latest = fires.reduce((a, b) =>
          (a.created_at ?? "") > (b.created_at ?? "") ? a : b,
        );
        setLastFiredAt(latest.created_at ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [player, (data ?? prefetchedData as any)?.id]);

  const activeSectionIndex = useMemo(() => {
    if (!audioSections.length) return 0;
    const idx = audioSections.findIndex(
      (s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec,
    );
    return idx >= 0 ? idx : 0;
  }, [currentTimeSec, audioSections]);

  const moments = useMemo<Moment[]>(() => {
    const phrases = (data as any)?.cinematic_direction?.phrases ?? [];
    const phraseInputs = phrases.map((p: any) => {
      const isMs = p.start > 500;
      return {
        start: isMs ? p.start / 1000 : p.start,
        end: isMs ? p.end / 1000 : p.end,
        text: p.text ?? "",
      };
    });
    return buildMoments(phraseInputs, audioSections, lyricSections.allLines, durationSec);
  }, [data, prefetchedData, audioSections, lyricSections.allLines, durationSec]);

  const currentMoment = useMemo(() => {
    const m = moments.find(
      (moment) => currentTimeSec >= moment.startSec && currentTimeSec < moment.endSec,
    );
    if (!m) return null;
    // Join all lines in this moment into one continuous string for the ticker
    const fullText = m.lines.map((l) => l.text).join("  ·  ");
    return {
      index: m.index,
      total: moments.length,
      label: m.label,
      text: fullText,
      startSec: m.startSec,
      endSec: m.endSec,
    };
  }, [moments, currentTimeSec]);

  const barAccent = useMemo(() => {
    const autoPalettes = (data ?? (prefetchedData as any))?.auto_palettes;
    if (Array.isArray(autoPalettes) && autoPalettes[activeSectionIndex]) {
      const p = autoPalettes[activeSectionIndex] as string[];
      return p[3] ?? p[1] ?? p[0] ?? "rgba(255,140,50,1)";
    }
    return palette[1] ?? palette[0] ?? "rgba(255,140,50,1)";
  }, [data, prefetchedData, activeSectionIndex, palette]);

  const hasFired = firedSections.has(activeSectionIndex);
  const markFired = useCallback(() => {
    setFiredSections((prev) => new Set([...prev, activeSectionIndex]));
  }, [activeSectionIndex]);

  const effectiveShowCover = showCover;
  void artistName;
  void coverImageUrl;
  void disableReactionPanel;
  void preload;

  useEffect(() => {
    return () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); };
  }, []);

  // ── Reels gesture callbacks (active AFTER cover dismisses) ──
  const handleReelsSeekBack = useCallback(() => {
    if (!player) return;
    const t = Math.max(0, player.audio.currentTime - 5);
    dismissClosingAndSeek(t);
  }, [player, dismissClosingAndSeek]);

  const handleReelsSeekForward = useCallback(() => {
    if (!player) return;
    const t = Math.min(player.audio.duration || 999, player.audio.currentTime + 5);
    dismissClosingAndSeek(t);
  }, [player, dismissClosingAndSeek]);

  const handleReelsTogglePlayPause = useCallback(() => {
    if (!player) return;
    // If closing screen is up, center tap = replay
    if (closingVisible) {
      dismissClosingAndReplay();
      return;
    }
    if (reelsPaused) {
      setReelsPaused(false);
      player.play();
      player.setMuted(false);
      setMuted(false);
    } else {
      setReelsPaused(true);
      player.pause();
    }
  }, [player, reelsPaused, setMuted, closingVisible, dismissClosingAndReplay]);

  // Reset pause when card deactivates
  useEffect(() => {
    if (!reelsMode || !isFeedEmbed) return;
    if (cardState !== "active") setReelsPaused(false);
  }, [reelsMode, isFeedEmbed, cardState]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        onClick={reelsMode ? undefined : (e) => { if (!effectiveShowCover && !isWaiting) toggleMute(e); }}
      >
        {/* Static canvases — only for non-pooled (shareable/FitTab) */}
        {!isFeedEmbed && (
          <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
            <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2 }} />
          </>
        )}

        {/* Reels: gesture layer for seek/pause (only when cover is dismissed) */}
        {reelsMode && isFeedEmbed && !effectiveShowCover && !isWaiting && (
          <ReelsGestureLayer
            onSeekBack={handleReelsSeekBack}
            onSeekForward={handleReelsSeekForward}
            onTogglePlayPause={handleReelsTogglePlayPause}
          >
            {reelsPaused && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/40 backdrop-blur-sm rounded-full p-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" opacity="0.6">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </div>
              </div>
            )}
          </ReelsGestureLayer>
        )}

        <ClosingScreen
          visible={closingVisible && !panelOpen && !effectiveShowCover}
          empowermentPromise={empowermentPromise}
          danceId={((data ?? prefetchedData) as any)?.id ?? ""}
          onAnswer={() => setClosingAnswered(true)}
          onReplay={dismissClosingAndReplay}
          source="feed"
        />

        {!isBattleMode && (
          <AnimatePresence>
            {reelsMode && isAudioUnlocked() ? (
              /* Reels + audio unlocked: show spinner while loading, no cover */
              !playerReady && isFeedEmbed && (
                <motion.div
                  key="reels-loader"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ zIndex: 30, background: "#0a0a0a" }}
                >
                  <div
                    className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin"
                  />
                </motion.div>
              )
            ) : (
              (effectiveShowCover || isWaiting) && (
                <motion.div
                  key="standard-cover"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="absolute inset-0"
                  style={{ zIndex: 30 }}
                >
                  <LyricDanceCover
                    songName={songTitle}
                    waiting={isWaiting}
                    hideBackground={playerReady}
                    badge={null}
                    onListen={(e) => {
                      userActivatedRef.current = true;
                      unlockAudio(); // User gesture context → unlock browser audio policy
                      handleListenNow(e);
                    }}
                  />
                </motion.div>
              )
            )}
          </AnimatePresence>
        )}

        {!isBattleMode && playerReady && !reelsMode && (
          <div
            className="absolute top-0 left-0 right-0 z-[510] flex items-center justify-between p-2 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <span />
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded px-1 py-0.5 pointer-events-auto">
              <button onClick={toggleMute} className="p-1 text-white/40 hover:text-white/70 transition-colors" aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button onClick={dismissClosingAndReplay} className="p-1 text-white/40 hover:text-white/70 transition-colors" aria-label="Replay">
                <RotateCcw size={14} />
              </button>
              {showExpandButton && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(lyricDanceUrl, "_blank"); }}
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

      {!isBattleMode && (
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
          {reelsMode && artistName && (effectiveShowCover || !playerReady) && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="relative shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); onProfileClick?.(); }}>
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={13} className="text-white/40" />
                  )}
                </div>
                {isVerified && (
                  <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge size={11} /></span>
                )}
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 min-w-0 truncate max-w-[60vw]">
                {`In Studio · ${artistName}`}
              </span>
            </div>
          )}

          {!effectiveShowCover && !isWaiting && playerReady && data && !lightningBarEnabled && !closingVisible && (
            <LyricDanceProgressBar
              player={player}
              data={data}
              onSeekStart={() => {}}
              onSeekEnd={() => {}}
              palette={palette.length ? palette : ["#ffffff", "#ffffff", "#ffffff"]}
            />
          )}

          <LyricInteractionLayer
            variant={reelsMode ? "fullscreen" : "embedded"}
            danceId={data?.id ?? ""}
            currentMoment={currentMoment}
            activeLine={muted ? null : activeLine}
            allLines={lyricSections.allLines}
            audioSections={audioSections}
            phrases={(data as any)?.cinematic_direction?.phrases ?? null}
            words={(data as any)?.words ?? null}
            beatGrid={(data as any)?.beat_grid ?? null}
            currentTimeSec={currentTimeSec}
            durationSec={durationSec}
            palette={palette}
            accent={barAccent}
            reactionData={reactionData}
            onReactionDataChange={setReactionData}
            empowermentPromise={empowermentPromise}
            fmlyHookEnabled={fmlyHookEnabled}
            refreshKey={commentRefreshKey}
            isLive={!effectiveShowCover && cardState === "active"}
            muted={muted}
            hasFired={hasFired}
            totalFireCount={totalFireCount}
            lastFiredAt={lastFiredAt}
            songEnded={closingVisible}
            player={player}
            externalPanelOpen={panelOpen}
            onPanelOpenChange={handlePanelOpenChange}
            onFireTap={() => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              const id = (data ?? prefetchedData as any)?.id;
              if (!id || !activeLine) return;
              player?.fireFire(0);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "feed");
              setFireStrengthByLine((prev) => ({ ...prev, [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + 1 }));
              markFired();
            }}
            onFireHoldStart={() => {
              if (holdFireIntervalRef.current) return;
              holdFireIntervalRef.current = setInterval(() => { player?.fireFire(0); }, 300);
            }}
            onFireHoldEnd={(holdMs) => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              const id = (data ?? (prefetchedData as any))?.id;
              if (!id || !activeLine) return;
              player?.fireFire(holdMs);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs, "feed");
              const weight = holdMs < 300 ? 1 : holdMs < 1000 ? 2 : holdMs < 3000 ? 4 : 8;
              setFireStrengthByLine((prev) => ({ ...prev, [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + weight }));
              markFired();
            }}
            onComment={(text, momentIndex) => handleCommentFromBar(text, momentIndex)}
            onFireLine={(lineIndex, holdMs) => {
              const id = (data ?? (prefetchedData as any))?.id;
              if (!id) return;
              player?.fireFire(holdMs);
              emitFire(id, lineIndex, player?.audio.currentTime ?? 0, holdMs, "feed");
              markFired();
            }}
            onLineVisible={(lineIndex) => {
              const id = (data ?? (prefetchedData as any))?.id;
              if (!id) return;
              emitExposure(id, lineIndex, "feed");
            }}
            onReactionFired={(emoji) => player?.fireComment(emoji)}
            onPause={handlePauseForInput}
            onResume={handleResumeAfterInput}
            onSeekTo={(sec) => player?.seek(sec)}
            source="feed"
          />
        </div>
      )}
    </div>
  );
});
