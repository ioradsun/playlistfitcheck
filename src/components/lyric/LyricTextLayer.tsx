import { memo, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ResolvedTypography } from "@/lib/fontResolver";
import { useLyricTextFit } from "@/hooks/useLyricTextFit";
import { getPhraseExitVariant, getWordEntryDelay, getWordExitVariant, type ExitEffect } from "./lyricExitVariants";

type TimedText = { start: number; end: number; text: string };
type TimedWord = { word: string; start: number; end: number };

type Phrase = {
  start?: number;
  end?: number;
  text?: string;
  heroWord?: string;
  heroWords?: string[];
  wordRange?: [number, number];
  bias?: "left" | "center" | "right";
  composition?: "stack" | "line" | "center_word";
  revealStyle?: "instant" | "stagger_fast" | "stagger_slow";
  exitEffect?: ExitEffect;
};

interface LyricTextLayerProps {
  lines: TimedText[];
  words?: TimedWord[];
  phrases?: Phrase[];
  typography?: ResolvedTypography | null;
  currentTimeSec: number;
  ownsText: boolean;
}

export const LyricTextLayer = memo(function LyricTextLayer({
  lines,
  words,
  phrases,
  typography,
  currentTimeSec,
  ownsText,
}: LyricTextLayerProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  const candidates = useMemo(() => {
    return phrases?.length
      ? phrases.map((p) => ({
          start: p.start ?? 0,
          end: p.end ?? Number.MAX_SAFE_INTEGER,
          text: p.text ?? "",
          phrase: p,
        }))
      : lines.map((l) => ({
          start: l.start,
          end: l.end,
          text: l.text,
          phrase: undefined as Phrase | undefined,
        }));
  }, [phrases, lines]);

  const active = useMemo(() => {
    if (!candidates.length) return null;
    const now = Number.isFinite(currentTimeSec) ? currentTimeSec : 0;
    const inWindow = candidates.find((p) => now >= p.start && now <= p.end);
    if (inWindow) return inWindow;
    const past = [...candidates].reverse().find((p) => now >= p.end);
    return past ?? candidates[0];
  }, [candidates, currentTimeSec]);

  const previewText = currentTimeSec === 0 && !candidates.some((p) => 0 >= p.start && 0 <= p.end) ? (lines[0]?.text ?? "") : "";

  const phraseText = (active?.text || previewText || "").trim();
  const phrase = active?.phrase;

  const phraseWords = useMemo(() => {
    if (phrase?.wordRange && words?.length) {
      const [start, end] = phrase.wordRange;
      return words.slice(Math.max(0, start), Math.max(start + 1, end + 1)).map((w) => w.word);
    }
    return phraseText.split(/\s+/).filter(Boolean);
  }, [phrase, words, phraseText]);

  const heroWordSet = useMemo(() => {
    const all = [...(phrase?.heroWords ?? []), phrase?.heroWord ?? ""]
      .map((w) => w.trim())
      .filter(Boolean);
    return new Set(all.map((w) => w.toLowerCase()));
  }, [phrase]);

  const primaryFontFamily = useMemo(() => {
    if (!typography?.fontFamily) return "Montserrat";
    return typography.fontFamily.split(",")[0].trim().replace(/["']/g, "");
  }, [typography?.fontFamily]);

  const primaryFontWeight = typography?.fontWeight ?? 700;

  const fit = useLyricTextFit({
    containerRef: outerRef,
    text: phraseText || "—",
    fontFamily: primaryFontFamily,
    fontWeight: primaryFontWeight,
    maxFontPx: 72,
    minFontPx: 18,
  });

  const composition = phrase?.composition ?? "line";
  const bias = phrase?.bias ?? "center";
  const revealStyle = phrase?.revealStyle ?? "stagger_fast";
  const exitEffect: ExitEffect = phrase?.exitEffect ?? "fade";

  const alignment = bias === "left" ? "flex-start" : bias === "right" ? "flex-end" : "center";
  const textAlign: "left" | "center" | "right" = bias;

  const baseStyle = typography
    ? {
        fontFamily: typography.fontFamily,
        fontWeight: typography.fontWeight,
        textTransform: typography.textTransform,
        letterSpacing: `${typography.letterSpacing}em`,
      }
    : {
        fontFamily: '"Montserrat", sans-serif',
        fontWeight: 700 as number,
        textTransform: "none" as const,
        letterSpacing: "0.2em",
      };

  const heroWeight = typography?.heroWeight ?? 800;
  const heroScale = 1.15;
  const fillerOpacity = 0.65;
  const phraseHasHero = heroWordSet.size > 0;
  const phraseVariant = getPhraseExitVariant(exitEffect);

  const phraseKey = phrase
    ? `phrase-${phrase.wordRange?.[0] ?? 0}-${phrase.wordRange?.[1] ?? 0}-${phrase.start ?? 0}`
    : `line-${active?.start ?? 0}-${active?.end ?? 0}`;

  return (
    <div
      ref={outerRef}
      data-text-owner={ownsText ? "dom" : "canvas"}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: alignment,
        pointerEvents: "none",
        padding: "0 5%",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phraseText && (
          <motion.div
            key={phraseKey}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={phraseVariant.exit}
            transition={phraseVariant.transition}
            style={{
              width: "100%",
              fontSize: `${fit.fontSize}px`,
              lineHeight: 1.15,
              color: "#fff",
              textShadow: "0 1px 20px rgba(0,0,0,.45)",
              textAlign,
              wordBreak: "normal",
              overflowWrap: "break-word",
              ...getCompositionStyles(composition, bias),
            }}
          >
            <PhraseBody
              words={phraseWords}
              heroWordSet={heroWordSet}
              baseStyle={baseStyle}
              heroWeight={heroWeight}
              heroScale={heroScale}
              fillerOpacity={fillerOpacity}
              phraseHasHero={phraseHasHero}
              revealStyle={revealStyle}
              exitEffect={exitEffect}
              composition={composition}
              isPreview={!!previewText}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface PhraseBodyProps {
  words: string[];
  heroWordSet: Set<string>;
  baseStyle: React.CSSProperties;
  heroWeight: number;
  heroScale: number;
  fillerOpacity: number;
  phraseHasHero: boolean;
  revealStyle: "instant" | "stagger_fast" | "stagger_slow";
  exitEffect: ExitEffect;
  composition: "stack" | "line" | "center_word";
  isPreview: boolean;
}

function PhraseBody({
  words,
  heroWordSet,
  baseStyle,
  heroWeight,
  heroScale,
  fillerOpacity,
  phraseHasHero,
  revealStyle,
  exitEffect,
  composition,
  isPreview,
}: PhraseBodyProps) {
  if (words.length === 0) return null;

  return (
    <>
      {words.map((word, i) => {
        const isHero = heroWordSet.has(word.toLowerCase().replace(/[^\w']/g, ""));
        const entryDelay = getWordEntryDelay(i, revealStyle);
        const wordExit = getWordExitVariant(exitEffect, i, words.length);

        const opacity = isPreview ? 0.5 : phraseHasHero && !isHero ? fillerOpacity : 1;
        const wordStyle: React.CSSProperties = {
          ...baseStyle,
          display: "inline-block",
          opacity,
          transformOrigin: "center",
        };

        if (isHero) {
          wordStyle.fontWeight = heroWeight;
          (wordStyle as { scale?: number }).scale = heroScale;
          wordStyle.zIndex = 2;
        }

        return (
          <motion.span
            key={`w-${i}-${word}`}
            style={wordStyle}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity, y: 0 }}
            exit={wordExit.exit}
            transition={{
              opacity: { duration: 0.4, delay: entryDelay, ease: "easeOut" },
              y: { duration: 0.4, delay: entryDelay, ease: "easeOut" },
              ...wordExit.transition,
            }}
          >
            {word}
            {i < words.length - 1 && composition !== "stack" && <span aria-hidden>&nbsp;</span>}
          </motion.span>
        );
      })}
    </>
  );
}

function getCompositionStyles(
  composition: "stack" | "line" | "center_word",
  bias: "left" | "center" | "right",
): Record<string, unknown> {
  const alignItems = bias === "left" ? "flex-start" : bias === "right" ? "flex-end" : "center";

  switch (composition) {
    case "stack":
      return {
        display: "flex",
        flexDirection: "column",
        gap: "0.1em",
        alignItems,
      };
    case "center_word":
      return {
        display: "block",
        textWrap: "balance" as const,
      };
    case "line":
    default:
      return {
        display: "block",
        textWrap: "balance" as const,
      };
  }
}
