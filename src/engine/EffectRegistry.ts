/**
 * Effect Registry — maps effect_key strings to Canvas 2D draw functions.
 *
 * Each effect receives an EffectState and draws one lyric line onto the canvas.
 * Effects use the PhysicsState for motion and the seeded PRNG for deterministic chaos.
 */

import type { PhysicsState } from "./PhysicsIntegrator";

export interface EffectState {
  text: string;
  physState: PhysicsState;
  w: number;       // canvas width
  h: number;       // canvas height
  fs: number;       // font size
  age: number;      // ms since this line started
  progress: number; // 0–1 through this line's duration
  rng: () => number;
  palette: string[];
}

type EffectFn = (ctx: CanvasRenderingContext2D, s: EffectState) => void;

// ── Individual effects ──────────────────────────────────────────────────────

const drawShatterIn: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const shakeX = (rng() - 0.5) * physState.shake;
  const shakeY = (rng() - 0.5) * physState.shake;

  const chars = text.split("");
  const totalW = chars.length * fs * 0.55;
  const startX = w / 2 - totalW / 2 + shakeX;

  chars.forEach((char, i) => {
    const delay = i * 40;
    const localAge = Math.max(0, age - delay);
    const t = Math.min(1, localAge / 300);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

    const offsetY = (1 - ease) * (rng() > 0.5 ? -1 : 1) * 60;
    const alpha = ease;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette[0] || "#fff";
    ctx.fillText(char, startX + i * fs * 0.55, h / 2 + offsetY + shakeY);
  });
  ctx.restore();
};

const drawTunnelRush: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const t = Math.min(1, age / 500);
  const zoom = 0.3 + t * 0.7;
  const alpha = Math.min(1, age / 200);

  ctx.globalAlpha = alpha;
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom * physState.scale, zoom * physState.scale);

  // Trailing glow
  ctx.shadowBlur = physState.glow;
  ctx.shadowColor = palette[1] || palette[0] || "#8b5cf6";
  ctx.fillStyle = palette[0] || "#fff";
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

const drawGravityDrop: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const t = Math.min(1, age / 400);
  // Gravity: y = 0.5 * g * t^2, capped at center
  const dropY = Math.min(h / 2, -h * 0.3 + 0.5 * 2000 * t * t);
  const bounce = t >= 1 ? Math.sin((age - 400) * 0.02) * 5 * (1 - Math.min(1, (age - 400) / 800)) : 0;

  ctx.globalAlpha = Math.min(1, age / 150);
  ctx.fillStyle = palette[0] || "#fff";
  ctx.shadowBlur = physState.glow * 0.5;
  ctx.shadowColor = palette[1] || "#a855f7";
  ctx.fillText(text, w / 2, dropY + bounce);
  ctx.restore();
};

const drawPulseBloom: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const pulse = 1 + Math.sin(age * 0.008) * 0.15 * physState.heat;
  ctx.translate(w / 2, h / 2);
  ctx.scale(pulse * physState.scale, pulse * physState.scale);

  ctx.shadowBlur = physState.glow + Math.sin(age * 0.005) * 10;
  ctx.shadowColor = palette[2] || palette[0] || "#ec4899";
  ctx.fillStyle = palette[0] || "#fff";
  ctx.globalAlpha = 0.9 + physState.heat * 0.1;
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

const drawRippleOut: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  // Main text
  ctx.fillStyle = palette[0] || "#fff";
  ctx.fillText(text, w / 2, h / 2);

  // Ripple rings
  const ringCount = 3;
  for (let i = 0; i < ringCount; i++) {
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
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const glitchOn = rng() > 0.7;
  const offsetX = glitchOn ? (rng() - 0.5) * 20 : 0;
  const sliceY = glitchOn ? (rng() - 0.5) * 10 : 0;

  // RGB split
  if (glitchOn) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "cyan";
    ctx.fillText(text, w / 2 + 3 + offsetX, h / 2 + sliceY);
    ctx.fillStyle = "red";
    ctx.fillText(text, w / 2 - 3 + offsetX, h / 2 - sliceY);
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = palette[0] || "#fff";
  ctx.shadowBlur = physState.glow * 0.3;
  ctx.shadowColor = palette[1] || "#8b5cf6";
  ctx.fillText(text, w / 2 + (glitchOn ? offsetX * 0.3 : 0), h / 2);
  ctx.restore();
};

const drawWaveSurge: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const chars = text.split("");
  const totalW = chars.length * fs * 0.55;
  const startX = w / 2 - totalW / 2;

  chars.forEach((char, i) => {
    const wave = Math.sin(age * 0.006 + i * 0.5) * 15 * physState.scale;
    ctx.fillStyle = palette[i % palette.length] || "#fff";
    ctx.globalAlpha = 0.85 + physState.heat * 0.15;
    ctx.fillText(char, startX + i * fs * 0.55, h / 2 + wave);
  });
  ctx.restore();
};

const drawEmberRise: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, rng, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  // Main text rising slowly
  const rise = Math.min(30, age * 0.02);
  ctx.fillStyle = palette[0] || "#fff";
  ctx.shadowBlur = physState.glow;
  ctx.shadowColor = palette[1] || "#f97316";
  ctx.fillText(text, w / 2, h / 2 - rise);

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
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(fs * 1.2)}px "Geist", system-ui, sans-serif`;

  const shakeX = (rng() - 0.5) * physState.shake * 1.5;
  const shakeY = (rng() - 0.5) * physState.shake * 1.5;
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(physState.scale, physState.scale);

  if (physState.isFractured) {
    // Character-level shattering
    const chars = text.split("");
    const totalW = chars.length * fs * 0.6;
    chars.forEach((char, i) => {
      ctx.save();
      const drift = (i - chars.length / 2) * physState.heat * 25;
      const yOff = Math.sin(age * 0.01 + i * 1.7) * physState.glow * 0.15;
      const rot = (rng() - 0.5) * physState.heat * 0.4;
      ctx.translate(drift, yOff);
      ctx.rotate(rot);

      const x = (i * fs * 0.6) - totalW / 2;
      // RGB split (chromatic aberration)
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "cyan";
      ctx.fillText(char, x + 3, 0);
      ctx.fillStyle = "red";
      ctx.fillText(char, x - 3, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette[0] || "#fff";
      ctx.fillText(char, x, 0);
      ctx.restore();
    });
  } else {
    // Pre-fracture: intense glow buildup
    ctx.shadowBlur = physState.glow * 2;
    ctx.shadowColor = palette[1] || palette[0] || "#a855f7";
    ctx.fillStyle = palette[0] || "#fff";
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
};

// Fallback: simple centered text with physics scale
const drawStaticResolve: EffectFn = (ctx, s) => {
  const { text, physState, w, h, fs, age, palette } = s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px "Geist", system-ui, sans-serif`;

  const t = Math.min(1, age / 400);
  // Fuzz to clarity
  const blur = (1 - t) * 8;
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : "none";
  ctx.globalAlpha = t;

  ctx.translate(w / 2, h / 2);
  ctx.scale(physState.scale, physState.scale);
  ctx.fillStyle = palette[0] || "#fff";
  ctx.shadowBlur = physState.glow * 0.5;
  ctx.shadowColor = palette[1] || "#8b5cf6";
  ctx.fillText(text, 0, 0);
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
