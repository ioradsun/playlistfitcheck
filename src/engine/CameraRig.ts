/**
 * CameraRig V5 — Audio-Driven Disciplined Cinematography.
 *
 * Three modes, one spring, three discipline systems.
 *
 * MODES:
 *   STILL — default. Camera locked. Stillness IS the mood.
 *   PULSE — significance-gated beat impulse. One move, committed, then hold.
 *   SHAKE — drops only. Rapid oscillation, decays. Rare.
 *
 * DISCIPLINE:
 *   1. Significance gate: only fire on meaningful beats
 *   2. Hold-after-move: commit then stay quiet (300-800ms)
 *   3. Phrase damping: dense reading moments suppress camera
 *
 * The audio IS the cinematographer. No AI mood labels.
 * Camera and words read the SAME SongMotionIdentity (Phase 6).
 */

import type { BeatState } from './BeatConductor';
import type { SongMotionIdentity, SectionMotionMod } from './MotionIdentity';

// ─── Public interfaces ──────────────────────────────────────────────────

export interface CameraConfig {
  /** Max Y offset on bass hit (px) — boosted for gated firing (only ~30% of beats fire) */
  punchY: number;
  /** Max X offset on transient hit (px) — boosted for gated firing */
  snapX: number;
  /** Max zoom deviation on tonal hit — boosted for gated firing */
  pushZoom: number;
  /** Max rotation on transient (radians) — boosted for gated firing */
  tiltRad: number;
  /** Downbeat amplitude multiplier */
  downbeatMult: number;
  /** Shake amplitude on drop (px) — boosted for rare drops */
  shakeMax: number;
  /** Shake decay time constant (seconds) */
  shakeDecaySec: number;
  /** Spring stiffness for beat response */
  springK: number;
  /** Spring damping — slightly underdamped for weight (tiny overshoot on settle) */
  springC: number;
  /** Max zoom (hard cap — protects readability) */
  maxZoom: number;
  /** Max offset (hard cap, px — gated beats should regularly hit this) */
  maxOffsetPx: number;
  /** Max rotation (hard cap, radians) */
  maxRotationRad: number;
  /** Significance threshold: hitStrength × strength must exceed this to fire */
  significanceThreshold: number;
  /** Hold duration after normal beat (ms) */
  holdNormalMs: number;
  /** Hold duration after hero word (ms) */
  holdHeroMs: number;
  /** Hold duration after section arrival (ms) */
  holdSectionMs: number;
  /** Phrase damping threshold: above this, camera is locked */
  phraseDampingLock: number;
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

export interface SubjectFocus {
  x: number;
  y: number;
  heroActive: boolean;
  emphasisLevel: number;
  isClimax: boolean;
  vocalActive: boolean;
  heroApproaching?: boolean;
}

const DEFAULT_CONFIG: CameraConfig = {
  punchY: 55,
  snapX: 32,
  pushZoom: 0.045,
  tiltRad: 3.0 * Math.PI / 180,
  downbeatMult: 1.5,
  shakeMax: 55,
  shakeDecaySec: 1.5,
  springK: 60,
  springC: 13,
  maxZoom: 1.15,
  maxOffsetPx: 60,
  maxRotationRad: 3.5 * Math.PI / 180,
  significanceThreshold: 0.4,
  holdNormalMs: 300,
  holdHeroMs: 500,
  holdSectionMs: 800,
  phraseDampingLock: 0.5,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function springStep(
  pos: number, vel: number, target: number, k: number, c: number, dt: number,
): [number, number] {
  const acc = -k * (pos - target) - c * vel;
  const v2 = vel + acc * dt;
  return [pos + v2 * dt, v2];
}

type CameraMode = 'still' | 'pulse' | 'shake';

export class CameraRig {
  private cfg: CameraConfig;
  get config(): Readonly<CameraConfig> { return this.cfg; }

  private canvasW = 960;
  private canvasH = 540;

  private _identity: SongMotionIdentity | null = null;
  private _sectionMods: SectionMotionMod[] = [];

  private _posX = 0; private _velX = 0;
  private _posY = 0; private _velY = 0;
  private _posZ = 0; private _velZ = 0;
  private _posR = 0; private _velR = 0;

  private _mode: CameraMode = 'still';
  private _shakeAmplitude = 0;
  private _shakePhase = 0;

  private _holdUntil = 0;
  private _phraseDamping = 0;

  private _energyAvg = 0.3;
  private _amplitudeScale = 1.0;

  private _sectionIdx = -1;
  private _lastSectionChangeMs = -Infinity;

  private _prevBeatIndex = -1;

  private _cachedTransform: SubjectTransform | null = null;

  constructor(config?: Partial<CameraConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  setSongIdentity(identity: SongMotionIdentity): void {
    this._identity = identity;
  }

  setSectionMods(mods: SectionMotionMod[]): void {
    this._sectionMods = mods;
  }

  setSectionIndex(idx: number): void {
    if (idx !== this._sectionIdx && this._sectionIdx >= 0) {
      this._lastSectionChangeMs = performance.now();
    }
    this._sectionIdx = Math.max(0, idx);
  }

  setPhraseDamping(damping: number): void {
    this._phraseDamping = damping;
  }

  setAmplitudeScale(scale: number): void {
    this._amplitudeScale = Math.max(0, Math.min(1, scale));
  }

  // TODO: implement mood-driven camera behavior using visualMood vocabulary
  setSectionFromMood(_m: string): void {}
  // TODO: implement energy-driven camera intensity
  setEnergy(_e: number): void {}
  setViewport(w: number, h: number): void { this.canvasW = w; this.canvasH = h; }
  loadSongData(): void {}
  /** Viewport scale — all pixel offsets designed for 960px, scale proportionally */
  private get _vpScale(): number {
    return Math.min(this.canvasW, this.canvasH) / 960;
  }

  update(deltaMs: number, beatState: BeatState | null, focus?: SubjectFocus | null): void {
    const cfg = this.cfg;
    const dt = Math.min(deltaMs, 100) / 1000;
    const nowMs = performance.now();

    if (!beatState) {
      this._stepSprings(dt);
      this._buildOutput();
      return;
    }

    const energy = beatState.energy;
    const hitStr = beatState.hitStrength;
    const strength = beatState.strength;
    const isNewBeat = beatState.beatIndex !== this._prevBeatIndex && beatState.beatIndex >= 0;
    const isDownbeat = beatState.isDownbeat;

    const id = this._identity;
    const gravity = id?.gravity ?? 0.5;
    const latBias = id?.lateralBias ?? 0.35;
    const sharpness = id?.hitSharpness ?? 0.5;

    const secMod = this._sectionMods[this._sectionIdx];
    const ampScale = secMod?.amplitudeScale ?? 1.0;

    const heroActive = !!(focus?.heroActive && (focus?.emphasisLevel ?? 0) >= 4);
    const heroMult = heroActive ? 1.5 : 1.0;
    const isSectionArrival = (nowMs - this._lastSectionChangeMs) < 300;

    this._energyAvg += (energy - this._energyAvg) * Math.min(1, dt * 0.5);
    const spike = energy - this._energyAvg;

    if (spike > 0.3 && energy > 0.6 && this._mode !== 'shake') {
      this._mode = 'shake';
      this._shakeAmplitude = Math.min(1, spike) * cfg.shakeMax * this._vpScale * ampScale;
      this._shakePhase = 0;
      this._holdUntil = nowMs + 1500;
    }

    if (this._mode === 'shake') {
      this._shakeAmplitude *= Math.exp(-dt / cfg.shakeDecaySec);
      this._shakePhase += dt;
      if (this._shakeAmplitude < 1.5) {
        this._mode = 'still';
        this._shakeAmplitude = 0;
      }
    }

    if (this._mode !== 'shake' && isNewBeat) {
      const significance = hitStr * strength;
      const isSignificant = significance > cfg.significanceThreshold || isDownbeat || heroActive;
      const inHold = nowMs < this._holdUntil;
      const phraseLocked = this._phraseDamping > cfg.phraseDampingLock;
      const phraseReduction = this._phraseDamping > 0.2 && this._phraseDamping <= cfg.phraseDampingLock ? 0.4 : 1.0;

      if (isSignificant && !inHold && !phraseLocked) {
        this._mode = 'pulse';
        this._fireBeatImpulse(beatState, ampScale * phraseReduction, gravity, latBias, heroMult, cfg);

        if (isSectionArrival) {
          this._holdUntil = nowMs + cfg.holdSectionMs;
        } else if (heroActive) {
          this._holdUntil = nowMs + cfg.holdHeroMs;
        } else {
          this._holdUntil = nowMs + cfg.holdNormalMs;
        }
      }
    }

    if (this._mode === 'pulse') {
      const displacement = Math.abs(this._posX) + Math.abs(this._posY)
        + Math.abs(this._posZ) * 500 + Math.abs(this._posR) * 500;
      if (displacement < 0.5) {
        this._mode = 'still';
      }
    }

    const kMod = 1 + (sharpness - 0.5) * 0.6;
    this._stepSprings(dt, kMod);

    this._buildOutput();
    this._prevBeatIndex = beatState.beatIndex;
  }

  private _fireBeatImpulse(
    bs: BeatState,
    ampScale: number,
    gravity: number,
    latBias: number,
    heroMult: number,
    cfg: CameraConfig,
  ): void {
    const hitStr = bs.hitStrength;
    const energy = bs.energy;
    const strength = bs.strength;
    const isDownbeat = bs.isDownbeat;
    const db = isDownbeat ? cfg.downbeatMult : 1.0;
    const gateBoost = 1.4;

    const amp = Math.max(0.1, energy * 0.6 + strength * 0.3 + hitStr * 0.4)
      * ampScale * heroMult * db * gateBoost;

    const timeSinceChange = performance.now() - this._lastSectionChangeMs;
    const releaseMult = timeSinceChange < 300 ? 1.5 : 1.0;
    const finalAmp = amp * releaseMult * (this._amplitudeScale ?? 1.0);

    if (bs.hitType === 'bass' || (bs.hitType === 'none' && isDownbeat)) {
      this._posY = -cfg.punchY * this._vpScale * finalAmp * (0.5 + gravity * 0.5);
      this._velY = 0;
    } else if (bs.hitType === 'transient') {
      const dir = bs.beatIndex % 2 === 0 ? 1 : -1;
      this._posX = cfg.snapX * this._vpScale * finalAmp * dir * (0.5 + latBias * 0.5);
      this._velX = 0;
      this._posR = cfg.tiltRad * finalAmp * dir * 0.5;
      this._velR = 0;
    } else if (bs.hitType === 'tonal') {
      this._posR = cfg.tiltRad * finalAmp * 0.3 * ((bs.beatIndex % 3 === 0) ? 1 : -1);
      this._velR = 0;
    } else {
      const dir = bs.beatIndex % 2 === 0 ? 1 : -1;
      this._posY = -cfg.punchY * this._vpScale * finalAmp * 0.5;
      this._velY = 0;
      this._posX = cfg.snapX * this._vpScale * finalAmp * 0.3 * dir;
      this._velX = 0;
    }
  }

  private _stepSprings(dt: number, kMod: number = 1): void {
    const k = this.cfg.springK * kMod;
    const c = this.cfg.springC * kMod;
    [this._posX, this._velX] = springStep(this._posX, this._velX, 0, k, c, dt);
    [this._posY, this._velY] = springStep(this._posY, this._velY, 0, k, c, dt);
    // Z spring disabled — zoom removed to let fitTextToViewport control text size
    [this._posR, this._velR] = springStep(this._posR, this._velR, 0, k, c, dt);
  }

  private _buildOutput(): void {
    const cfg = this.cfg;
    let shakeX = 0;
    let shakeY = 0;
    if (this._mode === 'shake' && this._shakeAmplitude > 0.5) {
      const t = this._shakePhase;
      shakeX = this._shakeAmplitude * Math.sin(t * 7.1 + 1.3);
      shakeY = this._shakeAmplitude * Math.cos(t * 5.7 + 2.9);
    }

    this._cachedTransform = {
      zoom: 1.0, // zoom disabled — fitTextToViewport sizes text to fill canvas, zoom fights that
      proximity: Math.max(0, this._posZ),
      offsetX: clamp(this._posX + shakeX, -cfg.maxOffsetPx * this._vpScale, cfg.maxOffsetPx * this._vpScale),
      offsetY: clamp(this._posY + shakeY, -cfg.maxOffsetPx * this._vpScale, cfg.maxOffsetPx * this._vpScale),
      rotation: clamp(this._posR, -cfg.maxRotationRad, cfg.maxRotationRad),
      shakeX,
      shakeY,
    };
  }

  getSubjectTransform(): SubjectTransform {
    return this._cachedTransform ?? {
      zoom: 1,
      proximity: 0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      shakeX: 0,
      shakeY: 0,
    };
  }

  getProximity(): number { return Math.max(0, (this._cachedTransform?.zoom ?? 1) - 1); }
  get drop(): number { return this._mode === 'shake' ? this._shakeAmplitude / this.cfg.shakeMax : 0; }
  get currentGrammarName(): string { return this._mode; }
  get anticipation(): number { return 0; }

  applyTransform(ctx: CanvasRenderingContext2D, layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    ctx.save();
    const depth = layer === 'near' ? 0.85
      : layer === 'mid' || layer === 'atmosphere' ? 0.5
      : 0.15;
    const t = this.getSubjectTransform();
    const z = 1 + (t.zoom - 1) * depth;
    const ox = t.offsetX * depth;
    const oy = t.offsetY * depth;
    const sx = t.shakeX * depth;
    const sy = t.shakeY * depth;
    const rot = t.rotation * depth;
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;
    if (Math.abs(z - 1) > 0.0005 || Math.abs(ox) > 0.1 || Math.abs(oy) > 0.1
      || Math.abs(sx) > 0.1 || Math.abs(sy) > 0.1 || Math.abs(rot) > 0.0001) {
      ctx.translate(cx + ox + sx, cy + oy + sy);
      if (Math.abs(rot) > 0.0001) ctx.rotate(rot);
      if (Math.abs(z - 1) > 0.0005) ctx.scale(z, z);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void { ctx.restore(); }

  reset(): void {
    this._posX = this._velX = this._posY = this._velY = 0;
    this._posZ = this._velZ = this._posR = this._velR = 0;
    this._shakeAmplitude = 0;
    this._shakePhase = 0;
    this._energyAvg = 0.3;
    this._mode = 'still';
    this._holdUntil = 0;
    this._phraseDamping = 0;
    this._prevBeatIndex = -1;
    this._sectionIdx = -1;
    this._lastSectionChangeMs = -Infinity;
    this._cachedTransform = null;
  }

  softReset(): void {
    this._velX = this._velY = this._velZ = this._velR = 0;
    this._shakeAmplitude = 0;
    this._mode = 'still';
    this._holdUntil = 0;
    this._cachedTransform = null;
  }
}
