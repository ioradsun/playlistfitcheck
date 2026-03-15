import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';
import type { LyricSections } from '@/hooks/useLyricSections';
import type { CanonicalAudioSection } from '@/components/lyric/ReactionPanel';

interface UseReactionPanelOptions {
  player: LyricDancePlayer | null;
  lyricSections: LyricSections;
  currentTimeSec: number;
  data: { cinematic_direction?: any; palette?: string[] } | null;
  durationSec: number;
  onPanelClose?: () => void;
}

export function useReactionPanel({
  player,
  lyricSections,
  currentTimeSec,
  data,
  durationSec,
  onPanelClose,
}: UseReactionPanelOptions) {
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
  const [engagementMode, setEngagementMode] = useState<'spectator' | 'freezing' | 'engaged'>('spectator');
  const [frozenLineIndex, setFrozenLineIndex] = useState<number | null>(null);
  const [reactionData, setReactionData] = useState<Record<string, { line: Record<number, number>; total: number }>>({});

  const freezeAtSecRef = useRef<number | null>(null);
  const engagementModeRef = useRef<'spectator' | 'freezing' | 'engaged'>('spectator');

  useEffect(() => {
    engagementModeRef.current = engagementMode;
  }, [engagementMode]);

  useEffect(() => {
    if (!reactionPanelOpen && engagementMode !== 'spectator') {
      setEngagementMode('spectator');
      setFrozenLineIndex(null);
      freezeAtSecRef.current = null;
    }
  }, [reactionPanelOpen, engagementMode]);

  useEffect(() => {
    if (!player) return;
    if (engagementMode !== 'freezing') return;
    const freezeAtSec = freezeAtSecRef.current;
    if (freezeAtSec == null || currentTimeSec < freezeAtSec) return;
    player.audio.pause();
    setEngagementMode('engaged');
    freezeAtSecRef.current = null;
  }, [currentTimeSec, engagementMode, player]);

  const getLineAtTime = useCallback((timeSec: number) => {
    return lyricSections.allLines.find(
      (line) => timeSec >= line.startSec && timeSec < line.endSec + 0.1,
    ) ?? null;
  }, [lyricSections.allLines]);

  const activeLine = useMemo(() => {
    if (!lyricSections.isReady) return null;
    const line = engagementMode === 'engaged' && frozenLineIndex != null
      ? (lyricSections.allLines.find((l) => l.lineIndex === frozenLineIndex) ?? null)
      : getLineAtTime(currentTimeSec);
    if (!line) return null;
    const section = lyricSections.sections.find((s) =>
      s.lines.some((sl) => sl.lineIndex === line.lineIndex),
    ) ?? null;
    return {
      text: line.text,
      lineIndex: line.lineIndex,
      sectionLabel: section?.label ?? null,
    };
  }, [lyricSections, currentTimeSec, engagementMode, frozenLineIndex, getLineAtTime]);

  const audioSections = useMemo<CanonicalAudioSection[]>(() => {
    const sections = data?.cinematic_direction?.sections;
    if (!Array.isArray(sections) || !sections.length || !durationSec) return [];
    return sections
      .map((section: any, index: number): CanonicalAudioSection | null => {
        const start = Number(section?.startRatio);
        const end = Number(section?.endRatio);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        return {
          sectionIndex: Number.isFinite(Number(section?.sectionIndex))
            ? Number(section.sectionIndex)
            : index,
          startSec: start * durationSec,
          endSec: end * durationSec,
          role: section?.mood ?? null,
        };
      })
      .filter((section): section is CanonicalAudioSection => section != null);
  }, [data?.cinematic_direction?.sections, durationSec]);

  const palette = useMemo(
    () => (Array.isArray(data?.palette) ? (data.palette as string[]) : []),
    [data?.palette],
  );

  const handleEngagementStart = useCallback((targetLineIndex?: number) => {
    if (!player) return;
    if (engagementModeRef.current === 'engaged') {
      if (targetLineIndex != null) setFrozenLineIndex(targetLineIndex);
      return;
    }
    const timeSec = player.audio.currentTime;
    const liveLine = getLineAtTime(timeSec);
    if (targetLineIndex != null) setFrozenLineIndex(targetLineIndex);
    else if (liveLine) setFrozenLineIndex(liveLine.lineIndex);
    freezeAtSecRef.current = liveLine?.endSec ?? timeSec;
    setEngagementMode('freezing');
  }, [player, getLineAtTime]);

  const handlePanelClose = useCallback(() => {
    setReactionPanelOpen(false);
    freezeAtSecRef.current = null;
    engagementModeRef.current = 'spectator';
    setEngagementMode('spectator');
    setFrozenLineIndex(null);
    onPanelClose?.();
    if (!player || player.audio.ended) return;
    try {
      player.play();
    } catch {
      // no-op
    }
  }, [player, onPanelClose]);

  const handleResetEngagement = useCallback(() => {
    setEngagementMode('spectator');
    setFrozenLineIndex(null);
    freezeAtSecRef.current = null;
  }, []);

  return {
    reactionPanelOpen,
    setReactionPanelOpen,
    engagementMode,
    frozenLineIndex,
    reactionData,
    setReactionData,
    activeLine,
    audioSections,
    palette,
    handleEngagementStart,
    handlePanelClose,
    handleResetEngagement,
  };
}
