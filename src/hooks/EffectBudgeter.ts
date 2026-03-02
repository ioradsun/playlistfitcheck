/**
 * EffectBudgeter — pre-computes timing budgets and effect assignments for every word.
 *
 * Runs once at compile time (not per frame). Each word gets:
 * - A screen-time budget (how long it's visible)
 * - Reserved entry/exit zones that guarantee effects complete
 * - An effect tier that determines which animations are allowed
 * - A beat energy profile from the BeatConductor
 *
 * The AI's cinematic direction picks the INTENT (dramatic, gentle, explosive).
 * This module picks the EXECUTION that fits the timing.
 *
 * RULES:
 * - No React imports. Pure computation.
 * - Runs once after scene compilation, before playback.
 * - Never called per-frame.
 */

import {
  BeatConductor,
  type BeatWindowProfile,
  type EffectTier,
  TIER_ENTRIES,
  TIER_EXITS,
} from "@/engine/BeatConductor";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface WordTimingBudget {
  /** Word identifier (lineIndex-groupIndex-wordIndex) */
  wordId: string;
  /** Total time this word is on screen (seconds) */
  screenTime: number;
  /** Reserved entry animation time (seconds) — effect WILL complete in this window */
  entryBudget: number;
  /** Reserved linger time (seconds) — word is fully visible, beat-reactive */
  lingerBudget: number;
  /** Reserved exit animation time (seconds) — effect WILL complete in this window */
  exitBudget: number;
  /** Effect tier: what class of animations this word can use */
  effectTier: EffectTier;
  /** Beat energy during this word's lifetime */
  beatProfile: BeatWindowProfile;
  /** Resolved entry style (may differ from AI request if budget is tight) */
  resolvedEntry: string;
  /** Resolved exit style (may differ from AI request if budget is tight) */
  resolvedExit: string;
  /** Resolved behavior style for linger period */
  resolvedBehavior: string;
  /** Behavior intensity scaled by beat energy */
  behaviorIntensity: number;
  /** Whether entry and exit can overlap (only for very short words) */
  allowOverlap: boolean;
}

export interface GroupTimingBudget {
  /** Group identifier (lineIndex-groupIndex) */
  groupId: string;
  /** Line index this group belongs to */
  lineIndex: number;
  /** Group start time (seconds) */
  startSec: number;
  /** Group end time (seconds) */
  endSec: number;
  /** Beat energy for the entire group window */
  groupBeatProfile: BeatWindowProfile;
  /** Word budgets for each word in this group */
  words: WordTimingBudget[];
  /** Stagger delay between words (may be adjusted based on beat) */
  staggerDelay: number;
}

// ──────────────────────────────────────────────────────────────
// Budget computation
// ──────────────────────────────────────────────────────────────

/** Maximum portion of screen time that entry can consume */
const MAX_ENTRY_RATIO = 0.35;
/** Maximum portion of screen time that exit can consume */
const MAX_EXIT_RATIO = 0.30;
/** Minimum linger time (seconds) — word must be fully visible for at least this long */
const MIN_LINGER = 0.08;

/**
 * Map of behavior styles to their minimum linger requirement.
 * Behaviors that need time to read (orbit, pendulum) require longer linger.
 * Fast behaviors (pulse, vibrate) work in tight windows.
 */
const BEHAVIOR_MIN_LINGER: Record<string, number> = {
  pulse: 0.15,
  vibrate: 0.1,
  float: 0.4,
  grow: 0.3,
  contract: 0.3,
  flicker: 0.2,
  orbit: 0.6,
  lean: 0.4,
  freeze: 0.3,
  tilt: 0.3,
  pendulum: 0.5,
  'pulse-focus': 0.15,
  none: 0,
};

/**
 * Behaviors available at each effect tier.
 * Short-lived words only get fast behaviors.
 */
const TIER_BEHAVIORS: Record<EffectTier, string[]> = {
  snap: ['none'],
  quick: ['pulse', 'vibrate', 'none'],
  medium: ['pulse', 'vibrate', 'float', 'flicker', 'lean', 'tilt', 'pulse-focus', 'none'],
  full: ['pulse', 'vibrate', 'float', 'grow', 'contract', 'flicker', 'orbit', 'lean', 'freeze', 'tilt', 'pendulum', 'pulse-focus', 'none'],
};

/**
 * Compute timing budgets for a compiled scene's phrase groups.
 *
 * @param groups - Compiled phrase groups from sceneCompiler
 * @param conductor - The BeatConductor instance
 * @param nextGroupStarts - Map of group index to the start time of the next group
 *                          (used to ensure exit completes before next group enters)
 */
export function computeTimingBudgets(
  groups: Array<{
    lineIndex: number;
    groupIndex: number;
    start: number;
    end: number;
    staggerDelay: number;
    entryDuration: number;
    exitDuration: number;
    lingerDuration: number;
    behaviorIntensity: number;
    words: Array<{
      id: string;
      text: string;
      entryStyle: string;
      exitStyle: string;
      behaviorStyle: string;
      emphasisLevel: number;
      entryDurationMult: number;
      isHeroWord: boolean;
      isFiller: boolean;
    }>;
  }>,
  conductor: BeatConductor,
): GroupTimingBudget[] {
  const results: GroupTimingBudget[] = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const nextGroupStart = gi + 1 < groups.length ? groups[gi + 1].start : Infinity;

    // Group's total window including linger before exit
    const groupEnd = Math.min(group.end + group.lingerDuration, nextGroupStart);
    const groupTotalWindow = groupEnd + group.exitDuration;

    // Beat profile for the entire group
    const groupBeatProfile = conductor.getWindowProfile(group.start, groupTotalWindow);

    // Scale stagger to beat — faster BPM = tighter stagger
    const beatPeriod = conductor.beatPeriod;
    const beatAlignedStagger = Math.min(group.staggerDelay, beatPeriod * 0.25);

    const wordBudgets: WordTimingBudget[] = [];

    for (let wi = 0; wi < group.words.length; wi++) {
      const word = group.words[wi];
      const isAnchor = wi === 0; // simplified — could use anchorWordIdx
      const stagger = isAnchor ? 0 : Math.abs(wi) * beatAlignedStagger;

      // Word's actual visibility window
      const wordStart = group.start + stagger;
      const wordEnd = groupEnd;
      const screenTime = Math.max(0.05, wordEnd - wordStart + group.exitDuration);

      // Get beat profile for this specific word's lifetime
      const beatProfile = conductor.getWindowProfile(wordStart, wordStart + screenTime);

      // Compute budgets with guaranteed minimums
      const requestedEntry = group.entryDuration * word.entryDurationMult;
      const requestedExit = group.exitDuration;

      let entryBudget = Math.min(requestedEntry, screenTime * MAX_ENTRY_RATIO);
      let exitBudget = Math.min(requestedExit, screenTime * MAX_EXIT_RATIO);
      let lingerBudget = screenTime - entryBudget - exitBudget;

      // If linger is negative, shrink entry and exit proportionally
      if (lingerBudget < MIN_LINGER) {
        const available = Math.max(0, screenTime - MIN_LINGER);
        const total = entryBudget + exitBudget;
        if (total > 0) {
          entryBudget = (entryBudget / total) * available;
          exitBudget = (exitBudget / total) * available;
        }
        lingerBudget = Math.max(MIN_LINGER, screenTime - entryBudget - exitBudget);
      }

      // For very short words, allow entry/exit overlap rather than cutting both short
      const allowOverlap = screenTime < 0.3;

      // Resolve effect tier from the beat window profile
      const effectTier = beatProfile.effectTier;

      // Budget the entry/exit styles — downgrade if they don't fit the tier
      const resolvedEntry = conductor.budgetEntry(word.entryStyle, beatProfile);
      const resolvedExit = conductor.budgetExit(word.exitStyle, beatProfile);

      // Resolve behavior — must fit in linger budget
      let resolvedBehavior = word.behaviorStyle;
      const behaviorMinLinger = BEHAVIOR_MIN_LINGER[resolvedBehavior] ?? 0;
      if (lingerBudget < behaviorMinLinger) {
        // Downgrade behavior to something that fits
        resolvedBehavior = resolveBehaviorForBudget(resolvedBehavior, lingerBudget, effectTier);
      }

      // Scale behavior intensity by beat energy
      // High-energy windows get more intense behaviors
      const behaviorIntensity = group.behaviorIntensity * (0.5 + beatProfile.energy * 0.8);

      wordBudgets.push({
        wordId: word.id,
        screenTime,
        entryBudget,
        lingerBudget,
        exitBudget,
        effectTier,
        beatProfile,
        resolvedEntry,
        resolvedExit,
        resolvedBehavior,
        behaviorIntensity,
        allowOverlap,
      });
    }

    results.push({
      groupId: `${group.lineIndex}-${group.groupIndex}`,
      lineIndex: group.lineIndex,
      startSec: group.start,
      endSec: groupTotalWindow,
      groupBeatProfile,
      words: wordBudgets,
      staggerDelay: beatAlignedStagger,
    });
  }

  return results;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Find the best behavior that fits the linger budget and effect tier. */
function resolveBehaviorForBudget(
  requested: string,
  lingerSec: number,
  tier: EffectTier,
): string {
  // If the requested behavior fits, use it
  const minLinger = BEHAVIOR_MIN_LINGER[requested] ?? 0;
  const allowed = TIER_BEHAVIORS[tier];
  if (lingerSec >= minLinger && allowed.includes(requested)) return requested;

  // Find the most energetic behavior that fits
  const energyOrder = ['pulse', 'vibrate', 'pulse-focus', 'flicker', 'tilt', 'lean', 'float', 'grow', 'contract', 'orbit', 'pendulum', 'freeze', 'none'];
  for (const behavior of energyOrder) {
    const bMin = BEHAVIOR_MIN_LINGER[behavior] ?? 0;
    if (lingerSec >= bMin && allowed.includes(behavior)) return behavior;
  }

  return 'none';
}

/**
 * Given a word's timing budget, compute guaranteed-safe entry/exit durations
 * that the evaluateFrame loop should use instead of the raw compiled values.
 *
 * This ensures the entry animation completes before linger starts,
 * and the exit animation starts only after linger ends.
 */
export function getSafeDurations(budget: WordTimingBudget): {
  entryDuration: number;
  exitDuration: number;
  lingerDuration: number;
} {
  return {
    entryDuration: budget.entryBudget,
    exitDuration: budget.exitBudget,
    lingerDuration: budget.lingerBudget,
  };
}
