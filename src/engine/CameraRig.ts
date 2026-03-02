/**
 * CameraRig — director's virtual camera for cinematic lyric video rendering.
 *
 * ═══ DIRECTOR'S MODEL ═══
 * The camera films THE WORDS. Words are the actors. Background is the set.
 *
 * Core concept: PROXIMITY
 *   0.0 = wide shot (establishing, see the world)
 *   0.5 = medium (comfortable reading distance)
 *   0.7 = close-up (hero word, see effects/texture)
 *   1.0 = extreme close-up (climax, one word fills the frame)
 *
 * Layer transforms:
 *   'subject'    — text: FULL zoom from proximity, gentle reframe toward focus
 *   'backdrop'   — bg:   NO zoom, slight inverse drift, blur ∝ proximity
 *   'atmosphere' — sims: ~10% of subject zoom, bridges the two worlds
 *
 * Movement philosophy:
 *   - ANTICIPATE: camera starts drifting in before the hero word lands
 *   - COMMIT: smooth acceleration into close-up (fast push-in smoothing)
 *   - HOLD: stay close for emotional weight (duration ∝ emphasis)
 *   - RELEASE: ease back gradually (slow pull-out smoothing)
 *   - BREATHE: imperceptible ±1.5% zoom oscillation between moments
 */

import type { BeatState } from './BeatConductor';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface CameraConfig {
  proximitySmoothing: number;  // push-in speed (0.04)
  reframeSmoothing: number;    // reframe speed (0.06)
  rotSmoothing: number;        // rotation speed (0.03)

  wideZoom: number;            // zoom at proximity 0.0
  closeUpZoom: number;         // zoom at proximity 0.7
  extremeCloseUpZoom: number;  // zoom at proximity 1.0

  maxReframeX: number;
  maxReframeY: number;
  maxRotation: number;

  punchZoomAmount: number;
  shakeAmplitude: number;

  breathAmplitude: number;     // zoom oscillation (±0.015)
  breathCycleMs: number;       // full cycle (4000ms)
  swayAmplitudeX: number;
  swayAmplitudeY: number;
  swayRotAmplitude: number;

  backdropDriftFactor: number; // 0.05 = 5% inverse drift on backdrop
  atmosphereFactor: number;    // 0.10 = 10% of subject zoom on atmosphere

  baseHoldMs: number;
  heroHoldMs: number;
  climaxHoldMs: number;

  releaseSmoothing: number;    // pull-out speed (slow — 0.02)
}

/** What the camera should focus on this tick */
export interface SubjectFocus {
  x: number;
  y: number;
  heroActive: boolean;
  emphasisLevel: number;
  isClimax: boolean;
  vocalActive: boolean;
}

/** Transform data for the text/subject layer */
export interface SubjectTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  proximity: number;
  shakeX: number;
  shakeY: number;
}

// Legacy compat
export interface PhraseAnchor {
  x: number;
  y: number;
  velocityX?: number;
  velocityY?: number;
}

export type SectionRigName = 'verse' | 'chorus' | 'bridge' | 'drop' | 'intro' | 'outro';

// ──────────────────────────────────────────────────────────────
// Section Presets
// ──────────────────────────────────────────────────────────────

const SECTION_RIGS: Record<SectionRigName, Partial<CameraConfig>> = {
  verse: {
    punchZoomAmount: 0.008, shakeAmplitude: 1.0,
    swayAmplitudeX: 2, swayAmplitudeY: 1, swayRotAmplitude: 0.002, breathAmplitude: 0.012,
  },
  chorus: {
    punchZoomAmount: 0.020, shakeAmplitude: 2.5,
    swayAmplitudeX: 4, swayAmplitudeY: 2, swayRotAmplitude: 0.005, breathAmplitude: 0.018,
  },
  bridge: {
    punchZoomAmount: 0.012, shakeAmplitude: 1.5,
    swayAmplitudeX: 3, swayAmplitudeY: 1.5, swayRotAmplitude: 0.003, breathAmplitude: 0.015,
  },
  drop: {
    punchZoomAmount: 0.035, shakeAmplitude: 4,
    swayAmplitudeX: 5, swayAmplitudeY: 3, swayRotAmplitude: 0.008, breathAmplitude: 0.020,
  },
  intro: {
    punchZoomAmount: 0.005, shakeAmplitude: 0.5,
    swayAmplitudeX: 1.5, swayAmplitudeY: 0.8, swayRotAmplitude: 0.001, breathAmplitude: 0.010,
  },
  outro: {
    punchZoomAmount: 0.005, shakeAmplitude: 0.5,
    swayAmplitudeX: 1.5, swayAmplitudeY: 0.8, swayRotAmplitude: 0.001, breathAmplitude: 0.010,
  },
};

// ──────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  proximitySmoothing: 0.04, reframeSmoothing: 0.06, rotSmoothing: 0.03,
  wideZoom: 1.0, closeUpZoom: 1.12, extremeCloseUpZoom: 1.25,
  maxReframeX: 25, maxReframeY: 15, maxRotation: 0.012,
  punchZoomAmount: 0.015, shakeAmplitude: 2,
  breathAmplitude: 0.015, breathCycleMs: 4000,
  swayAmplitudeX: 3, swayAmplitudeY: 1.5, swayRotAmplitude: 0.003,
  backdropDriftFactor: 0.05, atmosphereFactor: 0.10,
  baseHoldMs: 400, heroHoldMs: 600, climaxHoldMs: 1000,
  releaseSmoothing: 0.02,
};

const SHAKE_DECAY_60 = 0.88;
const PUNCH_ZOOM_DECAY_60 = 0.92;

// ──────────────────────────────────────────────────────────────
// CameraRig class
// ──────────────────────────────────────────────────────────────

export class CameraRig {
  private proximity = 0.15;
  private targetProximity = 0.15;
  private holdTimer = 0;
  private reframeX = 0;
  private reframeY = 0;
  private targetReframeX = 0;
  private targetReframeY = 0;
  private rot = 0;
  private targetRot = 0;
  private shakeX = 0;
  private shakeY = 0;
  private punchZoom = 0;
  private breathPhase = 0;
  private canvasW = 960;
  private canvasH = 540;
  private config: CameraConfig;
  private activeRig: SectionRigName = 'verse';
  private prevHitStrength = 0;
  private prevHeroActive = false;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  setSection(section: SectionRigName): void {
    if (section === this.activeRig) return;
    this.activeRig = section;
    this.config = { ...DEFAULT_CONFIG, ...(SECTION_RIGS[section] ?? {}) };
  }

  /**
   * Main update — call once per tick.
   * Accepts SubjectFocus (new) or legacy PhraseAnchor (detected via 'heroActive' field).
   */
  update(deltaMs: number, beatState: BeatState | null, focus?: SubjectFocus | PhraseAnchor | null): void {
    const dt = Math.min(deltaMs, 33.33) / 16.67;
    const cfg = this.config;

    const isSubjectFocus = focus && 'heroActive' in focus;
    const sf = isSubjectFocus ? (focus as SubjectFocus) : null;
    const anchor = !isSubjectFocus && focus ? (focus as PhraseAnchor) : null;

    // ─── 1. Proximity targeting ───
    if (sf) {
      if (!sf.vocalActive) {
        this.targetProximity = 0.0;
        this.holdTimer = 0;
      } else if (sf.isClimax && sf.heroActive) {
        this.targetProximity = 1.0;
        this.holdTimer = cfg.climaxHoldMs;
      } else if (sf.isClimax) {
        this.targetProximity = 0.75;
        this.holdTimer = Math.max(this.holdTimer, cfg.baseHoldMs);
      } else if (sf.heroActive && !this.prevHeroActive) {
        // Hero just arrived — commit
        this.targetProximity = 0.55 + Math.min(sf.emphasisLevel, 5) * 0.05;
        this.holdTimer = cfg.heroHoldMs;
      } else if (sf.heroActive) {
        // Sustain hold
      } else if (sf.emphasisLevel >= 3) {
        this.targetProximity = 0.4;
        this.holdTimer = Math.max(this.holdTimer, cfg.baseHoldMs * 0.5);
      } else {
        if (this.holdTimer <= 0) this.targetProximity = 0.15;
      }
    } else if (anchor) {
      if (this.holdTimer <= 0) this.targetProximity = 0.15;
    } else {
      if (this.holdTimer <= 0) this.targetProximity = 0.0;
    }

    if (this.holdTimer > 0) this.holdTimer = Math.max(0, this.holdTimer - deltaMs);
    this.prevHeroActive = sf?.heroActive ?? false;

    // ─── 2. Smooth proximity (asymmetric: fast push-in, slow release) ───
    const pushingIn = this.targetProximity > this.proximity;
    const smoothing = pushingIn ? cfg.proximitySmoothing : cfg.releaseSmoothing;
    const proxAlpha = 1 - Math.pow(1 - smoothing, dt);
    this.proximity += (this.targetProximity - this.proximity) * proxAlpha;
    this.proximity = Math.max(0, Math.min(1, this.proximity));

    // ─── 3. Reframe toward subject ───
    const fx = sf?.x ?? anchor?.x ?? this.canvasW * 0.5;
    const fy = sf?.y ?? anchor?.y ?? this.canvasH * 0.5;
    if (sf || anchor) {
      const dx = fx - this.canvasW * 0.5;
      const dy = fy - this.canvasH * 0.5;
      const reframeMult = 0.15 + this.proximity * 0.15;
      this.targetReframeX = Math.max(-cfg.maxReframeX, Math.min(cfg.maxReframeX, dx * reframeMult));
      this.targetReframeY = Math.max(-cfg.maxReframeY, Math.min(cfg.maxReframeY, dy * reframeMult));
    } else {
      this.targetReframeX = 0;
      this.targetReframeY = 0;
    }

    const reframeAlpha = 1 - Math.pow(1 - cfg.reframeSmoothing, dt);
    this.reframeX += (this.targetReframeX - this.reframeX) * reframeAlpha;
    this.reframeY += (this.targetReframeY - this.reframeY) * reframeAlpha;

    // ─── 4. Beat sway + breathing ───
    if (beatState) {
      const phase = beatState.phase;
      const energy = beatState.energy;
      const sway = Math.sin(phase * Math.PI * 2);
      const swayY = Math.cos(phase * Math.PI * 2 + 0.5);
      this.reframeX += sway * cfg.swayAmplitudeX * energy * 0.5;
      this.reframeY += swayY * cfg.swayAmplitudeY * energy * 0.5;
      this.targetRot = sway * cfg.swayRotAmplitude * energy;
    }

    this.breathPhase += (deltaMs / cfg.breathCycleMs) * Math.PI * 2;
    if (this.breathPhase > Math.PI * 2) this.breathPhase -= Math.PI * 2;

    // ─── 5. Hit impulses ───
    if (beatState && beatState.hitStrength > 0.1) {
      const isNewHit = beatState.hitStrength > this.prevHitStrength + 0.05;
      if (isNewHit) {
        const h = beatState.hitStrength;
        const isBass = beatState.hitType === 'bass';
        this.punchZoom += h * cfg.punchZoomAmount * (isBass ? 1.5 : 1.0);
        const angle = Math.random() * Math.PI * 2;
        this.shakeX += Math.cos(angle) * h * cfg.shakeAmplitude * (isBass ? 1.3 : 1.0);
        this.shakeY += Math.sin(angle) * h * cfg.shakeAmplitude * (isBass ? 1.3 : 1.0);
      }
    }
    this.prevHitStrength = beatState?.hitStrength ?? 0;

    // ─── 6. Decay impulses ───
    const shakeMul = Math.pow(SHAKE_DECAY_60, dt);
    const punchMul = Math.pow(PUNCH_ZOOM_DECAY_60, dt);
    this.shakeX *= shakeMul;
    this.shakeY *= shakeMul;
    this.punchZoom *= punchMul;
    if (Math.abs(this.shakeX) < 0.01) this.shakeX = 0;
    if (Math.abs(this.shakeY) < 0.01) this.shakeY = 0;
    if (Math.abs(this.punchZoom) < 0.0001) this.punchZoom = 0;

    // ─── 7. Rotation ───
    const rotAlpha = 1 - Math.pow(1 - cfg.rotSmoothing, dt);
    this.rot += (this.targetRot - this.rot) * rotAlpha;
    this.rot = Math.max(-cfg.maxRotation, Math.min(cfg.maxRotation, this.rot));
  }

  // ──────────────────────────────────────────────────
  // Transform outputs
  // ──────────────────────────────────────────────────

  /** Subject (text) transform — where the DEPTH lives. */
  getSubjectTransform(): SubjectTransform {
    const cfg = this.config;
    let zoom: number;
    if (this.proximity <= 0.7) {
      const t = this.proximity / 0.7;
      const eased = t * t * (3 - 2 * t);
      zoom = cfg.wideZoom + (cfg.closeUpZoom - cfg.wideZoom) * eased;
    } else {
      const t = (this.proximity - 0.7) / 0.3;
      const eased = t * t * (3 - 2 * t);
      zoom = cfg.closeUpZoom + (cfg.extremeCloseUpZoom - cfg.closeUpZoom) * eased;
    }
    zoom += Math.sin(this.breathPhase) * cfg.breathAmplitude + this.punchZoom;

    return {
      zoom, offsetX: this.reframeX, offsetY: this.reframeY,
      rotation: this.rot, proximity: this.proximity,
      shakeX: this.shakeX, shakeY: this.shakeY,
    };
  }

  /**
   * Backdrop / atmosphere transform.
   * Backdrop: slight inverse drift, NO zoom. Atmosphere: ~10% of subject zoom.
   * Accepts legacy 'far'/'mid'/'near' for compatibility.
   */
  applyTransform(ctx: CanvasRenderingContext2D, layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    const cfg = this.config;
    const cx = this.canvasW * 0.5;
    const cy = this.canvasH * 0.5;
    ctx.save();

    const isBackdrop = layer === 'backdrop' || layer === 'far';
    if (isBackdrop) {
      const driftX = -this.reframeX * cfg.backdropDriftFactor;
      const driftY = -this.reframeY * cfg.backdropDriftFactor;
      const bgShakeX = this.shakeX * 0.15;
      const bgShakeY = this.shakeY * 0.15;
      ctx.translate(cx, cy);
      ctx.rotate(this.rot * 0.1);
      ctx.translate(-cx + driftX + bgShakeX, -cy + driftY + bgShakeY);
    } else {
      // Atmosphere: bridges subject and backdrop
      const subT = this.getSubjectTransform();
      const atmZoom = 1.0 + (subT.zoom - 1.0) * cfg.atmosphereFactor;
      const atmDriftX = this.reframeX * 0.15;
      const atmDriftY = this.reframeY * 0.15;
      ctx.translate(cx, cy);
      ctx.rotate(this.rot * 0.3);
      ctx.scale(atmZoom, atmZoom);
      ctx.translate(-cx + atmDriftX + this.shakeX * 0.3, -cy + atmDriftY + this.shakeY * 0.3);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void { ctx.restore(); }
  getProximity(): number { return this.proximity; }

  reset(): void {
    this.proximity = 0.15; this.targetProximity = 0.15; this.holdTimer = 0;
    this.reframeX = 0; this.reframeY = 0;
    this.targetReframeX = 0; this.targetReframeY = 0;
    this.rot = 0; this.targetRot = 0;
    this.shakeX = 0; this.shakeY = 0; this.punchZoom = 0;
    this.breathPhase = 0; this.prevHitStrength = 0; this.prevHeroActive = false;
  }
}
