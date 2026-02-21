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
 * Compute the largest font size that fits text within a safe zone,
 * accounting for system-specific letter-spacing and char-by-char layout.
 *
 * Solves: charCount × (glyphRatio × fs + letterSpacing) ≤ safeW
 * → fs ≤ (safeW / charCount − letterSpacing) / glyphRatio
 */
export function computeFitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  system: string,
  safeRatio = 0.85,
  maxRatio = 0.07,
): number {
  const st = getSystemStyle(system);
  const displayText = applyTransform(text, st);
  const safeW = canvasW * safeRatio;
  const charCount = Math.max(1, displayText.length);

  // Measure glyph-width-to-font-size ratio at a reference size
  const refFs = 100;
  ctx.font = buildFont(st, refFs);
  const refM = ctx.measureText("M").width;
  const glyphRatio = refM / refFs; // e.g. ~0.6 for most fonts

  // Solve: charCount × (glyphRatio × fs + letterSpacing) = safeW
  const maxFromFit = (safeW / charCount - st.letterSpacing) / glyphRatio;
  const maxFromCap = canvasW * maxRatio;

  const fs = Math.min(maxFromFit, maxFromCap);
  return Math.max(Math.round(fs), 12);
}
