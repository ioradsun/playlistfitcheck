import type { LineAnimation } from "@/engine/AnimationResolver";

export type WordClass =
  | "IMPACT"
  | "TENDER"
  | "MOTION"
  | "NEGATION"
  | "SELF"
  | "OTHER"
  | "QUESTION"
  | "TRANSCENDENT"
  | "FILLER"
  | "NEUTRAL";

export type PhoneticClass = "HARD" | "SOFT" | "NEUTRAL";

export interface WordVisualProps {
  scale: number;
  color: string;
  opacity: number;
  xOffset: number;
  yOffset: number;
  glowRadius: number;
  delay: number;
  letterSpacing: string;
  showTrail: boolean;
  trailCount: number;
}

const WORD_CLASSES = {
  IMPACT: ["fire", "burn", "crash", "hit", "strike", "explode", "shatter", "break", "fall", "die", "kill", "fight", "war", "pain", "hate", "rage", "wild", "gone", "lost", "flames", "insane"],
  TENDER: ["love", "heart", "soft", "gentle", "hold", "touch", "feel", "breathe", "dream", "sleep", "safe", "home", "still", "quiet", "peace"],
  MOTION: ["run", "running", "fly", "falling", "rise", "moving", "chase", "escape", "drift", "spinning", "going", "coming", "racing", "rushing", "flee"],
  NEGATION: ["no", "not", "never", "cant", "wont", "dont", "nothing", "nowhere", "nobody", "none"],
  SELF: ["i", "me", "my", "mine", "myself", "im"],
  OTHER: ["you", "your", "yours", "yourself", "we", "us", "our", "they", "them", "their"],
  QUESTION: ["why", "what", "where", "when", "how", "who", "is", "are", "was", "will", "could"],
  TRANSCENDENT: ["god", "soul", "forever", "infinite", "eternal", "heaven", "light", "dark", "universe", "truth", "free", "alive", "real"],
} as const;

const FILLER_WORDS = new Set(["the", "a", "an", "in", "on", "at", "to", "of", "and", "or", "but", "is", "it", "as"]);

const WORD_CLASS_LOOKUP = new Map<string, WordClass>();
(Object.entries(WORD_CLASSES) as Array<[Exclude<WordClass, "FILLER" | "NEUTRAL">, readonly string[]]>).forEach(([wordClass, words]) => {
  words.forEach((word) => WORD_CLASS_LOOKUP.set(word, wordClass));
});

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
}

function toSoftTint(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#ffd4c4";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const warmR = Math.min(255, Math.round(r * 0.7 + 255 * 0.3));
  const warmG = Math.min(255, Math.round(g * 0.75 + 210 * 0.25));
  const warmB = Math.min(255, Math.round(b * 0.75 + 190 * 0.25));
  return `rgb(${warmR}, ${warmG}, ${warmB})`;
}

function isLongVowelWord(word: string): boolean {
  return /(ay|ee|oh|oo)/i.test(word);
}

export function classifyWord(word: string): WordClass {
  const normalized = normalizeWord(word);
  if (!normalized) return "NEUTRAL";
  if (FILLER_WORDS.has(normalized)) return "FILLER";
  return WORD_CLASS_LOOKUP.get(normalized) ?? "NEUTRAL";
}

export function getPhoneticClass(word: string): PhoneticClass {
  if (!word || word.length === 0) return "NEUTRAL";
  const hard = /[bdgkpt]/i.test(word[0]);
  const soft = /[flmnrsvw]/i.test(word[0]);
  return hard ? "HARD" : soft ? "SOFT" : "NEUTRAL";
}

export function getWordVisualProps(
  word: string,
  wordIndex: number,
  lineAnim: LineAnimation,
  beatIntensity: number,
  appearanceCount: number,
): WordVisualProps {
  const wordClass = classifyWord(word);
  const phoneticClass = getPhoneticClass(word);
  const normalized = normalizeWord(word);

  const repetitionLevel = Math.max(0, appearanceCount - 1);
  const repetitionBoost = Math.min(0.3, repetitionLevel * 0.1);
  const repetitionScale = 1 + repetitionBoost;
  const repetitionOpacity = 1 + Math.min(0.2, repetitionLevel * 0.1);

  const base: WordVisualProps = {
    scale: (1 + beatIntensity * 0.04) * repetitionScale,
    color: lineAnim.lineColor,
    opacity: Math.min(1, (lineAnim.opacityOverride ?? 1) * repetitionOpacity),
    xOffset: 0,
    yOffset: 0,
    glowRadius: 0,
    delay: wordIndex * 0.22,
    letterSpacing: "0em",
    showTrail: false,
    trailCount: 0,
  };

  if (wordClass === "FILLER") {
    return {
      ...base,
      scale: 0.75,
      opacity: 0.6,
      color: "rgba(220,220,220,0.85)",
      letterSpacing: "0em",
    };
  }

  if (wordClass === "IMPACT") {
    base.scale = (1.15 + beatIntensity * 0.2) * repetitionScale;
    base.color = appearanceCount >= 4 ? "#ffffff" : "#f97316";
    base.opacity = 1;
    base.yOffset = 6;
    base.glowRadius = 6;
    base.delay = wordIndex * 0.2;
  } else if (wordClass === "TENDER") {
    base.scale = (0.98 + beatIntensity * 0.05) * repetitionScale;
    base.color = toSoftTint("#fda4af");
    base.opacity = Math.min(1, 0.88 * repetitionOpacity);
    base.letterSpacing = "0.03em";
    base.yOffset = -3;
    base.delay = wordIndex * 0.26;
  } else if (wordClass === "MOTION") {
    base.scale = (1.08 + beatIntensity * 0.06) * repetitionScale;
    base.color = "#f97316";
    base.showTrail = true;
    base.trailCount = 3;
    base.xOffset = /(run|running|fly|rise|going|coming|racing|rushing|chase|escape)/i.test(normalized) ? 8 : 2;
    base.yOffset = /(fall|falling|drift)/i.test(normalized) ? 6 : 0;
  } else if (wordClass === "NEGATION") {
    base.scale = 0.85 * repetitionScale;
    base.color = "#9ca3af";
    base.opacity = 0.72;
    base.yOffset = -8;
  } else if (wordClass === "SELF") {
    base.scale = (1.15 + beatIntensity * 0.05) * repetitionScale;
    base.color = "#ffffff";
    base.glowRadius = 8;
  } else if (wordClass === "OTHER") {
    base.scale = (1.04 + beatIntensity * 0.04) * repetitionScale;
    base.color = "#f97316";
    base.xOffset = 3;
  } else if (wordClass === "QUESTION") {
    base.scale = (0.98 - beatIntensity * 0.02) * repetitionScale;
    base.color = "#fbbf24";
    base.yOffset = -6;
    base.letterSpacing = "0.04em";
  } else if (wordClass === "TRANSCENDENT") {
    base.scale = (1.14 + beatIntensity * 0.08) * repetitionScale;
    base.color = "#ffffff";
    base.glowRadius = 12;
    base.yOffset = -10;
  }

  if (appearanceCount >= 4) {
    base.color = "#ffffff";
    base.scale = Math.max(base.scale, 1.3);
    base.glowRadius = Math.max(base.glowRadius, 12);
  }

  if (phoneticClass === "SOFT") {
    base.opacity = Math.min(1, base.opacity * 0.9);
  } else if (phoneticClass === "HARD") {
    base.opacity = Math.min(1, base.opacity * 1.05);
    if (wordClass === "IMPACT") {
      base.scale += 0.06;
    }
  }

  if (isLongVowelWord(normalized)) {
    base.scale += 0.04;
    base.letterSpacing = base.letterSpacing === "0em" ? "0.02em" : base.letterSpacing;
  }

  return base;
}
