import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { type LyricDanceData } from "@/engine/LyricDancePlayer";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";

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
  const [muted, setMuted] = useState(true);
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
      .from("shareable_lyric_dances" as any)
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

  const audioSections = useMemo(() => {
    const sections = lyricSections.sections;
    return sections.map((s, i) => ({
      sectionIndex: i,
      startSec: s.startSec,
      endSec: s.endSec,
      role: s.role,
    }));
  }, [lyricSections.sections]);

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
    player.setMoments(moments);
  }, [player, reactionData, moments]);

  useEffect(() => {
    if (!data?.id || evicted) return;
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
  }, [data?.id, evicted, setReactionData]);

  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    let rafId = 0;
    const tick = () => {
      const t = audio.currentTime;
      if (Math.abs(t - currentTimeSecRef.current) > 0.1) {
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
    reactionData,
    durationSec,
    lyricSections,
    moments,
    activeLine,
    handleReplay,
  };
}
