import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useSyncExternalStore } from "react";
import { VolumeX } from "lucide-react";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import type { CardMode } from "@/components/lyric/PlayerHeader";
import { LyricModePanel } from "@/components/lyric/LyricModePanel";
import { EmpowermentModePanel } from "@/components/lyric/EmpowermentModePanel";
import { CardResultsPanel } from "@/components/lyric/CardResultsPanel";

import { emitFire, fetchFireData, upsertPlay } from "@/lib/fire";
import { audioController } from "@/lib/audioController";
import { primeAudioPool } from "@/lib/audioPool";
import { isGlobalMuted } from "@/lib/globalMute";
import { isAudioUnlocked, unlockAudio } from "@/lib/reelsAudioUnlock";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface LyricDanceEmbedProps {
  lyricDanceId: string;
  songTitle: string;
  artistName?: string;
  prefetchedData?: LyricDanceData | null;
  visible?: boolean;
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
  wickBarEnabled: boolean;
}

export const LyricDanceEmbed = forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed({
  lyricDanceId,
  songTitle,
  artistName,
  prefetchedData,
  visible,
  postId,
  lyricDanceUrl = null,
  spotifyTrackId,
  spotifyArtistId,
  avatarUrl,
  isVerified,
  userId,
  onProfileClick,
}, ref) {
  const isFeedEmbed = visible !== undefined;
  const evicted = isFeedEmbed ? !visible : false;


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
    moments,
    activeLine,
  } = useLyricDanceCore({
    lyricDanceId,
    prefetchedData,
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
    get wickBarEnabled() {
      return player?.wickBarEnabled ?? false;
    },
    set wickBarEnabled(enabled: boolean) {
      if (player) player.wickBarEnabled = enabled;
    },
  }), [player]);

  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [activeMomentIdx, setActiveMomentIdx] = useState(0);
  const [cardMode, setCardMode] = useState<CardMode>("dance");
  const [hasUnlocked, setHasUnlocked] = useState(false);

  const playStartRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number>(0);
  const everUnmutedRef = useRef<boolean>(false);
  const maxProgressRef = useRef<number>(0);
  const playCountRef = useRef<number>(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Player warm-up ───────────────────────────────────────────
  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (visible) {
      player.scheduleFullModeUpgrade();
      player.primeAudio();
    }
  }, [player, playerReady, isFeedEmbed, visible]);

  // ── Playback lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (!player || !playerReady) return;

    // Evicted cards: stop everything
    if (evicted) {
      player.pause();
      return;
    }

    // Active: start animation (muted — audioController handles unmute)
    player.play(false);

    // Feed embed: register with audioController for coordinated audio
    if (!postId || !isFeedEmbed || !visible) return;
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

  // ── Audio interruption recovery (iOS phone calls, Siri, alarms) ──
  useEffect(() => {
    if (!player || !isFeedEmbed || !visible) return;

    const audio = player.audio;

    const handleVisReturn = () => {
      if (document.hidden) return;
      // If we're primary and audio was interrupted, resume
      if (isPrimary && audio.paused && player.playing) {
        audio.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleVisReturn);
    };
  }, [player, isFeedEmbed, visible, isPrimary]);

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
      if (!hasUnlocked) {
        setHasUnlocked(true);
        player?.setMuted(false);
        player?.play(true);
        setMuted(false);
        return;
      }
      const next = !muted;
      player?.setMuted(next);
      if (!next) player?.play(true);
      setMuted(next);
      return;
    }

    primeAudioPool();

    if (isPrimary) {
      audioController.toggleMute();
    } else {
      audioController.setExplicitPrimary(postId!);
      if (isGlobalMuted()) audioController.toggleMute();
    }
  }, [hasUnlocked, muted, player, postId, isFeedEmbed, isPrimary, setMuted]);

  useEffect(() => {
    if (!durationSec || !player) return;
    if (currentTimeSec > durationSec + 2.2 && cardMode === "dance") {
      setCardMode("empowerment");
    }
  }, [currentTimeSec, durationSec, cardMode, player]);

  // ── Card mode lifecycle ──────────────────────────────────────
  useEffect(() => {
    if (!player) return;

    const isDance = cardMode === "dance";

    // Canvas visibility
    if (containerRef.current) {
      const canvases = containerRef.current.querySelectorAll("canvas");
      canvases.forEach((c) => {
        c.style.visibility = isDance ? "visible" : "hidden";
        c.style.pointerEvents = "none";
      });
    }

    // Audio lifecycle per mode
    if (cardMode === "empowerment") {
      player.setMuted(true);
      player.audio.loop = false;
      if (panelPlayTimerRef.current) {
        clearTimeout(panelPlayTimerRef.current);
        panelPlayTimerRef.current = null;
      }
      return;
    }
    if (!isDance) {
      player.setMuted(true);
      if (panelPlayTimerRef.current) {
        clearTimeout(panelPlayTimerRef.current);
        panelPlayTimerRef.current = null;
      }
      return;
    }
    // dance mode: restore
    player.setMuted(true);
    player.setRegion(undefined, undefined);
    player.audio.loop = true;
  }, [cardMode, player, containerRef]);

  const flushPlay = useCallback(() => {
    if (!danceId || !durationSec) return;
    const currentTime = player?.audio?.currentTime ?? 0;
    const progressPct = durationSec > 0
      ? (currentTime / durationSec) * 100
      : 0;
    maxProgressRef.current = Math.max(maxProgressRef.current, progressPct);
    upsertPlay(danceId, {
      progressPct: maxProgressRef.current,
      wasMuted: !everUnmutedRef.current,
      durationSec: totalDurationRef.current,
      playCount: playCountRef.current,
      userId: userId ?? null,
    });
  }, [danceId, durationSec, player, userId]);

  useEffect(() => {
    if (!visible || !danceId || !isFeedEmbed) return;

    playCountRef.current += 1;
    playStartRef.current = Date.now();

    flushIntervalRef.current = setInterval(() => {
      if (playStartRef.current !== null) {
        totalDurationRef.current += (Date.now() - playStartRef.current) / 1000;
        playStartRef.current = Date.now();
      }
      flushPlay();
    }, 10_000);

    return () => {
      if (playStartRef.current !== null) {
        totalDurationRef.current += (Date.now() - playStartRef.current) / 1000;
        playStartRef.current = null;
      }
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      flushPlay();
    };
  }, [visible, danceId, isFeedEmbed, flushPlay]);

  const prevFeedMutedRef = useRef<boolean>(true);
  useEffect(() => {
    if (prevFeedMutedRef.current && !feedMuted) {
      everUnmutedRef.current = true;
    }
    prevFeedMutedRef.current = feedMuted;
  }, [feedMuted]);

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

  const pulseStyle = `
    @keyframes ld-pulse {
      0%, 100% { opacity: 0.25; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.08); }
    }
  `;

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <style>{pulseStyle}</style>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyArtistId={spotifyArtistId}
        lyricDanceUrl={lyricDanceUrl}
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

            {!isFeedEmbed && !hasUnlocked && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 50,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    fontSize: 36,
                    opacity: 0.35,
                    animation: "ld-pulse 2s ease-in-out infinite",
                  }}
                >
                  ▶
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.2)",
                    letterSpacing: "0.12em",
                    textTransform: "lowercase",
                  }}
                >
                  tap to play
                </span>
              </div>
            )}

          </>
        )}

        {/* Lyric mode */}
        {cardMode === "lyric" && (
          <LyricModePanel
            danceId={danceId}
            moments={moments}
            reactionData={reactionData}
            currentTimeSec={currentTimeSec}
            words={(data?.words as Array<{ word: string; start: number; end: number }>) ?? []}
            onFireMoment={(lineIndex, timeSec, holdMs) => {
              if (!danceId) return;
              player?.fireFire(holdMs);
              emitFire(danceId, lineIndex, timeSec, holdMs, "feed", userId ?? null);
            }}
            onPlayLine={(startSec, endSec) => {
              if (!player) return;
              player.audio.currentTime = Math.max(0, startSec - 0.01);
              player.setRegion(startSec, endSec);
              player.setMuted(false);
              player.play();
              // Clear any previous one-shot timer
              if (panelPlayTimerRef.current) clearTimeout(panelPlayTimerRef.current);
              // Mute after one play-through
              const durationMs = (endSec - startSec) * 1000 + 150;
              panelPlayTimerRef.current = setTimeout(() => {
                player.setMuted(true);
                panelPlayTimerRef.current = null;
              }, durationMs);
            }}
          />
        )}

        {/* Empowerment mode */}
        {cardMode === "empowerment" && (
          <EmpowermentModePanel
            danceId={danceId}
            empowermentPromise={((data ?? prefetchedData) as any)?.empowerment_promise ?? null}
            onViewLyrics={() => setCardMode("lyric")}
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

      {/* LyricInteractionLayer — dance mode only */}
      {cardMode === "dance" && (
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
          <LyricInteractionLayer
            moments={moments}
            reactionData={reactionData}
            player={player}
            currentTimeSec={currentTimeSec}
            danceId={danceId}
            onFireTap={() => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              if (!danceId || !activeLine) return;
              player?.fireFire(0);
              emitFire(danceId, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "feed", userId ?? null);
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
              emitFire(danceId, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs, "feed", userId ?? null);
            }}
            onSeekTo={seekOnly}
          />
        </div>
      )}
    </div>
  );
});
