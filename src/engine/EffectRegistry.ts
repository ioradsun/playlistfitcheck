/**
 * Effect Registry — maps effect_key strings to Canvas 2D draw functions.
 *
 * Each effect receives an EffectState and draws one lyric line onto the canvas.
 * Effects use the PhysicsState for motion, the seeded PRNG for deterministic chaos,
 * and the SystemStyle for per-system text identity.
 */

import type { PhysicsState } from "./PhysicsIntegrator";
import { type SystemStyle, getSystemStyle, buildFont, applyTransform, createGradientFill, computeStackedLayout, type StackedLayout } from "./SystemStyles";

/** Measure total char-by-char width for the full string, matching how effects render */
function measureCharByCharWidth(ctx: CanvasRenderingContext2D, displayText: string, st: SystemStyle): number {
  let total = 0;
  for (let i = 0; i < displayText.length; i++) {
    total += ctx.measureText(displayText[i]).width + st.letterSpacing;
  }
  return total;
}

/** Get per-character x positions for centered char-by-char rendering */
function getCharPositions(ctx: CanvasRenderingContext2D, displayText: string, st: SystemStyle, centerX: number): number[] {
  const widths: number[] = [];
  for (let i = 0; i < displayText.length; i++) {
    widths.push(ctx.measureText(displayText[i]).width);
  }
  const totalW = widths.reduce((s, w) => s + w + st.letterSpacing, 0);
  const positions: number[] = [];
  let x = centerX - totalW / 2;
  for (let i = 0; i < displayText.length; i++) {
    positions.push(x + widths[i] / 2); // center of each char
    x += widths[i] + st.letterSpacing;
  }
  return positions;
}

/** Clamp scale so rendered text never exceeds 90% of canvas width */
function safeScale(textWidth: number, canvasW: number, desiredScale: number): number {
  if (textWidth <= 0) return desiredScale;
  const maxScale = (canvasW * 0.90) / textWidth;
  return Math.min(desiredScale, maxScale);
}

function getSafeZone(w: number, h: number, pad: number) {
  return {
    left: pad,
    right: w - pad,
    top: pad,
    bottom: h - pad,
    centerX: w / 2,
    centerY: h / 2,
  };
}

function clampPointToSafeZone(x: number, y: number, zone: ReturnType<typeof getSafeZone>) {
  return {
    x: Math.max(zone.left, Math.min(zone.right, x)),
    y: Math.max(zone.top, Math.min(zone.bottom, y)),
  };
}

export interface EffectState {
  text: string;
  physState: PhysicsState;
  w: number;
  h: number;
  fs: number;
  age: number;
  progress: number;
  rng: () => number;
  palette: string[];
  system?: string;
  effectiveLetterSpacing?: number;
  /** Pre-computed stacked layout for narrow viewports */
  stackedLayout?: StackedLayout;
  /** Multiplier applied to all alpha values (entrance/exit animations) */
  alphaMultiplier?: number;
  /** Per-word color overrides (same length as text.split(/\s+/)) */
  wordColors?: string[];
}

type EffectFn = (ctx: CanvasRenderingContext2D, s: EffectState) => void;

// Helper: get style for current effect, with effective letter-spacing override
function style(s: EffectState): SystemStyle {
  const st = getSystemStyle(s.system || "fracture");
  if (s.effectiveLetterSpacing !== undefined) {
    return { ...st, letterSpacing: s.effectiveLetterSpacing };
  }
  return st;
}

/** Apply alpha with multiplier from entrance/exit animations */
function setAlpha(ctx: CanvasRenderingContext2D, s: EffectState, value: number): void {
  ctx.globalAlpha = value * (s.alphaMultiplier ?? 1);
}

// Helper: apply styled fill (solid, gradient, per-char, duotone)
function applyStyledFill(
  ctx: CanvasRenderingContext2D,
  st: SystemStyle,
  palette: string[],
  x: number, y: number, textWidth: number
) {
  switch (st.colorMode) {
    case "gradient":
      ctx.fillStyle = createGradientFill(ctx, palette, x, y, Math.max(textWidth, 100));
      break;
    case "duotone":
      ctx.fillStyle = palette[0] || "#fff";
      break;
    case "per-char":
    case "solid":
    default:
      ctx.fillStyle = palette[0] || "#fff";
      break;
  }
}

/**
 * Universal stacked text renderer for narrow viewports.
 * Draws multi-line stacked text centered on screen.
 * Returns true if it handled rendering (stacked mode), false otherwise.
 */
function drawAutoStacked(
  ctx: CanvasRenderingContext2D,
  s: EffectState,
  cx: number,
  cy: number,
  extraTransform?: { scale?: number; alpha?: number; offsetY?: number }
): boolean {
  const layout = s.stackedLayout;
  if (!layout || !layout.isStacked) return false;

  const st = style(s);
  const { lines, fs } = layout;
  const lineH = fs * (st.lineHeight || 1.2);
  const totalH = lines.length * lineH;
  const startY = cy - totalH / 2 + lineH / 2 + (extraTransform?.offsetY || 0);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);
  if (extraTransform?.alpha !== undefined) ctx.globalAlpha = extraTransform.alpha * (s.alphaMultiplier ?? 1);
  else ctx.globalAlpha *= (s.alphaMultiplier ?? 1);
  if (extraTransform?.scale) {
    ctx.translate(cx, cy + (extraTransform?.offsetY || 0));
    ctx.scale(extraTransform.scale, extraTransform.scale);
    ctx.translate(-cx, -(cy + (extraTransform?.offsetY || 0)));
  }

  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    const measured = ctx.measureText(line).width;
    applyStyledFill(ctx, st, s.palette, cx, y, measured);
    ctx.fillText(line, cx, y);
  });

  ctx.restore();
  return true;
}

// ── Individual effects ──────────────────────────────────────────────────────

const drawShatterIn: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const shakeX = (rng() - 0.5) * physState.shake;
  const shakeY = (rng() - 0.5) * physState.shake;
  const zone = getSafeZone(w, h, Math.max(12, physState.safeOffset));

  const chars = displayText.split("");
  const charPositions = getCharPositions(ctx, displayText, st, w / 2 + shakeX);

  chars.forEach((char, i) => {
    const delay = i * 40;
    const localAge = Math.max(0, age - delay);
    const t = Math.min(1, localAge / 300);
    const ease = 1 - Math.pow(1 - t, 3);

    const offsetY = (1 - ease) * (rng() > 0.5 ? -1 : 1) * Math.min(60, h * 0.18);
    // Brief entry-only rotation that settles to horizontal as ease→1.
    const entryRotation = (1 - ease) * (rng() - 0.5) * 0.24;
    setAlpha(ctx, s, ease);

    if (st.colorMode === "per-char") {
      ctx.fillStyle = palette[i % palette.length] || "#fff";
    } else if (st.colorMode === "duotone") {
      ctx.fillStyle = i % 2 === 0 ? (palette[0] || "#fff") : (palette[1] || palette[0] || "#fff");
    } else {
      ctx.fillStyle = palette[0] || "#fff";
    }
    const p = clampPointToSafeZone(charPositions[i], h / 2 + offsetY + shakeY, zone);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (Math.abs(entryRotation) > 0.0001) {
      ctx.rotate(entryRotation);
    }
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
  ctx.restore();
};

const drawTunnelRush: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const t = Math.min(1, age / 500);
  const zoom = 0.3 + t * 0.7;
  const alpha = Math.min(1, age / 200);

  ctx.shadowBlur = Math.min(20, physState.glow);
  ctx.shadowColor = palette[1] || palette[0] || "#8b5cf6";

  // Try stacked rendering first
  const measured = measureCharByCharWidth(ctx, displayText, st);
  const combinedScale = safeScale(measured, w, Math.min(1.6, zoom * physState.scale));
  if (drawAutoStacked(ctx, s, w / 2, h / 2, { scale: combinedScale, alpha })) {
    ctx.restore();
    return;
  }

  setAlpha(ctx, s, alpha);
  ctx.translate(w / 2, h / 2);
  ctx.scale(combinedScale, combinedScale);

  const measuredFill = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
  ctx.fillText(displayText, 0, 0);

  if (st.colorMode === "duotone") {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = palette[1] || "#a855f7";
    ctx.fillText(displayText, 2, -2);
  }
  ctx.restore();
};

const drawGravityDrop: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const t = Math.min(1, age / 400);
  const dropY = Math.min(h / 2, -h * 0.3 + 0.5 * 2000 * t * t);
  const bounce = t >= 1 ? Math.sin((age - 400) * 0.02) * 5 * (1 - Math.min(1, (age - 400) / 800)) : 0;

  setAlpha(ctx, s, Math.min(1, age / 150));
  ctx.shadowBlur = physState.glow * 0.5;
  ctx.shadowColor = palette[1] || "#a855f7";

  // Try stacked rendering first
  if (drawAutoStacked(ctx, s, w / 2, h / 2, { alpha: ctx.globalAlpha, offsetY: dropY + bounce - h / 2 })) {
    ctx.restore();
    return;
  }

  if (st.layout === "stacked") {
    const words = displayText.split(" ");
    const lineH = fs * st.lineHeight;
    const totalH = words.length * lineH;
    words.forEach((word, i) => {
      const y = dropY + bounce - totalH / 2 + i * lineH + lineH / 2;
      if (st.colorMode === "per-char") {
        ctx.fillStyle = palette[i % palette.length] || "#fff";
      } else {
        const measured = ctx.measureText(word).width;
        applyStyledFill(ctx, st, palette, w / 2, y, measured);
      }
      ctx.fillText(word, w / 2, y);
    });
  } else {
    const measured = ctx.measureText(displayText).width;
    applyStyledFill(ctx, st, palette, w / 2, dropY + bounce, measured);
    ctx.fillText(displayText, w / 2, dropY + bounce);
  }
  ctx.restore();
};

const drawPulseBloom: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const pulse = 1 + Math.sin(age * 0.008) * 0.15 * physState.heat;

  ctx.shadowBlur = Math.min(20, physState.glow + Math.sin(age * 0.005) * 10);
  ctx.shadowColor = palette[2] || palette[0] || "#ec4899";

  const measured = measureCharByCharWidth(ctx, displayText, st);
  const combinedScale = safeScale(measured, w, Math.min(1.6, pulse * physState.scale));

  if (drawAutoStacked(ctx, s, w / 2, h / 2, { scale: combinedScale, alpha: 0.9 + physState.heat * 0.1 })) {
    ctx.restore();
    return;
  }

  ctx.translate(w / 2, h / 2);
  ctx.scale(combinedScale, combinedScale);
  const measuredFill = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
  setAlpha(ctx, s, 0.9 + physState.heat * 0.1);
  ctx.fillText(displayText, 0, 0);
  ctx.restore();
};

const drawRippleOut: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  // Try stacked first
  if (!drawAutoStacked(ctx, s, w / 2, h / 2)) {
    // Wide layout: extra letter-spacing via char-by-char
    if (st.layout === "wide") {
      const chars = displayText.split("");
      const charPositions = getCharPositions(ctx, displayText, st, w / 2);
      chars.forEach((char, i) => {
        ctx.fillStyle = palette[0] || "#fff";
        ctx.fillText(char, charPositions[i], h / 2);
      });
    } else {
      const measured = ctx.measureText(displayText).width;
      applyStyledFill(ctx, st, palette, w / 2, h / 2, measured);
      ctx.fillText(displayText, w / 2, h / 2);
    }
  }

  // Ripple rings
  for (let i = 0; i < 3; i++) {
    const ringAge = age - i * 150;
    if (ringAge < 0) continue;
    const r = ringAge * 0.3 * (1 + physState.velocity * 0.1);
    const alpha = Math.max(0, 1 - r / (w * 0.4));
    ctx.strokeStyle = palette[i % palette.length] || "#fff";
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const drawGlitchFlash: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const glitchOn = rng() > 0.7;
  const offsetX = glitchOn ? (rng() - 0.5) * Math.min(20, w * 0.04) : 0;
  const sliceY = glitchOn ? (rng() - 0.5) * Math.min(10, h * 0.025) : 0;
  const frame = Math.floor(age / (1000 / 60));
  const microRotationActive = glitchOn && frame % 14 < 3;
  const microRotation = microRotationActive ? (rng() - 0.5) * (Math.PI / 180) * 6 : 0;
  const zone = getSafeZone(w, h, Math.max(12, physState.safeOffset));

  if (drawAutoStacked(ctx, s, w / 2, h / 2)) {
    ctx.restore();
    return;
  }

  const drawWithOptionalMicroRotation = (draw: () => void) => {
    if (!microRotationActive) {
      draw();
      return;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(microRotation);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.restore();
  };

  if (glitchOn) {
    drawWithOptionalMicroRotation(() => {
      const cyanP = clampPointToSafeZone(w / 2 + 3 + offsetX, h / 2 + sliceY, zone);
      const redP = clampPointToSafeZone(w / 2 - 3 + offsetX, h / 2 - sliceY, zone);
      setAlpha(ctx, s, 0.6);
      ctx.fillStyle = "cyan";
      ctx.fillText(displayText, cyanP.x, cyanP.y);
      ctx.fillStyle = "red";
      ctx.fillText(displayText, redP.x, redP.y);
    });
  }

  drawWithOptionalMicroRotation(() => {
    setAlpha(ctx, s, 1);
    const measured = ctx.measureText(displayText).width;
    applyStyledFill(ctx, st, palette, w / 2, h / 2, measured);
    ctx.shadowBlur = physState.glow * 0.3;
    ctx.shadowColor = palette[1] || "#8b5cf6";
    const mainP = clampPointToSafeZone(w / 2 + (glitchOn ? offsetX * 0.3 : 0), h / 2, zone);
    ctx.fillText(displayText, mainP.x, mainP.y);
  });
  ctx.restore();
};

const drawWaveSurge: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const chars = displayText.split("");
  const charPositions = getCharPositions(ctx, displayText, st, w / 2);
  const waveAmp = Math.min(15, 15 * Math.min(physState.scale, 1.3));
  const zone = getSafeZone(w, h, Math.max(12, physState.safeOffset));

  // Arc layout keeps baseline horizontal; only character positions follow an arc.
  if (st.layout === "arc") {
    const arcRadius = w * 0.3;
    const totalAngle = Math.PI * 0.6;
    chars.forEach((char, i) => {
      const angle = -totalAngle / 2 + (i / Math.max(1, chars.length - 1)) * totalAngle - Math.PI / 2;
      const p = clampPointToSafeZone(
        w / 2 + Math.cos(angle) * arcRadius,
        h / 2 + Math.sin(angle) * arcRadius + arcRadius * 0.3,
        zone,
      );
      ctx.fillStyle = palette[i % palette.length] || "#fff";
      setAlpha(ctx, s, 0.85 + physState.heat * 0.15);
      ctx.fillText(char, p.x, p.y);
    });
  } else {
    chars.forEach((char, i) => {
      const wave = Math.sin(age * 0.006 + i * 0.5) * waveAmp;
      if (st.colorMode === "per-char") {
        ctx.fillStyle = palette[i % palette.length] || "#fff";
      } else {
        ctx.fillStyle = palette[0] || "#fff";
      }
      setAlpha(ctx, s, 0.85 + physState.heat * 0.15);
      const p = clampPointToSafeZone(charPositions[i], h / 2 + wave, zone);
      ctx.fillText(char, p.x, p.y);
    });
  }
  ctx.restore();
};

const drawEmberRise: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const rise = Math.min(h * 0.08, age * 0.02);
  const zone = getSafeZone(w, h, Math.max(12, physState.safeOffset));

  // Try stacked first
  if (!drawAutoStacked(ctx, s, w / 2, h / 2, { offsetY: -rise })) {
    if (st.layout === "stagger") {
      const words = displayText.split(" ");
      const lineH = fs * st.lineHeight;
      const totalH = words.length * lineH;
      words.forEach((word, i) => {
        const staggerX = (i % 2 === 0 ? -1 : 1) * w * 0.05;
        const y = h / 2 - rise - totalH / 2 + i * lineH + lineH / 2;
        const measured = ctx.measureText(word).width;
        applyStyledFill(ctx, st, palette, w / 2 + staggerX, y, measured);
        ctx.shadowBlur = physState.glow;
        ctx.shadowColor = palette[1] || "#f97316";
        const p = clampPointToSafeZone(w / 2 + staggerX, y, zone);
        ctx.fillText(word, p.x, p.y);
      });
    } else {
      const measured = ctx.measureText(displayText).width;
      applyStyledFill(ctx, st, palette, w / 2, h / 2 - rise, measured);
      ctx.shadowBlur = physState.glow;
      ctx.shadowColor = palette[1] || "#f97316";
      const p = clampPointToSafeZone(w / 2, h / 2 - rise, zone);
      ctx.fillText(displayText, p.x, p.y);
    }
  }

  const particleCount = Math.floor(physState.heat * 20);
  for (let i = 0; i < particleCount; i++) {
    const particle = clampPointToSafeZone(
      w / 2 + (rng() - 0.5) * w * 0.6,
      h / 2 - rise - rng() * age * 0.1,
      zone,
    );
    const size = 1 + rng() * 3;
    setAlpha(ctx, s, Math.max(0, 1 - (age * 0.001)));
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)] || "#f97316";
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawHookFracture: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, Math.round(fs * 1.1));

  const shakeX = (rng() - 0.5) * physState.shake;
  const shakeY = (rng() - 0.5) * physState.shake;
  const zone = getSafeZone(w, h, Math.max(12, physState.safeOffset));

  // In non-fractured state, use stacked rendering on narrow screens
  if (!physState.isFractured) {
    ctx.shadowBlur = Math.min(25, physState.glow * 2);
    ctx.shadowColor = palette[1] || palette[0] || "#a855f7";
    if (drawAutoStacked(ctx, s, w / 2 + shakeX, h / 2 + shakeY)) {
      ctx.restore();
      return;
    }
  }

  const measured = measureCharByCharWidth(ctx, displayText, st);
  const clampedScale = safeScale(measured, w, Math.min(1.5, physState.scale));
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(clampedScale, clampedScale);

  if (physState.isFractured) {
    const chars = displayText.split("");
    const charPositions = getCharPositions(ctx, displayText, st, 0);
    const driftMult = Math.min(physState.heat * 25, w * 0.15);
    chars.forEach((char, i) => {
      ctx.save();
      const drift = (i - chars.length / 2) * (driftMult / chars.length);
      const yOff = Math.sin(age * 0.01 + i * 1.7) * Math.min(physState.glow * 0.15, 15);
      ctx.translate(drift, yOff);
      const x = charPositions[i];
      const p = clampPointToSafeZone(x + drift, yOff, {
        ...zone,
        left: zone.left - w / 2,
        right: zone.right - w / 2,
        top: zone.top - h / 2,
        bottom: zone.bottom - h / 2,
      });
      setAlpha(ctx, s, 0.5);
      ctx.fillStyle = "cyan";
      ctx.fillText(char, p.x + 3, p.y);
      ctx.fillStyle = "red";
      ctx.fillText(char, p.x - 3, p.y);
      setAlpha(ctx, s, 1);
      if (st.colorMode === "per-char") {
        ctx.fillStyle = palette[i % palette.length] || "#fff";
      } else {
        ctx.fillStyle = palette[0] || "#fff";
      }
      ctx.fillText(char, p.x, p.y);
      ctx.restore();
    });
  } else {
    const measuredFill = ctx.measureText(displayText).width;
    applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
    ctx.fillText(displayText, 0, 0);
  }
  ctx.restore();
};

const drawStaticResolve: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  const st = style(s);
  const displayText = applyTransform(text, st);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = buildFont(st, fs);

  const t = Math.min(1, age / 400);
  const blur = (1 - t) * 8;
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : "none";

  ctx.shadowBlur = Math.min(15, physState.glow * 0.5);
  ctx.shadowColor = palette[1] || "#8b5cf6";

  const measured = measureCharByCharWidth(ctx, displayText, st);
  const clampedScale = safeScale(measured, w, Math.min(1.5, physState.scale));

  if (drawAutoStacked(ctx, s, w / 2, h / 2, { scale: clampedScale, alpha: t })) {
    ctx.restore();
    return;
  }

  setAlpha(ctx, s, t);
  ctx.translate(w / 2, h / 2);
  ctx.scale(clampedScale, clampedScale);

  const measuredFill = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
  ctx.fillText(displayText, 0, 0);
  ctx.restore();
};

// ── Registry ────────────────────────────────────────────────────────────────

export const EFFECT_REGISTRY: Record<string, EffectFn> = {
  SHATTER_IN: drawShatterIn,
  TUNNEL_RUSH: drawTunnelRush,
  GRAVITY_DROP: drawGravityDrop,
  PULSE_BLOOM: drawPulseBloom,
  RIPPLE_OUT: drawRippleOut,
  GLITCH_FLASH: drawGlitchFlash,
  WAVE_SURGE: drawWaveSurge,
  EMBER_RISE: drawEmberRise,
  HOOK_FRACTURE: drawHookFracture,
  STATIC_RESOLVE: drawStaticResolve,
};

/**
 * Map AI-generated creative effect keys to the closest registered effect.
 * The AI Song DNA prompt produces expressive keys (e.g. "SMOKE_BURST", "ICE_SHARD_BURST")
 * that need to resolve to one of the 10 registered effects above.
 */
const AI_KEY_TO_EFFECT: Record<string, string> = {
  // Mod-style keys
  PULSE_SLOW: "PULSE_BLOOM",
  PULSE_STRONG: "PULSE_BLOOM",
  SHIMMER_FAST: "GLITCH_FLASH",
  WAVE_DISTORT: "WAVE_SURGE",
  DISTORT_WAVE: "WAVE_SURGE",
  STATIC_GLITCH: "GLITCH_FLASH",
  HEAT_SPIKE: "EMBER_RISE",
  BLUR_OUT: "STATIC_RESOLVE",
  FADE_OUT_FAST: "TUNNEL_RUSH",
  // Fire / heat family
  SMOKE_BURST: "EMBER_RISE",
  EMBER_FLICKER: "GLITCH_FLASH",
  ASH_FALL: "GRAVITY_DROP",
  HEAT_WAVE: "WAVE_SURGE",
  CRACKLE_STATIC: "GLITCH_FLASH",
  FLAME_LICK: "EMBER_RISE",
  SPARK_SHOWER: "EMBER_RISE",
  // Ice / cold family
  WIND_GUST: "WAVE_SURGE",
  ICE_SHARD_BURST: "SHATTER_IN",
  FROST_OVERLAY: "STATIC_RESOLVE",
  CRYSTAL_SHATTER: "SHATTER_IN",
  // Energy / light family
  DEEP_RUMBLE: "PULSE_BLOOM",
  PARTICLE_BURST: "SHATTER_IN",
  RIPPLE_EXPAND: "RIPPLE_OUT",
  FADE_IN_OUT: "TUNNEL_RUSH",
  LIGHT_STREAK: "TUNNEL_RUSH",
  THUNDER_CRACK: "GLITCH_FLASH",
  FLASH_BANG: "GLITCH_FLASH",
  NEON_PULSE: "PULSE_BLOOM",
  BLOOM_BURST: "PULSE_BLOOM",
  PRISM_SPLIT: "GLITCH_FLASH",
  // Atmosphere family
  MIST_ROLL: "STATIC_RESOLVE",
  DUST_SCATTER: "SHATTER_IN",
  AURORA_SWEEP: "WAVE_SURGE",
  SHADOW_FLICKER: "GLITCH_FLASH",
  // Transition family
  VOID_PULL: "TUNNEL_RUSH",
  ECHO_FADE: "STATIC_RESOLVE",
  DISSOLVE: "STATIC_RESOLVE",
  TREMOR: "RIPPLE_OUT",
  FRACTURE: "HOOK_FRACTURE",
  // Additional fire / heat family
  FLAME_BURST: "EMBER_RISE",
  SMOKE_PLUME: "WAVE_SURGE",
  EMBER_TRAIL: "EMBER_RISE",
  HEAT_SHIMMER: "WAVE_SURGE",
  SMOKE_TRAIL: "WAVE_SURGE",
  EMBER_GLOW: "PULSE_BLOOM",
  ASH_CLOUD: "GRAVITY_DROP",
  // Additional transition / generic
  RIPPLE_OUT: "RIPPLE_OUT",
  FADE_OUT: "TUNNEL_RUSH",
  FADE_IN: "TUNNEL_RUSH",
  PULSE_SOFT: "PULSE_BLOOM",
  WAVE_SURGE: "WAVE_SURGE",
  IGNITE: "EMBER_RISE",
  EXPLODE: "SHATTER_IN",
  SMOLDER: "PULSE_BLOOM",
  ERUPT: "HOOK_FRACTURE",
};

/** Resolve an AI-generated effect key to a registered effect function */
export function resolveEffectKey(rawKey: string): string {
  return AI_KEY_TO_EFFECT[rawKey] || (EFFECT_REGISTRY[rawKey] ? rawKey : "STATIC_RESOLVE");
}

export function getEffect(key: string): EffectFn {
  return EFFECT_REGISTRY[key] ?? drawStaticResolve;
}
