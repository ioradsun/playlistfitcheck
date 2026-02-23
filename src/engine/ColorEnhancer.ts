/**
 * ColorEnhancer — word-level color, contrast rhythm, beat flash, temperature tint.
 *
 * Pure functions; no React dependencies. Safe for rAF loops.
 */

// ── Hex ↔ RGB helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? parseInt(h[0]+h[0]+h[1]+h[1]+h[2]+h[2], 16)
    : parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Perceived brightness 0-1 (rec 709) */
export function perceivedBrightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Mix a hex color toward white by `amount` (0-1). */
export function mixTowardWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, amount));
  return rgbToHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}

// ── 1. Word-level color array ───────────────────────────────────────────────

const STRONG_MODS = new Set([
  "PULSE_STRONG", "HEAT_SPIKE", "ERUPT", "EXPLODE",
  "FLAME_BURST", "SHATTER", "HOOK_FRACTURE", "IGNITE",
]);

/**
 * Returns an array of hex colors, one per word in `text`.
 * - Last word → palette[2]
 * - First word of hook lines → #ffffff
 * - Strong-mod lines → alternating palette[0]/palette[2]
 * - All others → `baseLineColor`
 */
export function resolveWordColors(
  text: string,
  baseLineColor: string,
  palette: string[],
  isHookLine: boolean,
  activeMod: string | null,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const isStrongMod = activeMod ? STRONG_MODS.has(activeMod) : false;

  return words.map((_, i) => {
    // Last word accent
    if (i === words.length - 1) return palette[2] ?? "#ffffff";
    // First word of hook lines
    if (i === 0 && isHookLine) return "#ffffff";
    // Alternating on strong-mod lines
    if (isStrongMod) return i % 2 === 0 ? (palette[0] ?? baseLineColor) : (palette[2] ?? "#ffffff");
    return baseLineColor;
  });
}

// ── 2. Contrast rhythm ─────────────────────────────────────────────────────

/**
 * Given last-2 brightness values and the candidate color,
 * returns a corrected color. If the last 2 were both bright (>0.75),
 * force the current toward a mid-tone (brightness ≈ 0.55).
 */
export function applyContrastRhythm(
  candidateColor: string,
  recentBrightness: number[], // last 2 values
  palette: string[],
): string {
  if (recentBrightness.length < 2) return candidateColor;
  const [prev2, prev1] = recentBrightness.slice(-2);
  if (prev2 > 0.75 && prev1 > 0.75) {
    // Force mid-tone: use palette[1] which is typically the accent/mid color
    return palette[1] ?? "#888888";
  }
  return candidateColor;
}

// ── 3. Beat brightness flash ────────────────────────────────────────────────

/**
 * If beatIntensity > 0.7, mix all word colors toward white
 * by beatIntensity * 0.3
 */
export function applyBeatFlash(
  wordColors: string[],
  beatIntensity: number,
): string[] {
  if (beatIntensity <= 0.7) return wordColors;
  const amount = beatIntensity * 0.3;
  return wordColors.map(c => mixTowardWhite(c, amount));
}

// ── 4. Color temperature tint (background overlay only) ─────────────────────

/**
 * Draws a subtle color-temperature overlay on the background.
 * Early in the song → cool blue tint; late → warm amber tint.
 * Call AFTER drawSystemBackground, BEFORE text rendering.
 */
export function drawTemperatureTint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  songProgress: number, // 0-1 through the full song / hook region
): void {
  // Clamp
  const p = Math.min(1, Math.max(0, songProgress));
  // Interpolate: cool (blue) at 0, neutral at 0.5, warm (amber) at 1
  const coolAlpha = Math.max(0, (0.5 - p) * 0.14);   // max 0.07 at start
  const warmAlpha = Math.max(0, (p - 0.5) * 0.14);    // max 0.07 at end

  if (coolAlpha > 0.005) {
    ctx.fillStyle = `rgba(80, 140, 255, ${coolAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (warmAlpha > 0.005) {
    ctx.fillStyle = `rgba(255, 160, 60, ${warmAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }
}
