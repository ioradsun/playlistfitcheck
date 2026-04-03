import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { getSessionId } from "@/lib/sessionId";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import type { CanonicalAudioSection } from "@/types/audioSections";

const EMOJI_SYMBOLS: Record<string, string> = {
  fire: "🔥",
  dead: "💀",
  mind_blown: "🤯",
  emotional: "😭",
  respect: "🙏",
  accurate: "🎯",
};

export function computeTopReaction(
  reactionData: Record<string, { line: Record<number, number>; total: number }>,
  lyrics: any[],
) {
  const lineTotals = new Map<number, number>();
  for (const d of Object.values(reactionData)) {
    for (const [idxStr, count] of Object.entries(d.line)) {
      lineTotals.set(Number(idxStr), (lineTotals.get(Number(idxStr)) ?? 0) + count);
    }
  }
  if (lineTotals.size === 0) return null;
  let bestIdx = -1;
  let bestTotal = 0;
  for (const [idx, total] of lineTotals.entries()) {
    if (total > bestTotal) {
      bestTotal = total;
      bestIdx = idx;
    }
  }
  let topKey: string | null = null;
  let topCount = 0;
  for (const [key, d] of Object.entries(reactionData)) {
    const count = d.line[bestIdx] ?? 0;
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  }
  const symbol = topKey ? (EMOJI_SYMBOLS[topKey] ?? "🔥") : "🔥";
  const lineText = ((lyrics as any[])[bestIdx]?.text ?? "").slice(0, 60);
  if (!lineText || bestTotal <= 0) return null;
  return { symbol, count: bestTotal, lineText, lineReactionCount: bestTotal };
}

interface UseLyricDanceCoreOptions {
  lyricDanceId: string;
  prefetchedData?: LyricDanceData | null;
  postId?: string;
  autoPlay?: boolean;
  onPlay?: () => void;
  usePool?: boolean;
  evicted?: boolean;
}

export function useLyricDanceCore({
  lyricDanceId,
  prefetchedData,
  postId: _postId,
  autoPlay = false,
  onPlay,
  usePool = false,
  evicted = false,
}: UseLyricDanceCoreOptions) {
  const [fetchedData, setFetchedData] = useState<LyricDanceData | null>(prefetchedData ?? null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [muted, setMuted] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTimeSecRef = useRef(0);
  const activeLineRef = useRef<{ text: string; lineIndex: number; sectionLabel: string | null } | null>(null);

  useEffect(() => {
    if (prefetchedData) {
      setFetchedData({
        ...prefetchedData,
        cinematic_direction: prefetchedData.cinematic_direction
          ? normalizeCinematicDirection(prefetchedData.cinematic_direction)
          : prefetchedData.cinematic_direction,
      });
      setLoading(false);
      return;
    }
    if (!lyricDanceId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", lyricDanceId)
      .maybeSingle()
      .then(({ data: row }) => {
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
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[LyricDanceCore] Failed to fetch shareable lyric dance", {
          lyricDanceId,
          error,
        });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lyricDanceId, prefetchedData]);

  useEffect(() => {
    // Safety valve: if loading takes >15 seconds, stop waiting
    if (!loading) return;
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("[LyricDanceCore] Data fetch timeout — releasing cover");
        setLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loading]);

  const { player, playerReady, data, playerRef } = useLyricDancePlayer(
    fetchedData,
    canvasRef,
    textCanvasRef,
    containerRef,
    { bootMode: "minimal", eagerUpgrade: true, usePool, postId: _postId ?? lyricDanceId, evicted },
  );

  useEffect(() => {
    if (!playerReady || !player) return;
    player.setMuted(true);
  }, [playerReady, player]);

  useEffect(() => {
    if (!autoPlay || !player || !playerReady) return;
    player.setMuted(true);
    player.play();
  }, [autoPlay, player, playerReady]);

  const durationSec = useMemo(() => {
    const lines = data?.lyrics ?? [];
    if (!lines.length) return 0;
    return (lines[lines.length - 1] as any).end ?? 0;
  }, [data?.lyrics]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );

  const [reactionData, setReactionData] = useState<Record<string, { line: Record<number, number>; total: number }>>({});
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

  const audioSections = useMemo<CanonicalAudioSection[]>(() => {
    const sections = lyricSections.sections;
    return sections.map((s, i) => ({
      sectionIndex: i,
      startSec: s.startSec,
      endSec: s.endSec,
      role: s.role,
    }));
  }, [lyricSections.sections]);

  const palette = useMemo(() => {
    const cd = data?.cinematic_direction;
    if (cd?.sections && Array.isArray(cd.sections)) {
      return cd.sections.map((s: any) => s.dominantColor ?? "#6B7A8E");
    }
    return ["#ffffff", "#ffffff", "#ffffff"];
  }, [data]);

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
    player.setReactionData(reactionData);
  }, [player, reactionData]);

  useEffect(() => {
    if (!player) return;
    player.setEmojiStreamEnabled(true);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    player.setMoments(moments);
  }, [player, moments]);

  useEffect(() => {
    if (!data?.id) return;
    // Subscribe first to avoid missing events during initial fetch
    const channel = supabase
      .channel(`reactions-core-${data.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lyric_dance_reactions",
          filter: `dance_id=eq.${data.id}`,
        },
        (payload: any) => {
          const { emoji, line_index } = payload.new;
          setReactionData((prev) => {
            const next = { ...prev };
            if (!next[emoji]) next[emoji] = { line: {}, total: 0 };
            next[emoji] = {
              ...next[emoji],
              total: next[emoji].total + 1,
              line: {
                ...next[emoji].line,
                ...(line_index != null
                  ? { [line_index]: (next[emoji].line[line_index] ?? 0) + 1 }
                  : {}),
              },
            };
            return next;
          });
        },
      )
      .subscribe();

    // Then fetch existing reactions
    supabase
      .from("lyric_dance_reactions" as any)
      .select("emoji, line_index")
      .eq("dance_id", data.id)
      .then(({ data: rows }) => {
        if (!rows) return;
        const agg: Record<string, { line: Record<number, number>; total: number }> = {};
        for (const row of rows as any[]) {
          const { emoji, line_index } = row;
          if (!agg[emoji]) agg[emoji] = { line: {}, total: 0 };
          agg[emoji].total++;
          if (line_index != null) agg[emoji].line[line_index] = (agg[emoji].line[line_index] ?? 0) + 1;
        }
        setReactionData(agg);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.id, setReactionData]);

  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    let rafId = 0;
    const tick = () => {
      const t = audio.currentTime;
      if (Math.abs(t - currentTimeSecRef.current) > 0.05) {
        currentTimeSecRef.current = t;
        setCurrentTimeSec(t);
      }
      if (!audio.paused && !document.hidden) rafId = requestAnimationFrame(tick);
    };
    const onAudioPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!audio.paused) {
        onAudioPlay();
      }
    };
    audio.addEventListener("play", onAudioPlay);
    audio.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVis);
    if (!audio.paused) onAudioPlay();
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onAudioPlay);
      audio.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [player]);

  const toggleMute = useCallback((e?: ReactMouseEvent) => {
    e?.stopPropagation();
    if (!player) return;
    const next = !muted;
    player.setMuted(next);
    setMuted(next);
  }, [muted, player]);

  const handleReplay = useCallback((e?: ReactMouseEvent) => {
    e?.stopPropagation();
    if (!player) return;
    player.setMuted(false);
    player.seek(0);
    player.play();
    setMuted(false);
  }, [player]);

  const handlePauseForInput = useCallback(() => {
    player?.pause();
  }, [player]);

  const handleResumeAfterInput = useCallback(() => {
    player?.play();
  }, [player]);

  const handleCommentFromBar = useCallback(async (noteText: string, momentIndex?: number | null) => {
    const text = noteText.trim();
    if (!text) return;
    const danceId = fetchedData?.id;
    if (!danceId) return;
    try {
      await supabase.from("lyric_dance_comments" as any).insert({
        dance_id: danceId,
        text,
        session_id: getSessionId(),
        line_index: activeLineRef.current?.lineIndex ?? null,
        moment_index: momentIndex ?? null,
        parent_comment_id: null,
      });
    } catch {
      // silent
    }
    setCommentRefreshKey((k) => k + 1);
  }, [fetchedData?.id]);

  activeLineRef.current = activeLine;

  const topReaction = useMemo(
    () => computeTopReaction(reactionData, data?.lyrics ?? []),
    [reactionData, data?.lyrics],
  );

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!player || !playerReady || !data?.lyrics) return;
    const audio = player.audio;
    const lines = data.lyrics;
    const songStart = Math.max(0, (lines[0] as any).start - 0.5);
    const songEnd = (lines[lines.length - 1] as any).end + 1;
    const dur = songEnd - songStart;
    let rafId = 0;
    let lastP = 0;
    const tick = () => {
      const p = Math.max(0, Math.min(1, (audio.currentTime - songStart) / dur));
      if (Math.abs(p - lastP) > 0.005) {
        lastP = p;
        setProgress(p);
      }
      if (!audio.paused) rafId = requestAnimationFrame(tick);
    };
    const onAudioPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    audio.addEventListener("play", onAudioPlay);
    audio.addEventListener("pause", onPause);
    if (!audio.paused) onAudioPlay();
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onAudioPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [player, playerReady, data?.lyrics]);

  // DEBUG: trace player lifecycle
  useEffect(() => {
    console.log("[LyricDanceCore] state", {
      lyricDanceId,
      loading,
      hasFetchedData: !!fetchedData,
      hasCinematicDirection: !!fetchedData?.cinematic_direction,
      playerReady,
    });
  }, [lyricDanceId, loading, fetchedData, playerReady]);

  return {
    canvasRef,
    textCanvasRef,
    containerRef,
    player,
    playerReady,
    playerRef,
    data,
    fetchedData,
    setFetchedData,
    loading,
    muted,
    setMuted,
    currentTimeSec,
    progress,
    reactionData,
    setReactionData,
    durationSec,
    lyricSections,
    audioSections,
    activeLine,
    palette,
    toggleMute,
    handleReplay,
    handlePauseForInput,
    handleResumeAfterInput,
    handleCommentFromBar,
    topReaction,
    commentRefreshKey,
    setCommentRefreshKey,
  };
}
