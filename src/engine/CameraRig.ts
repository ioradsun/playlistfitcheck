/**
 * CameraRig — Three-layer cinematic camera.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  BREATH   slow section-level drift + zoom (0.01–0.03 Hz)   │
 * │  PULSE    beat-synced rhythmic sway     (synced to BPM)    │
 * │  PUNCH    instant word-level impulse    (1–3 frames)       │
 * │  PARALLAX depth separation per layer    (always-on)        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Layers composite additively: totalZoom = breath + pulse + punch.
 * Each layer is independently tunable and can be disabled.
 *
 * SAFETY ENVELOPE:
 *   Max zoom:     1.15  (never clip text)
 *   Max shake:    10px  (never blur readability)
 *   Max rotation: ±2.5° (cinematic, not nauseating)
 */

import type { BeatState } from './BeatConductor';

// ─── Public interfaces ───────────────────────────────────────

export interface CameraConfig {
  // Punch
  beatThreshold: number;
  silenceThreshold: number;
  beatZoom: number;
  heroZoom: number;
  heroShakePx: number;
  heroDurationFrames: number;
  heroTaperMs: number;
  // Breath
  breathZoomRange: number;       // max ±zoom from 1.0 (e.g. 0.025 = ±2.5%)
  breathDriftPx: number;         // max drift in px at canvas scale
  breathTransitionSec: number;   // seconds to lerp between section targets
  // Pulse
  pulseAmplitudeY: number;       // max Y bob in px
  pulseAmplitudeX: number;       // max X sway in px
  pulseZoom: number;             // zoom per downbeat (e.g. 0.012)
  // Parallax depth multipliers
  parallaxFar: number;
  parallaxMid: number;
  parallaxNear: number;
  // Safety
  maxZoom: number;
  maxShakePx: number;
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
  // Punch
  beatThreshold: 0.55,
  silenceThreshold: 0.08,
  beatZoom: 0.03,
  heroZoom: 0.09,
  heroShakePx: 3,
  heroDurationFrames: 3,
  heroTaperMs: 150,
  // Breath — bold enough to feel
  breathZoomRange: 0.06,         // ±6% zoom per section
  breathDriftPx: 30,             // 30px drift — visible on all screens
  breathTransitionSec: 4,        // arrive in 4s not 8
  // Pulse — rhythmic bob you can feel
  pulseAmplitudeY: 5.0,          // 5px Y bob on beat
  pulseAmplitudeX: 2.5,          // 2.5px X sway
  pulseZoom: 0.025,              // 2.5% downbeat zoom bump
  // Parallax — wide depth spread
  parallaxFar: 0.15,             // BG barely moves
  parallaxMid: 0.5,              // mid layers at half
  parallaxNear: 0.85,            // near particles nearly 1:1
  // Safety — generous headroom
  maxZoom: 1.15,
  maxShakePx: 10,
  maxRotationRad: 2.5 * Math.PI / 180,
};

// ─── Section camera presets ──────────────────────────────────

interface BreathTarget {
  zoom: number;       // target zoom offset from 1.0 (e.g. +0.02 = push in)
  driftX: number;     // target drift direction −1 to +1
  driftY: number;     // target drift direction −1 to +1
  rotation: number;   // target rotation in radians
  speed: number;      // multiplier on breath transition speed (1.0 = normal)
}

const SECTION_BREATH: Record<SectionRigName, BreathTarget> = {
  // Verses push in — intimacy, background slides left
  verse:  { zoom: +0.04,  driftX: -0.6, driftY: -0.2,  rotation: 0,      speed: 1.0 },
  // Choruses pull out — expansive, wide, centered
  chorus: { zoom: -0.03,  driftX:  0.0, driftY:  0.0,  rotation: 0,      speed: 1.5 },
  // Bridges hold still — suspended, slow tilt (~0.7°)
  bridge: { zoom:  0.0,   driftX:  0.0, driftY:  0.0,  rotation: 0.012,  speed: 0.6 },
  // Drops snap forward fast — aggressive push-in
  drop:   { zoom: +0.06,  driftX:  0.0, driftY: -0.5,  rotation: 0,      speed: 3.0 },
  // Intro: gentle drift in from right
  intro:  { zoom: +0.03,  driftX:  0.5, driftY:  0.0,  rotation: 0,      speed: 0.7 },
  // Outro: slow pull-back with slight tilt
  outro:  { zoom: -0.05,  driftX:  0.0, driftY:  0.2,  rotation: 0.005,  speed: 0.5 },
};

// ─── Helpers ─────────────────────────────────────────────────

/** Exponential decay toward target. Framerate-independent. */
function expLerp(current: number, target: number, rate: number, dtSec: number): number {
  // rate = how many times per second we close 63% of the gap
  // Higher rate = faster. rate=1 means ~63% per second.
  const alpha = 1 - Math.exp(-rate * dtSec);
  return current + (target - current) * alpha;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ─── State machine (expanded) ────────────────────────────────

const enum CamState {
  IDLE = 0,
  BEAT_HIT = 1,
  HERO_PUNCH = 2,
}

// ─── CameraRig ───────────────────────────────────────────────

export class CameraRig {
  private config: CameraConfig;
  private canvasW = 960;
  private canvasH = 540;

  // ═══ BREATH state ═══
  private section: SectionRigName = 'verse';
  private breathTarget: BreathTarget = SECTION_BREATH.verse;
  private breathZoom = 0;          // current zoom offset
  private breathDriftX = 0;        // current drift px
  private breathDriftY = 0;        // current drift px
  private breathRotation = 0;      // current rotation rad
  private breathBrightness = 0.5;  // modulates breath amplitude

  // ═══ PULSE state ═══
  private bpm = 120;
  private pulsePhase = 0;          // 0–1 from beatState
  private pulseEnergy = 0.5;       // smoothed energy
  private pulseIsDownbeat = false;
  private lastPulseDownbeatZoom = 0;

  // ═══ PUNCH state (from V1, expanded) ═══
  private punchState: CamState = CamState.IDLE;
  private punchZoom = 0;
  private punchShakeX = 0;
  private punchShakeY = 0;
  private punchRotation = 0;
  private framesRemaining = 0;
  private totalFrames = 0;
  private lastHeroPunchMs = 0;
  private prevBeatIndex = -1;
  private prevHeroActive = false;
  private shakeAngle = 0;

  // ═══ Silence state ═══
  private silenceTimer = 0;        // seconds since last vocal activity
  private silencePullback = 0;     // gradual wide-shot pull-back

  // ═══ Climax state ═══
  private climaxIntensity = 0;     // 0–1 smoothed climax blend

  // ═══ Cache ═══
  private _cachedTransform: SubjectTransform | null = null;
  private _compositeZoom = 1;
  private _compositeOffsetX = 0;
  private _compositeOffsetY = 0;
  private _compositeRotation = 0;
  private _compositeShakeX = 0;
  private _compositeShakeY = 0;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Section / energy setters ──────────────────────────────

  setBPM(bpm: number): void {
    this.bpm = Math.max(40, Math.min(300, bpm));
  }

  setSection(section: SectionRigName): void {
    if (section === this.section) return;
    this.section = section;
    this.breathTarget = SECTION_BREATH[section] ?? SECTION_BREATH.verse;
  }

  /**
   * Accept any string and map it to the closest SectionRigName.
   * Handles cinematic direction values like "intimate", "expansive", etc.
   */
  setSectionFromMood(mood: string): void {
    const m = (mood || '').toLowerCase();
    if (m.includes('intro') || m.includes('opening'))           this.setSection('intro');
    else if (m.includes('vers') || m.includes('intimate') || m.includes('quiet'))
                                                                 this.setSection('verse');
    else if (m.includes('chor') || m.includes('expan') || m.includes('anthemic') || m.includes('soar'))
                                                                 this.setSection('chorus');
    else if (m.includes('bridge') || m.includes('suspend') || m.includes('reflect'))
                                                                 this.setSection('bridge');
    else if (m.includes('drop') || m.includes('explo') || m.includes('intense') || m.includes('chaos'))
                                                                 this.setSection('drop');
    else if (m.includes('outro') || m.includes('fad') || m.includes('end') || m.includes('resolve'))
                                                                 this.setSection('outro');
    // else keep current
  }

  setEnergy(rawEnergy: number): void {
    // Smooth externally-provided energy (e.g. from audio analysis sections)
    this.breathBrightness = clamp(rawEnergy, 0, 1);
  }

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  // ─── Main update — called once per frame ───────────────────

  update(
    deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const cfg = this.config;
    const dtSec = Math.min(deltaMs, 100) / 1000; // cap at 100ms for stability
    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;
    const nowMs = performance.now();

    // ═══════════════════════════════════════════════════════════
    // 1. BREATH — slow section-level drift
    // ═══════════════════════════════════════════════════════════
    {
      const target = this.breathTarget;
      // Brightness modulates amplitude: dark sections breathe slower/smaller
      const brightnessScale = 0.5 + (beatState?.brightness ?? this.breathBrightness) * 0.5;
      const transitionRate = (target.speed / Math.max(1, cfg.breathTransitionSec)) * brightnessScale;

      this.breathZoom = expLerp(
        this.breathZoom,
        target.zoom * cfg.breathZoomRange / 0.025 * brightnessScale,
        transitionRate,
        dtSec,
      );
      this.breathDriftX = expLerp(
        this.breathDriftX,
        target.driftX * cfg.breathDriftPx * brightnessScale,
        transitionRate,
        dtSec,
      );
      this.breathDriftY = expLerp(
        this.breathDriftY,
        target.driftY * cfg.breathDriftPx * brightnessScale,
        transitionRate,
        dtSec,
      );
      this.breathRotation = expLerp(
        this.breathRotation,
        target.rotation * brightnessScale,
        transitionRate,
        dtSec,
      );
    }

    // ═══════════════════════════════════════════════════════════
    // 2. PULSE — beat-synced rhythmic sway
    // ═══════════════════════════════════════════════════════════
    {
      if (beatState) {
        this.pulsePhase = beatState.phase;
        this.pulseEnergy = expLerp(this.pulseEnergy, beatState.energy, 3.0, dtSec);
        this.pulseIsDownbeat = beatState.isDownbeat;
      }

      // Downbeat zoom punch with exponential decay
      if (beatState && beatState.isDownbeat && beatState.beatIndex !== this.prevBeatIndex) {
        this.lastPulseDownbeatZoom = cfg.pulseZoom * Math.min(1, this.pulseEnergy * 1.5);
      }
      this.lastPulseDownbeatZoom *= Math.pow(0.85, dtSec * 60); // ~85% decay per frame at 60fps
    }

    // ═══════════════════════════════════════════════════════════
    // 3. PUNCH — instant word-level impulse
    // ═══════════════════════════════════════════════════════════
    {
      const heroJustStarted = sf !== null
        && sf.heroActive
        && sf.emphasisLevel >= 4
        && !this.prevHeroActive;

      if (heroJustStarted) {
        const timeSinceLastHero = nowMs - this.lastHeroPunchMs;
        let scale = 1.0;
        if (timeSinceLastHero < cfg.heroTaperMs) {
          scale = Math.max(0.3, timeSinceLastHero / cfg.heroTaperMs);
        }
        const energy = beatState?.energy ?? 0.5;
        const silenceScale = energy < cfg.silenceThreshold ? 0.4 : 1.0;
        scale *= silenceScale;

        // Climax multiplier
        const climaxMult = sf.isClimax ? 1.4 : 1.0;
        scale *= climaxMult;

        this.punchState = CamState.HERO_PUNCH;
        this.punchZoom = cfg.heroZoom * scale;
        this.totalFrames = cfg.heroDurationFrames;
        this.framesRemaining = cfg.heroDurationFrames;

        this.shakeAngle = (nowMs * 7.13) % (Math.PI * 2);
        this.punchShakeX = Math.cos(this.shakeAngle) * cfg.heroShakePx * scale;
        this.punchShakeY = Math.sin(this.shakeAngle) * cfg.heroShakePx * scale;

        // Climax adds rotation wobble
        this.punchRotation = sf.isClimax
          ? (Math.sin(this.shakeAngle * 3) * 0.008 * scale) // ~0.5° max
          : 0;

        this.lastHeroPunchMs = nowMs;
      }

      // BeatHit (only if not in HeroPunch)
      if (this.punchState !== CamState.HERO_PUNCH && beatState) {
        const energy = beatState.energy;
        const newBeat = beatState.beatIndex !== this.prevBeatIndex;

        if (newBeat && energy >= cfg.silenceThreshold) {
          const hitScore = beatState.strength * beatState.hitStrength * energy;

          if (hitScore > cfg.beatThreshold) {
            this.punchState = CamState.BEAT_HIT;
            this.punchZoom = cfg.beatZoom;
            this.totalFrames = 1;
            this.framesRemaining = 1;

            // Bass hits punch down, transients shake laterally
            if (beatState.hitType === 'bass') {
              this.punchShakeX = 0;
              this.punchShakeY = 1.5 * (energy > 0.7 ? 2 : 1);
              this.punchRotation = 0;
            } else if (beatState.hitType === 'transient') {
              // Alternate left/right on transients
              const dir = (beatState.beatIndex % 2 === 0) ? 1 : -1;
              this.punchShakeX = 1.5 * dir;
              this.punchShakeY = 0;
              this.punchRotation = 0;
            } else {
              this.punchShakeX = 0;
              this.punchShakeY = 0;
              this.punchRotation = 0;
            }
          }
        }
      }

      // Decay
      if (this.framesRemaining > 0) {
        this.framesRemaining--;
      }
      if (this.framesRemaining <= 0 && this.punchState !== CamState.IDLE) {
        this.punchState = CamState.IDLE;
        this.punchZoom = 0;
        this.punchShakeX = 0;
        this.punchShakeY = 0;
        this.punchRotation = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. SILENCE — pull back during vocal gaps
    // ═══════════════════════════════════════════════════════════
    {
      const isActive = sf?.vocalActive ?? false;
      if (isActive) {
        this.silenceTimer = 0;
      } else {
        this.silenceTimer += dtSec;
      }
      // After 1.5s of silence, start gradual wide-shot pull-back
      const silenceTarget = this.silenceTimer > 1.5
        ? Math.min(1, (this.silenceTimer - 1.5) / 3.0) // 0→1 over 3 seconds
        : 0;
      this.silencePullback = expLerp(this.silencePullback, silenceTarget, 2.0, dtSec);
    }

    // ═══════════════════════════════════════════════════════════
    // 5. CLIMAX — smooth blend to heightened state
    // ═══════════════════════════════════════════════════════════
    {
      const targetClimax = sf?.isClimax ? 1 : 0;
      this.climaxIntensity = expLerp(this.climaxIntensity, targetClimax, 1.5, dtSec);
    }

    // ═══════════════════════════════════════════════════════════
    // 6. COMPOSITE — sum all layers with safety clamps
    // ═══════════════════════════════════════════════════════════
    {
      // Punch active fraction (linear decay within event window)
      let punchFrac = 0;
      if (this.framesRemaining > 0 && this.totalFrames > 0) {
        punchFrac = this.framesRemaining / this.totalFrames;
      }

      // Pulse: continuous sine bob from beat phase
      // phase 0 = on beat, we want peak displacement at phase 0
      const pulseSine = Math.cos(this.pulsePhase * Math.PI * 2);
      const pulseAmp = this.pulseEnergy * (1 + this.climaxIntensity * 0.5);
      const pulseOffsetY = pulseSine * cfg.pulseAmplitudeY * pulseAmp;
      const pulseOffsetX = Math.sin(this.pulsePhase * Math.PI * 2 * 0.5) * cfg.pulseAmplitudeX * pulseAmp * 0.5;
      const pulseZoom = this.lastPulseDownbeatZoom;

      // Silence pull-back (negative zoom = wide shot)
      const silenceZoom = -this.silencePullback * 0.02;

      // Raw composite
      let zoom = 1.0
        + this.breathZoom
        + pulseZoom
        + this.punchZoom * punchFrac
        + silenceZoom;

      let offsetX = this.breathDriftX
        + pulseOffsetX
        + this.punchShakeX * punchFrac;

      let offsetY = this.breathDriftY
        + pulseOffsetY
        + this.punchShakeY * punchFrac;

      let rotation = this.breathRotation
        + this.punchRotation * punchFrac;

      let shakeX = this.punchShakeX * punchFrac;
      let shakeY = this.punchShakeY * punchFrac;

      // ── Safety envelope ──
      zoom = clamp(zoom, 2 - cfg.maxZoom, cfg.maxZoom); // symmetric around 1.0
      offsetX = clamp(offsetX, -cfg.maxShakePx * 3, cfg.maxShakePx * 3);
      offsetY = clamp(offsetY, -cfg.maxShakePx * 3, cfg.maxShakePx * 3);
      rotation = clamp(rotation, -cfg.maxRotationRad, cfg.maxRotationRad);
      shakeX = clamp(shakeX, -cfg.maxShakePx, cfg.maxShakePx);
      shakeY = clamp(shakeY, -cfg.maxShakePx, cfg.maxShakePx);

      this._compositeZoom = zoom;
      this._compositeOffsetX = offsetX;
      this._compositeOffsetY = offsetY;
      this._compositeRotation = rotation;
      this._compositeShakeX = shakeX;
      this._compositeShakeY = shakeY;
    }

    // ═══ Bookkeeping ═══
    this.prevHeroActive = sf?.heroActive ?? false;
    if (beatState) this.prevBeatIndex = beatState.beatIndex;
    this._cachedTransform = null;
  }

  // ─── Transform output (for text layer — no parallax) ───────

  getSubjectTransform(): SubjectTransform {
    if (this._cachedTransform) return this._cachedTransform;

    const result: SubjectTransform = {
      zoom: this._compositeZoom,
      proximity: Math.max(0, this._compositeZoom - 1),
      offsetX: this._compositeOffsetX,
      offsetY: this._compositeOffsetY,
      rotation: this._compositeRotation,
      shakeX: this._compositeShakeX,
      shakeY: this._compositeShakeY,
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

    // Parallax depth: each layer moves a fraction of the total displacement.
    // Far layers barely move, near layers move more. Text (not passed here)
    // gets zero displacement — anchored for readability.
    const cfg = this.config;
    let depth: number;
    switch (layer) {
      case 'backdrop':
      case 'far':        depth = cfg.parallaxFar;  break;  // 0.15
      case 'atmosphere':
      case 'mid':        depth = cfg.parallaxMid;  break;  // 0.5
      case 'near':       depth = cfg.parallaxNear; break;  // 0.85
      default:           depth = 0.5;
    }

    const zoom = 1.0 + (this._compositeZoom - 1.0) * depth;
    const offsetX = this._compositeOffsetX * depth;
    const offsetY = this._compositeOffsetY * depth;
    const shakeX = this._compositeShakeX * depth;
    const shakeY = this._compositeShakeY * depth;
    const rotation = this._compositeRotation * depth;

    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;

    const hasMotion = Math.abs(zoom - 1.0) > 0.0005
      || Math.abs(offsetX) > 0.1
      || Math.abs(offsetY) > 0.1
      || Math.abs(shakeX) > 0.1
      || Math.abs(shakeY) > 0.1
      || Math.abs(rotation) > 0.0001;

    if (hasMotion) {
      // Translate to center, apply all transforms, translate back.
      // Order: translate → rotate → scale → offset+shake
      ctx.translate(cx + offsetX + shakeX, cy + offsetY + shakeY);
      if (Math.abs(rotation) > 0.0001) {
        ctx.rotate(rotation);
      }
      if (Math.abs(zoom - 1.0) > 0.0005) {
        ctx.scale(zoom, zoom);
      }
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  getProximity(): number {
    return Math.max(0, this._compositeZoom - 1);
  }

  // ─── Utility ───────────────────────────────────────────────

  reset(): void {
    this.punchState = CamState.IDLE;
    this.punchZoom = 0;
    this.punchShakeX = 0;
    this.punchShakeY = 0;
    this.punchRotation = 0;
    this.framesRemaining = 0;
    this.totalFrames = 0;
    this.lastHeroPunchMs = 0;
    this.prevBeatIndex = -1;
    this.prevHeroActive = false;
    this.breathZoom = 0;
    this.breathDriftX = 0;
    this.breathDriftY = 0;
    this.breathRotation = 0;
    this.pulsePhase = 0;
    this.pulseEnergy = 0.5;
    this.lastPulseDownbeatZoom = 0;
    this.silenceTimer = 0;
    this.silencePullback = 0;
    this.climaxIntensity = 0;
    this._compositeZoom = 1;
    this._compositeOffsetX = 0;
    this._compositeOffsetY = 0;
    this._compositeRotation = 0;
    this._compositeShakeX = 0;
    this._compositeShakeY = 0;
    this._cachedTransform = null;
  }

  /** Expose current section for debugging */
  get currentSection(): SectionRigName { return this.section; }
  /** Expose climax intensity for external systems */
  get climax(): number { return this.climaxIntensity; }
}
