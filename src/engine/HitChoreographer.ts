/**
 * HitChoreographer — per-instrument-type word motion with physics decay.
 *
 * Mirrors the CameraRig's three-layer beat grammar for the text layer:
 *
 *   BASS:       Y slam DOWN (gravity). Slow underdamped float back (~400ms).
 *               Words feel heavy. The kick drum has weight.
 *
 *   TRANSIENT:  X whip LEFT/RIGHT (alternating). Fast critically damped snap (~120ms).
 *               Words feel the snare's crack. Sharp, precise, gone.
 *
 *   TONAL:      Scale bloom outward + gentle rotation. Medium return (~300ms).
 *               Words feel chord warmth expanding. Intimate, enveloping.
 *
 * Each channel is an independent spring-damper with character-matched physics.
 * Spring constants match CameraRig exactly so camera and words move in harmony.
 *
 * Output stacks on top of grammar dance (Prompt 5) + SubsystemResponse (existing).
 * The three layers of word beat response:
 *   1. Grammar (continuous dance shape) — bounce/sway/slam etc.
 *   2. SubsystemResponse (per-emphasis beat reaction) — beatNudgeY
 *   3. HitChoreographer (per-instrument impulse + decay) — THIS
 *
 * RULES:
 * - No React. No hooks.
 * - Stateful (maintains spring positions/velocities across frames).
 * - Cheap: 8 spring-damper updates per tick (~16 multiplications).
 */

export interface HitMotion {
  /** Horizontal offset in compile-space pixels */
  dX: number;
  /** Vertical offset in compile-space pixels (negative = upward) */
  dY: number;
  /** Scale additive (0 = no change, 0.05 = 5% larger) */
  dScale: number;
  /** Rotation in radians */
  rotation: number;
}

function spring(pos: number, vel: number, k: number, c: number, dt: number): [number, number] {
  const acc = -k * pos - c * vel;
  const v2 = vel + acc * dt;
  return [pos + v2 * dt, v2];
}

/** Bass: vertical slam amplitude. 5% of compile height = ~27px at 540p. */
const BASS_AMP_Y = 0.05;
/** Bass: scale compression on impact (words feel squished by gravity) */
const BASS_SCALE = 0.04;

/** Transient: lateral whip amplitude. 3% of compile height = ~16px at 540p. */
const TRANS_AMP_X = 0.03;
/** Transient: rotation (dutch tilt). Small but visible. */
const TRANS_ROT = 0.06;

/** Tonal: scale bloom. Words expand outward on chord changes. */
const TONAL_SCALE = 0.06;
/** Tonal: gentle rotation accompanying the bloom. */
const TONAL_ROT = 0.03;
/** Tonal: gentle upward float (intimacy — moving toward the viewer). */
const TONAL_AMP_Y = 0.015;

export class HitChoreographer {
  private compileH = 540;

  private _bassY = 0;
  private _bassYV = 0;
  private _bassScale = 0;
  private _bassScaleV = 0;

  private _transX = 0;
  private _transXV = 0;
  private _transRot = 0;
  private _transRotV = 0;

  private _tonalScale = 0;
  private _tonalScaleV = 0;
  private _tonalRot = 0;
  private _tonalRotV = 0;
  private _tonalY = 0;
  private _tonalYV = 0;

  private _prevBeatIndex = -1;

  setCompileHeight(h: number): void {
    if (Number.isFinite(h) && h > 0) this.compileH = h;
  }

  tick(
    beatIndex: number,
    hitType: 'bass' | 'transient' | 'tonal' | 'none',
    hitStrength: number,
    energy: number,
    isDownbeat: boolean,
    dt: number,
  ): HitMotion {
    const h = this.compileH;
    const cdt = Math.min(dt, 0.05);

    const isNewBeat = beatIndex >= 0 && beatIndex !== this._prevBeatIndex;
    if (isNewBeat) {
      this._prevBeatIndex = beatIndex;
      const str = Math.max(0, Math.min(1, hitStrength));
      const db = isDownbeat ? 1.4 : 1.0;

      if (hitType === 'bass' || (hitType === 'none' && isDownbeat)) {
        const imp = str * db * Math.max(0.4, energy);
        this._bassY = h * BASS_AMP_Y * imp;
        this._bassYV = 0;
        this._bassScale = -BASS_SCALE * imp;
        this._bassScaleV = 0;
      } else if (hitType === 'transient') {
        const dir = beatIndex % 2 === 0 ? 1 : -1;
        const imp = str * Math.max(0.5, energy);
        this._transX = h * TRANS_AMP_X * imp * dir;
        this._transXV = 0;
        this._transRot = TRANS_ROT * imp * dir;
        this._transRotV = 0;
      } else if (hitType === 'tonal') {
        const imp = str * Math.max(0.3, energy);
        this._tonalScale = TONAL_SCALE * imp;
        this._tonalScaleV = 0;
        this._tonalRot = TONAL_ROT * imp * (beatIndex % 2 === 0 ? 1 : -1);
        this._tonalRotV = 0;
        this._tonalY = -h * TONAL_AMP_Y * imp;
        this._tonalYV = 0;
      }
    }

    [this._bassY, this._bassYV] = spring(this._bassY, this._bassYV, 25, 8, cdt);
    [this._bassScale, this._bassScaleV] = spring(this._bassScale, this._bassScaleV, 25, 8, cdt);

    [this._transX, this._transXV] = spring(this._transX, this._transXV, 180, 26, cdt);
    [this._transRot, this._transRotV] = spring(this._transRot, this._transRotV, 180, 26, cdt);

    [this._tonalScale, this._tonalScaleV] = spring(this._tonalScale, this._tonalScaleV, 40, 12, cdt);
    [this._tonalRot, this._tonalRotV] = spring(this._tonalRot, this._tonalRotV, 40, 12, cdt);
    [this._tonalY, this._tonalYV] = spring(this._tonalY, this._tonalYV, 40, 12, cdt);

    return {
      dX: this._transX,
      dY: this._bassY + this._tonalY,
      dScale: this._bassScale + this._tonalScale,
      rotation: this._transRot + this._tonalRot,
    };
  }

  reset(): void {
    this._bassY = this._bassYV = 0;
    this._bassScale = this._bassScaleV = 0;
    this._transX = this._transXV = 0;
    this._transRot = this._transRotV = 0;
    this._tonalScale = this._tonalScaleV = 0;
    this._tonalRot = this._tonalRotV = 0;
    this._tonalY = this._tonalYV = 0;
    this._prevBeatIndex = -1;
  }
}
