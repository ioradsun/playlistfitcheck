import type { CinematicDirection, CinematicSection, CinematicPhrase } from "@/types/CinematicDirection";
import { enrichSections } from "@/engine/directionResolvers";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { FrameRenderState } from "@/engine/presetDerivation";
import { fitTextToViewport, type MeasureContext } from "@/engine/textLayout";
import {
  deriveAllSectionMods,
  deriveSongMotionIdentity,
  type SectionMotionMod,
  type SongMotionIdentity,
} from "@/engine/MotionIdentity";
import { getEffectTier } from "@/engine/timeTiers";


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
  words?: Array<{ word: string; start: number; end: number }>;
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
interface WordMetaEntry { word: string; start: number; end: number; clean: string; directive: WordDirectiveLike | null; lineIndex: number; wordIndex: number; isHeroWord?: boolean; }
export interface PhraseGroup { words: WordMetaEntry[]; start: number; end: number; anchorWordIdx: number; lineIndex: number; groupIndex: number; phraseHeroWord?: string; }


const TYPOGRAPHY_PROFILES: Record<string, TypographyProfile> = {
  'bold-impact': { fontFamily: 'Oswald', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, heroWeight: 900 },
  'clean-modern': { fontFamily: 'Montserrat', fontWeight: 600, textTransform: 'none', letterSpacing: 0.2, heroWeight: 700 },
  'elegant-serif': { fontFamily: 'Playfair Display', fontWeight: 500, textTransform: 'none', letterSpacing: 0.15, heroWeight: 700 },
  'raw-condensed': { fontFamily: 'Barlow Condensed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.35, heroWeight: 800 },
  'whisper-soft': { fontFamily: 'Nunito', fontWeight: 400, textTransform: 'none', letterSpacing: 0.25, heroWeight: 500 },
  'tech-mono': { fontFamily: 'JetBrains Mono', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4, heroWeight: 700 },
  'display-heavy': { fontFamily: 'Bebas Neue', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, heroWeight: 800 },
  'editorial-light': { fontFamily: 'Cormorant Garamond', fontWeight: 400, textTransform: 'none', letterSpacing: 0.1, heroWeight: 600 },
};

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

        // ── Safety net: split phrases at internal timing pauses ──
        // If the AI grouped across a pause (>= 200ms gap), split there.
        const splitGroups: PhraseGroup[] = [];
        for (const grp of groups) {
          if (grp.words.length <= 1) {
            splitGroups.push(grp);
            continue;
          }

          // Find the largest internal gap
          let splitAt = -1;
          let maxGap = 0;
          for (let wi = 0; wi < grp.words.length - 1; wi++) {
            const gap = grp.words[wi + 1].start - grp.words[wi].end;
            if (gap >= 0.20 && gap > maxGap) {  // 200ms threshold
              maxGap = gap;
              splitAt = wi;
            }
          }

          if (splitAt >= 0) {
            // Split into two groups at the gap
            const left = grp.words.slice(0, splitAt + 1);
            const right = grp.words.slice(splitAt + 1);

            if (left.length > 0) {
              splitGroups.push({
                words: left,
                start: left[0].start,
                end: left[left.length - 1].end,
                anchorWordIdx: findAnchorWord(left),
                lineIndex: grp.lineIndex,
                groupIndex: grp.groupIndex,
                phraseHeroWord: grp.phraseHeroWord,
              });
            }
            if (right.length > 0) {
              splitGroups.push({
                words: right,
                start: right[0].start,
                end: right[right.length - 1].end,
                anchorWordIdx: findAnchorWord(right),
                lineIndex: right[0].lineIndex,
                groupIndex: grp.groupIndex + 0.5, // half-index to maintain sort
                phraseHeroWord: '',
              });
            }
          } else {
            splitGroups.push(grp);
          }
        }

        // Re-index groups
        splitGroups.sort((a, b) => a.start - b.start);
        splitGroups.forEach((g, i) => { g.groupIndex = i; });

        return splitGroups;
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

export interface CompiledWord { id: string; text: string; clean: string; wordIndex: number; layoutX: number; layoutY: number; baseFontSize: number; layoutWidth: number; wordStart: number; fontWeight: number; fontFamily: string; color: string; isHeroWord?: boolean; isAnchor: boolean; isFiller: boolean; emphasisLevel: number; wordDuration: number; }
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
  /** verse | chorus | bridge | outro — from AI */
  sectionLabel?: string;
  /** Chorus repeat number (1 = first time, 2 = second, etc.) */
  chorusRepeat?: number;
  /** AI-selected exit animation type */
  exitEffect?: string;
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
  const wordMeta: WordMetaEntry[] = words.map((w) => {
    // Normalize curly quotes/apostrophes before cleaning, then strip
    const normalized = w.word
      .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")  // curly → straight apostrophe
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"');               // curly → straight quote
    const clean = normalized.replace(/[^a-zA-Z0-9']/g, '').toLowerCase()
      .replace(/^'+|'+$/g, '');  // strip leading/trailing apostrophes from clean key
    const lineIndex = Math.max(0, payload.lines.findIndex((l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? Infinity)));
    return { ...w, clean, directive: null, lineIndex, wordIndex: 0 };
  });
  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) { lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0; wm.wordIndex = lineWordCounters[wm.lineIndex]++; }
  const globalWordIndex = new Map<WordMetaEntry, number>();
  wordMeta.forEach((wm, idx) => globalWordIndex.set(wm, idx));

  const aiPhrases = (payload.cinematic_direction as any)?.phrases as CinematicPhrase[] | undefined;
  const phraseGroups = buildPhraseGroups(wordMeta, aiPhrases);
  // Assign presentation modes at compile time (moved from edge function)
  assignPresentationModes(phraseGroups, wordMeta, aiPhrases);
  const globalPhraseDur = phraseAnimDurations(Math.max(1, phraseGroups[0]?.words.length ?? 1), Math.max(250, Math.round(durationSec * 250)));
  const animParams = {
    linger: globalPhraseDur.linger,
    stagger: typeof (payload.frame_state as any)?.stagger === 'number' ? (payload.frame_state as any).stagger : globalPhraseDur.stagger,
    entryDuration: globalPhraseDur.entryDuration,
    exitDuration: globalPhraseDur.exitDuration,
  };

  const slotEnds: number[] = [];
  for (const group of phraseGroups) {
    const groupDur = phraseAnimDurations(group.words.length, Math.round((group.end - group.start) * 1000));
    const visStart = group.start - groupDur.entryDuration - groupDur.stagger * group.words.length;
    const visEnd = group.end + Math.max(animParams.linger, groupDur.linger) + groupDur.exitDuration;
    let slot = 0; for (; slot < slotEnds.length; slot += 1) if (visStart >= slotEnds[slot]) break;
    if (slot === slotEnds.length) slotEnds.push(visEnd); else slotEnds[slot] = visEnd;
    (group as any)._positionSlot = slot % 3;
  }

  const beats = payload.beat_grid?.beats ?? [];

  const baseTypography = TYPOGRAPHY_PROFILES[((payload.cinematic_direction as any)?.typography as string) ?? 'clean-modern'] ?? TYPOGRAPHY_PROFILES['clean-modern'];

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

  for (const group of phraseGroups) {
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

  const compiledGroups: CompiledPhraseGroup[] = phraseGroups.map((group) => {
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
        fontWeight: baseTypography.fontWeight,
        fontFamily: baseTypography.fontFamily,
        isHeroWord: wm.isHeroWord === true
          || (wm.directive as any)?.isolation === true
          || (Math.max(0, wm.end - wm.start) >= 0.5),
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
      // Exit effect from AI + chorus flag
      sectionLabel: matchPhrase?.isChorus ? 'chorus' : undefined,
      exitEffect: matchPhrase?.exitEffect ?? undefined,
    };
  }).sort((a, b) => a.start - b.start);

  // Compute chorus repeat numbers
  let chorusCount = 0;
  let lastWasChorus = false;
  for (const group of compiledGroups) {
    if (group.sectionLabel === 'chorus') {
      if (!lastWasChorus) chorusCount++;
      group.chorusRepeat = chorusCount;
      lastWasChorus = true;
    } else {
      lastWasChorus = false;
    }
  }

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
