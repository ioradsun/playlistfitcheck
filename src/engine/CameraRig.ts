/**
 * CameraRig — minimal depth-only camera for lyric video rendering.
 *
 * PHILOSOPHY: Do almost nothing. The only camera motion is:
 *   1. Gentle zoom push on emph 5 hero words (~5 per song)
 *   2. That's it. No breathing, no shake, no energy curves.
 * Less is more. Let the text animations do the work.
 */

import type { BeatState } from './BeatConductor';

export interface CameraConfig {
  wideZoom: number;
  heroZoom: number;
  climaxZoom: number;
  pushInSpeed: number;
  releaseSpeed: number;
  holdMs: number;
  climaxHoldMs: number;
}

export interface SubjectFocus {
  x: number;
  y: number;
  heroActive: boolean;
  emphasisLevel: number;
  isClimax: boolean;
  vocalActive: boolean;
  heroApproaching?: boolean;
}

export interface SubjectTransform {
  zoom: number;
  proximity: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  shakeX: number;
  shakeY: number;
}

export interface PhraseAnchor {
  x: number;
  y: number;
  velocityX?: number;
  velocityY?: number;
}

export type SectionRigName = 'verse' | 'chorus' | 'bridge' | 'drop' | 'intro' | 'outro';

const DEFAULT_CONFIG: CameraConfig = {
  wideZoom: 1.0,
  heroZoom: 1.08,
  climaxZoom: 1.15,
  pushInSpeed: 0.06,
  releaseSpeed: 0.02,
  holdMs: 1000,
  climaxHoldMs: 1800,
};

export class CameraRig {
  private proximity = 0.0;
  private targetProximity = 0.0;
  private holdTimer = 0;
  private config: CameraConfig;
  private prevHeroActive = false;
  private canvasW = 960;
  private canvasH = 540;
  private _cachedTransform: SubjectTransform | null = null;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  setBPM(_bpm: number): void {}
  setSection(_section: SectionRigName): void {}
  setEnergy(_rawEnergy: number): void {}

  update(
    deltaMs: number,
    _beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const dt = Math.min(deltaMs, 33.33) / 16.67;
    const cfg = this.config;
    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;

    // Only respond to emph 5 hero words
    if (sf) {
      if (sf.isClimax && sf.heroActive && sf.emphasisLevel >= 5) {
        this.targetProximity = 1.0;
        this.holdTimer = cfg.climaxHoldMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5 && !this.prevHeroActive) {
        this.targetProximity = 0.7;
        this.holdTimer = cfg.holdMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5) {
        // Sustain during hold
      } else {
        if (this.holdTimer <= 0) this.targetProximity = 0.0;
      }
    } else {
      if (this.holdTimer <= 0) this.targetProximity = 0.0;
    }

    if (this.holdTimer > 0) this.holdTimer = Math.max(0, this.holdTimer - deltaMs);
    this.prevHeroActive = sf?.heroActive ?? false;

    // Smooth proximity
    const pushingIn = this.targetProximity > this.proximity;
    const speed = pushingIn ? cfg.pushInSpeed : cfg.releaseSpeed;
    const alpha = 1 - Math.pow(1 - speed, dt);
    this.proximity += (this.targetProximity - this.proximity) * alpha;
    this.proximity = Math.max(0, Math.min(1, this.proximity));

    this._cachedTransform = null;
  }

  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;
    const cfg = this.config;

    // Simple lerp: 0→wide, 0.7→hero, 1.0→climax
    let zoom: number;
    if (this.proximity <= 0.7) {
      const t = this.proximity / 0.7;
      zoom = cfg.wideZoom + (cfg.heroZoom - cfg.wideZoom) * t;
    } else {
      const t = (this.proximity - 0.7) / 0.3;
      zoom = cfg.heroZoom + (cfg.climaxZoom - cfg.heroZoom) * t;
    }

    const result: SubjectTransform = {
      zoom,
      proximity: this.proximity,
      offsetX: 0, offsetY: 0, rotation: 0, shakeX: 0, shakeY: 0,
    };
    this._cachedTransform = result;
    return result;
  }

  applyTransform(ctx: CanvasRenderingContext2D, _layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    ctx.save();
    const zoom = this.getSubjectTransform().zoom;
    if (Math.abs(zoom - 1.0) > 0.001) {
      const cx = this.canvasW / 2;
      const cy = this.canvasH / 2;
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  getProximity(): number {
    return this.proximity;
  }

  reset(): void {
    this.proximity = 0.0;
    this.targetProximity = 0.0;
    this.holdTimer = 0;
    this.prevHeroActive = false;
    this._cachedTransform = null;
  }
}
