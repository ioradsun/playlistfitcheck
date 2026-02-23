import type { SceneManifest } from "@/engine/SceneManifest";

interface WordPosition {
  x: number;
  y: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function scaleAlpha(color: string, multiplier: number): string {
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i);
  if (!match) return color;
  const [, r, g, b, a] = match;
  const alpha = clamp01(parseFloat(a) * multiplier);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getFireArcIntensity(songProgress: number): number {
  const p = clamp01(songProgress);
  if (p < 0.2) return 0.4;
  if (p < 0.5) return lerp(0.4, 1.0, (p - 0.2) / 0.3);
  if (p < 0.7) return 1.0;
  if (p < 0.85) return lerp(1.0, 0.5, (p - 0.7) / 0.15);
  return lerp(0.35, 0.2, (p - 0.85) / 0.15);
}

function getColdArcState(songProgress: number): "overcast" | "storm" | "clearing" {
  const p = clamp01(songProgress);
  if (p < 0.3) return "overcast";
  if (p < 0.6) return "storm";
  return "clearing";
}

function getLightType(manifest: SceneManifest): string {
  return (manifest.lightSource || "").toLowerCase();
}

export function drawLighting(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  manifest: SceneManifest,
  songProgress: number,
  beatIntensity: number,
  activeWordPosition: WordPosition,
): void {
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  const lightSource = getLightType(manifest);
  const beat = clamp01(beatIntensity);
  const now = performance.now() / 1000;

  const worldSeed = `${manifest.world} ${manifest.coreEmotion} ${manifest.backgroundSystem} ${manifest.lightSource}`.toLowerCase();
  const isFireWorld = /burn|fire|ember|flame/.test(worldSeed);
  const isColdWorld = /rain|storm|cold|winter|frost|overcast/.test(worldSeed);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  if (lightSource.includes("golden")) {
    const arc = isFireWorld ? getFireArcIntensity(songProgress) : 0.7;
    const lightX = clamp01(songProgress) * width;
    const grad = ctx.createLinearGradient(lightX - width * 0.5, 0, lightX + width * 0.5, 0);
    grad.addColorStop(0, scaleAlpha("rgba(255,180,60,0.18)", arc));
    grad.addColorStop(0.5, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (lightSource.includes("flickering left") || lightSource === "left") {
    const arc = isFireWorld ? getFireArcIntensity(songProgress) : 0.8;
    const flicker = (0.12 + beat * 0.18 + Math.sin(now * 12) * 0.04) * arc;
    const grad = ctx.createLinearGradient(0, 0, width * 0.6, 0);
    grad.addColorStop(0, `rgba(255,120,30,${clamp01(flicker)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (lightSource.includes("cold overcast")) {
    const state = getColdArcState(songProgress);
    let pulse = 0.08 + beat * 0.06;
    if (state === "storm") pulse *= 0.7;
    if (state === "clearing") pulse = lerp(pulse, 0.1, 0.5);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `rgba(140,160,200,${clamp01(pulse)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (lightSource.includes("moonlight")) {
    const grad = ctx.createRadialGradient(
      width * 0.8,
      height * 0.1,
      0,
      width * 0.8,
      height * 0.1,
      height * 0.8,
    );
    grad.addColorStop(0, "rgba(200,220,255,0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (lightSource.includes("winter daylight")) {
    ctx.fillStyle = "rgba(180,200,230,0.08)";
    ctx.fillRect(0, 0, width, height);
  } else if (lightSource.includes("dead of night")) {
    const x = clamp01(activeWordPosition.x / Math.max(width, 1)) * width;
    const y = clamp01(activeWordPosition.y / Math.max(height, 1)) * height;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, height * 0.4);
    grad.addColorStop(0, "rgba(40,30,60,0.3)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  if (isColdWorld) {
    const coldState = getColdArcState(songProgress);
    if (coldState === "storm" && beat > 0.8) {
      ctx.fillStyle = `rgba(255,255,255,${beat * 0.15})`;
      ctx.fillRect(0, 0, width, height);
    }

    if (coldState === "clearing") {
      const warmLift = (clamp01(songProgress) - 0.6) / 0.4;
      ctx.fillStyle = `rgba(255,200,140,${warmLift * 0.04})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  ctx.restore();
}

export function getTextShadow(
  manifest: SceneManifest,
  beatIntensity: number,
): { offsetX: number; offsetY: number; blur: number; color: string } {
  const lightSource = getLightType(manifest);
  const paletteShadow = `${manifest.palette[0] ?? "#000000"}aa`;
  const beat = clamp01(beatIntensity);

  if (lightSource.includes("flickering left")) {
    return { offsetX: 3 + beat, offsetY: 1, blur: 6, color: paletteShadow };
  }
  if (lightSource.includes("golden")) {
    return { offsetX: 2, offsetY: 1, blur: 6, color: paletteShadow };
  }
  if (lightSource.includes("moonlight")) {
    return { offsetX: -2, offsetY: 2, blur: 6, color: paletteShadow };
  }
  if (lightSource.includes("cold overcast")) {
    return { offsetX: 0, offsetY: 0, blur: 4, color: paletteShadow };
  }

  return { offsetX: 1, offsetY: 1, blur: 6, color: paletteShadow };
}
