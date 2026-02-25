import type { Chapter, TensionStage, WordDirective } from "@/types/CinematicDirection";
import type { DirectionInterpreter } from "@/engine/DirectionInterpreter";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import * as WordClassifier from "@/engine/WordClassifier";

export interface PlanLine {
  lineIndex: number;
  start: number;
  end: number;
  text: string;
  words: string[];
  wordsUpper: string[];
  normalizedWords: string[];
  wordStartTimes: number[];
  snappedWordStartTimes: number[];
  directives: (WordDirective | null)[];
  appearanceCounts: number[];
  baseFontSize: number;
  baseSpaceWidth: number;
  baseWordWidths: number[];
  hasImpactWord: boolean;
}

export interface WordPlan {
  lines: PlanLine[];
  lineStarts: Float64Array;
  lineEnds: Float64Array;
  hookStartTimes: Float64Array;
  chapterBoundaries: Array<{ start: number; end: number; chapter: Chapter }>;
  tensionBoundaries: Array<{ start: number; end: number; stage: TensionStage }>;
  /**
   * Word Plan extension notes:
   * - Add new per-word static fields on PlanLine (e.g. semantic buckets, stylistic flags).
   * - Keep time-dependent transforms in live loop; only precompute immutable lookup tables.
   * - Rebuild plan on resize/canvas width changes when layout metrics can change.
   */
}

const snapToNearestBeat = (timestamp: number, beats: number[], tolerance = 0.1): number => {
  if (beats.length === 0) return timestamp;
  let nearest = beats[0];
  let minDelta = Math.abs(nearest - timestamp);
  for (let i = 1; i < beats.length; i += 1) {
    const d = Math.abs(beats[i] - timestamp);
    if (d < minDelta) {
      minDelta = d;
      nearest = beats[i];
    }
  }
  return minDelta <= tolerance ? nearest : timestamp;
};

export function buildWordPlan(opts: {
  ctx: CanvasRenderingContext2D;
  lines: Array<{ start: number; end: number; text: string }>;
  sortedBeats: number[];
  interpreter: DirectionInterpreter | null;
  chapters?: Chapter[];
  tensionCurve?: TensionStage[];
  effectiveSystem: string;
  cw: number;
  ch: number;
  cinematicTextTransform?: string;
}): WordPlan {
  const {
    ctx,
    lines,
    sortedBeats,
    interpreter,
    chapters,
    tensionCurve,
    effectiveSystem,
    cw,
    ch,
    cinematicTextTransform,
  } = opts;

  const planLines: PlanLine[] = [];
  const seenWordCounts = new Map<string, number>();
  const lineStarts = new Float64Array(lines.length);
  const lineEnds = new Float64Array(lines.length);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    lineStarts[lineIndex] = line.start;
    lineEnds[lineIndex] = line.end;

    const words = line.text.split(/\s+/).filter(Boolean);
    const wordsUpper = cinematicTextTransform === "uppercase" ? words.map(w => w.toUpperCase()) : words;
    const normalizedWords = words.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, ""));

    const lineDuration = Math.max(0.001, line.end - line.start);
    const wordsPerSecond = words.length > 0 ? words.length / lineDuration : 1;
    const wordDelay = wordsPerSecond > 0 ? 1 / wordsPerSecond : lineDuration;
    const wordStartTimes = new Array(words.length);
    const snappedWordStartTimes = new Array(words.length);
    const directives = new Array<WordDirective | null>(words.length);
    const appearanceCounts = new Array(words.length);

    for (let i = 0; i < words.length; i += 1) {
      const start = line.start + i * wordDelay;
      wordStartTimes[i] = start;
      snappedWordStartTimes[i] = snapToNearestBeat(start, sortedBeats);
      directives[i] = interpreter?.getWordDirective(words[i]) ?? null;
      const normalized = normalizedWords[i] || words[i].toLowerCase();
      const nextCount = (seenWordCounts.get(normalized) ?? 0) + 1;
      seenWordCounts.set(normalized, nextCount);
      appearanceCounts[i] = nextCount;
    }

    const stacked = computeStackedLayout(ctx, line.text, cw, ch, effectiveSystem);
    const fs = stacked.isStacked ? stacked.fs : computeFitFontSize(ctx, line.text, cw, effectiveSystem).fs;
    const prevFont = ctx.font;
    ctx.font = `400 ${fs}px \"Montserrat\", Inter, ui-sans-serif, system-ui`;
    const baseWordWidths = wordsUpper.map((word) => ctx.measureText(word).width);
    const baseSpaceWidth = ctx.measureText(" ").width;
    ctx.font = prevFont;

    planLines.push({
      lineIndex,
      start: line.start,
      end: line.end,
      text: line.text,
      words,
      wordsUpper,
      normalizedWords,
      wordStartTimes,
      snappedWordStartTimes,
      directives,
      appearanceCounts,
      baseFontSize: fs,
      baseSpaceWidth,
      baseWordWidths,
      hasImpactWord: words.some((word) => WordClassifier.classifyWord(word) === "IMPACT"),
    });
  }

  const hookStartTimes = new Float64Array(
    planLines
      .filter((line) => (interpreter?.getLineDirection(line.lineIndex)?.emotionalIntent ?? "").toLowerCase().includes("hook"))
      .map((line) => line.start)
      .sort((a, b) => a - b),
  );

  return {
    lines: planLines,
    lineStarts,
    lineEnds,
    hookStartTimes,
    chapterBoundaries: (chapters ?? []).map((chapter) => ({ start: chapter.startRatio, end: chapter.endRatio, chapter })),
    tensionBoundaries: (tensionCurve ?? []).map((stage) => ({ start: stage.startRatio, end: stage.endRatio, stage })),
  };
}

export const getActiveLineIndexMonotonic = (
  t: number,
  starts: Float64Array,
  ends: Float64Array,
  prevIndex: number,
): number => {
  let idx = Math.max(-1, Math.min(prevIndex, starts.length - 1));
  while (idx + 1 < starts.length && t >= starts[idx + 1]) idx += 1;
  while (idx >= 0 && t < starts[idx]) idx -= 1;
  if (idx >= 0 && t >= starts[idx] && t < ends[idx]) return idx;
  return -1;
};

export const getNextStartAfterMonotonic = (t: number, starts: Float64Array, prevPtr: number): { value: number; ptr: number } => {
  let ptr = Math.max(0, Math.min(prevPtr, starts.length));
  while (ptr < starts.length && starts[ptr] <= t) ptr += 1;
  return { value: ptr < starts.length ? starts[ptr] : Number.POSITIVE_INFINITY, ptr };
};
