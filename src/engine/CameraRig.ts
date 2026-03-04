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
  /** @deprecated Was used by old spring sway — no longer read. Reserved for compat. */
  swaySmoothing: number;
  // Drop detection
  dropEnergyThreshold: number;   // energy must exceed rolling avg by this much
  dropMinEnergy: number;         // absolute minimum energy to trigger drop
  dropShakePx: number;           // continuous shake amplitude during drops
  dropIntensity: number;         // multiplier on everything during drops
  dropDecayRate: number;         // how fast drop state fades (per second)
  // Hero punch
  heroZoom: number;              // zoom punch for hero word
  heroShakePx: number;           // shake impulse for hero
  /** Duration of hero punch in milliseconds (replaces heroDurationFrames — frame-rate independent) */
  heroPunchMs: number;
  heroTaperMs: number;           // cooldown between hero punches
  heroStillMs: number;           // ms of stillness before hero punch fires
  // Output spring — smooths beat impulse output to prevent hard snaps
  springStiffness: number;       // spring constant (higher = snappier)
  springDamping: number;         // damping ratio (>1 = overdamped/no oscillation)
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
  // Beat dance — every beat should be clearly visible
  beatBounceY: 10,
  beatBounceX: 5,
  beatZoom: 0.025,
  bassMultiplier: 1.8,
  transientMultiplier: 1.5,
  swaySmoothing: 2.0,   // deprecated — kept for external callers passing old configs
  // Drop detection
  dropEnergyThreshold: 0.25,
  dropMinEnergy: 0.55,
  dropShakePx: 5,
  dropIntensity: 2.0,
  dropDecayRate: 1.5,
  // Hero punch — time-based (was heroDurationFrames: 3 → frame-rate dependent)
  heroZoom: 0.10,
  heroShakePx: 5,
  heroPunchMs: 80,        // ~5 frames at 60fps — snappy but visible
  heroTaperMs: 150,
  heroStillMs: 120,
  // Output spring — critically damped feels organic without oscillation
  springStiffness: 180,   // tuned for ~60ms settle time
  springDamping: 27,      // 2*sqrt(180) = 26.8 → true critical damping (no overshoot/ring)
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
  /** Time-based punch — ms remaining (was frame-count, which was frame-rate dependent) */
  private heroPunchMsLeft = 0;
  private heroPunchMsTotal = 0;
  private lastHeroPunchMs = 0;
  private prevHeroActive = false;
  private heroStillTimer = 0;
  private heroFreezeAmount = 0;

  // ═══ OUTPUT SPRING state ═══
  // Spring follows raw impulse values → smooth organic output
  // velocity terms (units/sec) for each output axis
  private _springZoom = 1;        private _velZoom = 0;
  private _springOffX = 0;        private _velOffX = 0;
  private _springOffY = 0;        private _velOffY = 0;
  private _springRot = 0;         private _velRot = 0;

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
      // TIME-BASED: heroPunchMs replaces heroDurationFrames (was frame-rate dependent)
      this.heroPunchMsTotal = cfg.heroPunchMs;
      this.heroPunchMsLeft = cfg.heroPunchMs;

      const angle = (nowMs * 7.13) % (Math.PI * 2);
      this.heroPunchShakeX = Math.cos(angle) * cfg.heroShakePx * scale;
      this.heroPunchShakeY = Math.sin(angle) * cfg.heroShakePx * scale;
      this.lastHeroPunchMs = nowMs;

      // Release freeze on punch
      this.heroFreezeAmount = 0;
      this.heroStillTimer = 0;
    }

    // Hero decay — time-based (not frame-count)
    if (this.heroPunchMsLeft > 0) {
      this.heroPunchMsLeft = Math.max(0, this.heroPunchMsLeft - deltaMs);
    }
    if (this.heroPunchMsLeft <= 0 && this.heroActive) {
      this.heroActive = false;
      this.heroPunchZoom = 0;
      this.heroPunchShakeX = 0;
      this.heroPunchShakeY = 0;
    }

    const heroFrac = (this.heroPunchMsLeft > 0 && this.heroPunchMsTotal > 0)
      ? this.heroPunchMsLeft / this.heroPunchMsTotal
      : 0;

    // ═══════════════════════════════════════════════════════════
    // 3. BEAT DANCE — every beat, camera moves
    // ═══════════════════════════════════════════════════════════

    if (isNewBeat && energy > 0.02) {
      // Amplitude: additive blend, NOT triple-multiply.
      // Floor of 0.4 so every beat is visible. Energy and strength boost it further.
      const base = 0.4 + energy * 0.4 + beatState!.strength * 0.2;
      const hitBoost = hitStrength > 0.3 ? 1.0 + hitStrength * 0.5 : 1.0;
      const amp = base * hitBoost * dropMult;

      if (hitType === 'bass') {
        // Bass → downward punch
        this.beatImpulseY = cfg.beatBounceY * amp * cfg.bassMultiplier;
        this.beatImpulseX = 0;
        this.beatImpulseRot = 0;
      } else if (hitType === 'transient') {
        // Transient → lateral snap
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        this.beatImpulseX = cfg.beatBounceX * amp * cfg.transientMultiplier * dir;
        this.beatImpulseY = cfg.beatBounceY * amp * 0.4;
        // Rotation: was 0.005 → ~0.4° peak (below JND of ~1°). Now 0.018 → ~1.4° peak.
        this.beatImpulseRot = dir * 0.018 * amp;
      } else {
        // Generic → alternating bounce
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        this.beatImpulseY = cfg.beatBounceY * amp * 0.8;
        this.beatImpulseX = cfg.beatBounceX * amp * 0.5 * dir;
        this.beatImpulseRot = 0;
      }

      // Zoom on every beat — downbeats harder
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

    // Raw target values (impulse + sway + drop)
    const targetZoom = 1.0
      + (this.beatImpulseZoom + swayAmp * 0.005) * beatAlive
      + this.heroPunchZoom * heroFrac;

    const targetOffX = (this.beatImpulseX + swayX + dropShakeX) * beatAlive
      + this.heroPunchShakeX * heroFrac;

    const targetOffY = (this.beatImpulseY + swayY + dropShakeY) * beatAlive
      + this.heroPunchShakeY * heroFrac;

    const targetRot = this.beatImpulseRot * beatAlive;

    // ── Spring-damped output ─────────────────────────────────────
    // Critically-damped spring: F = -k*(x-target) - c*v
    // At critical damping: c = 2*sqrt(k*m), with m=1 → c = 2*sqrt(k)
    // This gives organic, non-oscillating snap to target.
    const k = cfg.springStiffness;
    const c = cfg.springDamping;

    const accelZoom = -k * (this._springZoom - targetZoom) - c * this._velZoom;
    this._velZoom += accelZoom * dt;
    this._springZoom += this._velZoom * dt;

    const accelX = -k * (this._springOffX - targetOffX) - c * this._velOffX;
    this._velOffX += accelX * dt;
    this._springOffX += this._velOffX * dt;

    const accelY = -k * (this._springOffY - targetOffY) - c * this._velOffY;
    this._velOffY += accelY * dt;
    this._springOffY += this._velOffY * dt;

    const accelRot = -k * (this._springRot - targetRot) - c * this._velRot;
    this._velRot += accelRot * dt;
    this._springRot += this._velRot * dt;

    // ── Safety ──
    let zoom     = clamp(this._springZoom,  2 - cfg.maxZoom,        cfg.maxZoom);
    let offsetX  = clamp(this._springOffX, -cfg.maxOffsetPx,        cfg.maxOffsetPx);
    let offsetY  = clamp(this._springOffY, -cfg.maxOffsetPx,        cfg.maxOffsetPx);
    let rotation = clamp(this._springRot,  -cfg.maxRotationRad,     cfg.maxRotationRad);
    // shakeX/Y exposed for parallax sub-layers (subset of offset)
    let shakeX   = clamp(this._springOffX * 0.5, -cfg.maxOffsetPx,  cfg.maxOffsetPx);
    let shakeY   = clamp(this._springOffY * 0.5, -cfg.maxOffsetPx,  cfg.maxOffsetPx);

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
    this.heroPunchMsLeft = 0;
    this.heroPunchMsTotal = 0;
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
    // Spring state
    this._springZoom = 1;   this._velZoom = 0;
    this._springOffX = 0;   this._velOffX = 0;
    this._springOffY = 0;   this._velOffY = 0;
    this._springRot = 0;    this._velRot = 0;
  }

  /** Expose drop detection for external systems (e.g. particles) */
  get drop(): number { return this.dropAmount; }
}
