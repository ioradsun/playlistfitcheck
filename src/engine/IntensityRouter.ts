/**
 * IntensityRouter — derives motion profile from audio signals.
 */

import type { BeatState } from './BeatConductor';

export interface MotionProfile {
  intensity: number;
  /** 0→0.06 — zoom pulse amplitude on beat. Scales with intensity. */
  bgPulseAmplitude: number;
  cameraBeatMult: number;
  textSyncFraction: number;
  particleDensityMult: number;
  particleSpeedMult: number;
}

const ENERGY_TAU = 0.8;
const BRIGHTNESS_TAU = 1.2;
const TREND_TAU = 2.0;

const CAMERA_THRESHOLD = 0.3;
const SYNC_THRESHOLD = 0.7;

export class IntensityRouter {
  private _smoothEnergy = 0;
  private _smoothBrightness = 0.5;
  private _prevSmoothEnergy = 0;
  private _trendAccum = 0;
  private _profile: MotionProfile = {
    intensity: 0,
    bgPulseAmplitude: 0,
    cameraBeatMult: 0,
    textSyncFraction: 0,
    particleDensityMult: 0.2,
    particleSpeedMult: 0.3,
  };

  update(beat: BeatState, dt: number, renderMode: "lyric" | "beat" = "lyric"): MotionProfile {
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

    // Lyric: subtle pulse for readability. Beat: stronger, music-video pulse.
    const pulseBase = renderMode === "beat" ? 0.03 : 0.01;
    const pulseScale = renderMode === "beat" ? 0.15 : 0.05;
    p.bgPulseAmplitude = pulseBase + intensity * pulseScale;

    const camRaw = intensity > CAMERA_THRESHOLD ? (intensity - CAMERA_THRESHOLD) / (1 - CAMERA_THRESHOLD) : 0;
    const camScale = renderMode === "beat" ? 1.5 : 1.0;
    p.cameraBeatMult = camRaw * camRaw * camScale;

    p.textSyncFraction = intensity > SYNC_THRESHOLD ? ((intensity - SYNC_THRESHOLD) / (1 - SYNC_THRESHOLD)) * 0.15 : 0;

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
