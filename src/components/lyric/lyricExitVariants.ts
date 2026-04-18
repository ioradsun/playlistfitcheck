import type { TargetAndTransition, Transition } from "framer-motion";

export type ExitEffect =
  | "fade"
  | "drift_up"
  | "shrink"
  | "dissolve"
  | "cascade"
  | "scatter"
  | "slam"
  | "glitch"
  | "burn";

const DEFAULT_EXIT_DURATION = 0.5;

/**
 * Phrase-level exit variants.
 * Applied to the phrase container on unmount (via AnimatePresence).
 * cascade and scatter are handled per-word (see wordExitVariants).
 */
export function getPhraseExitVariant(effect: ExitEffect | undefined): {
  exit: TargetAndTransition;
  transition: Transition;
} {
  const e = effect ?? "fade";
  switch (e) {
    case "fade":
      return {
        exit: { opacity: 0 },
        transition: { duration: DEFAULT_EXIT_DURATION, ease: "easeOut" },
      };
    case "drift_up":
      return {
        exit: { opacity: 0, y: -40 },
        transition: { duration: DEFAULT_EXIT_DURATION, ease: "easeOut" },
      };
    case "shrink":
      return {
        exit: { opacity: 0, scale: 0.6 },
        transition: { duration: DEFAULT_EXIT_DURATION, ease: "easeIn" },
      };
    case "dissolve":
      return {
        exit: { opacity: 0, filter: "blur(10px)" },
        transition: { duration: DEFAULT_EXIT_DURATION * 1.2, ease: "easeOut" },
      };
    case "slam":
      return {
        exit: {
          opacity: [1, 1, 0],
          scale: [1, 1.3, 0],
        },
        transition: { duration: DEFAULT_EXIT_DURATION * 0.6, ease: "easeIn", times: [0, 0.3, 1] },
      };
    case "glitch":
      return {
        exit: {
          opacity: 0,
          x: [0, -8, 12, -6, 0],
          filter: ["hue-rotate(0deg)", "hue-rotate(90deg)", "hue-rotate(-60deg)", "hue-rotate(0deg)"],
        },
        transition: { duration: DEFAULT_EXIT_DURATION, ease: "easeOut" },
      };
    case "burn":
      return {
        exit: {
          opacity: 0,
          color: "#ff6b35",
          filter: "brightness(1.6)",
          y: 10,
        },
        transition: { duration: DEFAULT_EXIT_DURATION * 1.4, ease: "easeIn" },
      };
    case "cascade":
    case "scatter":
      // Handled at word level — phrase container just fades
      return {
        exit: { opacity: 0 },
        transition: { duration: DEFAULT_EXIT_DURATION, delay: 0.3, ease: "easeOut" },
      };
    default:
      return {
        exit: { opacity: 0 },
        transition: { duration: DEFAULT_EXIT_DURATION },
      };
  }
}

/**
 * Word-level exit variants — used for cascade and scatter where each word
 * exits independently on a staggered schedule.
 */
export function getWordExitVariant(
  effect: ExitEffect | undefined,
  wordIndex: number,
  totalWords: number,
): {
  exit: TargetAndTransition;
  transition: Transition;
} {
  const stagger = 0.08; // 80ms between each word's exit
  void totalWords;

  switch (effect) {
    case "cascade":
      return {
        exit: { opacity: 0, y: 30 },
        transition: {
          duration: 0.4,
          ease: "easeOut",
          delay: wordIndex * stagger,
        },
      };
    case "scatter": {
      // Deterministic scatter direction per word
      const seed = wordIndex * 2.71828;
      const dx = Math.sin(seed) * 60;
      const dy = Math.cos(seed * 1.3) * 40;
      const dr = Math.sin(seed * 0.7) * 30;
      return {
        exit: { opacity: 0, x: dx, y: dy, rotate: dr },
        transition: {
          duration: 0.5,
          ease: "easeOut",
          delay: wordIndex * stagger * 0.5,
        },
      };
    }
    default:
      // Other effects handled at phrase level
      return {
        exit: {},
        transition: { duration: 0 },
      };
  }
}

/**
 * Reveal (entry) stagger delay per word based on revealStyle.
 */
export function getWordEntryDelay(
  wordIndex: number,
  revealStyle: "instant" | "stagger_fast" | "stagger_slow" | undefined,
): number {
  switch (revealStyle) {
    case "instant":
      return 0;
    case "stagger_slow":
      return wordIndex * 0.25;
    case "stagger_fast":
    default:
      return wordIndex * 0.12;
  }
}
