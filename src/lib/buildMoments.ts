/**
 * buildMoments — cluster AI phrases into 5-13s moments.
 *
 * Rules:
 *  1. NEVER break mid-phrase — boundaries fall between phrase.end and next phrase.start
 *  2. Prefer sentence-ending punctuation (. ? !) as break points
 *  3. Respect section boundaries — section change always starts a new moment
 *  4. Target ~8s, allow 5-13s range
 *  5. If no AI phrases, fall back to section-level moments
 */

import type { CanonicalAudioSection } from "@/types/audioSections";
import type { LyricSectionLine } from "@/hooks/useLyricSections";

const TARGET_SEC = 8;
const MIN_SEC = 5;
const MAX_SEC = 13;

export interface Moment {
  index: number;
  startSec: number;
  endSec: number;
  /** Section label (verse, chorus, bridge, etc.) */
  label: string | null;
  /** Indices into the allLines array */
  lines: LyricSectionLine[];
  /** AI phrase indices that belong to this moment */
  phraseIndices: number[];
  /** 0-1 energy level derived from phrase density and dynamics */
  energy: number;
  /** Section index this moment belongs to (for image selection) */
  sectionIndex: number;
  /** 0-1 position within the section (0 = section start, 1 = section end) */
  sectionProgress: number;
}

interface PhraseInput {
  start: number;
  end: number;
  text: string;
}

function getWordCount(text: string | null | undefined): number {
  const trimmed = text?.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function computeMomentEnergy(momentPhrases: PhraseInput[]): number {
  if (!momentPhrases.length) return 0.5;

  const totalDurationSec = momentPhrases.reduce((sum, p) => sum + (p.end - p.start), 0);
  const totalWords = momentPhrases.reduce((sum, p) => sum + getWordCount(p.text), 0);
  const wps = totalDurationSec > 0 ? totalWords / totalDurationSec : 0;

  const soloCount = momentPhrases.filter((p) => getWordCount(p.text) === 1).length;
  const soloRatio = soloCount / momentPhrases.length;

  const wpsNorm = Math.min(1, Math.max(0, (wps - 1) / 5));
  const soloBoost = soloRatio * 0.2;
  const raw = wpsNorm * 0.7 + soloBoost + 0.15;

  return Math.min(1, Math.max(0, raw));
}

function assignSectionProgress(moments: Moment[]): void {
  const sectionMoments = new Map<number, Moment[]>();
  for (const m of moments) {
    const list = sectionMoments.get(m.sectionIndex) ?? [];
    list.push(m);
    sectionMoments.set(m.sectionIndex, list);
  }
  for (const [, mList] of sectionMoments) {
    mList.forEach((m, i) => {
      m.sectionProgress = mList.length > 1 ? i / (mList.length - 1) : 0.5;
    });
  }
}

/** True if text ends with sentence-ending punctuation */
function isSentenceEnd(text: string): boolean {
  const trimmed = text.trimEnd();
  return /[.?!]$/.test(trimmed);
}

/** Assign each phrase to a section by its start time */
function assignSection(
  phraseStart: number,
  sections: CanonicalAudioSection[],
): { sectionIndex: number; label: string | null } {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (phraseStart >= sections[i].startSec - 0.15) {
      return { sectionIndex: i, label: sections[i].role };
    }
  }
  return { sectionIndex: 0, label: sections[0]?.role ?? null };
}

export function buildMoments(
  phrases: PhraseInput[],
  sections: CanonicalAudioSection[],
  allLines: LyricSectionLine[],
  durationSec: number,
): Moment[] {
  if (phrases.length === 0) {
    return buildSectionFallback(sections, allLines, durationSec);
  }

  const moments: Moment[] = [];
  let accumulator: { phraseIdx: number; phrase: PhraseInput; sectionIdx: number; label: string | null }[] = [];

  const flush = () => {
    if (accumulator.length === 0) return;
    const first = accumulator[0];
    const last = accumulator[accumulator.length - 1];
    const startSec = first.phrase.start;
    const endSec = last.phrase.end;

    const momentLines = allLines.filter(
      (l) => l.startSec >= startSec - 0.15 && l.startSec < endSec + 0.15,
    );

    moments.push({
      index: moments.length,
      startSec,
      endSec,
      label: first.label,
      lines: momentLines,
      phraseIndices: accumulator.map((a) => a.phraseIdx),
      energy: computeMomentEnergy(accumulator.map((a) => a.phrase)),
      sectionIndex: first.sectionIdx,
      sectionProgress: 0.5,
    });

    accumulator = [];
  };

  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i];
    const { sectionIndex, label } = assignSection(phrase.start, sections);

    if (accumulator.length > 0) {
      const prevSectionIdx = accumulator[accumulator.length - 1].sectionIdx;
      if (sectionIndex !== prevSectionIdx) {
        flush();
      }
    }

    if (accumulator.length > 0) {
      const tentativeDur = phrase.end - accumulator[0].phrase.start;

      if (tentativeDur > MAX_SEC) {
        flush();
        accumulator.push({ phraseIdx: i, phrase, sectionIdx: sectionIndex, label });
        continue;
      }
    }

    accumulator.push({ phraseIdx: i, phrase, sectionIdx: sectionIndex, label });

    const currentDur = accumulator[accumulator.length - 1].phrase.end - accumulator[0].phrase.start;

    if (currentDur >= TARGET_SEC && isSentenceEnd(phrase.text)) {
      flush();
    } else if (currentDur >= TARGET_SEC && i + 1 < phrases.length) {
      const nextPhrase = phrases[i + 1];
      const nextSection = assignSection(nextPhrase.start, sections);

      if (nextSection.sectionIndex !== sectionIndex) {
        continue;
      }

      const withNextDur = nextPhrase.end - accumulator[0].phrase.start;
      if (withNextDur > MAX_SEC) {
        flush();
      }
    }
  }

  flush();

  const merged: Moment[] = [];
  for (const moment of moments) {
    const dur = moment.endSec - moment.startSec;

    if (dur < MIN_SEC && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.endSec = moment.endSec;
      prev.lines = allLines.filter(
        (l) => l.startSec >= prev.startSec - 0.15 && l.startSec < prev.endSec + 0.15,
      );
      prev.phraseIndices.push(...moment.phraseIndices);
      prev.energy = computeMomentEnergy(prev.phraseIndices.map((idx) => phrases[idx]).filter(Boolean));
    } else if (dur < MIN_SEC && merged.length === 0 && moments.indexOf(moment) < moments.length - 1) {
      merged.push({ ...moment });
    } else {
      merged.push({ ...moment });
    }
  }

  merged.forEach((m, i) => {
    m.index = i;
  });
  assignSectionProgress(merged);

  return merged;
}

/** Fallback: one moment per section, subdivide long sections */
function buildSectionFallback(
  sections: CanonicalAudioSection[],
  allLines: LyricSectionLine[],
  durationSec: number,
): Moment[] {
  const moments: Moment[] = [];

  const effectiveSections = sections.length > 0
    ? sections
    : [{ sectionIndex: 0, startSec: 0, endSec: durationSec, role: null }];

  for (const section of effectiveSections) {
    const dur = section.endSec - section.startSec;
    const label = section.role ?? null;

    if (dur <= MAX_SEC) {
      const momentLines = allLines.filter(
        (l) => l.startSec >= section.startSec - 0.15 && l.startSec < section.endSec + 0.15,
      );
      moments.push({
        index: moments.length,
        startSec: section.startSec,
        endSec: section.endSec,
        label,
        lines: momentLines,
        phraseIndices: [],
        energy: 0.5,
        sectionIndex: section.sectionIndex ?? 0,
        sectionProgress: 0.5,
      });
    } else {
      let cursor = section.startSec;
      while (cursor < section.endSec - MIN_SEC) {
        const end = Math.min(cursor + TARGET_SEC, section.endSec);
        const momentLines = allLines.filter(
          (l) => l.startSec >= cursor - 0.15 && l.startSec < end + 0.15,
        );
        moments.push({
          index: moments.length,
          startSec: cursor,
          endSec: end,
          label,
          lines: momentLines,
          phraseIndices: [],
          energy: 0.5,
          sectionIndex: section.sectionIndex ?? 0,
          sectionProgress: 0.5,
        });
        cursor = end;
      }
    }
  }

  assignSectionProgress(moments);

  return moments;
}
