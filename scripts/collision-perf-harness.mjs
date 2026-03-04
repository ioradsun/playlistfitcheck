#!/usr/bin/env node

const COUNTS = [200, 350, 500];
const FRAMES = 600;
const WIDTH = 1280;
const HEIGHT = 720;
const CELL_SIZE = Number(process.env.CELL_SIZE ?? 96);

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildEntities(count, seed = 42) {
  const rand = mulberry32(seed + count);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const hw = new Float32Array(count);
  const hh = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    x[i] = 30 + rand() * (WIDTH - 60);
    y[i] = 30 + rand() * (HEIGHT - 60);
    hw[i] = 12 + rand() * 38;
    hh[i] = 8 + rand() * 22;
    vx[i] = (rand() - 0.5) * 2.2;
    vy[i] = (rand() - 0.5) * 2.2;
  }
  return { x, y, hw, hh, vx, vy };
}

function runBroadPhase(state, frames) {
  const count = state.x.length;
  const cols = Math.max(1, Math.ceil(WIDTH / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(HEIGHT / CELL_SIZE));
  const cellCount = cols * rows;

  const heads = new Int32Array(cellCount);
  const stamps = new Uint32Array(cellCount);
  const next = new Int32Array(count);
  const cellX = new Int32Array(count);
  const cellY = new Int32Array(count);

  let stamp = 1;
  let pairsTotal = 0;
  let hitsTotal = 0;
  let worstMs = 0;
  let dtTotal = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const t0 = performance.now();
    stamp += 1;
    if (stamp === 0) {
      stamps.fill(0);
      stamp = 1;
    }

    for (let i = 0; i < count; i += 1) {
      const nx = state.x[i] + state.vx[i];
      const ny = state.y[i] + state.vy[i];
      state.x[i] = nx < 0 || nx > WIDTH ? state.x[i] - state.vx[i] : nx;
      state.y[i] = ny < 0 || ny > HEIGHT ? state.y[i] - state.vy[i] : ny;

      const cx = Math.max(0, Math.min(cols - 1, (state.x[i] / CELL_SIZE) | 0));
      const cy = Math.max(0, Math.min(rows - 1, (state.y[i] / CELL_SIZE) | 0));
      cellX[i] = cx;
      cellY[i] = cy;
      const cellIdx = cy * cols + cx;
      if (stamps[cellIdx] !== stamp) {
        stamps[cellIdx] = stamp;
        heads[cellIdx] = -1;
      }
      next[i] = heads[cellIdx];
      heads[cellIdx] = i;
    }

    for (let i = 0; i < count; i += 1) {
      const ax = state.x[i];
      const ay = state.y[i];
      const ahw = state.hw[i];
      const ahh = state.hh[i];
      const bcx = cellX[i];
      const bcy = cellY[i];

      for (let oy = -1; oy <= 1; oy += 1) {
        const ny = bcy + oy;
        if (ny < 0 || ny >= rows) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = bcx + ox;
          if (nx < 0 || nx >= cols) continue;
          const cellIdx = ny * cols + nx;
          if (stamps[cellIdx] !== stamp) continue;
          for (let j = heads[cellIdx]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            pairsTotal += 1;
            const overlapX = (ahw + state.hw[j]) - Math.abs(ax - state.x[j]);
            if (overlapX <= 0) continue;
            const overlapY = (ahh + state.hh[j]) - Math.abs(ay - state.y[j]);
            if (overlapY <= 0) continue;
            hitsTotal += 1;
          }
        }
      }
    }

    const dt = performance.now() - t0;
    dtTotal += dt;
    if (dt > worstMs) worstMs = dt;
  }

  return {
    avgDtMs: dtTotal / frames,
    fpsAvg: 1000 / (dtTotal / frames),
    worstDtMs: worstMs,
    pairsPerFrame: pairsTotal / frames,
    hitsPerFrame: hitsTotal / frames,
  };
}

console.log(`collision harness: cell=${CELL_SIZE}px, frames=${FRAMES}`);
for (const count of COUNTS) {
  const result = runBroadPhase(buildEntities(count), FRAMES);
  console.log(
    `${count} entities :: avgDt=${result.avgDtMs.toFixed(3)}ms | fpsAvg=${result.fpsAvg.toFixed(1)} | worstDt=${result.worstDtMs.toFixed(3)}ms | pairs/frame=${result.pairsPerFrame.toFixed(0)} | hits/frame=${result.hitsPerFrame.toFixed(0)}`,
  );
}
