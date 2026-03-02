/**
 * CameraRig — spring-damped virtual camera for cinematic Canvas 2D rendering.
 *
 * Responsibilities:
 *   - Smooth phrase-following with look-ahead
 *   - Hit impulses (punch zoom, shake, reframe snap)
 *   - Beat-synced micro sway (dance motion)
 *   - Parallax transform output for depth layers
 *   - Hard constraints to prevent nausea (max speed, max rotation, etc.)
 *
 * Design rules:
 *   - ZERO allocations per frame (all state is pre-allocated floats)
 *   - One update() call per tick, one getTransform() per layer
 *   - All motion is spring-damped (no lerp jumps)
 *   - Hit impulses are additive and decay independently
 *
 * Usage:
 *   camera.update(deltaMs, beatState, phraseAnchor);
 *   camera.applyTransform(ctx, 'far');   // parallax layer
 *   camera.applyTransform(ctx, 'mid');
 *   camera.applyTransform(ctx, 'near');
 *   camera.resetTransform(ctx);          // for screen-space text
 */

import type { BeatState } from './BeatConductor';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface CameraConfig {
  // Spring physics
  followSmoothing: number;    // 0-1, lower = stiffer follow (0.08 default)
  zoomSmoothing: number;      // 0-1, lower = stiffer zoom (0.05 default)
  rotSmoothing: number;       // 0-1, lower = stiffer rotation (0.03 default)

  // Look-ahead
  lookAheadPx: number;        // pixels ahead in phrase motion direction

  // Limits (hard constraints)
  maxPanSpeed: number;        // pixels/sec cap
  maxZoom: number;            // max zoom factor
  minZoom: number;            // min zoom factor
  maxRotation: number;        // radians cap (keep small! ~0.015)

  // Hit impulse magnitudes
  punchZoomAmount: number;    // zoom bump on hit (0.03 default)
  shakeAmplitude: number;     // pixels of shake on hit
  reframeSnap: number;        // pixels of reframe nudge toward phrase

  // Beat sway
  swayAmplitudeX: number;    // pixels of horizontal sway
  swayAmplitudeY: number;    // pixels of vertical sway
  swayRotAmplitude: number;  // radians of rotational sway

  // Parallax factors (how much each layer moves relative to camera)
  parallaxFar: number;       // 0.3 = 30% of camera motion
  parallaxMid: number;       // 0.6 = 60%
  parallaxNear: number;      // 1.0 = 100% (foreground matches camera)
}

/** Phrase anchor point — where the camera should "look" */
export interface PhraseAnchor {
  x: number;       // center of phrase in canvas space
  y: number;
  velocityX?: number;  // estimated motion direction (for look-ahead)
  velocityY?: number;
}

// ──────────────────────────────────────────────────────────────
// Section Presets (rigs)
// ──────────────────────────────────────────────────────────────

export type SectionRigName = 'verse' | 'chorus' | 'bridge' | 'drop' | 'intro' | 'outro';

const SECTION_RIGS: Record<SectionRigName, Partial<CameraConfig>> = {
  verse: {
    followSmoothing: 0.06,
    punchZoomAmount: 0.015,
    shakeAmplitude: 1.5,
    swayAmplitudeX: 4,
    swayAmplitudeY: 2,
    swayRotAmplitude: 0.003,
  },
  chorus: {
    followSmoothing: 0.10,
    punchZoomAmount: 0.035,
    shakeAmplitude: 4,
    swayAmplitudeX: 8,
    swayAmplitudeY: 4,
    swayRotAmplitude: 0.008,
  },
  bridge: {
    followSmoothing: 0.04,
    punchZoomAmount: 0.02,
    shakeAmplitude: 2,
    swayAmplitudeX: 6,
    swayAmplitudeY: 3,
    swayRotAmplitude: 0.005,
  },
  drop: {
    followSmoothing: 0.14,
    punchZoomAmount: 0.05,
    shakeAmplitude: 6,
    swayAmplitudeX: 10,
    swayAmplitudeY: 5,
    swayRotAmplitude: 0.012,
  },
  intro: {
    followSmoothing: 0.03,
    punchZoomAmount: 0.01,
    shakeAmplitude: 1,
    swayAmplitudeX: 3,
    swayAmplitudeY: 1.5,
    swayRotAmplitude: 0.002,
  },
  outro: {
    followSmoothing: 0.03,
    punchZoomAmount: 0.01,
    shakeAmplitude: 1,
    swayAmplitudeX: 3,
    swayAmplitudeY: 1.5,
    swayRotAmplitude: 0.002,
  },
};

// ──────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  followSmoothing: 0.08,
  zoomSmoothing: 0.05,
  rotSmoothing: 0.03,
  lookAheadPx: 30,
  maxPanSpeed: 400,
  maxZoom: 1.15,
  minZoom: 0.92,
  maxRotation: 0.015,
  punchZoomAmount: 0.03,
  shakeAmplitude: 3,
  reframeSnap: 8,
  swayAmplitudeX: 6,
  swayAmplitudeY: 3,
  swayRotAmplitude: 0.005,
  parallaxFar: 0.3,
  parallaxMid: 0.6,
  parallaxNear: 1.0,
};

// ──────────────────────────────────────────────────────────────
// Hit decay constants — base rates at 60fps, dt-compensated via Math.pow(rate, dt)
// ──────────────────────────────────────────────────────────────

const SHAKE_DECAY_60 = 0.88;       // per-frame at 60fps
const PUNCH_ZOOM_DECAY_60 = 0.92;  // per-frame at 60fps
const REFRAME_DECAY_60 = 0.90;     // per-frame at 60fps

// ──────────────────────────────────────────────────────────────
// CameraRig class
// ──────────────────────────────────────────────────────────────

export class CameraRig {
  // Current state (the "actual" camera position)
  private x = 0;
  private y = 0;
  private zoom = 1;
  private rot = 0;

  // Target state (where the camera wants to be)
  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private targetRot = 0;

  // Velocity (for speed capping)
  private vx = 0;
  private vy = 0;

  // Hit impulse accumulators (additive, decaying)
  private shakeX = 0;
  private shakeY = 0;
  private punchZoom = 0;
  private reframeX = 0;
  private reframeY = 0;

  // Beat sway state
  private swayPhase = 0;

  // Canvas dimensions (for centering)
  private canvasW = 960;
  private canvasH = 540;

  // Active config (blended from default + section preset)
  private config: CameraConfig;
  private activeRig: SectionRigName = 'verse';

  // Previous hit strength (for edge detection)
  private prevHitStrength = 0;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ──────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────

  /** Call once when canvas resizes */
  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  /** Switch section preset (smooth transition via spring damping) */
  setSection(section: SectionRigName): void {
    if (section === this.activeRig) return;
    this.activeRig = section;
    const preset = SECTION_RIGS[section] ?? {};
    // Blend preset over defaults (not over previous preset — clean slate)
    this.config = { ...DEFAULT_CONFIG, ...preset };
  }

  /** Main update — call once per tick */
  update(deltaMs: number, beatState: BeatState | null, anchor?: PhraseAnchor | null): void {
    const dt = Math.min(deltaMs, 33.33) / 16.67; // normalize to 60fps (dt=1 at 60fps)
    const cfg = this.config;

    // ─── 1. Phrase following ───
    if (anchor) {
      const lookX = (anchor.velocityX ?? 0) * cfg.lookAheadPx;
      const lookY = (anchor.velocityY ?? 0) * cfg.lookAheadPx;
      // Target is phrase anchor + look-ahead, relative to canvas center
      this.targetX = (anchor.x - this.canvasW * 0.5) * 0.3 + lookX;
      this.targetY = (anchor.y - this.canvasH * 0.5) * 0.3 + lookY;
    }

    // ─── 2. Beat sway (predictable dance motion) ───
    if (beatState) {
      const phase = beatState.phase;
      const intensity = beatState.energy; // V2: continuous energy drives sway amplitude
      const sway = Math.sin(phase * Math.PI * 2);
      const swayY = Math.cos(phase * Math.PI * 2 + 0.5); // slightly offset Y

      this.targetX += sway * cfg.swayAmplitudeX * intensity;
      this.targetY += swayY * cfg.swayAmplitudeY * intensity;
      this.targetRot = sway * cfg.swayRotAmplitude * intensity;
    }

    // ─── 3. Hit impulses (violent but brief) ───
    if (beatState && beatState.hitStrength > 0.1) {
      // Edge detect: only trigger on rising edge
      const isNewHit = beatState.hitStrength > this.prevHitStrength + 0.05;

      if (isNewHit) {
        const h = beatState.hitStrength;
        const isBass = beatState.hitType === 'bass';

        // Punch zoom: quick zoom-in
        this.punchZoom += h * cfg.punchZoomAmount * (isBass ? 1.5 : 1.0);

        // Shake: random direction, short
        const angle = Math.random() * Math.PI * 2;
        this.shakeX += Math.cos(angle) * h * cfg.shakeAmplitude * (isBass ? 1.3 : 1.0);
        this.shakeY += Math.sin(angle) * h * cfg.shakeAmplitude * (isBass ? 1.3 : 1.0);

        // Reframe snap: nudge toward phrase anchor
        if (anchor) {
          const dx = (anchor.x - this.canvasW * 0.5) - this.x;
          const dy = (anchor.y - this.canvasH * 0.5) - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.reframeX += (dx / dist) * h * cfg.reframeSnap;
          this.reframeY += (dy / dist) * h * cfg.reframeSnap;
        }
      }
    }
    this.prevHitStrength = beatState?.hitStrength ?? 0;

    // ─── 4. Decay impulses (dt-compensated for frame-rate independence) ───
    const shakeMul = Math.pow(SHAKE_DECAY_60, dt);
    const punchMul = Math.pow(PUNCH_ZOOM_DECAY_60, dt);
    const reframeMul = Math.pow(REFRAME_DECAY_60, dt);
    this.shakeX *= shakeMul;
    this.shakeY *= shakeMul;
    this.punchZoom *= punchMul;
    this.reframeX *= reframeMul;
    this.reframeY *= reframeMul;

    // Kill tiny residuals (avoid float drift)
    if (Math.abs(this.shakeX) < 0.01) this.shakeX = 0;
    if (Math.abs(this.shakeY) < 0.01) this.shakeY = 0;
    if (Math.abs(this.punchZoom) < 0.0001) this.punchZoom = 0;
    if (Math.abs(this.reframeX) < 0.01) this.reframeX = 0;
    if (Math.abs(this.reframeY) < 0.01) this.reframeY = 0;

    // ─── 5. Spring damping toward target ───
    const followAlpha = 1 - Math.pow(1 - cfg.followSmoothing, dt);
    const zoomAlpha = 1 - Math.pow(1 - cfg.zoomSmoothing, dt);
    const rotAlpha = 1 - Math.pow(1 - cfg.rotSmoothing, dt);

    // Compute new velocity
    const newVx = (this.targetX + this.reframeX - this.x) * followAlpha;
    const newVy = (this.targetY + this.reframeY - this.y) * followAlpha;

    // Speed cap
    const speed = Math.sqrt(newVx * newVx + newVy * newVy);
    const maxSpeedPerFrame = cfg.maxPanSpeed * (deltaMs / 1000);
    if (speed > maxSpeedPerFrame && speed > 0) {
      const scale = maxSpeedPerFrame / speed;
      this.vx = newVx * scale;
      this.vy = newVy * scale;
    } else {
      this.vx = newVx;
      this.vy = newVy;
    }

    // Apply
    this.x += this.vx;
    this.y += this.vy;

    // Zoom: target is 1.0 + punch
    this.targetZoom = 1.0 + this.punchZoom;
    this.zoom += (this.targetZoom - this.zoom) * zoomAlpha;

    // Clamp zoom
    this.zoom = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, this.zoom));

    // Rotation
    this.rot += (this.targetRot - this.rot) * rotAlpha;
    this.rot = Math.max(-cfg.maxRotation, Math.min(cfg.maxRotation, this.rot));
  }

  /**
   * Apply camera transform to a canvas context for a specific depth layer.
   * Saves context state — call resetTransform() after drawing.
   *
   * @param ctx - Canvas 2D context
   * @param depth - 'far' | 'mid' | 'near' — controls parallax amount
   */
  applyTransform(ctx: CanvasRenderingContext2D, depth: 'far' | 'mid' | 'near'): void {
    const cfg = this.config;
    const parallax = depth === 'far' ? cfg.parallaxFar
      : depth === 'mid' ? cfg.parallaxMid
      : cfg.parallaxNear;

    const tx = -(this.x + this.shakeX) * parallax;
    const ty = -(this.y + this.shakeY) * parallax;
    const s = this.zoom;
    const r = this.rot * parallax; // rotation also parallaxed

    const cx = this.canvasW * 0.5;
    const cy = this.canvasH * 0.5;

    ctx.save();
    // Translate to center, apply zoom + rotation, translate back, apply pan
    ctx.translate(cx, cy);
    ctx.rotate(r);
    ctx.scale(s, s);
    ctx.translate(-cx + tx, -cy + ty);
  }

  /** Reset transform after drawing a layer */
  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /** Hard reset (seek, song change) */
  reset(): void {
    this.x = this.y = 0;
    this.zoom = 1;
    this.rot = 0;
    this.targetX = this.targetY = 0;
    this.targetZoom = 1;
    this.targetRot = 0;
    this.vx = this.vy = 0;
    this.shakeX = this.shakeY = 0;
    this.punchZoom = 0;
    this.reframeX = this.reframeY = 0;
    this.prevHitStrength = 0;
  }
}
