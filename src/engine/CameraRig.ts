/**
 * CameraRig V4 — Narrative Camera.
 *
 * First-principles rewrite. The camera is a storytelling instrument, not a
 * beat visualizer. It reads the song's emotional arc and moves accordingly.
 *
 * ─── CORE PHILOSOPHY ─────────────────────────────────────────────────────
 *
 *   "The camera breathes. It does not blink."
 *
 *   Old model: impulse fires ON each beat, decays to zero in ~300ms.
 *   Looks like a blink. The brain perceives it as tremor, not motion.
 *
 *   New model: the camera is ALWAYS in motion on a slow continuous arc.
 *   Beats are INFLECTION POINTS on that arc — they redirect energy,
 *   not create it from zero. The motion is felt before the beat,
 *   peaks on it, and carries through after.
 *
 * ─── THREE LAYERS, STACKED ───────────────────────────────────────────────
 *
 *   LAYER 1: SECTION ARC  — slow 8–32 bar movements driven by song structure.
 *     Verse:      slow push-in. Intimate. Holds still between beats.
 *     Pre-chorus: drift upward. Urgency builds. Tighten FOV slowly.
 *     Chorus:     explosive first beat → wide hold → dance hard.
 *     Drop:       STILL for 2+ bars → then violent. Held breath → exhale.
 *     Bridge:     slow drift + slight disorientation.
 *     Outro:      slow pull-back over the full section.
 *
 *   LAYER 2: BEAT GRAMMAR — each hit type has distinct motion language.
 *     BASS:       vertical punch DOWN (gravity). Zoom IN. Slow float back (~2 beats).
 *     TRANSIENT:  lateral whip L/R + dutch tilt. Fast recovery (~0.5 beats).
 *     TONAL:      push TOWARD subject (intimacy). Gentle CW rotation. Slow hold.
 *     DOWNBEAT:   everything × 1.6. The "1" must be unmistakable.
 *
 *   LAYER 3: ANTICIPATION — the camera knows what's coming.
 *     Pre-computed at construction from beatGrid + cinematic sections.
 *     4–8 bars before section change: beat dance gradually freezes.
 *     On change (esp. drop): explosive release of all held energy.
 *     The camera tells the story before the lyrics do.
 *
 * ─── AMPLITUDE CALIBRATION ───────────────────────────────────────────────
 *
 *   Human vestibular threshold: ~3% of canvas height at 60fps.
 *   Canvas ~540px → 3% = 16px minimum to perceive. Sweet spot: 35–55px.
 *   Old default (10px Y) was 1.9%: below perceptual threshold. Invisible.
 *   New default: 40px Y, 20px X.
 */

import type { BeatGrid, BeatState } from './BeatConductor';
import type { CinematicDirection } from '@/types/CinematicDirection';

// ─── Public interfaces ───────────────────────────────────────────────────

export interface CameraConfig {
  beatBounceY: number;
  beatBounceX: number;
  beatZoom: number;
  bassMultiplier: number;
  transientMultiplier: number;
  /** @deprecated No-op kept for external callers passing old configs. */
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

// ─── Internal: song arc types ─────────────────────────────────────────────

interface SongArcPoint {
  timeSec: number;
  arcPhase: number;   // 0=rising, 0.5=peak, 1=falling
  energy: number;     // 0-1 normalized
  isDrop: boolean;
  grammar: SectionGrammar;
}

interface SectionGrammar {
  name: string;
  beatYScale: number;
  beatXScale: number;
  beatZoomScale: number;
  rotScale: number;
  slowZoomRate: number;   // zoom units/sec
  slowDriftY: number;     // px/sec
  anticipationSec: number;
  isRelease: boolean;
}

// ─── Grammar library ──────────────────────────────────────────────────────

const G: Record<string, SectionGrammar> = {
  intro:       { name:'intro',       beatYScale:0.6, beatXScale:0.5, beatZoomScale:0.6, rotScale:0.4, slowZoomRate: 0.003, slowDriftY:   0, anticipationSec:4, isRelease:false },
  verse:       { name:'verse',       beatYScale:0.7, beatXScale:0.6, beatZoomScale:0.7, rotScale:0.5, slowZoomRate: 0.004, slowDriftY:  -3, anticipationSec:6, isRelease:false },
  prechorus:   { name:'prechorus',   beatYScale:0.9, beatXScale:0.8, beatZoomScale:0.9, rotScale:0.8, slowZoomRate: 0.010, slowDriftY:  -8, anticipationSec:3, isRelease:false },
  chorus:      { name:'chorus',      beatYScale:1.4, beatXScale:1.2, beatZoomScale:1.4, rotScale:1.3, slowZoomRate:-0.002, slowDriftY:   0, anticipationSec:4, isRelease:true  },
  drop:        { name:'drop',        beatYScale:1.8, beatXScale:1.5, beatZoomScale:1.8, rotScale:1.6, slowZoomRate:-0.005, slowDriftY:   5, anticipationSec:8, isRelease:true  },
  bridge:      { name:'bridge',      beatYScale:0.8, beatXScale:1.1, beatZoomScale:0.7, rotScale:1.2, slowZoomRate: 0.000, slowDriftY:   0, anticipationSec:3, isRelease:false },
  outro:       { name:'outro',       beatYScale:0.5, beatXScale:0.4, beatZoomScale:0.4, rotScale:0.3, slowZoomRate:-0.008, slowDriftY:   3, anticipationSec:2, isRelease:false },
  default:     { name:'default',     beatYScale:1.0, beatXScale:1.0, beatZoomScale:1.0, rotScale:1.0, slowZoomRate: 0.002, slowDriftY:   0, anticipationSec:4, isRelease:false },
};

function moodToGrammar(mood?: string, motion?: string): SectionGrammar {
  const s = ((mood ?? '') + ' ' + (motion ?? '')).toLowerCase();
  if (/drop|explosion|climax|peak/.test(s)) return G.drop;
  if (/chorus|anthemic|euphoric|triumphant|powerful|release/.test(s)) return G.chorus;
  if (/pre.?chorus|building|rising|urgent/.test(s)) return G.prechorus;
  if (/bridge|breakdown|uncertain|searching/.test(s)) return G.bridge;
  if (/intro|opening/.test(s)) return G.intro;
  if (/outro|fade|ending|resolution/.test(s)) return G.outro;
  if (/verse|intimate|quiet|minimal|sparse/.test(s)) return G.verse;
  return G.default;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  beatBounceY: 40,      // was 10 — below human perception threshold
  beatBounceX: 20,      // was 5
  beatZoom: 0.04,       // was 0.025
  bassMultiplier: 2.0,
  transientMultiplier: 1.6,
  swaySmoothing: 2.0,   // deprecated no-op
  dropEnergyThreshold: 0.22,
  dropMinEnergy: 0.50,
  dropShakePx: 8,
  dropIntensity: 1.8,
  dropDecayRate: 1.2,
  heroZoom: 0.12,
  heroShakePx: 6,
  heroPunchMs: 90,
  heroTaperMs: 150,
  heroStillMs: 120,
  springStiffness: 220, // k=220, c=2√220≈29.7 → critical, ~50ms settle
  springDamping: 30,
  parallaxFar: 0.15,
  parallaxMid: 0.5,
  parallaxNear: 0.85,
  maxZoom: 1.18,
  maxOffsetPx: 55,
  maxRotationRad: 3.0 * Math.PI / 180,  // ±3°
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a: number, b: number, t: number): number { const c = clamp(t,0,1); return a+(b-a)*c; }
function smoothstep(t: number): number { const c=clamp(t,0,1); return c*c*(3-2*c); }
function spring(pos: number, vel: number, k: number, c: number, dt: number): [number, number] {
  const acc = -k * pos - c * vel;
  const v2 = vel + acc * dt;
  return [pos + v2 * dt, v2];
}

// ─── CameraRig V4 ─────────────────────────────────────────────────────────

export class CameraRig {
  private cfg: CameraConfig;
  private canvasW = 960;
  private canvasH = 540;

  // Pre-computed song structure
  private songArc: SongArcPoint[] = [];
  private songDuration = 0;
  private peakDropTime = -1;

  // Layer 1: Section arc
  private currentGrammar: SectionGrammar = G.default;
  private nextSectionTimeSec = -1;
  private _slowZoom = 1.0;
  private _slowDriftY = 0;
  private _anticipationFreeze = 0;
  private _releaseImpulse = 0;
  private _prevSectionIdx = -1;
  private _breathPhase = 0;

  // Layer 2: Beat grammar — per-type independent spring systems
  private _bassY=0; private _bassYV=0;
  private _bassZ=0; private _bassZV=0;
  private _transX=0; private _transXV=0;
  private _transR=0; private _transRV=0;
  private _tonalZ=0; private _tonalZV=0;
  private _tonalR=0; private _tonalRV=0;
  private _beatY=0; private _beatYV=0;
  private _beatX=0; private _beatXV=0;
  private _beatZ=0; private _beatZV=0;

  // Drop detection
  private _energyAvg = 0.3;
  private _dropAmount = 0;

  // Hero punch
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

  // Output spring
  private _springZoom=1; private _velZoom=0;
  private _springOffX=0; private _velOffX=0;
  private _springOffY=0; private _velOffY=0;
  private _springRot=0;  private _velRot=0;

  // Output values
  private _zoom=1; private _offsetX=0; private _offsetY=0;
  private _rotation=0; private _shakeX=0; private _shakeY=0;
  private _cachedTransform: SubjectTransform | null = null;
  private _prevBeatIndex = -1;

  constructor(
    config?: Partial<CameraConfig>,
    beatGrid?: BeatGrid | null,
    cinematicDirection?: CinematicDirection | null,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (beatGrid) this._preAnalyze(beatGrid, cinematicDirection);
  }

  private _preAnalyze(beatGrid: BeatGrid, cd: CinematicDirection | null | undefined): void {
    const beats = (beatGrid.beats ?? []).filter(Number.isFinite);
    if (beats.length < 2) return;
    this.songDuration = beats[beats.length - 1] + 60 / Math.max(30, beatGrid.bpm ?? 120);
    const beatEnergies = beatGrid.beatEnergies;
    const sections: any[] = (cd as any)?.sections ?? (cd as any)?.chapters ?? [];
    const dur = this.songDuration;
    const arc: SongArcPoint[] = [];

    if (sections.length > 0) {
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
        const grammar = moodToGrammar(sec.mood ?? sec.visualMood, sec.motion);
        const sp = t / Math.max(1, dur);
        const arcPhase = sp < 0.55 ? smoothstep(sp / 0.55) * 0.5 : 0.5 + smoothstep((sp - 0.55) / 0.45) * 0.5;
        const prevE = i > 0 ? secEnergies[i - 1] : 0;
        const isDrop = grammar.isRelease || (e > 0.75 && secEnergies[i] > prevE * 1.3);
        arc.push({ timeSec: t, arcPhase, energy: e, isDrop, grammar });
      }
      arc.push({ timeSec: dur, arcPhase: 1, energy: 0, isDrop: false, grammar: G.outro });
    } else {
      // No sections: detect drops from 8-bar energy windows
      const period = 60 / Math.max(30, beatGrid.bpm ?? 120);
      const winDur = period * 32;
      const nWin = Math.ceil(dur / winDur);
      let runAvg = 0.5;
      for (let w = 0; w < nWin; w++) {
        const t = w * winDur;
        let sum = 0, n = 0;
        for (let i = 0; i < beats.length; i++) {
          if (beats[i] >= t && beats[i] < t + winDur && beatEnergies && i < beatEnergies.length) { sum += beatEnergies[i]; n++; }
        }
        const e = n > 0 ? sum / n : 0.5;
        runAvg += (e - runAvg) * 0.3;
        const isDrop = e > runAvg * 1.35;
        const grammar = isDrop ? G.drop : (e < 0.4 ? G.verse : G.chorus);
        arc.push({ timeSec: t, arcPhase: smoothstep(t / Math.max(1, dur)), energy: e, isDrop, grammar });
      }
    }

    this.songArc = arc;
    let peakE = -1, peakT = -1;
    for (const p of arc) { if (p.isDrop && p.energy > peakE) { peakE = p.energy; peakT = p.timeSec; } }
    this.peakDropTime = peakT;
  }

  private _resolveArc(tSec: number): { pt: SongArcPoint; idx: number; nextT: number } {
    const arc = this.songArc;
    const fallback = { pt: { timeSec:0, arcPhase:0, energy:0.5, isDrop:false, grammar:G.default }, idx:-1, nextT:-1 };
    if (!arc.length) return fallback;
    let idx = 0;
    for (let i = arc.length - 1; i >= 0; i--) { if (arc[i].timeSec <= tSec) { idx = i; break; } }
    return { pt: arc[idx], idx, nextT: idx + 1 < arc.length ? arc[idx + 1].timeSec : -1 };
  }

  loadSongData(beatGrid: BeatGrid | null, cd: CinematicDirection | null | undefined): void {
    this.songArc = [];
    if (beatGrid) this._preAnalyze(beatGrid, cd);
    this.reset();
  }

  update(deltaMs: number, beatState: BeatState | null, focus?: SubjectFocus | PhraseAnchor | null): void {
    const cfg = this.cfg;
    const dt = Math.min(deltaMs, 100) / 1000;
    const sf = (focus && 'heroActive' in focus) ? focus as SubjectFocus : null;
    const nowMs = performance.now();
    // Pull current time from beatState if available
    const tSec = (beatState as any)?._tSec ?? -1;

    const energy     = beatState?.energy      ?? 0;
    const pulse      = beatState?.pulse        ?? 0;
    const phase      = beatState?.phase        ?? 0;
    const hitStr     = beatState?.hitStrength  ?? 0;
    const hitType    = beatState?.hitType      ?? 'none';
    const isNewBeat  = beatState !== null && beatState.beatIndex !== this._prevBeatIndex && beatState.beatIndex >= 0;
    const isDownbeat = beatState?.isDownbeat   ?? false;
    const strength   = beatState?.strength     ?? 0.5;
    const brightness = beatState?.brightness   ?? 0.5;

    // ══ LAYER 1: SECTION ARC ════════════════════════════════════════════

    const { pt: arcPt, idx: arcIdx, nextT } = this._resolveArc(tSec >= 0 ? tSec : 0);
    const grammar = arcPt.grammar;
    this.currentGrammar = grammar;
    this.nextSectionTimeSec = nextT;

    // Section change → fire release impulse if it's a drop
    if (arcIdx !== this._prevSectionIdx && arcIdx >= 0) {
      if (this._prevSectionIdx >= 0 && arcPt.isDrop) this._releaseImpulse = 1.0;
      this._prevSectionIdx = arcIdx;
    }
    this._releaseImpulse = Math.max(0, this._releaseImpulse - dt * 3);

    // Anticipation freeze: ramp toward 1 as we approach next section boundary
    if (nextT > 0 && tSec >= 0) {
      const toNext = nextT - tSec;
      const nextIsDrop = this.songArc[arcIdx + 1]?.isDrop ?? false;
      const antSec = nextIsDrop ? grammar.anticipationSec : Math.min(grammar.anticipationSec, 3);
      if (toNext < antSec && toNext > 0) {
        this._anticipationFreeze = smoothstep(1 - toNext / antSec);
      } else {
        this._anticipationFreeze = Math.max(0, this._anticipationFreeze - dt * 2);
      }
    } else {
      this._anticipationFreeze = Math.max(0, this._anticipationFreeze - dt * 2);
    }

    // Slow section-level drift — brightness modulates expansion feeling
    const brightBias = lerp(0.8, 1.2, brightness);
    const arcFree = 1 - this._anticipationFreeze * 0.5;
    this._slowZoom  = clamp(this._slowZoom  + grammar.slowZoomRate * dt * brightBias * arcFree, 0.97, 1.06);
    this._slowDriftY = clamp(this._slowDriftY + grammar.slowDriftY * dt * arcFree, -20, 20);

    // Continuous breath (always present — camera never fully still)
    this._breathPhase += dt;
    const breathAmp = lerp(2, 7, energy) * (1 - this._anticipationFreeze * 0.8);
    const breathY = Math.sin(this._breathPhase * 0.8) * breathAmp;
    const breathX = Math.cos(this._breathPhase * 0.55) * breathAmp * 0.4;

    // ══ LAYER 2: BEAT GRAMMAR ═══════════════════════════════════════════

    // Amplitude floor: even quiet beats are visible. Energy + strength build on top.
    const beatAmp = (0.35 + energy * 0.4 + strength * 0.25)
      * (1 + (hitStr > 0.3 ? hitStr * 0.4 : 0))
      * (1 - this._anticipationFreeze);   // freeze suppresses beat dance

    if (isNewBeat && energy > 0.02) {
      const db = isDownbeat ? 1.6 : 1.0;
      // Is this close to the song's peak drop? Extra boost.
      const nearApex = this.peakDropTime >= 0 && tSec >= 0 && Math.abs(tSec - this.peakDropTime) < 4;
      const apexBoost = nearApex ? 1.4 : 1.0;

      if (hitType === 'bass' || (hitType === 'none' && isDownbeat)) {
        // BASS: gravity punch down + zoom in. Floats back SLOWLY (~2 beats, underdamped).
        const amp = beatAmp * grammar.beatYScale * cfg.bassMultiplier * db * apexBoost;
        this._bassY = cfg.beatBounceY * amp;   this._bassYV = 0;
        this._bassZ = cfg.beatZoom * amp * 1.2; this._bassZV = 0;
      } else if (hitType === 'transient') {
        // TRANSIENT: lateral whip + dutch tilt. Snaps back FAST (~0.5 beats, critically damped).
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        const amp = beatAmp * grammar.beatXScale * cfg.transientMultiplier * apexBoost;
        this._transX = cfg.beatBounceX * amp * dir;   this._transXV = 0;
        this._transR = dir * cfg.maxRotationRad * 0.5 * grammar.rotScale * amp; this._transRV = 0;
      } else if (hitType === 'tonal') {
        // TONAL: intimate push + gentle CW rotation. Medium-slow return.
        const amp = beatAmp * grammar.beatZoomScale * apexBoost;
        this._tonalZ = cfg.beatZoom * amp * 0.9; this._tonalZV = 0;
        this._tonalR = cfg.maxRotationRad * 0.3 * grammar.rotScale * (pulse > 0.5 ? 1 : -1) * amp; this._tonalRV = 0;
      } else {
        // GENERIC: Y bounce + X alternation.
        const dir = (beatState!.beatIndex % 2 === 0) ? 1 : -1;
        const amp = beatAmp * grammar.beatYScale * db;
        this._beatY = cfg.beatBounceY * amp * 0.9; this._beatYV = 0;
        this._beatX = cfg.beatBounceX * amp * 0.5 * dir; this._beatXV = 0;
        this._beatZ = cfg.beatZoom * amp * db; this._beatZV = 0;
      }
    }

    // Per-type spring decay — each type has character-matched physics:
    //   Bass     k=25  c=8   → underdamped, slow float (~400ms), slight overshoot = weight
    //   Transient k=180 c=26 → critically damped, fast snap (~120ms) = snare crispness
    //   Tonal    k=40  c=12  → underdamped, medium-slow (~300ms), slight overshoot = warmth
    //   Generic  k=70  c=16  → lightly damped, medium (~200ms)
    [this._bassY,  this._bassYV]  = spring(this._bassY,  this._bassYV,  25,  8,  dt);
    [this._bassZ,  this._bassZV]  = spring(this._bassZ,  this._bassZV,  25,  8,  dt);
    [this._transX, this._transXV] = spring(this._transX, this._transXV, 180, 26, dt);
    [this._transR, this._transRV] = spring(this._transR, this._transRV, 180, 26, dt);
    [this._tonalZ, this._tonalZV] = spring(this._tonalZ, this._tonalZV, 40,  12, dt);
    [this._tonalR, this._tonalRV] = spring(this._tonalR, this._tonalRV, 40,  12, dt);
    [this._beatY,  this._beatYV]  = spring(this._beatY,  this._beatYV,  70,  16, dt);
    [this._beatX,  this._beatXV]  = spring(this._beatX,  this._beatXV,  70,  16, dt);
    [this._beatZ,  this._beatZV]  = spring(this._beatZ,  this._beatZV,  70,  16, dt);

    // ══ DROP DETECTION ══════════════════════════════════════════════════

    this._energyAvg += (energy - this._energyAvg) * Math.min(1, dt * 0.3);
    const spike = energy - this._energyAvg;
    const isDropping = spike > cfg.dropEnergyThreshold && energy > cfg.dropMinEnergy;
    this._dropAmount = isDropping
      ? Math.min(1, this._dropAmount + dt * 5)
      : Math.max(0, this._dropAmount - dt * cfg.dropDecayRate);
    const dropMult = 1 + this._dropAmount * (cfg.dropIntensity - 1);

    const shT = nowMs * 0.013;
    const dropShX = this._dropAmount * cfg.dropShakePx * Math.sin(shT * 7.1 + 1.3) * energy;
    const dropShY = this._dropAmount * cfg.dropShakePx * Math.cos(shT * 5.7 + 2.9) * energy;

    // ══ HERO PUNCH ══════════════════════════════════════════════════════

    const heroApproaching = sf?.heroApproaching ?? false;
    const heroJustStarted = sf !== null && sf.heroActive && sf.emphasisLevel >= 4 && !this._prevHeroActive;

    if (heroApproaching) {
      this._heroStillTimer += deltaMs;
      this._heroFreezeAmt = Math.min(1, this._heroStillTimer / Math.max(1, cfg.heroStillMs));
    } else if (!sf?.heroActive) {
      this._heroStillTimer = 0;
      this._heroFreezeAmt = Math.max(0, this._heroFreezeAmt - dt * 8);
    }

    if (heroJustStarted) {
      const elapsed = nowMs - this._lastHeroPunchMs;
      const scale = (elapsed < cfg.heroTaperMs ? Math.max(0.3, elapsed / cfg.heroTaperMs) : 1)
                  * (sf!.isClimax ? 1.4 : 1);
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

    // ══ COMPOSITE ═══════════════════════════════════════════════════════

    const beatAlive = (1 - this._anticipationFreeze) * (1 - this._heroFreezeAmt);
    const relBurst  = this._releaseImpulse * cfg.beatBounceY * 0.8;

    const rawZoom = this._slowZoom
      + (this._bassZ + this._tonalZ + this._beatZ) * beatAlive * dropMult
      + relBurst * 0.002 * dropMult
      + this._heroPunchZoom * heroFrac;

    const rawOffY = (this._bassY + this._beatY) * beatAlive * dropMult
      + this._slowDriftY * brightBias
      + breathY + dropShY
      + relBurst * beatAlive
      + this._heroPunchShakeY * heroFrac;

    const rawOffX = (this._transX + this._beatX) * beatAlive * dropMult
      + breathX + dropShX
      + this._heroPunchShakeX * heroFrac;

    const rawRot = (this._transR + this._tonalR) * beatAlive * dropMult;

    // ── Output spring ───────────────────────────────────────────────────
    const k = cfg.springStiffness, c = cfg.springDamping;
    const acZ = -k*(this._springZoom-rawZoom)   - c*this._velZoom;  this._velZoom  += acZ*dt;  this._springZoom  += this._velZoom*dt;
    const acX = -k*(this._springOffX-rawOffX)   - c*this._velOffX;  this._velOffX  += acX*dt;  this._springOffX  += this._velOffX*dt;
    const acY = -k*(this._springOffY-rawOffY)   - c*this._velOffY;  this._velOffY  += acY*dt;  this._springOffY  += this._velOffY*dt;
    const acR = -k*(this._springRot -rawRot)    - c*this._velRot;   this._velRot   += acR*dt;  this._springRot   += this._velRot*dt;

    this._zoom     = clamp(this._springZoom,  2-cfg.maxZoom,    cfg.maxZoom);
    this._offsetX  = clamp(this._springOffX, -cfg.maxOffsetPx,  cfg.maxOffsetPx);
    this._offsetY  = clamp(this._springOffY, -cfg.maxOffsetPx,  cfg.maxOffsetPx);
    this._rotation = clamp(this._springRot,  -cfg.maxRotationRad, cfg.maxRotationRad);
    this._shakeX   = clamp(this._springOffX * 0.5, -cfg.maxOffsetPx, cfg.maxOffsetPx);
    this._shakeY   = clamp(this._springOffY * 0.5, -cfg.maxOffsetPx, cfg.maxOffsetPx);

    this._prevHeroActive = sf?.heroActive ?? false;
    if (beatState) this._prevBeatIndex = beatState.beatIndex;
    this._cachedTransform = null;
  }

  // ─── Stubs ────────────────────────────────────────────────────────────
  setBPM(_bpm: number): void {}
  setSection(_s: SectionRigName): void {}
  setSectionFromMood(_m: string): void {}
  setEnergy(_e: number): void {}
  setViewport(w: number, h: number): void { this.canvasW = w; this.canvasH = h; }

  // ─── Output ───────────────────────────────────────────────────────────
  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;
    return this._cachedTransform = {
      zoom: this._zoom, proximity: Math.max(0, this._zoom-1),
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
    const z = 1 + (this._zoom-1)*depth, ox = this._offsetX*depth, oy = this._offsetY*depth;
    const sx = this._shakeX*depth, sy = this._shakeY*depth, rot = this._rotation*depth;
    const cx = this.canvasW/2, cy = this.canvasH/2;
    if (Math.abs(z-1)>0.0005 || Math.abs(ox)>0.1 || Math.abs(oy)>0.1 || Math.abs(sx)>0.1 || Math.abs(sy)>0.1 || Math.abs(rot)>0.0001) {
      ctx.translate(cx+ox+sx, cy+oy+sy);
      if (Math.abs(rot)>0.0001) ctx.rotate(rot);
      if (Math.abs(z-1)>0.0005) ctx.scale(z, z);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void { ctx.restore(); }
  getProximity(): number { return Math.max(0, this._zoom-1); }
  get drop(): number { return this._dropAmount; }

  reset(): void {
    this._prevBeatIndex=-1; this._slowZoom=1; this._slowDriftY=0; this._breathPhase=0;
    this._anticipationFreeze=0; this._releaseImpulse=0; this._prevSectionIdx=-1;
    this._bassY=this._bassYV=this._bassZ=this._bassZV=0;
    this._transX=this._transXV=this._transR=this._transRV=0;
    this._tonalZ=this._tonalZV=this._tonalR=this._tonalRV=0;
    this._beatY=this._beatYV=this._beatX=this._beatXV=this._beatZ=this._beatZV=0;
    this._energyAvg=0.3; this._dropAmount=0;
    this._heroActive=false; this._heroPunchZoom=this._heroPunchShakeX=this._heroPunchShakeY=0;
    this._heroPunchMsLeft=this._heroPunchMsTotal=this._lastHeroPunchMs=0;
    this._prevHeroActive=false; this._heroStillTimer=this._heroFreezeAmt=0;
    this._springZoom=1; this._velZoom=0; this._springOffX=this._velOffX=0;
    this._springOffY=this._velOffY=0; this._springRot=this._velRot=0;
    this._zoom=1; this._offsetX=this._offsetY=this._rotation=this._shakeX=this._shakeY=0;
    this._cachedTransform=null;
  }

  /** Expose current grammar name for debug HUD */
  get currentGrammarName(): string { return this.currentGrammar.name; }
  /** Expose anticipation level (0-1) for debug HUD */
  get anticipation(): number { return this._anticipationFreeze; }
}
