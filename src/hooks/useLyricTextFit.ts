import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { fitTextToViewport, type MeasureContext } from "@/engine/textLayout";

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): MeasureContext | null {
  if (typeof document === "undefined") return null;
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement("canvas");
  }
  return sharedMeasureCanvas.getContext("2d");
}

export interface LyricTextFit {
  fontSize: number;
  totalHeight: number;
  lines: string[];
}

interface UseLyricTextFitParams {
  containerRef: RefObject<HTMLElement | null>;
  text: string;
  fontFamily: string;
  fontWeight: number;
  maxFontPx?: number;
  minFontPx?: number;
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function computeFit({
  measureCtx,
  container,
  words,
  fontFamily,
  fontWeight,
  maxFontPx,
  minFontPx,
}: {
  measureCtx: MeasureContext;
  container: HTMLElement;
  words: string[];
  fontFamily: string;
  fontWeight: number;
  maxFontPx: number;
  minFontPx: number;
}): LyricTextFit | null {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (cw <= 0 || ch <= 0) return null;
  if (!words.length) {
    return { fontSize: minFontPx, totalHeight: 0, lines: [] };
  }

  const layout = fitTextToViewport(measureCtx, words, cw, ch, fontFamily, fontWeight, {
    minFontPx,
    targetFillRatio: 0.88,
  });

  return {
    fontSize: Math.min(maxFontPx, Math.max(minFontPx, layout.fontSize)),
    totalHeight: layout.totalHeight,
    lines: layout.lines,
  };
}

export function useLyricTextFit({
  containerRef,
  text,
  fontFamily,
  fontWeight,
  maxFontPx = 64,
  minFontPx = 16,
}: UseLyricTextFitParams): LyricTextFit {
  const [fit, setFit] = useState<LyricTextFit>({
    fontSize: Math.min(maxFontPx, 32),
    totalHeight: 0,
    lines: splitWords(text).length ? [text] : [],
  });
  const lastDepsRef = useRef<string>("");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measureCtx = getMeasureContext();
    if (!container || !measureCtx) return;

    const runCompute = () => {
      const next = computeFit({
        measureCtx,
        container,
        words: splitWords(text),
        fontFamily,
        fontWeight,
        maxFontPx,
        minFontPx,
      });
      if (next) setFit(next);
    };

    const depsKey = `${text}|${fontFamily}|${fontWeight}|${maxFontPx}|${minFontPx}`;
    if (depsKey !== lastDepsRef.current) {
      lastDepsRef.current = depsKey;
    }
    runCompute();

    const resizeObserver = new ResizeObserver(runCompute);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, text, fontFamily, fontWeight, maxFontPx, minFontPx]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;

    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;

      const container = containerRef.current;
      const measureCtx = getMeasureContext();
      if (!container || !measureCtx) return;

      lastDepsRef.current = "";
      const next = computeFit({
        measureCtx,
        container,
        words: splitWords(text),
        fontFamily,
        fontWeight,
        maxFontPx,
        minFontPx,
      });

      if (next) setFit(next);
    });

    return () => {
      cancelled = true;
    };
  }, [containerRef, text, fontFamily, fontWeight, maxFontPx, minFontPx]);

  return fit;
}
