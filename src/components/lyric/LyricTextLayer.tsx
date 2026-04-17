import { memo, useEffect, useMemo, useRef } from "react";

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
  typographyPlan?: { primary?: string; case?: string; baseWeight?: string; heroStyle?: string } | null;
  currentTimeSec: number;
  ownsText: boolean;
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const LyricTextLayer = memo(function LyricTextLayer({
  lines,
  words,
  phrases,
  typographyPlan,
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

  useEffect(() => {
    firstPaintRef.current = false;
  }, []);

  const alignment = phrase?.bias === "left" ? "flex-start" : phrase?.bias === "right" ? "flex-end" : "center";
  const textAlign = phrase?.bias ?? "center";
  const baseWeight = Number(typographyPlan?.baseWeight) || 700;
  const baseStyle = {
    fontFamily: typographyPlan?.primary,
    fontWeight: baseWeight,
    textTransform: typographyPlan?.case === "upper" ? "uppercase" : undefined,
  };

  const parts = heroRegex ? visibleText.split(heroRegex) : [visibleText];

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: alignment, pointerEvents: "none", padding: "0 7%" }} data-text-owner={ownsText ? "dom" : "canvas"}>
      <div role="region" aria-live="off" aria-label="Lyrics" style={{ maxWidth: "86%", overflow: "hidden", wordBreak: "normal", textAlign: textAlign as "left" | "center" | "right", fontSize: "clamp(20px, 4.2vw, 46px)", lineHeight: 1.2, color: "#fff", opacity: previewText ? 0.5 : 1, transition: showTransition ? "opacity 120ms" : "none", textWrap: "balance", textShadow: "0 1px 20px rgba(0,0,0,.45)" }}>
        {parts.map((part, idx) => {
          const isHero = heroWords.some((w) => part.toLowerCase() === w.toLowerCase());
          if (!isHero) return <span key={`${part}-${idx}`} style={baseStyle}>{part}</span>;
          return <span key={`${part}-${idx}`} style={{ ...baseStyle, fontWeight: Math.max(800, baseWeight), fontStyle: typographyPlan?.heroStyle?.includes("italic") ? "italic" : undefined }}>{part}</span>;
        })}
      </div>
    </div>
  );
});
