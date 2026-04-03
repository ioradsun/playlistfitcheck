import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { VolumeX } from "lucide-react";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import { ClipComposer } from "@/components/lyric/ClipComposer";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";

import { emitFire, fetchFireData } from "@/lib/fire";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { isAudioUnlocked, unlockAudio } from "@/lib/reelsAudioUnlock";
import type { CardState } from "@/components/songfit/useCardLifecycle";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

interface LyricDanceEmbedProps {
  lyricDanceId: string;
  songTitle: string;
  artistName?: string;
  prefetchedData?: LyricDanceData | null;
  cardState?: CardState;
  regionStart?: number;
  regionEnd?: number;
  postId?: string;
  spotifyTrackId?: string | null;
  forceMuted?: boolean;
  avatarUrl?: string | null;
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
  cardState,
  regionStart,
  regionEnd,
  postId,
  spotifyTrackId,
  forceMuted = false,
  avatarUrl,
  preload = false,
}, ref) {
  const isFeedEmbed = cardState !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;
  const empowermentPromise = (prefetchedData as any)?.empowerment_promise ?? null;

  const [evicted, setEvicted] = useState(true);

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) {
      setEvicted(false);
      return;
    }
    setEvicted(cardState === "cold");
  }, [cardState, isFeedEmbed, isBattleMode]);

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
    handleReplay,
  } = useLyricDanceCore({
    lyricDanceId,
    prefetchedData: prefetchedDataWithRegion,
    postId,
    usePool: isFeedEmbed,
    evicted,
  });

  useImperativeHandle(ref, () => ({
    getPlayer: () => player ?? null,
    reloadTranscript: (lines: any[], words?: any[]) => {
      player?.updateTranscript(lines, words ?? null);
    },
  }), [player]);

  const [closingVisible, setClosingVisible] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [clipCaption, setClipCaption] = useState("");
  const [showClipComposer, setShowClipComposer] = useState(false);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);

  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (cardState === "warm" || cardState === "active") {
      player.scheduleFullModeUpgrade();
    }
  }, [player, playerReady, isFeedEmbed, cardState]);

  // Preload audio when warm (adjacent to active) — don't wait for play().
  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (cardState === "warm" && preload) {
      player.primeAudio();
    }
  }, [player, playerReady, isFeedEmbed, cardState, preload]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (cardState === "active" || !isFeedEmbed) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, playerReady, cardState, isFeedEmbed]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (cardState === "active" || !isFeedEmbed) {
      player.setMuted(!isAudioUnlocked() ? true : muted);
    } else {
      player.setMuted(true);
    }
  }, [player, playerReady, cardState, isFeedEmbed, muted]);

  // Imperative audio solo: pause this player as soon as another card activates.
  useEffect(() => {
    if (!player || !postId || !isFeedEmbed) return;
    const handler = (e: Event) => {
      const activeId = (e as CustomEvent).detail?.activeCardId;
      if (activeId && activeId !== postId) {
        player.pause();
        player.setMuted(true);
      }
    };
    window.addEventListener("crowdfit:audio-solo", handler);
    return () => window.removeEventListener("crowdfit:audio-solo", handler);
  }, [player, postId, isFeedEmbed]);

  useEffect(() => {
    if (!player || !playerReady || !forceMuted) return;
    player.setMuted(true);
    setMuted(true);
  }, [player, playerReady, forceMuted, setMuted]);

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
    if (muted) {
      player?.setMuted(false);
      player?.play(); // user gesture → restart audio if it was blocked
      setMuted(false);
      setShowMuteIndicator(false);
    } else {
      player?.setMuted(true);
      setMuted(true);
      setShowMuteIndicator(true);
    }
  }, [muted, player, setMuted]);

  useEffect(() => {
    if (!durationSec || !player) return;
    if (currentTimeSec > durationSec + 2.2 && !closingVisible) {
      setClosingVisible(true);
      player.audio.loop = false;
      player.pause();
    }
  }, [currentTimeSec, durationSec, closingVisible, player]);

  const dismissClosingAndReplay = useCallback(() => {
    setClosingVisible(false);
    if (player) player.audio.loop = false;
    handleReplay();
  }, [handleReplay, player]);

  const dismissClosingAndSeek = useCallback((timeSec: number) => {
    if (closingVisible) {
      setClosingVisible(false);
    }
    player?.seek(timeSec);
    player?.play();
    player?.setMuted(false);
    setMuted(false);
  }, [closingVisible, player, setMuted]);

  useEffect(() => {
    const id = (data ?? prefetchedData as any)?.id;
    if (!player || !id) return;
    let cancelled = false;
    fetchFireData(id).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
    });
    return () => { cancelled = true; };
  }, [player, (data ?? prefetchedData as any)?.id]);

  useEffect(() => {
    return () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); };
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyTrackId={spotifyTrackId}
        showMenuButton={isFeedEmbed}
      />

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        onClick={handleCanvasTap}
      >
        {!isFeedEmbed && (
          <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
            <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2 }} />
          </>
        )}

        {muted && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", opacity: showMuteIndicator ? 0.8 : 0, transition: "opacity 0.3s ease", pointerEvents: "none", zIndex: 40 }}>
            <VolumeX size={20} color="white" />
          </div>
        )}

        <ClosingScreen
          visible={closingVisible}
          empowermentPromise={empowermentPromise}
          danceId={((data ?? prefetchedData) as any)?.id ?? ""}
          onAnswer={() => {}}
          onReplay={dismissClosingAndReplay}
          source="feed"
          moments={moments}
          momentFireCounts={deriveMomentFireCounts(reactionData, moments)}
          onSeekToMoment={(idx) => {
            const m = moments[idx];
            if (m && player) {
              player.seek(m.startSec);
              player.setRegion(m.startSec, m.endSec);
            }
          }}
          onShareClip={(momentIdx, caption) => {
            const m = moments[momentIdx];
            if (!m) return;
            setClipStart(m.startSec);
            setClipEnd(m.endSec);
            setClipCaption(caption);
            setShowClipComposer(true);
          }}
        />

        {showClipComposer && (
          <div className="absolute inset-x-3 bottom-3 z-[540]" onClick={(e) => e.stopPropagation()}>
            <ClipComposer
              visible={showClipComposer}
              player={player}
              durationSec={durationSec}
              fires={(reactionData ?? []) as any}
              lines={lyricSections.allLines.map((l) => ({ lineIndex: l.lineIndex, text: l.text, startSec: l.startSec, endSec: l.endSec ?? (l.startSec + 5) }))}
              initialStart={clipStart}
              initialEnd={clipEnd}
              initialCaption={clipCaption}
              songTitle={songTitle}
              onClose={() => {
                setShowClipComposer(false);
                player?.setRegion(undefined, undefined);
              }}
            />
          </div>
        )}
      </div>

      {!isBattleMode && (
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
          <LyricInteractionLayer
            moments={moments}
            reactionData={reactionData}
            player={player}
            currentTimeSec={currentTimeSec}
            onFireTap={() => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              const id = (data ?? prefetchedData as any)?.id;
              if (!id || !activeLine) return;
              player?.fireFire(0);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "feed");
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
            }}
            onSeekTo={(sec) => dismissClosingAndSeek(sec)}
          />
        </div>
      )}
    </div>
  );
});
