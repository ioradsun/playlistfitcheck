/**
 * CameraRig V3 — Beat-driven camera.
 *
 * THREE SYSTEMS, NOTHING ELSE:
 *
 *   1. BEAT DANCE  — Every beat moves the camera. Energy scales intensity.
 *                    Bass → downward punch. Transient → lateral snap.
 *                    Continuous sine sway between beats.
 *
 *   2. DROP DETECT — Auto-detected from energy. When energy spikes above
 *                    the rolling average, everything scales up + continuous
 *                    shake kicks in. No mood strings needed.
 *
 *   3. HERO PUNCH  — Brief stillness (anticipation) → lock on word → punch in.
 *                    The only moment the camera pauses the beat dance.
 *
 * PARALLAX always on: far=0.15, mid=0.5, near=0.85, text=0 (anchored).
 *
 * SAFETY ENVELOPE:
 *   Max zoom:     1.15
 *   Max offset:   30px
 *   Max rotation: ±2.5°
 */

import type { BeatState } from './BeatConductor';

// ─── Public interfaces ───────────────────────────────────────

export interface CameraConfig {
  // Beat dance
  beatBounceY: number;           // px Y bounce per beat (scaled by energy)
  beatBounceX: number;           // px X sway per beat
  beatZoom: number;              // zoom punch per beat (e.g. 0.02 = 2%)
  bassMultiplier: number;        // extra multiplier for bass hits
  transientMultiplier: number;   // extra multiplier for transient hits
  swaySmoothing: number;         // how smooth the between-beat sway is
  // Drop detection
  dropEnergyThreshold: number;   // energy must exceed rolling avg by this much
  dropMinEnergy: number;         // absolute minimum energy to trigger drop
  dropShakePx: number;           // continuous shake amplitude during drops
  dropIntensity: number;         // multiplier on everything during drops
  dropDecayRate: number;         // how fast drop state fades (per second)
  // Hero punch
  heroZoom: number;              // zoom punch for hero word
  heroShakePx: number;           // shake impulse for hero
  heroDurationFrames: number;    // frames the punch lasts
  heroTaperMs: number;           // cooldown between hero punches
  heroStillMs: number;           // ms of stillness before hero punch fires
  // Parallax
  parallaxFar: number;
  parallaxMid: number;
  parallaxNear: number;
  // Safety
  maxZoom: number;
  maxOffsetPx: number;
  maxRotationRad: number;
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

// ─── Defaults ────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  // Beat dance — visible on every beat
  beatBounceY: 6,
  beatBounceX: 3,
  beatZoom: 0.02,
  bassMultiplier: 2.0,
  transientMultiplier: 1.5,
  swaySmoothing: 2.0,
  // Drop detection
  dropEnergyThreshold: 0.25,
  dropMinEnergy: 0.55,
  dropShakePx: 4,
  dropIntensity: 2.2,
  dropDecayRate: 1.5,
  // Hero punch
  heroZoom: 0.10,
  heroShakePx: 4,
  heroDurationFrames: 3,
  heroTaperMs: 150,
  heroStillMs: 120,
  // Parallax
  parallaxFar: 0.15,
  parallaxMid: 0.5,
  parallaxNear: 0.85,
  // Safety
  maxZoom: 1.15,
  maxOffsetPx: 30,
  maxRotationRad: 2.5 * Math.PI / 180,
};

// ─── Helpers ─────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ─── CameraRig ───────────────────────────────────────────────

export class CameraRig {
  private config: CameraConfig;
  private canvasW = 960;
  private canvasH = 540;

  // ═══ BEAT DANCE state ═══
  private prevBeatIndex = -1;
  private beatImpulseY = 0;
  private beatImpulseX = 0;
  private beatImpulseZoom = 0;
  private beatImpulseRot = 0;

  // ═══ DROP DETECTION state ═══
  private energyAvg = 0.3;
  private dropAmount = 0;
  private prevEnergy = 0;

  // ═══ HERO PUNCH state ═══
  private heroActive = false;
  private heroPunchZoom = 0;
  private heroPunchShakeX = 0;
  private heroPunchShakeY = 0;
  private heroFramesLeft = 0;
  private heroTotalFrames = 0;
  private lastHeroPunchMs = 0;
  private prevHeroActive = false;
  private heroStillTimer = 0;
  private heroFreezeAmount = 0;

  // ═══ Composite output ═══
  private _zoom = 1;
  private _offsetX = 0;
  private _offsetY = 0;
  private _rotation = 0;
  private _shakeX = 0;
  private _shakeY = 0;
  private _cachedTransform: SubjectTransform | null = null;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Compatibility stubs (kept for API — no-ops now) ───────

  setBPM(_bpm: number): void {}
  setSection(_section: SectionRigName): void {}
  setSectionFromMood(_mood: string): void {}
  setEnergy(_e: number): void {}

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  // ─── Main update ───────────────────────────────────────────

  update(
    deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const cfg = this.config;
    const dt = Math.min(deltaMs, 100) / 1000;
    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;
    const nowMs = performance.now();

    const energy = beatState?.energy ?? 0;
    const phase = beatState?.phase ?? 0;
    const hitStrength = beatState?.hitStrength ?? 0;
    const hitType = beatState?.hitType ?? 'none';
    const isNewBeat = beatState !== null && beatState.beatIndex !== this.prevBeatIndex;

    // ═══════════════════════════════════════════════════════════
    // 1. DROP DETECTION — auto from energy
    // ═══════════════════════════════════════════════════════════

    // Slow-moving average (~3s tau)
    this.energyAvg += (energy - this.energyAvg) * Math.min(1, dt * 0.35);

    const energySpike = energy - this.energyAvg;
    const isDropping = energySpike > cfg.dropEnergyThreshold && energy > cfg.dropMinEnergy;

    if (isDropping) {
      this.dropAmount = Math.min(1, this.dropAmount + dt * 4);
    } else {
      this.dropAmount = Math.max(0, this.dropAmount - dt * cfg.dropDecayRate);
    }

    const dropMult = 1.0 + this.dropAmount * (cfg.dropIntensity - 1.0);

    // ═══════════════════════════════════════════════════════════
    // 2. HERO PUNCH — stillness → lock → punch
    // ═══════════════════════════════════════════════════════════

    const heroApproaching = sf?.heroApproaching ?? false;
    const heroJustStarted = sf !== null
      && sf.heroActive
      && sf.emphasisLevel >= 4
      && !this.prevHeroActive;

    // Anticipation: freeze beat dance as hero approaches
    if (heroApproaching) {
      this.heroStillTimer += deltaMs;
      this.heroFreezeAmount = Math.min(1, this.heroStillTimer / Math.max(1, cfg.heroStillMs));
    } else if (!sf?.heroActive) {
      this.heroStillTimer = 0;
      this.heroFreezeAmount = Math.max(0, this.heroFreezeAmount - dt * 8);
    }

    if (heroJustStarted) {
      const timeSinceLast = nowMs - this.lastHeroPunchMs;
      let scale = 1.0;
      if (timeSinceLast < cfg.heroTaperMs) {
        scale = Math.max(0.3, timeSinceLast / cfg.heroTaperMs);
      }
      if (sf!.isClimax) scale *= 1.4;

      this.heroActive = true;
      this.heroPunchZoom = cfg.heroZoom * scale;
      this.heroTotalFrames = cfg.heroDurationFrames;
      this.heroFramesLeft = cfg.heroDurationFrames;

      const angle = (nowMs * 7.13) % (Math.PI * 2);
      this.heroPunchShakeX = Math.cos(angle) * cfg.heroShakePx * scale;
      this.heroPunchShakeY = Math.sin(angle) * cfg.heroShakePx * scale;
      this.lastHeroPunchMs = nowMs;

      // Release freeze on punch
      this.heroFreezeAmount = 0;
      this.heroStillTimer = 0;
    }

    // Hero decay
    if (this.heroFramesLeft > 0) {
      this.heroFramesLeft--;
    }
    if (this.heroFramesLeft <= 0 && this.heroActive) {
      this.heroActive = false;
      this.heroPunchZoom = 0;
      this.heroPunchShakeX = 0;
      this.heroPunchShakeY = 0;
    }

    const heroFrac = (this.heroFramesLeft > 0 && this.heroTotalFrames > 0)
      ? this.heroFramesLeft / this.heroTotalFrames
      : 0;

    // ═══════════════════════════════════════════════════════════
    // 3. BEAT DANCE — every beat, camera moves
    // ═══════════════════════════════════════════════════════════

    if (isNewBeat && energy > 0.05) {
      const strength = beatState!.strength * Math.max(hitStrength, 0.3);
      const amp = strength * energy * dropMult;

      if (hitType === 'bass') {
        // Bass → downward punch
        this.beatImpulseY = cfg.beatBounceY * amp * cfg.bassMultiplier;
        this.beatImpulseX = 0;
        this.beatImpulseRot = 0;
      } else if (hitType === 'transient') {
        // Transient → lateral snap
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        this.beatImpulseX = cfg.beatBounceX * amp * cfg.transientMultiplier * dir;
        this.beatImpulseY = cfg.beatBounceY * amp * 0.3;
        this.beatImpulseRot = dir * 0.003 * amp;
      } else {
        // Generic → balanced bounce
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        this.beatImpulseY = cfg.beatBounceY * amp * 0.7;
        this.beatImpulseX = cfg.beatBounceX * amp * 0.4 * dir;
        this.beatImpulseRot = 0;
      }

      // Zoom on every beat
      const downbeatMult = beatState!.isDownbeat ? 1.5 : 1.0;
      this.beatImpulseZoom = cfg.beatZoom * amp * downbeatMult;
    }

    // Fast exponential decay (~88% gone per frame at 60fps)
    const decayRate = Math.pow(0.12, dt);
    this.beatImpulseY *= decayRate;
    this.beatImpulseX *= decayRate;
    this.beatImpulseZoom *= decayRate;
    this.beatImpulseRot *= decayRate;

    // Continuous sway between beats
    const swayAmp = energy * dropMult;
    const swayY = Math.cos(phase * Math.PI * 2) * cfg.beatBounceY * 0.3 * swayAmp;
    const swayX = Math.sin(phase * Math.PI) * cfg.beatBounceX * 0.2 * swayAmp;

    // ═══════════════════════════════════════════════════════════
    // 4. DROP SHAKE — continuous noise during drops
    // ═══════════════════════════════════════════════════════════

    const shakeT = nowMs * 0.013;
    const dropShakeX = this.dropAmount * cfg.dropShakePx * Math.sin(shakeT * 7.1 + 1.3) * energy;
    const dropShakeY = this.dropAmount * cfg.dropShakePx * Math.cos(shakeT * 5.7 + 2.9) * energy;

    // ═══════════════════════════════════════════════════════════
    // 5. COMPOSITE — beat + drop + hero, freeze during anticipation
    // ═══════════════════════════════════════════════════════════

    const beatAlive = 1 - this.heroFreezeAmount;

    let zoom = 1.0
      + (this.beatImpulseZoom + swayAmp * 0.005) * beatAlive
      + this.heroPunchZoom * heroFrac;

    let offsetX = (this.beatImpulseX + swayX + dropShakeX) * beatAlive
      + this.heroPunchShakeX * heroFrac;

    let offsetY = (this.beatImpulseY + swayY + dropShakeY) * beatAlive
      + this.heroPunchShakeY * heroFrac;

    let rotation = this.beatImpulseRot * beatAlive;

    let shakeX = (this.beatImpulseX * 0.5 + dropShakeX) * beatAlive
      + this.heroPunchShakeX * heroFrac;
    let shakeY = (this.beatImpulseY * 0.5 + dropShakeY) * beatAlive
      + this.heroPunchShakeY * heroFrac;

    // ── Safety ──
    zoom = clamp(zoom, 2 - cfg.maxZoom, cfg.maxZoom);
    offsetX = clamp(offsetX, -cfg.maxOffsetPx, cfg.maxOffsetPx);
    offsetY = clamp(offsetY, -cfg.maxOffsetPx, cfg.maxOffsetPx);
    rotation = clamp(rotation, -cfg.maxRotationRad, cfg.maxRotationRad);
    shakeX = clamp(shakeX, -cfg.maxOffsetPx, cfg.maxOffsetPx);
    shakeY = clamp(shakeY, -cfg.maxOffsetPx, cfg.maxOffsetPx);

    this._zoom = zoom;
    this._offsetX = offsetX;
    this._offsetY = offsetY;
    this._rotation = rotation;
    this._shakeX = shakeX;
    this._shakeY = shakeY;

    // ═══ Bookkeeping ═══
    this.prevHeroActive = sf?.heroActive ?? false;
    if (beatState) this.prevBeatIndex = beatState.beatIndex;
    this.prevEnergy = energy;
    this._cachedTransform = null;
  }

  // ─── Transform output (text layer — no parallax) ───────────

  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;

    const result: SubjectTransform = {
      zoom: this._zoom,
      proximity: Math.max(0, this._zoom - 1),
      offsetX: this._offsetX,
      offsetY: this._offsetY,
      rotation: this._rotation,
      shakeX: this._shakeX,
      shakeY: this._shakeY,
    };
    this._cachedTransform = result;
    return result;
  }

  // ─── Canvas transforms for background layers (PARALLAX) ────

  applyTransform(
    ctx: CanvasRenderingContext2D,
    layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near',
  ): void {
    ctx.save();

    const cfg = this.config;
    let depth: number;
    switch (layer) {
      case 'backdrop':
      case 'far':        depth = cfg.parallaxFar;  break;
      case 'atmosphere':
      case 'mid':        depth = cfg.parallaxMid;  break;
      case 'near':       depth = cfg.parallaxNear; break;
      default:           depth = 0.5;
    }

    const zoom = 1.0 + (this._zoom - 1.0) * depth;
    const ox = this._offsetX * depth;
    const oy = this._offsetY * depth;
    const sx = this._shakeX * depth;
    const sy = this._shakeY * depth;
    const rot = this._rotation * depth;

    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;

    const hasMotion = Math.abs(zoom - 1.0) > 0.0005
      || Math.abs(ox) > 0.1 || Math.abs(oy) > 0.1
      || Math.abs(sx) > 0.1 || Math.abs(sy) > 0.1
      || Math.abs(rot) > 0.0001;

    if (hasMotion) {
      ctx.translate(cx + ox + sx, cy + oy + sy);
      if (Math.abs(rot) > 0.0001) ctx.rotate(rot);
      if (Math.abs(zoom - 1.0) > 0.0005) ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  getProximity(): number {
    return Math.max(0, this._zoom - 1);
  }

  reset(): void {
    this.prevBeatIndex = -1;
    this.beatImpulseY = 0;
    this.beatImpulseX = 0;
    this.beatImpulseZoom = 0;
    this.beatImpulseRot = 0;
    this.energyAvg = 0.3;
    this.dropAmount = 0;
    this.prevEnergy = 0;
    this.heroActive = false;
    this.heroPunchZoom = 0;
    this.heroPunchShakeX = 0;
    this.heroPunchShakeY = 0;
    this.heroFramesLeft = 0;
    this.heroTotalFrames = 0;
    this.lastHeroPunchMs = 0;
    this.prevHeroActive = false;
    this.heroStillTimer = 0;
    this.heroFreezeAmount = 0;
    this._zoom = 1;
    this._offsetX = 0;
    this._offsetY = 0;
    this._rotation = 0;
    this._shakeX = 0;
    this._shakeY = 0;
    this._cachedTransform = null;
  }

  /** Expose drop detection for external systems (e.g. particles) */
  get drop(): number { return this.dropAmount; }
}
