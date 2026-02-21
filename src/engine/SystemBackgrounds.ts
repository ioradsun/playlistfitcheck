/**
 * SystemBackgrounds — Per-system animated background environments.
 *
 * Each system gets a distinct world that the lyrics exist inside.
 * Backgrounds respond to the same PhysicsState and beat events as text.
 * Call `drawSystemBackground` every frame BEFORE drawing text.
 */

import type { PhysicsState } from "./PhysicsIntegrator";

export interface BackgroundState {
  system: string;
  physState: PhysicsState;
  w: number;
  h: number;
  time: number;       // currentTime in seconds
  beatCount: number;
  rng: () => number;
  palette: string[];
  hookStart: number;
  hookEnd: number;
}

// ── Persistent state per canvas instance ────────────────────────────────────

interface FractureCracks {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; age: number }>;
  lastBeatCount: number;
  shockwaves: Array<{ birth: number }>;
  cleared: boolean;
}

interface BreathState {
  heatSmooth: number;
}

interface CombustionEmber {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number;
}

interface OrbitStar {
  x: number; y: number; vx: number; vy: number; alpha: number; size: number;
}

const fractureState = new WeakMap<CanvasRenderingContext2D, FractureCracks>();
const breathState = new WeakMap<CanvasRenderingContext2D, BreathState>();
const combustionEmbers = new WeakMap<CanvasRenderingContext2D, CombustionEmber[]>();
const orbitStars = new WeakMap<CanvasRenderingContext2D, OrbitStar[]>();
const pressureRuleExtent = new WeakMap<CanvasRenderingContext2D, { extent: number; lastBeat: number }>();

// ── FRACTURE — Raw concrete with glowing stress cracks ─────────────────────

function drawFractureBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, rng, palette, time } = s;

  if (!fractureState.has(ctx)) {
    fractureState.set(ctx, { lines: [], lastBeatCount: 0, shockwaves: [], cleared: false });
  }
  const st = fractureState.get(ctx)!;

  // Warm concrete base — visible gray-brown, NOT black
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#2e2a25");
  grad.addColorStop(0.5, "#3a3530");
  grad.addColorStop(1, "#252220");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Concrete texture — visible speckles
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 80; i++) {
    const nx = rng() * w;
    const ny = rng() * h;
    const ns = 1 + rng() * 4;
    ctx.fillStyle = rng() > 0.5 ? "#4a433c" : "#5a524a";
    ctx.fillRect(nx, ny, ns, ns);
  }
  ctx.globalAlpha = 1;

  // Hook explosion
  const isHookExplosion = physState.isFractured && !st.cleared;
  if (isHookExplosion) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    st.lines = [];
    st.cleared = true;
    return;
  }
  if (!physState.isFractured) st.cleared = false;

  // Beat shockwaves + cracks
  if (beatCount > st.lastBeatCount) {
    st.shockwaves.push({ birth: time });
    st.lastBeatCount = beatCount;
    const crackCount = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < crackCount; i++) {
      const corner = Math.floor(rng() * 4);
      const origins = [[0, 0], [w, 0], [w, h], [0, h]];
      const [ox, oy] = origins[corner];
      const angle = Math.atan2(h / 2 - oy, w / 2 - ox) + (rng() - 0.5) * 1.2;
      const len = 40 + rng() * 120;
      st.lines.push({
        x1: ox + (rng() - 0.5) * w * 0.3,
        y1: oy + (rng() - 0.5) * h * 0.3,
        x2: ox + Math.cos(angle) * len + (rng() - 0.5) * w * 0.3,
        y2: oy + Math.sin(angle) * len + (rng() - 0.5) * h * 0.3,
        age: 0,
      });
    }
    if (st.lines.length > 60) st.lines = st.lines.slice(-60);
  }

  // Draw glowing cracks
  const crackColor = palette[1] || palette[0] || "#ff6b35";
  st.lines.forEach(crack => {
    crack.age += 0.016;
    const alpha = Math.min(0.5, crack.age * 0.8);
    // Glow layer
    ctx.strokeStyle = crackColor;
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(crack.x1, crack.y1);
    ctx.lineTo(crack.x2, crack.y2);
    ctx.stroke();
    // Core line
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crack.x1, crack.y1);
    ctx.lineTo(crack.x2, crack.y2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Shockwave rings
  st.shockwaves = st.shockwaves.filter(sw => {
    const age = time - sw.birth;
    if (age > 0.6 || age < 0) return false;
    const r = Math.abs(age * Math.max(w, h) * 1.5);
    if (r <= 0) return true;
    const alpha = Math.max(0, 1 - age * 1.7) * 0.5;
    ctx.strokeStyle = crackColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    return true;
  });
  ctx.globalAlpha = 1;
}

// ── PRESSURE — Deep indigo void with geometric compression ─────────────────

function drawPressureBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, palette, time } = s;

  // Deep indigo/violet base — NOT pure black
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
  grad.addColorStop(0, "#1a1530");
  grad.addColorStop(0.5, "#0f0d20");
  grad.addColorStop(1, "#06050e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Slow pulsing ambient glow
  const pulseAlpha = 0.04 + Math.sin(time * 0.8) * 0.02;
  const glowColor = palette[1] || palette[0] || "#8b5cf6";
  const gR = parseInt(glowColor.slice(1, 3), 16) || 139;
  const gG = parseInt(glowColor.slice(3, 5), 16) || 92;
  const gB = parseInt(glowColor.slice(5, 7), 16) || 246;

  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
  glow.addColorStop(0, `rgba(${gR},${gG},${gB},${pulseAlpha})`);
  glow.addColorStop(0.6, `rgba(${gR},${gG},${gB},${pulseAlpha * 0.3})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Geometric grid lines — subtle but visible
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = `rgb(${gR},${gG},${gB})`;
  ctx.lineWidth = 0.5;
  const gridStep = 60;
  for (let x = 0; x < w; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Compression pulse on downbeat
  const compressPulse = physState.scale > 1.05 ? (physState.scale - 1) * 0.5 : 0;
  if (compressPulse > 0) {
    const grad2 = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.4);
    grad2.addColorStop(0, `rgba(${gR},${gG},${gB},${Math.min(0.15, compressPulse)})`);
    grad2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);
  }

  // Rule extent tracking
  if (!pressureRuleExtent.has(ctx)) {
    pressureRuleExtent.set(ctx, { extent: 0, lastBeat: 0 });
  }
  const rState = pressureRuleExtent.get(ctx)!;
  if (beatCount > rState.lastBeat) {
    rState.extent = 1;
    rState.lastBeat = beatCount;
  }
  rState.extent = Math.max(0, rState.extent - 0.025);

  const ruleAlpha = 0.5 * rState.extent;
  if (ruleAlpha > 0.01) {
    const ruleW = w * rState.extent;
    const ruleX = (w - ruleW) / 2;
    ctx.strokeStyle = `rgba(${gR},${gG},${gB},${ruleAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ruleX, h * 0.35);
    ctx.lineTo(ruleX + ruleW, h * 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ruleX, h * 0.65);
    ctx.lineTo(ruleX + ruleW, h * 0.65);
    ctx.stroke();
  }
}

// ── BREATH — Warm fog with candlelight glow ────────────────────────────────

function drawBreathBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, palette, time } = s;

  if (!breathState.has(ctx)) {
    breathState.set(ctx, { heatSmooth: 0 });
  }
  const bs = breathState.get(ctx)!;
  bs.heatSmooth += (physState.heat - bs.heatSmooth) * 0.03;

  const warmHex = palette[1] || palette[0] || "#d97706";
  const wr = parseInt(warmHex.slice(1, 3), 16) || 180;
  const wg = parseInt(warmHex.slice(3, 5), 16) || 100;
  const wb = parseInt(warmHex.slice(5, 7), 16) || 20;
  const heat = bs.heatSmooth;

  // Deep teal-navy base — distinctly NOT black
  const baseR = Math.round(12 + heat * 15);
  const baseG = Math.round(22 + heat * 8);
  const baseB = Math.round(42 + heat * 5);
  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, w, h);

  // Large warm ambient glow from center — the "candle"
  const candleX = w / 2 + Math.sin(time * 0.5) * w * 0.05;
  const candleY = h * 0.55 + Math.cos(time * 0.7) * h * 0.03;
  const candleGrad = ctx.createRadialGradient(candleX, candleY, 0, candleX, candleY, w * 0.6);
  const candleAlpha = 0.1 + heat * 0.15;
  candleGrad.addColorStop(0, `rgba(${wr},${wg},${wb},${candleAlpha})`);
  candleGrad.addColorStop(0.3, `rgba(${wr},${wg},${wb},${candleAlpha * 0.4})`);
  candleGrad.addColorStop(0.7, `rgba(${wr},${wg},${wb},${candleAlpha * 0.1})`);
  candleGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = candleGrad;
  ctx.fillRect(0, 0, w, h);

  // Thermal gradient pooling in lower third
  const gradY = h * (0.6 - heat * 0.15);
  const thermalGrad = ctx.createLinearGradient(0, gradY, 0, h);
  const warmAlpha = 0.12 + heat * 0.18;
  thermalGrad.addColorStop(0, `rgba(${wr},${wg},${wb},0)`);
  thermalGrad.addColorStop(0.4, `rgba(${wr},${wg},${wb},${warmAlpha * 0.3})`);
  thermalGrad.addColorStop(1, `rgba(${wr},${wg},${wb},${warmAlpha})`);
  ctx.fillStyle = thermalGrad;
  ctx.fillRect(0, 0, w, h);

  // Drifting fog clouds
  for (let i = 0; i < 3; i++) {
    const driftX = Math.sin(time * (0.2 + i * 0.1) + i * 2) * w * 0.15;
    const driftY = Math.cos(time * (0.15 + i * 0.08) + i * 3) * h * 0.08;
    const fogGrad = ctx.createRadialGradient(
      w * (0.3 + i * 0.2) + driftX, h * 0.5 + driftY, 0,
      w * (0.3 + i * 0.2) + driftX, h * 0.5 + driftY, w * 0.35
    );
    fogGrad.addColorStop(0, `rgba(${wr},${wg},${wb},${0.04 + heat * 0.04})`);
    fogGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, w, h);
  }
}

// ── COMBUSTION — Furnace with rising embers and heat haze ──────────────────

function drawCombustionBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, rng, palette } = s;

  // Deep crimson-brown base — furnace interior
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0, "#1a0a08");
  baseGrad.addColorStop(0.4, "#2a1510");
  baseGrad.addColorStop(0.7, "#3a1a12");
  baseGrad.addColorStop(1, "#4a2018");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Hot glow from bottom — the fire source
  const fireGrad = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, h * 0.8);
  fireGrad.addColorStop(0, "rgba(255, 80, 20, 0.2)");
  fireGrad.addColorStop(0.3, "rgba(200, 50, 10, 0.1)");
  fireGrad.addColorStop(0.6, "rgba(120, 30, 5, 0.05)");
  fireGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fireGrad;
  ctx.fillRect(0, 0, w, h);

  // Warm noise texture
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 60; i++) {
    const nx = rng() * w;
    const ny = rng() * h;
    const ns = 2 + rng() * 5;
    ctx.fillStyle = rng() > 0.5 ? "#5a3020" : "#4a2518";
    ctx.fillRect(nx, ny, ns, ns);
  }
  ctx.globalAlpha = 1;

  // Ember system
  if (!combustionEmbers.has(ctx)) {
    combustionEmbers.set(ctx, []);
  }
  const embers = combustionEmbers.get(ctx)!;
  const emberColor = palette[2] || palette[1] || "#f97316";
  const eR = parseInt(emberColor.slice(1, 3), 16) || 249;
  const eG = parseInt(emberColor.slice(3, 5), 16) || 115;
  const eB = parseInt(emberColor.slice(5, 7), 16) || 22;

  // Continuous ambient embers (~15 visible)
  const ambientCount = embers.filter(e => e.life > 0).length;
  if (ambientCount < 15) {
    embers.push({
      x: w * 0.1 + rng() * w * 0.8,
      y: h + 5,
      vx: (rng() - 0.5) * 0.4,
      vy: -(0.4 + rng() * 0.8),
      life: 1,
      maxLife: 1,
      size: 1 + rng() * 3,
    });
  }

  // Beat burst — more intense
  if (beatCount > 0 && physState.velocity > 0.3) {
    const burstCount = Math.floor(20 + rng() * 25);
    for (let i = 0; i < burstCount; i++) {
      embers.push({
        x: w * 0.1 + rng() * w * 0.8,
        y: h + rng() * 10,
        vx: (rng() - 0.5) * 2,
        vy: -(2 + rng() * 3),
        life: 1,
        maxLife: 1,
        size: 1.5 + rng() * 3,
      });
    }
  }

  // Draw embers with visible glow
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += e.vx;
    e.y += e.vy;
    e.vy *= 0.997;
    e.life -= 0.006;
    if (e.life <= 0 || e.y < -10) {
      embers.splice(i, 1);
      continue;
    }
    // Outer glow
    ctx.globalAlpha = e.life * 0.2;
    ctx.fillStyle = `rgba(${eR},${eG},${eB},0.5)`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size * 3, 0, Math.PI * 2);
    ctx.fill();
    // Core
    ctx.globalAlpha = e.life * 0.9;
    ctx.fillStyle = `rgb(${Math.min(255, eR + 40)},${Math.min(255, eG + 30)},${eB})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  }
  if (embers.length > 100) embers.splice(0, embers.length - 100);
  ctx.globalAlpha = 1;
}

// ── ORBIT — Cosmic deep space with nebula and stars ────────────────────────

function drawOrbitBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, rng, palette, time } = s;

  // Deep cosmic blue-purple base
  const baseGrad = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w / 2, h / 2, Math.max(w, h) * 0.9);
  baseGrad.addColorStop(0, "#0c0e24");
  baseGrad.addColorStop(0.4, "#0a0b1a");
  baseGrad.addColorStop(1, "#050510");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Nebula cloud — visible colored atmosphere
  const coldHex = palette[0] || "#6366f1";
  const cR = parseInt(coldHex.slice(1, 3), 16) || 99;
  const cG = parseInt(coldHex.slice(3, 5), 16) || 102;
  const cB = parseInt(coldHex.slice(5, 7), 16) || 241;

  const accentHex = palette[1] || "#ec4899";
  const aR = parseInt(accentHex.slice(1, 3), 16) || 236;
  const aG = parseInt(accentHex.slice(3, 5), 16) || 72;
  const aB = parseInt(accentHex.slice(5, 7), 16) || 153;

  // Primary nebula cloud
  const nebX = w * 0.6 + Math.sin(time * 0.1) * w * 0.05;
  const nebY = h * 0.35 + Math.cos(time * 0.08) * h * 0.03;
  const neb1 = ctx.createRadialGradient(nebX, nebY, 0, nebX, nebY, w * 0.5);
  neb1.addColorStop(0, `rgba(${cR},${cG},${cB},0.08)`);
  neb1.addColorStop(0.4, `rgba(${cR},${cG},${cB},0.04)`);
  neb1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb1;
  ctx.fillRect(0, 0, w, h);

  // Secondary nebula — accent color
  const neb2X = w * 0.3 + Math.cos(time * 0.12) * w * 0.04;
  const neb2Y = h * 0.65 + Math.sin(time * 0.09) * h * 0.04;
  const neb2 = ctx.createRadialGradient(neb2X, neb2Y, 0, neb2X, neb2Y, w * 0.4);
  neb2.addColorStop(0, `rgba(${aR},${aG},${aB},0.06)`);
  neb2.addColorStop(0.5, `rgba(${aR},${aG},${aB},0.02)`);
  neb2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, w, h);

  // Star field
  if (!orbitStars.has(ctx)) {
    const stars: OrbitStar[] = [];
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: rng() * w,
        y: rng() * h,
        vx: (rng() - 0.5) * 0.03,
        vy: (rng() - 0.5) * 0.03,
        alpha: 0.2 + rng() * 0.7,
        size: 0.5 + rng() * 1.5,
      });
    }
    orbitStars.set(ctx, stars);
  }
  const stars = orbitStars.get(ctx)!;

  stars.forEach(star => {
    star.x += star.vx;
    star.y += star.vy;
    if (star.x < 0) star.x = w;
    if (star.x > w) star.x = 0;
    if (star.y < 0) star.y = h;
    if (star.y > h) star.y = 0;

    // Twinkle
    const twinkle = Math.sin(time * 2 + star.x * 0.01 + star.y * 0.01) * 0.2 + 0.8;
    ctx.globalAlpha = star.alpha * twinkle;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();

    // Brighter stars get a glow
    if (star.alpha > 0.5) {
      ctx.globalAlpha = star.alpha * twinkle * 0.15;
      ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  // Gravitational wave rings on beats
  if (physState.velocity > 0.3) {
    const ringAge = (physState.scale - 1) * 5;
    const r = ringAge * Math.max(w, h) * 0.8;
    if (r > 0 && r < Math.max(w, h)) {
      const alpha = Math.max(0, 0.12 - ringAge * 0.05);
      ctx.strokeStyle = `rgba(${cR},${cG},${cB},${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ── Public dispatcher ──────────────────────────────────────────────────────

const BG_RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, s: BackgroundState) => void> = {
  fracture: drawFractureBackground,
  pressure: drawPressureBackground,
  breath: drawBreathBackground,
  combustion: drawCombustionBackground,
  orbit: drawOrbitBackground,
};

export function drawSystemBackground(ctx: CanvasRenderingContext2D, s: BackgroundState): void {
  const renderer = BG_RENDERERS[s.system];
  if (renderer) {
    renderer(ctx, s);
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    ctx.fillRect(0, 0, s.w, s.h);
  }
}
