import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useSyncExternalStore, memo } from "react";
import { Share2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import type { CardMode } from "@/components/lyric/PlayerHeader";
import { MomentPanel } from "@/components/lyric/MomentPanel";
import { CardResultsPanel } from "@/components/lyric/CardResultsPanel";
import { EmpowermentModePanel } from "@/components/lyric/EmpowermentModePanel";
import { ViralClipModal } from "@/components/lyric/ViralClipModal";

import { emitFire, fetchFireData, upsertPlay } from "@/lib/fire";
import { audioController } from "@/lib/audioController";
import { primeAudioPool } from "@/lib/audioPool";
import { isGlobalMuted } from "@/lib/globalMute";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
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
}

export interface LyricDanceEmbedHandle {
  getPlayer: () => import("@/engine/LyricDancePlayer").LyricDancePlayer | null;
  getMoments: () => import("@/lib/buildMoments").Moment[];
  getFireHeat: () => Record<string, { line: Record<number, number>; total: number }>;
  getComments: () => Array<{ text: string; line_index: number | null }>;
  getAudioUrl: () => string;
  reloadTranscript: (lines: any[], words?: any[]) => void;
  wickBarEnabled: boolean;
}

type Comment = { id: string; text: string; line_index: number | null; submitted_at: string; user_id: string | null };

export const LyricDanceEmbed = memo(forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed({
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
    fireHeat,
    durationSec,
    moments,
    activeLine,
    fireUserMap,
    fireAnonCount,
  } = useLyricDanceCore({ lyricDanceId, prefetchedData, postId, usePool: isFeedEmbed, evicted });

  const danceId: string = ((data ?? prefetchedData) as any)?.id ?? "";
  const [comments, setComments] = useState<Comment[]>([]);
  const [viralClipOpen, setViralClipOpen] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, { avatarUrl: string | null; displayName: string | null }>>({});

  const audioState = useSyncExternalStore(audioController.subscribe, audioController.getSnapshot, audioController.getSnapshot);
  const isPrimary = isFeedEmbed && audioState.effectivePrimaryId === postId;
  const feedMuted = isFeedEmbed ? audioState.muted : muted;

  useImperativeHandle(ref, () => ({
    getPlayer: () => player ?? null,
    getMoments: () => moments,
    getFireHeat: () => fireHeat,
    getComments: () => comments,
    getAudioUrl: () => ((data ?? prefetchedData) as any)?.audio_url ?? "",
    reloadTranscript: (lines: any[], words?: any[]) => {
      player?.updateTranscript(lines, words ?? null);
    },
    get wickBarEnabled() {
      return player?.wickBarEnabled ?? false;
    },
    set wickBarEnabled(enabled: boolean) {
      if (player) player.wickBarEnabled = enabled;
    },
  }), [player, moments, fireHeat, comments, data, prefetchedData]);

  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [cardMode, setCardMode] = useState<CardMode>("listen");
  const [hasUnlocked, setHasUnlocked] = useState(false);

  // Auto-play for non-feed embeds (FitTab) when player is ready
  useEffect(() => {
    if (!isFeedEmbed && playerReady && player && !hasUnlocked) {
      unlockAudio();
      setHasUnlocked(true);
      player.setMuted(false);
      player.play(true);
      setMuted(false);
    }
  }, [isFeedEmbed, playerReady, player, hasUnlocked, setMuted]);

  const playStartRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number>(0);
  const everUnmutedRef = useRef<boolean>(false);
  const maxProgressRef = useRef<number>(0);
  const playCountRef = useRef<number>(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!danceId) return;
    let mounted = true;

    supabase
      .from("project_comments" as any)
      .select("id, text, line_index, submitted_at, user_id")
      .eq("project_id", danceId)
      .order("submitted_at", { ascending: true })
      .limit(300)
      .then(({ data: rows }) => { if (mounted && rows) setComments(rows as unknown as Comment[]); });

    const channel = supabase
      .channel(`comments:${danceId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "project_comments",
        filter: `project_id=eq.${danceId}`,
      }, (payload: any) => {
        const c = payload.new as Comment;
        setComments((prev) => {
          const withoutTemp = prev.filter((x) =>
            !(x.id.startsWith("temp-") && x.text === c.text && x.line_index === c.line_index)
          );
          if (withoutTemp.some((x) => x.id === c.id)) return withoutTemp;
          return [...withoutTemp, c];
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [danceId]);

  useEffect(() => {
    const fireIds = Object.values(fireUserMap).flat();
    const commentIds = comments.filter((c) => c.user_id).map((c) => c.user_id!);
    const allIds = [...new Set([...fireIds, ...commentIds])];
    if (allIds.length === 0) {
      setProfileMap({});
      return;
    }

    supabase
      .from("profiles")
      .select("id, avatar_url, display_name")
      .in("id", allIds)
      .then(({ data: profiles }) => {
        if (!profiles) return;
        const map: Record<string, { avatarUrl: string | null; displayName: string | null }> = {};
        for (const profile of profiles as any[]) {
          map[profile.id] = {
            avatarUrl: profile.avatar_url ?? null,
            displayName: profile.display_name ?? null,
          };
        }
        setProfileMap(map);
      });
  }, [fireUserMap, comments]);

  useEffect(() => {
    if (!player || !data) return;
    const isInst = !!(data as any)?.cinematic_direction?._instrumental;
    player.beatVisEnabled = isInst;
    player.renderMode = isInst ? "beat" : "lyric";
  }, [player, data]);

  useEffect(() => {
    if (!player || !playerReady || !isFeedEmbed) return;
    if (visible) {
      player.scheduleFullModeUpgrade();
      player.primeAudio();
    }
  }, [player, playerReady, isFeedEmbed, visible]);

  useEffect(() => {
    if (!player || !playerReady || !postId || !isFeedEmbed || !visible) return;
    audioController.register(postId, player);
    return () => {
      audioController.clearExplicitIf(postId);
      audioController.unregister(postId);
    };
  }, [player, playerReady, postId, isFeedEmbed, visible]);

  useEffect(() => {
    if (!player || !playerReady) return;
    if (evicted) {
      player.pause();
      return;
    }
    if (isFeedEmbed) {
      if (isPrimary) {
        if (!player.playing) player.play(false);
      } else {
        player.pause();
      }
    } else {
      player.play(false);
    }
  }, [player, playerReady, isFeedEmbed, isPrimary, evicted]);

  useEffect(() => {
    if (!player || !isFeedEmbed || !visible) return;
    const audio = player.audio;
    const handleVisReturn = () => {
      if (document.hidden) return;
      if (isPrimary && audio.paused && player.playing) audio.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisReturn);
    return () => document.removeEventListener("visibilitychange", handleVisReturn);
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
    if (!player) return;
    if (panelPlayTimerRef.current) {
      clearTimeout(panelPlayTimerRef.current);
      panelPlayTimerRef.current = null;
    }
    const isListening = cardMode === "listen";

    if (containerRef.current) {
      const canvases = containerRef.current.querySelectorAll("canvas");
      canvases.forEach((c) => {
        c.style.visibility = isListening ? "visible" : "hidden";
        c.style.pointerEvents = "none";
      });
    }

    if (!isListening) {
      player.setMuted(true);
      player.audio.loop = false;
      return;
    }

    player.setMuted(true);
    player.setRegion(undefined, undefined);
    player.audio.loop = true;
  }, [cardMode, player, containerRef]);

  useEffect(() => {
    if (!durationSec || !player) return;
    if (currentTimeSec > durationSec + 2.2 && cardMode === "listen") {
      setCardMode("empowerment");
      player.audio.loop = false;
    }
  }, [currentTimeSec, durationSec, cardMode, player]);

  const flushPlay = useCallback(() => {
    if (!danceId || !durationSec) return;
    const currentTime = player?.audio?.currentTime ?? 0;
    const progressPct = durationSec > 0 ? (currentTime / durationSec) * 100 : 0;
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
    if (prevFeedMutedRef.current && !feedMuted) everUnmutedRef.current = true;
    prevFeedMutedRef.current = feedMuted;
  }, [feedMuted]);

  const seekOnly = useCallback((timeSec: number) => {
    player?.seek(timeSec);
    if (timeSec <= 0.05) setCardMode("listen");
  }, [player]);

  useEffect(() => {
    if (!player || !danceId) return;
    let cancelled = false;
    fetchFireData(danceId).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
    });
    return () => { cancelled = true; };
  }, [player, danceId]);

  useEffect(() => () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); }, []);

  const pulseStyle = `
    @keyframes ld-pulse {
      0%, 100% { opacity: 0.25; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.08); }
    }
  `;

  const getCurrentFireIndex = useCallback(() => {
    if (activeLine) return activeLine.lineIndex;
    const t = player?.audio?.currentTime ?? 0;
    for (let i = moments.length - 1; i >= 0; i -= 1) {
      if (t >= moments[i].startSec - 0.1) return moments[i].sectionIndex;
    }
    return 0;
  }, [activeLine, player, moments]);
  const getPlayerStable = useCallback(() => player ?? null, [player]);

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

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: "#0a0a0a" }}
        onClick={cardMode === "listen" ? handleCanvasTap : undefined}
      >
        {cardMode === "listen" && (
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

            <button
              onClick={(e) => {
                e.stopPropagation();
                setViralClipOpen(true);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 45,
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.35)",
                color: "rgba(255,255,255,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Share clip"
            >
              <Share2 size={14} />
            </button>

          </>
        )}

        {cardMode === "empowerment" && (
          <EmpowermentModePanel
            danceId={danceId ?? null}
            empowermentPromise={
              ((data ?? prefetchedData) as any)?.empowerment_promise ?? null
            }
            onDismiss={() => setCardMode("moments")}
          />
        )}

        {cardMode === "moments" && (
          <MomentPanel
            danceId={danceId}
            moments={moments}
            fireHeat={fireHeat}
            currentTimeSec={currentTimeSec}
            words={((data as any)?.cinematic_direction?._instrumental ? undefined : ((data?.words as Array<{ word: string; start: number; end: number }>) ?? []))}
            isInstrumental={!!(data as any)?.cinematic_direction?._instrumental}
            comments={comments}
            onCommentAdded={(comment) => setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]))}
            profileMap={profileMap}
            fireUserMap={fireUserMap}
            fireAnonCount={fireAnonCount}
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
              if (panelPlayTimerRef.current) clearTimeout(panelPlayTimerRef.current);
              const durationMs = (endSec - startSec) * 1000 + 150;
              panelPlayTimerRef.current = setTimeout(() => {
                player.setMuted(true);
                panelPlayTimerRef.current = null;
              }, durationMs);
            }}
          />
        )}

        {cardMode === "results" && (
          <CardResultsPanel
            moments={moments}
            fireHeat={fireHeat}
            spotifyTrackId={spotifyTrackId ?? null}
            postId={postId ?? null}
            lyricDanceUrl={lyricDanceUrl ?? null}
          />
        )}
      </div>

      {cardMode === "listen" && (
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
          <LyricInteractionLayer
            moments={moments}
            fireHeat={fireHeat}
            player={player}
            currentTimeSec={currentTimeSec}
            danceId={danceId}
            comments={comments}
            onFireTap={() => {
              if (holdFireIntervalRef.current) {
                clearInterval(holdFireIntervalRef.current);
                holdFireIntervalRef.current = null;
              }
              if (!danceId) return;
              player?.fireFire(0);
              emitFire(danceId, getCurrentFireIndex(), player?.audio.currentTime ?? 0, 0, "feed", userId ?? null);
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
              if (!danceId) return;
              player?.fireFire(holdMs);
              emitFire(danceId, getCurrentFireIndex(), player?.audio.currentTime ?? 0, holdMs, "feed", userId ?? null);
            }}
            onSeekTo={seekOnly}
            onToastTap={(momentIdx) => {
              const m = moments[momentIdx];
              if (m && player) {
                player.audio.currentTime = Math.max(0, m.startSec - 0.01);
                player.setRegion(m.startSec, m.endSec);
                player.setMuted(false);
                player.play();
              }
              setCardMode("moments");
            }}
          />
        </div>
      )}

      <ViralClipModal
        isOpen={viralClipOpen}
        onClose={() => setViralClipOpen(false)}
        getPlayer={getPlayerStable}
        moments={moments}
        fireHeat={fireHeat}
        comments={comments}
        songTitle={songTitle}
        artistName={artistName ?? "artist"}
        audioUrl={((data ?? prefetchedData) as any)?.audio_url ?? ""}
      />
    </div>
  );
}));
