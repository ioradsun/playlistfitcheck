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

function snapToBeat(timeSec: number, beats: number[]): number {
  if (beats.length === 0) return timeSec;
  let best = beats[0];
  let minDist = Math.abs(best - timeSec);
  for (let i = 1; i < beats.length; i += 1) {
    const dist = Math.abs(beats[i] - timeSec);
    if (dist < minDist) {
      minDist = dist;
      best = beats[i];
    }
  }
  return minDist <= 0.08 ? best : timeSec;
}

/** Snap to nearest phrase end within tolerance. Falls back to beat snap. */
function snapToPhraseEnd(
  t: number,
  phraseEnds: number[],
  beats: number[],
  toleranceSec = 2.5,
): number {
  if (phraseEnds.length) {
    let best = -1;
    let bestDist = Infinity;
    for (const pe of phraseEnds) {
      if (pe < t - toleranceSec || pe > t + toleranceSec) continue;
      const d = Math.abs(pe - t);
      if (d < bestDist) {
        bestDist = d;
        best = pe;
      }
    }
    if (best > 0) return best;
  }
  return snapToBeat(t, beats);
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
    const rawWindows = sections
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

    const beats = Array.isArray((data as any)?.beat_grid?.beats)
      ? ((data as any).beat_grid.beats as unknown[]).filter(
          (beat): beat is number => typeof beat === 'number' && Number.isFinite(beat),
        )
      : [];

    // Build a sorted list of phrase end times
    const phraseEnds: number[] = [];
    const phrases = (data as any)?.cinematic_direction?.phrases as
      | Array<{ wordRange: [number, number] }>
      | undefined;
    const words = (data as any)?.words as Array<{ start: number; end: number }> | undefined;
    if (phrases?.length && words?.length) {
      for (const phrase of phrases) {
        const endIdx = Math.min(phrase.wordRange[1], words.length - 1);
        const endTime = words[endIdx]?.end;
        if (typeof endTime === 'number' && Number.isFinite(endTime)) {
          phraseEnds.push(endTime);
        }
      }
      phraseEnds.sort((a, b) => a - b);
    }

    return rawWindows.map((window) => {
      const idealEnd = window.endSec;
      const snapped = snapToPhraseEnd(idealEnd, phraseEnds, beats);
      return {
        ...window,
        endSec: Math.max(window.startSec + 0.01, snapped),
      };
    });
  }, [
    data?.cinematic_direction?.sections,
    (data as any)?.cinematic_direction?.phrases,
    (data as any)?.words,
    (data as any)?.beat_grid?.beats,
    durationSec,
  ]);

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
