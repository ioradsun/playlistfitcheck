import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fitTextToViewport, type MeasureContext } from "@/engine/textLayout";

let _sharedMeasureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): MeasureContext | null {
  if (typeof document === "undefined") return null;
  if (!_sharedMeasureCanvas) {
    _sharedMeasureCanvas = document.createElement("canvas");
  }
  return _sharedMeasureCanvas.getContext("2d");
}

export interface LyricTextFit {
  fontSize: number;
  totalHeight: number;
  lines: string[];
}

/**
 * Compute optimal font size for lyric text rendered inside a container.
 *
 * Wraps the engine's `fitTextToViewport` so DOM and canvas text size identically.
 * Recomputes on container resize, text change, font change, and document.fonts.ready.
 */
export function useLyricTextFit({
  containerRef,
  text,
  fontFamily,
  fontWeight,
  maxFontPx = 72,
  minFontPx = 18,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  text: string;
  fontFamily: string;
  fontWeight: number;
  maxFontPx?: number;
  minFontPx?: number;
}): LyricTextFit {
  const [fit, setFit] = useState<LyricTextFit>({
    fontSize: Math.min(maxFontPx, 32),
    totalHeight: 0,
    lines: [text],
  });

  const computeRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measureCtx = getMeasureContext();
    if (!measureCtx) return;

    computeRef.current = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        setFit({ fontSize: minFontPx, totalHeight: 0, lines: [] });
        return;
      }

      const layout = fitTextToViewport(measureCtx, words, cw, ch, fontFamily, fontWeight, {
        minFontPx,
        heroWordIndices: [],
        targetFillRatio: 0.88,
      });

      setFit({
        fontSize: Math.min(maxFontPx, Math.max(minFontPx, layout.fontSize)),
        totalHeight: layout.totalHeight,
        lines: layout.lines,
      });
    };

    computeRef.current();

    const ro = new ResizeObserver(() => computeRef.current());
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, text, fontFamily, fontWeight, maxFontPx, minFontPx]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      computeRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return fit;
}
