import { useMemo } from "react";

import {
  detectSections,
  type AudioSection,
  type SectionRole,
  type TimestampedLine,
} from "@/engine/sectionDetector";
import { buildPhrases } from "@/lib/phraseEngine";
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
  labelSource: "ai" | "heuristic" | "user";
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

type BeatGrid = { bpm: number; beats: number[]; confidence: number };

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

function deriveHeuristicLabel(section: AudioSection): string {
  return `Section ${section.index + 1}`;
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

    const phraseResult = buildPhrases(words);
    const allLines: LyricSectionLine[] = phraseResult.phrases.map((p, index) => ({
      lineIndex: index,
      text: p.text,
      startSec: p.start,
      endSec: p.end,
    }));

    const timestampedLines: TimestampedLine[] = allLines.map((line) => ({
      text: line.text,
      startSec: line.startSec,
      endSec: line.endSec,
      lineIndex: line.lineIndex,
    }));

    const songSignature: SongSignature = {
      bpm: beatGrid?.bpm ?? 120,
      durationSec,
      tempoStability: 0.5,
      beatIntervalVariance: 0,
      rmsMean: 0.5,
      rmsVariance: 0,
      zeroCrossingRate: 0,
      spectralCentroidHz: 2000,
      lyricDensity: null,
      energyCurve: new Float32Array(0),
      analysisVersion: 1,
    };

    const effectiveBeatGrid: BeatGrid = beatGrid ?? { bpm: 120, beats: [], confidence: 0 };

    const detected = detectSections(
      songSignature,
      effectiveBeatGrid,
      timestampedLines,
      durationSec,
    );

    if (!detected.length) {
      return { sections: [], allLines, isReady: false };
    }

    const aiLabelMap = new Map<number, string>();
    const cdSections = cinematicDirection?.sections;
    if (Array.isArray(cdSections)) {
      for (const s of cdSections) {
        const label = s.structuralLabel;
        if (typeof label === "string" && label.trim()) {
          aiLabelMap.set(s.sectionIndex, label.trim());
        }
      }
    }

    const sections: LyricSection[] = detected.map((section) => {
      const aiLabel = aiLabelMap.get(section.index);
      const heurLabel = deriveHeuristicLabel(section);
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
