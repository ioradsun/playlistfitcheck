/**
 * Shared lyric animation helpers — used by both useHookCanvas and ShareableLyricDance.
 */

import type { WordAnimation } from "./AnimationResolver";
import type { FrameRenderState } from "./FrameRenderState";
import { getSafeTextColor } from "./SystemStyles";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}
function easeInCubic(t: number): number {
  return Math.pow(Math.min(1, Math.max(0, t)), 3);
}

export function applyEntrance(
  ctx: CanvasRenderingContext2D,
  progress: number,
  entrance: string,
  options?: { spatialZone?: "verse" | "chorus" | "bridge" | "hook" | "outro" },
): number {
  const e = easeOutCubic(progress);

  switch (options?.spatialZone) {
    case "verse":
      ctx.translate(-(1 - e) * 20, 0);
      break;
    case "chorus":
      ctx.translate(0, (1 - e) * 20);
      break;
    case "bridge":
      ctx.translate((1 - e) * 20, 0);
      break;
    case "hook": {
      const hookScale = 0.92 + e * 0.08;
      ctx.scale(hookScale, hookScale);
      break;
    }
    default:
      break;
  }

  switch (entrance) {
    case "materializes":
      ctx.globalAlpha *= e;
      return e;
    case "slams-in": {
      const over = 1 + (1 - progress) * 0.12;
      ctx.scale(over, over);
      return 1;
    }
    case "rises":
      ctx.translate(0, (1 - e) * 22);
      ctx.globalAlpha *= e;
      return e;
    case "fractures-in":
      ctx.translate((Math.random() - 0.5) * (1 - progress) * 5, (Math.random() - 0.5) * (1 - progress) * 5);
      ctx.globalAlpha *= e;
      return e;
    case "cuts":
      return progress > 0.08 ? 1 : 0;
    case "fades":
    default:
      ctx.globalAlpha *= e;
      return e;
  }
}

export function applyExit(
  ctx: CanvasRenderingContext2D,
  progress: number,
  exit: string,
): number {
  const e = easeInCubic(progress);
  const remaining = 1 - e;
  switch (exit) {
    case "dissolves-upward":
      ctx.translate(0, -e * 22);
      return remaining;
    case "shatters":
      ctx.translate((Math.random() - 0.5) * e * 10, (Math.random() - 0.5) * e * 10);
      return remaining;
    case "drops":
      ctx.translate(0, e * 22);
      return remaining;
    case "burns-out":
      ctx.scale(1 + e * 0.06, 1 + e * 0.06);
      return remaining;
    case "snaps-off":
      return progress > 0.88 ? 0 : 1;
    case "fades":
    default:
      return remaining;
  }
}

export function applyModEffect(
  ctx: CanvasRenderingContext2D,
  mod: string,
  time: number,
  beatIntensity: number,
): void {
  switch (mod) {
    case "PULSE_SLOW":
      ctx.scale(1 + Math.sin(time * 2) * 0.03, 1 + Math.sin(time * 2) * 0.03);
      break;
    case "PULSE_STRONG":
      ctx.scale(1 + Math.sin(time * 4) * 0.06 + beatIntensity * 0.04, 1 + Math.sin(time * 4) * 0.06 + beatIntensity * 0.04);
      break;
    case "SHIMMER_FAST":
      ctx.globalAlpha *= 0.82 + Math.sin(time * 20) * 0.18;
      break;
    case "WAVE_DISTORT":
    case "DISTORT_WAVE":
      ctx.translate(Math.sin(time * 6) * 3, 0);
      break;
    case "STATIC_GLITCH":
      if (Math.random() > 0.82) {
        ctx.translate((Math.random() - 0.5) * 7, 0);
        ctx.globalAlpha *= 0.65 + Math.random() * 0.35;
      }
      break;
    case "HEAT_SPIKE":
      ctx.scale(1 + beatIntensity * 0.08, 1 + beatIntensity * 0.08);
      break;
    case "BLUR_OUT":
      ctx.globalAlpha *= 0.65 + Math.sin(time * 3) * 0.35;
      break;
    case "FADE_OUT_FAST":
      ctx.globalAlpha *= Math.max(0, 1 - (time % 2));
      break;
  }
}

export function applyWordMark(
  ctx: CanvasRenderingContext2D,
  anim: WordAnimation,
  time: number,
  manifest: FrameRenderState,
): void {
  switch (anim.mark) {
    case "SHATTER":
      ctx.translate((Math.random() - 0.5) * (1 - anim.intensity) * 5, (Math.random() - 0.5) * (1 - anim.intensity) * 5);
      break;
    case "GLOW":
      ctx.shadowColor = manifest.palette[2];
      ctx.shadowBlur = 8 + anim.intensity * 14;
      break;
    case "FADE":
      ctx.globalAlpha *= 0.35 + anim.intensity * 0.65;
      break;
    case "PULSE": {
      const ps = 1 + Math.sin(time * 8) * 0.09 * anim.intensity;
      ctx.scale(ps, ps);
      break;
    }
    case "SHIMMER":
      ctx.globalAlpha *= 0.55 + Math.sin(time * 15) * 0.45;
      break;
    case "GLITCH":
      if (Math.random() > 0.68) {
        ctx.translate((Math.random() - 0.5) * 9, 0);
      }
      break;
  }
}

export function getWordMarkColor(mark: string, manifest: FrameRenderState): string {
  switch (mark) {
    case "GLOW":
    case "SHIMMER":
      return manifest.palette[2];
    case "GLITCH":
      return Math.random() > 0.5 ? manifest.palette[2] : manifest.palette[1];
    default:
      return getSafeTextColor(manifest.palette);
  }
}
