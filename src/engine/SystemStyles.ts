/**
 * SystemStyles — Per-system text rendering identity.
 *
 * Each physics system gets a unique visual treatment for text:
 * font, weight, letter-spacing, text-transform, layout, and color mode.
 * Effects in EffectRegistry consume these to render with variety.
 */

export type TextLayout = "center" | "stacked" | "stagger" | "wide" | "arc";
export type ColorMode = "solid" | "gradient" | "per-char" | "duotone";

export interface SystemStyle {
  font: string;
  weight: string;
  letterSpacing: number;   // px
  textTransform: "uppercase" | "lowercase" | "none";
  layout: TextLayout;
  colorMode: ColorMode;
  italics: boolean;
  lineHeight: number;       // multiplier
}

const SYSTEM_STYLES: Record<string, SystemStyle> = {
  fracture: {
    font: '"Space Mono", monospace',
    weight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    layout: "center",
    colorMode: "duotone",
    italics: false,
    lineHeight: 1.0,
  },
  pressure: {
    font: '"Oswald", sans-serif',
    weight: "700",
    letterSpacing: 8,
    textTransform: "uppercase",
    layout: "wide",
    colorMode: "solid",
    italics: false,
    lineHeight: 1.0,
  },
  breath: {
    font: '"Playfair Display", serif',
    weight: "400",
    letterSpacing: 1,
    textTransform: "lowercase",
    layout: "stagger",
    colorMode: "gradient",
    italics: true,
    lineHeight: 1.4,
  },
  combustion: {
    font: '"Bebas Neue", cursive',
    weight: "400",
    letterSpacing: 3,
    textTransform: "uppercase",
    layout: "stacked",
    colorMode: "per-char",
    italics: false,
    lineHeight: 0.9,
  },
  orbit: {
    font: '"Caveat", cursive',
    weight: "700",
    letterSpacing: 0,
    textTransform: "none",
    layout: "arc",
    colorMode: "gradient",
    italics: false,
    lineHeight: 1.2,
  },
  paper: {
    font: '"EB Garamond", serif',
    weight: "600",
    letterSpacing: 1,
    textTransform: "none",
    layout: "center",
    colorMode: "solid",
    italics: false,
    lineHeight: 1.3,
  },
  glass: {
    font: '"Inter", sans-serif',
    weight: "300",
    letterSpacing: 4,
    textTransform: "uppercase",
    layout: "wide",
    colorMode: "gradient",
    italics: false,
    lineHeight: 1.1,
  },
};

const DEFAULT_STYLE: SystemStyle = SYSTEM_STYLES.fracture;

export function getSystemStyle(system: string): SystemStyle {
  return SYSTEM_STYLES[system] ?? DEFAULT_STYLE;
}

/** Build a CSS font string from a SystemStyle + font size */
export function buildFont(style: SystemStyle, fs: number): string {
  const italic = style.italics ? "italic " : "";
  return `${italic}${style.weight} ${fs}px ${style.font}`;
}

/** Apply text transform */
export function applyTransform(text: string, style: SystemStyle): string {
  switch (style.textTransform) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    default: return text;
  }
}

/** Stacked layout info for narrow viewports */
export interface StackedLayout {
  lines: string[];
  fs: number;
  effectiveLetterSpacing: number;
  isStacked: boolean;
}

const STACK_THRESHOLD = 600;
const MAX_STACK_LINES = 3;

/**
 * For narrow canvases (<400px), split text into up to 3 stacked lines
 * and compute the largest font size that fits within 85% of canvas width.
 */
export function computeStackedLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  system: string,
): StackedLayout {
  const st = getSystemStyle(system);
  const displayText = applyTransform(text, st);
  const words = displayText.split(/\s+/).filter(Boolean);

  if (canvasW >= STACK_THRESHOLD || words.length <= 2) {
    const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, text, canvasW, system);
    return { lines: [displayText], fs, effectiveLetterSpacing, isStacked: false };
  }

  const lineCount = Math.min(MAX_STACK_LINES, words.length);
  const wordsPerLine = Math.ceil(words.length / lineCount);
  const stackedLines: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    stackedLines.push(words.slice(i, i + wordsPerLine).join(" "));
  }

  const targetW = canvasW * 0.85;
  const targetH = canvasH * 0.70;
  const REF = 100;
  let ls = st.letterSpacing;

  ctx.font = buildFont(st, REF);
  let maxLineW = 0;
  for (const line of stackedLines) {
    let lineW = 0;
    for (let i = 0; i < line.length; i++) {
      lineW += ctx.measureText(line[i]).width + ls;
    }
    maxLineW = Math.max(maxLineW, lineW);
  }

  if (maxLineW <= 0) {
    return { lines: stackedLines, fs: 24, effectiveLetterSpacing: ls, isStacked: true };
  }

  let fs = (targetW / maxLineW) * REF;

  const lineHeight = st.lineHeight || 1.2;
  const totalStackedH = fs * lineHeight * stackedLines.length;
  if (totalStackedH > targetH) {
    fs = targetH / (lineHeight * stackedLines.length);
  }

  ctx.font = buildFont(st, fs);
  let worstW = 0;
  for (const line of stackedLines) {
    let lw = 0;
    for (let i = 0; i < line.length; i++) {
      lw += ctx.measureText(line[i]).width + ls;
    }
    worstW = Math.max(worstW, lw);
  }
  if (worstW > targetW && ls > 0) {
    ls = Math.max(0, ls - (worstW - targetW) / Math.max(1, stackedLines.reduce((m, l) => Math.max(m, l.length), 0)));
  }

  fs = Math.max(fs, canvasW * 0.04);

  return { lines: stackedLines, fs: Math.round(fs), effectiveLetterSpacing: ls, isStacked: true };
}

/** Create a gradient fill for text */
export function createGradientFill(
  ctx: CanvasRenderingContext2D,
  palette: string[],
  x: number, y: number, w: number
): CanvasGradient {
  const grad = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y);
  palette.forEach((c, i) => grad.addColorStop(i / Math.max(1, palette.length - 1), c));
  return grad;
}

/**
 * First-principles font sizing: text always fills ~80% of canvas width.
 * If letter-spacing makes that impossible, reduce spacing proportionally.
 *
 * Rule: text is the focal point → it MUST be big.
 */
export function computeFitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  system: string,
): { fs: number; effectiveLetterSpacing: number } {
  const st = getSystemStyle(system);
  const displayText = applyTransform(text, st);
  const charCount = displayText.length;
  if (charCount === 0) return { fs: 12, effectiveLetterSpacing: st.letterSpacing };

  const targetW = canvasW * 0.80;
  const minFs = canvasW * 0.03;  // floor: 3% of canvas width

  // Measure glyph widths at reference size
  const REF = 100;
  ctx.font = buildFont(st, REF);
  let glyphSum = 0;
  for (let i = 0; i < charCount; i++) {
    glyphSum += ctx.measureText(displayText[i]).width;
  }
  if (glyphSum <= 0) return { fs: Math.max(12, minFs), effectiveLetterSpacing: st.letterSpacing };

  // Solve: glyphSum*(fs/REF) + charCount*ls = targetW
  let ls = st.letterSpacing;
  let spacingTotal = charCount * ls;
  let availableForGlyphs = targetW - spacingTotal;

  // If spacing eats too much, reduce it so glyphs get at least 60% of targetW
  if (availableForGlyphs < targetW * 0.6) {
    availableForGlyphs = targetW * 0.6;
    ls = (targetW - availableForGlyphs) / charCount;
  }

  let fs = (availableForGlyphs / glyphSum) * REF;

  // Enforce minimum font size — text must stay prominent
  fs = Math.max(fs, minFs);

  return { fs: Math.round(fs), effectiveLetterSpacing: ls };
}
