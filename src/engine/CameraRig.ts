/**
 * CameraRig — depth-only director's camera for lyric video rendering.
 *
 * ═══ BREATHING PHILOSOPHY ═══
 * Breathing is anchored to the BPM grid but modulated by phrase:
 *   Verse/Intro:    Subtle 4-beat inhale / 4-beat exhale (barely there)
 *   Pre-chorus/Bridge: Amplitude increases slightly
 *   Chorus/Drop:    Full breathing + grid-break before hero words
 *
 * The grid-break: 1 frame before a hero word, breathing skips ahead.
 * The brain goes "wait — something changed." That's emotion.
 * Then it snaps back to grid.
 */

import type { BeatState } from './BeatConductor';

export interface CameraConfig {
  wideZoom: number;
  mediumZoom: number;
  closeUpZoom: number;
  extremeCloseUpZoom: number;
  pushInSpeed: number;
  releaseSpeed: number;
  punchAmount: number;
  breathDepth: number;
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

// Energy-to-modulation curves — continuous, no labels needed.
// energy 0.0 = dead silence, 1.0 = peak drop
function energyToBreathMult(e: number): number {
  // Exponential: silence barely breathes, high energy breathes hard
  // 0.0→0.15, 0.3→0.4, 0.5→0.7, 0.7→1.2, 1.0→2.0
  return 0.15 + e * e * 1.85;
}
function energyToPunchMult(e: number): number {
  // Linear with floor: always some punch response
  return 0.1 + e * 0.9;
}
function energyToPushSpeedMult(e: number): number {
  return 0.8 + e * 0.4;
}

const DEFAULT_CONFIG: CameraConfig = {
  wideZoom: 1.0,
  mediumZoom: 1.06,
  closeUpZoom: 1.15,
  extremeCloseUpZoom: 1.30,
  pushInSpeed: 0.05,
  releaseSpeed: 0.018,
  punchAmount: 0.012,
  // Base breath — halved. Sections spread wide: verse=0.003, chorus=0.010, drop=0.013
  breathDepth: 0.007,
  holdMs: 1200,
  climaxHoldMs: 2000,
};

const PUNCH_DECAY_60 = 0.90;

export class CameraRig {
  private proximity = 0.0;
  private targetProximity = 0.0;
  private holdTimer = 0;
  private punchZoom = 0;
  private shakeX = 0;
  private shakeY = 0;

  // Breathing — grid-anchored with micro-disruption
  private breathPhase = 0;
  private bpm = 120;
  private gridBreakOffset = 0;
  private gridBreakDecay = 0;

  private config: CameraConfig;
  // Smoothed energy from beat map — drives all modulation
  private smoothedEnergy = 0;
  private activeRig: SectionRigName = 'verse'; // kept for external API compat
  // Frame cache — computed once per update(), reused by getSubjectTransform()/applyTransform()
  private _cachedTransform: SubjectTransform | null = null;

  private prevHitStrength = 0;
  private prevHeroActive = false;

  private canvasW = 960;
  private canvasH = 540;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  setBPM(bpm: number): void {
    this.bpm = Math.max(30, Math.min(300, bpm));
  }

  setSection(section: SectionRigName): void {
    // Kept for API compatibility — actual modulation comes from energy
    this.activeRig = section;
  }

  /** Feed continuous energy from beat map RMS (0-1). Smoothed internally. */
  setEnergy(rawEnergy: number): void {
    // Exponential moving average — ~500ms smoothing at 60fps
    const alpha = 0.04;
    this.smoothedEnergy += (Math.max(0, Math.min(1, rawEnergy)) - this.smoothedEnergy) * alpha;
  }

  update(
    deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const dt = Math.min(deltaMs, 33.33) / 16.67;
    const cfg = this.config;
    const e = this.smoothedEnergy;
    const breathMult = energyToBreathMult(e);
    const punchMult = energyToPunchMult(e);
    const pushSpeedMult = energyToPushSpeedMult(e);

    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;

    // ─── 1. Emphasis → target proximity ───
    if (sf) {
      if (!sf.vocalActive) {
        this.targetProximity = 0.0;
        this.holdTimer = 0;
      } else if (sf.isClimax && sf.heroActive && sf.emphasisLevel >= 5) {
        this.targetProximity = 1.0;
        this.holdTimer = cfg.climaxHoldMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5 && !this.prevHeroActive) {
        this.targetProximity = 0.70;
        this.holdTimer = cfg.holdMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5) {
        // Sustain
      } else {
        if (this.holdTimer <= 0) {
          this.targetProximity = sf.vocalActive ? 0.15 : 0.0;
        }
      }

      // ─── Grid-break: micro-disruption before hero arrival ───
      // Hero approaching but not yet active → skip a tiny bit of
      // the breath cycle. Brain notices the break subconsciously,
      // then the hero word lands and resolves the tension.
      if (sf.heroApproaching && !sf.heroActive && this.gridBreakDecay <= 0) {
        this.gridBreakOffset = 0.35;
        this.gridBreakDecay = 1.0;
      }
    } else if (focus) {
      if (this.holdTimer <= 0) this.targetProximity = 0.10;
    } else {
      if (this.holdTimer <= 0) this.targetProximity = 0.0;
    }

    if (this.holdTimer > 0) this.holdTimer = Math.max(0, this.holdTimer - deltaMs);
    this.prevHeroActive = sf?.heroActive ?? false;

    // ─── 2. Smooth proximity ───
    const pushingIn = this.targetProximity > this.proximity;
    const speed = pushingIn
      ? cfg.pushInSpeed * pushSpeedMult
      : cfg.releaseSpeed;
    const alpha = 1 - Math.pow(1 - speed, dt);
    this.proximity += (this.targetProximity - this.proximity) * alpha;
    this.proximity = Math.max(0, Math.min(1, this.proximity));

    // ─── 3. BREATHE: BPM-synced, phrase-modulated ───
    const barCycleMs = (4 * 60000) / Math.max(30, this.bpm);
    this.breathPhase += (deltaMs / barCycleMs) * Math.PI * 2;
    if (this.breathPhase > Math.PI * 2) this.breathPhase -= Math.PI * 2;

    // Grid-break: inject phase skip, then decay back to grid
    if (this.gridBreakOffset > 0.001) {
      this.breathPhase += this.gridBreakOffset;
      this.gridBreakOffset *= Math.pow(0.85, dt);
      if (this.gridBreakOffset < 0.001) this.gridBreakOffset = 0;
    }
    if (this.gridBreakDecay > 0) {
      this.gridBreakDecay -= deltaMs / 500;
    }

    // ─── 4. Punch zoom on hits ───
    if (beatState && beatState.hitStrength > 0.1) {
      const isNewHit = beatState.hitStrength > this.prevHitStrength + 0.05;
      if (isNewHit) {
        const h = beatState.hitStrength;
        const isBass = beatState.hitType === 'bass';
        this.punchZoom += h * cfg.punchAmount * punchMult * (isBass ? 1.4 : 1.0);
      }
    }
    this.prevHitStrength = beatState?.hitStrength ?? 0;
    this.punchZoom *= Math.pow(PUNCH_DECAY_60, dt);
    if (this.punchZoom < 0.0001) this.punchZoom = 0;

    // ─── 5. Camera shake — energy-driven micro-tremor ───
    // Only kicks in at higher energy. Feels like handheld camera.
    const shakeAmount = Math.max(0, this.smoothedEnergy - 0.4) * 2.5; // 0 below 0.4, ramps to 1.5 at energy=1.0
    if (shakeAmount > 0.01 && beatState) {
      const hitKick = beatState.hitStrength * 3; // hits add directional kick
      const t = performance.now() / 1000;
      // Perlin-ish: two frequencies, not random (random = jitter, sine = organic)
      this.shakeX = (Math.sin(t * 7.3) * 0.6 + Math.sin(t * 13.1) * 0.4 + hitKick * Math.sin(t * 31)) * shakeAmount;
      this.shakeY = (Math.sin(t * 5.7) * 0.6 + Math.cos(t * 11.9) * 0.4 + hitKick * Math.cos(t * 29)) * shakeAmount;
    } else {
      this.shakeX *= 0.9;
      this.shakeY *= 0.9;
    }

    // Invalidate cached transform — will be recomputed on next get
    this._cachedTransform = null;
  }

  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;
    const cfg = this.config;
    const breathMult = energyToBreathMult(this.smoothedEnergy);

    let zoom: number;
    if (this.proximity <= 0.5) {
      const t = this.proximity / 0.5;
      const e = t * t * (3 - 2 * t);
      zoom = cfg.wideZoom + (cfg.mediumZoom - cfg.wideZoom) * e;
    } else if (this.proximity <= 0.7) {
      const t = (this.proximity - 0.5) / 0.2;
      const e = t * t * (3 - 2 * t);
      zoom = cfg.mediumZoom + (cfg.closeUpZoom - cfg.mediumZoom) * e;
    } else {
      const t = (this.proximity - 0.7) / 0.3;
      const e = t * t * (3 - 2 * t);
      zoom = cfg.closeUpZoom + (cfg.extremeCloseUpZoom - cfg.closeUpZoom) * e;
    }

    // Breathing — phrase-modulated
    zoom += Math.sin(this.breathPhase) * cfg.breathDepth * breathMult;
    // Punch
    zoom += this.punchZoom;

    const result: SubjectTransform = {
      zoom,
      proximity: this.proximity,
      offsetX: 0, offsetY: 0, rotation: 0, shakeX: this.shakeX, shakeY: this.shakeY,
    };
    this._cachedTransform = result;
    return result;
  }

  applyTransform(ctx: CanvasRenderingContext2D, _layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    ctx.save();
    const st = this.getSubjectTransform();
    const zoom = st.zoom;
    // Shake + zoom from canvas center
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;
    if (Math.abs(zoom - 1.0) > 0.001 || Math.abs(st.shakeX) > 0.1 || Math.abs(st.shakeY) > 0.1) {
      ctx.translate(cx + st.shakeX, cy + st.shakeY);
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
    this.punchZoom = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.breathPhase = 0;
    this.gridBreakOffset = 0;
    this.gridBreakDecay = 0;
    this.smoothedEnergy = 0;
    this.prevHitStrength = 0;
    this.prevHeroActive = false;
  }
}
