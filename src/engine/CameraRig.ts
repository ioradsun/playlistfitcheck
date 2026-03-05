/**
 * CameraRig V5 — Handheld Live Performance Camera.
 *
 * ─── CORE MODEL ──────────────────────────────────────────────────────────
 *
 *   The camera is held by a human body. That body is always moving.
 *   Beats don't CREATE motion — they are absorbed by the body and
 *   radiate outward through the camera as a physical response.
 *
 *   The body is a sum of 4 inharmonic oscillating systems:
 *     1. BREATH        0.25Hz  ±4px Y        — always present
 *     2. WEIGHT SHIFT  0.12Hz  ±6px X        — low body rock
 *     3. FOREARM TREMOR 2.3Hz ±0.8px XY     — high-freq fatigue shake
 *     4. SHOULDER ROLL  0.6Hz ±0.4° rot     — camera rolls under arm weight
 *
 *   Inharmonic = organic. No two oscillators in sync = never mechanical.
 *
 * ─── 3-STATE MACHINE ─────────────────────────────────────────────────────
 *
 *   HOLD   (verse/quiet):   Operator trying to stay steady.
 *                           Body jitter ×0.6, beat accents ×0.5.
 *                           Emotional meaning: "Listen."
 *
 *   DRIVE  (build/pre-drop): Operator moving toward the action.
 *                            Body jitter ×1.0, beat accents ×1.0.
 *                            Forward lean: proximity grows over 4-8 bars.
 *                            Emotional meaning: "Something is coming."
 *
 *   IMPACT (drop/chorus):   Operator is INSIDE the music.
 *                           Body jitter ×1.8, beat accents ×1.8.
 *                           Drop onset: violent all-axis spike (2 bars).
 *                           Then groove-locked: big accents, operator rides rhythm.
 *                           Emotional meaning: "It hit."
 *
 * ─── BEAT RESPONSE (each type physically distinct) ───────────────────────
 *
 *   BASS:       Body compression. Camera lurches DOWN 40-55px + zoom in 5%.
 *               Overshoot on return (underdamped, k=20 c=6). Settles ~500ms.
 *               Feels like gravity. Heavy.
 *
 *   TRANSIENT:  Shoulder flinch. Sharp lateral jerk 20-30px + dutch tilt ±2°.
 *               Critically damped snap-back (k=200 c=28). Settles ~100ms.
 *               Feels like a snare hit in your chest.
 *
 *   TONAL:      Conscious lean-in. Slow zoom 2-3%. Gentle yaw.
 *               Very slow return (k=30 c=10). Settles ~600ms.
 *               Feels like an emotional pull.
 *
 * ─── KEY HANDHELD DIFFERENCE FROM CINEMATIC ─────────────────────────────
 *
 *   Cinematic: anticipation FREEZES before drop (held breath).
 *   Handheld:  operator LEANS HARDER before drop (energy building in body).
 *              Pre-drop = MORE movement, not less.
 *              On drop: violent spike, then operator RIDES the groove.
 *
 * ─── AMPLITUDE ───────────────────────────────────────────────────────────
 *
 *   Human perception threshold: ~3% of canvas height at 60fps = 16px.
 *   Handheld sweet spot: 35-60px Y, 20-35px X. Aggressive but not nauseating.
 */

import type { BeatGrid, BeatState } from './BeatConductor';
import type { CinematicDirection } from '@/types/CinematicDirection';

// ─── Public interfaces ────────────────────────────────────────────────────

export interface CameraConfig {
  beatBounceY: number;
  beatBounceX: number;
  beatZoom: number;
  bassMultiplier: number;
  transientMultiplier: number;
  /** @deprecated No-op. Kept for external callers. */
  swaySmoothing: number;
  dropEnergyThreshold: number;
  dropMinEnergy: number;
  dropShakePx: number;
  dropIntensity: number;
  dropDecayRate: number;
  heroZoom: number;
  heroShakePx: number;
  heroPunchMs: number;
  heroTaperMs: number;
  heroStillMs: number;
  springStiffness: number;
  springDamping: number;
  parallaxFar: number;
  parallaxMid: number;
  parallaxNear: number;
  maxZoom: number;
  maxOffsetPx: number;
  maxRotationRad: number;
}

export interface SubjectFocus {
  x: number; y: number;
  heroActive: boolean;
  emphasisLevel: number;
  isClimax: boolean;
  vocalActive: boolean;
  heroApproaching?: boolean;
}

export interface SubjectTransform {
  zoom: number; proximity: number;
  offsetX: number; offsetY: number;
  rotation: number; shakeX: number; shakeY: number;
}

export interface PhraseAnchor {
  x: number; y: number;
  velocityX?: number; velocityY?: number;
}

export type SectionRigName = 'verse' | 'chorus' | 'bridge' | 'drop' | 'intro' | 'outro';

// ─── 3-state machine ─────────────────────────────────────────────────────

type HandheldState = 'HOLD' | 'DRIVE' | 'IMPACT';

interface StateProfile {
  bodyScale: number;    // scale on all body oscillators
  beatScale: number;    // scale on beat accents
  proximityTarget: number; // base zoom offset (IMPACT keeps camera closer)
  proximityRate: number;   // how fast proximity changes (px/sec conceptually)
}

const STATE_PROFILES: Record<HandheldState, StateProfile> = {
  HOLD:   { bodyScale: 0.6, beatScale: 0.5, proximityTarget: 0.0,  proximityRate: 0.005 },
  DRIVE:  { bodyScale: 1.0, beatScale: 1.0, proximityTarget: 0.03, proximityRate: 0.012 },
  IMPACT: { bodyScale: 1.8, beatScale: 1.8, proximityTarget: 0.06, proximityRate: 0.020 },
};

// ─── Song arc types ───────────────────────────────────────────────────────

interface SongArcPoint {
  timeSec: number;
  state: HandheldState;
  energy: number;   // 0-1 normalized
  isDrop: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  beatBounceY: 45,       // was 10 — below human perception threshold
  beatBounceX: 22,       // was 5
  beatZoom: 0.05,        // was 0.025
  bassMultiplier: 2.2,
  transientMultiplier: 1.8,
  swaySmoothing: 2.0,    // no-op
  dropEnergyThreshold: 0.20,
  dropMinEnergy: 0.45,
  dropShakePx: 12,
  dropIntensity: 2.0,
  dropDecayRate: 1.0,
  heroZoom: 0.12,
  heroShakePx: 8,
  heroPunchMs: 90,
  heroTaperMs: 150,
  heroStillMs: 80,       // handheld operator reacts fast
  springStiffness: 200,
  springDamping: 28,
  parallaxFar: 0.15,
  parallaxMid: 0.5,
  parallaxNear: 0.85,
  maxZoom: 1.20,
  maxOffsetPx: 65,
  maxRotationRad: 3.5 * Math.PI / 180,  // ±3.5° — handheld allows more tilt
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * clamp(t, 0, 1); }
function smoothstep(t: number): number { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); }

/** Underdamped spring returning [pos, vel]. Target is always 0. */
function spring(pos: number, vel: number, k: number, c: number, dt: number): [number, number] {
  const acc = -k * pos - c * vel;
  const v2 = vel + acc * dt;
  return [pos + v2 * dt, v2];
}

/** Map mood string → handheld state */
function moodToState(mood?: string, motion?: string): HandheldState {
  const s = ((mood ?? '') + ' ' + (motion ?? '')).toLowerCase();
  if (/drop|climax|peak|explosion|chorus|anthemic|euphoric|triumphant|powerful|release/.test(s))
    return 'IMPACT';
  if (/build|rising|urgent|pre.?chorus|tension|ascending/.test(s))
    return 'DRIVE';
  return 'HOLD';
}

// ─── CameraRig V5 ─────────────────────────────────────────────────────────

export class CameraRig {
  private cfg: CameraConfig;
  private canvasW = 960;
  private canvasH = 540;

  // Pre-computed song arc
  private songArc: SongArcPoint[] = [];
  private peakDropTime = -1;
  private songDuration = 0;

  // ── 3-state machine ─────────────────────────────────────────────────────
  private _state: HandheldState = 'HOLD';
  private _stateBlend = 0;      // 0=fully previous state, 1=fully current
  private _prevState: HandheldState = 'HOLD';
  private _stateSince = 0;      // ms since last state change
  private _proximityBase = 0;   // slow lean-in (DRIVE/IMPACT)

  // ── Body simulation — 4 inharmonic oscillators ───────────────────────────
  // Phase accumulators (radians). All start at different offsets → immediate organic feel.
  private _breathPhase    = 0.0;
  private _weightPhase    = 1.3;  // offset — never in phase with breath
  private _tremorPhase    = 2.7;  // high-freq
  private _shoulderPhase  = 0.9;  // rotation

  // ── Beat response — per-type independent springs ──────────────────────────
  private _bassY=0;    private _bassYV=0;
  private _bassZ=0;    private _bassZV=0;
  private _transX=0;   private _transXV=0;
  private _transR=0;   private _transRV=0;
  private _tonalZ=0;   private _tonalZV=0;
  private _beatY=0;    private _beatYV=0;
  private _beatX=0;    private _beatXV=0;
  private _beatZ=0;    private _beatZV=0;

  // ── Drop onset spike ─────────────────────────────────────────────────────
  private _dropOnsetMs = 0;      // ms since last drop onset (for 2-bar violent window)
  private _dropGrooveMs = 0;     // ms in groove-lock after onset
  private _energyAvg = 0.3;
  private _dropAmount = 0;
  private _wasDropping = false;

  // ── Hero punch ─────────────────────────────────────────────────────────
  private _heroActive = false;
  private _heroPunchZoom = 0;
  private _heroPunchShakeX = 0;
  private _heroPunchShakeY = 0;
  private _heroPunchMsLeft = 0;
  private _heroPunchMsTotal = 0;
  private _lastHeroPunchMs = 0;
  private _prevHeroActive = false;
  private _heroStillTimer = 0;
  private _heroFreezeAmt = 0;

  // ── Output spring ──────────────────────────────────────────────────────
  private _springZoom=1; private _velZoom=0;
  private _springOffX=0; private _velOffX=0;
  private _springOffY=0; private _velOffY=0;
  private _springRot=0;  private _velRot=0;

  // ── Final output ──────────────────────────────────────────────────────
  private _zoom=1; private _offsetX=0; private _offsetY=0;
  private _rotation=0; private _shakeX=0; private _shakeY=0;
  private _cachedTransform: SubjectTransform | null = null;
  private _prevBeatIndex = -1;

  // ─────────────────────────────────────────────────────────────────────────

  constructor(
    config?: Partial<CameraConfig>,
    beatGrid?: BeatGrid | null,
    cinematicDirection?: CinematicDirection | null,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (beatGrid) this._preAnalyze(beatGrid, cinematicDirection);
  }

  /**
   * Pre-analyze song at construction: build arc of HandheldStates per section.
   * Uses beatEnergies + cinematic section moods to map the whole song to
   * HOLD / DRIVE / IMPACT before playback starts.
   */
  private _preAnalyze(beatGrid: BeatGrid, cd: CinematicDirection | null | undefined): void {
    const beats = (beatGrid.beats ?? []).filter(Number.isFinite);
    if (beats.length < 2) return;

    this.songDuration = beats[beats.length - 1] + 60 / Math.max(30, beatGrid.bpm ?? 120);
    const beatEnergies = beatGrid.beatEnergies;
    const sections: any[] = (cd as any)?.sections ?? (cd as any)?.chapters ?? [];
    const dur = this.songDuration;
    const arc: SongArcPoint[] = [];

    if (sections.length > 0) {
      // Per-section energy
      const secEnergies = sections.map((sec: any) => {
        const s0 = sec.startSec ?? (sec.startRatio ?? 0) * dur;
        const s1 = sec.endSec   ?? (sec.endRatio   ?? 1) * dur;
        if (!beatEnergies?.length) return 0.5;
        let sum = 0, n = 0;
        for (let i = 0; i < beats.length; i++) {
          if (beats[i] >= s0 && beats[i] < s1 && i < beatEnergies.length) { sum += beatEnergies[i]; n++; }
        }
        return n > 0 ? sum / n : 0.5;
      });
      const maxE = Math.max(0.01, ...secEnergies);

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const t = sec.startSec ?? (sec.startRatio ?? i / sections.length) * dur;
        const e = secEnergies[i] / maxE;
        const moodState = moodToState(sec.mood ?? sec.visualMood, sec.motion);
        // Energy can override: if energy is top 30% and mood says DRIVE, upgrade to IMPACT
        const energyState: HandheldState = e > 0.75 ? 'IMPACT' : e > 0.45 ? 'DRIVE' : 'HOLD';
        const state: HandheldState = moodState === 'IMPACT' || energyState === 'IMPACT' ? 'IMPACT'
                                   : moodState === 'DRIVE'  || energyState === 'DRIVE'  ? 'DRIVE'
                                   : 'HOLD';
        const prevE = i > 0 ? secEnergies[i - 1] : 0;
        const isDrop = state === 'IMPACT' && secEnergies[i] > prevE * 1.25;
        arc.push({ timeSec: t, state, energy: e, isDrop });
      }
      arc.push({ timeSec: dur, state: 'HOLD', energy: 0, isDrop: false });
    } else {
      // No sections: derive from 8-bar energy windows
      const period = 60 / Math.max(30, beatGrid.bpm ?? 120);
      const winDur = period * 32;
      const nWin = Math.ceil(dur / winDur);
      let runAvg = 0.5;
      for (let w = 0; w < nWin; w++) {
        const t = w * winDur;
        let sum = 0, n = 0;
        for (let i = 0; i < beats.length; i++) {
          if (beats[i] >= t && beats[i] < t + winDur && beatEnergies && i < beatEnergies.length)
            { sum += beatEnergies[i]; n++; }
        }
        const e = n > 0 ? sum / n : 0.5;
        runAvg += (e - runAvg) * 0.25;
        const state: HandheldState = e > runAvg * 1.3 ? 'IMPACT' : e > runAvg * 0.9 ? 'DRIVE' : 'HOLD';
        const isDrop = state === 'IMPACT' && arc.length > 0 && arc[arc.length - 1].state !== 'IMPACT';
        arc.push({ timeSec: t, state, energy: e, isDrop });
      }
    }

    this.songArc = arc;
    let peakE = -1, peakT = -1;
    for (const p of arc) { if (p.isDrop && p.energy > peakE) { peakE = p.energy; peakT = p.timeSec; } }
    this.peakDropTime = peakT;
  }

  private _resolveArc(tSec: number): SongArcPoint | null {
    if (!this.songArc.length) return null;
    for (let i = this.songArc.length - 1; i >= 0; i--) {
      if (this.songArc[i].timeSec <= tSec) return this.songArc[i];
    }
    return this.songArc[0];
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  loadSongData(beatGrid: BeatGrid | null, cd: CinematicDirection | null | undefined): void {
    this.songArc = [];
    if (beatGrid) this._preAnalyze(beatGrid, cd);
    this.reset();
  }

  update(
    deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const cfg = this.cfg;
    const dt = Math.min(deltaMs, 100) / 1000;
    const sf = (focus && 'heroActive' in focus) ? focus as SubjectFocus : null;
    const nowMs = performance.now();
    const tSec = (beatState as any)?._tSec ?? -1;

    const energy     = beatState?.energy      ?? 0;
    const hitStr     = beatState?.hitStrength  ?? 0;
    const hitType    = beatState?.hitType      ?? 'none';
    const isNewBeat  = beatState !== null && beatState.beatIndex !== this._prevBeatIndex && beatState.beatIndex >= 0;
    const isDownbeat = beatState?.isDownbeat   ?? false;
    const strength   = beatState?.strength     ?? 0.5;
    const pulse      = beatState?.pulse        ?? 0;

    // ══ 3-STATE MACHINE ════════════════════════════════════════════════════

    // Resolve state from song arc
    const arcPt = this._resolveArc(tSec >= 0 ? tSec : 0);
    const targetState: HandheldState = arcPt?.state ?? (
      energy > 0.65 ? 'IMPACT' : energy > 0.35 ? 'DRIVE' : 'HOLD'
    );

    // State transition: blend over ~500ms so state changes feel like operator response
    if (targetState !== this._state) {
      this._prevState = this._state;
      this._state = targetState;
      this._stateBlend = 0;
      this._stateSince = 0;
    }
    this._stateBlend = Math.min(1, this._stateBlend + dt * 2);  // ~500ms blend
    this._stateSince += deltaMs;

    // Blend between previous and current state profiles
    const prevProf = STATE_PROFILES[this._prevState];
    const currProf = STATE_PROFILES[this._state];
    const bodyScale = lerp(prevProf.bodyScale, currProf.bodyScale, this._stateBlend);
    const beatScale = lerp(prevProf.beatScale, currProf.beatScale, this._stateBlend);
    const proxTarget = lerp(prevProf.proximityTarget, currProf.proximityTarget, this._stateBlend);
    const proxRate   = lerp(prevProf.proximityRate,   currProf.proximityRate,   this._stateBlend);

    // ── Operator forward lean (DRIVE/IMPACT: step closer over time) ────────
    // Handheld: not a smooth dolly, but an operator physically closing distance.
    // The lean-in is faster in IMPACT, releases slowly back to baseline on HOLD.
    if (this._state === 'HOLD') {
      this._proximityBase = lerp(this._proximityBase, 0, dt * 0.5);
    } else {
      this._proximityBase = Math.min(proxTarget, this._proximityBase + proxRate * dt);
    }

    // ══ BODY SIMULATION — 4 inharmonic oscillators ═════════════════════════

    // Advance all phases
    this._breathPhase   += dt * 2 * Math.PI * 0.25;  // 0.25Hz
    this._weightPhase   += dt * 2 * Math.PI * 0.12;  // 0.12Hz
    this._tremorPhase   += dt * 2 * Math.PI * 2.3;   // 2.3Hz
    this._shoulderPhase += dt * 2 * Math.PI * 0.6;   // 0.6Hz

    // Scale amplitudes by bodyScale + energy (operator moves more when music is louder)
    const bodyEnergy = lerp(0.6, 1.4, energy);
    const bs = bodyScale * bodyEnergy;

    const breathY    =  Math.sin(this._breathPhase)    * 4.0 * bs;
    const weightX    =  Math.sin(this._weightPhase)    * 6.0 * bs;
    const weightY    =  Math.cos(this._weightPhase)    * 1.5 * bs;
    const tremorX    =  Math.sin(this._tremorPhase)    * 0.8 * bs;
    const tremorY    =  Math.cos(this._tremorPhase + 1.1) * 0.8 * bs;
    const shoulderRot = Math.sin(this._shoulderPhase)  * 0.007 * bs; // ≈±0.4° at scale=1

    // Total body signal (before beat accents)
    const bodyX = weightX + tremorX;
    const bodyY = breathY + weightY + tremorY;
    const bodyRot = shoulderRot;

    // ══ DROP DETECTION & ONSET ══════════════════════════════════════════════

    this._energyAvg += (energy - this._energyAvg) * Math.min(1, dt * 0.3);
    const spike = energy - this._energyAvg;
    const isDropping = spike > cfg.dropEnergyThreshold && energy > cfg.dropMinEnergy;

    // Detect new drop onset
    if (isDropping && !this._wasDropping) {
      // Drop ONSET — the violent 2-bar window starts now
      this._dropOnsetMs = 0;
      this._dropGrooveMs = 0;
    }
    if (isDropping) {
      this._dropOnsetMs += deltaMs;
      this._dropAmount = Math.min(1, this._dropAmount + dt * 5);
    } else {
      this._dropGrooveMs += deltaMs;
      this._dropAmount = Math.max(0, this._dropAmount - dt * cfg.dropDecayRate);
    }
    this._wasDropping = isDropping;

    // Drop onset window: first 2 bars (~3-4s at 120bpm) are violent
    const ONSET_WINDOW_MS = 3500;
    const onsetFrac = this._dropOnsetMs > 0
      ? Math.max(0, 1 - this._dropOnsetMs / ONSET_WINDOW_MS)
      : 0;

    const dropMult = 1 + this._dropAmount * (cfg.dropIntensity - 1);

    // Drop shake during onset (high-freq chaos — operator overwhelmed for 2 bars)
    const shT = nowMs * 0.017;
    const onsetShakeX = onsetFrac * cfg.dropShakePx * 2.5 * Math.sin(shT * 13.7 + 0.4) * energy;
    const onsetShakeY = onsetFrac * cfg.dropShakePx * 2.5 * Math.cos(shT * 9.3  + 2.1) * energy;
    // Groove shake (after onset: operator riding rhythm — lower freq, more controlled)
    const grooveFrac = this._dropAmount * (1 - onsetFrac);
    const grooveShakeX = grooveFrac * cfg.dropShakePx * Math.sin(shT * 6.1 + 1.3) * energy;
    const grooveShakeY = grooveFrac * cfg.dropShakePx * Math.cos(shT * 4.7 + 2.9) * energy;

    const dropShakeX = onsetShakeX + grooveShakeX;
    const dropShakeY = onsetShakeY + grooveShakeY;

    // ══ BEAT ACCENTS — operator absorbs each hit ════════════════════════════

    // Is this near the song's peak drop? Extra intensity.
    const nearApex = this.peakDropTime >= 0 && tSec >= 0 && Math.abs(tSec - this.peakDropTime) < 4;
    const apexBoost = nearApex ? 1.5 : 1.0;

    // Amplitude: floor so every beat is visible; energy/strength push it higher.
    const beatAmp = (0.4 + energy * 0.35 + strength * 0.25)
      * beatScale
      * (1 + (hitStr > 0.3 ? hitStr * 0.5 : 0))
      * dropMult
      * apexBoost;

    if (isNewBeat && energy > 0.02) {
      const db = isDownbeat ? 1.6 : 1.0;

      if (hitType === 'bass' || (hitType === 'none' && isDownbeat)) {
        // ── BASS: body compression. Lurch DOWN + zoom in. Float back slowly.
        // Operator absorbs bass through floor → body compresses → camera drops.
        const amp = beatAmp * cfg.bassMultiplier * db;
        this._bassY  = cfg.beatBounceY * amp;    this._bassYV = 0;
        this._bassZ  = cfg.beatZoom * amp * 1.3; this._bassZV = 0;

      } else if (hitType === 'transient') {
        // ── TRANSIENT: shoulder flinch. Sharp lateral jerk + dutch tilt.
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        const amp = beatAmp * cfg.transientMultiplier;
        this._transX  = cfg.beatBounceX * amp * dir;               this._transXV = 0;
        this._transR  = dir * cfg.maxRotationRad * 0.55 * amp;     this._transRV = 0;

      } else if (hitType === 'tonal') {
        // ── TONAL: conscious lean-in. Slow zoom, slight yaw. Holds long.
        const amp = beatAmp * 0.7;
        this._tonalZ  = cfg.beatZoom * amp * 0.85; this._tonalZ = Math.min(this._tonalZ, 0.06);
        this._tonalZV = 0;

      } else {
        // ── GENERIC: Y bounce + X alternation
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        const amp = beatAmp * db;
        this._beatY  = cfg.beatBounceY * amp * 0.85; this._beatYV = 0;
        this._beatX  = cfg.beatBounceX * amp * 0.5 * dir; this._beatXV = 0;
        this._beatZ  = cfg.beatZoom * amp * db; this._beatZV = 0;
      }
    }

    // ── Per-type spring physics ─────────────────────────────────────────────
    // Each hit type decays with physics matching its perceptual character:
    //
    //   Bass     k=20 c=6   → UNDERDAMPED. Slow float + overshoot = weight/gravity.
    //   Transient k=200 c=28 → CRITICALLY DAMPED. Crisp snap-back = snare crispness.
    //   Tonal    k=28 c=9   → UNDERDAMPED. Slow warm return = emotional lean.
    //   Generic  k=65 c=15  → Lightly damped. Medium snap.

    [this._bassY,  this._bassYV]  = spring(this._bassY,  this._bassYV,  20,  6,  dt);
    [this._bassZ,  this._bassZV]  = spring(this._bassZ,  this._bassZV,  20,  6,  dt);
    [this._transX, this._transXV] = spring(this._transX, this._transXV, 200, 28, dt);
    [this._transR, this._transRV] = spring(this._transR, this._transRV, 200, 28, dt);
    [this._tonalZ, this._tonalZV] = spring(this._tonalZ, this._tonalZV, 28,  9,  dt);
    [this._beatY,  this._beatYV]  = spring(this._beatY,  this._beatYV,  65,  15, dt);
    [this._beatX,  this._beatXV]  = spring(this._beatX,  this._beatXV,  65,  15, dt);
    [this._beatZ,  this._beatZV]  = spring(this._beatZ,  this._beatZV,  65,  15, dt);

    // ══ HERO PUNCH ═════════════════════════════════════════════════════════

    const heroJustStarted = sf !== null && sf.heroActive && sf.emphasisLevel >= 4 && !this._prevHeroActive;

    // Handheld: hero approaching = operator leans in HARDER, not still
    if (sf?.heroApproaching) {
      this._heroStillTimer += deltaMs;
      this._heroFreezeAmt = Math.min(0.4, this._heroStillTimer / Math.max(1, cfg.heroStillMs));
      // Note: 0.4 max (not 1.0) — handheld operator doesn't fully freeze, just focuses
    } else if (!sf?.heroActive) {
      this._heroStillTimer = 0;
      this._heroFreezeAmt = Math.max(0, this._heroFreezeAmt - dt * 6);
    }

    if (heroJustStarted) {
      const elapsed = nowMs - this._lastHeroPunchMs;
      const scale = (elapsed < cfg.heroTaperMs ? Math.max(0.3, elapsed / cfg.heroTaperMs) : 1)
                  * (sf!.isClimax ? 1.5 : 1);
      this._heroActive = true;
      this._heroPunchZoom = cfg.heroZoom * scale;
      this._heroPunchMsTotal = cfg.heroPunchMs;
      this._heroPunchMsLeft  = cfg.heroPunchMs;
      const ang = (nowMs * 7.13) % (Math.PI * 2);
      this._heroPunchShakeX = Math.cos(ang) * cfg.heroShakePx * scale;
      this._heroPunchShakeY = Math.sin(ang) * cfg.heroShakePx * scale;
      this._lastHeroPunchMs = nowMs;
      this._heroFreezeAmt = 0;
      this._heroStillTimer = 0;
    }
    this._heroPunchMsLeft = Math.max(0, this._heroPunchMsLeft - deltaMs);
    if (this._heroPunchMsLeft <= 0 && this._heroActive) {
      this._heroActive = false;
      this._heroPunchZoom = this._heroPunchShakeX = this._heroPunchShakeY = 0;
    }
    const heroFrac = this._heroPunchMsLeft > 0 ? this._heroPunchMsLeft / this._heroPunchMsTotal : 0;

    // ══ COMPOSITE ══════════════════════════════════════════════════════════

    // Handheld difference: heroFreezeAmt is partial (0.4 max) — operator focuses but
    // still reacts. No full freeze. The body keeps breathing even when focusing.
    const beatAlive = 1 - this._heroFreezeAmt;  // 0.6 minimum during hero approach

    // Zoom: proximity base (lean-in) + bass punch + tonal lean + generic + hero
    const rawZoom = 1.0
      + this._proximityBase
      + (this._bassZ + this._tonalZ + this._beatZ) * beatAlive
      + this._heroPunchZoom * heroFrac;

    // Y: bass lurch + generic + body breath/weight + drop shake + hero
    const rawOffY = (this._bassY + this._beatY) * beatAlive
      + bodyY
      + dropShakeY
      + this._heroPunchShakeY * heroFrac;

    // X: transient shoulder + generic + body weight shift + drop shake + hero
    const rawOffX = (this._transX + this._beatX) * beatAlive
      + bodyX
      + dropShakeX
      + this._heroPunchShakeX * heroFrac;

    // Rotation: transient dutch tilt + shoulder roll
    const rawRot = this._transR * beatAlive + bodyRot;

    // ── Output spring (final smoothing) ────────────────────────────────────
    // Lighter spring than cinematic — handheld output is snappier.
    const k = cfg.springStiffness, c = cfg.springDamping;
    const acZ = -k*(this._springZoom-rawZoom)  - c*this._velZoom;  this._velZoom  += acZ*dt;  this._springZoom  += this._velZoom*dt;
    const acX = -k*(this._springOffX-rawOffX)  - c*this._velOffX;  this._velOffX  += acX*dt;  this._springOffX  += this._velOffX*dt;
    const acY = -k*(this._springOffY-rawOffY)  - c*this._velOffY;  this._velOffY  += acY*dt;  this._springOffY  += this._velOffY*dt;
    const acR = -k*(this._springRot -rawRot)   - c*this._velRot;   this._velRot   += acR*dt;  this._springRot   += this._velRot*dt;

    this._zoom     = clamp(this._springZoom,  2-cfg.maxZoom,      cfg.maxZoom);
    this._offsetX  = clamp(this._springOffX, -cfg.maxOffsetPx,    cfg.maxOffsetPx);
    this._offsetY  = clamp(this._springOffY, -cfg.maxOffsetPx,    cfg.maxOffsetPx);
    this._rotation = clamp(this._springRot,  -cfg.maxRotationRad, cfg.maxRotationRad);
    this._shakeX   = clamp(this._springOffX * 0.5, -cfg.maxOffsetPx, cfg.maxOffsetPx);
    this._shakeY   = clamp(this._springOffY * 0.5, -cfg.maxOffsetPx, cfg.maxOffsetPx);

    this._prevHeroActive = sf?.heroActive ?? false;
    if (beatState) this._prevBeatIndex = beatState.beatIndex;
    this._cachedTransform = null;
  }

  // ─── Stubs ────────────────────────────────────────────────────────────────
  setBPM(_bpm: number): void {}
  setSection(_s: SectionRigName): void {}
  setSectionFromMood(_m: string): void {}
  setEnergy(_e: number): void {}
  setViewport(w: number, h: number): void { this.canvasW = w; this.canvasH = h; }

  // ─── Output ───────────────────────────────────────────────────────────────
  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;
    return this._cachedTransform = {
      zoom: this._zoom, proximity: Math.max(0, this._zoom - 1),
      offsetX: this._offsetX, offsetY: this._offsetY,
      rotation: this._rotation, shakeX: this._shakeX, shakeY: this._shakeY,
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D, layer: 'backdrop'|'atmosphere'|'far'|'mid'|'near'): void {
    ctx.save();
    const cfg = this.cfg;
    const depth = layer === 'near' ? cfg.parallaxNear
                : layer === 'mid' || layer === 'atmosphere' ? cfg.parallaxMid
                : cfg.parallaxFar;
    const z = 1 + (this._zoom - 1) * depth;
    const ox = this._offsetX * depth, oy = this._offsetY * depth;
    const sx = this._shakeX  * depth, sy = this._shakeY  * depth;
    const rot = this._rotation * depth;
    const cx = this.canvasW / 2, cy = this.canvasH / 2;
    if (Math.abs(z-1)>0.0005 || Math.abs(ox)>0.1 || Math.abs(oy)>0.1 || Math.abs(sx)>0.1 || Math.abs(sy)>0.1 || Math.abs(rot)>0.0001) {
      ctx.translate(cx + ox + sx, cy + oy + sy);
      if (Math.abs(rot) > 0.0001) ctx.rotate(rot);
      if (Math.abs(z - 1) > 0.0005) ctx.scale(z, z);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void { ctx.restore(); }
  getProximity(): number { return Math.max(0, this._zoom - 1); }
  get drop(): number { return this._dropAmount; }

  /** Debug: current state name */
  get currentGrammarName(): string { return this._state; }
  /** Debug: 0-1 blend toward current state */
  get anticipation(): number { return this._stateBlend; }

  reset(): void {
    this._prevBeatIndex = -1;
    this._state = 'HOLD'; this._prevState = 'HOLD'; this._stateBlend = 0; this._stateSince = 0;
    this._proximityBase = 0;
    this._breathPhase = 0; this._weightPhase = 1.3; this._tremorPhase = 2.7; this._shoulderPhase = 0.9;
    this._bassY=this._bassYV=this._bassZ=this._bassZV=0;
    this._transX=this._transXV=this._transR=this._transRV=0;
    this._tonalZ=this._tonalZV=0;
    this._beatY=this._beatYV=this._beatX=this._beatXV=this._beatZ=this._beatZV=0;
    this._dropOnsetMs=this._dropGrooveMs=0; this._energyAvg=0.3; this._dropAmount=0; this._wasDropping=false;
    this._heroActive=false; this._heroPunchZoom=this._heroPunchShakeX=this._heroPunchShakeY=0;
    this._heroPunchMsLeft=this._heroPunchMsTotal=this._lastHeroPunchMs=0;
    this._prevHeroActive=false; this._heroStillTimer=this._heroFreezeAmt=0;
    this._springZoom=1; this._velZoom=0; this._springOffX=this._velOffX=0;
    this._springOffY=this._velOffY=0; this._springRot=this._velRot=0;
    this._zoom=1; this._offsetX=this._offsetY=this._rotation=this._shakeX=this._shakeY=0;
    this._cachedTransform=null;
  }
}
