/**
 * lyricIcons — Draws decorative icon glyphs on the lyric dance canvas.
 */

export type IconGlyph =
  | "fire"
  | "water-drop"
  | "lightning"
  | "snowflake"
  | "sun"
  | "moon"
  | "star"
  | "cloud"
  | "rain"
  | "wind"
  | "leaf"
  | "flower"
  | "tree"
  | "mountain"
  | "wave"
  | "heart"
  | "broken-heart"
  | "eye"
  | "hand-open"
  | "hand-fist"
  | "crown"
  | "skull"
  | "wings"
  | "feather"
  | "diamond"
  | "clock"
  | "hourglass"
  | "lock"
  | "key"
  | "chain"
  | "anchor"
  | "compass"
  | "arrow-up"
  | "arrow-down"
  | "spiral"
  | "infinity"
  | "music-note"
  | "microphone"
  | "speaker"
  | "headphones"
  | "camera"
  | "film"
  | "book"
  | "pen"
  | "brush"
  | "palette"
  | "mask"
  | "mirror"
  | "door"
  | "window"
  | "house"
  | "car"
  | "road"
  | "bridge"
  | "city"
  | "globe"
  | "flag"
  | "sword"
  | "shield"
  | "torch"
  | "candle"
  | "smoke"
  | "ghost"
  | "shadow"
  | "sparkle"
  | "burst"
  | "ripple"
  | "orbit"
  | "target"
  | "crosshair"
  | "fingerprint"
  | "dna"
  | "atom"
  | "pill"
  | "coin"
  | string;

export type IconStyle = "outline" | "filled" | "ghost";

const EMOJI_MAP: Record<string, string> = {
  fire: "🔥",
  "water-drop": "💧",
  lightning: "⚡",
  snowflake: "❄",
  sun: "☀",
  moon: "☽",
  star: "★",
  cloud: "☁",
  rain: "☂",
  wind: "〰",
  leaf: "🍃",
  flower: "✿",
  tree: "🌳",
  mountain: "▲",
  wave: "〜",
  heart: "♥",
  "broken-heart": "💔",
  eye: "◉",
  "hand-open": "✋",
  "hand-fist": "✊",
  crown: "♛",
  skull: "💀",
  wings: "𐦋",
  feather: "𐦋",
  diamond: "◆",
  clock: "⏱",
  hourglass: "⏳",
  lock: "🔒",
  key: "🔑",
  chain: "⛓",
  anchor: "⚓",
  compass: "◎",
  "arrow-up": "↑",
  "arrow-down": "↓",
  spiral: "🌀",
  infinity: "∞",
  "music-note": "♪",
  microphone: "🎤",
  speaker: "🔊",
  headphones: "🎧",
  camera: "📷",
  film: "🎬",
  book: "📖",
  pen: "✎",
  brush: "🖌",
  palette: "🎨",
  mask: "🎭",
  mirror: "◇",
  door: "▯",
  window: "▢",
  house: "⌂",
  car: "🚗",
  road: "═",
  bridge: "⌒",
  city: "🏙",
  globe: "🌍",
  flag: "⚑",
  sword: "⚔",
  shield: "🛡",
  torch: "🔥",
  candle: "🕯",
  smoke: "░",
  ghost: "👻",
  shadow: "▓",
  sparkle: "✦",
  burst: "✸",
  ripple: "◎",
  orbit: "◯",
  target: "◎",
  crosshair: "⊕",
  fingerprint: "⊛",
  dna: "⧖",
  atom: "⚛",
  pill: "💊",
  coin: "●",
};

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
  const char = EMOJI_MAP[glyph] ?? glyph;

  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (style) {
    case "filled":
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.fillText(char, x, y);
      break;

    case "outline":
      ctx.globalAlpha = opacity * 0.85;
      ctx.fillStyle = color;
      ctx.fillText(char, x, y);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.strokeText(char, x, y);
      break;

    case "ghost":
      ctx.globalAlpha = opacity * 0.7;
      ctx.fillStyle = color;
      ctx.fillText(char, x, y);
      break;
  }

  ctx.restore();
}
