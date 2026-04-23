import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo, useMemo, type MouseEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withoutInitLimit } from "@/engine/initQueue";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { enrichSections } from "@/engine/directionResolvers";
import { fireWeight } from "@/lib/fireHold";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { PlayerHeader } from "@/components/lyric/PlayerHeader";
import { ModeDispatcher } from "@/components/lyric/modes/ModeDispatcher";
import { CARD_MODES } from "@/components/lyric/modes/registry";
import type { CardMode, Comment, ModeContext } from "@/components/lyric/modes/types";
import { emitFire, fetchFireData, upsertPlay } from "@/lib/fire";
import { unlockAudio } from "@/lib/reelsAudioUnlock";
import { getSharedAudio } from "@/lib/sharedAudio";

// Session-scoped marker: record only one cold feed boot metric per page lifetime.
let hasRecordedColdFeedBoot = false;

function hydrateRow(raw: LyricDanceData): LyricDanceData {
  const cinematicDirection = raw.cinematic_direction;
  const alreadyNormalized = !!cinematicDirection
    && typeof cinematicDirection === "object"
    && !Array.isArray(cinematicDirection)
    && ("sections" in cinematicDirection || "phrases" in cinematicDirection);
  return {
    ...raw,
    cinematic_direction: alreadyNormalized
      ? cinematicDirection
      : (cinematicDirection
        ? normalizeCinematicDirection(cinematicDirection)
        : cinematicDirection),
  };
}

/**
 * LyricDanceEmbed — THE player component.
 *
 * Used everywhere a live lyric dance renders: feed primary card, FitTab,
 * ShareableLyricDance, SongDetail. Wrappers vary by context; this component
 * is invariant.
 *
 * Concerns, top-to-bottom:
 *   - Props and refs
 *   - Core state (fetched data, player, playback time, mute, fire, comments)
 *   - Data fetching (prefetched or Supabase)
 *   - Engine lifecycle (create/destroy LyricDancePlayer, resize observation)
 *   - Playback time tracking (RAF loop gated on visibility + playing)
 *   - Derived data (durationSec, audioSections, moments)
 *   - Fire + comments + profiles (hydration, realtime, aggregation)
 *   - Interaction callbacks + play-progress tracking
 *   - Live/mode lifecycle effects
 *   - Mode context + render
 *
 * Every engine/FMLY/fire/comments concern is gated on `live`.
 * When live=false, only data fetching and render remain active.
 */
export interface LyricDanceEmbedProps {
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
  /** Kept for call-site compatibility; used by LyricDanceShell path, not live embed rendering. */
  previewPaletteColor?: string | null;
  /** Kept for call-site compatibility; used by LyricDanceShell path, not live embed rendering. */
  previewImageUrl?: string | null;
  /** Enables full player behaviors; false renders static preview shell. */
  live?: boolean;
  /**
   * When true (default), playback auto-starts once the live player is ready in listen mode.
   * Set false when the embed is mounted in a hidden/non-active container that must stay silent.
   */
  autoPlay?: boolean;
  /** Optional top-left menu slot (typically a menu trigger for feed contexts). */
  menuSlot?: ReactNode;
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

export const LyricDanceEmbed = memo(forwardRef<LyricDanceEmbedHandle, LyricDanceEmbedProps>(function LyricDanceEmbed(props, ref) {
  // Props and refs
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
    live = true,
    autoPlay = true,
    menuSlot,
    onRequestPrimary,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTimeSecRef = useRef(0);
  const hasPlayedRef = useRef(false);
  const playerRef = useRef<LyricDancePlayer | null>(null);
  const playStartRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number>(0);
  const everUnmutedRef = useRef<boolean>(false);
  const maxProgressRef = useRef<number>(0);
  const playCountRef = useRef<number>(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFiresRef = useRef<Array<{ line_index: number | null; hold_ms: number | null }>>([]);
  const retriedRef = useRef(false);

  // Core state
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(
    () => (prefetchedData ? hydrateRow(prefetchedData) : null),
  );
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fireHeat, setFireHeat] = useState<Record<string, { line: Record<number, number>; total: number }>>({});
  const [fireUserMap, setFireUserMap] = useState<Record<number, string[]>>({});
  const [fireAnonCount, setFireAnonCount] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  // Mutually exclusive fullscreen state — "off" | "native" (browser API) | "pseudo" (CSS fallback)
  const [fullscreenMode, setFullscreenMode] = useState<"off" | "native" | "pseudo">("off");
  const [profileMap, setProfileMap] = useState<Record<string, { avatarUrl: string | null; displayName: string | null }>>({});
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [cardMode, setCardMode] = useState<CardMode>("listen");

  const effectiveData = fetchedData ?? prefetchedData ?? null;
  const danceId: string | null = effectiveData?.id ?? null;

  // Data fetching (prefetched or Supabase)
  // When prefetchedData updates (e.g. FitTab pipeline finishing section images
  // after initial mount), we re-hydrate so downstream consumers see the new data.
  // The earlier version of this effect short-circuited when `cinematic_direction`
  // was already set, which silently dropped all subsequent field updates —
  // including late-arriving `section_images` and `empowerment_promise`.
  useEffect(() => {
    if (prefetchedData) {
      setFetchedData((prev) => {
        if (prev === prefetchedData) return prev; // identity bail — same object, no work
        return hydrateRow(prefetchedData);
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
          setFetchedData(hydrateRow(row as LyricDanceData));
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

  // Engine lifecycle
  useEffect(() => {
    const teardown = () => {
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setPlayer(null);
      }
    };

    if (!live) {
      teardown();
      return;
    }

    if (!danceId || !fetchedData?.audio_url || !canvasRef.current || !textCanvasRef.current || !containerRef.current) {
      teardown();
      return;
    }

    let cancelled = false;
    setPlayerReady(false);

    const p = new LyricDancePlayer(
      fetchedData,
      canvasRef.current,
      textCanvasRef.current,
      containerRef.current,
      { externalAudio: getSharedAudio() },
    );
    playerRef.current = p;
    setPlayer(p);

    const bootDeadline = window.setTimeout(() => {
      if (!cancelled && playerRef.current === p) {
        console.warn("[LyricDanceEmbed] init exceeded 4s", { danceId });
        setPlayerReady(true);
      }
    }, 4000);

    withoutInitLimit(() => p.init())
      .then(() => {
        if (cancelled) return;
        window.clearTimeout(bootDeadline);
        setPlayerReady(true);
      })
      .catch((err) => {
        window.clearTimeout(bootDeadline);
        if (cancelled) return;
        console.error("[LyricDanceEmbed] init failed", { danceId, err });
        if (!retriedRef.current) {
          retriedRef.current = true;
          setFetchedData((d) => (d ? { ...d } : d));
          return;
        }
        setPlayerReady(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(bootDeadline);
      p.destroy();
      if (playerRef.current === p) playerRef.current = null;
      setPlayer((prev) => (prev === p ? null : prev));
      setPlayerReady(false);
    };
  }, [live, fetchedData, danceId]);

  // 4b. Container resize observation — keeps engine layout in sync with container size
  // Fixes: text off-center or clipped after card transitions (reels mode primary change,
  // scroll-driven mount), orientation change, browser resize. The engine's resize() method
  // recompiles the scene for new viewport dimensions; this effect wires the DOM signal
  // into that code path.
  useEffect(() => {
    if (!player) return;
    const container = containerRef.current;
    if (!container) return;

    let rafPending = 0;
    let lastAppliedW = player.currentWidth;
    let lastAppliedH = player.currentHeight;

    const applyResize = () => {
      rafPending = 0;
      if (!playerRef.current) return;
      const w = container.offsetWidth || container.clientWidth;
      const h = container.offsetHeight || container.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Threshold: ignore sub-pixel noise to avoid recompile thrash
      if (Math.abs(w - lastAppliedW) < 2 && Math.abs(h - lastAppliedH) < 2) return;
      lastAppliedW = w;
      lastAppliedH = h;
      playerRef.current.resize(w, h);
    };

    // Apply once synchronously on mount — handles the case where container
    // had zero dimensions when init ran, so engine compiled for fallback 960x540.
    // This reads current real dimensions and triggers an immediate recompile.
    applyResize();

    const ro = new ResizeObserver(() => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(applyResize);
    });
    ro.observe(container);

    return () => {
      if (rafPending) cancelAnimationFrame(rafPending);
      ro.disconnect();
    };
  }, [player]);

  // Playback time tracking (RAF loop gated on visibility + playing)
  useEffect(() => {
    if (!live || !player) return;

    // Start each live session from a neutral UI time; the RAF loop will
    // sync to audio.currentTime on the next frame.
    setCurrentTimeSec(0);

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

    checkPlaying();

    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", checkPlaying);
      audio.removeEventListener("pause", checkPlaying);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [live, player]);

  // Boot metrics emission (no visual side-effects).
  useEffect(() => {
    if (!live || !player) return;

    return player.onFirstFrame(() => {
      const metrics = player.getBootMetrics();
      const isColdFeedBoot = !hasRecordedColdFeedBoot;
      if (!hasRecordedColdFeedBoot) hasRecordedColdFeedBoot = true;
      console.info("[LyricDanceEmbed] bootMetrics", {
        danceId,
        postId,
        isPrimary: live,
        isColdFeedBoot,
        ...metrics,
      });
    });
  }, [live, player, danceId, postId]);

  // Derived data
  const durationSec = useMemo(() => {
    const lines = fetchedData?.lines ?? fetchedData?.lyrics ?? [];
    if (lines.length) {
      return lines[lines.length - 1]?.end ?? 0;
    }
    const bg = fetchedData?.beat_grid;
    if (bg?._duration && bg._duration > 0) return bg._duration;
    if (Array.isArray(bg?.beats) && bg.beats.length > 0) {
      return bg.beats[bg.beats.length - 1];
    }
    return 0;
  }, [fetchedData?.lines, fetchedData?.lyrics, fetchedData?.beat_grid]);

  const lyricSections = useLyricSections(
    fetchedData?.words ?? null,
    fetchedData?.beat_grid ?? null,
    fetchedData?.cinematic_direction ?? null,
    durationSec,
  );

  const audioSections = useMemo(() => {
    if (lyricSections.sections.length > 0) {
      return lyricSections.sections.map((s, i) => ({
        sectionIndex: i,
        startSec: s.startSec,
        endSec: s.endSec,
        role: s.role,
      }));
    }
    const cd = fetchedData?.cinematic_direction;
    const cdSections = cd?.sections;
    if (Array.isArray(cdSections) && cdSections.length > 0) {
      const dur = fetchedData?.beat_grid?._duration || durationSec || undefined;
      const enriched = enrichSections(cdSections, dur);
      return enriched.map((s, i) => ({
        sectionIndex: s.sectionIndex ?? i,
        startSec: s.startSec ?? (i / enriched.length) * (dur || 60),
        endSec: s.endSec ?? ((i + 1) / enriched.length) * (dur || 60),
        role: s.description ?? null,
      }));
    }
    return [];
  }, [lyricSections.sections, fetchedData, durationSec]);

  const moments = useMemo<Moment[]>(() => {
    const phrases = fetchedData?.cinematic_direction?.phrases ?? [];
    const phraseInputs = phrases.map((p) => {
      const isMs = p.start > 500;
      return {
        start: isMs ? p.start / 1000 : p.start,
        end: isMs ? p.end / 1000 : p.end,
        text: p.text ?? "",
      };
    });
    return buildMoments(phraseInputs, audioSections, lyricSections.allLines, durationSec);
  }, [fetchedData, audioSections, lyricSections.allLines, durationSec]);

  // Fire state (heat, user map, anon count) + hydration + realtime
  useEffect(() => {
    if (!live || !danceId) return;

    let mounted = true;
    const hydrate = async () => {
      const { data: fires } = await supabase
        .from("project_fires" as any)
        .select("line_index, hold_ms, user_id")
        .eq("project_id", danceId);

      if (!mounted || !fires) return;

      const agg: Record<string, { line: Record<number, number>; total: number }> = { "🔥": { line: {}, total: 0 } };
      const userMap: Record<number, string[]> = {};
      const anonCount: Record<number, number> = {};

      for (const fire of fires as unknown as Array<{ line_index: number | null; hold_ms: number | null; user_id: string | null }>) {
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
      .channel(`fires-core-${danceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_fires",
          filter: `project_id=eq.${danceId}`,
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
  }, [live, danceId]);

  useEffect(() => {
    if (!player) return;
    player.setFireHeat(fireHeat);
    player.setMoments(moments);
  }, [player, fireHeat, moments]);

  // Track native Fullscreen API state changes (ESC key, OS-level exit).
  // Both standard and webkit events covered — older Safari dispatches the webkit variant.
  useEffect(() => {
    const sync = () => {
      const isNative = document.fullscreenElement === containerRef.current
        || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement === containerRef.current;
      setFullscreenMode((curr) => {
        if (isNative) return "native";
        if (curr === "native") return "off"; // browser exited native
        return curr; // preserve "pseudo" or "off"
      });
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // Pseudo-fullscreen side effects: ESC-to-exit + background scroll lock.
  // Both share the same "while in pseudo mode" lifecycle, so they're one effect.
  useEffect(() => {
    if (fullscreenMode !== "pseudo") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenMode("off");
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreenMode]);

  const onToggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (fullscreenMode === "native") {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore — fullscreenchange listener will sync state.
      }
      return;
    }
    if (fullscreenMode === "pseudo") {
      setFullscreenMode("off");
      return;
    }

    // fullscreenMode === "off" — try native Fullscreen API first.
    // HTMLElement.requestFullscreen is standard; webkitRequestFullscreen covers older Safari.
    const req = el.requestFullscreen?.bind(el)
      ?? (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(el);
    if (req) {
      try {
        await req();
        return;
      } catch {
        // Native rejected (iOS Safari on non-video elements). Fall through.
      }
    }
    setFullscreenMode("pseudo");
  }, [fullscreenMode]);

  // Comments state + hydration + realtime
  useEffect(() => {
    if (!live || !danceId) return;
    let mounted = true;

    supabase
      .from("project_comments" as any)
      .select("id, text, line_index, created_at, user_id")
      .eq("project_id", danceId)
      .order("created_at", { ascending: true })
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

  // Profile avatars (batch fetch)
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
        for (const profile of profiles as Array<{ id: string; avatar_url: string | null; display_name: string | null }>) {
          map[profile.id] = {
            avatarUrl: profile.avatar_url ?? null,
            displayName: profile.display_name ?? null,
          };
        }
        setProfileMap(map);
      });
  }, [live, fireUserMap, comments]);

  // Interaction callbacks
  const handleCanvasTap = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
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

  const playRegion = useCallback((startSec: number, endSec: number) => {
    if (!player) return;
    player.audio.currentTime = Math.max(0, startSec - 0.01);
    player.setRegion(startSec, endSec);
    player.setMuted(false);
    player.play();
  }, [player]);

  const getCurrentFireIndex = useCallback(() => {
    const t = player?.audio?.currentTime ?? 0;
    if (lyricSections.isReady) {
      const line = lyricSections.allLines.find(
        (l) => t >= l.startSec && t < l.endSec + 0.1,
      );
      if (line) return line.lineIndex;
    }
    for (let i = moments.length - 1; i >= 0; i -= 1) {
      if (t >= moments[i].startSec - 0.1) return moments[i].sectionIndex;
    }
    return 0;
  }, [player, moments, lyricSections.allLines, lyricSections.isReady]);

  const getAttributedPhraseIndex = useCallback(() => {
    const t = player?.audio?.currentTime ?? 0;
    const phrases = effectiveData?.cinematic_direction?.phrases;
    if (!phrases?.length) {
      return getCurrentFireIndex();
    }

    const MIN_REACTION_MS = 0.3;

    for (let i = phrases.length - 1; i >= 0; i -= 1) {
      const phrase = phrases[i];
      const pStart = phrase.start ?? 0;
      const pEnd = phrase.end ?? 0;

      if (pEnd <= t) return i;
      if (pStart <= t && (t - pStart) >= MIN_REACTION_MS) return i;
    }

    return 0;
  }, [player, effectiveData, getCurrentFireIndex]);

  // Push late-arriving section_images into the engine.
  // The engine's loadSectionImages() runs once at init; if images weren't ready
  // yet (common when FitTab mounts the embed before the image pipeline finishes),
  // they never load without an explicit update call.
  const lastPushedSectionImagesRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!player) return;
    const urls = (effectiveData?.section_images ?? []).filter(Boolean) as string[];
    if (urls.length === 0) return;

    const prev = lastPushedSectionImagesRef.current;
    const same = prev
      && prev.length === urls.length
      && prev.every((u, i) => u === urls[i]);
    if (same) return;

    lastPushedSectionImagesRef.current = urls;
    player.updateSectionImages(urls);
  }, [player, effectiveData?.section_images]);

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

  // Play tracking (progress, duration, flush interval)
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

  // Live transition resets.
  useEffect(() => {
    if (live) {
      setMuted(false);
    } else {
      hasPlayedRef.current = false;
      everUnmutedRef.current = false;
    }
  }, [live]);

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
      if (!muted) everUnmutedRef.current = true;
      if (autoPlay) {
        player.play(true);
      } else {
        player.pause();
      }
    } else {
      player.setMuted(true);
      player.audio.loop = false;
      // Don't pause — engine may need to continue for export/preview contexts.
      // Non-primary cards have live=false which tears down the engine via the hook.
    }
  }, [player, playerReady, live, cardMode, muted, autoPlay]);

  // Clear any pending panel-play timer when cardMode or live changes.
  useEffect(() => {
    if (panelPlayTimerRef.current) {
      clearTimeout(panelPlayTimerRef.current);
      panelPlayTimerRef.current = null;
    }
  }, [cardMode, live]);

  useEffect(() => {
    if (!live) return;
    if (!durationSec || !player) return;

    // Only count playback as "real progress" once we've observed time
    // advancing within the song's valid range for this live session.
    if (currentTimeSec > 0.1 && currentTimeSec < durationSec) {
      hasPlayedRef.current = true;
    }

    if (
      hasPlayedRef.current &&
      currentTimeSec > durationSec + 2.2 &&
      cardMode === "listen"
    ) {
      setCardMode("empowerment");
      player.audio.loop = false;
    }
  }, [currentTimeSec, durationSec, cardMode, live, player]);

  useImperativeHandle(ref, () => ({
    getPlayer: () => player ?? null,
    getMoments: () => moments,
    getFireHeat: () => fireHeat,
    getComments: () => comments,
    getAudioUrl: () => effectiveData?.audio_url ?? "",
    reloadTranscript: (lines: any[], words?: any[]) => {
      player?.updateTranscript(lines, words ?? null);
    },
    get wickBarEnabled() {
      return player?.wickBarEnabled ?? false;
    },
    set wickBarEnabled(enabled: boolean) {
      if (player) player.wickBarEnabled = enabled;
    },
  }), [player, moments, fireHeat, comments, effectiveData]);

  // ── Mode context: bundled shape consumed by ModeDispatcher ──
  // All existing state, derived data, refs, and action callbacks flow through here.
  // Modes destructure what they need; adding a prop to any mode is a one-file edit.
  const modeCtx: ModeContext = useMemo(() => ({
    cardMode,
    live,
    playerReady,
    player,
    data: fetchedData,
    danceId,
    postId: postId ?? null,
    lyricDanceUrl,
    spotifyTrackId: spotifyTrackId ?? null,
    userId: userId ?? null,
    moments,
    fireHeat,
    fireUserMap,
    fireAnonCount,
    profileMap,
    comments,
    currentTimeSec,
    muted,
    showMuteIndicator,
    setCardMode,
    setComments,
    handleCanvasTap,
    seekOnly,
    onFireMoment: (lineIndex, timeSec, holdMs) => {
      if (!danceId) return;
      emitFire(danceId, lineIndex, timeSec, holdMs, "feed", userId ?? null);
    },
    onPlayLine: (startSec, endSec) => {
      playRegion(startSec, endSec);
      // After the clip, auto-mute so panel preview doesn't continue audibly.
      if (panelPlayTimerRef.current) clearTimeout(panelPlayTimerRef.current);
      const durationMs = (endSec - startSec) * 1000 + 150;
      panelPlayTimerRef.current = setTimeout(() => {
        player?.setMuted(true);
        panelPlayTimerRef.current = null;
      }, durationMs);
    },
    onCommentAdded: (comment) => setComments((prev) =>
      (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment])),
    isFullscreen: fullscreenMode !== "off",
    onToggleFullscreen,
  }), [
    cardMode, live, playerReady, player, fetchedData, danceId, postId, lyricDanceUrl,
    spotifyTrackId, userId, moments, fireHeat, fireUserMap, fireAnonCount,
    profileMap, comments, currentTimeSec, muted, showMuteIndicator,
    setCardMode, setComments, handleCanvasTap, seekOnly, playRegion,
    fullscreenMode, onToggleFullscreen,
  ]);

  const disabledModes = useMemo(() => {
    const set = new Set<CardMode>();
    for (const mode of CARD_MODES) {
      if (mode.disabled(modeCtx)) set.add(mode.id);
    }
    return set;
  }, [modeCtx]);

  // Render
  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      <PlayerHeader
        avatarUrl={avatarUrl}
        artistName={artistName}
        songTitle={songTitle}
        spotifyArtistId={spotifyArtistId}
        lyricDanceUrl={lyricDanceUrl}
        menuSlot={live ? menuSlot : undefined}
        isVerified={isVerified}
        userId={userId}
        onProfileClick={onProfileClick}
        cardMode={cardMode}
        onModeChange={setCardMode}
        disabledModes={disabledModes}
      />

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        style={fullscreenMode === "pseudo" ? {
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#000",
          flex: "none",
        } : undefined}
        onClick={cardMode === "listen" ? handleCanvasTap : undefined}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 1, pointerEvents: "none" }}
        />
        <canvas
          ref={textCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 2, pointerEvents: "none" }}
        />

        <ModeDispatcher ctx={modeCtx} />
      </div>

      <div
        className="w-full flex-shrink-0"
        style={{ background: "#0a0a0a" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/*
         * LyricInteractionLayer (bottom FMLY bar) is structurally outside the mode
         * system — it's an embed-level frame element rendered in a separate flex child
         * below the video container. The gate is on cardMode === "listen" because
         * the interaction UI is only relevant in that mode, but the bar itself isn't
         * a mode overlay. Moving it into ListenMode would require portals or DOM
         * restructuring.
         */}
        {live && cardMode === "listen" ? (
          <LyricInteractionLayer
            moments={moments}
            fireHeat={fireHeat}
            player={player}
            currentTimeSec={currentTimeSec}
            danceId={danceId}
            comments={comments}
            onFire={(lineIndex, holdMs) => {
              modeCtx.onFireMoment(lineIndex, player?.audio.currentTime ?? 0, holdMs);
              const phrase = effectiveData?.cinematic_direction?.phrases?.[lineIndex];
              if (phrase?.text) player?.showEcho(phrase.text);
            }}
            getLineIndex={getAttributedPhraseIndex}
            onSeekTo={seekOnly}
            onToastTap={(momentIdx) => {
              const m = moments[momentIdx];
              if (m) playRegion(m.startSec, m.endSec);
              setCardMode("moments");
            }}
          />
        ) : (
          <div
            style={{
              height: 44,
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}
          />
        )}
      </div>

    </div>
  );
}));
