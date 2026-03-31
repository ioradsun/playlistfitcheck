import type { CinematicDirection, CinematicSection, CinematicPhrase } from "@/types/CinematicDirection";
import { enrichSections } from "@/engine/directionResolvers";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { FrameRenderState } from "@/engine/presetDerivation";
import { fitTextToViewport, type MeasureContext, type Slot } from "@/engine/textLayout";
import {
  deriveAllSectionMods,
  deriveSongMotionIdentity,
  type SectionMotionMod,
  type SongMotionIdentity,
} from "@/engine/MotionIdentity";
import { getEffectTier } from "@/engine/timeTiers";
import { resolveTypographyFromDirection } from "@/lib/fontResolver";


export type LineBeatMap = {
  lineIndex: number;
  beats: number[];
  strongBeats: number[];
  beatCount: number;
  beatsPerSecond: number;
  firstBeat: number;
  lastBeat: number;
};

export type ScenePayload = {
  lines: LyricLine[];
  words?: Array<{ word: string; start: number; end: number; speaker_id?: string }>;
  bpm?: number | null;
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  motion_profile_spec: PhysicsSpec;
  frame_state: FrameRenderState | null;
  cinematic_direction: CinematicDirection | null;
  auto_palettes?: string[][];
  palette: string[];
  lineBeatMap: LineBeatMap[];
  songStart: number;
  songEnd: number;
};

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}


export interface AnimState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  skewX: number;
  rotation: number;
}


// ═══ V3 Motion Characters ═══
// Six perceptually distinct animations. Entry = character forward. Exit = character reversed.
export type MotionCharacter = 'slam' | 'rise' | 'drift' | 'snap' | 'bloom' | 'whisper';

interface TypographyProfile {
  fontFamily: string;
  fontWeight: number;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
  heroWeight: number;
}

export type VisualMode = 'intimate' | 'cinematic' | 'explosive';
interface WordDirectiveLike { word?: string; emphasisLevel?: number; elementalClass?: string; isolation?: boolean; }
interface WordMetaEntry { word: string; start: number; end: number; clean: string; directive: WordDirectiveLike | null; lineIndex: number; wordIndex: number; isHeroWord?: boolean; isAdlib?: boolean; }
export interface PhraseGroup { words: WordMetaEntry[]; start: number; end: number; anchorWordIdx: number; lineIndex: number; groupIndex: number; phraseHeroWord?: string; }



const FILLER_WORDS = new Set(['a','an','the','to','of','and','or','but','in','on','at','for','with','from','by','up','down','is','am','are','was','were','be','been','being','it','its','that','this','these','those','i','you','he','she','we','they']);
const CONNECTOR_WORDS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'and', 'but', 'or', 'so', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'if', 'when', 'while', 'that']);
const MIN_GROUP_DURATION = 0.5;
const MAX_GROUP_SIZE = 5;


function isFillerWord(word: string): boolean { return FILLER_WORDS.has(word.replace(/[^a-zA-Z]/g, '').toLowerCase()); }

function getVisualMode(_payload: ScenePayload): VisualMode {
  return 'cinematic'; // scattered layouts removed — fitTextToViewport handles all positioning
}

function findAnchorWord(words: WordMetaEntry[]): number {
  let maxScore = -1; let maxIdx = words.length - 1;
  for (let i = 0; i < words.length; i += 1) {
    const emp = 1;
    const isImpact = false;
    const isRising = false;
    const isFiller = isFillerWord(words[i].word);
    const wordLen = words[i].clean.length;
    const score = (emp * 2) + (isImpact ? 6 : 0) + (isRising ? 4 : 0) - (isFiller ? 5 : 0) + (wordLen > 5 ? 2 : 0) + (wordLen > 8 ? 2 : 0);
    if (score > maxScore) { maxScore = score; maxIdx = i; }
  }
  return maxIdx;
}
function mergeShortGroups(groups: PhraseGroup[]): PhraseGroup[] {
  const result: PhraseGroup[] = []; let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    if (g.end - g.start < MIN_GROUP_DURATION && i < groups.length - 1) {
      const next = groups[i + 1];
      if (next.lineIndex === g.lineIndex && (g.words.length + next.words.length) <= MAX_GROUP_SIZE) {
        const mergedWords = [...g.words, ...next.words];
        result.push({ words: mergedWords, start: g.start, end: next.end, anchorWordIdx: findAnchorWord(mergedWords), lineIndex: g.lineIndex, groupIndex: g.groupIndex });
        i += 2; continue;
      }
    }
    result.push(g); i += 1;
  }
  return result;
}
/**
 * Build phrase groups from AI-provided phrases OR fallback to mechanical grouping.
 *
 * AI phrases are grouped by meaning + timing (the AI sees the full lyrics and
 * understands which words form a complete thought). When available, they produce
 * much more natural grouping than the mechanical punctuation/word-count splitter.
 *
 * Fallback: if no AI phrases are available (old cached data, missing field),
 * the mechanical grouper still runs — same behavior as before Phase 5.
 */
function buildPhraseGroups(wordMeta: WordMetaEntry[], aiPhrases?: CinematicPhrase[]): PhraseGroup[] {
  // ── Try AI phrases first ──
  if (aiPhrases && aiPhrases.length > 0) {
    const isGlobalFormat = aiPhrases.some(
      (phrase) => phrase.lineIndex === undefined || phrase.lineIndex === null,
    );

    if (isGlobalFormat) {
      const groups: PhraseGroup[] = [];
      let groupIdx = 0;

      for (const phrase of aiPhrases) {
        const [startIdx, endIdx] = phrase.wordRange;

        // Global indices into the flat wordMeta array
        const safeStart = Math.max(0, Math.min(startIdx, wordMeta.length - 1));
        const safeEnd = Math.max(safeStart, Math.min(endIdx, wordMeta.length - 1));

        const phraseWords = wordMeta.slice(safeStart, safeEnd + 1);
        if (phraseWords.length === 0) continue;

        // Mark hero word in wordMeta
        if (phrase.heroWord) {
          const heroClean = phrase.heroWord.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const wm of phraseWords) {
            if (wm.clean === heroClean) {
              wm.isHeroWord = true;
              break;
            }
          }
        }

        // lineIndex derived from first word (for backward compat with palette indexing)
        const lineIndex = phraseWords[0].lineIndex;

        const grp: PhraseGroup = {
          words: phraseWords,
          start: phraseWords[0].start,
          end: phraseWords[phraseWords.length - 1].end,
          anchorWordIdx: findAnchorWord(phraseWords),
          lineIndex,
          groupIndex: groupIdx,
          phraseHeroWord: phrase.heroWord ?? '',
        };
        groups.push(grp);
        groupIdx++;
      }

      if (groups.length > 0) {
        groups.sort((a, b) => a.start - b.start);

        // Check for ungrouped words
        const groupedIndices = new Set<number>();
        for (const g of groups) {
          for (const w of g.words) {
            const globalIdx = wordMeta.indexOf(w);
            if (globalIdx >= 0) groupedIndices.add(globalIdx);
          }
        }

        const ungrouped: WordMetaEntry[] = [];
        for (let i = 0; i < wordMeta.length; i++) {
          if (!groupedIndices.has(i)) ungrouped.push(wordMeta[i]);
        }

        if (ungrouped.length > 0) {
          const fallbackGroups = mechanicalGrouping(ungrouped);
          for (const fg of fallbackGroups) {
            fg.groupIndex = groupIdx++;
            groups.push(fg);
          }
          groups.sort((a, b) => a.start - b.start);
        }

        return groups;
      }
    } else {
      const groups: PhraseGroup[] = [];
      let groupIdx = 0;

      const lineMap = new Map<number, WordMetaEntry[]>();
      for (const wm of wordMeta) {
        if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []);
        lineMap.get(wm.lineIndex)!.push(wm);
      }

      for (const phrase of aiPhrases) {
        const lineIndex = phrase.lineIndex;
        if (typeof lineIndex !== 'number') continue;

        const lineWords = lineMap.get(lineIndex);
        if (!lineWords || lineWords.length === 0) continue;

        const [startIdx, endIdx] = phrase.wordRange;
        const safeStart = Math.max(0, Math.min(startIdx, lineWords.length - 1));
        const safeEnd = Math.max(safeStart, Math.min(endIdx, lineWords.length - 1));

        const phraseWords = lineWords.slice(safeStart, safeEnd + 1);
        if (phraseWords.length === 0) continue;

        // Mark hero word in wordMeta
        if (phrase.heroWord) {
          const heroClean = phrase.heroWord.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const wm of phraseWords) {
            if (wm.clean === heroClean) {
              wm.isHeroWord = true;
              break;
            }
          }
        }

        const grp: PhraseGroup = {
          words: phraseWords,
          start: phraseWords[0].start,
          end: phraseWords[phraseWords.length - 1].end,
          anchorWordIdx: findAnchorWord(phraseWords),
          lineIndex,
          groupIndex: groupIdx,
          phraseHeroWord: phrase.heroWord ?? '',
        };
        groups.push(grp);
        groupIdx++;
      }

      if (groups.length > 0) {
        groups.sort((a, b) => a.start - b.start);

        const groupedWordIds = new Set<string>();
        for (const g of groups) {
          for (const w of g.words) {
            groupedWordIds.add(`${w.lineIndex}-${w.wordIndex}`);
          }
        }

        const ungrouped: WordMetaEntry[] = [];
        for (const wm of wordMeta) {
          if (!groupedWordIds.has(`${wm.lineIndex}-${wm.wordIndex}`)) {
            ungrouped.push(wm);
          }
        }

        if (ungrouped.length > 0) {
          const fallbackGroups = mechanicalGrouping(ungrouped);
          for (const fg of fallbackGroups) {
            fg.groupIndex = groupIdx++;
            groups.push(fg);
          }
          groups.sort((a, b) => a.start - b.start);
        }

        return groups;
      }
    }
  }

  // ── Fallback: mechanical grouping (same as original) ──
  return mechanicalGrouping(wordMeta);
}

/**
 * Mechanical phrase grouping — splits at punctuation and MAX_GROUP_SIZE.
 * Used as fallback when AI phrases aren't available.
 */
function mechanicalGrouping(wordMeta: WordMetaEntry[]): PhraseGroup[] {
  const lineMap = new Map<number, WordMetaEntry[]>();
  for (const wm of wordMeta) {
    if (!lineMap.has(wm.lineIndex)) lineMap.set(wm.lineIndex, []);
    lineMap.get(wm.lineIndex)!.push(wm);
  }
  const groups: PhraseGroup[] = [];
  for (const [lineIdx, words] of lineMap) {
    let current: WordMetaEntry[] = [];
    let groupIdx = 0;
    const flushGroup = () => {
      if (!current.length) return;
      groups.push({
        words: [...current],
        start: current[0].start,
        end: current[current.length - 1].end,
        anchorWordIdx: findAnchorWord(current),
        lineIndex: lineIdx,
        groupIndex: groupIdx,
      });
      groupIdx += 1;
      current = [];
    };
    for (let i = 0; i < words.length; i += 1) {
      const wm = words[i];
      current.push(wm);
      const duration = current[current.length - 1].end - current[0].start;
      const isNaturalBreak = /[,\.!?;]$/.test(wm.word);
      const isMaxSize = current.length >= MAX_GROUP_SIZE;
      const isLast = i === words.length - 1;
      const isConnector = CONNECTOR_WORDS.has(wm.word.replace(/[^a-zA-Z']/g, '').toLowerCase());
      if (isLast) flushGroup();
      else if ((isNaturalBreak || isMaxSize) && duration >= MIN_GROUP_DURATION && !isConnector) flushGroup();
    }
  }
  groups.sort((a, b) => a.start - b.start);
  return mergeShortGroups(groups).map((group) => ({
    ...group,
    end: Math.max(group.end, group.start + MIN_GROUP_DURATION),
  }));
}



function phraseAnimDurations(wordCount: number, durationMs: number): { entryDuration: number; exitDuration: number; linger: number; stagger: number } {
  const tier = getEffectTier(durationMs);
  const density = wordCount / Math.max(0.25, durationMs / 1000);
  const tierBase = {
    flash: { entryDuration: 0.08, exitDuration: 0.07, linger: 0.04, stagger: 0.018 },
    quick: { entryDuration: 0.11, exitDuration: 0.09, linger: 0.07, stagger: 0.022 },
    normal: { entryDuration: 0.16, exitDuration: 0.12, linger: 0.12, stagger: 0.028 },
    held: { entryDuration: 0.2, exitDuration: 0.16, linger: 0.18, stagger: 0.034 },
    sustained: { entryDuration: 0.26, exitDuration: 0.2, linger: 0.24, stagger: 0.04 },
  }[tier];
  const densityClamp = Math.max(0.72, Math.min(1.15, 1.08 - density * 0.07));
  return {
    entryDuration: tierBase.entryDuration * densityClamp,
    exitDuration: tierBase.exitDuration * densityClamp,
    linger: tierBase.linger,
    stagger: tierBase.stagger,
  };
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

type PresentationMode = 'horiz_center';

/**
 * Layout rules: phrase structure → composition.
 * Variety comes from lyrics, not randomness.
 */
function resolveLayout(wordCount: number): {
  composition: 'line';
  revealStyle: 'instant';
  maxLines: number | undefined;
} {
  // All words visible immediately. No reveal. No stagger.
  // < 4 words: single horizontal line. 4+: natural horizontal wrapping.
  return {
    composition: 'line',
    revealStyle: 'instant',
    maxLines: wordCount < 4 ? 1 : undefined,
  };
}

function assignPresentationModes(
  phraseGroups: PhraseGroup[],
  _wordMeta: WordMetaEntry[],
  _aiPhrases?: CinematicPhrase[],
): void {
  for (const group of phraseGroups) {
    const wc = group.words.length;
    const layout = resolveLayout(wc);
    const g = group as any;
    g.composition = 'line';
    g.bias = 'center';
    g.revealStyle = 'instant';
    g.holdClass = 'medium_groove';
    g.entryCharacter = 'drift';
    g.exitCharacter = 'none';
    g.vibrateOnHold = false;
    g.elementalWash = false;
    g.presentationMode = 'horiz_center';
    g._resolvedMaxLines = layout.maxLines; // pass to layout computation
  }
}

export interface CompiledWord { id: string; text: string; clean: string; wordIndex: number; layoutX: number; layoutY: number; baseFontSize: number; layoutWidth: number; wordStart: number; fontWeight: number; fontFamily: string; color: string; isHeroWord?: boolean; isAdlib?: boolean; isAnchor: boolean; isFiller: boolean; emphasisLevel: number; wordDuration: number; }
export interface CompiledPhraseGroup {
  lineIndex: number;
  groupIndex: number;
  anchorWordIdx: number;
  start: number;
  end: number;
  words: CompiledWord[];
  staggerDelay: number;
  entryDuration: number;
  exitDuration: number;
  lingerDuration: number;
  behaviorIntensity: number;
  composition: 'stack' | 'line' | 'center_word';
  bias: 'left' | 'center' | 'right';
  heroType: 'word' | 'phrase';
  revealStyle: 'instant' | 'stagger_fast' | 'stagger_slow';
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
  energyTier: 'intimate' | 'groove' | 'lift' | 'impact' | 'surprise';
  presentationMode?: string;
  entryCharacter?: string;
  exitCharacter?: string;
  vibrateOnHold?: boolean;
  elementalWash?: boolean;
  /** AI-chosen exit effect — passed to ExitEffect renderer */
  exitEffect?: string;
  /** True if this group contains adlib/background vocal words */
  isAdlib?: boolean;
}
export interface BeatEvent { time: number; springVelocity: number; glowMax: number; }
export interface CompiledChapter { index: number; startRatio: number; endRatio: number; targetZoom: number; emotionalIntensity: number; typography: { fontFamily: string; fontWeight: number; heroWeight: number; textTransform: string; }; atmosphere: string; }
export interface CompiledScene { phraseGroups: CompiledPhraseGroup[]; songStartSec: number; songEndSec: number; durationSec: number; beatEvents: BeatEvent[]; bpm: number; chapters: CompiledChapter[]; emotionalArc: string; visualMode: VisualMode; baseFontFamily: string; baseFontWeight: number; baseTextTransform: string; palettes: string[][]; animParams: { linger: number; stagger: number; entryDuration: number; exitDuration: number; }; songMotion: SongMotionIdentity; sectionMods: SectionMotionMod[]; }

const distanceToZoom: Record<string, number> = { 'Wide': 0.82, 'Medium': 1.0, 'Close': 1.15, 'CloseUp': 1.2, 'ExtremeClose': 1.35, 'FloatingInWorld': 0.95 };

function computeEmphasisFromDuration(durationSec: number): number {
  const ms = durationSec * 1000;
  if (ms < 150) return 1;
  if (ms < 250) return 2;
  if (ms < 400) return 3;
  if (ms < 600) return 4;
  return 5;
}

function resolveV3Palette(payload: ScenePayload, chapterProgress?: number): string[] {
  if (payload.auto_palettes?.length) {
    if (chapterProgress != null && payload.cinematic_direction?.chapters?.length) {
      const idx = payload.cinematic_direction.chapters.findIndex((c) => chapterProgress >= (c.startRatio ?? 0) && chapterProgress < (c.endRatio ?? 1));
      if (idx >= 0 && payload.auto_palettes[idx]) return payload.auto_palettes[idx];
    }
    return payload.auto_palettes[0];
  }
  return payload.palette;
}

export function compileScene(payload: ScenePayload, options?: { viewportWidth?: number; viewportHeight?: number }): CompiledScene {
  const durationSec = Math.max(0.01, payload.songEnd - payload.songStart);
  const rawChapters = (payload.cinematic_direction?.chapters ?? []) as Array<any>;
  const chapters = rawChapters.length > 0 ? rawChapters : enrichSections(payload.cinematic_direction?.sections as CinematicSection[] | undefined);
  const visualMode = getVisualMode(payload);
  const rawWords = payload.words ?? [];
  // Fix zero-duration tokens: give them a small duration instead of dropping them.
  // Dropping shifts all word indices and breaks AI phrase wordRange alignment.
  const words = rawWords.map((w, i) => {
    if (w.start < 0 || w.end < 0) {
      // Truly invalid — give it the previous word's end time as both start and end
      const prev = i > 0 ? rawWords[i - 1] : null;
      return { ...w, start: prev?.end ?? 0, end: (prev?.end ?? 0) + 0.05 };
    }
    if (w.start >= w.end) {
      // Zero-duration: give it 50ms duration so it's not dropped
      return { ...w, end: w.start + 0.05 };
    }
    return w;
  });
  const wordMeta: WordMetaEntry[] = words.map((w, i) => {
    // Normalize curly quotes/apostrophes before cleaning, then strip
    const normalized = w.word
      .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")  // curly → straight apostrophe
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');               // curly → straight quote
    const clean = normalized.replace(/[^a-zA-Z0-9']/g, '').toLowerCase()
      .replace(/^'+|'+$/g, '');  // strip leading/trailing apostrophes from clean key
    const lineIndex = Math.max(0, payload.lines.findIndex((l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? Infinity)));
    // ── 3-layer adlib detection ──────────────────────────────────────
    // Layer 1: Gemini line-level tag
    const line = payload.lines[lineIndex];
    const isAdlibFromLine = (line as any)?.tag === "adlib";

    // Layer 2: ElevenLabs Scribe speaker diarization
    const isAdlibFromSpeaker = (w as any).speaker_id && (w as any).speaker_id !== "speaker_0";

    // Layer 3: Ghost word heuristics (infer adlib from timing anomalies)
    // Scribe "fills in" background vocals it can hear faintly — these have
    // telltale timing signatures: truly zero duration, or multiple words
    // clustered at the exact same timestamp under a sustained note.
    //
    // IMPORTANT: Normal short words ("it", "a", "the") can be 10-40ms.
    // Only flag words with ZERO duration (start === end) or near-zero
    // AND they must appear in clusters (2+ consecutive ghost words).
    const wordDur = Math.round((w.end - w.start) * 1000); // milliseconds
    const prev = i > 0 ? words[i - 1] : null;
    const next = i < words.length - 1 ? words[i + 1] : null;

    // Zero-duration: start === end (within 10ms rounding)
    const isZeroDuration = wordDur <= 10;

    // Cluster check: is this zero-duration word next to another zero-duration word?
    // Single short words are normal. 2+ consecutive zero-duration words = ghost cluster.
    const prevDurMs = prev ? Math.round((prev.end - prev.start) * 1000) : 999;
    const nextDurMs = next ? Math.round((next.end - next.start) * 1000) : 999;
    const hasZeroNeighbor = (prevDurMs <= 10) || (nextDurMs <= 10);

    // Ghost: zero duration AND part of a cluster (neighbor also zero-duration)
    const isGhostCluster = isZeroDuration && hasZeroNeighbor;

    // Echo under sustain: previous word held >1.5s, this word starts at its end,
    // AND this word is zero/near-zero duration
    const prevDur = prev ? prev.end - prev.start : 0;
    const isEchoUnderSustain = isZeroDuration
      && prevDur > 1.5
      && prev != null
      && Math.abs(w.start - prev.end) < 0.05;

    const isInferredAdlib = isGhostCluster || isEchoUnderSustain;

    const isAdlib = isAdlibFromLine || isAdlibFromSpeaker || isInferredAdlib;
    return { ...w, clean, directive: null, lineIndex, wordIndex: 0, isAdlib: isAdlib || undefined };
  });
  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) { lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0; wm.wordIndex = lineWordCounters[wm.lineIndex]++; }
  const globalWordIndex = new Map<WordMetaEntry, number>();
  wordMeta.forEach((wm, idx) => globalWordIndex.set(wm, idx));

  const aiPhrases = (payload.cinematic_direction as any)?.phrases as CinematicPhrase[] | undefined;
  const phraseGroups = buildPhraseGroups(wordMeta, aiPhrases);
  // ── Separate adlib phrases from main phrases ──
  // Adlib words render in a peripheral zone, not center-stage.
  // Split any phrase group that mixes main + adlib into two groups.
  // Pure-adlib groups get a different layout (smaller, offset).
  const mainGroups: typeof phraseGroups = [];
  const adlibGroups: typeof phraseGroups = [];

  for (const group of phraseGroups) {
    const mainWords = group.words.filter(w => !w.isAdlib);
    const adlibWords = group.words.filter(w => w.isAdlib);

    if (adlibWords.length === 0) {
      // Pure main — keep as-is
      mainGroups.push(group);
    } else if (mainWords.length === 0) {
      // Pure adlib
      adlibGroups.push(group);
    } else {
      // Mixed — split into two groups
      if (mainWords.length > 0) {
        mainGroups.push({
          ...group,
          words: mainWords,
          end: mainWords[mainWords.length - 1].end,
          anchorWordIdx: findAnchorWord(mainWords),
        });
      }
      if (adlibWords.length > 0) {
        adlibGroups.push({
          ...group,
          words: adlibWords,
          start: adlibWords[0].start,
          end: adlibWords[adlibWords.length - 1].end,
          anchorWordIdx: 0,
          groupIndex: group.groupIndex + 10000, // offset to avoid collision
        });
      }
    }
  }

  // ── Cap main phrase groups: split any group > MAX_GROUP_SIZE ──
  const cappedMainGroups: typeof phraseGroups = [];
  for (const group of mainGroups) {
    if (group.words.length <= MAX_GROUP_SIZE) {
      cappedMainGroups.push(group);
    } else {
      // Split at MAX_GROUP_SIZE boundaries
      for (let i = 0; i < group.words.length; i += MAX_GROUP_SIZE) {
        const chunk = group.words.slice(i, i + MAX_GROUP_SIZE);
        if (chunk.length === 0) continue;
        cappedMainGroups.push({
          ...group,
          words: chunk,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
          anchorWordIdx: findAnchorWord(chunk),
          groupIndex: group.groupIndex + (i > 0 ? i : 0),
        });
      }
    }
  }
  // Assign presentation modes at compile time (moved from edge function)
  assignPresentationModes(cappedMainGroups, wordMeta, aiPhrases);
  const globalPhraseDur = phraseAnimDurations(Math.max(1, cappedMainGroups[0]?.words.length ?? 1), Math.max(250, Math.round(durationSec * 250)));
  const animParams = {
    linger: globalPhraseDur.linger,
    stagger: typeof (payload.frame_state as any)?.stagger === 'number' ? (payload.frame_state as any).stagger : globalPhraseDur.stagger,
    entryDuration: globalPhraseDur.entryDuration,
    exitDuration: globalPhraseDur.exitDuration,
  };

  const slotEnds: number[] = [];
  for (const group of cappedMainGroups) {
    const groupDur = phraseAnimDurations(group.words.length, Math.round((group.end - group.start) * 1000));
    const visStart = group.start - groupDur.entryDuration - groupDur.stagger * group.words.length;
    const visEnd = group.end + Math.max(animParams.linger, groupDur.linger) + groupDur.exitDuration;
    let slot = 0; for (; slot < slotEnds.length; slot += 1) if (visStart >= slotEnds[slot]) break;
    if (slot === slotEnds.length) slotEnds.push(visEnd); else slotEnds[slot] = visEnd;
    (group as any)._positionSlot = slot % 3;
  }

  const beats = payload.beat_grid?.beats ?? [];

  const resolvedTypo = resolveTypographyFromDirection(payload.cinematic_direction);
  const baseTypography: TypographyProfile = {
    fontFamily: resolvedTypo.fontFamily.replace(/"/g, '').split(',')[0].trim(),
    fontWeight: resolvedTypo.fontWeight,
    textTransform: resolvedTypo.textTransform,
    letterSpacing: resolvedTypo.letterSpacing,
    heroWeight: resolvedTypo.heroWeight,
  };

  // Create measurement context
  let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (typeof document !== 'undefined') {
    const domCanvas = document.createElement('canvas');
    domCanvas.width = 1;
    domCanvas.height = 1;
    const ctx = domCanvas.getContext('2d');
    if (ctx) {
      measureCtx = ctx;
    } else {
      const oc = new OffscreenCanvas(1, 1);
      measureCtx = oc.getContext('2d')!;
    }
  } else {
    const oc = new OffscreenCanvas(1, 1);
    measureCtx = oc.getContext('2d')!;
  }

  // Prime the canvas with the font
  measureCtx.font = `${baseTypography.fontWeight} 48px "${baseTypography.fontFamily}", sans-serif`;
  measureCtx.measureText('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');

  // Viewport info for portrait-aware layout
  const vw = options?.viewportWidth ?? 960;
  const vh = options?.viewportHeight ?? 540;
  const isPortrait = vh > vw;

  // ═══ RESPONSIVE: compile in actual viewport dimensions ═══
  // Positions and font sizes are FINAL pixel values — no scaling at render time.
  // On resize, the scene recompiles with the new dimensions.
  const REF_W = vw;
  const REF_H = vh;
  // Pre-compute layout for each group using fitTextToViewport
  const groupLayouts = new Map<string, { fontSize: number; positions: Array<{ x: number; y: number; width: number }> }>();

  // Layout main groups at center (normal behavior)
  for (const group of cappedMainGroups) {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const groupWords = group.words.map(wm =>
      baseTypography.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word
    );
    // Find matching AI phrase for this group
    const matchPhrase = (aiPhrases ?? []).find((ap: any) => {
      const [ps, pe] = ap.wordRange ?? [0, 0];
      const gs = globalWordIndex.get(group.words[0]) ?? -1;
      const ge = globalWordIndex.get(group.words[group.words.length - 1]) ?? -1;
      return ps <= gs && pe >= ge;
    }) as CinematicPhrase | undefined;

    const composition = (group as any).composition ?? matchPhrase?.composition ?? 'line';
    const bias = (group as any).bias ?? matchPhrase?.bias ?? 'center';

    const hasHero = group.words.some(wm =>
      wm.isHeroWord === true ||
      wm.directive?.isolation === true
    );

    // maxLines resolved by resolveLayout: <4 words = 1 line, 4+ = auto wrap
    const maxLines: number | undefined = (group as any)._resolvedMaxLines;

    const targetFill = 0.88;

    const layout = fitTextToViewport(
      measureCtx as MeasureContext,
      groupWords,
      REF_W,
      REF_H,
      baseTypography.fontFamily,
      baseTypography.fontWeight,
      {
        maxLines,
        textTransform: 'none', // already transformed above
        hasHeroWord: hasHero,
        targetFillRatio: targetFill,
      },
    );

    groupLayouts.set(key, {
      fontSize: layout.fontSize,
      positions: layout.wordPositions.map(wp => ({
        x: wp.x,
        y: wp.y,
        width: wp.width,
      })),
    });
  }

  // Layout adlib groups — smaller font, positioned at bottom 20% of viewport
  for (const group of adlibGroups) {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const groupWords = group.words.map(wm =>
      baseTypography.textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word
    );
    // Adlibs: 55% of normal fill ratio, placed in bottom zone
    const adlibSlot: Slot = {
      id: 99,
      yTop: REF_H * 0.74,
      yBottom: REF_H * 0.90,
      yCenter: REF_H * 0.82,
      height: REF_H * 0.16,
    };
    const adlibLayout = fitTextToViewport(
      measureCtx as MeasureContext,
      groupWords,
      REF_W,
      REF_H,
      baseTypography.fontFamily,
      baseTypography.fontWeight,
      {
        maxLines: 1,
        textTransform: 'none',
        hasHeroWord: false,
        targetFillRatio: 0.55,
        slot: adlibSlot,
      },
    );
    groupLayouts.set(key, {
      fontSize: Math.min(adlibLayout.fontSize, 28), // cap adlib font size
      positions: adlibLayout.wordPositions.map(wp => ({
        x: wp.x,
        y: wp.y,
        width: wp.width,
      })),
    });
  }

  const chapterBeats = payload.beat_grid?.beats ?? [];
  const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;

  const compiledChapters: CompiledChapter[] = chapters.map((chapter: any, index: number) => ({
    index,
    startRatio: chapter.startRatio ?? 0,
    endRatio: chapter.endRatio ?? 1,
    targetZoom: distanceToZoom['Medium'] ?? 1.0,
    emotionalIntensity: chapter.emotionalIntensity ?? 0.5,
    typography: { fontFamily: baseTypography.fontFamily, fontWeight: baseTypography.fontWeight, heroWeight: baseTypography.heroWeight, textTransform: baseTypography.textTransform },
    atmosphere: chapter.atmosphere ?? (payload.cinematic_direction as any)?.atmosphere ?? 'cinematic',
  }));

  const analysis = (payload.beat_grid as any)?._analysis ?? null;
  const songMotion = deriveSongMotionIdentity(bpm, analysis, beats);
  const sectionMods = deriveAllSectionMods(analysis, compiledChapters, durationSec);

  const allGroups = [...cappedMainGroups, ...adlibGroups];
  // Sort by start time so resolveActiveGroup works correctly
  allGroups.sort((a, b) => a.start - b.start);

  const compiledGroups: CompiledPhraseGroup[] = allGroups.map((group) => {
    const key = `${group.lineIndex}-${group.groupIndex}`;
    const groupDur = phraseAnimDurations(group.words.length, Math.round((group.end - group.start) * 1000));
    const matchPhrase = (aiPhrases ?? []).find((ap: any) => {
      const [ps, pe] = ap.wordRange ?? [0, 0];
      const gs = globalWordIndex.get(group.words[0]) ?? -1;
      const ge = globalWordIndex.get(group.words[group.words.length - 1]) ?? -1;
      return ps <= gs && pe >= ge;
    }) as CinematicPhrase | undefined;
    const composition = (group as any).composition ?? matchPhrase?.composition ?? 'line';
    const bias = (group as any).bias ?? matchPhrase?.bias ?? 'center';
    const revealStyle = (group as any).revealStyle ?? matchPhrase?.revealStyle ?? 'instant';
    const holdClass = (group as any).holdClass ?? matchPhrase?.holdClass ?? 'medium_groove';
    const energyTier: "groove" | "impact" | "intimate" | "lift" | "surprise" = 'groove';
    const heroType: "phrase" | "word" = 'word';

    // Reveal → stagger delay
    const staggerVal = revealStyle === 'instant' ? 0
      : revealStyle === 'stagger_fast' ? 0.12   // was 0.04 — too fast to see
      : 0.25; // stagger_slow — was 0.12 — deliberate pacing

    // Hold → linger duration
    const lingerVal = holdClass === 'short_hit' ? 0.1
      : holdClass === 'long_emotional' ? Math.max(0.8, animParams.linger * 2)
      : Math.max(0.3, animParams.linger); // medium_groove

    // Energy → entry/exit speed
    const _et = energyTier as string;
    const entryVal = _et === 'impact' ? 0.08
      : _et === 'surprise' ? 0.05
      : _et === 'intimate' ? 0.4
      : _et === 'lift' ? groupDur.entryDuration * 0.8
      : groupDur.entryDuration; // groove
    const exitVal = _et === 'impact' ? 0.15
      : _et === 'surprise' ? 0.1
      : _et === 'intimate' ? 0.5
      : _et === 'lift' ? groupDur.exitDuration * 0.8
      : groupDur.exitDuration; // groove
    const groupLayout = groupLayouts.get(key);
    const positions = groupLayout?.positions ?? [];
    const groupFontSize = groupLayout?.fontSize ?? 56;
    const wordsCompiled: CompiledWord[] = group.words.flatMap((wm, wi) => {
      const pos = positions[wi] ?? { x: REF_W / 2, y: REF_H / 2, width: 40 };
      const elClass = (wm.directive as any)?.elementalClass
        ?? null;
      const base: CompiledWord = {
        id: `${group.lineIndex}-${group.groupIndex}-${wi}`,
        text: baseTypography.textTransform === 'uppercase'
          ? wm.word.replace(/[\u2018\u2019]/g, "'").toUpperCase()
          : wm.word.replace(/[\u2018\u2019]/g, "'"),
        clean: wm.clean || wm.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        wordIndex: wi,
        layoutX: pos.x,
        layoutY: pos.y,
        baseFontSize: groupFontSize,
        layoutWidth: pos.width,
        wordStart: snapToBeat(wm.start, beats),
        fontWeight: (wm.isHeroWord || (Math.max(0, wm.end - wm.start) >= 0.5)) ? baseTypography.heroWeight : baseTypography.fontWeight,
        fontFamily: baseTypography.fontFamily,
        isHeroWord: wm.isHeroWord === true
          || (wm.directive as any)?.isolation === true
          || (Math.max(0, wm.end - wm.start) >= 0.5),
        isAdlib: wm.isAdlib === true,
        isAnchor: wi === group.anchorWordIdx,
        color: '#ffffff',
        isFiller: isFillerWord(wm.word),
        emphasisLevel: computeEmphasisFromDuration(wm.end - wm.start),
        wordDuration: Math.max(0, wm.end - wm.start),
      };
      return [base];
    });
    return {
      lineIndex: group.lineIndex,
      groupIndex: group.groupIndex,
      anchorWordIdx: group.anchorWordIdx,
      start: group.start,
      end: group.end,
      words: wordsCompiled,
      staggerDelay: staggerVal,
      entryDuration: entryVal,
      exitDuration: exitVal,
      lingerDuration: lingerVal,
      behaviorIntensity: 1,
      composition,
      bias,
      heroType,
      revealStyle,
      holdClass,
      energyTier,
      // Presentation mode: read from group (set by assignPresentationModes directly)
      presentationMode: (group as any).presentationMode ?? undefined,
      entryCharacter: (group as any).entryCharacter ?? undefined,
      exitCharacter: (group as any).exitCharacter ?? undefined,
      vibrateOnHold: (group as any).vibrateOnHold ?? false,
      elementalWash: (group as any).elementalWash ?? false,
      // Exit effect from AI
      exitEffect: matchPhrase?.exitEffect ?? undefined,
      isAdlib: group.words.some(w => w.isAdlib),
    };
  }).sort((a, b) => a.start - b.start);

  const beatEvents: BeatEvent[] = beats.map((time) => ({ time, springVelocity: 0.4, glowMax: 0.3 }));



  const palettes = compiledChapters.map((c) => resolveV3Palette(payload, (c.startRatio + c.endRatio) * 0.5));
  return {
    phraseGroups: compiledGroups,
    songStartSec: payload.songStart,
    songEndSec: payload.songEnd,
    durationSec,
    beatEvents,
    bpm,
    chapters: compiledChapters,
    emotionalArc: ((payload.cinematic_direction as any)?.emotionalArc as string | undefined) ?? 'slow-burn',
    visualMode,
    baseFontFamily: baseTypography.fontFamily,
    baseFontWeight: baseTypography.fontWeight,
    baseTextTransform: baseTypography.textTransform,
    palettes,
    animParams,
    songMotion,
    sectionMods,
  };
}

// ─── Types migrated from lyricSceneBaker.ts (deleted — sceneCompiler is the canonical pipeline) ───

interface AtmosphereConfig {
  vignetteStrength: number;
  blurAmount: number;
  grainOpacity: number;
  tintStrength: number;
  overlayType: 'none' | 'frost' | 'gradient-wash' | 'split-mask';
}

export type Keyframe = {
  timeMs: number;
  chunks: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    alpha: number;
    glow: number;
    scale: number;
    scaleX: number;
    scaleY: number;
    visible: boolean;
    fontSize: number;
    fontWeight: number;
    fontFamily?: string;
    isAnchor: boolean;
    color: string;
    entryStyle?: string;
    exitStyle?: string;
    emphasisLevel?: number;
    entryProgress?: number;
    exitProgress?: number;
    behavior?: string;
    entryOffsetY: number;
    entryOffsetX: number;
    entryScale: number;
    exitOffsetY: number;
    exitScale: number;
    skewX: number;
    blur?: number;
    rotation?: number;
    ghostTrail?: boolean;
    ghostCount?: number;
    ghostSpacing?: number;
    ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial';
    letterIndex?: number;
    letterTotal?: number;
    letterDelay?: number;
    isLetterChunk?: boolean;
    frozen?: boolean;
  }>;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  beatIndex: number;
  bgBlend: number;
  particles: Array<{
    x: number;
    y: number;
    size: number;
    alpha: number;
    shape?: 'circle' | 'line' | 'diamond' | 'glow';
  }>;
  particleColor?: string;
  atmosphere?: AtmosphereConfig;
  sectionIndex: number;
};
