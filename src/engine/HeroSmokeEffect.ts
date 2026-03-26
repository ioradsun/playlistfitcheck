/**
 * HeroSmokeEffect — Always-on palette-colored flame wisps rising from hero words.
 *
 * TIMING: Flames rise SLOWLY and linger near the word. They hover, grow, then
 * gently drift upward. This is the key difference from typical particles —
 * they accumulate around the word rather than streaming away.
 *
 * Behaviors:
 * - Intensity RAMPS while phrase is active: 30% → 100% over ~2s (ease-out)
 * - DRAINS on phrase exit: particles decay 8x faster when no hero chunks visible
 *
 * Emphasis tiers (1–5) scale spawn rate, opacity, and particle size.
 * Draws BEFORE text so words stay crisp on top.
 * Disabled at quality tier 3. Reduced at tier 2.
 */

const MAX_PARTICLES = 150;

const SPAWN_INTERVAL: Record<number, number> = {
  1: 6, 2: 4, 3: 2, 4: 1, 5: 1,
};

const SPAWN_COUNT: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 3, 5: 4,
};

const BASE_SIZE: Record<number, number> = {
  1: 5, 2: 7, 3: 9, 4: 12, 5: 15,
};

const BASE_OPACITY: Record<number, number> = {
  1: 0.10, 2: 0.15, 3: 0.22, 4: 0.28, 5: 0.35,
};

const RAMP_DURATION = 2.0;
const RAMP_FLOOR = 0.3;
const DRAIN_SPEED = 8;

interface FlameParticle {
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
  wobbleSpeed: number;
  wobblePhase: number;
  stretch: number;
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

function computeRamp(phraseAgeSec: number): number {
  if (phraseAgeSec < 0) return 0;
  const t = Math.min(1, phraseAgeSec / RAMP_DURATION);
  return RAMP_FLOOR + (1 - RAMP_FLOOR) * Math.pow(t, 0.7);
}

/**
 * Draw a flame-shaped bezier path.
 * Origin (x, y) is the flame BASE (bottom center). Flame rises upward.
 * w = half-width at the widest bulge, h = total height tip-to-base.
 * wobble shifts the tip left/right for flicker.
 */
function drawFlamePath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  wobble: number,
): void {
  const tipY = y - h;
  const bulgeY = y - h * 0.35;
  const wobX = Math.sin(wobble) * w * 0.3;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x + w * 0.6, y - h * 0.1,
    x + w * 1.1, bulgeY - h * 0.05,
    x + w * 0.45 + wobX * 0.5, bulgeY,
  );
  ctx.bezierCurveTo(
    x + w * 0.6 + wobX, y - h * 0.65,
    x + w * 0.15 + wobX, tipY + h * 0.08,
    x + wobX * 0.7, tipY,
  );
  ctx.bezierCurveTo(
    x - w * 0.15 + wobX, tipY + h * 0.08,
    x - w * 0.6 + wobX, y - h * 0.65,
    x - w * 0.45 + wobX * 0.5, bulgeY,
  );
  ctx.bezierCurveTo(
    x - w * 1.1, bulgeY - h * 0.05,
    x - w * 0.6, y - h * 0.1,
    x, y,
  );
  ctx.closePath();
}

export class HeroSmokeEffect {
  private _particles: FlameParticle[] = [];
  private _frameCount = 0;
  private _draining = false;

  update(
    chunks: ChunkLike[],
    palette: string[],
    qualityTier: number,
    phraseAgeSec: number,
  ): void {
    this._frameCount++;

    let anyHeroVisible = false;
    for (const chunk of chunks) {
      if (chunk.visible && (chunk.alpha ?? 1) > 0.3 && chunk.isHeroWord) {
        anyHeroVisible = true;
        break;
      }
    }
    this._draining = !anyHeroVisible;

    // ── Age existing particles ──
    // TIMING: very slow rise, gentle drift, long life.
    // Flames hover and accumulate near the word rather than streaming away.
    const drainMult = this._draining ? DRAIN_SPEED : 1;
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.001;                                                    // almost no upward acceleration — drift, don't rush
      p.vx *= 0.998;                                                    // very light horizontal drag
      p.vx += Math.sin(this._frameCount * 0.02 + p.wobblePhase) * 0.01; // gentle meandering
      p.size += 0.15;                                                    // grow to fill space near the word
      p.life -= drainMult / (p.maxLife * 60);
      if (p.life <= 0 || p.y < -30) {
        this._particles.splice(i, 1);
      }
    }

    // ── Spawn ──
    if (this._draining) return;
    if (this._particles.length >= MAX_PARTICLES) return;

    const ramp = computeRamp(phraseAgeSec);
    if (ramp < 0.01) return;

    const tierMult = qualityTier >= 2 ? 2 : 1;
    const accent = palette[1] || palette[0] || '#a855f7';
    const secondary = palette[0] || palette[1] || '#ec4899';
    const accentRgb = hexToRgb(accent);
    const secondaryRgb = hexToRgb(secondary);

    for (const chunk of chunks) {
      if (!chunk.visible || (chunk.alpha ?? 1) < 0.3) continue;
      if (!chunk.isHeroWord) continue;

      const emphasis = Math.max(1, Math.min(5, chunk.emphasisLevel ?? 1));
      const rawInterval = SPAWN_INTERVAL[emphasis] ?? 4;
      const interval = Math.max(1, Math.round(rawInterval * tierMult / ramp));
      if (this._frameCount % interval !== 0) continue;
      if (this._particles.length >= MAX_PARTICLES) break;

      const cx = chunk.x ?? 0;
      const cy = chunk.y ?? 0;
      const fontSize = chunk.fontSize ?? 36;
      const textW = fontSize * (chunk.text?.length ?? 3) * 0.45 * (chunk.scaleX ?? 1);
      const count = Math.min(SPAWN_COUNT[emphasis] ?? 1, MAX_PARTICLES - this._particles.length);

      for (let i = 0; i < count; i++) {
        const baseSize = BASE_SIZE[emphasis] ?? 5;
        const maxLife = 2.0 + Math.random() * 2.0;                      // 2–4 seconds — long hang time
        const useAccent = Math.random() < 0.7;
        const rgb = useAccent ? accentRgb : secondaryRgb;

        this._particles.push({
          x: cx + (Math.random() - 0.5) * textW,
          y: cy + fontSize * 0.1,                                        // spawn just below word center
          vx: (Math.random() - 0.5) * 0.15,                             // very slow horizontal drift
          vy: -0.08 - Math.random() * 0.12,                              // SLOW rise — hover near the word
          size: baseSize * (0.5 + Math.random() * 0.5) * ramp,
          maxSize: baseSize * 3.0,
          life: 1.0,
          maxLife,
          opacity: (BASE_OPACITY[emphasis] ?? 0.1) * (0.8 + Math.random() * 0.4) * ramp,
          r: rgb[0],
          g: rgb[1],
          b: rgb[2],
          wobbleSpeed: 1.5 + Math.random() * 3,                          // slower wobble — languid flicker
          wobblePhase: Math.random() * Math.PI * 2,
          stretch: 1.6 + Math.random() * 0.8,
        });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this._particles.length === 0) return;

    const t = this._frameCount * 0.04;

    for (const p of this._particles) {
      const fadeIn = Math.min(1, (1 - p.life) * 4);
      const fadeOut = Math.pow(p.life, 1.5);                             // softer fadeout — stays visible longer before fading
      const alpha = p.opacity * fadeIn * fadeOut;
      if (alpha < 0.003) continue;

      const sz = Math.min(p.size, p.maxSize);
      const flameW = sz;
      const flameH = sz * p.stretch;
      const wobble = Math.sin(t * p.wobbleSpeed + p.wobblePhase) * (0.4 + (1 - p.life) * 0.6);
      const col = `rgb(${p.r},${p.g},${p.b})`;

      // Layer 1: Outer soft halo flame
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = col;
      drawFlamePath(ctx, p.x, p.y + flameH * 0.1, flameW * 2.4, flameH * 2.0, wobble * 0.6);
      ctx.fill();

      // Layer 2: Core flame
      ctx.globalAlpha = alpha * 0.85;
      drawFlamePath(ctx, p.x, p.y, flameW, flameH, wobble);
      ctx.fill();

      // Layer 3: Bright inner core (lighter tint)
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = `rgb(${Math.min(255, p.r + 60)},${Math.min(255, p.g + 60)},${Math.min(255, p.b + 60)})`;
      drawFlamePath(ctx, p.x, p.y + flameH * 0.2, flameW * 0.4, flameH * 0.5, wobble * 1.3);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  reset(): void {
    this._particles = [];
    this._frameCount = 0;
    this._draining = false;
  }
}
