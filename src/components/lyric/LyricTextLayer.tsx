import { memo, useEffect, useMemo, useRef } from "react";
import type { ResolvedTypography } from "@/lib/fontResolver";
import { useLyricTextFit } from "@/hooks/useLyricTextFit";

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
};

interface LyricTextLayerProps {
  lines: TimedText[];
  words?: TimedWord[];
  phrases?: Phrase[];
  typography?: ResolvedTypography | null;
  currentTimeSec: number;
  ownsText: boolean;
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const LyricTextLayer = memo(function LyricTextLayer({
  lines,
  words,
  phrases,
  typography,
  currentTimeSec,
  ownsText,
}: LyricTextLayerProps) {
  const candidates = phrases?.length
    ? phrases.map((p) => ({ start: p.start ?? 0, end: p.end ?? Number.MAX_SAFE_INTEGER, text: p.text ?? "", phrase: p }))
    : lines.map((l) => ({ start: l.start, end: l.end, text: l.text, phrase: undefined as Phrase | undefined }));

  const active = useMemo(() => {
    if (!candidates.length) return null;
    const now = Number.isFinite(currentTimeSec) ? currentTimeSec : 0;
    const inWindow = candidates.find((p) => now >= p.start && now <= p.end);
    if (inWindow) return inWindow;
    const past = [...candidates].reverse().find((p) => now >= p.end);
    return past ?? candidates[0];
  }, [candidates, currentTimeSec]);

  const previewText = currentTimeSec === 0 && !candidates.some((p) => 0 >= p.start && 0 <= p.end)
    ? (lines[0]?.text ?? "")
    : "";

  const phraseText = (active?.text || previewText || "").trim();
  const phrase = active?.phrase;

  const visibleText = useMemo(() => {
    if (!phrase) return phraseText;
    if (!words?.length || !phrase.wordRange || phrase.wordRange.length !== 2) return phraseText;
    const [start, end] = phrase.wordRange;
    return words
      .slice(Math.max(0, start), Math.max(start + 1, end + 1))
      .filter((w) => currentTimeSec >= w.start)
      .map((w) => w.word)
      .join(" ") || phraseText;
  }, [phrase, words, phraseText, currentTimeSec]);

  const heroWords = useMemo(() => {
    const all = [...(phrase?.heroWords ?? []), phrase?.heroWord ?? ""].map((w) => w.trim()).filter(Boolean);
    return Array.from(new Set(all));
  }, [phrase]);

  const heroRegex = useMemo(() => {
    if (!heroWords.length) return null;
    return new RegExp(`(${heroWords.map(escapeRegex).join("|")})`, "gi");
  }, [heroWords]);

  const firstPaintRef = useRef(true);
  const showTransition = !firstPaintRef.current;
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstPaintRef.current = false;
  }, []);

  const primaryFontFamily = useMemo(() => {
    if (!typography?.fontFamily) return "Montserrat";
    return typography.fontFamily.split(",")[0]?.trim().replace(/["']/g, "") || "Montserrat";
  }, [typography?.fontFamily]);

  const primaryFontWeight = typography?.fontWeight ?? 700;

  const fit = useLyricTextFit({
    containerRef: outerRef,
    text: visibleText,
    fontFamily: primaryFontFamily,
    fontWeight: primaryFontWeight,
    maxFontPx: 64,
    minFontPx: 18,
  });

  const alignment = phrase?.bias === "left" ? "flex-start" : phrase?.bias === "right" ? "flex-end" : "center";
  const textAlign = phrase?.bias ?? "center";
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

  const parts = heroRegex ? visibleText.split(heroRegex) : [visibleText];

  return (
    <div
      ref={outerRef}
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
      data-text-owner={ownsText ? "dom" : "canvas"}
    >
      <div
        role="region"
        aria-live="off"
        aria-label="Lyrics"
        style={{
          width: "100%",
          textAlign: textAlign as "left" | "center" | "right",
          fontSize: `${fit.fontSize}px`,
          lineHeight: 1.15,
          color: "#fff",
          opacity: previewText ? 0.5 : 1,
          transition: showTransition ? "opacity 120ms, font-size 80ms" : "none",
          textWrap: "balance",
          wordBreak: "normal",
          overflowWrap: "break-word",
          textShadow: "0 1px 20px rgba(0,0,0,.45)",
        }}
      >
        {parts.map((part, idx) => {
          const isHero = heroWords.some((w) => part.toLowerCase() === w.toLowerCase());
          if (!isHero) {
            return <span key={`${part}-${idx}`} style={baseStyle}>{part}</span>;
          }
          return (
            <span
              key={`${part}-${idx}`}
              style={{
                ...baseStyle,
                fontWeight: heroWeight,
              }}
            >
              {part}
            </span>
          );
        })}
      </div>
    </div>
  );
});
