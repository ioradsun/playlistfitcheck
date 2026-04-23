/**
 * renderCaches — Module-level shared render caches for LyricDancePlayer instances.
 *
 * In a feed rendering many LyricDancePlayer instances at the same viewport,
 * several caches have content that is a pure function of their inputs:
 *   - Vignette gradient canvas    → pure function of (w, h)
 *   - Grain noise frame pool      → pure function of (grainW, grainH)
 *   - Text measurement metrics    → pure function of (font, text)
 *
 * Hoisting these out of each player instance lets the whole feed share one copy,
 * saves tens of MB of canvas memory at scale, and lets a brand-new scrolled-in
 * card inherit already-warmed caches from earlier cards instead of re-baking.
 *
 * All caches are safe for concurrent read during RAF — none of the returned
 * artifacts are mutated after their first population. Cache writes happen
 * on cache miss only.
 */

// ─── Shared 1×1 measurement context for text metrics ─────────────────────────
let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  _measureCtx = c.getContext('2d');
  return _measureCtx;
}

// ─── Text metrics cache ──────────────────────────────────────────────────────
// Keyed by `${font}|${text}`. Shared across all player instances. Cleared
// globally when any new font loads (measurements shift when a fallback font
// is replaced by the real font).
export interface TextMetrics {
  width: number;
  ascent: number;
  descent: number;
}

const TEXT_METRICS_MAX = 2500;
const _textMetrics = new Map<string, TextMetrics>();

export function getSharedTextMetrics(text: string, font: string): TextMetrics {
  const key = `${font}|${text}`;
  const cached = _textMetrics.get(key);
  if (cached) return cached;

  const ctx = getMeasureCtx();
  if (!ctx) {
    // SSR / no-document fallback
    return {
      width: text.length * (parseFloat(font) || 12) * 0.55,
      ascent: (parseFloat(font) || 12) * 0.45,
      descent: (parseFloat(font) || 12) * 0.15,
    };
  }

  ctx.font = font;
  const m = ctx.measureText(text);
  const metrics: TextMetrics = {
    width: m.width,
    ascent: m.actualBoundingBoxAscent ?? (parseFloat(font) * 0.45),
    descent: m.actualBoundingBoxDescent ?? (parseFloat(font) * 0.15),
  };
  _textMetrics.set(key, metrics);

  // Bounded LRU: evict oldest on overflow. Same cap as the per-instance
  // version had; with feed-wide hit rate this will rarely fill.
  if (_textMetrics.size > TEXT_METRICS_MAX) {
    const first = _textMetrics.keys().next().value;
    if (first !== undefined) _textMetrics.delete(first);
  }
  return metrics;
}

// Global invalidation on font load. Registered once per module load.
if (typeof document !== 'undefined') {
  const fontsApi = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fontsApi && typeof fontsApi.addEventListener === 'function') {
    fontsApi.addEventListener('loadingdone', () => {
      _textMetrics.clear();
    });
  }
}

// ─── Vignette canvas cache ──────────────────────────────────────────────────
// Keyed by `${w}x${h}`. Content: a radial gradient from transparent center to
// dark edges. Alpha is NOT baked in — caller uses globalAlpha at draw time.
const VIGNETTE_MAX = 4;
const _vignetteCache = new Map<string, HTMLCanvasElement>();

export function getSharedVignette(w: number, h: number): HTMLCanvasElement | null {
  const key = `${w}x${h}`;
  const existing = _vignetteCache.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined' || w < 1 || h < 1) return null;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return null;

  const diag = Math.sqrt(w * w + h * h);
  const grad = octx.createRadialGradient(w / 2, h / 2, diag * 0.28, w / 2, h / 2, diag * 0.58);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  octx.fillStyle = grad;
  octx.fillRect(0, 0, w, h);

  _vignetteCache.set(key, off);

  // LRU cap — viewport sizes in a feed are typically 1-2 values, so this
  // rarely triggers. Evict the oldest if we overflow.
  if (_vignetteCache.size > VIGNETTE_MAX) {
    const first = _vignetteCache.keys().next().value;
    if (first !== undefined) _vignetteCache.delete(first);
  }
  return off;
}

// ─── Film grain noise pool cache ────────────────────────────────────────────
// Keyed by `${grainW}x${grainH}`. Content: N pre-rendered ImageData frames
// of random grayscale noise + a canvas of matching size to paint into. The
// caller rotates through frames per-instance (its own frame index).
export interface GrainPool {
  frames: ImageData[];
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const GRAIN_POOL_SIZE = 4;
const GRAIN_CACHE_MAX = 4;
const _grainPools = new Map<string, GrainPool>();

export function getSharedGrainPool(grainW: number, grainH: number): GrainPool | null {
  const key = `${grainW}x${grainH}`;
  const existing = _grainPools.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined' || grainW < 1 || grainH < 1) return null;

  const frames: ImageData[] = [];
  for (let p = 0; p < GRAIN_POOL_SIZE; p++) {
    const img = new ImageData(grainW, grainH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = 255;
    }
    frames.push(img);
  }

  const canvas = document.createElement('canvas');
  canvas.width = grainW;
  canvas.height = grainH;

  const pool: GrainPool = { frames, canvas, w: grainW, h: grainH };
  _grainPools.set(key, pool);

  if (_grainPools.size > GRAIN_CACHE_MAX) {
    const first = _grainPools.keys().next().value;
    if (first !== undefined) _grainPools.delete(first);
  }
  return pool;
}

export const GRAIN_FRAMES_PER_POOL = GRAIN_POOL_SIZE;
