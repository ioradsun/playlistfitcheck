import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useSyncExternalStore } from "react";
import { VolumeX } from "lucide-react";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import type { CardMode } from "@/components/lyric/PlayerHeader";
import { LyricModePanel } from "@/components/lyric/LyricModePanel";
import { EmpowermentModePanel } from "@/components/lyric/EmpowermentModePanel";
import { CardResultsPanel } from "@/components/lyric/CardResultsPanel";

import { emitFire, fetchFireData } from "@/lib/fire";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { audioController } from "@/lib/audioController";
import { isGlobalMuted } from "@/lib/globalMute";
import { isAudioUnlocked, unlockAudio } from "@/lib/reelsAudioUnlock";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface LyricDanceEmbedProps {
  lyricDanceId: string;
  songTitle: string;
  artistName?: string;
  prefetchedData?: LyricDanceData | null;
  visible?: boolean;
  regionStart?: number;
  regionEnd?: number;
  postId?: string;
  lyricDanceUrl?: string | null;
  spotifyTrackId?: string | null;
  spotifyArtistId?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
  preload?: boolean;
}

export interface LyricDanceEmbedHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
  reloadTranscript: (lines: any[], words?: any[]) => void;
}

export const LyricDanceEmbed = forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed({
  lyricDanceId,
  songTitle,
  artistName,
  prefetchedData,
  visible,
  regionStart,
  regionEnd,
  postId,
  lyricDanceUrl = null,
  spotifyTrackId,
  spotifyArtistId,
  avatarUrl,
  isVerified,
  userId,
  onProfileClick,
  preload = false,
}, ref) {
  const isFeedEmbed = visible !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;

  const [evicted, setEvicted] = useState(true);

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) {
      setEvicted(false);
      return;
    }
    setEvicted(!visible);
  }, [visible, isFeedEmbed, isBattleMode]);

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
    currentTimeSec,
    reactionData,
    durationSec,
    lyricSections,
    moments,
    activeLine,
  } = useLyricDanceCore({
    lyricDanceId,
    prefetchedData: prefetchedDataWithRegion,
    postId,
    usePool: isFeedEmbed,
    evicted,
  });

  const danceId: string = ((data ?? prefetchedData) as any)?.id ?? "";

  const audioState = useSyncExternalStore(
    audioController.subscribe,
    audioController.getSnapshot,
    audioController.getSnapshot,
  );
  const isPrimary = isFeedEmbed && audioState.effectivePrimaryId === postId;
  const feedMuted = isFeedEmbed ? audioState.muted : muted;

  useImperativeHandle(ref, () => ({
    getPlayer: () => player ?? null,
    reloadTranscript: (lines: any[], words?: any[]) => {
      player?.updateTranscript(lines, words ?? null);
    },
  }), [player]);

  const [closingVisible, setClosingVisible] = useState(false);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [activeMomentIdx, setActiveMomentIdx] = useState(0);
  const [cardMode, setCardMode] = useState<CardMode>("dance");

  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (visible) {
      player.scheduleFullModeUpgrade();
    }
  }, [player, playerReady, isFeedEmbed, visible]);

  // Preload audio when warm (adjacent to active) — don't wait for play().
  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (visible && preload) {
      player.primeAudio();
    }
  }, [player, playerReady, isFeedEmbed, visible, preload]);

  // Visibility → animation (the ONLY play/pause logic in the embed)
  useEffect(() => {
    if (!player || !playerReady) return;
    if (evicted) {
      player.pause();
    } else {
      player.play(false);
    }
  }, [player, playerReady, evicted]);

  // Register with audio controller while visible
  useEffect(() => {
    if (!player || !playerReady || !postId || !isFeedEmbed || !visible) return;
    audioController.register(postId, player);

    if (isAudioUnlocked()) {
      player.audio.muted = true;
      player.audio.play().catch(() => {});
    }

    return () => {
      audioController.clearExplicitIf(postId);
      audioController.unregister(postId);
    };
  }, [player, playerReady, postId, isFeedEmbed, visible]);

  useEffect(() => {
    if (muted) {
      setShowMuteIndicator(true);
      const timeout = setTimeout(() => setShowMuteIndicator(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [muted]);

  const handleCanvasTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    unlockAudio();

    if (!isFeedEmbed) {
      const next = !muted;
      player?.setMuted(next);
      if (!next) player?.play(true);
      setMuted(next);
      return;
    }

    audioController.primeAll();

    if (isPrimary) {
      audioController.toggleMute();
    } else {
      audioController.setExplicitPrimary(postId!);
      if (isGlobalMuted()) audioController.toggleMute();
    }
  }, [muted, player, postId, isFeedEmbed, isPrimary, setMuted]);

  useEffect(() => {
    if (!durationSec || !player) return;
    if (currentTimeSec > durationSec + 2.2 && !closingVisible) {
      setClosingVisible(true);
      player.audio.loop = false;
    }
  }, [currentTimeSec, durationSec, closingVisible, player]);

  const seekOnly = useCallback((timeSec: number) => {
    if (!moments.length) {
      setActiveMomentIdx(0);
      player?.seek(timeSec);
      return;
    }

    let idx = moments.findIndex(
      (m) => timeSec >= m.startSec && timeSec <= m.endSec,
    );

    if (idx === -1) {
      let closest = 0;
      let minDist = Infinity;
      moments.forEach((m, i) => {
        const d = Math.min(
          Math.abs(timeSec - m.startSec),
          Math.abs(timeSec - m.endSec),
        );
        if (d < minDist) { minDist = d; closest = i; }
      });
      idx = closest;
    }

    setActiveMomentIdx(idx);
    player?.seek(timeSec);
  }, [moments, player]);

  useEffect(() => {
    if (!player || !danceId) return;
    let cancelled = false;
    fetchFireData(danceId).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
    });
    return () => { cancelled = true; };
  }, [player, danceId]);

  useEffect(() => {
    return () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); };
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyArtistId={spotifyArtistId}
        showMenuButton={isFeedEmbed}
        isVerified={isVerified}
        userId={userId}
        onProfileClick={onProfileClick}
        cardMode={cardMode}
        onModeChange={setCardMode}
      />

      {/* ── Fixed-height content slot ── */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: "#0a0a0a" }}
        onClick={cardMode === "dance" ? handleCanvasTap : undefined}
      >
        {/* Dance mode — canvas + overlays, unchanged from today */}
        {cardMode === "dance" && (
          <>
            {!isFeedEmbed && (
              <>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
                <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2 }} />
              </>
            )}

            {((isFeedEmbed && isPrimary && feedMuted) || (!isFeedEmbed && muted)) && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", opacity: showMuteIndicator ? 0.8 : 0, transition: "opacity 0.3s ease", pointerEvents: "none", zIndex: 40 }}>
                <VolumeX size={20} color="white" />
              </div>
            )}

            <ClosingScreen
              visible={closingVisible}
              empowermentPromise={((data ?? prefetchedData) as any)?.empowerment_promise ?? null}
              danceId={danceId}
              source="feed"
              moments={moments}
              momentFireCounts={deriveMomentFireCounts(reactionData, moments)}
              activeMomentIdx={activeMomentIdx}
              onSeekToMoment={(idx) => {
                const m = moments[idx];
                if (m && player) {
                  setActiveMomentIdx(idx);
                  player.seek(m.startSec);
                  player.setRegion(m.startSec, m.endSec);
                }
              }}
              onLoopMoment={(idx) => {
                const m = moments[idx];
                if (m && player) {
                  setClosingVisible(false);
                  setActiveMomentIdx(idx);
                  player.seek(m.startSec);
                  player.setRegion(m.startSec, m.endSec);
                  player.play();
                }
              }}
            />

          </>
        )}

        {/* Lyric mode */}
        {cardMode === "lyric" && (
          <LyricModePanel
            danceId={danceId}
            sections={lyricSections.sections}
            allLines={lyricSections.allLines}
            reactionData={reactionData}
            currentTimeSec={currentTimeSec}
            onFireLine={(lineIndex, timeSec) => {
              if (!danceId) return;
              player?.fireFire(0);
              emitFire(danceId, lineIndex, timeSec, 0, "feed");
            }}
          />
        )}

        {/* Empowerment mode */}
        {cardMode === "empowerment" && (
          <EmpowermentModePanel
            danceId={danceId}
            empowermentPromise={((data ?? prefetchedData) as any)?.empowerment_promise ?? null}
          />
        )}

        {/* Results mode */}
        {cardMode === "results" && (
          <CardResultsPanel
            moments={moments}
            reactionData={reactionData}
            spotifyTrackId={spotifyTrackId ?? null}
            postId={postId ?? null}
            lyricDanceUrl={lyricDanceUrl ?? null}
          />
        )}
      </div>

      {/* LyricInteractionLayer — dance mode only, outside the canvas slot */}
      {!isBattleMode && cardMode === "dance" && (
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
          <LyricInteractionLayer
            moments={moments}
            reactionData={reactionData}
            player={player}
            currentTimeSec={currentTimeSec}
            closingActive={closingVisible}
            danceId={danceId}
            onFireTap={() => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              if (!danceId || !activeLine) return;
              player?.fireFire(0);
              emitFire(danceId, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "feed");
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
              if (!danceId || !activeLine) return;
              player?.fireFire(holdMs);
              emitFire(danceId, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs, "feed");
            }}
            onSeekTo={seekOnly}
          />
        </div>
      )}
    </div>
  );
});
