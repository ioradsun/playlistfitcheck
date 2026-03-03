/**
 * CameraRig — Two-primitive percussive camera.
 *
 * PHILOSOPHY: Static baseline + interruption. Nothing else.
 *
 *   1. BeatHit  — 3% zoom punch on strong beats, snap back immediately.
 *   2. HeroPunch — 8-10% zoom + micro shake on Hero 4+, snap back in 2-3 frames.
 *
 * No breathing. No drift. No easing. No stacking systems.
 * Stability = authority. Interruption = emotional violence.
 */

import type { BeatState } from './BeatConductor';

// ─── Public interfaces (unchanged signatures for compatibility) ───

export interface CameraConfig {
  /** BeatHit fires when HitScore exceeds this */
  beatThreshold: number;
  /** Suppress all BeatHits when energy below this */
  silenceThreshold: number;
  /** BeatHit zoom punch (fraction, e.g. 0.03 = 3%) */
  beatZoom: number;
  /** HeroPunch zoom punch (fraction) */
  heroZoom: number;
  /** HeroPunch shake magnitude in CSS pixels */
  heroShakePx: number;
  /** HeroPunch total duration in frames (at 60fps) */
  heroDurationFrames: number;
  /** Minimum ms between full HeroPunches (taper window) */
  heroTaperMs: number;
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

// ─── Defaults ───

const DEFAULT_CONFIG: CameraConfig = {
  beatThreshold: 0.55,
  silenceThreshold: 0.08,
  beatZoom: 0.03,         // 3% punch
  heroZoom: 0.09,         // 9% punch (midpoint of 8-10%)
  heroShakePx: 3,         // 3px (midpoint of 2-4px)
  heroDurationFrames: 3,  // 2-3 frames total
  heroTaperMs: 150,       // distance-based taper window
};

// ─── State machine ───

const enum CamState {
  IDLE = 0,
  BEAT_HIT = 1,
  HERO_PUNCH = 2,
}

export class CameraRig {
  private config: CameraConfig;
  private canvasW = 960;
  private canvasH = 540;

  // ─ State ─
  private state: CamState = CamState.IDLE;
  private punchZoom = 0;        // current additive zoom above 1.0
  private punchShakeX = 0;      // current shake offset px
  private punchShakeY = 0;
  private framesRemaining = 0;  // countdown for current event
  private totalFrames = 0;      // total frames of current event

  // ─ Collision / taper ─
  private lastHeroPunchMs = 0;  // timestamp of last HeroPunch
  private prevBeatIndex = -1;   // deduplicate beat hits
  private prevHeroActive = false;

  // ─ Deterministic shake direction (seeded per punch) ─
  private shakeAngle = 0;

  // ─ Cache ─
  private _cachedTransform: SubjectTransform | null = null;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Compatibility stubs ───
  setBPM(_bpm: number): void {}
  setSection(_section: SectionRigName): void {}
  setEnergy(_rawEnergy: number): void {}

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  // ─── Main update — called once per frame ───

  update(
    _deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const cfg = this.config;
    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;
    const nowMs = performance.now();

    // ═══ 1. Check HeroPunch trigger (highest priority) ═══
    const heroJustStarted = sf !== null
      && sf.heroActive
      && sf.emphasisLevel >= 4
      && !this.prevHeroActive;

    if (heroJustStarted) {
      const timeSinceLastHero = nowMs - this.lastHeroPunchMs;

      // Distance-based taper: first fires full, rapid repeats scale down
      let scale = 1.0;
      if (timeSinceLastHero < cfg.heroTaperMs) {
        scale = Math.max(0.3, timeSinceLastHero / cfg.heroTaperMs);
      }

      // Silence scaling: scale down slightly when energy is low
      const energy = beatState?.energy ?? 0.5;
      const silenceScale = energy < cfg.silenceThreshold ? 0.4 : 1.0;
      scale *= silenceScale;

      this.state = CamState.HERO_PUNCH;
      this.punchZoom = cfg.heroZoom * scale;
      this.totalFrames = cfg.heroDurationFrames;
      this.framesRemaining = cfg.heroDurationFrames;

      // Single impulse, 1 direction only — deterministic per punch
      this.shakeAngle = (nowMs * 7.13) % (Math.PI * 2);
      this.punchShakeX = Math.cos(this.shakeAngle) * cfg.heroShakePx * scale;
      this.punchShakeY = Math.sin(this.shakeAngle) * cfg.heroShakePx * scale;

      this.lastHeroPunchMs = nowMs;
    }

    // ═══ 2. Check BeatHit trigger (only if not in HeroPunch) ═══
    if (this.state !== CamState.HERO_PUNCH && beatState) {
      const energy = beatState.energy;
      const newBeat = beatState.beatIndex !== this.prevBeatIndex;

      if (newBeat && energy >= cfg.silenceThreshold) {
        // HitScore = BeatConfidence × OnsetStrength × MacroIntensity
        const hitScore = beatState.strength * beatState.hitStrength * energy;

        if (hitScore > cfg.beatThreshold) {
          this.state = CamState.BEAT_HIT;
          this.punchZoom = cfg.beatZoom;
          this.totalFrames = 1; // 1 frame: fire then gone
          this.framesRemaining = 1;
          this.punchShakeX = 0;
          this.punchShakeY = 0;
        }
      }
    }

    // ═══ 3. Decay — immediate snap back ═══
    if (this.framesRemaining > 0) {
      this.framesRemaining--;
    }

    if (this.framesRemaining <= 0 && this.state !== CamState.IDLE) {
      // Snap back to baseline — no easing
      this.state = CamState.IDLE;
      this.punchZoom = 0;
      this.punchShakeX = 0;
      this.punchShakeY = 0;
    }

    // ═══ 4. Bookkeeping ═══
    this.prevHeroActive = sf?.heroActive ?? false;
    if (beatState) this.prevBeatIndex = beatState.beatIndex;
    this._cachedTransform = null;
  }

  // ─── Transform output ───

  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;

    // Linear decay within the event window (sharp, not eased)
    let activeFrac = 0;
    if (this.framesRemaining > 0 && this.totalFrames > 0) {
      activeFrac = this.framesRemaining / this.totalFrames;
    }

    const zoom = 1.0 + this.punchZoom * activeFrac;
    const shakeX = this.punchShakeX * activeFrac;
    const shakeY = this.punchShakeY * activeFrac;

    const result: SubjectTransform = {
      zoom,
      proximity: this.punchZoom > 0 ? activeFrac : 0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      shakeX,
      shakeY,
    };
    this._cachedTransform = result;
    return result;
  }

  // ─── Canvas transforms for background layers ───

  applyTransform(ctx: CanvasRenderingContext2D, _layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    ctx.save();
    const t = this.getSubjectTransform();
    const hasZoom = Math.abs(t.zoom - 1.0) > 0.0005;
    const hasShake = Math.abs(t.shakeX) > 0.1 || Math.abs(t.shakeY) > 0.1;

    if (hasZoom || hasShake) {
      const cx = this.canvasW / 2;
      const cy = this.canvasH / 2;
      if (hasShake) {
        ctx.translate(t.shakeX, t.shakeY);
      }
      if (hasZoom) {
        ctx.translate(cx, cy);
        ctx.scale(t.zoom, t.zoom);
        ctx.translate(-cx, -cy);
      }
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  getProximity(): number {
    return this.getSubjectTransform().proximity;
  }

  reset(): void {
    this.state = CamState.IDLE;
    this.punchZoom = 0;
    this.punchShakeX = 0;
    this.punchShakeY = 0;
    this.framesRemaining = 0;
    this.totalFrames = 0;
    this.lastHeroPunchMs = 0;
    this.prevBeatIndex = -1;
    this.prevHeroActive = false;
    this._cachedTransform = null;
  }
}
