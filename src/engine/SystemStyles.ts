/**
 * SystemStyles — Per-system text rendering identity.
 *
 * Each physics system gets a unique visual treatment for text:
 * font, weight, letter-spacing, text-transform, layout, and color mode.
 * Effects in EffectRegistry consume these to render with variety.
 */

export type TextLayout = "center" | "stacked" | "stagger" | "wide" | "arc";
export type ColorMode = "solid" | "gradient" | "per-char" | "duotone";


export interface TypographyProfile {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase" | "lowercase" | "none";
  lineHeightMultiplier: number;
  hasSerif: boolean;
  personality: string;
}

const typographyProfileRef: { current: TypographyProfile | null } = { current: null };
const loadedFontLinks = new Set<string>();

function parseLetterSpacingPx(value: string): number {
  if (!value || value === "normal") return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n * 16 : 0;
}

export function applyTypographyProfile(profile: TypographyProfile): void {
  typographyProfileRef.current = profile;

  if (typeof document === "undefined") return;
  const familyKey = (profile.fontFamily || "").trim();
  if (!familyKey || loadedFontLinks.has(familyKey)) return;

  const existing = document.querySelector(`link[data-font="${familyKey}"]`);
  if (existing) {
    loadedFontLinks.add(familyKey);
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.font = familyKey;
  const encodedFamily = familyKey.replace(/\s+/g, "+");
  const safeWeight = Math.min(900, Math.max(100, Math.round(profile.fontWeight || 400)));
  link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${safeWeight}&display=swap`;
  document.head.appendChild(link);
  loadedFontLinks.add(familyKey);
}

export async function ensureTypographyProfileReady(profile: TypographyProfile): Promise<void> {
  applyTypographyProfile(profile);

  if (typeof document === "undefined" || !document.fonts || !profile.fontFamily) return;

  const safeWeight = Math.min(900, Math.max(100, Math.round(profile.fontWeight || 400)));
  const descriptor = `${safeWeight} 1em "${profile.fontFamily}"`;
  try {
    await Promise.race([
      document.fonts.load(descriptor),
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch {
    // non-fatal: renderer can still proceed with fallback font
  }
}
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
  const base = SYSTEM_STYLES[system] ?? DEFAULT_STYLE;
  const profile = typographyProfileRef.current;
  if (!profile) return base;

  return {
    ...base,
    font: `"${profile.fontFamily}", ${profile.hasSerif ? "serif" : "sans-serif"}`,
    weight: String(Math.min(900, Math.max(100, Math.round(profile.fontWeight || Number(base.weight) || 400)))),
    letterSpacing: parseLetterSpacingPx(profile.letterSpacing),
    textTransform: profile.textTransform || base.textTransform,
    lineHeight: Math.max(0.8, Math.min(2.0, profile.lineHeightMultiplier || base.lineHeight)),
  };
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
const MIN_FONT_PX = 14;

function normalizeHex(hex: string): string {
  const raw = (hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return "#000000";
}

export function getRelativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const toLinear = (v: number) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getSafeTextColor(palette: [string, string, string]): string {
  const bg = palette?.[0] ?? "#111111";
  const candidate = palette?.[2] ?? "#ffffff";
  const bgLum = getRelativeLuminance(bg);
  const candLum = getRelativeLuminance(candidate);
  const ratio = (Math.max(candLum, bgLum) + 0.05) / (Math.min(candLum, bgLum) + 0.05);

  if (ratio >= 5.0) {
    console.log("[getSafeTextColor]", {
      input: normalizeHex(candidate),
      luminance: Number(candLum.toFixed(3)),
      ratio: Number(ratio.toFixed(2)),
      output: normalizeHex(candidate),
    });
    return normalizeHex(candidate);
  }

  const whiteRatio = (1.0 + 0.05) / (bgLum + 0.05);
  if (whiteRatio >= 5.0) {
    console.log("[getSafeTextColor]", {
      input: normalizeHex(candidate),
      luminance: Number(candLum.toFixed(3)),
      ratio: Number(ratio.toFixed(2)),
      output: "#ffffff",
    });
    return "#ffffff";
  }

  console.log("[getSafeTextColor]", {
    input: normalizeHex(candidate),
    luminance: Number(candLum.toFixed(3)),
    ratio: Number(ratio.toFixed(2)),
    output: "#0a0a0a",
  });
  return "#0a0a0a";
}

export function getTypographyScale(personality: string | undefined): number {
  switch (personality) {
    case "MONUMENTAL":
      return 0.72;
    case "SHATTERED DISPLAY":
      return 0.78;
    case "ELEGANT DECAY":
      return 0.95;
    case "RAW TRANSCRIPT":
      return 0.9;
    case "HANDWRITTEN MEMORY":
      return 0.92;
    case "INVISIBLE INK":
      return 1.05;
    default:
      return 1.0;
  }
}

function fluidFontPx(canvasW: number, canvasH: number, personality?: string, minPx = MIN_FONT_PX, maxPx = 120): number {
  const preferred = Math.min(canvasW, canvasH) * 0.12;
  const baseFluidSize = Math.max(minPx, Math.min(maxPx, preferred));
  const scale = getTypographyScale(personality);
  return Math.max(minPx, Math.min(maxPx, baseFluidSize * scale));
}

/**
 * For narrow canvases (<600px) or portrait/square aspect ratios,
 * split text into up to 3 stacked lines and compute the largest
 * font size that fits within 85% of canvas width.
 *
 * When aspectHint is "9:16" or "1:1", stacking is forced regardless of width.
 */
export function computeStackedLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  system: string,
  aspectHint?: string,
): StackedLayout {
  const st = getSystemStyle(system);
  const displayText = applyTransform(text, st);
  const words = displayText.split(/\s+/).filter(Boolean);

  const forceStack = aspectHint === "9:16" || aspectHint === "1:1";

  if ((!forceStack && canvasW >= STACK_THRESHOLD) || words.length <= 2) {
    const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, text, canvasW, system);
    return { lines: [displayText], fs, effectiveLetterSpacing, isStacked: false };
  }

  const lineCount = Math.min(MAX_STACK_LINES, words.length);
  const wordsPerLine = Math.ceil(words.length / lineCount);
  const stackedLines: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    stackedLines.push(words.slice(i, i + wordsPerLine).join(" "));
  }

  const targetW = canvasW * 0.80;
  const targetH = canvasH * 0.80;
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

  const responsiveMin = Math.max(MIN_FONT_PX, Math.min(canvasW, canvasH) * 0.035);
  fs = Math.max(fs, responsiveMin);
  fs = Math.min(fs, fluidFontPx(canvasW, canvasH, typographyProfileRef.current?.personality));

  // Dynamic line-height normalization as line count grows.
  const normalizedLineHeight = Math.max(1.02, Math.min(st.lineHeight, 1.28 - stackedLines.length * 0.06));
  const maxByHeight = targetH / Math.max(1, stackedLines.length * normalizedLineHeight);
  fs = Math.min(fs, maxByHeight);

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
  const minFs = Math.max(MIN_FONT_PX, Math.min(canvasW, canvasW * 0.03));
  const maxFs = fluidFontPx(canvasW, canvasW * 0.5625, typographyProfileRef.current?.personality);

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
  fs = Math.min(fs, maxFs);

  return { fs: Math.round(fs), effectiveLetterSpacing: ls };
}
