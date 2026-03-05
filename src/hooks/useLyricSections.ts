import { useMemo } from "react";

import {
  detectSections,
  type AudioSection,
  type SectionRole,
  type TimestampedLine,
} from "@/engine/sectionDetector";
import type { SongSignature } from "@/lib/songSignatureAnalyzer";
import type { CinematicDirection } from "@/types/CinematicDirection";

export interface LyricSectionLine {
  lineIndex: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface LyricSection {
  sectionIndex: number;
  role: SectionRole;
  label: string;
  labelSource: "ai" | "heuristic";
  startSec: number;
  endSec: number;
  lines: LyricSectionLine[];
  confidence: number;
}

export interface UseLyricSectionsResult {
  sections: LyricSection[];
  allLines: LyricSectionLine[];
  isReady: boolean;
}

const GAP_THRESHOLD_SEC = 1.2;
const MAX_WORDS_PER_LINE = 10;
const END_TRAIL_SEC = 0.15;
const LINE_END_BUFFER_SEC = 0.05;

type WordTiming = { word: string; start: number; end: number };
type BeatGrid = { bpm: number; beats: number[]; confidence: number };

function deriveLines(words: WordTiming[]): LyricSectionLine[] {
  if (!words.length) return [];

  const lineGroups: WordTiming[][] = [];
  let currentGroup: WordTiming[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const current = words[i];
    const previous = words[i - 1];

    if (!currentGroup.length) {
      currentGroup.push(current);
      continue;
    }

    const gapSec = previous ? current.start - previous.end : 0;
    const shouldBreakByGap = gapSec > GAP_THRESHOLD_SEC;
    const shouldBreakByCount = currentGroup.length >= MAX_WORDS_PER_LINE;

    if (shouldBreakByGap || shouldBreakByCount) {
      lineGroups.push(currentGroup);
      currentGroup = [current];
      continue;
    }

    currentGroup.push(current);
  }

  if (currentGroup.length) {
    lineGroups.push(currentGroup);
  }

  const lines = lineGroups.map((group, index) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      lineIndex: index,
      text: group.map((w) => w.word).join(" "),
      startSec: first.start,
      endSec: last.end + END_TRAIL_SEC,
    };
  });

  for (let i = 0; i < lines.length - 1; i += 1) {
    const nextStart = lines[i + 1].startSec;
    const maxAllowedEnd = nextStart - LINE_END_BUFFER_SEC;
    if (lines[i].endSec > maxAllowedEnd) {
      lines[i].endSec = Math.max(lines[i].startSec, maxAllowedEnd);
    }
  }

  return lines;
}

function computeConfidence(section: AudioSection): number {
  let c = 0;
  switch (section.role) {
    case "intro":
    case "outro":
      c = 0.75;
      break;
    case "chorus":
      c = 0.45;
      if (section.hasLyricRepetition) c += 0.25;
      if (section.avgEnergy > 0.6) c += 0.2;
      if (section.beatDensity >= 2.2) c += 0.1;
      break;
    case "verse":
      c = 0.4;
      if (section.lyrics.length >= 4) c += 0.25;
      if (section.avgEnergy <= 0.6) c += 0.15;
      if (!section.hasLyricRepetition) c += 0.15;
      break;
    case "prechorus":
      c = 0.35;
      if (section.lyrics.length >= 2 && section.lyrics.length <= 6) c += 0.2;
      if (section.energyDelta > 0.05) c += 0.3;
      break;
    case "bridge":
      c = 0.35;
      if (!section.hasLyricRepetition) c += 0.3;
      if (section.avgEnergy < 0.5) c += 0.2;
      break;
    default:
      c = 0.4;
  }
  return Math.min(1, Math.max(0, c));
}

function deriveHeuristicLabel(
  section: AudioSection,
  roleCounters: Partial<Record<SectionRole, number>>,
  chorusCount: number,
): string {
  const nextCount = (roleCounters[section.role] ?? 0) + 1;
  roleCounters[section.role] = nextCount;

  switch (section.role) {
    case "intro":
      return "Intro";
    case "outro":
      return "Outro";
    case "bridge":
      return "Bridge";
    case "prechorus":
      return "Pre-Chorus";
    case "chorus":
      return chorusCount > 1 ? `Chorus ${nextCount}` : "Chorus";
    case "verse":
      return `Verse ${nextCount}`;
    case "drop":
      return "Drop";
    case "breakdown":
      return "Breakdown";
    default:
      return `Section ${section.index + 1}`;
  }
}

export function useLyricSections(
  words: Array<{ word: string; start: number; end: number }> | null | undefined,
  beatGrid: { bpm: number; beats: number[]; confidence: number } | null | undefined,
  cinematicDirection: CinematicDirection | null | undefined,
  durationSec: number,
): UseLyricSectionsResult {
  return useMemo((): UseLyricSectionsResult => {
    if (!words || words.length === 0) {
      return { sections: [], allLines: [], isReady: false };
    }

    const allLines = deriveLines(words);

    const timestampedLines: TimestampedLine[] = allLines.map((line) => ({
      text: line.text,
      startSec: line.startSec,
      endSec: line.endSec,
      lineIndex: line.lineIndex,
    }));

    const songSignature: SongSignature = {
      energyCurve: new Float32Array(0),
      spectralCentroidHz: 2000,
      durationSec,
    };

    const effectiveBeatGrid: BeatGrid = beatGrid ?? { bpm: 120, beats: [], confidence: 0 };

    const detected = detectSections({
      songSignature,
      beatGrid: effectiveBeatGrid,
      lines: timestampedLines,
      durationSec,
    });

    if (!detected.length) {
      return { sections: [], allLines, isReady: false };
    }

    const aiLabelMap = new Map<number, string>();
    const cdSections = cinematicDirection?.sections;
    if (Array.isArray(cdSections)) {
      for (const s of cdSections) {
        const label = (s as any).structuralLabel;
        if (typeof label === "string" && label.trim()) {
          aiLabelMap.set(s.sectionIndex, label.trim());
        }
      }
    }

    const roleCounters: Partial<Record<SectionRole, number>> = {};
    const chorusCount = detected.filter((section) => section.role === "chorus").length;

    const sections: LyricSection[] = detected.map((section) => {
      const aiLabel = aiLabelMap.get(section.index);
      const heurLabel = deriveHeuristicLabel(section, roleCounters, chorusCount);
      const label = aiLabel ?? heurLabel;
      const labelSource = aiLabel ? "ai" : "heuristic";

      const sectionLines = allLines.filter(
        (line) => line.startSec >= section.startSec - 0.1 && line.startSec < section.endSec + 0.3,
      );

      return {
        sectionIndex: section.index,
        role: section.role,
        label,
        labelSource,
        startSec: section.startSec,
        endSec: section.endSec,
        lines: sectionLines,
        confidence: computeConfidence(section),
      };
    });

    return {
      sections,
      allLines,
      isReady: sections.length > 0,
    };
  }, [words, beatGrid, cinematicDirection, durationSec]);
}
