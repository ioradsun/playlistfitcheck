/**
 * IntensityRouter — derives motion profile from audio signals.
 *
 * No section labels. No AI mood strings. The audio IS the score.
 * One smoothed intensity value drives every subsystem through response curves.
 *
 * The 70/20/10 rule:
 *   Text: always responds (linear curve)
 *   Background: threshold-gated at 0.4
 *   Full text-camera sync: gated at 0.7
 */

import type { BeatState } from './BeatConductor';

export interface MotionProfile {
  intensity: number;
  textNodMult: number;
  textWaveMult: number;
  textHeroMult: number;
  /** 0→0.06 — zoom pulse amplitude on beat. Scales with intensity. */
  bgPulseAmplitude: number;
  cameraBeatMult: number;
  cameraShakeMult: number;
  textSyncFraction: number;
  particleDensityMult: number;
  particleSpeedMult: number;
}

const ENERGY_TAU = 0.8; // responds to section changes within ~1 beat at 120bpm
const BRIGHTNESS_TAU = 1.2; // mood shifts track within ~2 beats
const TREND_TAU = 2.0; // trend stays slow — building/dropping is the only slow signal

const CAMERA_THRESHOLD = 0.3;
const SYNC_THRESHOLD = 0.7;
const SHAKE_THRESHOLD = 0.85;

export class IntensityRouter {
  private _smoothEnergy = 0;
  private _smoothBrightness = 0.5;
  private _prevSmoothEnergy = 0;
  private _trendAccum = 0;
  private _profile: MotionProfile = {
    intensity: 0,
    textNodMult: 0.5, textWaveMult: 0.6, textHeroMult: 1.0,
    bgPulseAmplitude: 0,
    cameraBeatMult: 0, cameraShakeMult: 0, textSyncFraction: 0,
    particleDensityMult: 0.2, particleSpeedMult: 0.3,
  };

  update(beat: BeatState, dt: number): MotionProfile {
    const p = this._profile;
    const eAlpha = 1 - Math.exp(-dt / ENERGY_TAU);
    const bAlpha = 1 - Math.exp(-dt / BRIGHTNESS_TAU);
    const tAlpha = 1 - Math.exp(-dt / TREND_TAU);

    this._smoothEnergy += (beat.energy - this._smoothEnergy) * eAlpha;
    this._smoothBrightness += (beat.brightness - this._smoothBrightness) * bAlpha;

    const rawTrend = (this._smoothEnergy - this._prevSmoothEnergy) / Math.max(0.001, dt);
    this._trendAccum += (rawTrend - this._trendAccum) * tAlpha;
    this._prevSmoothEnergy = this._smoothEnergy;

    const trend = Math.max(-1, Math.min(1, this._trendAccum * 3));
    const trendBoost = trend > 0 ? trend * 0.12 : trend * 0.08;
    const intensity = Math.max(0, Math.min(1,
      this._smoothEnergy * 0.65 + this._smoothBrightness * 0.25 + trendBoost,
    ));
    p.intensity = intensity;

    // Text: always responds. Linear with floor.
    p.textNodMult = 0.5 + intensity * 1.0;
    p.textWaveMult = 0.6 + intensity * 0.6;
    // Hero: INVERSE — quieter = more hero emphasis (one word in silence feels dramatic)
    p.textHeroMult = 1.2 - intensity * 0.3;

    // Background pulse: linear with intensity. 1% at idle, up to 6% at peak.
    p.bgPulseAmplitude = 0.01 + intensity * 0.05;

    // Camera: quadratic ramp above threshold
    const camRaw = intensity > CAMERA_THRESHOLD ? (intensity - CAMERA_THRESHOLD) / (1 - CAMERA_THRESHOLD) : 0;
    p.cameraBeatMult = camRaw * camRaw;
    p.cameraShakeMult = intensity > SHAKE_THRESHOLD ? (intensity - SHAKE_THRESHOLD) / (1 - SHAKE_THRESHOLD) : 0;

    // Text-camera sync: 0→15% bleed, gated at 0.7
    p.textSyncFraction = intensity > SYNC_THRESHOLD ? ((intensity - SYNC_THRESHOLD) / (1 - SYNC_THRESHOLD)) * 0.15 : 0;

    // Particles: proportional
    p.particleDensityMult = 0.2 + intensity * 1.8;
    p.particleSpeedMult = 0.3 + intensity * 1.5;

    return p;
  }

  reset(): void {
    this._smoothEnergy = 0;
    this._smoothBrightness = 0.5;
    this._prevSmoothEnergy = 0;
    this._trendAccum = 0;
  }

  get smoothedEnergy(): number { return this._smoothEnergy; }
}
