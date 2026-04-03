import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { VolumeX } from "lucide-react";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import { ClipComposer } from "@/components/lyric/ClipComposer";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";

import { emitFire, fetchFireData } from "@/lib/fire";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import { isAudioUnlocked, unlockAudio } from "@/lib/reelsAudioUnlock";
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
  hideReactButton?: boolean;
  postId?: string;
  spotifyTrackId?: string | null;
  autoPlay?: boolean;
  forceMuted?: boolean;
  onOpenReactions?: () => void;
  avatarUrl?: string | null;
  isVerified?: boolean;
  onProfileClick?: () => void;
  preload?: boolean;
}

export interface LyricDanceEmbedHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
  reloadTranscript: (lines: any[], words?: any[]) => void;
}

export const LyricDanceEmbed = forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed({
  lyricDanceId,
  lyricDanceUrl,
  songTitle,
  artistName,
  prefetchedData,
  cardState,
  onPlay,
  regionStart,
  regionEnd,
  postId,
  spotifyTrackId,
  autoPlay = false,
  forceMuted = false,
  avatarUrl,
  preload = false,
}, ref) {
  const isFeedEmbed = cardState !== undefined;
  const isBattleMode = regionStart != null && regionEnd != null;
  const empowermentPromise = (prefetchedData as any)?.empowerment_promise ?? null;

  const [evicted, setEvicted] = useState(true);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFeedEmbed || isBattleMode) {
      setEvicted(false);
      return;
    }

    if (cardState === "active") {
      if (warmTimerRef.current) { clearTimeout(warmTimerRef.current); warmTimerRef.current = null; }
      if (evicted) setEvicted(false);
    } else if (cardState === "cold") {
      if (warmTimerRef.current) { clearTimeout(warmTimerRef.current); warmTimerRef.current = null; }
      if (!evicted) setEvicted(true);
    } else {
      if (warmTimerRef.current || !evicted) return;
      warmTimerRef.current = setTimeout(() => {
        warmTimerRef.current = null;
        setEvicted(false);
      }, 200);
    }

    return () => {
      if (warmTimerRef.current) {
        clearTimeout(warmTimerRef.current);
        warmTimerRef.current = null;
      }
    };
  }, [cardState, isFeedEmbed, isBattleMode, evicted]);

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
    autoPlay,
    onPlay,
    usePool: isFeedEmbed,
    evicted,
  });

  useImperativeHandle(ref, () => ({
    getPlayer: () => player ?? null,
    reloadTranscript: (lines: any[], words?: any[]) => {
      player?.updateTranscript(lines, words ?? null);
    },
  }), [player]);

  const [, setFireStrengthByLine] = useState<Record<number, number>>({});
  const [firedMoments, setFiredMoments] = useState<Set<number>>(new Set());
  const [closingVisible, setClosingVisible] = useState(false);
  const [, setClosingAnswered] = useState(false);
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

  useEffect(() => {
    if (!player || !playerReady) return;
    if (cardState === "active" || !isFeedEmbed) {
      player.play();
      player.setMuted(!isAudioUnlocked() ? true : muted);
    } else {
      player.pause();
      player.setMuted(true);
    }
  }, [player, playerReady, cardState, isFeedEmbed, muted]);

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
      setMuted(false);
      setShowMuteIndicator(false);
    } else {
      player?.setMuted(true);
      setMuted(true);
      setShowMuteIndicator(true);
    }
  }, [muted, player, setMuted]);

  useEffect(() => {
    if (!player || !playerReady) return;
    player.setTextVerticalBias(0);
  }, [player, playerReady]);

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

  const currentMoment = useMemo(() => moments.find((m) => currentTimeSec >= m.startSec && currentTimeSec < m.endSec) ?? null, [moments, currentTimeSec]);

  const markFired = useCallback(() => {
    if (currentMoment?.index == null) return;
    setFiredMoments((prev) => new Set([...prev, currentMoment.index]));
  }, [currentMoment?.index]);

  useEffect(() => {
    return () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); };
  }, []);

  void lyricDanceUrl;
  void preload;
  void firedMoments;

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>

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

        {/* Inline header overlay on canvas — artist info + Spotify link */}
        <div
          className="absolute top-0 left-0 right-0 z-[15] flex items-center justify-between px-2.5 py-2"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 min-w-0">
            {avatarUrl && (
              <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-white/[0.06] shrink-0" />
            )}
            <span className="text-[10px] text-white/50 truncate max-w-[50vw]" style={{ fontFamily: "monospace" }}>
              {artistName ? `${artistName} · ` : ""}{songTitle}
            </span>
          </div>
          {spotifyTrackId && (
            <a
              href={`https://open.spotify.com/track/${spotifyTrackId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: "rgba(0,0,0,0.35)" }}
            >
              <svg viewBox="0 0 24 24" width="10" height="10"><path fill="rgba(30,215,96,0.8)" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2z"/></svg>
              <span style={{ fontSize: 8, color: "rgba(30,215,96,0.7)", fontWeight: 500 }}>LISTEN</span>
            </a>
          )}
        </div>

        {muted && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", opacity: showMuteIndicator ? 0.8 : 0, transition: "opacity 0.3s ease", pointerEvents: "none", zIndex: 40 }}>
            <VolumeX size={20} color="white" />
          </div>
        )}

        <ClosingScreen
          visible={closingVisible}
          empowermentPromise={empowermentPromise}
          danceId={((data ?? prefetchedData) as any)?.id ?? ""}
          onAnswer={() => setClosingAnswered(true)}
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
            onSeekTo={(sec) => dismissClosingAndSeek(sec)}
          />
        </div>
      )}
    </div>
  );
});
