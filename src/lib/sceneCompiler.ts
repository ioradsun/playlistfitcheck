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
import {
  resolveTypographyFromDirection,
  getFontNamesForPreload,
  deriveSectionTypography,
  WEIGHT_MAP,
  TRACKING_MAP,
  DEFAULT_SECTION_BEHAVIOR,
  type ResolvedTypography,
  type SectionBehavior,
  type HeroStyle,
} from "@/lib/fontResolver";
import { STAGGER_DELAY, type RevealStyle } from "@/lib/varietyEngine";


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
  heroStyle: HeroStyle;
}

export type VisualMode = 'intimate' | 'cinematic' | 'explosive';
interface WordMetaEntry { word: string; start: number; end: number; clean: string; lineIndex: number; wordIndex: number; isHeroWord?: boolean; isAdlib?: boolean; }
export interface PhraseGroup { words: WordMetaEntry[]; start: number; end: number; anchorWordIdx: number; lineIndex: number; groupIndex: number; phraseHeroWord?: string; }



const FILLER_WORDS = new Set(['a','an','the','to','of','and','or','but','in','on','at','for','with','from','by','up','down','is','am','are','was','were','be','been','being','it','its','that','this','these','those','i','you','he','she','we','they','if','when','while','so']);
const MIN_GROUP_DURATION = 0.5;
const MAX_GROUP_SIZE = 5;
const WEIGHT_STEPS = [300, 400, 700, 800];

// ── Hero word scale bump ──
// Hero words render at 1.15× the size of non-hero words in the same phrase.
// Exported so fitTextToViewport can reserve horizontal headroom for hero words
// during layout. Must stay in sync with the per-word baseFontSize multiplication
// in the word compile loop.
export const HERO_SCALE_BOOST = 1.15;


function isFillerWord(word: string): boolean { return FILLER_WORDS.has(word.replace(/[^a-zA-Z]/g, '').toLowerCase()); }

function findAnchorWord(words: WordMetaEntry[]): number {
  // Prefer words marked as hero by section-level AI or phrase-level scorer
  const heroIdx = words.findIndex(w => w.isHeroWord);
  if (heroIdx >= 0) return heroIdx;
  // Fallback: existing word-length + filler logic
  let maxScore = -1;
  let maxIdx = words.length - 1;
  for (let i = 0; i < words.length; i += 1) {
    const wordLen = words[i].clean.length;
    const score = 2 - (isFillerWord(words[i].word) ? 5 : 0) + (wordLen > 5 ? 2 : 0) + (wordLen > 8 ? 2 : 0);
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
      (phrase) => (phrase as any).lineIndex === undefined || (phrase as any).lineIndex === null,
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
        const lineIndex = (phrase as any).lineIndex;
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
      const isConnector = FILLER_WORDS.has(wm.word.replace(/[^a-zA-Z']/g, '').toLowerCase());
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

export interface CompiledWord { id: string; text: string; clean: string; wordIndex: number; layoutX: number; layoutY: number; baseFontSize: number; layoutWidth: number; wordStart: number; fontWeight: number; fontFamily: string; letterSpacing?: number; color: string; isHeroWord?: boolean; isAdlib?: boolean; isAnchor: boolean; isFiller: boolean; emphasisLevel: number; wordDuration: number; heroScore?: number; }
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
  composition: 'stack' | 'line' | 'center_word';
  heroType: 'word' | 'phrase';
  revealStyle: 'instant' | 'stagger_fast' | 'stagger_slow';
  holdClass: 'short_hit' | 'medium_groove' | 'long_emotional';
  energyTier: 'intimate' | 'groove' | 'lift' | 'impact' | 'surprise';
  /** AI-chosen exit effect — passed to ExitEffect renderer */
  exitEffect?: string;
  /** True if this group contains adlib/background vocal words */
  isAdlib?: boolean;
}
export interface BeatEvent { time: number; springVelocity: number; glowMax: number; }
export interface CompiledChapter { index: number; startRatio: number; endRatio: number; targetZoom: number; emotionalIntensity: number; typography: { fontFamily: string; fontWeight: number; heroWeight: number; textTransform: string; }; visualMood: string; }
export interface CompiledScene { phraseGroups: CompiledPhraseGroup[]; songStartSec: number; songEndSec: number; durationSec: number; beatEvents: BeatEvent[]; bpm: number; chapters: CompiledChapter[]; visualMode: VisualMode; baseFontFamily: string; baseFontWeight: number; baseTextTransform: string; palettes: string[][]; animParams: { linger: number; stagger: number; entryDuration: number; exitDuration: number; }; songMotion: SongMotionIdentity; sectionMods: SectionMotionMod[]; }

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
    if (chapterProgress != null && (payload.cinematic_direction as any)?.chapters?.length) {
      const idx = ((payload.cinematic_direction as any).chapters as any[]).findIndex((c: any) => chapterProgress >= (c.startRatio ?? 0) && chapterProgress < (c.endRatio ?? 1));
      if (idx >= 0 && payload.auto_palettes[idx]) return payload.auto_palettes[idx];
    }
    return payload.auto_palettes[0];
  }
  return payload.palette;
}

export function compileScene(payload: ScenePayload, options?: { viewportWidth?: number; viewportHeight?: number }): CompiledScene {
  const durationSec = Math.max(0.01, payload.songEnd - payload.songStart);
  const rawChapters = ((payload.cinematic_direction as any)?.chapters ?? []) as Array<any>;
  const chapters = rawChapters.length > 0 ? rawChapters : enrichSections(payload.cinematic_direction?.sections as CinematicSection[] | undefined);
  const visualMode: VisualMode = 'cinematic';
  const rawWords = payload.words ?? [];
  // Fix zero-duration tokens: give them a visible duration instead of dropping them.
  // Dropping shifts all word indices and breaks AI phrase wordRange alignment.
  const words = rawWords.map((w, i) => {
    if (w.start < 0 || w.end < 0) {
      // Truly invalid — give it the previous word's end time as both start and end
      const prev = i > 0 ? rawWords[i - 1] : null;
      return { ...w, start: prev?.end ?? 0, end: (prev?.end ?? 0) + 0.05 };
    }
    if (w.start >= w.end) {
      // Zero-duration ghost word: give it enough duration to be visible.
      // 500ms lets the word appear, linger, and fade — feels intentional,
      // not like a rendering glitch. The isAdlib flag (set later) routes
      // these to the peripheral lane at reduced alpha.
      return { ...w, end: w.start + 0.5 };
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
    // ── 2-layer adlib detection ──────────────────────────────────────
    // Layer 1: Gemini line-level tag (explicit, human-reviewable)
    const line = payload.lines[lineIndex];
    const isAdlibFromLine = (line as any)?.tag === "adlib";

    // NOTE: speaker_id detection is DISABLED.
    // Scribe's music diarization is section-based (intro/verse/outro),
    // not lead-vs-background. It incorrectly flags entire song sections
    // as adlib. speaker_id is preserved in the data for future use but
    // not used for adlib classification.

    // Layer 2: Ghost word heuristics (infer adlib from timing anomalies)
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

    const isAdlib = isAdlibFromLine || isInferredAdlib;
    return { ...w, clean, lineIndex, wordIndex: 0, isAdlib: isAdlib || undefined };
  });
  const lineWordCounters: Record<number, number> = {};
  for (const wm of wordMeta) { lineWordCounters[wm.lineIndex] = lineWordCounters[wm.lineIndex] ?? 0; wm.wordIndex = lineWordCounters[wm.lineIndex]++; }
  const globalWordIndex = new Map<WordMetaEntry, number>();
  wordMeta.forEach((wm, idx) => globalWordIndex.set(wm, idx));

  // ── Apply AI section-level heroWords to wordMeta ──
  // The AI picks semantically meaningful words per section (CHAIN, DOOR).
  // Mark matching words as hero BEFORE phrase grouping, so they influence
  // the hero scoring downstream. Phrase-level heroWord (duration-based)
  // can still override or supplement these.
  const cdSections = payload.cinematic_direction?.sections as CinematicSection[] | undefined;
  if (cdSections?.length) {
    for (const wm of wordMeta) {
      // Find which section this word belongs to by time
      const sec = cdSections.find(s =>
        s.startSec != null && s.endSec != null &&
        wm.start >= s.startSec - 0.5 && wm.start < s.endSec + 0.5
      );
      if (!sec || !(sec as any).heroWords?.length) continue;
      const sectionHeroes: string[] = (sec as any).heroWords;
      // Match word's clean text against section heroWords (case-insensitive)
      if (sectionHeroes.some(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === wm.clean)) {
        wm.isHeroWord = true;
      }
    }
  }

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
  for (const group of cappedMainGroups) {
    const g = group as any;
    // Composition drives maxLines: center_word always 1 line, stack allows wrapping, line uses word-count heuristic
    const matchedPhrase = ((payload.cinematic_direction as any)?.phrases as CinematicPhrase[] | undefined)?.find((ap: any) => {
      const [ps, pe] = ap.wordRange ?? [0, 0];
      const gs = group.words[0]?.wordIndex ?? 0;
      const ge = group.words[group.words.length - 1]?.wordIndex ?? 0;
      return ps <= gs && pe >= ge;
    });
    const phraseComposition = matchedPhrase?.composition ?? 'line';
    (g as any)._composition = phraseComposition;
    if (phraseComposition === 'center_word') {
      g._resolvedMaxLines = 1;
    } else if (phraseComposition === 'stack') {
      g._resolvedMaxLines = undefined; // allow wrapping
    } else {
      g._resolvedMaxLines = group.words.length < 4 ? 1 : undefined;
    }
  }
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

  const resolvedTypo: ResolvedTypography = resolveTypographyFromDirection(payload.cinematic_direction);
  const baseTypography: TypographyProfile = {
    fontFamily: resolvedTypo.fontFamily.replace(/"/g, '').split(',')[0].trim(),
    fontWeight: resolvedTypo.fontWeight,
    textTransform: resolvedTypo.textTransform,
    letterSpacing: resolvedTypo.letterSpacing,
    heroWeight: resolvedTypo.heroWeight,
    heroStyle: resolvedTypo.heroStyle,
  };

  const cd = payload.cinematic_direction as any;
  const sections = cd?.sections ?? [];
  const sectionTypoMap: SectionBehavior[] = sections.map((section: any) =>
    deriveSectionTypography(section?.role, section?.avgEnergy ?? 0.5),
  );
  /** Map a timestamp to its section index. Sections come from cinematic direction. */
  function getSectionForTime(timeSec: number): number {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const s = sections[i];
      const start = s.startSec ?? s.start ?? 0;
      if (timeSec >= start - 0.3) return i;
    }
    return 0;
  }

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
    const secIdx = getSectionForTime(group.start);
    const secTypo = sectionTypoMap[secIdx] ?? DEFAULT_SECTION_BEHAVIOR;
    const groupWords = group.words.map(wm =>
      secTypo.transform === 'uppercase' ? wm.word.toUpperCase() : wm.word
    );
    // Find matching AI phrase for this group
    const matchPhrase = (aiPhrases ?? []).find((ap: any) => {
      const [ps, pe] = ap.wordRange ?? [0, 0];
      const gs = globalWordIndex.get(group.words[0]) ?? -1;
      const ge = globalWordIndex.get(group.words[group.words.length - 1]) ?? -1;
      return ps <= gs && pe >= ge;
    }) as CinematicPhrase | undefined;
    (group as any)._matchPhrase = matchPhrase;

    const composition = (group as any).composition ?? matchPhrase?.composition ?? 'line';
    // NOTE: matchPhrase.composition is variety-assigned in phraseEngine.
    // Keep this fallback for backward compatibility with legacy cached cinematic direction data.

    // maxLines resolved by resolveLayout: <4 words = 1 line, 4+ = auto wrap
    const maxLines: number | undefined = (group as any)._resolvedMaxLines;

    // ── Phrase audio metrics (all data already exists) ──
    const phraseDuration = Math.max(0.1, group.end - group.start);
    const wordCount = group.words.length;

    // Beat energy at phrase midpoint
    const phraseMidpoint = group.start + phraseDuration / 2;
    const phraseEnergy = (() => {
      const analysis = (payload.beat_grid as any)?._analysis;
      if (analysis?.frames?.length > 0) {
        const idx = Math.min(
          analysis.frames.length - 1,
          Math.max(0, Math.round(phraseMidpoint * (analysis.frameRate ?? 10)))
        );
        return analysis.frames[idx]?.energy ?? 0.5;
      }
      return (sections[secIdx] as any)?.avgEnergy ?? 0.5;
    })();

    // Section damper: verse phrases are restrained, chorus phrases are expressive
    const sectionDamper = (() => {
      const role = ((sections[secIdx] as any)?.role ?? '').toLowerCase();
      if (role.includes('chorus') || role.includes('hook')) return 1.0;
      if (role.includes('pre')) return 0.8;
      if (role.includes('bridge')) return 0.7;
      if (role.includes('verse')) return 0.6;
      if (role.includes('outro') || role.includes('intro')) return 0.5;
      // No role label: derive from energy
      const secEnergy = (sections[secIdx] as any)?.avgEnergy ?? 0.5;
      return 0.5 + secEnergy * 0.5; // 0.5–1.0
    })();

    // ── Scale: composite of word count + energy + duration ──
    // Short + high energy = larger. Short + low energy = restraint.
    // Long + many words = smaller.
    const rawWordCountScale = wordCount <= 2 ? 1.08 : wordCount >= 5 ? 0.95 : 1.0;
    const energyScaleBoost = 0.7 + phraseEnergy * 0.3; // 0.7–1.0
    const durationDamp = phraseDuration > 4 ? 0.95 : phraseDuration < 1.5 ? 1.04 : 1.0;
    const phraseScaleMult = rawWordCountScale * energyScaleBoost * durationDamp;
    // Damped by section
    const effectiveScaleMult = 1.0 + (phraseScaleMult - 1.0) * sectionDamper;
    // Cache phrase metrics for the word compilation loop
    (group as any)._phraseEnergy = phraseEnergy;
    (group as any)._sectionDamper = sectionDamper;
    (group as any)._phraseDuration = phraseDuration;
    (group as any)._wordDensity = wordCount / phraseDuration;
    (group as any)._secIdx = secIdx;

    const sectionScaleMult = secTypo.scale === 'large' ? 1.12 : secTypo.scale === 'small' ? 0.82 : 1.0;
    // Composition adjusts fill: center_word uses less width (bigger font, more breathing room)
    // stack uses tighter fill (more vertical space needed)
    const compositionFill = (group as any)._composition === 'center_word' ? 0.55
      : (group as any)._composition === 'stack' ? 0.78
      : 0.88;
    const targetFill = compositionFill * sectionScaleMult * effectiveScaleMult;

    // Build hero word indices for this phrase — used by fitTextToViewport to reserve
    // horizontal headroom for the scale bump applied later in baseFontSize.
    // NOTE: Hero detection is re-run in the word compile loop below for the
    // `isHero` flag. This duplication is intentional scope-limiting — the two
    // sites will be unified in a follow-up refactor. Both must compute the
    // same predicate; if you change this, update the word compile loop too.
    const heroWordIndices: number[] = [];
    for (let wi = 0; wi < group.words.length; wi++) {
      const wm = group.words[wi];
      const holdDuration = Math.max(0, (wm.end ?? 0) - (wm.start ?? 0));
      const isLongHold = holdDuration >= 0.5;
      const isDirectiveHero = wm.isHeroWord === true;
      const isHookWord = false; // isChorus was never written by any code
      const heroScore =
        (isDirectiveHero ? 0.4 : 0) +
        (Math.min(1, holdDuration / 0.8) * 0.3) +
        (isHookWord ? 0.2 : 0) +
        (computeEmphasisFromDuration(holdDuration) * 0.1);
      const isHeroCheck = heroScore >= 0.35 || isLongHold || isDirectiveHero;
      if (isHeroCheck) heroWordIndices.push(wi);
    }

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
        heroWordIndices,
        heroScaleBoost: HERO_SCALE_BOOST,
        targetFillRatio: targetFill,
      },
    );

    // Bias removed — phrases always render horizontally centered.
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
    const adlibSecIdx = getSectionForTime(group.start);
    const adlibSecTypo = sectionTypoMap[adlibSecIdx] ?? DEFAULT_SECTION_BEHAVIOR;
    const groupWords = group.words.map(wm =>
      adlibSecTypo.transform === 'uppercase' ? wm.word.toUpperCase() : wm.word
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
        heroWordIndices: [],
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
    visualMood: chapter.visualMood ?? chapter.atmosphere ?? 'cinematic',
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
    const matchPhrase = (group as any)._matchPhrase as CinematicPhrase | undefined;
    const composition = (group as any).composition ?? matchPhrase?.composition ?? 'line';
    // NOTE: matchPhrase.composition is variety-assigned in phraseEngine.
    // Keep this fallback for backward compatibility with legacy cached cinematic direction data.
    const groupSecIdx = getSectionForTime(group.start);
    const groupSecTypo = sectionTypoMap[groupSecIdx] ?? DEFAULT_SECTION_BEHAVIOR;
    const energyTier: "groove" | "impact" | "intimate" | "lift" =
      groupSecTypo.weight === 'black' ? 'impact' :
      groupSecTypo.weight === 'bold' ? 'lift' :
      groupSecTypo.weight === 'regular' ? 'groove' :
      'intimate';
    // Reveal style is variety-derived in phraseEngine.ts (no AI/fallback path here).
    const revealStyle: RevealStyle = matchPhrase?.revealStyle ?? 'instant';
    const holdClass = (group as any).holdClass ?? matchPhrase?.holdClass ?? 'medium_groove';
    const heroType: "phrase" | "word" = 'word';

    // Reveal → stagger delay
    const staggerVal = STAGGER_DELAY[revealStyle];

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
    const secIdx = (group as any)._secIdx ?? getSectionForTime(group.start);
    const secTypo = sectionTypoMap[secIdx] ?? DEFAULT_SECTION_BEHAVIOR;
    const phraseEnergy: number = (group as any)._phraseEnergy ?? 0.5;
    const sectionDamper: number = (group as any)._sectionDamper ?? 0.7;
    const wordDensity: number = (group as any)._wordDensity ?? 2.5;

    // ── Weight: energy drives heaviness, damped by section ──
    const sectionWeightNum = WEIGHT_MAP[secTypo.weight] ?? 700;
    const phraseWeight = (() => {
      // Thresholds shift with section damper:
      // chorus (damper=1.0): lighten below 0.25, heavier above 0.65
      // verse (damper=0.6): lighten below 0.15, heavier above 0.78
      const lightenThreshold = 0.25 * sectionDamper;
      const heavenThreshold = 1.0 - (0.35 * sectionDamper);

      const curIdx = WEIGHT_STEPS.indexOf(
        WEIGHT_STEPS.reduce((best, w) =>
          Math.abs(w - sectionWeightNum) < Math.abs(best - sectionWeightNum) ? w : best,
          WEIGHT_STEPS[0])
      );

      if (phraseEnergy < lightenThreshold && curIdx > 0) {
        return WEIGHT_STEPS[curIdx - 1];
      }
      if (phraseEnergy > heavenThreshold && curIdx < WEIGHT_STEPS.length - 1) {
        return WEIGHT_STEPS[curIdx + 1];
      }
      return sectionWeightNum;
    })();

    // ── Letter spacing: holdClass sets base, energyTier modifies ──
    // Values in em — scales with font size. Range: -0.04em (tight slam) to +0.06em (wide emotional)
    const holdSpacing = holdClass === 'short_hit' ? -0.02
      : holdClass === 'long_emotional' ? 0.04
      : 0; // medium_groove
    const energySpacing = energyTier === 'intimate' ? 0.02
      : energyTier === 'impact' ? -0.02
      : energyTier === 'lift' ? -0.01
      : 0; // groove
    const phraseLetterSpacing = holdSpacing + energySpacing;

    const wordsCompiled: CompiledWord[] = group.words.flatMap((wm, wi) => {
      const pos = positions[wi] ?? { x: REF_W / 2, y: REF_H / 2, width: 40 };
      const holdDuration = Math.max(0, wm.end - wm.start);
      const isLongHold = holdDuration >= 0.5;
      const isDirectiveHero = wm.isHeroWord === true;
      const isHookWord = false; // isChorus was never written by any code
      const heroScore =
        (isDirectiveHero ? 0.4 : 0) +
        (Math.min(1, holdDuration / 0.8) * 0.3) +
        (isHookWord ? 0.2 : 0) +
        (computeEmphasisFromDuration(holdDuration) * 0.1);
      const isHero = heroScore >= 0.35 || isLongHold || isDirectiveHero;

      const wordWeight = isHero ? Math.max(phraseWeight, resolvedTypo.heroWeight) : phraseWeight;
      // Hero words scale up 1.15× relative to non-hero words in the same phrase.
      // Weight shift alone is too subtle; scale bump makes hero unambiguous.
      // Standardized across all compositions — was previously 1.18/1.10 which
      // created inconsistent emphasis and made layout reservation more complex.
      const heroScaleBoost = isHero ? HERO_SCALE_BOOST : 1.0;

      const wordFontFamily = baseTypography.fontFamily;

      const transformedText = secTypo.transform === 'uppercase'
        ? wm.word.replace(/[\u2018\u2019]/g, "'").toUpperCase()
        : wm.word.replace(/[\u2018\u2019]/g, "'");

      const base: CompiledWord = {
        id: `${group.lineIndex}-${group.groupIndex}-${wi}`,
        text: transformedText,
        clean: wm.clean || wm.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        wordIndex: wi,
        layoutX: pos.x,
        layoutY: pos.y,
        baseFontSize: Math.round(groupFontSize * heroScaleBoost),
        layoutWidth: pos.width,
        wordStart: snapToBeat(wm.start, beats),
        fontWeight: wordWeight,
        fontFamily: wordFontFamily,
        letterSpacing: phraseLetterSpacing,
        isHeroWord: isHero,
        isAdlib: wm.isAdlib === true,
        isAnchor: wi === group.anchorWordIdx,
        color: '#ffffff',
        isFiller: isFillerWord(wm.word),
        emphasisLevel: computeEmphasisFromDuration(holdDuration),
        wordDuration: holdDuration,
        heroScore,
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
      composition,
      heroType,
      revealStyle,
      holdClass,
      energyTier,
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
