/**
 * CameraRig — depth-only director's camera for lyric video rendering.
 *
 * ═══ PHILOSOPHY ═══
 * The camera has ONE job: decide how close to get to the words.
 * Words are already placed by the layout engine. No need to find them.
 * Push in = intimacy, emphasis. Pull back = context, breathing room.
 *
 * ═══ RULES ═══
 * WHAT to do  → emphasisLevel (content drives proximity)
 * WHEN to do  → beat phase (moves land on beats, not between)
 * HOW MUCH    → section energy (verse=gentle, drop=aggressive)
 * BRIEF PULSE → hit transients (punch zoom)
 * BREATHE     → BPM-synced cycle (always running)
 *
 * ═══ WHAT THIS DOES NOT DO ═══
 * No XY panning. No rotation. No sway. No shake. No parallax.
 * Just depth: zoom in, zoom out, breathe, punch.
 */

import type { BeatState } from './BeatConductor';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface CameraConfig {
  // Proximity → zoom mapping
  wideZoom: number;            // zoom at proximity 0.0 (1.0)
  mediumZoom: number;          // zoom at proximity 0.5 (1.12)
  closeUpZoom: number;         // zoom at proximity 0.7 (1.25)
  extremeCloseUpZoom: number;  // zoom at proximity 1.0 (1.45)

  // Push/pull dynamics
  pushInSpeed: number;         // how fast the camera commits (0.07)
  releaseSpeed: number;        // how slow the camera pulls back (0.02)

  // Punch zoom (beat transients)
  punchAmount: number;         // zoom bump per hit (0.03)

  // Breathing
  breathDepth: number;         // zoom oscillation depth (±0.02)

  // Hold
  holdMs: number;              // ms to hold before releasing (500)
  climaxHoldMs: number;        // ms hold for climax moments (1200)
}

/** What the camera should focus on this tick */
export interface SubjectFocus {
  x: number;                   // (unused — kept for interface compat)
  y: number;                   // (unused)
  heroActive: boolean;         // is a hero word (emph >= 3) visible?
  emphasisLevel: number;       // 0-5 of most prominent visible word
  isClimax: boolean;           // high-intensity section in latter half
  vocalActive: boolean;        // is there vocal activity?
}

/** Transform for the text layer — zoom only */
export interface SubjectTransform {
  zoom: number;                // scale factor to apply to text canvas
  proximity: number;           // raw 0-1 for external coupling (blur)
  // Zeroed — kept for interface compat
  offsetX: number;
  offsetY: number;
  rotation: number;
  shakeX: number;
  shakeY: number;
}

// Legacy compat
export interface PhraseAnchor {
  x: number;
  y: number;
  velocityX?: number;
  velocityY?: number;
}

export type SectionRigName = 'verse' | 'chorus' | 'bridge' | 'drop' | 'intro' | 'outro';

// ──────────────────────────────────────────────────────────────
// Section energy — controls how aggressively the camera moves
// ──────────────────────────────────────────────────────────────

interface SectionEnergy {
  punchMult: number;      // multiplier on punch zoom
  breathMult: number;     // multiplier on breathing depth
  pushSpeedMult: number;  // faster push-in for high-energy sections
}

const SECTION_ENERGY: Record<SectionRigName, SectionEnergy> = {
  intro:  { punchMult: 0.3, breathMult: 0.8, pushSpeedMult: 0.8 },
  verse:  { punchMult: 0.5, breathMult: 1.0, pushSpeedMult: 1.0 },
  bridge: { punchMult: 0.5, breathMult: 1.0, pushSpeedMult: 1.0 },
  chorus: { punchMult: 0.8, breathMult: 1.2, pushSpeedMult: 1.1 },
  drop:   { punchMult: 1.2, breathMult: 1.3, pushSpeedMult: 1.2 },
  outro:  { punchMult: 0.3, breathMult: 0.8, pushSpeedMult: 0.7 },
};

// ──────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CameraConfig = {
  // Zoom range — subtle. Breathing lives in the bottom, moments in the top.
  wideZoom: 1.0,
  mediumZoom: 1.06,
  closeUpZoom: 1.15,
  extremeCloseUpZoom: 1.30,

  // Smooth — no snapping
  pushInSpeed: 0.05,
  releaseSpeed: 0.018,

  // Gentle punch
  punchAmount: 0.015,

  // Breathing is the star — always gently moving
  breathDepth: 0.025,

  // Long holds so moments land
  holdMs: 1200,
  climaxHoldMs: 2000,
};

// ──────────────────────────────────────────────────────────────
// Punch zoom decay
// ──────────────────────────────────────────────────────────────

const PUNCH_DECAY_60 = 0.90;  // per-frame at 60fps

// ──────────────────────────────────────────────────────────────
// CameraRig
// ──────────────────────────────────────────────────────────────

export class CameraRig {
  // ─── Core state: just depth ───
  private proximity = 0.0;           // current smoothed proximity 0-1
  private targetProximity = 0.0;     // where we want to be
  private holdTimer = 0;             // ms remaining in hold phase

  // ─── Punch zoom (additive, decays) ───
  private punchZoom = 0;

  // ─── Breathing ───
  private breathPhase = 0;          // radians, wraps at 2π
  private bpm = 120;                // synced to song BPM

  // ─── Config + section ───
  private config: CameraConfig;
  private sectionEnergy: SectionEnergy = SECTION_ENERGY.verse;
  private activeRig: SectionRigName = 'verse';

  // ─── Edge detection ───
  private prevHitStrength = 0;
  private prevHeroActive = false;

  // ─── Canvas (kept for interface compat) ───
  private canvasW = 960;
  private canvasH = 540;

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ──────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────

  setViewport(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
  }

  setBPM(bpm: number): void {
    this.bpm = Math.max(30, Math.min(300, bpm));
  }

  setSection(section: SectionRigName): void {
    if (section === this.activeRig) return;
    this.activeRig = section;
    this.sectionEnergy = SECTION_ENERGY[section] ?? SECTION_ENERGY.verse;
  }

  /**
   * Main update — call once per tick.
   */
  update(
    deltaMs: number,
    beatState: BeatState | null,
    focus?: SubjectFocus | PhraseAnchor | null,
  ): void {
    const dt = Math.min(deltaMs, 33.33) / 16.67; // normalize to 60fps
    const cfg = this.config;
    const energy = this.sectionEnergy;

    // Detect API style
    const sf = (focus && 'heroActive' in focus) ? (focus as SubjectFocus) : null;

    // ─── 1. WHAT: Emphasis → target proximity ───
    if (sf) {
      if (!sf.vocalActive) {
        // Instrumental — settle to base
        this.targetProximity = 0.0;
        this.holdTimer = 0;
      } else if (sf.isClimax && sf.heroActive && sf.emphasisLevel >= 5) {
        // Climax + emph 5 — the BIG moment (maybe 2-3 per song)
        this.targetProximity = 1.0;
        this.holdTimer = cfg.climaxHoldMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5 && !this.prevHeroActive) {
        // Emph 5 hero — a real moment (push in)
        this.targetProximity = 0.70;
        this.holdTimer = cfg.holdMs;
      } else if (sf.heroActive && sf.emphasisLevel >= 5) {
        // Sustain emph 5
      } else {
        // Everything else (emph 0-4, normal words) — gentle breathing zone
        // Vocal active = slight warmth (0.15), silence = flat (0.0)
        if (this.holdTimer <= 0) {
          this.targetProximity = sf.vocalActive ? 0.15 : 0.0;
        }
      }
    } else if (focus) {
      if (this.holdTimer <= 0) this.targetProximity = 0.10;
    } else {
      if (this.holdTimer <= 0) this.targetProximity = 0.0;
    }

    // Tick hold timer
    if (this.holdTimer > 0) this.holdTimer = Math.max(0, this.holdTimer - deltaMs);
    this.prevHeroActive = sf?.heroActive ?? false;

    // ─── 2. Smooth proximity (asymmetric: fast push-in, slow release) ───
    const pushingIn = this.targetProximity > this.proximity;
    const speed = pushingIn
      ? cfg.pushInSpeed * energy.pushSpeedMult
      : cfg.releaseSpeed;
    const alpha = 1 - Math.pow(1 - speed, dt);
    this.proximity += (this.targetProximity - this.proximity) * alpha;
    this.proximity = Math.max(0, Math.min(1, this.proximity));

    // ─── 3. BREATHE: BPM-synced zoom oscillation ───
    // 2-bar cycle = 4 beats worth of time
    const barCycleMs = (4 * 60000) / Math.max(30, this.bpm);
    this.breathPhase += (deltaMs / barCycleMs) * Math.PI * 2;
    if (this.breathPhase > Math.PI * 2) this.breathPhase -= Math.PI * 2;

    // ─── 4. PULSE: Punch zoom on hit transients ───
    if (beatState && beatState.hitStrength > 0.1) {
      const isNewHit = beatState.hitStrength > this.prevHitStrength + 0.05;
      if (isNewHit) {
        const h = beatState.hitStrength;
        const isBass = beatState.hitType === 'bass';
        this.punchZoom += h * cfg.punchAmount * energy.punchMult * (isBass ? 1.4 : 1.0);
      }
    }
    this.prevHitStrength = beatState?.hitStrength ?? 0;

    // Decay punch
    this.punchZoom *= Math.pow(PUNCH_DECAY_60, dt);
    if (this.punchZoom < 0.0001) this.punchZoom = 0;
  }

  // ──────────────────────────────────────────────────
  // Output
  // ──────────────────────────────────────────────────

  /**
   * Subject (text) transform — pure depth.
   * Proximity drives zoom. Breathing adds life. Punch adds transient energy.
   */
  getSubjectTransform(): SubjectTransform {
    const cfg = this.config;
    const energy = this.sectionEnergy;

    // Proximity → zoom (piecewise smoothstep)
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

    // Breathing — always running, section energy scales it
    zoom += Math.sin(this.breathPhase) * cfg.breathDepth * energy.breathMult;

    // Punch — additive transient
    zoom += this.punchZoom;

    return {
      zoom,
      proximity: this.proximity,
      // Zero — no lateral motion
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      shakeX: 0,
      shakeY: 0,
    };
  }

  /**
   * Backdrop / atmosphere transform.
   * Real camera = everything zooms together. Background gets the same
   * zoom as text. This works because background drawing uses normal
   * translate/scale (not setTransform), so parent transforms survive.
   */
  applyTransform(ctx: CanvasRenderingContext2D, _layer: 'backdrop' | 'atmosphere' | 'far' | 'mid' | 'near'): void {
    ctx.save();
    // Zoom from canvas center — same as text
    const zoom = this.getSubjectTransform().zoom;
    if (Math.abs(zoom - 1.0) > 0.001) {
      // We need canvas dimensions — use last known viewport
      const cx = this.canvasW / 2;
      const cy = this.canvasH / 2;
      ctx.translate(cx, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /** Current proximity 0-1 (for blur coupling) */
  getProximity(): number {
    return this.proximity;
  }

  reset(): void {
    this.proximity = 0.0;
    this.targetProximity = 0.0;
    this.holdTimer = 0;
    this.punchZoom = 0;
    this.breathPhase = 0;
    this.prevHitStrength = 0;
    this.prevHeroActive = false;
  }
}
