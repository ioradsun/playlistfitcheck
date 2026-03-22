import { useState, useMemo, useCallback } from 'react';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';
import type { UseLyricSectionsResult as LyricSections } from '@/hooks/useLyricSections';
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
  player: _player,
  lyricSections,
  currentTimeSec,
  data,
  durationSec,
  onPanelClose,
}: UseReactionPanelOptions) {
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
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

  const palette = useMemo(() => {
    const autoPalettes = (data as any)?.auto_palettes;
    if (Array.isArray(autoPalettes) && autoPalettes.length > 0 && Array.isArray(autoPalettes[0])) {
      return autoPalettes[0] as string[];
    }
    return Array.isArray(data?.palette) ? (data.palette as string[]) : [];
  }, [data]);

  const handlePanelClose = useCallback(() => {
    setReactionPanelOpen(false);
    onPanelClose?.();
  }, [onPanelClose]);

  return {
    reactionPanelOpen,
    setReactionPanelOpen,
    reactionData,
    setReactionData,
    activeLine,
    audioSections,
    palette,
    handlePanelClose,
  };
}
