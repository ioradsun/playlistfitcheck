/**
 * lyricIcons — Draws decorative icon glyphs on the lyric dance canvas.
 */

export type IconGlyph =
  | "heart" | "star" | "fire" | "lightning" | "moon"
  | "sun" | "cloud" | "rain" | "snow" | "wind"
  | "diamond" | "crown" | "skull" | "rose" | "eye"
  | string;

export type IconStyle = "outline" | "filled" | "ghost";

/**
 * Draw an icon glyph onto a 2D canvas context using emoji/text rendering.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  glyph: IconGlyph,
  x: number,
  y: number,
  size: number,
  color: string,
  style: IconStyle = "outline",
  opacity: number = 1,
): void {
  const emojiMap: Record<string, string> = {
    heart: "♥",
    star: "★",
    fire: "🔥",
    lightning: "⚡",
    moon: "☽",
    sun: "☀",
    cloud: "☁",
    rain: "☂",
    snow: "❄",
    wind: "〰",
    diamond: "◆",
    crown: "♛",
    skull: "☠",
    rose: "✿",
    eye: "◉",
  };

  const char = emojiMap[glyph] ?? glyph;

  ctx.save();
  ctx.globalAlpha = style === "ghost" ? opacity * 0.35 : opacity;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style === "outline") {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.strokeText(char, x, y);
    ctx.fillStyle = "transparent";
  } else {
    ctx.fillStyle = color;
  }

  if (style !== "outline") {
    ctx.fillText(char, x, y);
  }

  ctx.restore();
}
