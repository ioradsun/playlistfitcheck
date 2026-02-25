export interface ImageSample {
  dominantHue: number;
  dominantSaturation: number;
  averageLuminance: number;
  shadowColor: string;
  highlightColor: string;
  midtoneColor: string;
}

export interface AutoPalette {
  background: string;
  accent: string;
  text: string;
  glow: string;
  dim: string;
}

type Pixel = { r: number; g: number; b: number; h: number; s: number; l: number };

export function sampleChapterImage(img: CanvasImageSource): ImageSample {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const pixels: Pixel[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }

    pixels.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      h,
      s,
      l,
    });
  }

  const sorted = [...pixels].sort((a, b) => a.l - b.l);
  const count = sorted.length || 1;

  const shadowSlice = sorted.slice(0, Math.ceil(count * 0.1));
  const highlightSlice = sorted.slice(Math.floor(count * 0.9));
  const midSlice = sorted.slice(Math.floor(count * 0.4), Math.ceil(count * 0.6));

  const averageLuminance = pixels.reduce((sum, p) => sum + p.l, 0) / count;
  const saturated = pixels.filter((p) => p.s > 0.15);

  let dominantHue = 0;
  let dominantSaturation = 0;
  if (saturated.length > 0) {
    let sinSum = 0;
    let cosSum = 0;
    let satSum = 0;
    for (const p of saturated) {
      const rad = (p.h * Math.PI) / 180;
      const weight = p.s;
      sinSum += Math.sin(rad) * weight;
      cosSum += Math.cos(rad) * weight;
      satSum += p.s;
    }
    dominantHue = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
    dominantSaturation = satSum / saturated.length;
  }

  return {
    dominantHue,
    dominantSaturation,
    averageLuminance,
    shadowColor: averageRGB(shadowSlice),
    highlightColor: averageRGB(highlightSlice),
    midtoneColor: averageRGB(midSlice),
  };
}

export function generateAutoPalette(sample: ImageSample): string[] {
  const { dominantHue, dominantSaturation, averageLuminance, shadowColor } = sample;
  const background = shadowColor;

  let textH = dominantHue;
  let textS = 0.12;
  let textL = 0.1;

  if (averageLuminance < 0.4) {
    textH = (dominantHue + 180) % 360;
    textS = 0.08;
    textL = 0.92;
  } else if (averageLuminance > 0.6) {
    textH = dominantHue;
    textS = 0.12;
    textL = 0.1;
  } else {
    const lightContrast = contrastRatio(averageLuminance, 0.92);
    const darkContrast = contrastRatio(averageLuminance, 0.1);
    if (lightContrast > darkContrast) {
      textH = (dominantHue + 180) % 360;
      textS = 0.08;
      textL = 0.92;
    }
  }

  let text = hslToHex(textH, textS, textL);
  const cr = contrastRatioHex(text, sampleToAvgHex(sample));
  if (cr < 5) {
    const boostedL = textL > 0.5 ? Math.min(0.97, textL + 0.1) : Math.max(0.05, textL - 0.1);
    text = hslToHex(textH, textS, boostedL);
  }

  const accent = hslToHex(
    dominantHue,
    Math.min(0.85, dominantSaturation * 1.4 + 0.2),
    averageLuminance < 0.4 ? 0.55 : 0.4,
  );
  const glow = hslToHex((dominantHue + 180) % 360, 0.7, 0.65);
  const dim = blendColors(text, background, 0.4);

  const result: AutoPalette = { background, accent, text, glow, dim };
  return [result.background, result.accent, result.text, result.glow, result.dim];
}

export async function computeAutoPalettesFromUrls(urls: string[]): Promise<string[][]> {
  const palettes: string[][] = [];
  for (const url of urls) {
    if (!url) continue;
    const img = await loadImage(url);
    const sample = sampleChapterImage(img);
    palettes.push(generateAutoPalette(sample));
  }
  return palettes;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function averageRGB(pixels: Array<{ r: number; g: number; b: number }>): string {
  const n = pixels.length || 1;
  const r = Math.round(pixels.reduce((s, p) => s + p.r, 0) / n);
  const g = Math.round(pixels.reduce((s, p) => s + p.g, 0) / n);
  const b = Math.round(pixels.reduce((s, p) => s + p.b, 0) / n);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastRatioHex(hex1: string, hex2: string): number {
  return contrastRatio(relativeLuminance(hex1), relativeLuminance(hex2));
}

function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const linearize = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function blendColors(hex1: string, hex2: string, ratio: number): string {
  const c1 = hex1.replace('#', '');
  const c2 = hex2.replace('#', '');
  const blend = (i: number) => {
    const v1 = parseInt(c1.slice(i, i + 2), 16);
    const v2 = parseInt(c2.slice(i, i + 2), 16);
    return Math.round(v1 * (1 - ratio) + v2 * ratio).toString(16).padStart(2, '0');
  };
  return `#${blend(0)}${blend(2)}${blend(4)}`;
}

function sampleToAvgHex(sample: ImageSample): string {
  return sample.midtoneColor;
}
