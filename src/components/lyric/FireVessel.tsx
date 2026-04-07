import { useEffect, useRef } from "react";

const TIER_COLORS = {
  cold: [255, 255, 255],
  warm: [255, 140, 40],
  hot: [255, 160, 40],
  consensus: [74, 222, 128],
} as const;

const TIER_ALPHA = {
  cold: 0.12,
  warm: 0.45,
  hot: 0.85,
  consensus: 0.85,
} as const;

const MAX_PARTICLES = 24;
const MAX_OUTSIDE = 12;

type Tier = keyof typeof TIER_COLORS;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  outside: boolean;
}

interface GeometryCache {
  path: Path2D;
  tipX: number;
  tipY: number;
  spawnX0: number;
  spawnX1: number;
  spawnY0: number;
  spawnY1: number;
  bodyOffsetY: number;
  canvasHeight: number;
}

interface TierCache {
  rgb: string;
  silhouetteAlpha: number;
  fillAlphaBase: number;
  particleAlphaBase: number;
  sizeMul: number;
}

export interface FireVesselProps {
  size: number;
  tier: Tier;
  pressing: boolean;
  fillLevel: number;
  burstTrigger: number;
  active?: boolean;
}

const buildGeometry = (size: number): GeometryCache => {
  const bodyOffsetY = size * 0.4;
  const path = new Path2D();
  path.moveTo(size * 0.5, size * 0.08);
  path.bezierCurveTo(size * 0.25, size * 0.24, size * 0.2, size * 0.5, size * 0.36, size * 0.76);
  path.bezierCurveTo(size * 0.42, size * 0.9, size * 0.46, size * 0.98, size * 0.5, size * 1.0);
  path.bezierCurveTo(size * 0.54, size * 0.98, size * 0.58, size * 0.9, size * 0.64, size * 0.76);
  path.bezierCurveTo(size * 0.8, size * 0.5, size * 0.75, size * 0.24, size * 0.5, size * 0.08);
  path.closePath();

  return {
    path,
    tipX: size * 0.5,
    tipY: bodyOffsetY + size * 0.08,
    spawnX0: size * 0.34,
    spawnX1: size * 0.66,
    spawnY0: bodyOffsetY + size * 0.56,
    spawnY1: bodyOffsetY + size * 0.95,
    bodyOffsetY,
    canvasHeight: size * 1.4,
  };
};

const buildTierCache = (tier: Tier): TierCache => {
  const rgb = TIER_COLORS[tier].join(",");
  const alpha = TIER_ALPHA[tier];
  const isCold = tier === "cold";
  return {
    rgb,
    silhouetteAlpha: isCold ? 0.12 : 0.14,
    fillAlphaBase: alpha,
    particleAlphaBase: isCold ? 0.22 : 0.3,
    sizeMul: isCold ? 0.85 : tier === "warm" ? 1 : 1.08,
  };
};

export function FireVessel({ size, tier, pressing, fillLevel, burstTrigger, active = true }: FireVesselProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      decay: 0,
      size: 0,
      outside: false,
    })),
  );

  const geometryRef = useRef<GeometryCache>(buildGeometry(size));
  const tierCacheRef = useRef<TierCache>(buildTierCache(tier));

  const tierRef = useRef<Tier>(tier);
  const pressingRef = useRef(pressing);
  const fillRef = useRef(fillLevel);
  const burstRef = useRef(burstTrigger);
  const prevBurstRef = useRef(burstTrigger);

  tierRef.current = tier;
  pressingRef.current = pressing;
  fillRef.current = fillLevel;
  burstRef.current = burstTrigger;

  useEffect(() => {
    geometryRef.current = buildGeometry(size);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * 1.4 * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size * 1.4}px`;
  }, [size]);

  useEffect(() => {
    tierCacheRef.current = buildTierCache(tier);
  }, [tier]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const geometry = geometryRef.current;
    const tierCache = tierCacheRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, geometry.canvasHeight);
    if (active) return;

    ctx.save();
    ctx.translate(0, geometry.bodyOffsetY);
    ctx.fillStyle = `rgb(${tierCache.rgb})`;
    ctx.globalAlpha = tierCache.silhouetteAlpha;
    ctx.fill(geometry.path);
    ctx.restore();
  }, [size, tier, active]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spawnParticle = (outside: boolean, fill: number, outsideCount: number) => {
      if (outside && outsideCount >= MAX_OUTSIDE) return;
      const pool = particlesRef.current;
      let slot = -1;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (!pool[i].active) {
          slot = i;
          break;
        }
      }
      if (slot < 0) return;

      const particle = pool[slot];
      const geometry = geometryRef.current;
      const tierCache = tierCacheRef.current;

      particle.active = true;
      particle.outside = outside;
      if (outside) {
        const spread = 0.3 + fill * 0.35;
        particle.x = geometry.tipX;
        particle.y = geometry.tipY;
        particle.vx = (Math.random() - 0.5) * spread;
        particle.vy = -(1.2 + Math.random() * 1.2 + fill * 0.9);
        particle.life = 1;
        particle.decay = 0.03 + Math.random() * 0.03 - fill * 0.005;
        particle.size = (0.8 + Math.random() * 1.25) * tierCache.sizeMul;
      } else {
        particle.x = geometry.spawnX0 + Math.random() * (geometry.spawnX1 - geometry.spawnX0);
        particle.y = geometry.spawnY0 + Math.random() * (geometry.spawnY1 - geometry.spawnY0);
        particle.vx = (Math.random() - 0.5) * 0.12;
        particle.vy = -(0.12 + Math.random() * 0.16 + fill * 0.28);
        particle.life = 1;
        particle.decay = 0.006 + Math.random() * 0.006 + (1 - fill) * 0.002;
        particle.size = (0.7 + Math.random() * 0.9) * tierCache.sizeMul;
      }
    };

    const emitBurst = (fill: number) => {
      let outsideCount = 0;
      const pool = particlesRef.current;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (pool[i].active && pool[i].outside) outsideCount += 1;
      }
      const burstCount = Math.min(12, 6 + Math.round(fill * 6));
      for (let i = 0; i < burstCount; i += 1) {
        spawnParticle(true, fill, outsideCount);
        outsideCount += 1;
      }
    };

    let lastTime = performance.now();
    let lastRender = lastTime;

    const render = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      const step = dt / 16.6667;
      const fill = Math.max(0, Math.min(1, fillRef.current));
      const isHolding = pressingRef.current;
      const burstChanged = burstRef.current !== prevBurstRef.current;

      if (burstChanged) {
        prevBurstRef.current = burstRef.current;
        emitBurst(fill);
      }

      if (!isHolding && fill < 0.01 && now - lastRender < 33) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      lastTime = now;
      lastRender = now;

      const geometry = geometryRef.current;
      const tierCache = tierCacheRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, geometry.canvasHeight);

      const pool = particlesRef.current;
      let activeCount = 0;
      let internalCount = 0;
      let outsideCount = 0;

      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = pool[i];
        if (!p.active) continue;
        activeCount += 1;
        if (p.outside) outsideCount += 1;
        else internalCount += 1;

        p.x += p.vx * step;
        p.y += p.vy * step;
        if (p.outside) {
          p.vy += 0.08 * step;
          p.vx *= 0.995;
        } else {
          p.vx += (Math.random() - 0.5) * 0.008;
          p.vx *= 0.99;
        }

        p.life -= p.decay * step;
        if (p.life <= 0) p.active = false;
      }

      const targetInternal = isHolding ? Math.min(12, 5 + Math.round(fill * 7)) : Math.max(3, tierRef.current === "cold" ? 3 : 4);
      if (activeCount < MAX_PARTICLES && internalCount < targetInternal) {
        const toSpawn = Math.min(targetInternal - internalCount, isHolding ? 2 : 1);
        for (let i = 0; i < toSpawn; i += 1) {
          spawnParticle(false, fill, outsideCount);
        }
      }

      ctx.save();
      ctx.translate(0, geometry.bodyOffsetY);
      ctx.fillStyle = `rgb(${tierCache.rgb})`;
      ctx.globalAlpha = tierCache.silhouetteAlpha;
      ctx.fill(geometry.path);

      ctx.clip(geometry.path);
      if (fill > 0.001) {
        const fillHeight = size * Math.max(0.02, fill);
        ctx.globalAlpha = tierCache.fillAlphaBase * (0.25 + fill * 0.65);
        ctx.fillRect(0, size - fillHeight, size, fillHeight + 1);
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${tierCache.rgb})`;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = pool[i];
        if (!p.active || p.outside) continue;
        const alpha = tierCache.particleAlphaBase * p.life * (isHolding ? 0.85 + fill * 0.4 : 0.45);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y - geometry.bodyOffsetY, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = `rgb(${tierCache.rgb})`;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = pool[i];
        if (!p.active || !p.outside) continue;
        const alpha = (0.35 + fill * 0.45) * p.life;
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(render);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (animRef.current) cancelAnimationFrame(animRef.current);
      } else {
        lastTime = performance.now();
        lastRender = lastTime;
        animRef.current = requestAnimationFrame(render);
      }
    };

    animRef.current = requestAnimationFrame(render);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [size, active]);

  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        position: "relative",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: -size * 0.4,
          width: size,
          height: size * 1.4,
          pointerEvents: "none",
        }}
      />
    </span>
  );
}
