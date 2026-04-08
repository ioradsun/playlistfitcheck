import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { enrichSections } from "@/engine/directionResolvers";
import { isGlobalMuted } from "@/lib/globalMute";
import { fireWeight } from "@/lib/fireHold";

interface UseLyricDanceCoreOptions {
  lyricDanceId: string;
  prefetchedData?: LyricDanceData | null;
  postId?: string;
  usePool?: boolean;
  evicted?: boolean;
}


export function useLyricDanceCore({
  lyricDanceId,
  prefetchedData,
  postId: _postId,
  usePool = false,
  evicted = false,
}: UseLyricDanceCoreOptions) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [muted, setMuted] = useState(() => isGlobalMuted());
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTimeSecRef = useRef(0);

  useEffect(() => {
    if (prefetchedData) {
      setFetchedData({
        ...prefetchedData,
        cinematic_direction: prefetchedData.cinematic_direction
          ? normalizeCinematicDirection(prefetchedData.cinematic_direction)
          : prefetchedData.cinematic_direction,
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

  const { player, playerReady, data } = useLyricDancePlayer(
    fetchedData,
    canvasRef,
    textCanvasRef,
    containerRef,
    { bootMode: "minimal", eagerUpgrade: true, usePool, postId: _postId ?? lyricDanceId, evicted },
  );
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
  }, [data?.lyrics, (data as any)?.beat_grid]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );

  const [fireHeat, setFireHeat] = useState<Record<string, { line: Record<number, number>; total: number }>>({});
  const [fireUserMap, setFireUserMap] = useState<Record<number, string[]>>({});
  const [fireAnonCount, setFireAnonCount] = useState<Record<number, number>>({});
  const pendingFiresRef = useRef<Array<{ line_index: number | null; hold_ms: number | null }>>([]);

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

  useEffect(() => {
    if (!player) return;
    player.setFireHeat(fireHeat);
    player.setMoments(moments);
  }, [player, fireHeat, moments]);

  useEffect(() => {
    if (!data?.id || evicted) return;

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
  }, [data?.id, evicted]);

  useEffect(() => {
    if (!player) return;
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
  }, [player]);

  const handleReplay = useCallback(() => {
    if (!player) return;
    player.setMuted(false);
    player.seek(0);
    player.play();
    setMuted(false);
  }, [player]);

  return {
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
    lyricSections,
    moments,
    activeLine,
    fireUserMap,
    fireAnonCount,
    handleReplay,
  };
}
