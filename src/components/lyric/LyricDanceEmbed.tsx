import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo, useMemo } from "react";
import { Share2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withPriorityInitLimit } from "@/engine/initQueue";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { enrichSections } from "@/engine/directionResolvers";
import { isGlobalMuted } from "@/lib/globalMute";
import { fireWeight } from "@/lib/fireHold";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import type { CardMode } from "@/components/lyric/PlayerHeader";
import { MomentPanel } from "@/components/lyric/MomentPanel";
import { CardResultsPanel } from "@/components/lyric/CardResultsPanel";
import { EmpowermentModePanel } from "@/components/lyric/EmpowermentModePanel";
import { ViralClipModal } from "@/components/lyric/ViralClipModal";
import { LyricTextLayer } from "@/components/lyric/LyricTextLayer";
import { emitFire, fetchFireData, upsertPlay } from "@/lib/fire";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { getPreloadedImage } from "@/lib/imagePreloadCache";
import { resolveTypographyFromDirection } from "@/lib/fontResolver";

/**
 * LyricDanceEmbed — THE player component.
 *
 * Used everywhere a live lyric dance renders: feed primary card, FitTab,
 * ShareableLyricDance, SongDetail. Wrappers vary by context; this component
 * is invariant.
 *
 * Concerns, top-to-bottom:
 *   1. Props and refs
 *   2. Core state (fetched data, player, playback time, mute)
 *   3. Data fetching (prefetched or Supabase)
 *   4. Engine lifecycle (create/destroy LyricDancePlayer)
 *   5. Playback time tracking (RAF loop gated on visibility + playing)
 *   6. Fire state (heat, user map, anon count) + hydration + realtime
 *   7. Comments state + hydration + realtime
 *   8. Profile avatars (batch fetch)
 *   9. Play tracking (progress, duration, flush interval)
 *  10. Derived memos (durationSec, audioSections, moments, activeLine, posterSrc)
 *  11. Interaction callbacks
 *  12. Mode lifecycle effects (cardMode visibility, end-of-track handoff)
 *  13. Render
 *
 * Every engine/FMLY/fire/comments concern is gated on `live`.
 * When live=false, only data fetching and render remain active.
 */
interface LyricDanceEmbedProps {
  lyricDanceId: string;
  songTitle: string;
  artistName?: string;
  prefetchedData?: LyricDanceData | null;
  postId?: string;
  lyricDanceUrl?: string | null;
  spotifyTrackId?: string | null;
  spotifyArtistId?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  userId?: string | null;
  onProfileClick?: () => void;
  /** Hex color from palette — renders instantly as background, zero network */
  previewPaletteColor?: string | null;
  /** Section image URL — used by preload cache, NOT CSS background */
  previewImageUrl?: string | null;
  /** Enables full player behaviors; false renders static preview shell. */
  live?: boolean;
  /** Invoked when the user taps a non-live card. Feed wrappers implement this
   *  to promote the card to primary. Ignored when live=true (tap toggles mute). */
  onRequestPrimary?: () => void;
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

export const LyricDanceEmbed = memo(forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed(props, ref) {
  // 1. Props and refs
  const {
    lyricDanceId,
    songTitle,
    artistName,
    prefetchedData,
    postId,
    lyricDanceUrl = null,
    spotifyTrackId,
    spotifyArtistId,
    avatarUrl,
    isVerified,
    userId,
    onProfileClick,
    previewPaletteColor,
    previewImageUrl,
    live = true,
    onRequestPrimary,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTimeSecRef = useRef(0);
  const playerRef = useRef<LyricDancePlayer | null>(null);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playStartRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number>(0);
  const everUnmutedRef = useRef<boolean>(false);
  const maxProgressRef = useRef<number>(0);
  const playCountRef = useRef<number>(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFiresRef = useRef<Array<{ line_index: number | null; hold_ms: number | null }>>([]);

  // 2. Core state
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(() => {
    if (!prefetchedData) return null;
    return {
      ...prefetchedData,
      cinematic_direction: prefetchedData.cinematic_direction
        ? normalizeCinematicDirection(prefetchedData.cinematic_direction)
        : prefetchedData.cinematic_direction,
    };
  });
  const data = fetchedData;
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fireHeat, setFireHeat] = useState<Record<string, { line: Record<number, number>; total: number }>>({});
  const [fireUserMap, setFireUserMap] = useState<Record<number, string[]>>({});
  const [fireAnonCount, setFireAnonCount] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [viralClipOpen, setViralClipOpen] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, { avatarUrl: string | null; displayName: string | null }>>({});
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [cardMode, setCardMode] = useState<CardMode>("listen");

  const danceId: string = ((data ?? prefetchedData) as any)?.id ?? "";
  const effectiveMuted = muted;

  // 3. Data fetching (prefetched or Supabase)
  useEffect(() => {
    if (prefetchedData) {
      setFetchedData((prev) => {
        if (prev && prev.id === (prefetchedData as any).id && prev.cinematic_direction) return prev;
        return {
          ...prefetchedData,
          cinematic_direction: prefetchedData.cinematic_direction
            ? normalizeCinematicDirection(prefetchedData.cinematic_direction)
            : prefetchedData.cinematic_direction,
        };
      });
      return;
    }
    if (!lyricDanceId) return;
    let cancelled = false;
    (supabase
      .from("lyric_projects" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle() as unknown as Promise<any>)
      .then(({ data: row }: any) => {
        if (cancelled) return;
        if (row) {
          const r = row as any;
          setFetchedData({
            ...(row as unknown as LyricDanceData),
            cinematic_direction: r.cinematic_direction
              ? normalizeCinematicDirection(r.cinematic_direction)
              : r.cinematic_direction,
          });
        }
      })
      .catch((error: any) => {
        if (cancelled) return;
        console.warn("[LyricDanceCore] Failed to fetch shareable lyric dance", {
          lyricDanceId,
          error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [lyricDanceId, prefetchedData]);

  // 4. Engine lifecycle
  useEffect(() => {
    if (!live) {
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setPlayer(null);
      }
      return;
    }

    const next = fetchedData;
    if (!next?.id || !next.audio_url || !canvasRef.current || !textCanvasRef.current || !containerRef.current) {
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setPlayer(null);
      }
      return;
    }

    let cancelled = false;
    setPlayerReady(false);

    const p = new LyricDancePlayer(next, canvasRef.current, textCanvasRef.current, containerRef.current);
    playerRef.current = p;
    setPlayer(p);

    withPriorityInitLimit(() => p.init()).then(() => {
      if (cancelled) return;
      setPlayerReady(true);
    }).catch(() => {
      if (cancelled) return;
      setPlayerReady(false);
    });

    return () => {
      cancelled = true;
      p.destroy();
      if (playerRef.current === p) playerRef.current = null;
      setPlayer((prev) => (prev === p ? null : prev));
      setPlayerReady(false);
    };
  }, [live, fetchedData, canvasRef, textCanvasRef, containerRef]);

  // 5. Playback time tracking (RAF loop gated on visibility + playing)
  useEffect(() => {
    if (!live || !player) return;
    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      const t = player.getCurrentTime?.() ?? audio.currentTime;
      if (Math.abs(t - currentTimeSecRef.current) > 0.1) {
        currentTimeSecRef.current = t;
        setCurrentTimeSec(t);
      }
      if (player.playing && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const checkPlaying = () => {
      if (player.playing && !rafId && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        checkPlaying();
      }
    };

    audio.addEventListener("play", checkPlaying);
    audio.addEventListener("pause", checkPlaying);
    document.addEventListener("visibilitychange", onVis);

    const interval = setInterval(checkPlaying, 200);
    checkPlaying();

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
      audio.removeEventListener("play", checkPlaying);
      audio.removeEventListener("pause", checkPlaying);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [live, player]);

  // 10. Derived memos
  const durationSec = useMemo(() => {
    const lines = (data as any)?.lines ?? (data as any)?.lyrics ?? [];
    if (lines.length) {
      return (lines[lines.length - 1] as any).end ?? 0;
    }
    const bg = (data as any)?.beat_grid;
    if (bg?._duration && bg._duration > 0) return bg._duration;
    if (Array.isArray(bg?.beats) && bg.beats.length > 0) {
      return bg.beats[bg.beats.length - 1];
    }
    return 0;
  }, [(data as any)?.lines ?? (data as any)?.lyrics, (data as any)?.beat_grid]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );
  const resolvedTypography = useMemo(
    () => resolveTypographyFromDirection((data ?? prefetchedData) as any),
    [data, prefetchedData],
  );

  const activeLine = useMemo(() => {
    if (!lyricSections.isReady) return null;
    const line = lyricSections.allLines.find(
      (l) => currentTimeSec >= l.startSec && currentTimeSec < l.endSec + 0.1,
    ) ?? null;
    if (!line) return null;
    const section = lyricSections.sections.find((s) =>
      s.lines.some((sl) => sl.lineIndex === line.lineIndex),
    ) ?? null;
    return {
      text: line.text,
      lineIndex: line.lineIndex,
      sectionLabel: section?.label ?? null,
    };
  }, [lyricSections, currentTimeSec]);

  const audioSections = useMemo(() => {
    if (lyricSections.sections.length > 0) {
      return lyricSections.sections.map((s, i) => ({
        sectionIndex: i,
        startSec: s.startSec,
        endSec: s.endSec,
        role: s.role,
      }));
    }
    const cd = (data as any)?.cinematic_direction;
    const cdSections = cd?.sections;
    if (Array.isArray(cdSections) && cdSections.length > 0) {
      const dur = (data as any)?.beat_grid?._duration || durationSec || undefined;
      const enriched = enrichSections(cdSections, dur);
      return enriched.map((s, i) => ({
        sectionIndex: s.sectionIndex ?? i,
        startSec: s.startSec ?? (i / enriched.length) * (dur || 60),
        endSec: s.endSec ?? ((i + 1) / enriched.length) * (dur || 60),
        role: s.description ?? null,
      }));
    }
    return [];
  }, [lyricSections.sections, data, durationSec]);

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
  }, [data, audioSections, lyricSections.allLines, durationSec]);

  const posterSrc = useMemo(() => {
    const albumArt = (data as any)?.album_art_url ?? (prefetchedData as any)?.album_art_url ?? null;
    const sectionImg = previewImageUrl ?? null;
    if (sectionImg && getPreloadedImage(sectionImg)) return sectionImg;
    return albumArt || sectionImg || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  }, [data, prefetchedData, previewImageUrl]);

  // 6. Fire state (heat, user map, anon count) + hydration + realtime
  useEffect(() => {
    if (!live || !data?.id) return;

    let mounted = true;
    const hydrate = async () => {
      const { data: fires } = await supabase
        .from("project_fires" as any)
        .select("line_index, hold_ms, user_id")
        .eq("project_id", data.id);

      if (!mounted || !fires) return;

      const agg: Record<string, { line: Record<number, number>; total: number }> = { "🔥": { line: {}, total: 0 } };
      const userMap: Record<number, string[]> = {};
      const anonCount: Record<number, number> = {};

      for (const fire of fires as any[]) {
        const idx = fire.line_index ?? 0;
        const weight = fireWeight(fire.hold_ms ?? 0);
        agg["🔥"].line[idx] = (agg["🔥"].line[idx] ?? 0) + weight;
        agg["🔥"].total += weight;
        if (fire.user_id) {
          if (!userMap[idx]) userMap[idx] = [];
          if (!userMap[idx].includes(fire.user_id)) userMap[idx].push(fire.user_id);
        } else {
          anonCount[idx] = (anonCount[idx] ?? 0) + 1;
        }
      }

      setFireHeat(agg);
      setFireUserMap(userMap);
      setFireAnonCount(anonCount);
    };

    void hydrate();

    const flushInterval = window.setInterval(() => {
      if (pendingFiresRef.current.length === 0) return;
      const batch = pendingFiresRef.current.splice(0, pendingFiresRef.current.length);
      setFireHeat((prev) => {
        const next = { ...prev };
        const fire = next["🔥"] ? { ...next["🔥"], line: { ...next["🔥"].line } } : { line: {}, total: 0 };
        for (const row of batch) {
          const idx = row.line_index ?? 0;
          const weight = fireWeight(row.hold_ms ?? 0);
          fire.line[idx] = (fire.line[idx] ?? 0) + weight;
          fire.total += weight;
        }
        next["🔥"] = fire;
        return next;
      });
    }, 500);

    const fireChannel = supabase
      .channel(`fires-core-${data.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_fires",
          filter: `project_id=eq.${data.id}`,
        },
        (payload: any) => {
          const { line_index, hold_ms, user_id } = payload.new;
          pendingFiresRef.current.push({ line_index, hold_ms });

          if (user_id) {
            setFireUserMap((prev) => {
              const idx = line_index ?? 0;
              const existing = prev[idx] ?? [];
              if (existing.includes(user_id)) return prev;
              return { ...prev, [idx]: [...existing, user_id] };
            });
          } else {
            setFireAnonCount((prev) => {
              const idx = line_index ?? 0;
              return { ...prev, [idx]: (prev[idx] ?? 0) + 1 };
            });
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      window.clearInterval(flushInterval);
      pendingFiresRef.current = [];
      supabase.removeChannel(fireChannel);
    };
  }, [live, data?.id]);

  useEffect(() => {
    if (!player) return;
    player.setFireHeat(fireHeat);
    player.setMoments(moments);
  }, [player, fireHeat, moments]);

  // 7. Comments state + hydration + realtime
  useEffect(() => {
    if (!live || !danceId) return;
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
  }, [live, danceId]);

  // 8. Profile avatars (batch fetch)
  useEffect(() => {
    if (!live) return;
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
  }, [live, fireUserMap, comments]);

  // 11. Interaction callbacks
  const handleCanvasTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    unlockAudio();

    if (!live) {
      // Non-live card: request promotion to primary. Feed wrapper handles the rest.
      onRequestPrimary?.();
      return;
    }

    // Toggle mute intent. Sync effect propagates to player.
    setMuted((prev) => !prev);
  }, [live, setMuted, onRequestPrimary]);

  const seekOnly = useCallback((timeSec: number) => {
    player?.seek(timeSec);
    if (timeSec <= 0.05) setCardMode("listen");
  }, [player]);

  const getCurrentFireIndex = useCallback(() => {
    if (activeLine) return activeLine.lineIndex;
    const t = player?.audio?.currentTime ?? 0;
    for (let i = moments.length - 1; i >= 0; i -= 1) {
      if (t >= moments[i].startSec - 0.1) return moments[i].sectionIndex;
    }
    return 0;
  }, [activeLine, player, moments]);

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

  const getPlayerStable = useCallback(() => player ?? null, [player]);

  // 9. Play tracking (progress, duration, flush interval)
  useEffect(() => {
    if (!live || !danceId) return;
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
  }, [live, danceId, flushPlay]);

  useEffect(() => {
    if (!live || !player || !danceId) return;
    let cancelled = false;
    fetchFireData(danceId).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
    });
    return () => { cancelled = true; };
  }, [live, player, danceId]);

  // 12. Mode lifecycle effects (cardMode visibility, end-of-track handoff)
  // On go-live: reset mute intent to "play audibly".
  // New primary card always starts unmuted — user must tap to mute it.
  // Going not-live doesn't touch intent; next primary will reset its own.
  useEffect(() => {
    if (live) setMuted(false);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    if (!player) return;
    player.textRenderMode = "dom";
    return () => { player.textRenderMode = "canvas"; };
  }, [player, live]);

  useEffect(() => {
    if (muted) {
      setShowMuteIndicator(true);
      const timeout = setTimeout(() => setShowMuteIndicator(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [muted]);

  // Sync player state to React state. Single owner of mute, play, region, loop writes.
  // Deterministic function of (player, playerReady, live, cardMode, muted).
  // No ordering dependencies with other effects.
  useEffect(() => {
    if (!player || !playerReady) return;

    const isListening = cardMode === "listen";
    const shouldEngage = live && isListening;

    if (shouldEngage) {
      unlockAudio();
      player.setRegion(undefined, undefined);
      player.audio.loop = true;
      player.setMuted(muted);
      player.play(true);
    } else {
      player.setMuted(true);
      player.audio.loop = false;
      // Don't pause — engine may need to continue for export/preview contexts.
      // Non-primary cards have live=false which tears down the engine via the hook.
    }
  }, [player, playerReady, live, cardMode, muted]);

  // Canvas visibility based on cardMode. Pure DOM-style concern, not player state.
  useEffect(() => {
    if (!live) return;
    if (!containerRef.current) return;
    const isListening = cardMode === "listen";
    const canvases = containerRef.current.querySelectorAll("canvas");
    canvases.forEach((c) => {
      c.style.visibility = isListening ? "visible" : "hidden";
      c.style.pointerEvents = "none";
    });
  }, [cardMode, live]);

  // Clear any pending panel-play timer when cardMode or live changes.
  // This was bundled into Effect B; now separated for clarity.
  useEffect(() => {
    if (panelPlayTimerRef.current) {
      clearTimeout(panelPlayTimerRef.current);
      panelPlayTimerRef.current = null;
    }
  }, [cardMode, live]);

  useEffect(() => {
    if (!live) return;
    if (!durationSec || !player) return;
    if (currentTimeSec > durationSec + 2.2 && cardMode === "listen") {
      setCardMode("empowerment");
      player.audio.loop = false;
    }
  }, [currentTimeSec, durationSec, cardMode, live, player]);

  useEffect(() => () => { if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current); }, []);

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

  // 13. Render
  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyArtistId={spotifyArtistId}
        lyricDanceUrl={lyricDanceUrl}
        showMenuButton={live}
        isVerified={isVerified}
        userId={userId}
        onProfileClick={onProfileClick}
        cardMode={cardMode}
        onModeChange={setCardMode}
      />

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{
          background: previewPaletteColor
            ? `radial-gradient(ellipse at 50% 40%, ${previewPaletteColor}33 0%, #0a0a0a 70%)`
            : "#0a0a0a",
        }}
        onClick={cardMode === "listen" ? handleCanvasTap : undefined}
      >
        {/* Poster layer — mounted for card lifetime; canvas crossfades on top. */}
        <img
          src={posterSrc}
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          style={{ objectFit: "cover", zIndex: 1, opacity: 1 }}
        />
        {/* Static vignette — applied only when live=false. Approximates the engine's
         *  own vignette so non-primary cards feel like stilled versions of the live card
         *  rather than a separate visual language. When live, the canvas draws its own
         *  dynamic vignette on top, so this overlay must not render. */}
        {!live && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 2,
              background: `
                radial-gradient(ellipse at 50% 45%, transparent 20%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.35) 100%),
                linear-gradient(to bottom, transparent 70%, rgba(0,0,0,0.25) 100%)
              `,
            }}
          />
        )}

        <LyricTextLayer
          lines={((data ?? prefetchedData) as any)?.lines ?? []}
          words={((data ?? prefetchedData) as any)?.words}
          phrases={((data ?? prefetchedData) as any)?.cinematic_direction?.phrases}
          typography={resolvedTypography}
          currentTimeSec={currentTimeSec}
          ownsText={true}
        />

        {live && cardMode === "listen" && (
          <>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
            <canvas ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2 }} />

            {effectiveMuted && (
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

        {live && cardMode === "empowerment" && (
          <EmpowermentModePanel
            danceId={danceId ?? null}
            empowermentPromise={
              ((data ?? prefetchedData) as any)?.empowerment_promise ?? null
            }
            onDismiss={() => setCardMode("moments")}
          />
        )}

        {live && cardMode === "moments" && (
          <MomentPanel
            danceId={danceId}
            moments={moments}
            fireHeat={fireHeat}
            currentTimeSec={currentTimeSec}
            words={(Array.isArray((data as any)?.lines) && (data as any).lines.length > 0)
              ? ((data?.words as Array<{ word: string; start: number; end: number }>) ?? [])
              : undefined}
            isInstrumental={!Array.isArray((data as any)?.lines) || (data as any).lines.length === 0}
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

        {live && cardMode === "results" && (
          <CardResultsPanel
            moments={moments}
            fireHeat={fireHeat}
            spotifyTrackId={spotifyTrackId ?? null}
            postId={postId ?? null}
            lyricDanceUrl={lyricDanceUrl ?? null}
          />
        )}
      </div>

      <div className="w-full flex-shrink-0" style={{ height: 44, background: "#0a0a0a" }} onClick={(e) => e.stopPropagation()}>
        {live && cardMode === "listen" ? (
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
        ) : null}
      </div>

      {live && (
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
      )}
    </div>
  );
}));
