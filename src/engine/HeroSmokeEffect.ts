/**
 * HeroSmokeEffect — Always-on palette-colored smoke rising from hero words.
 *
 * Intensity scales with emphasisLevel (1–5):
 *   1–2: barely visible heat haze
 *   3:   gentle smoke
 *   4:   visible wisps
 *   5:   strong smolder
 *
 * Draws BEFORE text so words stay crisp on top.
 * Disabled at quality tier 3. Reduced at tier 2.
 */

const MAX_PARTICLES = 120;

const SPAWN_INTERVAL: Record<number, number> = {
  1: 8, 2: 5, 3: 3, 4: 2, 5: 1,
};

const SPAWN_COUNT: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 3,
};

const BASE_SIZE: Record<number, number> = {
  1: 2.5, 2: 3.5, 3: 5, 4: 7, 5: 9,
};

const BASE_OPACITY: Record<number, number> = {
  1: 0.07, 2: 0.10, 3: 0.15, 4: 0.20, 5: 0.26,
};

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  opacity: number;
  r: number;
  g: number;
  b: number;
}

interface ChunkLike {
  x?: number;
  y?: number;
  fontSize?: number;
  text?: string;
  visible: boolean;
  alpha?: number;
  isHeroWord?: boolean;
  emphasisLevel?: number;
  scaleX?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 200,
    parseInt(h.slice(2, 4), 16) || 200,
    parseInt(h.slice(4, 6), 16) || 210,
  ];
}

export class HeroSmokeEffect {
  private _particles: SmokeParticle[] = [];
  private _frameCount = 0;

  /**
   * Update: spawn new particles for visible hero words, age existing ones.
   * @param chunks — visible word chunks from the current frame
   * @param palette — active palette colors (index 1 = accent, index 0 = secondary)
   * @param qualityTier — 0-3, skip entirely at 3
   */
  update(
    chunks: ChunkLike[],
    palette: string[],
    qualityTier: number,
  ): void {
    this._frameCount++;

    // Age existing particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.003;
      p.vx *= 0.997;
      p.size += 0.12;
      p.life -= 1 / (p.maxLife * 60);
      if (p.life <= 0 || p.y < -30) {
        this._particles.splice(i, 1);
      }
    }

    // Spawn new particles for hero words
    if (this._particles.length >= MAX_PARTICLES) return;

    const tierMult = qualityTier >= 2 ? 2 : 1;
    // Palette colors for smoke: accent (index 1) 70% of the time, secondary (index 0) 30%
    const accent = palette[1] || palette[0] || '#a855f7';
    const secondary = palette[0] || palette[1] || '#ec4899';
    const accentRgb = hexToRgb(accent);
    const secondaryRgb = hexToRgb(secondary);

    for (const chunk of chunks) {
      if (!chunk.visible || (chunk.alpha ?? 1) < 0.3) continue;
      if (!chunk.isHeroWord) continue;

      const emphasis = Math.max(1, Math.min(5, chunk.emphasisLevel ?? 1));
      const interval = (SPAWN_INTERVAL[emphasis] ?? 4) * tierMult;
      if (this._frameCount % interval !== 0) continue;
      if (this._particles.length >= MAX_PARTICLES) break;

      const cx = chunk.x ?? 0;
      const cy = chunk.y ?? 0;
      const fontSize = chunk.fontSize ?? 36;
      const textW = fontSize * (chunk.text?.length ?? 3) * 0.45 * (chunk.scaleX ?? 1);
      const count = Math.min(SPAWN_COUNT[emphasis] ?? 1, MAX_PARTICLES - this._particles.length);

      for (let i = 0; i < count; i++) {
        const baseSize = BASE_SIZE[emphasis] ?? 5;
        const maxLife = 1.8 + Math.random() * 2.0;
        const useAccent = Math.random() < 0.7;
        const rgb = useAccent ? accentRgb : secondaryRgb;

        this._particles.push({
          x: cx + (Math.random() - 0.5) * textW,
          y: cy - fontSize * 0.05 + (Math.random() - 0.5) * fontSize * 0.3,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.12 - Math.random() * 0.22,
          size: baseSize * (0.5 + Math.random() * 0.5),
          maxSize: baseSize * 3.5,
          life: 1.0,
          maxLife,
          opacity: (BASE_OPACITY[emphasis] ?? 0.1) * (0.8 + Math.random() * 0.4),
          r: rgb[0],
          g: rgb[1],
          b: rgb[2],
        });
      }
    }
  }

  /**
   * Draw all smoke particles.
   * Call with ctx already in device-pixel coordinates (setTransform(dpr, 0, 0, dpr, 0, 0)).
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this._particles.length === 0) return;

    for (const p of this._particles) {
      const fadeIn = Math.min(1, (1 - p.life) * 4);
      const fadeOut = p.life * p.life;
      const alpha = p.opacity * fadeIn * fadeOut;
      if (alpha < 0.003) continue;

      const sz = Math.min(p.size, p.maxSize);
      const col = `rgb(${p.r},${p.g},${p.b})`;

      // Outer soft halo
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();

      // Hot center
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  reset(): void {
    this._particles = [];
    this._frameCount = 0;
  }
}
