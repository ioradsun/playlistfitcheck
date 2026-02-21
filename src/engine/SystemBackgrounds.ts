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
  shockwaves: Array<{ birth: number; }>;
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

// Persistent state keyed by canvas (WeakMap so GC works)
const fractureState = new WeakMap<CanvasRenderingContext2D, FractureCracks>();
const breathState = new WeakMap<CanvasRenderingContext2D, BreathState>();
const combustionEmbers = new WeakMap<CanvasRenderingContext2D, CombustionEmber[]>();
const orbitStars = new WeakMap<CanvasRenderingContext2D, OrbitStar[]>();
const pressureRuleExtent = new WeakMap<CanvasRenderingContext2D, { extent: number; lastBeat: number }>();

// ── FRACTURE — Concrete with stress cracks ─────────────────────────────────

function drawFractureBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, rng, palette, time, hookStart, hookEnd } = s;

  // Init persistent state
  if (!fractureState.has(ctx)) {
    fractureState.set(ctx, { lines: [], lastBeatCount: 0, shockwaves: [], cleared: false });
  }
  const st = fractureState.get(ctx)!;

  // Concrete base — dark warm gray
  ctx.fillStyle = "#1a1917";
  ctx.fillRect(0, 0, w, h);

  // Hook explosion: clear cracks, flash white
  const isHookExplosion = physState.isFractured && !st.cleared;
  if (isHookExplosion) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    st.lines = [];
    st.cleared = true;
    return; // single white frame
  }
  if (!physState.isFractured) st.cleared = false;

  // Beat shockwaves
  if (beatCount > st.lastBeatCount) {
    st.shockwaves.push({ birth: time });
    st.lastBeatCount = beatCount;

    // Add new cracks on each beat
    const crackCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < crackCount; i++) {
      // Cracks grow from corners/edges
      const corner = Math.floor(rng() * 4);
      const origins = [[0, 0], [w, 0], [w, h], [0, h]];
      const [ox, oy] = origins[corner];
      const angle = Math.atan2(h / 2 - oy, w / 2 - ox) + (rng() - 0.5) * 1.2;
      const len = 30 + rng() * 80;
      st.lines.push({
        x1: ox + (rng() - 0.5) * w * 0.3,
        y1: oy + (rng() - 0.5) * h * 0.3,
        x2: ox + Math.cos(angle) * len + (rng() - 0.5) * w * 0.3,
        y2: oy + Math.sin(angle) * len + (rng() - 0.5) * h * 0.3,
        age: 0,
      });
    }
    // Cap total cracks
    if (st.lines.length > 60) st.lines = st.lines.slice(-60);
  }

  // Draw cracks — dim primary palette color
  const crackColor = palette[0] || "#ffffff";
  st.lines.forEach(crack => {
    crack.age += 0.016;
    const alpha = Math.min(0.15, crack.age * 0.3);
    ctx.strokeStyle = crackColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(crack.x1, crack.y1);
    ctx.lineTo(crack.x2, crack.y2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Shockwave rings
  st.shockwaves = st.shockwaves.filter(sw => {
    const age = time - sw.birth;
    if (age > 0.5 || age < 0) return false;
    const r = Math.abs(age * Math.max(w, h) * 1.5);
    if (r <= 0) return true;
    const alpha = Math.max(0, 1 - age * 2) * 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    return true;
  });
  ctx.globalAlpha = 1;
}

// ── PRESSURE — Void with radial vignette ───────────────────────────────────

function drawPressureBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, palette } = s;

  // Pure black base
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // Radial vignette — lighter at center
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, "rgba(255,255,255,0.04)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.01)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Downbeat compression pulse — subtle scale effect via vignette intensity
  const compressPulse = physState.scale > 1.05 ? (physState.scale - 1) * 0.3 : 0;
  if (compressPulse > 0) {
    const grad2 = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
    grad2.addColorStop(0, `rgba(255,255,255,${Math.min(0.06, compressPulse)})`);
    grad2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);
  }

  // Init rule extent tracking
  if (!pressureRuleExtent.has(ctx)) {
    pressureRuleExtent.set(ctx, { extent: 0, lastBeat: 0 });
  }
  const rState = pressureRuleExtent.get(ctx)!;

  // Rules extend on beats
  if (beatCount > rState.lastBeat) {
    rState.extent = 1;
    rState.lastBeat = beatCount;
  }
  rState.extent = Math.max(0, rState.extent - 0.03);

  const ruleColor = palette[0] || "#ffffff";
  const ruleAlpha = 0.3 * rState.extent;
  if (ruleAlpha > 0.01) {
    const ruleW = w * rState.extent;
    const ruleX = (w - ruleW) / 2;
    ctx.strokeStyle = ruleColor;
    ctx.globalAlpha = ruleAlpha;
    ctx.lineWidth = 0.5;
    // Top rule
    ctx.beginPath();
    ctx.moveTo(ruleX, h * 0.38);
    ctx.lineTo(ruleX + ruleW, h * 0.38);
    ctx.stroke();
    // Bottom rule
    ctx.beginPath();
    ctx.moveTo(ruleX, h * 0.62);
    ctx.lineTo(ruleX + ruleW, h * 0.62);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ── BREATH — Fog and candlelight ───────────────────────────────────────────

function drawBreathBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, palette, time } = s;

  // Init smooth heat tracker
  if (!breathState.has(ctx)) {
    breathState.set(ctx, { heatSmooth: 0 });
  }
  const bs = breathState.get(ctx)!;
  // Smooth heat interpolation
  bs.heatSmooth += (physState.heat - bs.heatSmooth) * 0.03;

  // Deep navy base
  const coldR = 15, coldG = 18, coldB = 35;
  // Warm color from palette (default amber)
  const warmHex = palette[1] || palette[0] || "#d97706";
  const wr = parseInt(warmHex.slice(1, 3), 16) || 180;
  const wg = parseInt(warmHex.slice(3, 5), 16) || 100;
  const wb = parseInt(warmHex.slice(5, 7), 16) || 20;

  const heat = bs.heatSmooth;
  const r = Math.round(coldR + (wr - coldR) * heat * 0.15);
  const g = Math.round(coldG + (wg - coldG) * heat * 0.15);
  const b = Math.round(coldB + (wb - coldB) * heat * 0.15);

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);

  // Thermal gradient pooling in lower third, rising with heat
  const gradY = h * (0.7 - heat * 0.15);
  const grad = ctx.createLinearGradient(0, gradY, 0, h);
  const warmAlpha = 0.08 + heat * 0.12;
  grad.addColorStop(0, `rgba(${wr},${wg},${wb},0)`);
  grad.addColorStop(0.5, `rgba(${wr},${wg},${wb},${warmAlpha * 0.5})`);
  grad.addColorStop(1, `rgba(${wr},${wg},${wb},${warmAlpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Slow drifting ambient — sine-based position shift
  const driftX = Math.sin(time * 0.3) * w * 0.1;
  const driftY = Math.cos(time * 0.2) * h * 0.05;
  const fogGrad = ctx.createRadialGradient(
    w / 2 + driftX, h * 0.6 + driftY, 0,
    w / 2 + driftX, h * 0.6 + driftY, w * 0.5
  );
  fogGrad.addColorStop(0, `rgba(${wr},${wg},${wb},${0.04 + heat * 0.06})`);
  fogGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, w, h);
}

// ── COMBUSTION — Smoke and embers ──────────────────────────────────────────

function drawCombustionBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, rng, palette } = s;

  // Dark brown-black base
  ctx.fillStyle = "#1a1210";
  ctx.fillRect(0, 0, w, h);

  // Static warm noise texture (deterministic per-frame with rng)
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 40; i++) {
    const nx = rng() * w;
    const ny = rng() * h;
    const ns = 2 + rng() * 6;
    ctx.fillStyle = rng() > 0.5 ? "#3d2b1a" : "#2a1c0f";
    ctx.fillRect(nx, ny, ns, ns);
  }
  ctx.globalAlpha = 1;

  // Ember system
  if (!combustionEmbers.has(ctx)) {
    combustionEmbers.set(ctx, []);
  }
  const embers = combustionEmbers.get(ctx)!;

  // Continuous ambient embers
  const emberColor = palette[2] || palette[1] || "#f97316";
  const eR = parseInt(emberColor.slice(1, 3), 16) || 249;
  const eG = parseInt(emberColor.slice(3, 5), 16) || 115;
  const eB = parseInt(emberColor.slice(5, 7), 16) || 22;

  // Spawn ambient embers (maintain ~10)
  const ambientCount = embers.filter(e => e.life > 0).length;
  if (ambientCount < 10) {
    embers.push({
      x: w * 0.2 + rng() * w * 0.6,
      y: h + 5,
      vx: (rng() - 0.5) * 0.3,
      vy: -(0.3 + rng() * 0.5),
      life: 1,
      maxLife: 1,
      size: 1 + rng() * 2,
    });
  }

  // Beat burst
  if (beatCount > 0 && physState.velocity > 0.5) {
    const burstCount = Math.floor(15 + rng() * 20);
    for (let i = 0; i < burstCount; i++) {
      embers.push({
        x: w * 0.1 + rng() * w * 0.8,
        y: h + rng() * 10,
        vx: (rng() - 0.5) * 1.5,
        vy: -(1.5 + rng() * 2.5),
        life: 1,
        maxLife: 1,
        size: 1 + rng() * 2.5,
      });
    }
  }

  // Update & draw embers
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += e.vx;
    e.y += e.vy;
    e.vy *= 0.995; // slight deceleration
    e.life -= 0.008;
    if (e.life <= 0 || e.y < -10) {
      embers.splice(i, 1);
      continue;
    }
    const alpha = e.life * 0.8;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${eR},${eG},${eB})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.globalAlpha = alpha * 0.3;
    ctx.shadowBlur = 4;
    ctx.shadowColor = `rgb(${eR},${eG},${eB})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Cap total embers
  if (embers.length > 80) embers.splice(0, embers.length - 80);
  ctx.globalAlpha = 1;
}

// ── ORBIT — Deep space ─────────────────────────────────────────────────────

function drawOrbitBackground(ctx: CanvasRenderingContext2D, s: BackgroundState) {
  const { w, h, physState, beatCount, rng, palette, time } = s;

  // Deep blue-black base
  ctx.fillStyle = "#08090f";
  ctx.fillRect(0, 0, w, h);

  // Subtle cold vignette from palette
  const coldHex = palette[0] || "#6366f1";
  const cR = parseInt(coldHex.slice(1, 3), 16) || 99;
  const cG = parseInt(coldHex.slice(3, 5), 16) || 102;
  const cB = parseInt(coldHex.slice(5, 7), 16) || 241;

  const vigGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
  vigGrad.addColorStop(0, `rgba(${cR},${cG},${cB},0.03)`);
  vigGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  // Star field
  if (!orbitStars.has(ctx)) {
    const stars: OrbitStar[] = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: rng() * w,
        y: rng() * h,
        vx: (rng() - 0.5) * 0.02,
        vy: (rng() - 0.5) * 0.02,
        alpha: 0.15 + rng() * 0.5,
        size: 0.5 + rng() * 1,
      });
    }
    orbitStars.set(ctx, stars);
  }
  const stars = orbitStars.get(ctx)!;

  // Draw & drift stars
  stars.forEach(star => {
    star.x += star.vx;
    star.y += star.vy;
    // Wrap around
    if (star.x < 0) star.x = w;
    if (star.x > w) star.x = 0;
    if (star.y < 0) star.y = h;
    if (star.y > h) star.y = 0;

    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Gravitational wave rings on beats — very faint shimmer
  if (physState.velocity > 0.3) {
    const ringAge = (physState.scale - 1) * 5; // rough proxy
    const r = ringAge * Math.max(w, h) * 0.8;
    if (r > 0 && r < Math.max(w, h)) {
      const alpha = Math.max(0, 0.06 - ringAge * 0.03);
      ctx.strokeStyle = `rgba(${cR},${cG},${cB},${alpha})`;
      ctx.lineWidth = 1;
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

/**
 * Draw the system-specific background. Call this every frame BEFORE text.
 * Replaces the generic `ctx.fillStyle = "rgba(0,0,0,0.92)"` fill.
 */
export function drawSystemBackground(ctx: CanvasRenderingContext2D, s: BackgroundState): void {
  const renderer = BG_RENDERERS[s.system];
  if (renderer) {
    renderer(ctx, s);
  } else {
    // Fallback: dark background
    ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    ctx.fillRect(0, 0, s.w, s.h);
  }
}
