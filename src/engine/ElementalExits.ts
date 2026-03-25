export interface ElementalExitState {
  initialized: boolean;
  particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    vr?: number;
    rot?: number;
    size: number;
    life: number;
    age: number;
    type: string;
    delay: number;
    phase?: number;
  }>;
  misc: Record<string, unknown>;
}

export function createExitState(): ElementalExitState {
  return { initialized: false, particles: [], misc: {} };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function seeded(seed: number): number {
  return (Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

function seeded01(seed: number): number {
  const n = seeded(seed);
  return n < 0 ? n + 1 : n;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function drawWordCentered(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
): void {
  ctx.fillText(word, cx, cy);
}

export function exitFire_Melt(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  const hold = smoothstep(0, 0.3, p);
  const melt = smoothstep(0.3, 1, p);
  const stretch = 1 + melt * 1.6;

  if (!state.initialized) {
    const count = Math.max(5, Math.floor(wordWidth / 18));
    state.particles = [];
    for (let i = 0; i < count; i += 1) {
      const s = cx * 0.13 + cy * 0.07 + i * 2.73;
      state.particles.push({
        x: cx - wordWidth * 0.5 + ((i + 0.5) / count) * wordWidth,
        y: cy + fontSize * 0.12,
        vx: (seeded01(s + 1) - 0.5) * 0.5,
        vy: -(0.5 + seeded01(s + 2) * 1.1),
        size: 1.6 + seeded01(s + 3) * 3.4,
        life: 1,
        age: 0,
        type: "ember",
        delay: seeded01(s + 4) * 0.5,
        phase: seeded01(s + 5) * Math.PI * 2,
      });
    }
    state.initialized = true;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Stretching molten word.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, stretch);
  ctx.globalAlpha = 1 - smoothstep(0.3, 1, p);
  const fg = ctx.createLinearGradient(0, -fontSize, 0, fontSize * 0.8);
  fg.addColorStop(0, "rgba(255,245,210,0.9)");
  fg.addColorStop(0.45, "rgba(255,170,55,0.95)");
  fg.addColorStop(1, "rgba(220,75,15,0.95)");
  ctx.fillStyle = fg;
  drawWordCentered(ctx, word, 0, 0);
  ctx.restore();

  const dripBaseY = cy + fontSize * 0.5;
  const cols = Math.max(4, Math.floor(wordWidth / 22));
  for (let i = 0; i < cols; i += 1) {
    const x = cx - wordWidth * 0.5 + ((i + 0.5) / cols) * wordWidth;
    const s = cx * 0.17 + i * 3.11;
    const wobble = Math.sin((p + i * 0.27) * 9 + beatEnergy * 3) * 6;
    const ext = hold * (12 + seeded01(s + 1) * 12) + melt * (24 + seeded01(s + 2) * 58);
    const bulb = 2 + seeded01(s + 3) * 4 + melt * 3;

    ctx.beginPath();
    ctx.moveTo(x, dripBaseY);
    ctx.bezierCurveTo(
      x + wobble * 0.25,
      dripBaseY + ext * 0.35,
      x + wobble,
      dripBaseY + ext * 0.75,
      x + wobble * 0.5,
      dripBaseY + ext,
    );
    ctx.strokeStyle = `rgba(255, ${120 + Math.floor(80 * (1 - p))}, 40, ${0.8 - p * 0.35})`;
    ctx.lineWidth = 2 + seeded01(s + 4) * 3;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + wobble * 0.5, dripBaseY + ext + bulb * 0.25, bulb, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,120,35,${0.75 - p * 0.2})`;
    ctx.fill();
  }

  // Embers rise as melt progresses.
  for (let i = 0; i < state.particles.length; i += 1) {
    const e = state.particles[i];
    const start = e.delay;
    if (p < start * 0.55) continue;
    const lp = clamp((p - start * 0.55) / (1 - start * 0.55), 0, 1);
    const x = e.x + Math.sin((e.phase ?? 0) + lp * 10) * 8 + e.vx * lp * 40;
    const y = e.y + e.vy * lp * 60 - lp * lp * 85;
    const a = (1 - lp) * (0.8 + beatEnergy * 0.2);

    const g = ctx.createRadialGradient(x, y, 0, x, y, e.size * 2.2);
    g.addColorStop(0, `rgba(255,245,220,${a})`);
    g.addColorStop(0.45, `rgba(255,150,70,${a * 0.9})`);
    g.addColorStop(1, "rgba(255,90,10,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, e.size * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function exitIce_Shatter(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  if (!state.initialized) {
    state.particles = [];
    const shardCount = Math.max(18, Math.floor(wordWidth / 6));
    const seedBase = Math.sin(cx * 0.1) * 1000 + cy * 0.13;
    for (let i = 0; i < shardCount; i += 1) {
      const s = seedBase + i * 1.37;
      const a = seeded01(s + 1) * Math.PI * 2;
      const speed = 40 + seeded01(s + 2) * 140;
      state.particles.push({
        x: cx + (seeded01(s + 3) - 0.5) * wordWidth * 0.8,
        y: cy + (seeded01(s + 4) - 0.5) * fontSize * 0.8,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        vr: (seeded01(s + 5) - 0.5) * 8,
        rot: seeded01(s + 6) * Math.PI * 2,
        size: 4 + seeded01(s + 7) * 12,
        life: 1,
        age: 0,
        type: "shard",
        delay: seeded01(s + 8) * 0.1,
        phase: seeded01(s + 9),
      });
    }
    state.initialized = true;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (p <= 0.05) {
    const flash = 1 - p / 0.05;
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.95})`;
    drawWordCentered(ctx, word, cx, cy);
  }

  if (p >= 0.15) {
    const local = clamp((p - 0.15) / 0.85, 0, 1);
    for (let i = 0; i < state.particles.length; i += 1) {
      const sh = state.particles[i];
      const t = clamp((local - sh.delay), 0, 1);
      const x = sh.x + sh.vx * t * 0.9;
      const y = sh.y + sh.vy * t + 300 * t * t;
      const rot = (sh.rot ?? 0) + (sh.vr ?? 0) * t * 3;
      const alpha = (1 - t) * (0.9 + beatEnergy * 0.1);
      const sz = sh.size * (1 - t * 0.2);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.85, sz * 0.55);
      ctx.lineTo(-sz * 0.9, sz * 0.45);
      ctx.closePath();

      const g = ctx.createLinearGradient(0, -sz, 0, sz);
      g.addColorStop(0, `rgba(235,250,255,${alpha})`);
      g.addColorStop(0.45, `rgba(160,215,255,${alpha * 0.8})`);
      g.addColorStop(1, `rgba(110,170,235,${alpha * 0.75})`);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

export function exitWater_SurfaceTension(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  const erase = smoothstep(0.2, 0.7, p);

  if (!state.initialized) {
    state.particles = [];
    const dropCount = Math.max(14, Math.floor(wordWidth / 8));
    for (let i = 0; i < dropCount; i += 1) {
      const s = cx * 0.19 + cy * 0.11 + i * 2.1;
      state.particles.push({
        x: cx - wordWidth * 0.5 + seeded01(s + 1) * wordWidth,
        y: cy - fontSize * 0.2 + seeded01(s + 2) * fontSize * 0.6,
        vx: (seeded01(s + 3) - 0.5) * 18,
        vy: 30 + seeded01(s + 4) * 65,
        size: 1.4 + seeded01(s + 5) * 2.8,
        life: 1,
        age: 0,
        type: "drop",
        delay: 0.2 + seeded01(s + 6) * 0.75,
        phase: seeded01(s + 7) * Math.PI * 2,
      });
    }
    state.initialized = true;
  }

  const maxRadius = Math.max(wordWidth, fontSize) * 1.1;
  const rippleRadius = 2 + erase * maxRadius;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (p <= 0.2) {
    ctx.fillStyle = "rgba(225,245,255,1)";
    drawWordCentered(ctx, word, cx, cy);
  } else {
    // Keep outside the ripple front; erase behind front via circular clipping.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - wordWidth, cy - fontSize * 1.4, wordWidth * 2, fontSize * 2.8);
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
    ctx.fillStyle = `rgba(225,245,255,${1 - erase * 0.9})`;
    drawWordCentered(ctx, word, cx, cy);
    ctx.restore();
  }

  if (p >= 0.2 && p <= 0.8) {
    const ringA = 0.45 * (1 - erase);
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120,200,255,${ringA})`;
    ctx.lineWidth = 2 + beatEnergy * 1.5;
    ctx.stroke();
  }

  for (let i = 0; i < state.particles.length; i += 1) {
    const d = state.particles[i];
    if (p < d.delay) continue;
    const t = clamp((p - d.delay) / (1 - d.delay), 0, 1);
    const x = d.x + d.vx * t * 0.6 + Math.sin((d.phase ?? 0) + t * 6) * 1.5;
    const y = d.y + d.vy * t + 120 * t * t;
    const a = 0.75 * (1 - t);

    if (p >= 0.35) {
      ctx.fillStyle = `rgba(145,210,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, d.size * (1 + t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function exitElectric_Disintegrate(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);

  if (!state.initialized) {
    state.particles = [];
    const count = 60;
    for (let i = 0; i < count; i += 1) {
      const s = cx * 0.07 + cy * 0.09 + i * 4.31;
      state.particles.push({
        x: cx + (seeded01(s + 1) - 0.5) * wordWidth,
        y: cy + (seeded01(s + 2) - 0.5) * fontSize,
        vx: 50 + seeded01(s + 3) * 170,
        vy: -40 + seeded01(s + 4) * 80,
        size: 1 + seeded01(s + 5),
        life: 1,
        age: 0,
        type: "spark",
        delay: 0.1 + seeded01(s + 6) * 0.4,
        phase: seeded01(s + 7) * Math.PI * 2,
      });
    }
    state.initialized = true;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (p <= 0.1) {
    const flicker = Math.sin((p / 0.1) * Math.PI * 12);
    ctx.fillStyle = `rgba(255,255,255,${0.9 - p * 2})`;
    drawWordCentered(ctx, word, cx, cy);
    ctx.fillStyle = `rgba(255,40,70,${0.45 + flicker * 0.2})`;
    drawWordCentered(ctx, word, cx - 2, cy);
    ctx.fillStyle = `rgba(60,170,255,${0.45 - flicker * 0.2})`;
    drawWordCentered(ctx, word, cx + 2, cy);
  } else {
    const wordFade = 1 - smoothstep(0.1, 0.5, p);
    ctx.fillStyle = `rgba(220,245,255,${wordFade})`;
    drawWordCentered(ctx, word, cx, cy);
  }

  const sparkPhase = smoothstep(0.1, 1, p);
  for (let i = 0; i < state.particles.length; i += 1) {
    const sp = state.particles[i];
    const t = clamp((sparkPhase - sp.delay * 0.65) / (1 - sp.delay * 0.65), 0, 1);
    if (t <= 0) continue;

    const arc = Math.sin(t * Math.PI * 2 + (sp.phase ?? 0));
    const arc2 = Math.cos(t * Math.PI * 3 + (sp.phase ?? 0) * 0.7);
    const dist = sp.vx * (0.25 + t * 0.95) * t;
    const x = sp.x + Math.cos(sp.phase ?? 0) * dist + arc2 * (8 + beatEnergy * 8) * (1 - t * 0.2);
    const y = sp.y + sp.vy * t + arc * 22 * (1 - t * 0.35);
    const alpha = (1 - t) * (0.95 + beatEnergy * 0.05);

    ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(100,245,255,${alpha})`;
    ctx.fillRect(x, y, 1 + sp.size, 1 + sp.size);
  }

  ctx.restore();
}

export function exitSmoke_Dissolve(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  if (!state.initialized) {
    state.particles = [];
    const count = Math.max(18, Math.floor(wordWidth / 7));
    for (let i = 0; i < count; i += 1) {
      const s = cx * 0.03 + cy * 0.05 + i * 1.87;
      const gray = 120 + Math.floor(seeded01(s + 1) * 80);
      state.particles.push({
        x: cx + (seeded01(s + 2) - 0.5) * wordWidth,
        y: cy + (seeded01(s + 3) - 0.5) * fontSize * 0.7,
        vx: (seeded01(s + 4) - 0.5) * 25,
        vy: -(18 + seeded01(s + 5) * 38),
        size: 3 + seeded01(s + 6) * 10,
        life: gray,
        age: 0,
        type: "wisp",
        delay: seeded01(s + 7) * 0.4,
        phase: seeded01(s + 8) * Math.PI * 2,
      });
    }
    state.initialized = true;
  }

  const wordFade = 1 - smoothstep(0, 0.7, p);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(0, -p * 16);
  ctx.filter = `blur(${Math.min(6, p * 8)}px)`;
  ctx.fillStyle = `rgba(165,165,165,${wordFade})`;
  drawWordCentered(ctx, word, cx, cy);
  ctx.restore();

  for (let i = 0; i < state.particles.length; i += 1) {
    const w = state.particles[i];
    const t = clamp((p - w.delay) / (1 - w.delay), 0, 1);
    if (t <= 0) continue;

    const x = w.x + w.vx * t + Math.sin((w.phase ?? 0) + t * 5.5) * 10;
    const y = w.y + w.vy * t - t * 18;
    const r = w.size * (1 + t * 1.4);
    const alpha = (1 - t) * 0.38;
    const gray = Math.floor(w.life);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, `rgba(${gray},${gray},${gray},${alpha * (0.8 + beatEnergy * 0.2)})`);
    g.addColorStop(1, `rgba(${gray},${gray},${gray},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function exitLight_Radiate(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  const rings = 4;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < rings; i += 1) {
    const phase = i * 0.25;
    const rp = clamp((p - phase) / (1 - phase), 0, 1);
    const rx = wordWidth * (0.45 + rp * 1.15);
    const ry = fontSize * (0.35 + rp * 0.9);
    const alpha = (1 - rp) * 0.55;
    if (rp <= 0) continue;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,245,220,${alpha})`;
    ctx.lineWidth = 2 + (1 - rp) * 1.2;
    ctx.stroke();
  }

  const bloom = 1 - p * 0.8;
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(wordWidth, fontSize) * (0.6 + p));
  bg.addColorStop(0, `rgba(255,245,220,${bloom * (0.4 + beatEnergy * 0.2)})`);
  bg.addColorStop(1, "rgba(255,245,220,0)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(wordWidth, fontSize) * (0.5 + p), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255,245,220,${1 - p})`;
  drawWordCentered(ctx, word, cx, cy);
  ctx.restore();
}

export function exitVoid_Abyss(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);
  const tendrils = Math.max(8, Math.floor(wordWidth / 10));

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < tendrils; i += 1) {
    const s = cx * 0.21 + cy * 0.17 + i * 3.7;
    const a = (i / tendrils) * Math.PI * 2;
    const len = (30 + seeded01(s + 1) * 90) * p;
    const c1 = len * (0.35 + seeded01(s + 2) * 0.35);
    const c2 = len * (0.65 + seeded01(s + 3) * 0.25);
    const wobble = Math.sin(p * 8 + i) * (10 + beatEnergy * 10);

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * fontSize * 0.15, cy + Math.sin(a) * fontSize * 0.1);
    ctx.bezierCurveTo(
      cx + Math.cos(a + 0.3) * c1,
      cy + Math.sin(a - 0.2) * c1,
      cx + Math.cos(a + wobble * 0.01) * c2,
      cy + Math.sin(a - wobble * 0.012) * c2,
      cx + Math.cos(a) * len,
      cy + Math.sin(a) * len,
    );
    ctx.strokeStyle = `rgba(32,18,46,${0.82 - p * 0.3})`;
    ctx.lineWidth = 1.5 + (1 - p) * 1.8;
    ctx.stroke();
  }

  // Fade toward darkness (not transparency).
  ctx.fillStyle = `rgba(12,6,20,${p * 0.88})`;
  drawWordCentered(ctx, word, cx, cy);
  ctx.restore();
}

export function exitMetal_Chrome(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);

  if (!state.initialized) {
    state.particles = [];
    const count = Math.max(14, Math.floor(wordWidth / 6));
    for (let i = 0; i < count; i += 1) {
      const s = cx * 0.23 + cy * 0.09 + i * 1.97;
      state.particles.push({
        x: cx - wordWidth * 0.5 + seeded01(s + 1) * wordWidth,
        y: cy - fontSize * 0.45 + seeded01(s + 2) * fontSize * 0.9,
        vx: (seeded01(s + 3) - 0.5) * 70,
        vy: 35 + seeded01(s + 4) * 120,
        vr: (seeded01(s + 5) - 0.5) * 9,
        rot: seeded01(s + 6) * Math.PI * 2,
        size: 3 + seeded01(s + 7) * 7,
        life: 1,
        age: 0,
        type: "metal-shard",
        delay: 0.3 + seeded01(s + 8) * 0.45,
        phase: seeded01(s + 9),
      });
    }
    state.initialized = true;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const sweepP = smoothstep(0, 0.3, p);
  const baseAlpha = 1 - smoothstep(0.3, 0.85, p);
  const chrome = ctx.createLinearGradient(cx - wordWidth * 0.6, cy, cx + wordWidth * 0.6, cy);
  chrome.addColorStop(0, `rgba(120,130,145,${baseAlpha})`);
  chrome.addColorStop(clamp(sweepP - 0.12, 0, 1), `rgba(190,200,215,${baseAlpha})`);
  chrome.addColorStop(clamp(sweepP, 0, 1), `rgba(255,255,255,${baseAlpha})`);
  chrome.addColorStop(clamp(sweepP + 0.08, 0, 1), `rgba(190,200,215,${baseAlpha})`);
  chrome.addColorStop(1, `rgba(110,120,138,${baseAlpha})`);
  ctx.fillStyle = chrome;
  drawWordCentered(ctx, word, cx, cy);

  const shardLocal = smoothstep(0.3, 1, p);
  for (let i = 0; i < state.particles.length; i += 1) {
    const m = state.particles[i];
    const t = clamp((shardLocal - (m.delay - 0.3)) / (1 - (m.delay - 0.3)), 0, 1);
    if (t <= 0) continue;
    const x = m.x + m.vx * t;
    const y = m.y + m.vy * t + 220 * t * t;
    const rot = (m.rot ?? 0) + (m.vr ?? 0) * t;
    const light = 0.35 + (Math.sin(t * 14 + (m.phase ?? 0) * 8) + 1) * 0.3 + beatEnergy * 0.1;
    const alpha = 1 - t;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = `rgba(${Math.floor(170 + light * 65)},${Math.floor(175 + light * 60)},${Math.floor(185 + light * 55)},${alpha})`;
    ctx.fillRect(-m.size * 0.65, -m.size * 0.4, m.size * 1.3, m.size * 0.8);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.65})`;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-m.size * 0.65, -m.size * 0.4, m.size * 1.3, m.size * 0.8);
    ctx.restore();
  }

  ctx.restore();
}

export function exitCosmic_Pulsar(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  const p = clamp(exitProgress, 0, 1);

  if (!state.initialized) {
    state.particles = [];
    const count = 36;
    for (let i = 0; i < count; i += 1) {
      const s = cx * 0.15 + cy * 0.04 + i * 2.67;
      state.particles.push({
        x: cx,
        y: cy,
        vx: 35 + seeded01(s + 1) * 90,
        vy: 35 + seeded01(s + 2) * 80,
        size: 1 + seeded01(s + 3) * 2.2,
        life: 1,
        age: 0,
        type: "stardust",
        delay: seeded01(s + 4) * 0.45,
        phase: seeded01(s + 5) * Math.PI * 2,
      });
    }
    state.initialized = true;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const ringCount = 4;
  for (let i = 0; i < ringCount; i += 1) {
    const rp = clamp((p - i * 0.12) / (1 - i * 0.12), 0, 1);
    if (rp <= 0) continue;
    const radius = Math.max(wordWidth, fontSize) * (0.3 + rp * 2.2);
    const alpha = (1 - rp) * 0.65;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,100,255,${alpha})`;
    ctx.lineWidth = 2 + (1 - rp) * 1.5;
    ctx.stroke();
  }

  for (let i = 0; i < state.particles.length; i += 1) {
    const st = state.particles[i];
    const t = clamp((p - st.delay) / (1 - st.delay), 0, 1);
    if (t <= 0) continue;
    const orbit = (1 - t) * 0.55;
    const theta = (st.phase ?? 0) + t * (4.5 + orbit * 10);
    const r = (12 + i * 0.6) * orbit + st.vx * t;
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * (r * 0.75) + st.vy * t * 0.2;
    const alpha = (1 - t) * 0.8;

    ctx.fillStyle = `rgba(${210 + (i % 45)},${160 + (i % 30)},255,${alpha * (0.85 + beatEnergy * 0.15)})`;
    ctx.beginPath();
    ctx.arc(x, y, st.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = `rgba(220,190,255,${1 - p})`;
  drawWordCentered(ctx, word, cx, cy);
  ctx.restore();
}

export function drawElementalExit(
  ctx: CanvasRenderingContext2D,
  elementalClass: string,
  word: string,
  cx: number,
  cy: number,
  fontSize: number,
  wordWidth: number,
  exitProgress: number,
  state: ElementalExitState,
  beatEnergy: number,
): void {
  switch (elementalClass.toUpperCase()) {
    case "FIRE":
      return exitFire_Melt(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "ICE":
    case "FROST":
      return exitIce_Shatter(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "WATER":
    case "RAIN":
      return exitWater_SurfaceTension(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "ELECTRIC":
    case "NEON":
      return exitElectric_Disintegrate(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "SMOKE":
      return exitSmoke_Dissolve(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "LIGHT":
      return exitLight_Radiate(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "VOID":
      return exitVoid_Abyss(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "METAL":
      return exitMetal_Chrome(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    case "COSMIC":
      return exitCosmic_Pulsar(ctx, word, cx, cy, fontSize, wordWidth, exitProgress, state, beatEnergy);
    default:
      return;
  }
}
