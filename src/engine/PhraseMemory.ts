/**
 * PhraseMemory — tracks bar position and computes musical tension for word dance.
 *
 * A choreographer counts bars: "5, 6, 7, 8." This is the equivalent.
 * Tension ramps from 0.6→1.0 over a 4-bar phrase, modulating how much
 * the dance grammar moves the words. At phrase boundaries, tension
 * releases — amplitude peaks then resets.
 *
 * Also mirrors the CameraRig's anticipation signal: when the camera
 * freezes before a section change, words dampen their dance too.
 * On release, words explode outward with accumulated energy.
 *
 * RULES:
 * - No React. No hooks.
 * - Stateful (unlike BeatConductor) — tracks position across frames.
 * - Cheap: 6 floats of state, ~10 multiplications per tick.
 */

export interface PhraseState {
  /** Which bar we're in (absolute, from song start) */
  barIndex: number;
  /** 0-3: which bar within the current 4-bar phrase */
  phraseBar: number;
  /** 0-1: position within the 4-bar phrase (0 = phrase start, 1 = phrase end) */
  phrasePct: number;
  /** 0-1: tension level — ramps over the phrase, modulates dance amplitude */
  tension: number;
  /** 0-1: anticipation mirror — follows camera anticipation, dampens dance */
  anticipation: number;
  /** 0-1: release impulse — fires on phrase/section boundaries, decays fast */
  release: number;
  /** Combined amplitude multiplier: tension * (1 - anticipation) + release */
  amplitudeMultiplier: number;
}

const BEATS_PER_BAR = 4;
const BARS_PER_PHRASE = 4;
const TENSION_FLOOR = 0.6;
const TENSION_CEIL = 1.0;
const PHRASE_RELEASE = 0.3;
const SECTION_RELEASE = 0.6;
const RELEASE_DECAY_RATE = 4.0;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export class PhraseMemory {
  private _barIndex = -1;
  private _phraseBar = 0;
  private _phrasePct = 0;
  private _tension = TENSION_FLOOR;
  private _anticipation = 0;
  private _release = 0;
  private _lastBeatIndex = -1;
  private _lastSectionIndex = -1;

  tick(
    beatIndex: number,
    beatPhase: number,
    cameraAnticipation: number,
    sectionIndex: number,
    sectionIsRelease: boolean,
    dt: number,
  ): PhraseState {
    if (beatIndex < 0) {
      return {
        barIndex: 0,
        phraseBar: 0,
        phrasePct: 0,
        tension: TENSION_FLOOR,
        anticipation: 0,
        release: 0,
        amplitudeMultiplier: TENSION_FLOOR,
      };
    }

    const barIndex = Math.floor(beatIndex / BEATS_PER_BAR);
    const barBeat = beatIndex % BEATS_PER_BAR;
    const barPhase = (barBeat + beatPhase) / BEATS_PER_BAR;

    const phraseBar = barIndex % BARS_PER_PHRASE;
    const phrasePct = (phraseBar + barPhase) / BARS_PER_PHRASE;

    if (barIndex !== this._barIndex && barIndex >= 0) {
      const oldPhraseBar = this._barIndex >= 0 ? (this._barIndex % BARS_PER_PHRASE) : -1;
      const newPhraseBar = barIndex % BARS_PER_PHRASE;

      if (newPhraseBar === 0 && oldPhraseBar !== 0 && this._barIndex >= 0) {
        this._release = Math.min(1, this._release + PHRASE_RELEASE);
      }

      this._barIndex = barIndex;
    }

    if (sectionIndex >= 0 && sectionIndex !== this._lastSectionIndex) {
      if (this._lastSectionIndex >= 0) {
        const releaseAmt = sectionIsRelease ? SECTION_RELEASE : PHRASE_RELEASE;
        this._release = Math.min(1, this._release + releaseAmt);
      }
      this._lastSectionIndex = sectionIndex;
    }

    this._tension = TENSION_FLOOR + (TENSION_CEIL - TENSION_FLOOR) * smoothstep(phrasePct);
    this._anticipation += (cameraAnticipation - this._anticipation) * Math.min(1, dt * 4);
    this._release = Math.max(0, this._release - RELEASE_DECAY_RATE * dt);

    this._phraseBar = phraseBar;
    this._phrasePct = phrasePct;
    this._lastBeatIndex = beatIndex;

    const tensionComponent = this._tension * (1 - this._anticipation * 0.7);
    const releaseComponent = this._release * 1.5;
    const amplitudeMultiplier = Math.min(1.8, tensionComponent + releaseComponent);

    return {
      barIndex,
      phraseBar,
      phrasePct,
      tension: this._tension,
      anticipation: this._anticipation,
      release: this._release,
      amplitudeMultiplier,
    };
  }

  reset(): void {
    this._barIndex = -1;
    this._phraseBar = 0;
    this._phrasePct = 0;
    this._tension = TENSION_FLOOR;
    this._anticipation = 0;
    this._release = 0;
    this._lastBeatIndex = -1;
    this._lastSectionIndex = -1;
  }
}
