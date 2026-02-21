/**
 * Effect Registry — maps effect_key strings to Canvas 2D draw functions.
 *
 * Each effect receives an EffectState and draws one lyric line onto the canvas.
 * Effects use the PhysicsState for motion, the seeded PRNG for deterministic chaos,
 * and the SystemStyle for per-system text identity.
 */

import type { PhysicsState } from "./PhysicsIntegrator";
import { type SystemStyle, getSystemStyle, buildFont, applyTransform, createGradientFill } from "./SystemStyles";

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
  effectiveLetterSpacing?: number;  // overridden spacing from font sizer
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

  const chars = displayText.split("");
  const charPositions = getCharPositions(ctx, displayText, st, w / 2 + shakeX);

  chars.forEach((char, i) => {
    const delay = i * 40;
    const localAge = Math.max(0, age - delay);
    const t = Math.min(1, localAge / 300);
    const ease = 1 - Math.pow(1 - t, 3);

    const offsetY = (1 - ease) * (rng() > 0.5 ? -1 : 1) * 60;
    ctx.globalAlpha = ease;

    if (st.colorMode === "per-char") {
      ctx.fillStyle = palette[i % palette.length] || "#fff";
    } else if (st.colorMode === "duotone") {
      ctx.fillStyle = i % 2 === 0 ? (palette[0] || "#fff") : (palette[1] || palette[0] || "#fff");
    } else {
      ctx.fillStyle = palette[0] || "#fff";
    }
    ctx.fillText(char, charPositions[i], h / 2 + offsetY + shakeY);
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
  const measured = measureCharByCharWidth(ctx, displayText, st);
  const combinedScale = safeScale(measured, w, Math.min(1.6, zoom * physState.scale));

  ctx.globalAlpha = alpha;
  ctx.translate(w / 2, h / 2);
  ctx.scale(combinedScale, combinedScale);

  ctx.shadowBlur = Math.min(20, physState.glow);
  ctx.shadowColor = palette[1] || palette[0] || "#8b5cf6";

  const measuredFill = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
  ctx.fillText(displayText, 0, 0);

  // Duotone: second pass with offset
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

  ctx.globalAlpha = Math.min(1, age / 150);
  ctx.shadowBlur = physState.glow * 0.5;
  ctx.shadowColor = palette[1] || "#a855f7";

  // Stacked layout: split into words and stack vertically
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
  const measured = measureCharByCharWidth(ctx, displayText, st);
  const combinedScale = safeScale(measured, w, Math.min(1.6, pulse * physState.scale));
  ctx.translate(w / 2, h / 2);
  ctx.scale(combinedScale, combinedScale);

  ctx.shadowBlur = Math.min(20, physState.glow + Math.sin(age * 0.005) * 10);
  ctx.shadowColor = palette[2] || palette[0] || "#ec4899";

  const measuredFill = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, 0, 0, measuredFill);
  ctx.globalAlpha = 0.9 + physState.heat * 0.1;
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
  const offsetX = glitchOn ? (rng() - 0.5) * 20 : 0;
  const sliceY = glitchOn ? (rng() - 0.5) * 10 : 0;

  if (glitchOn) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "cyan";
    ctx.fillText(displayText, w / 2 + 3 + offsetX, h / 2 + sliceY);
    ctx.fillStyle = "red";
    ctx.fillText(displayText, w / 2 - 3 + offsetX, h / 2 - sliceY);
  }

  ctx.globalAlpha = 1;
  const measured = ctx.measureText(displayText).width;
  applyStyledFill(ctx, st, palette, w / 2, h / 2, measured);
  ctx.shadowBlur = physState.glow * 0.3;
  ctx.shadowColor = palette[1] || "#8b5cf6";
  ctx.fillText(displayText, w / 2 + (glitchOn ? offsetX * 0.3 : 0), h / 2);
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

  // Arc layout: arrange chars in an arc
  if (st.layout === "arc") {
    const arcRadius = w * 0.3;
    const totalAngle = Math.PI * 0.6;
    chars.forEach((char, i) => {
      const angle = -totalAngle / 2 + (i / Math.max(1, chars.length - 1)) * totalAngle - Math.PI / 2;
      const cx = w / 2 + Math.cos(angle) * arcRadius;
      const cy = h / 2 + Math.sin(angle) * arcRadius + arcRadius * 0.3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = palette[i % palette.length] || "#fff";
      ctx.globalAlpha = 0.85 + physState.heat * 0.15;
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  } else {
    chars.forEach((char, i) => {
      const wave = Math.sin(age * 0.006 + i * 0.5) * waveAmp;
      if (st.colorMode === "per-char") {
        ctx.fillStyle = palette[i % palette.length] || "#fff";
      } else {
        ctx.fillStyle = palette[0] || "#fff";
      }
      ctx.globalAlpha = 0.85 + physState.heat * 0.15;
      ctx.fillText(char, charPositions[i], h / 2 + wave);
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

  const rise = Math.min(30, age * 0.02);

  // Stagger layout: slight horizontal offset per word
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
      ctx.fillText(word, w / 2 + staggerX, y);
    });
  } else {
    const measured = ctx.measureText(displayText).width;
    applyStyledFill(ctx, st, palette, w / 2, h / 2 - rise, measured);
    ctx.shadowBlur = physState.glow;
    ctx.shadowColor = palette[1] || "#f97316";
    ctx.fillText(displayText, w / 2, h / 2 - rise);
  }

  // Ember particles
  const particleCount = Math.floor(physState.heat * 20);
  for (let i = 0; i < particleCount; i++) {
    const px = w / 2 + (rng() - 0.5) * w * 0.6;
    const py = h / 2 - rise - rng() * age * 0.1;
    const size = 1 + rng() * 3;
    ctx.globalAlpha = Math.max(0, 1 - (age * 0.001));
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)] || "#f97316";
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
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
      const rot = (rng() - 0.5) * Math.min(physState.heat * 0.4, 0.3);
      ctx.translate(drift, yOff);
      ctx.rotate(rot);

      const x = charPositions[i];
      // Chromatic aberration
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "cyan";
      ctx.fillText(char, x + 3, 0);
      ctx.fillStyle = "red";
      ctx.fillText(char, x - 3, 0);
      ctx.globalAlpha = 1;
      if (st.colorMode === "per-char") {
        ctx.fillStyle = palette[i % palette.length] || "#fff";
      } else {
        ctx.fillStyle = palette[0] || "#fff";
      }
      ctx.fillText(char, x, 0);
      ctx.restore();
    });
  } else {
    ctx.shadowBlur = Math.min(25, physState.glow * 2);
    ctx.shadowColor = palette[1] || palette[0] || "#a855f7";
    const measured = ctx.measureText(displayText).width;
    applyStyledFill(ctx, st, palette, 0, 0, measured);
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
  ctx.globalAlpha = t;

  const measured = measureCharByCharWidth(ctx, displayText, st);
  const clampedScale = safeScale(measured, w, Math.min(1.5, physState.scale));
  ctx.translate(w / 2, h / 2);
  ctx.scale(clampedScale, clampedScale);

  ctx.shadowBlur = Math.min(15, physState.glow * 0.5);
  ctx.shadowColor = palette[1] || "#8b5cf6";

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

export function getEffect(key: string): EffectFn {
  return EFFECT_REGISTRY[key] ?? drawStaticResolve;
}
