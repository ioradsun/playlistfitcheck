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
 * First-principles font sizing: find the largest font where
 * rendered text (glyphs + letter-spacing) fits within 80% of canvas width.
 *
 * Rule: text is the focal point → fill most of the width.
 * Overflow prevention lives here, not in effects.
 */
export function computeFitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  system: string,
): number {
  const st = getSystemStyle(system);
  const displayText = applyTransform(text, st);
  const charCount = displayText.length;
  if (charCount === 0) return 12;

  const targetW = canvasW * 0.80;  // text fills 80% of width

  // Measure at reference size to get glyph-to-size ratio
  const REF = 100;
  ctx.font = buildFont(st, REF);
  let glyphSum = 0;
  for (let i = 0; i < charCount; i++) {
    glyphSum += ctx.measureText(displayText[i]).width;
  }

  if (glyphSum <= 0) return 12;

  // At font size `fs`, rendered width = glyphSum*(fs/REF) + charCount*letterSpacing
  // Solve: glyphSum*(fs/REF) + charCount*ls = targetW
  // → fs = (targetW - charCount*ls) * REF / glyphSum
  const spacingTotal = charCount * st.letterSpacing;
  const availableForGlyphs = targetW - spacingTotal;

  if (availableForGlyphs <= 0) return 12;

  const fs = (availableForGlyphs / glyphSum) * REF;
  return Math.max(Math.round(fs), 12);
}
