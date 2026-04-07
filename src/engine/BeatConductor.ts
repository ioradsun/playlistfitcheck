/**
 * BeatConductor — the single rhythmic driver for the entire visual engine.
 *
 * Every system listens to this: words, backgrounds, particles, camera, lighting.
 * One signal, one heartbeat. Different systems respond with different amplitudes
 * but everything is synchronized.
 *
 * RULES:
 * - No imports from React. No hooks, no state, no effects.
 * - Constructed once with beat_grid data, immutable after that.
 * - Two query modes: real-time (per-frame) and window (pre-compute for a time range).
 * - Every method is pure — same input, same output, no side effects.
 */

import {
  type PhraseMotionBudget,
  type SectionMotionMod,
  type SongMotionIdentity,
  computeInterBeatSway,
  HeroEventTracker,
} from "@/engine/MotionIdentity";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface BeatGrid {
  bpm: number;
  beats: number[];
  confidence: number;
  /** V2: Onset/hit events with strength — for punch zoom, slam, shake */
  hits?: Array<{ time: number; strength: number; type: 'transient' | 'bass' | 'tonal' }>;
  /** V2: Per-beat energy (0-1) aligned to beat positions */
  beatEnergies?: number[];
  /** V2: Full audio analysis (not serialized to DB — computed at runtime) */
  _analysis?: import('@/engine/audioAnalyzer').AudioAnalysis;
  /** Runtime-only: phase offset in seconds for synthetic beat generation. Not serialized to DB. */
  _phase?: number;
}

/** Real-time beat state at a specific moment. Queried every frame. */
export interface BeatState {
  /** 0-1 Gaussian pulse peaking on each beat hit */
  pulse: number;
  /** 0-1 linear phase between previous and next beat (0 = on beat, 1 = just before next) */
  phase: number;
  /** Index of the most recent beat */
  beatIndex: number;
  /** Timestamp of the next upcoming beat (seconds) */
  nextBeat: number;
  /** Timestamp of the most recent beat (seconds) */
  prevBeat: number;
  /** Seconds until the next beat */
  timeToNext: number;
  /** Is this a downbeat (first beat of a bar)? Based on time signature assumption. */
  isDownbeat: boolean;
  /** 0-1 strength estimate — downbeats stronger, offbeats weaker */
  strength: number;
  /** V2: 0-1 hit impulse with exponential decay — from onset detection */
  hitStrength: number;
  /** V2: 'transient' | 'bass' | 'tonal' | 'none' — type of nearest active hit */
  hitType: 'transient' | 'bass' | 'tonal' | 'none';
  /** V2: 0-1 continuous energy level from RMS analysis */
  energy: number;
  /** V2: 0-1 spectral brightness (dark verse → bright chorus) */
  brightness: number;
}

/** Beat energy profile over a time window. Pre-computed for effect budgeting. */
export interface BeatWindowProfile {
  /** Number of beats that fall within this window */
  beatCount: number;
  /** Average strength of beats in this window */
  avgStrength: number;
  /** Max strength of any single beat in this window */
  peakStrength: number;
  /** Beats per second in this window */
  density: number;
  /** Duration of the window in seconds */
  durationSec: number;
  /** Is beat density increasing, decreasing, or steady across this window? */
  acceleration: 'building' | 'dropping' | 'steady';
  /** Indices of beats that fall within this window */
  beatIndices: number[];
  /** Effect tier this window qualifies for */
  effectTier: EffectTier;
  /** 0-1 normalized energy level (combines density, strength, acceleration) */
  energy: number;
}

export type EffectTier = 'snap' | 'quick' | 'medium' | 'full';

/** Response curves for different subsystems. All driven by the same pulse. */
export interface SubsystemResponse {
  /** Scale multiplier for words (1.0 = no change) */
  wordScale: number;
  /** Glow intensity for words (0 = none) */
  wordGlow: number;
  /** Y offset nudge for words (px in compile space) */
  wordNudgeY: number;
  /** X offset nudge for words (px in compile space) — inter-beat lateral sway */
  wordNudgeX: number;
  /** Ken Burns zoom rate multiplier */
  bgZoomRate: number;
  /** Background sim intensity (fire heat, water disturbance, etc.) */
  bgSimIntensity: number;
  /** Particle density multiplier */
  particleDensity: number;
  /** Particle speed multiplier */
  particleSpeed: number;
  /** Vignette intensity (0 = none, 1 = full) */
  vignetteIntensity: number;
  /** Camera shake amplitude (px) */
  cameraShake: number;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const DEFAULT_BPM = 120;
const PULSE_WIDTH = 0.09; // seconds — Gaussian width of beat pulse
const LOOK_AHEAD = 0.02; // seconds — anticipation for tighter sync
const BEATS_PER_BAR = 4; // assumption — works for 4/4 time
const HIT_DECAY_SEC = 0.2; // 200ms exponential decay for hit impulses

/** Minimum durations (ms) for each effect tier */
const TIER_THRESHOLDS: Record<EffectTier, number> = {
  snap: 0, // always available
  quick: 250,
  medium: 600,
  full: 1500,
};

/** Effect tiers with their allowed entry/exit styles */
export const TIER_ENTRIES: Record<EffectTier, string[]> = {
  snap: ['snap-in', 'cut-in'],
  quick: ['punch-in', 'cut-in', 'snap-in', 'drop', 'plant', 'stomp'],
  medium: ['rise', 'materialize', 'breathe-in', 'drift-in', 'surface', 'focus-in', 'melt-in', 'ink-drop'],
  full: ['slam-down', 'explode-in', 'shatter-in', 'bloom', 'whisper', 'spin-in', 'tumble-in'],
};

export const TIER_EXITS: Record<EffectTier, string[]> = {
  snap: ['snap-out', 'cut-out', 'vanish'],
  quick: ['punch-out', 'snap-out', 'cut-out', 'vanish'],
  medium: ['dissolve', 'drift-up', 'exhale', 'sink', 'evaporate', 'whisper-out', 'blur-out'],
  full: ['shatter', 'burn-out', 'gravity-fall', 'soar', 'launch', 'scatter-fly', 'melt', 'freeze-crack', 'scatter-letters', 'cascade-down', 'cascade-up', 'spin-out', 'peel-off', 'peel-reverse'],
};

// ──────────────────────────────────────────────────────────────
// BeatConductor
// ──────────────────────────────────────────────────────────────

export class BeatConductor {
  private readonly beats: Float64Array;
  private readonly bpm: number;
  private readonly period: number; // seconds between beats
  private readonly confidence: number;
  private readonly beatStrengths: Float32Array; // pre-computed strength per beat
  private readonly songDuration: number;

  // V2: Audio analysis for hit detection and energy
  private readonly hits: Array<{ time: number; strength: number; type: 'transient' | 'bass' | 'tonal' }>;
  private readonly beatEnergies: Float32Array;
  private _hitCursor = 0; // cursor for efficient sequential hit lookup
  private _analysis: import('@/engine/audioAnalyzer').AudioAnalysis | null = null;
  private _songIdentity: SongMotionIdentity | null = null;
  private _sectionMods: SectionMotionMod[] = [];
  private _heroTracker = new HeroEventTracker();

  // Cursor for efficient sequential access (avoids full scan each frame)
  private _cursor = 0;

  constructor(beatGrid: BeatGrid, songDuration: number) {
    let rawBeats = (beatGrid.beats ?? []).filter(b => Number.isFinite(b)).sort((a, b) => a - b);
    const bpm = Math.max(30, beatGrid.bpm ?? DEFAULT_BPM);
    const period = 60 / bpm;

    // ═══ SYNTHETIC BEATS: generate from BPM when beat timestamps are missing ═══
    // Many DB records have bpm but empty beats[]. Without timestamps the
    // BeatConductor returns energy=0 every frame → no background pulse,
    // no particle reactivity, no camera movement. Generate evenly-spaced
    // beats so the visual system always has a heartbeat.
    if (rawBeats.length === 0 && songDuration > 0 && period > 0) {
      const phase = beatGrid._phase ?? 0;
      const synthetic: number[] = [];
      for (let t = phase; t < songDuration; t += period) {
        synthetic.push(t);
      }
      rawBeats = synthetic;
    }

    this.beats = new Float64Array(rawBeats);
    this.bpm = bpm;
    this.period = period;
    this.confidence = rawBeats.length === (beatGrid.beats ?? []).length
      ? (beatGrid.confidence ?? 0.5)
      : 0.3; // lower confidence for synthetic beats
    this.songDuration = songDuration;

    // V2: Store hit events
    this.hits = (beatGrid.hits ?? []).filter(h => Number.isFinite(h.time)).sort((a, b) => a.time - b.time);

    // Pre-compute beat strengths: combine positional strength with audio energy
    this.beatStrengths = new Float32Array(rawBeats.length);
    const audioEnergies = beatGrid.beatEnergies;
    for (let i = 0; i < rawBeats.length; i++) {
      const barPosition = i % BEATS_PER_BAR;
      let positionalStrength: number;
      if (barPosition === 0) positionalStrength = 1.0; // downbeat
      else if (barPosition === 2) positionalStrength = 0.7; // backbeat
      else positionalStrength = 0.4; // offbeat

      // Blend positional strength with actual audio energy (if available)
      if (audioEnergies && i < audioEnergies.length) {
        this.beatStrengths[i] = positionalStrength * 0.4 + audioEnergies[i] * 0.6;
      } else {
        this.beatStrengths[i] = positionalStrength;
      }
    }

    // Store analysis reference
    this._analysis = beatGrid._analysis ?? null;
  }

  /** V2: Attach audio analysis after construction (for runtime-computed analysis) */
  setAnalysis(analysis: import('@/engine/audioAnalyzer').AudioAnalysis): void {
    this._analysis = analysis;
    // Re-inject hits if we didn't have them at construction
    if (this.hits.length === 0 && analysis.hits.length > 0) {
      this.hits.length = 0;
      this.hits.push(...analysis.hits);
    }
  }

  setSongIdentity(identity: SongMotionIdentity): void {
    this._songIdentity = identity;
  }

  setSectionMods(mods: SectionMotionMod[]): void {
    this._sectionMods = mods;
  }

  getHeroTracker(): HeroEventTracker {
    return this._heroTracker;
  }

  // ─── Real-time query (called every frame) ───

  /** Get the complete beat state at a specific time. O(1) amortized via cursor. */
  getState(tSec: number): BeatState {
    const beats = this.beats;
    const len = beats.length;

    if (len === 0) {
      return {
        pulse: 0, phase: 0, beatIndex: -1,
        nextBeat: 0, prevBeat: 0, timeToNext: Infinity,
        isDownbeat: false, strength: 0,
        hitStrength: 0, hitType: 'none', energy: 0, brightness: 0.5,
      };
    }

    // Advance cursor forward
    while (this._cursor + 1 < len && beats[this._cursor + 1] <= tSec) this._cursor++;
    // Rewind if needed (seek backward)
    while (this._cursor > 0 && beats[this._cursor] > tSec) this._cursor--;

    const beatIndex = beats[this._cursor] <= tSec ? this._cursor : -1;
    const prevBeat = beatIndex >= 0 ? beats[beatIndex] : beats[0];
    const nextBeatIdx = Math.min(len - 1, Math.max(0, beatIndex + 1));
    const nextBeat = beats[nextBeatIdx];
    const timeToNext = Math.max(0, nextBeat - tSec);

    // Phase: linear 0-1 between beats (uses local interval for rubato/tempo-change songs)
    const localPeriod = (beatIndex >= 0 && nextBeatIdx !== beatIndex)
      ? Math.max(0.05, nextBeat - prevBeat) // actual interval between these two beats
      : this.period;                          // fallback to BPM-derived period at boundaries
    const phase = localPeriod > 0
      ? Math.max(0, Math.min(1, (tSec - prevBeat) / localPeriod))
      : 0;

    // Pulse: Gaussian centered on nearest beat (with look-ahead)
    const probe = tSec + LOOK_AHEAD;
    let minDist = Infinity;
    // Check neighbors of cursor only (O(1) not O(n))
    for (let i = Math.max(0, beatIndex - 1); i <= Math.min(len - 1, beatIndex + 2); i++) {
      const d = Math.abs(beats[i] - probe);
      if (d < minDist) minDist = d;
    }
    const pulse = Math.exp(-(minDist * minDist) / (PULSE_WIDTH * PULSE_WIDTH));

    const isDownbeat = beatIndex >= 0 && (beatIndex % BEATS_PER_BAR === 0);
    const strength = beatIndex >= 0 ? this.beatStrengths[beatIndex] : 0;

    // V2: Hit detection — find nearest active hit with decay
    let hitStrength = 0;
    let hitType: BeatState['hitType'] = 'none';
    if (this.hits.length > 0) {
      // Advance hit cursor
      while (this._hitCursor + 1 < this.hits.length && this.hits[this._hitCursor + 1].time <= tSec) this._hitCursor++;
      while (this._hitCursor > 0 && this.hits[this._hitCursor].time > tSec) this._hitCursor--;

      // Check neighbors for active hit with decay
      for (let i = Math.max(0, this._hitCursor - 1); i <= Math.min(this.hits.length - 1, this._hitCursor + 1); i++) {
        const dt = tSec - this.hits[i].time;
        if (dt >= 0 && dt < HIT_DECAY_SEC) {
          const decay = Math.exp(-dt / (HIT_DECAY_SEC * 0.3));
          const s = this.hits[i].strength * decay;
          if (s > hitStrength) {
            hitStrength = s;
            hitType = this.hits[i].type;
          }
        }
      }
    }

    // V2: Energy and brightness from audio analysis — or synthesize from beat grid
    let energy = 0;
    let brightness = 0.5;
    if (this._analysis) {
      const { frames, frameRate } = this._analysis;
      if (frames.length > 0) {
        const idx = Math.min(frames.length - 1, Math.max(0, Math.round(tSec * frameRate)));
        energy = frames[idx].energy;
        brightness = frames[idx].brightness;
      }
    } else if (len > 0) {
      // No runtime analysis available (DB playback). Synthesize energy from beat proximity.
      // Energy = smoothed envelope that rises near beats and decays between them.
      // This gives the beat visualizer bars something to work with.
      const beatProximity = 1.0 - Math.min(1.0, minDist / Math.max(0.1, this.period * 0.5));
      const strengthFactor = strength > 0 ? strength : 0.5;
      energy = Math.max(0.15, beatProximity * 0.7 * strengthFactor + pulse * 0.3);
      // Brightness: approximate from song position (darker in verses, brighter in choruses)
      const songProgress = this.songDuration > 0 ? Math.max(0, Math.min(1, tSec / this.songDuration)) : 0;
      brightness = 0.4 + songProgress * 0.2 + pulse * 0.1;
    }

    return {
      pulse: Math.max(0, Math.min(1, pulse)),
      phase,
      beatIndex,
      nextBeat,
      prevBeat,
      timeToNext,
      isDownbeat,
      strength,
      hitStrength: Math.max(0, Math.min(1, hitStrength)),
      hitType,
      energy,
      brightness,
    };
  }

  // ─── Window query (pre-computed for effect budgeting) ───

  /** Analyze beat energy over a time window. Used at compile time for effect selection. */
  getWindowProfile(startSec: number, endSec: number): BeatWindowProfile {
    const duration = Math.max(0.01, endSec - startSec);
    const beats = this.beats;
    const indices: number[] = [];

    // Binary search for first beat in window
    let lo = 0, hi = beats.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] < startSec) lo = mid + 1;
      else hi = mid - 1;
    }
    // Collect all beats in [startSec, endSec]
    for (let i = lo; i < beats.length && beats[i] <= endSec; i++) {
      indices.push(i);
    }

    const beatCount = indices.length;
    const density = beatCount / duration;

    let avgStrength = 0;
    let peakStrength = 0;
    for (const idx of indices) {
      const s = this.beatStrengths[idx];
      avgStrength += s;
      if (s > peakStrength) peakStrength = s;
    }
    avgStrength = beatCount > 0 ? avgStrength / beatCount : 0;

    // Acceleration: compare density of first half vs second half
    const midSec = startSec + duration / 2;
    let firstHalfBeats = 0;
    let secondHalfBeats = 0;
    for (const idx of indices) {
      if (beats[idx] < midSec) firstHalfBeats++;
      else secondHalfBeats++;
    }
    let acceleration: 'building' | 'dropping' | 'steady' = 'steady';
    if (beatCount >= 4) {
      const ratio = secondHalfBeats / Math.max(1, firstHalfBeats);
      if (ratio > 1.3) acceleration = 'building';
      else if (ratio < 0.7) acceleration = 'dropping';
    }

    // Effect tier based on duration
    const durationMs = duration * 1000;
    let effectTier: EffectTier = 'snap';
    if (durationMs >= TIER_THRESHOLDS.full) effectTier = 'full';
    else if (durationMs >= TIER_THRESHOLDS.medium) effectTier = 'medium';
    else if (durationMs >= TIER_THRESHOLDS.quick) effectTier = 'quick';

    // Composite energy: 0-1 combining density, strength, acceleration
    const densityNorm = Math.min(1, density / (this.bpm / 60)); // 1.0 = beat on every beat position
    const accelBoost = acceleration === 'building' ? 0.15 : acceleration === 'dropping' ? -0.1 : 0;
    const energy = Math.max(0, Math.min(1, densityNorm * 0.5 + avgStrength * 0.35 + peakStrength * 0.15 + accelBoost));

    return {
      beatCount,
      avgStrength,
      peakStrength,
      density,
      durationSec: duration,
      acceleration,
      beatIndices: indices,
      effectTier,
      energy,
    };
  }

  // ─── Subsystem response (translates raw pulse into per-system values) ───

  /**
   * Convert a BeatState into visual parameters using all 4 motion layers.
   *
   * Layer 1: Song identity shapes HOW motion feels (per-song)
   * Layer 2: Section mod scales amplitude (verse quiet, chorus loud)
   * Layer 3: Phrase budget damps motion for readability (dense phrase = stable)
   * Layer 4: Hero cooldown is tracked separately via HeroEventTracker
   */
  getSubsystemResponse(
    state: BeatState,
    emphasisLevel: number = 1,
    isHero: boolean = false,
    sectionIndex: number = 0,
    phraseBudget?: PhraseMotionBudget,
  ): SubsystemResponse {
    const p = state.pulse;
    const s = state.strength;
    const h = state.hitStrength;
    const e = state.energy;
    const b = state.brightness;
    const phase = state.phase;
    const downbeatBoost = state.isDownbeat ? 1.35 : 1.0;

    const id = this._songIdentity;
    const flow = id ? id.flowContinuity : 0.5;
    const grav = id ? id.gravity : 0.5;
    const latBias = id ? id.lateralBias : 0.35;
    const yBias = 1 - latBias;

    const secMod = this._sectionMods[sectionIndex];
    const ampScale = secMod?.amplitudeScale ?? 1.0;
    const effectiveFlow = Math.max(0, Math.min(1, flow + (secMod?.flowShift ?? 0)));

    const damping = phraseBudget?.damping ?? 0;
    const readabilityMult = 1 - damping * 0.7;

    const empMult = EMPHASIS_RESPONSE[Math.min(5, Math.max(0, emphasisLevel))];
    const heroMult = isHero ? 1.6 : 1.0;
    const wordMult = empMult * heroMult * ampScale * readabilityMult;

    const isBassHit = state.hitType === 'bass';
    const isTransientHit = state.hitType === 'transient';
    const isTonalHit = state.hitType === 'tonal';
    const hitTextBoost = isTransientHit ? 1.3 : 1.0;
    const hitCameraBoost = isBassHit ? 1.5 : 1.0;

    const heavyMod = b < 0.35 ? 1.3 : 1.0;
    const lightMod = b > 0.65 ? 1.2 : 1.0;

    let hitMod = h;
    if (id && h > 0.01) {
      if (id.hitSharpness > 0.7) hitMod = h * h;
      else if (id.hitSharpness < 0.3) hitMod = Math.sqrt(h);
    }

    const sway = computeInterBeatSway(phase, effectiveFlow);

    return {
      wordScale: 1.0
        + p * s * 0.06 * wordMult * downbeatBoost
        + hitMod * 0.14 * wordMult * hitTextBoost
        + e * 0.02 * wordMult,

      wordGlow:
        p * s * 0.35 * wordMult
        + hitMod * 0.6 * wordMult * (isTonalHit ? 1.8 : 1.0)
        + e * 0.08 * wordMult,

      wordNudgeY:
        -p * s * 5 * wordMult * downbeatBoost * yBias * heavyMod
        - hitMod * (isBassHit ? 14 : 4) * wordMult * grav
        + sway.y * e * 3 * wordMult * lightMod,

      wordNudgeX:
        sway.x * e * 3 * wordMult * latBias * lightMod
        + (isTransientHit ? hitMod * 4 * wordMult * latBias : 0),

      bgZoomRate: 0.3 + e * 2.0 * downbeatBoost * ampScale,
      bgSimIntensity: 0.2 + p * s * 0.5 + hitMod * 0.7 * hitCameraBoost,
      particleDensity: 0.3 + e * 0.5 * ampScale + hitMod * 0.3 * downbeatBoost,
      particleSpeed: 0.2 + p * s * 0.4 + hitMod * 0.8,
      vignetteIntensity: 0.05 + e * 0.2 * ampScale + hitMod * 0.15 * downbeatBoost,
      cameraShake: hitMod * (isBassHit ? 6 : 2.5) * grav * (emphasisLevel >= 4 ? 1.5 : 0.6),
    };
  }

  // ─── Effect budgeting ───

  /**
   * Given a requested effect style and the word's timing window,
   * return the best effect that fits, or downgrade if the budget is too tight.
   */
  budgetEntry(requestedStyle: string, windowProfile: BeatWindowProfile): string {
    const tier = windowProfile.effectTier;
    // If the requested style fits this tier, use it
    if (this.styleInTier(requestedStyle, 'entry', tier)) return requestedStyle;
    // Downgrade: walk down tiers until we find one that works
    return this.bestFittingStyle(requestedStyle, 'entry', tier);
  }

  budgetExit(requestedStyle: string, windowProfile: BeatWindowProfile): string {
    const tier = windowProfile.effectTier;
    if (this.styleInTier(requestedStyle, 'exit', tier)) return requestedStyle;
    return this.bestFittingStyle(requestedStyle, 'exit', tier);
  }

  private styleInTier(style: string, type: 'entry' | 'exit', tier: EffectTier): boolean {
    const map = type === 'entry' ? TIER_ENTRIES : TIER_EXITS;
    const tierOrder: EffectTier[] = ['snap', 'quick', 'medium', 'full'];
    const tierIdx = tierOrder.indexOf(tier);
    // Style is allowed if it belongs to this tier or any lower tier
    for (let i = 0; i <= tierIdx; i++) {
      if (map[tierOrder[i]].includes(style)) return true;
    }
    return false;
  }

  private bestFittingStyle(requestedStyle: string, type: 'entry' | 'exit', maxTier: EffectTier): string {
    const map = type === 'entry' ? TIER_ENTRIES : TIER_EXITS;
    const tierOrder: EffectTier[] = ['snap', 'quick', 'medium', 'full'];
    const maxIdx = tierOrder.indexOf(maxTier);

    // Find which tier the requested style belongs to
    let requestedTier = -1;
    for (let i = tierOrder.length - 1; i >= 0; i--) {
      if (map[tierOrder[i]].includes(requestedStyle)) { requestedTier = i; break; }
    }

    // If it fits, return it (shouldn't reach here but safety)
    if (requestedTier <= maxIdx) return requestedStyle;

    // Downgrade: pick first style from the highest available tier
    // Try to match energy: if requested was aggressive (slam, shatter), pick aggressive downgrade
    const aggressiveEntries = new Set(['slam-down', 'explode-in', 'punch-in', 'shatter-in', 'stomp', 'drop']);
    const aggressiveExits = new Set(['shatter', 'punch-out', 'burn-out', 'gravity-fall', 'launch']);
    const isAggressive = type === 'entry'
      ? aggressiveEntries.has(requestedStyle)
      : aggressiveExits.has(requestedStyle);

    for (let i = maxIdx; i >= 0; i--) {
      const candidates = map[tierOrder[i]];
      if (candidates.length === 0) continue;
      if (isAggressive) {
        // Prefer aggressive options in the lower tier
        const aggressiveSet = type === 'entry' ? aggressiveEntries : aggressiveExits;
        const match = candidates.find(c => aggressiveSet.has(c));
        if (match) return match;
      }
      return candidates[0];
    }
    return type === 'entry' ? 'snap-in' : 'vanish';
  }

  // ─── Utilities ───

  /** Total number of beats in the grid */
  get totalBeats(): number { return this.beats.length; }

  /** Get the BPM */
  get beatsPerMinute(): number { return this.bpm; }

  /** Get beat period in seconds */
  get beatPeriod(): number { return this.period; }

  /** Reset cursor (call after seek) */
  resetCursor(): void {
    this._cursor = 0;
    this._hitCursor = 0;
    this._heroTracker.reset();
  }
}

// ──────────────────────────────────────────────────────────────
// Response curves per emphasis level
// ──────────────────────────────────────────────────────────────

const EMPHASIS_RESPONSE: Record<number, number> = {
  0: 0.15, // filler — barely reacts
  1: 0.4, // normal — subtle breathing
  2: 0.7, // moderate — noticeable pulse
  3: 1.0, // strong — full beat response
  4: 1.5, // hero — amplified
  5: 2.2, // climactic — explosive
};
