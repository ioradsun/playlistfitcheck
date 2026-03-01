/**
 * sceneCompiler.ts — Compiles a ScenePayload into a lightweight CompiledScene
 * that LyricDancePlayer can evaluate at runtime without frame-by-frame baking.
 *
 * Re-exports animation state functions used by the player's eval loop.
 */

import type { ScenePayload } from "@/lib/lyricSceneBaker";
import {
  computeEntryState,
  computeExitState,
  computeBehaviorState,
  createPrebakedData,
  getVisualMode,
  assignWordAnimations,
  buildWordDirectivesMap,
  resolveV3EmitterType,
  isFillerWord,
  EMPHASIS_CURVE,
  type AnimState,
  type EntryStyle,
  type ExitStyle,
  type BehaviorStyle,
  type WordMetaEntry,
  type PhraseGroup,
  type GroupPosition,
  type StoryboardEntryLike,
  type ManifestWordDirective,
  type WordDirectiveLike,
} from "@/lib/lyricSceneBaker";
import { enrichSections } from "@/engine/directionResolvers";
import type { CinematicSection } from "@/types/CinematicDirection";

// ═══════════════════════════════════════════════════════════════
// Re-exports for LyricDancePlayer
// ═══════════════════════════════════════════════════════════════

export { computeEntryState, computeExitState, computeBehaviorState };
export type { AnimState };

// ═══════════════════════════════════════════════════════════════
// Compiled Scene Types
// ═══════════════════════════════════════════════════════════════

export interface CompiledWord {
  id: string;
  text: string;
  clean: string;
  start: number;
  end: number;
  entryStyle: string;
  exitStyle: string;
  behaviorStyle: string;
  fontWeight: number;
  fontFamily: string;
  color: string;
  layoutX: number;
  layoutY: number;
  semanticScaleX: number;
  semanticScaleY: number;
  semanticAlphaMax: number;
  semanticGlowMult: number;
  hasSemanticColor: boolean;
  baseFontSize: number;
  entryDurationMult: number;
  isHeroWord: boolean;
  isFiller: boolean;
  heroPresentation?: string;
  letterIndex?: number;
  letterTotal?: number;
  letterDelay?: number;
  isLetterChunk?: boolean;
  emitterType?: string;
  ghostTrail?: boolean;
  ghostCount?: number;
  ghostSpacing?: number;
  ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial';
  trail?: string;
  elementalClass?: string;
  emphasisLevel: number;
  directive: WordDirectiveLike | null;
  lineIndex: number;
  wordIndex: number;
  iconGlyph?: string;
  iconStyle?: 'outline' | 'filled' | 'ghost';
  iconPosition?: 'behind' | 'above' | 'beside' | 'replace';
  iconScale?: number;
}

export interface CompiledPhraseGroup {
  words: CompiledWord[];
  start: number;
  end: number;
  anchorWordIdx: number;
  lineIndex: number;
  groupIndex: number;
  entryDuration: number;
  exitDuration: number;
  lingerDuration: number;
  staggerDelay: number;
  behaviorIntensity: number;
}

export interface CompiledChapter {
  startRatio: number;
  endRatio: number;
  targetZoom: number;
  atmosphere?: string;
}

export interface CompiledScene {
  phraseGroups: CompiledPhraseGroup[];
  beatEvents: Array<{ time: number; springVelocity: number }>;
  chapters: CompiledChapter[];
  emotionalArc: string;
  bpm: number;
  durationSec: number;
  songStartSec: number;
}

// ═══════════════════════════════════════════════════════════════
// compileScene — main entry point
// ═══════════════════════════════════════════════════════════════

export function compileScene(
  payload: ScenePayload,
  _options?: { viewportWidth?: number; viewportHeight?: number },
): CompiledScene {
  const visualMode = getVisualMode(payload);
  // Use totalFrames=0 — we only need the prebaked structures, not per-frame arrays
  const pre = createPrebakedData(payload, 0, visualMode);

  const bpm = payload.bpm ?? payload.beat_grid?.bpm ?? 120;
  const cd = payload.cinematic_direction as Record<string, unknown> | null;
  const wordDirectivesMap = buildWordDirectivesMap(payload.cinematic_direction?.wordDirectives);
  const storyboard = (payload.cinematic_direction?.storyboard ?? []) as StoryboardEntryLike[];
  const manifestWordDirectives = pre.manifestWordDirectives;

  // Build compiled phrase groups
  const compiledGroups: CompiledPhraseGroup[] = [];
  const bakerGroups = pre.phraseGroups ?? [];

  for (let gi = 0; gi < bakerGroups.length; gi++) {
    const group = bakerGroups[gi];
    const layoutKey = `${group.lineIndex}-${group.groupIndex}`;
    const positions = pre.groupLayouts.get(layoutKey) ?? [];
    const lineColor = pre.lineColors[group.lineIndex] ?? '#cccccc';
    const heroWord = pre.lineHeroWords[group.lineIndex] ?? null;

    const compiledWords: CompiledWord[] = [];

    for (let wi = 0; wi < group.words.length; wi++) {
      const wm = group.words[wi];
      const pos = positions[wi];
      const directive = wm.directive;
      const emphasisLevel = directive?.emphasisLevel ?? 2;
      const isHero = heroWord != null && wm.clean === heroWord.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Assign animations
      const anims = assignWordAnimations(
        wm,
        pre.motionDefaults,
        storyboard,
        manifestWordDirectives[wm.clean] ?? null,
      );

      // Use directive entry/behavior/exit if specified
      const entryStyle = directive?.entry ?? anims.entry;
      const behaviorStyle = directive?.behavior ?? anims.behavior;
      const exitStyle = directive?.exit ?? anims.exit;

      // Semantic scale from emphasis
      const scale = EMPHASIS_CURVE[emphasisLevel] ?? 1.0;
      const isFiller = isFillerWord(wm.clean);
      const semanticScaleX = isFiller ? 0.85 : (emphasisLevel >= 4 ? scale * 0.9 : 1.0);
      const semanticScaleY = isFiller ? 0.85 : (emphasisLevel >= 4 ? scale * 0.9 : 1.0);

      // Entry duration multiplier
      const entryDurationMult = isFiller ? 0.6 : (emphasisLevel >= 4 ? 1.4 : 1.0);

      // Emitter type from directive
      const emitterType = resolveV3EmitterType(directive);

      // Hero presentation from word directive in cinematic direction
      const heroPresentation = isHero && emphasisLevel >= 4
        ? ((directive as any)?.heroPresentation ?? 'inline-scale')
        : undefined;

      compiledWords.push({
        id: `w-${group.lineIndex}-${group.groupIndex}-${wi}`,
        text: wm.word,
        clean: wm.clean,
        start: wm.start,
        end: wm.end,
        entryStyle,
        exitStyle,
        behaviorStyle,
        fontWeight: pos?.isAnchor ? (pre.chapterFontWeights[0] ?? 700) : (isFiller ? 400 : 600),
        fontFamily: pre.fontFamily,
        color: lineColor,
        layoutX: pos?.x ?? 480,
        layoutY: pos?.y ?? 270,
        semanticScaleX,
        semanticScaleY,
        entryDurationMult,
        isHeroWord: isHero,
        heroPresentation,
        emitterType: emitterType !== 'none' ? emitterType : undefined,
        ghostTrail: directive?.ghostTrail,
        ghostCount: directive?.ghostCount,
        ghostSpacing: directive?.ghostSpacing,
        ghostDirection: directive?.ghostDirection,
        trail: directive?.trail as string | undefined,
        elementalClass: (directive as any)?.elementalClass ?? undefined,
        emphasisLevel,
        directive,
        lineIndex: wm.lineIndex,
        wordIndex: wm.wordIndex,
      });
    }

    compiledGroups.push({
      words: compiledWords,
      start: group.start,
      end: group.end,
      anchorWordIdx: group.anchorWordIdx,
      lineIndex: group.lineIndex,
      groupIndex: group.groupIndex,
      entryDuration: pre.animParams.entryDuration,
      exitDuration: pre.animParams.exitDuration,
      lingerDuration: pre.animParams.linger,
      staggerDelay: pre.animParams.stagger,
      behaviorIntensity: pre.motionDefaults.behaviorIntensity,
    });
  }

  // Build beat events
  const beats = payload.beat_grid?.beats ?? [];
  const heat = cd?.motion === 'weighted' ? 0.8
    : cd?.motion === 'glitch' ? 0.7
    : cd?.motion === 'elastic' ? 0.6
    : cd?.motion === 'drift' ? 0.2
    : 0.45;
  const beatEvents = beats.map((t: number) => ({
    time: t,
    springVelocity: heat * 1.5,
  }));

  // Build chapters
  const rawChapters = (cd?.chapters as any[]) ?? [];
  const sections = rawChapters.length > 0
    ? rawChapters
    : enrichSections(payload.cinematic_direction?.sections).map((s: CinematicSection) => ({
        startRatio: s.startRatio,
        endRatio: s.endRatio,
      }));

  const chapters = sections.length > 0
    ? sections.map((ch: any) => ({
        startRatio: ch.startRatio ?? 0,
        endRatio: ch.endRatio ?? 1,
        targetZoom: ch.zoom ?? ch.targetZoom ?? 1.0,
      }))
    : [{ startRatio: 0, endRatio: 1, targetZoom: 1.0 }];

  return {
    phraseGroups: compiledGroups,
    beatEvents,
    chapters,
    emotionalArc: pre.emotionalArc,
    bpm,
  };
}
