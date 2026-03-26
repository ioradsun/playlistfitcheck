/* cache-bust: 2026-03-25-V10 */
/**
 * LyricDancePlayer V2 — BeatConductor-driven canvas engine.
 *
 * Architecture:
 * - BeatConductor is the SINGLE rhythmic driver. No dual-system chaos.
 * - EffectBudgeter guarantees effects complete (no mid-animation cutoffs).
 * - ACTIVE CHUNK ONLY: one phrase group on screen at a time, dead center.
 * - Single color model: one text color, contrast against background.
 * - Hero words: solo center (≥500ms) or inline emphasis scaling.
 * - One evaluateFrame() call per tick (not two).
 * - All catches log errors (no silent swallowing).
 * - All state on instance (no global singletons).
 */

import type { CinematicDirection } from "@/types/CinematicDirection";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { SceneContext } from "@/lib/sceneContexts";
import {
  compileScene,
  type CompiledScene,
  type Keyframe,
  type ScenePayload,
} from "@/lib/sceneCompiler";
import { enrichSections } from "@/engine/directionResolvers";
import { getMoodGrade, buildGradeFilter, type MoodGrade } from "@/engine/moodGrades";
// getSectionTones removed — song-level grade model
import { getEffectTier, canShowElemental, canShowHeroGlow, getParticleDensity, getGlowCap } from "@/engine/timeTiers";
import { PARTICLE_SYSTEM_MAP, ParticleEngine } from "@/engine/ParticleEngine";
import {
  normalizeToken,
} from "@/engine/cinematicResolver";
import { BeatConductor, type BeatState, type SubsystemResponse } from "@/engine/BeatConductor";
import { IntensityRouter, type MotionProfile } from '@/engine/IntensityRouter';
import { CameraRig, type SubjectFocus } from "@/engine/CameraRig";
import { FinaleEffect } from "@/engine/FinaleEffect";
import { ExitEffect } from '@/engine/ExitEffect';
import { HeroSmokeEffect } from '@/engine/HeroSmokeEffect';
import { revokeAnalyzerWorker } from "@/engine/audioAnalyzerWorker";
import { preloadImage } from "@/lib/imagePreloadCache";
import { ensureFontReady, isFontReady } from "@/lib/fontReadinessCache";
import { deserializeSectionPalette, type SectionPalette } from "@/lib/autoPalette";
import {
  resolveActiveGroup,
  computePhraseState,
  computeWordStateInto,
  detectSoloHero,
  type AnimBeatState,
  type WordAnimState,
} from '@/engine/PhraseAnimator';

const LYRIC_DANCE_PLAYER_BUILD_STAMP = '[LyricDancePlayer] build: V2-CONDUCTOR-2026-03-04-PERF';
const DEBUG_ELEMENTAL_TRACE = false;

// ═══════════════════════════════════════════════════════════════
// CINEMATIC TREATMENT SYSTEM
// ═══════════════════════════════════════════════════════════════
//
// Layer 1: Derive section effects directly from audio energy + beat density.
// Layer 2: Arc scaling (section position → intensity multiplier)
// Layer 3: Spectacle budget (runtime cooldown → downgrades)
// Layer 4: Legibility ceilings (hard caps → readability wins)

interface SectionEffectsConfig {
  particleDensity: number;
  particleSpeed: number;
  beatBarStyle: 'light' | 'smoke' | 'neon' | 'flame';
  vignetteStrength: number;
}

function computeEffectsFromEnergy(avgEnergy: number, beatDensity: number): SectionEffectsConfig {
  // Two numbers in → full config out. No mood vocabulary needed.
  const e = Math.max(0, Math.min(1, avgEnergy));
  const d = Math.max(0, Math.min(10, beatDensity));
  return {
    particleDensity: Math.max(0.5, 0.4 + e * 0.8),
    particleSpeed: 0.3 + d * 0.15 + e * 0.4,
    beatBarStyle: e > 0.7 ? 'flame' : e > 0.4 ? 'neon' : 'smoke' as const,
    vignetteStrength: 0.8 - e * 0.5,
  };
}

const DEFAULT_EFFECTS: SectionEffectsConfig = computeEffectsFromEnergy(0.3, 2);

interface EffectsTransition {
  from: SectionEffectsConfig;
  to: SectionEffectsConfig;
  startMs: number;
  durationMs: number;
}

function lerpEffectsConfig(a: SectionEffectsConfig, b: SectionEffectsConfig, t: number): SectionEffectsConfig {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    particleDensity: m(a.particleDensity, b.particleDensity),
    particleSpeed: m(a.particleSpeed, b.particleSpeed),
    beatBarStyle: t < 0.5 ? a.beatBarStyle : b.beatBarStyle,
    vignetteStrength: m(a.vignetteStrength, b.vignetteStrength),
  };
}

const LEGIBILITY = {
  maxTextBlur: 0.3,
  maxForegroundAlphaOverText: 0.12,
  cameraCapForDensity: (wordCount: number): number => wordCount > 5 ? 0.4 : wordCount > 3 ? 0.7 : 1.0,
};

// ──────────────────────────────────────────────────────────────
// Types expected by ShareableLyricDance.tsx
// ──────────────────────────────────────────────────────────────

export interface LyricDanceData {
  id: string;
  user_id: string;
  post_id?: string | null;
  artist_slug: string;
  song_slug: string;
  artist_name: string;
  song_name: string;
  audio_url: string;
  lyrics: LyricLine[];
  words?: Array<{ word: string; start: number; end: number }>;
  motion_profile_spec: PhysicsSpec;
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  palette: string[];
  system_type: string;
  artist_dna: any;
  seed: string;
  frame_state: any;
  cinematic_direction: CinematicDirection | null;
  section_images?: string[];
  auto_palettes?: string[][];
  scene_context?: SceneContext | null;
  cover_image_url?: string | null;
  top_reaction?: { emoji: string; count: number; line_text: string } | null;
  preview_ready?: boolean;
  /** Optional: constrain playback to start at this time (seconds). Used by hook battles. */
  region_start?: number;
  /** Optional: constrain playback to end at this time (seconds). Used by hook battles. */
  region_end?: number;
}

export interface LiveDebugState {
  beatIntensity: number;
  physGlow: number;

  physicsActive: boolean;
  wordCount: number;
  heat: number;
  velocity: number;
  rotation: number;
  lastBeatForce: number;

  effectKey: string;
  entryProgress: number;
  exitProgress: number;
  activeMod: string | null;

  fontScale: number;
  scale: number;
  lineColor: string;
  isHookLine: boolean;
  repIndex: number;
  repTotal: number;

  particleSystem: string;
  particleDensity: number;
  particleSpeed: number;
  particleCount: number;
  songSection: string;

  xOffset: number;
  yBase: number;
  xNudge: number;
  shake: number;

  backgroundSystem: string;
  imageLoaded: boolean;
  zoom: number;
  vignetteIntensity: number;
  songProgress: number;

  dirThesis: string;
  dirChapter: string;
  dirChapterProgress: number;
  dirIntensity: number;
  dirBgDirective: string;
  dirLightBehavior: string;

  symbolPrimary: string;
  symbolSecondary: string;
  symbolState: string;

  cameraDistance: string;
  cameraMovement: string;

  wordDirectiveWord: string;
  wordDirectiveBehavior: string;
  wordDirectiveEntry: string;
  wordDirectiveEmphasis: number;
  wordDirectiveExit: string;
  wordDirectiveGhostTrail: boolean;
  wordDirectiveGhostDir: string;

  lineHeroWord: string;
  lineEntry: string;
  lineExit: string;
  lineIntent: string;
  shotType: string;
  shotDescription: string;

  evolutionWord: string;
  evolutionCount: number;
  evolutionScale: number;
  evolutionGlow: number;
  evolutionBubbles: number;
  evolutionSinkPx: number;

  // Image diagnostics
  imgCount: number;
  imgActiveIdx: number;
  imgNextIdx: number;
  imgCrossfade: number;
  imgChapterSpan: number;
  imgLocalProgress: number;
  imgOpacity: number;
  imgOverlap: boolean;

  // Section boundaries
  secIndex: number;
  lineIndex: number;
  secTotal: number;
  secStartSec: number;
  secEndSec: number;
  secElapsed: number;
  secDuration: number;
  secProgress: number;
  secMood: string;
  secTexture: string;
  secHasImage: boolean;

  // Cinematic direction defaults
  cdSceneTone: string;
  cdAtmosphere: string;
  cdMotion: string;
  cdTypography: string;
  cdTexture: string;
  cdEmotionalArc: string;

  // Beat grid phase
  bgBpm: number;
  bgBeatsTotal: number;
  bgConfidence: number;
  bgNextBeat: number;
  bgBeatPhase: number;
  bgBeatPulse: number;

  // Active word
  activeWord: string;
  activeWordEntry: string;
  activeWordExit: string;
  activeWordEmphasis: number;
  resolvedLineStyle: string;
  resolvedWordStyle: string;
  layoutStable: boolean;

  fps: number;
  qualityTier: number;
  drawCalls: number;
  cacheHits: number;

  perfBg: number;
  perfSymbol: number;
  perfParticlesFar: number;
  perfText: number;
  perfOverlays: number;
  perfNear: number;
  perfTotal: number;

  time: number;
}

export const DEFAULT_DEBUG_STATE: LiveDebugState = {
  time: 0,
  beatIntensity: 0,
  physGlow: 0,

  physicsActive: false,
  wordCount: 0,
  heat: 0,
  velocity: 0,
  rotation: 0,
  lastBeatForce: 0,

  effectKey: "—",
  entryProgress: 0,
  exitProgress: 0,
  activeMod: null,

  fontScale: 1,
  scale: 1,
  lineColor: "#ffffff",
  isHookLine: false,
  repIndex: 0,
  repTotal: 0,

  particleSystem: "none",
  particleDensity: 0,
  particleSpeed: 0,
  particleCount: 0,
  songSection: "intro",

  xOffset: 0,
  yBase: 0.5,
  xNudge: 0,
  shake: 0,

  backgroundSystem: "—",
  imageLoaded: false,
  zoom: 1,
  vignetteIntensity: 0,
  songProgress: 0,

  dirThesis: "—",
  dirChapter: "—",
  dirChapterProgress: 0,
  dirIntensity: 0,
  dirBgDirective: "—",
  dirLightBehavior: "—",

  symbolPrimary: "—",
  symbolSecondary: "—",
  symbolState: "—",

  cameraDistance: "Wide",
  cameraMovement: "—",

  wordDirectiveWord: "",
  wordDirectiveBehavior: "—",
  wordDirectiveEntry: "—",
  wordDirectiveEmphasis: 0,
  wordDirectiveExit: "—",
  wordDirectiveGhostTrail: false,
  wordDirectiveGhostDir: "—",

  lineHeroWord: "",
  lineEntry: "fades",
  lineExit: "fades",
  lineIntent: "—",
  shotType: "FloatingInWorld",
  shotDescription: "—",

  evolutionWord: "—",
  evolutionCount: 0,
  evolutionScale: 1,
  evolutionGlow: 0,
  evolutionBubbles: 0,
  evolutionSinkPx: 0,

  imgCount: 0,
  imgActiveIdx: -1,
  imgNextIdx: -1,
  imgCrossfade: 0,
  imgChapterSpan: 0,
  imgLocalProgress: 0,
  imgOpacity: 0,
  imgOverlap: false,

  secIndex: -1,
  lineIndex: -1,
  secTotal: 0,
  secStartSec: 0,
  secEndSec: 0,
  secElapsed: 0,
  secDuration: 0,
  secProgress: 0,
  secMood: "—",
  secTexture: "—",
  secHasImage: false,

  cdSceneTone: "—",
  cdAtmosphere: "—",
  cdMotion: "—",
  cdTypography: "—",
  cdTexture: "—",
  cdEmotionalArc: "—",

  bgBpm: 0,
  bgBeatsTotal: 0,
  bgConfidence: 0,
  bgNextBeat: 0,
  bgBeatPhase: 0,
  bgBeatPulse: 0,

  activeWord: "—",
  activeWordEntry: "—",
  activeWordExit: "—",
  activeWordEmphasis: 0,
  resolvedLineStyle: "—",
  resolvedWordStyle: "—",
  layoutStable: true,

  fps: 60,
  qualityTier: 0,
  drawCalls: 0,
  cacheHits: 0,

  perfBg: 0,
  perfSymbol: 0,
  perfParticlesFar: 0,
  perfText: 0,
  perfOverlays: 0,
  perfNear: 0,
  perfTotal: 0,
};

// ──────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────

type ChunkState = {
  id: string;
  text: string;
  font: string;
  color: string;
  width: number;
};

type ResolvedPlayerState = {
  chapters: any[];
  wordDirectivesMap: Record<string, any>;
  particleConfig: { texture: string; system: string; density: number; speed: number };
};

type ScaledKeyframe = Omit<Keyframe, "chunks" | "cameraX" | "cameraY"> & {
  cameraX: number;
  cameraY: number;
  chunks: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    alpha: number;
    glow: number;
    scale: number;
    scaleX?: number;
    scaleY?: number;
    skewX?: number;
    blur?: number;
    rotation?: number;
    frozen?: boolean;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    isAnchor?: boolean;
    color?: string;
    emphasisLevel?: number;
    entryProgress?: number;
    exitProgress?: number;
    letterIndex?: number;
    letterTotal?: number;
    letterDelay?: number;
    isLetterChunk?: boolean;
    isSoloHero?: boolean;
    isHeroWord?: boolean;
    wordDuration?: number;
    visible: boolean;
  }>;
};

interface ChunkBounds {
  chunk: ScaledKeyframe['chunks'][number];
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  priority: number;
  fontSize: number;
  minFont: number;
  text: string;
  family: string;
  weight: number;
  baseTextWidth: number;
  scaleX: number;
  scaleY: number;
}

function lerpColor(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const parse = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return [10, 10, 15];
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * clamp);
  const g = Math.round(ag + (bg - ag) * clamp);
  const bl = Math.round(ab + (bb - ab) * clamp);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

const BAKER_VERSION = 10;

const SIM_W = 96;
const SIM_H = 54;
const SPLIT_EXIT_STYLES = new Set(['scatter-letters', 'peel-off', 'peel-reverse', 'cascade-down', 'cascade-up']);

// ═══ BeatVisSim: In-place beat-reactive visualizer ═══
// Bar HEIGHT bounces with beat energy. Bar APPEARANCE varies by mood:
//   flame  — orange/red tips, warm glow, flicker
//   neon   — bright core, soft bloom falloff
//   smoke  — soft feathered edges, wispy tops
//   light  — clean bright minimal pillars
// AI cinematic direction picks style per section based on mood/atmosphere.
type BarVisStyle = 'flame' | 'neon' | 'smoke' | 'light';
const VIS_W = 320;
const VIS_H = 64;

class BeatVisSim {
  private visCanvas: HTMLCanvasElement;
  private visCtx: CanvasRenderingContext2D;
  private bars: Float32Array;
  private barSeeds: Float32Array;
  private palette: [number, number, number];
  private lastBeatIndex = -1;

  constructor(accent: string) {
    this.visCanvas = document.createElement('canvas');
    this.visCanvas.width = VIS_W;
    this.visCanvas.height = VIS_H;
    this.visCtx = this.visCanvas.getContext('2d')!;
    this.bars = new Float32Array(VIS_W);
    this.barSeeds = new Float32Array(VIS_W);
    for (let i = 0; i < VIS_W; i++) {
      this.barSeeds[i] = (Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
      if (this.barSeeds[i] < 0) this.barSeeds[i] += 1;
    }
    this.palette = this.hexToRgb(accent);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  setAccent(hex: string): void { this.palette = this.hexToRgb(hex); }
  setStyle(_s: BarVisStyle): void { /* styles removed — single clean look */ }

  update(energy: number, pulse: number, hitStrength: number, _beatPhase: number, beatIndex: number): void {
    const W = VIS_W;
    const H = VIS_H;
    const ctx = this.visCtx;

    ctx.clearRect(0, 0, W, H);

    const isNewBeat = beatIndex !== this.lastBeatIndex;
    this.lastBeatIndex = beatIndex;

    const [pr, pg, pb] = this.palette;
    const drive = energy * 0.55 + (pulse * energy) * 0.35 + hitStrength * 0.10;

    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const centerBias = 0.5 + 0.5 * (1.0 - Math.abs(nx - 0.5) * 2.0);
      const variation = 0.7 + this.barSeeds[x] * 0.6;
      const target = drive * centerBias * variation;
      this.bars[x] += ((target > this.bars[x]) ? 0.75 : 0.12) * (target - this.bars[x]);
    }

    for (let x = 0; x < W; x++) {
      const barH = Math.floor(this.bars[x] * H * 0.92);
      if (barH < 1) continue;

      const t = 0.6;
      const r = Math.min(255, Math.floor(pr * (0.4 + t * 0.6)));
      const g = Math.min(255, Math.floor(pg * (0.3 + t * 0.4)));
      const b = Math.floor(pb * (0.2 + t * 0.15));
      const a = 0.60 + t * 0.35;

      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
      ctx.fillRect(x, H - barH, 1, barH);
    }

    if (isNewBeat && hitStrength > 0.3) {
      const flashAlpha = Math.min(0.8, hitStrength * 0.6);
      ctx.fillStyle = `rgba(${Math.min(255, pr + 80)},${Math.min(255, Math.floor(pg * 0.7 + 60))},${Math.floor(pb * 0.3)},${flashAlpha.toFixed(2)})`;
      ctx.fillRect(0, H - 3, W, 3);
    }
  }

  get canvas(): HTMLCanvasElement { return this.visCanvas; }
}

// ═══ DynamiteWickBar: fuse-cord waveform progress + beat visualizer ═══
// Admin flag: window.__LYRIC_DANCE_LIGHTNING_BAR
// Unplayed = warm rope-textured fuse cord (ridgeline from beatEnergies).
// Playhead = crackling flame that breathes with energy.
// Played = charred ember trail glowing orange→red→ash.
// Sparks shoot on energy, smoke wisps rise from burn point.

const DWB_W = 640;
const DWB_H = 96;

interface DWBSpark {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  size: number;
  bright: number; // 0-1 — brighter sparks are whiter, dimmer are orange
}

interface DWBSmoke {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  size: number;
  trail: Array<{ x: number; y: number }>;
}

class DynamiteWickBar {
  private dwbCanvas: HTMLCanvasElement;
  private dwbCtx: CanvasRenderingContext2D;
  private accent: [number, number, number] = [255, 160, 20];
  private sparks: DWBSpark[] = [];
  private smokes: DWBSmoke[] = [];
  private frame = 0;
  private lastBeatIndex = -1;
  // Physics: per-pixel velocity for ember glow pulsing
  private emberHeat: Float32Array;
  // Waveform
  private waveform: Float32Array;
  private waveformSmooth: Float32Array;
  // Flame flicker state
  private flamePhase = 0;

  constructor(accentHex: string) {
    this.dwbCanvas = document.createElement('canvas');
    this.dwbCanvas.width = DWB_W;
    this.dwbCanvas.height = DWB_H;
    this.dwbCtx = this.dwbCanvas.getContext('2d')!;
    this.emberHeat = new Float32Array(DWB_W).fill(0);
    this.waveform = new Float32Array(DWB_W).fill(0.15);
    this.waveformSmooth = new Float32Array(DWB_W).fill(0.15);
    this.setAccent(accentHex);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  setAccent(hex: string): void { this.accent = this.hexToRgb(hex); }

  /** Call once after beat analysis. Resamples beatEnergies to DWB_W and smooths. */
  setWaveformPreview(beatEnergies: number[]): void {
    const out = new Float32Array(DWB_W);
    if (beatEnergies.length === 0) {
      out.fill(0.15);
      this.waveform = out;
      this.waveformSmooth = new Float32Array(out);
      return;
    }
    for (let x = 0; x < DWB_W; x++) {
      const srcIdx = (x / DWB_W) * beatEnergies.length;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, beatEnergies.length - 1);
      const frac = srcIdx - lo;
      out[x] = Math.max(0.08, beatEnergies[lo] * (1 - frac) + beatEnergies[hi] * frac);
    }
    this.waveform = out;
    const smooth = new Float32Array(DWB_W);
    const R = 3;
    for (let x = 0; x < DWB_W; x++) {
      let sum = 0, count = 0;
      for (let k = -R; k <= R; k++) {
        const idx = x + k;
        if (idx >= 0 && idx < DWB_W) { sum += out[idx]; count++; }
      }
      smooth[x] = sum / count;
    }
    this.waveformSmooth = smooth;
  }

  update(
    energy: number,
    pulse: number,
    hitStrength: number,
    beatPhase: number,
    beatIndex: number,
    progress: number = 0,
    hitType: 'transient' | 'bass' | 'tonal' | 'none' = 'none',
    brightness: number = 0.5,
    isDownbeat: boolean = false,
  ): void {
    const ctx = this.dwbCtx;
    const W = DWB_W;
    const H = DWB_H;
    const baseY = H * 0.85;
    const maxPeakH = H * 0.72;
    const px = Math.max(0, Math.min(W - 1, Math.floor(progress * W)));

    this.frame++;
    const f = this.frame;
    this.flamePhase += 0.2 + energy * 0.3;
    const isNewBeat = beatIndex !== this.lastBeatIndex;
    this.lastBeatIndex = beatIndex;
    const wf = this.waveformSmooth;
    const accentBoost = 0.75 + brightness * 0.35 + beatPhase * 0.1;

    // ── Clear to transparent; smoke trails are redrawn from trail history each frame ──
    ctx.clearRect(0, 0, W, H);

    // ── Ember heat: inject at playhead, decay behind ──
    const heat = this.emberHeat;
    // Beat injects heat near playhead
    if (pulse > 0.3) {
      for (let i = Math.max(0, px - 20); i <= px; i++) {
        heat[i] = Math.min(1, heat[i] + (pulse * energy) * 0.15);
      }
    }
    // Decay
    for (let i = 0; i < W; i++) {
      heat[i] *= 0.975;
      // Distance-based base heat near playhead
      const dist = Math.abs(i - px);
      if (i <= px && dist < 80) {
        heat[i] = Math.max(heat[i], Math.max(0, 1 - dist / 80) * 0.5);
      }
    }
    // Bass hit: pulse heat through entire ember trail
    if (hitType === 'bass' && hitStrength > 0.3) {
      for (let i = 0; i <= px; i++) {
        heat[i] = Math.min(1, heat[i] + hitStrength * 0.25 * (1 - (px - i) / Math.max(1, px)));
      }
    }

    const getPeakH = (x: number): number => {
      return Math.min(maxPeakH, (wf[x] || 0.08) * maxPeakH);
    };

    // ════════════════════════════════════════════════════
    // FUSE CORD (unplayed) — warm rope texture
    // ════════════════════════════════════════════════════
    {
      // Filled shape — warm dark brown
      ctx.beginPath();
      ctx.moveTo(Math.max(px, 0), baseY);
      for (let x = Math.max(px, 0); x < W; x++) {
        ctx.lineTo(x, baseY - getPeakH(x));
      }
      ctx.lineTo(W, baseY);
      ctx.closePath();
      // Warm brown gradient
      const fuseGrad = ctx.createLinearGradient(0, baseY - maxPeakH, 0, baseY);
      fuseGrad.addColorStop(0, 'rgba(160,110,60,0.35)');
      fuseGrad.addColorStop(0.5, 'rgba(130,85,45,0.25)');
      fuseGrad.addColorStop(1, 'rgba(90,60,30,0.15)');
      ctx.fillStyle = fuseGrad;
      ctx.fill();

      // Rope texture: top edge with slight roughness
      ctx.beginPath();
      for (let x = Math.max(px + 2, 0); x < W; x++) {
        const peakH = getPeakH(x);
        // Tiny jitter for rope texture feel
        const jitter = Math.sin(x * 2.3 + 17.1) * 0.8 + Math.sin(x * 5.7 + 3.2) * 0.4;
        const y = baseY - peakH + jitter;
        x === Math.max(px + 2, 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(180,130,70,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner braid lines for rope feel
      ctx.beginPath();
      for (let x = Math.max(px + 2, 0); x < W; x++) {
        const peakH = getPeakH(x);
        const braidY = baseY - peakH * 0.5 + Math.sin(x * 0.3) * peakH * 0.15;
        x === Math.max(px + 2, 0) ? ctx.moveTo(x, braidY) : ctx.lineTo(x, braidY);
      }
      ctx.strokeStyle = 'rgba(140,100,55,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ════════════════════════════════════════════════════
    // EMBER TRAIL (played) — charred wick, glowing embers
    // ════════════════════════════════════════════════════
    if (px > 0) {
      // Base charred shape — dark
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= px; x++) {
        ctx.lineTo(x, baseY - getPeakH(x));
      }
      ctx.lineTo(px, baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,15,10,0.6)';
      ctx.fill();

      // Ember glow overlay — per-column based on heat
      for (let x = 0; x <= px; x++) {
        const h = heat[x] || 0;
        if (h < 0.02) continue;
        const peakH = getPeakH(x);
        if (peakH < 1) continue;

        // Color: hot = bright orange/yellow, cooling = deep red, cold = dark
        const temp = h;
        const [ar, ag, ab] = this.accent;
        const r = Math.min(255, Math.floor((255 * Math.min(1, temp * 2)) * 0.7 + ar * 0.3));
        const g = Math.min(255, Math.floor((80 + 140 * Math.max(0, temp - 0.3)) * 0.65 + ag * 0.35 * accentBoost));
        const b = Math.min(255, Math.floor((20 * Math.max(0, temp - 0.6)) * 0.4 + ab * 0.18));
        const a = h * 0.7;

        // Glow column
        const glowGrad = ctx.createLinearGradient(x, baseY - peakH, x, baseY);
        glowGrad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.9})`);
        glowGrad.addColorStop(0.6, `rgba(${r},${Math.floor(g * 0.6)},${b},${a * 0.5})`);
        glowGrad.addColorStop(1, `rgba(${Math.floor(r * 0.4)},${Math.floor(g * 0.2)},0,${a * 0.2})`);
        ctx.fillStyle = glowGrad;
        ctx.fillRect(x, baseY - peakH, 1.5, peakH);
      }

      // Top edge: glowing ember line
      ctx.beginPath();
      for (let x = 0; x <= px; x++) {
        const y = baseY - getPeakH(x);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const edgeR = Math.min(255, Math.floor(this.accent[0] * 0.4 + 180 + energy * 55));
      const edgeG = Math.min(255, Math.floor(this.accent[1] * 0.35 + 60 + energy * 70));
      const edgeB = Math.min(80, Math.floor(this.accent[2] * 0.2));
      ctx.strokeStyle = `rgba(${edgeR},${edgeG},${edgeB},${0.3 + energy * 0.3})`;
      ctx.lineWidth = 1;
      ctx.shadowColor = `rgba(${Math.min(255, edgeR + 20)},${Math.min(255, edgeG + 10)},${edgeB},${0.3 + energy * 0.3})`;
      ctx.shadowBlur = 3 + energy * 5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Beat pulse: flash embers brighter on beat
      if (isNewBeat && pulse > 0.4) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, px - 60), baseY);
        for (let x = Math.max(0, px - 60); x <= px; x++) {
          ctx.lineTo(x, baseY - getPeakH(x));
        }
        ctx.lineTo(px, baseY);
        ctx.closePath();
        ctx.fillStyle = `rgba(${Math.min(255, this.accent[0] + 40)},${Math.min(255, this.accent[1] + 20)},20,${(pulse * energy) * 0.12})`;
        ctx.fill();
      }
    }

    // ════════════════════════════════════════════════════
    // BURN POINT (playhead) — crackling flame
    // ════════════════════════════════════════════════════
    {
      const peakH = getPeakH(px);
      const flameBase = baseY - peakH;
      const flameH = 8 + energy * 18 + (pulse * energy) * 8;
      const flicker1 = Math.sin(this.flamePhase * 1.7) * 0.3;
      const flicker2 = Math.sin(this.flamePhase * 2.9 + 1.3) * 0.2;
      const flicker3 = Math.sin(this.flamePhase * 4.3 + 2.7) * 0.15;
      const [ar, ag, ab] = this.accent;

      // Outer flame glow (large soft)
      const outerGlow = ctx.createRadialGradient(
        px, flameBase - flameH * 0.3, 0,
        px, flameBase - flameH * 0.3, flameH * 1.5 + 10,
      );
      outerGlow.addColorStop(0, `rgba(${Math.min(255, ar + 80)},${Math.max(70, ag)},${Math.max(10, Math.floor(ab * 0.35))},${0.25 + energy * 0.15})`);
      outerGlow.addColorStop(0.5, `rgba(${Math.min(255, ar + 40)},${Math.floor(Math.max(60, ag * 0.5))},0,${0.1 + energy * 0.05})`);
      outerGlow.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = outerGlow;
      ctx.fillRect(px - flameH * 2, flameBase - flameH * 2, flameH * 4, flameH * 2.5);

      // Flame tongues (3 overlapping bezier shapes)
      for (let tongue = 0; tongue < 3; tongue++) {
        const xOff = (tongue - 1) * (3 + energy * 3) + flicker1 * 4;
        const hMult = tongue === 1 ? 1.0 : 0.65 + flicker2 * 0.2;
        const tongueH = flameH * hMult;
        const tongueW = 4 + energy * 4 + flicker3 * 2;

        ctx.beginPath();
        ctx.moveTo(px + xOff - tongueW / 2, flameBase);
        ctx.quadraticCurveTo(
          px + xOff - tongueW * 0.3 + flicker2 * 3,
          flameBase - tongueH * 0.6,
          px + xOff + flicker1 * 2,
          flameBase - tongueH,
        );
        ctx.quadraticCurveTo(
          px + xOff + tongueW * 0.3 - flicker3 * 3,
          flameBase - tongueH * 0.5,
          px + xOff + tongueW / 2,
          flameBase,
        );
        ctx.closePath();

        const flameGrad = ctx.createLinearGradient(
          px + xOff, flameBase,
          px + xOff, flameBase - tongueH,
        );
        if (tongue === 1) {
          flameGrad.addColorStop(0, 'rgba(255,220,150,0.9)');
          flameGrad.addColorStop(0.2, `rgba(${Math.min(255, ar + 40)},${Math.min(255, ag + 30)},50,0.85)`);
          flameGrad.addColorStop(0.5, `rgba(${Math.min(255, ar + 20)},${Math.max(90, ag)},20,0.7)`);
          flameGrad.addColorStop(0.8, 'rgba(255,60,10,0.5)');
          flameGrad.addColorStop(1, 'rgba(200,30,0,0.1)');
        } else {
          flameGrad.addColorStop(0, `rgba(${Math.min(255, ar + 10)},${Math.max(120, ag * 0.9)},40,0.7)`);
          flameGrad.addColorStop(0.4, `rgba(${Math.min(255, ar + 20)},80,10,0.5)`);
          flameGrad.addColorStop(1, 'rgba(180,20,0,0.05)');
        }
        ctx.fillStyle = flameGrad;
        ctx.fill();
      }

      const coreGlow = ctx.createRadialGradient(px, flameBase, 0, px, flameBase, 5 + energy * 3);
      coreGlow.addColorStop(0, `rgba(255,255,230,${0.7 + (pulse * energy) * 0.3})`);
      coreGlow.addColorStop(0.5, `rgba(${Math.min(255, ar + 40)},${Math.min(255, ag + 20)},100,0.3)`);
      coreGlow.addColorStop(1, `rgba(${Math.min(255, ar)},${Math.max(90, ag * 0.7)},20,0)`);
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(px, flameBase, 6 + energy * 4, 0, Math.PI * 2);
      ctx.fill();

      if (hitStrength > 0.4) {
        const flareR = 15 + hitStrength * 25;
        const flareGrad = ctx.createRadialGradient(px, flameBase - flameH * 0.3, 0, px, flameBase - flameH * 0.3, flareR);
        flareGrad.addColorStop(0, `rgba(255,255,200,${hitStrength * 0.5})`);
        flareGrad.addColorStop(0.4, `rgba(${Math.min(255, ar + 50)},${Math.min(255, ag + 10)},30,${hitStrength * 0.3})`);
        flareGrad.addColorStop(1, 'rgba(255,50,0,0)');
        ctx.fillStyle = flareGrad;
        ctx.fillRect(px - flareR, flameBase - flameH - flareR, flareR * 2, flareR * 2);
      }
    }

    if (energy > 0.35 && f % 2 === 0) {
      const numSparks = Math.floor(energy * 3) + (isNewBeat && isDownbeat ? 4 : 0)
        + (hitStrength > 0.5 ? Math.floor(hitStrength * 6) : 0);
      const spawnY = baseY - getPeakH(px);
      for (let s = 0; s < numSparks; s++) {
        this.sparks.push({
          x: px + (Math.random() - 0.5) * 6,
          y: spawnY - Math.random() * 8,
          vx: (Math.random() - 0.5) * (3 + energy * 4),
          vy: -(2 + Math.random() * (4 + hitStrength * 8)),
          life: 1,
          size: 0.5 + Math.random() * 2,
          bright: 0.3 + Math.random() * 0.7,
        });
      }
    }

    this.sparks = this.sparks.filter(s => s.life > 0.02);
    for (const s of this.sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.18;
      s.vx *= 0.98;
      s.life -= 0.025;

      const temp = s.life * s.bright;
      const sr = 255;
      const sg = Math.min(255, Math.floor(100 + 155 * temp));
      const sb = Math.min(255, Math.floor(30 * temp));
      const sa = s.life * 0.8;

      ctx.beginPath();
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${sa})`;
      ctx.arc(s.x, s.y, Math.max(0.1, s.size * s.life), 0, Math.PI * 2);
      ctx.fill();

      if (s.bright > 0.6 && s.life > 0.3) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
        ctx.strokeStyle = `rgba(255,${sg},0,${s.life * 0.3})`;
        ctx.lineWidth = Math.max(0.1, s.size * s.life * 0.5);
        ctx.stroke();
      }
    }

    if (f % 4 === 0 && energy > 0.2) {
      const numSmoke = 1 + (hitStrength > 0.3 ? 1 : 0);
      const spawnY = baseY - getPeakH(px) - 10 - energy * 10;
      for (let s = 0; s < numSmoke; s++) {
        this.smokes.push({
          x: px + (Math.random() - 0.5) * 8,
          y: spawnY,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(0.5 + Math.random() * 1.2),
          life: 1,
          size: 2 + Math.random() * 3,
          trail: [{ x: px + (Math.random() - 0.5) * 4, y: spawnY }],
        });
      }
    }

    this.smokes = this.smokes.filter(s => s.life > 0.03);
    for (const s of this.smokes) {
      s.x += s.vx;
      s.y += s.vy;
      s.vx += (Math.random() - 0.5) * 0.15;
      s.vy *= 0.99;
      s.life -= 0.015;
      s.size += 0.08;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 12) s.trail.shift();

      for (let i = 0; i < s.trail.length; i++) {
        const t = s.trail[i];
        const age = i / s.trail.length;
        const alpha = s.life * (0.06 + age * 0.06);
        const sz = s.size * (0.4 + age * 0.6);
        ctx.beginPath();
        ctx.fillStyle = `rgba(120,110,100,${alpha})`;
        ctx.arc(t.x, t.y, Math.max(0.1, sz), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.sparks.length > 80) this.sparks = this.sparks.slice(-80);
    if (this.smokes.length > 15) this.smokes = this.smokes.slice(-15);
  }

  get canvas(): HTMLCanvasElement { return this.dwbCanvas; }
}

interface CommentChunk {
  id: string;
  text: string;
  color: string;
  startTime: number;
  duration: number;
  startX: number;
  y: number;
  endX: number;
  direction: 1 | -1;  // 1 = left-to-right, -1 = right-to-left
  trailLength: number;
  fontSize: number;
  // Cached gradient — re-used while comet position hasn't changed > 2px
  _cachedTrailGrad?: { grad: CanvasGradient; x1: number; x2: number; alphaHex: string };
}

interface EmojiRiser {
  emoji: string;
  spawnTime: number;
  lifetime: number;
  spawnX: number;
  spawnY: number;
  size: number;
  driftAmplitude: number;
  driftPhase: number;
  opacity: number;
}



// ──────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────

export class LyricDancePlayer {
  static RESOLUTIONS = {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
  };

  private static readonly EMOJI_MAP: Record<string, string> = {
    fire: "🔥",
    dead: "💀",
    mind_blown: "🤯",
    emotional: "😭",
    respect: "🙏",
    accurate: "🎯",
  };

  // DOM (React passes these in; engine owns them after construction)
  private bgCanvas: HTMLCanvasElement;
  private textCanvas: HTMLCanvasElement;
  private container: HTMLDivElement;

  // Canvas core
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = window.devicePixelRatio || 1;
  private _exportSavedDpr = 1;
  private _exportSavedVerticalBias = 0;
  /** Effective DPR used for canvas backing store — capped at 1.5 when tier ≥ 2 to halve pixel fill */
  private get _effectiveDpr(): number {
    return this._qualityTier >= 2 ? Math.min(1.5, this.dpr) : this.dpr;
  }
  private width = 0; // logical px
  private height = 0; // logical px
  private mediaRecorder: MediaRecorder | null = null;
  private isExporting = false;
  private displayWidth = 0;
  private displayHeight = 0;
  private wasLoopingBeforeExport = true;
  public onExportComplete: (() => void) | null = null;

  // Audio (React reads this)
  public audio: HTMLAudioElement;

  /** Theme override: 'auto' uses mood grade, 'light'/'dark' forces the look */
  public themeOverride: 'auto' | 'light' | 'dark' = 'auto';

  // Public debug surface (React reads this)
  public debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };
  public resolvedState: ResolvedPlayerState = {
    chapters: [],
    wordDirectivesMap: {},
    particleConfig: { texture: 'dust', system: 'dust', density: 0.8, speed: 0.5 },
  };
  

  // Public writeable surface (React pushes comments here)
  public constellationNodes: any[] = [];

  // Data
  private data: LyricDanceData;

  /** Read-only accessor — used by auto-save to retrieve reconciled words after updateTranscript */
  get currentData(): LyricDanceData { return this.data; }
  private payload: ScenePayload | null = null;

  // Runtime chunks
  private chunks: Map<string, ChunkState> = new Map();
  private _lastFont = '';
  private _sortBuffer: ScaledKeyframe['chunks'] = [];
  private _textMetricsCache = new Map<string, { width: number; ascent: number; descent: number }>();

  // ═══ Compiled Scene (replaces timeline) ═══
  private compiledScene: CompiledScene | null = null;
  private _debugModeLogged = false;

  // ═══ BeatConductor — single rhythmic driver ═══
  private conductor: BeatConductor | null = null;
  private cameraRig: CameraRig = new CameraRig();
  private _lastBeatState: BeatState | null = null;
  private _lastSubsystemResponse: SubsystemResponse | null = null;
  private _activeGroupCursor = 0;
  private _activeGroupCursorTime = -1;

  // ═══ Instance-level bake cache (no globals) ═══
  private _bakeLock = false;
  private _bakePromise: Promise<void> | null = null;
  private _bakedScene: CompiledScene | null = null;
  private _bakedChunkCache: Map<string, ChunkState> | null = null;
  private _bakedVersion = 0;
  private _bakedHasCinematicDirection = false;
  /** Incremented by updateTranscript() to cancel any in-flight bake closure */
  private _bakeGeneration = 0;

  // Runtime evaluator state
  private _evalChunkPool: Array<ScaledKeyframe['chunks'][number]> = [];
  private _activeGroupIndices: number[] = [];
  /** Reusable buffer for per-word animation states — avoids per-frame allocation */
  private _wordAnimBuffer: WordAnimState[] = [];

  // ML layout cache removed — fitTextToViewport handles all layout at compile time

  // ═══ Watermark cache — invalidated on resize ═══
  private _watermarkCache: { font: string; w: number; h: number; x: number; y: number } | null = null;

  // Beat-reactive state (evaluated incrementally)
  private _beatCursor = 0;
  private _lastBeatIndex = -1;
  private _smoothedTime = 0;
  private _frameDt = 1.0;          // normalized dt (1.0 = 60fps), set by tick()
  private _lastRawTime = 0;
  private _timeInitialized = false;
  private _intensityRouter = new IntensityRouter();
  private _motionProfile: MotionProfile | null = null;
  private _textSyncFraction = 0;

  // Viewport scale (replaces timelineScale for runtime use)
  private _viewportSx = 1;
  private _viewportSy = 1;
  private _viewportFontScale = 1;
  private _compiledViewportW = 960;
  private _compiledViewportH = 540;
  private _compiledWasPortrait = false;
  private _evalFrame: ScaledKeyframe | null = null;
  private _evalChunks: ScaledKeyframe['chunks'] | null = null;

  // Background cache
  private bgCaches: HTMLCanvasElement[] = [];
  private bgCacheCount = 0;
  public chapterParticleSystems: (string | null)[] = [];

  private backgroundSystem = 'default';
  private chapterSims: Array<{ beatVis?: BeatVisSim }> = [];
  private _globalBeatVis: BeatVisSim | null = null; // always-on beat visualizer
  private _barVisStyles: BarVisStyle[] = []; // per-chapter bar style from AI mood
  private lastSimFrame = -1;
  private _beatVisCanvas: HTMLCanvasElement | null = null; // separate from themed sims
  // ═══ Dynamite Wick Bar (feature flag: window.__LYRIC_DANCE_LIGHTNING_BAR) ═══
  private _globalWickBar: DynamiteWickBar | null = null;
  private _wickSeekOverlay: HTMLDivElement | null = null;
  public wickBarEnabled = false;
  private chapterImages: HTMLImageElement[] = [];
  // Pre-blurred images removed — background renders sharp
  // Ken Burns per-chapter parameters — computed once on image load
  private _kenBurnsParams: Array<{
    zoomStart: number;
    zoomEnd: number;
    panStartX: number;
    panStartY: number;
    panEndX: number;
    panEndY: number;
  }> = [];
  /** Song-level grade: computed once, used for entire song — no per-section chaos */
  private _songGrade: MoodGrade | null = null;
  private _grainCanvas: HTMLCanvasElement | null = null;
  private _grainPool: ImageData[] = [];      // pre-generated noise frames
  private _grainPoolW = 0;
  private _grainPoolH = 0;
  private _grainFrameIdx = 0;               // rotates through pool
  private _lightingOverlayCanvas: HTMLCanvasElement | null = null;
  private _lightingOverlayKey = '';
  private _textBandBrightness = 0.3; // sampled brightness of center band where text renders
  private _lastBandSampleMs = 0;     // throttle: sample every 300ms
  // ═══ Frozen background snapshot — redrawn only on section change, not every frame ═══
  // Text animation draws on top of this, cutting bg+filter cost to near-zero per frame.
  private _bgSnapshot: HTMLCanvasElement | null = null;
  private _bgSnapshotSection = -999; // section index when snapshot was last baked
  private _bgSnapshotQTier = -1;     // quality tier when snapshot was last baked
  private _bgLastBakeMs = 0;         // timestamp of last snapshot bake
  private _bgRebakeIntervalMs = 500; // rebake background every 500ms
  /** Beat-synced zoom pulse — the background breathes with the beat */
  private _bgPulseZoom = 1.0;
  private _bgZoomPivotX = 0; // offset from center, in pixels
  private _bgZoomPivotY = 0;
  /** Beat nod: uniform Y shift for all text, synced with background pulse */
  private _textBeatNodX = 0;
  private _textBeatNodY = 0;
  private _finaleEffect = new FinaleEffect();
  private _exitEffect = new ExitEffect();
  private _heroSmoke = new HeroSmokeEffect();
  /** Index of the group we last triggered an exit for — prevents re-triggering */
  private _exitTriggeredForGroup = -1;
  // ═══ Breathing vignette — Fincher/Cronenweth eye funnel ═══
  private _vignetteCanvas: HTMLCanvasElement | null = null;
  private _vignetteKey = '';        // tracks canvas size for invalidation
  private _vignetteEnergy = 0.5;    // smoothed energy for vignette breathing
  private _bgBeatBrightnessBoost = 0;
  private _vignetteBeatPulse = 0;
  // ═══ Per-frame caches — computed once in tick(), reused everywhere ═══
  private _frameSectionIdx = -1;
  private _framePalette: string[] | null = null;
  private _framePaletteTime = -1; // audio time when palette was last resolved
  private _smokePhraseAge = 999;
  private _currentSectionPalette: SectionPalette = deserializeSectionPalette([
    '#0a0a0f',
    '#C9A96E',
    '#ffffff',
    '#C9A96E',
    '#9A7A4E',
  ]);

  // Reusable 1×1 canvas for text measurement (avoids per-recompile DOM allocation)
  private readonly _measureCanvas = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c; })();
  private readonly _measureCtx = this._measureCanvas.getContext('2d')!;

  // ═══ PERF: pre-allocated transform matrix buffer — eliminates per-chunk array allocation
  // computeTransformMatrix() writes into this buffer instead of returning a new array.
  // At 60fps with 4-8 visible chunks this saves ~300-500 GC objects/sec → no GC jitter.
  private readonly _tmBuf: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

  // ═══ PERF: shadow state tracking — skip redundant GPU state writes
  private _lastShadowBlur = 0;
  private _lastShadowColor = '';

  // ═══ PERF: sort-skip when visible set is unchanged
  private _lastSortHash = 0;

  /** Pixel offset to shift text UP — compensates for bottom overlay (playbar, battle bar) */
  private _textVerticalBias = 0;

  // Comment comets
  private activeComments: CommentChunk[] = [];
  private commentColors = ['#FFD700', '#00FF87', '#FF6B6B', '#88CCFF', '#FF88FF'];
  private commentColorIdx = 0;
  private emojiRisers: EmojiRiser[] = [];
  private emojiReactionData: Record<string, { line: Record<number, number>; total: number }> = {};
  private emojiStreamEnabled = false;
  private _lastEmojiLineIndex = -1;
  private _emojiSpawnQueue: Array<{ emoji: string; spawnAtSec: number }> = [];

  // Playback
  private rafHandle = 0;
  private lastTimestamp = 0;
  private currentTimeMs = 0;
  private songStartSec = 0;
  private songEndSec = 0;
  private playing = false;
  private destroyed = false;
  private audioContext: AudioContext | null = null;
  private phraseGroups: Array<{ words: Array<{ word: string; start: number; end: number }>; start: number; end: number; lineIndex: number; groupIndex: number }> = [];
  private ambientParticleEngine: ParticleEngine | null = null;
  private activeSectionIndex = -1;
  private _activeEffects: SectionEffectsConfig = DEFAULT_EFFECTS;
  private _effectsTransition: EffectsTransition | null = null;

  // ═══ Pre-computed hero word schedule for camera lookahead ═══
  private _heroSchedule: Array<{ startSec: number; endSec: number; emphasis: number; word: string }> = [];
  private _heroLookaheadMs = 400; // anticipate hero words 400ms before they appear
  private activeSectionTexture = 'dust';
  // Health monitor + adaptive quality
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private currentTSec = 0;

  // ═══ Adaptive Quality Tier ═══
  // Tier 0 = full, 1 = reduced, 2 = low, 3 = survival
  // Downgrades instantly on low FPS; upgrades only after sustained recovery.
  private _qualityTier: 0 | 1 | 2 | 3 = 0;
  private _qFrameCount = 0;          // frames in current 1-second window
  private _qWindowStart = 0;         // timestamp of current window start
  private _qUpgradeStreak = 0;       // consecutive good windows (need 3 to upgrade)
  private _qLastDowngradeMs = 0;     // avoid thrashing — min 2s between downgrades

  // Stall detection removed — was no-op (counters with no output)

  // Perf
  private fpsAccum = { t: 0, frames: 0, fps: 60 };
  private bootMode: "minimal" | "full" = "full";
  private fullModeEnabled = false;
  private perfMarks: {
    tInitStart: number;
    tFirstFrameDrawn: number | null;
    tClockStart: number | null;
    tFullModeEnabled: number | null;
  } = {
    tInitStart: 0,
    tFirstFrameDrawn: null,
    tClockStart: null,
    tFullModeEnabled: null,
  };
  private perfDebugEnabled = false;
  private frameBudget = { dtAvgMs: 16.67, fpsAvg: 60, spikeFrames: 0, frames: 0 };
  private _firstPaintMarked = false;
  private _fontStabilized = false;
  private _fontLayoutReflowPending = false;
  private _handleVisibilityChange: () => void;
  private _pendingUpgradeTimeout: number | null = null;
  private _pendingIdleHandle: number | null = null;
  private _pendingCanPlayHandler: (() => void) | null = null;
  /** Audio is waiting for scene compilation to finish before playing */
  private _audioDeferredUntilReady = false;
  private options?: { bootMode?: "minimal" | "full"; preloadedImages?: HTMLImageElement[] };

  constructor(
    data: LyricDanceData,
    bgCanvas: HTMLCanvasElement,
    textCanvas: HTMLCanvasElement,
    container: HTMLDivElement,
    options?: { bootMode?: "minimal" | "full"; preloadedImages?: HTMLImageElement[] },
  ) {
    this.data = data;
    this.bgCanvas = bgCanvas;
    this.textCanvas = textCanvas;
    this.container = container;
    this.options = options;

    // Engine owns ONE canvas; we draw everything on bgCanvas.
    this.canvas = bgCanvas;
    this.ctx = bgCanvas.getContext("2d", { alpha: false })!;

    // Keep text canvas blank (React shell still mounts it).
    const tctx = textCanvas.getContext("2d", { alpha: true });
    if (tctx) tctx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    this.audio = new Audio(data.audio_url);
    // Disable native loop for region-based players — tick() handles region looping manually
    this.audio.loop = !(data.region_start != null && data.region_end != null);
    this.audio.muted = true;
    this.audio.preload = "none";
    this.bootMode = options?.bootMode ?? "minimal";
    // Single engine per battle card — no forced quality reduction needed.
    this._handleVisibilityChange = this._handleVisibilityChangeImpl.bind(this);
    document.addEventListener("visibilitychange", this._handleVisibilityChange);

    

    this.ambientParticleEngine = new ParticleEngine({
      particleSystem: this.resolvedState.particleConfig.system,
      particleDensity: this.resolvedState.particleConfig.density,
      particleSpeed: this.resolvedState.particleConfig.speed,
      particleOpacity: 0.7,
      particleBeatReactive: true,
      particleDirection: "drift",
      fontFamily: "Montserrat",
      fontWeight: 700,
      letterSpacing: "0.02em",
      textTransform: "none",
      lineHeight: 1.2,
      gravity: "normal",
      tension: 0.5,
      damping: 0.5,
      beatResponse: "pulse",
      beatResponseScale: 1,
      imageOpacity: 0,
      vignetteStrength: 0,
      blurRadius: 0,
      grainOpacity: 0,
      tintStrength: 0,
      tone: "dark",
      intensity: 0.5,
      transitionType: "cross-dissolve",
    });
    if (this.ambientParticleEngine) {
      this.ambientParticleEngine.setSystem('dust'); // always start with something
      this.ambientParticleEngine.setDensityMultiplier(0.6);
    }
  }

  private markFirstPaintOnce(): void {
    if (this._firstPaintMarked) return;
    this._firstPaintMarked = true;
    performance.mark("engine:firstPaint");
  }

  private kickFontStabilizationLoad(): void {
    if (isFontReady('Montserrat')) {
      this._fontStabilized = true;
      this._fontLayoutReflowPending = true;
      performance.mark("engine:fontReady");
      return;
    }

    ensureFontReady('Montserrat').then((ready) => {
      if (this.destroyed) return;
      if (ready) {
        this._fontStabilized = true;
        this._fontLayoutReflowPending = true;
        performance.mark("engine:fontReady");
      }
    });
  }

  // Compatibility with existing React shell
  async init(): Promise<void> {
    this.perfDebugEnabled = Boolean((window as Window & { __LYRIC_DANCE_DEBUG_PERF?: boolean }).__LYRIC_DANCE_DEBUG_PERF);
    this.wickBarEnabled = Boolean((window as Window & { __LYRIC_DANCE_LIGHTNING_BAR?: boolean }).__LYRIC_DANCE_LIGHTNING_BAR);
    this._firstPaintMarked = false;
    this._fontLayoutReflowPending = false;
    performance.clearMarks("engine:start");
    performance.clearMarks("engine:firstPaint");
    performance.clearMarks("engine:initDone");
    performance.clearMarks("engine:fontReady");
    performance.clearMeasures("engine:ttfp");
    performance.mark("engine:start");
    this.perfMarks.tInitStart = performance.now();

    // Always kick font stabilization in the background — no gate on bootMode.
    // This ensures Montserrat / custom font is ready well before first vocal line.
    this.kickFontStabilizationLoad();

    const cw = this.container?.offsetWidth || this.canvas.offsetWidth || 960;
    const ch = this.container?.offsetHeight || this.canvas.offsetHeight || 540;
    this.resize(cw, ch);
    this.displayWidth = this.width;
    this.displayHeight = this.height;
    this.drawMinimalFirstFrame();
    if (this._firstPaintMarked) {
      performance.measure("engine:ttfp", "engine:start", "engine:firstPaint");
    }
    performance.mark("engine:initDone");

    if (this.bootMode === "minimal") {
      // ── MINIMAL BOOT ──
      // First frame is already painted. Do NOT start RAF or audio here.
      // Everything waits for play() — user gesture, zero wasted CPU/network.
      //
      // Start loading section images immediately (fire-and-forget).
      // Images are likely already in the preloadImage cache from feed prefetch.
      // This populates chapterImages so the first rendered frame has a background,
      // instead of waiting for the full mode upgrade delay (100ms + idle + compile).
      this.loadSectionImages().catch(() => {});
      return;
    }

    // ── FULL BOOT (explicit opt-in only) ──
    await this.prepareFullMode();
    this.startPlaybackClock();
  }

  private startPlaybackClock(): void {
    if (this.destroyed) return;
    this.perfMarks.tClockStart = this.perfMarks.tClockStart ?? performance.now();
    this.primeAudio();
    // Full boot: scene is already compiled by prepareFullMode()
    if (this.fullModeEnabled) {
      this.audio.play().catch(() => {});
    } else {
      this._audioDeferredUntilReady = true;
    }
    this.playing = true;
    this.startHealthMonitor();
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  private primeAudio(): void {
    this.audio.preload = "auto";
    // Avoid calling load() on every play/resume: it resets currentTime and breaks seek-based resumes.
    if (this.audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      this.audio.load();
    }
  }

  scheduleFullModeUpgrade(): void {
    if (
      this.destroyed
      || this.fullModeEnabled
      || this._bakePromise
      || this._pendingUpgradeTimeout != null
      || this._pendingIdleHandle != null
    ) {
      return;
    }

    const idleApi = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };

    const run = () => {
      this._pendingIdleHandle = null;
      if (this.destroyed || this.fullModeEnabled) return;
      void this.prepareFullMode();
    };

    this._pendingUpgradeTimeout = window.setTimeout(() => {
      this._pendingUpgradeTimeout = null;
      if (this.destroyed || this.fullModeEnabled) return;
      if (idleApi.requestIdleCallback) {
        this._pendingIdleHandle = idleApi.requestIdleCallback(run, { timeout: 300 });
      } else {
        run();
      }
    }, 100);
  }

  private async prepareFullMode(): Promise<void> {
    await this.ensureTimelineReady();
    this.enableFullVisualMode();
  }

  private async ensureTimelineReady(): Promise<void> {

    // Cache exists but was baked without cinematic direction — invalidate
    if (this._bakedScene && !this._bakedHasCinematicDirection && this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction)) {
      this._bakePromise = null;
      this._bakedScene = null;
      this._bakedChunkCache = null;
      this._bakeLock = false;
    }

    if (!this._bakePromise) {
      this._bakeLock = true;
      const bakeGen = this._bakeGeneration; // snapshot — if updateTranscript() fires mid-bake it increments this
      this._bakePromise = (async () => {
        // Ensure real viewport dimensions before compiling
        if (this.width === 0 && this.container) {
          const cw = this.container.offsetWidth || this.canvas.offsetWidth || 960;
          const ch = this.container.offsetHeight || this.canvas.offsetHeight || 540;
          if (cw > 0 && ch > 0) this.resize(cw, ch);
        }

        const payload = this.buildScenePayload();
        this.payload = payload;
        this._songGrade = null; // force recomputation for new song
        this.resolvePlayerState(payload);
        await this.preloadFonts();
        this.songStartSec = payload.songStart;
        this.songEndSec = payload.songEnd;

        // Compile the scene
        const compiled = compileScene(payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
        this.compiledScene = compiled;
        this._markCompiledViewport(this.width || 960, this.height || 540);

        // ═══ V2: Create BeatConductor with full audio analysis ═══
        const songDuration = Math.max(0.1, this.songEndSec - this.songStartSec);
        const beatGridData = this.data.beat_grid ?? { bpm: 120, beats: [], confidence: 0 };
        this.conductor = new BeatConductor(beatGridData, songDuration);
        // Attach runtime analysis if available (has energy/brightness curves not stored in DB)
        if ((beatGridData as any)._analysis) {
          this.conductor.setAnalysis((beatGridData as any)._analysis);
        }
        
        if (compiled.songMotion) {
          this.conductor.setSongIdentity(compiled.songMotion);
        }
        if (compiled.sectionMods) {
          this.conductor.setSectionMods(compiled.sectionMods);
        }

        // Camera reads Phase 6 motion identity + section mods (not AI labels)
        if (compiled.songMotion) {
          this.cameraRig.setSongIdentity(compiled.songMotion);
        }
        if (compiled.sectionMods) {
          this.cameraRig.setSectionMods(compiled.sectionMods);
        }

        // Build chunk cache from compiled scene
        this._buildChunkCacheFromScene(compiled);

        // Compute viewport scale
        this._updateViewportScale();
        this._textMetricsCache.clear();

        // Only commit to cache if updateTranscript() hasn't fired since we started
        if (this._bakeGeneration !== bakeGen) {
          this._bakeLock = false;
          return; // stale bake — discard, updateTranscript already set compiledScene fresh
        }
        this._bakedScene = compiled;
        this._bakedChunkCache = new Map(this.chunks);
        this._bakedHasCinematicDirection = !!this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction);
        this._bakedVersion = BAKER_VERSION;
        this._bakeLock = false;
      })();
    }

    await this._bakePromise;

    // Restore from instance cache — but only if the bake wasn't invalidated by updateTranscript()
    // (if it was, _bakedScene is null and compiledScene is already fresh)
    if (this._bakedScene) {
      this.compiledScene = this._bakedScene;
      this.chunks = new Map(this._bakedChunkCache!);
    }
    this._updateViewportScale();
    this._textMetricsCache.clear();
    const playStart = this.data.region_start ?? this.songStartSec;
    if (this.audio.currentTime <= 0 || this.data.region_start != null) {
      this.audio.currentTime = playStart;
    }
  }

  private enableFullVisualMode(): void {
    if (this.destroyed || this.fullModeEnabled) return;
    this.buildBgCache();
    this.deriveVisualSystems();
    this.buildChapterSims();
    this.loadSectionImages().catch(() => {
      // image upgrade best-effort
    });
    this.fullModeEnabled = true;
    // ═══ DEFERRED AUDIO: scene is now ready — start audio if play() was called earlier ═══
    if (this._audioDeferredUntilReady && this.playing) {
      this._audioDeferredUntilReady = false;
      this._startAudioPlayback();
      this.startHealthMonitor();
    }
    this.perfMarks.tFullModeEnabled = performance.now();
  }

  private drawMinimalFirstFrame(): void {
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    // ── SOLID BLACK only ────────────────────────────────────────────────────
    // Previously drew a palette[1] gradient here which bled through the
    // rgba(0,0,0,0.72) cover overlay, causing a visible purple/tinted flash.
    // The cover overlay sits on top — there is NO reason to show palette colors
    // beneath it. Just black, always, until the cover is dismissed and the
    // real frame pipeline fires.
    const isLight = this.themeOverride === 'light';
    this.ctx.fillStyle = isLight ? '#f5f5f5' : '#0a0a0a';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.perfMarks.tFirstFrameDrawn = this.perfMarks.tFirstFrameDrawn ?? performance.now();
    this.markFirstPaintOnce();
  }

  getBootMetrics(): {
    ttffMs: number | null;
    startLatencyMs: number | null;
    fullModeMs: number | null;
  } {
    const base = this.perfMarks.tInitStart;
    return {
      ttffMs: this.perfMarks.tFirstFrameDrawn ? Math.round(this.perfMarks.tFirstFrameDrawn - base) : null,
      startLatencyMs: this.perfMarks.tClockStart ? Math.round(this.perfMarks.tClockStart - base) : null,
      fullModeMs: this.perfMarks.tFullModeEnabled ? Math.round(this.perfMarks.tFullModeEnabled - base) : null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Public API (React calls these)
  // ────────────────────────────────────────────────────────────

  private _startAudioPlayback(): void {
    const playStart = this.data.region_start ?? this.songStartSec;
    if (this.audio.currentTime <= 0 || (this.data.region_start != null && this.audio.currentTime < playStart)) {
      if (this.audio.readyState >= 2) {
        this.audio.currentTime = playStart;
      } else if (this.data.region_start != null) {
        const onReady = () => {
          this.audio.removeEventListener("canplay", onReady);
          if (this._pendingCanPlayHandler === onReady) this._pendingCanPlayHandler = null;
          if (!this.destroyed) this.audio.currentTime = playStart;
        };
        this._pendingCanPlayHandler = onReady;
        this.audio.addEventListener("canplay", onReady);
      }
    }
    this.audio.play().catch(() => {});
  }

  async load(payload: ScenePayload, onProgress: (pct: number) => void): Promise<Map<string, ChunkState>> {
    try {
      this.payload = payload;
      this._songGrade = null; // force recomputation for new song
      this.resolvePlayerState(payload);
      this.songStartSec = payload.songStart;
      this.songEndSec = payload.songEnd;

      const cw = this.container?.offsetWidth || this.canvas.offsetWidth || 960;
      const ch = this.container?.offsetHeight || this.canvas.offsetHeight || 540;
      this.resize(cw, ch);
      const compiled = compileScene(payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
      this.compiledScene = compiled;
      this._markCompiledViewport(this.width || 960, this.height || 540);
      this._buildChunkCacheFromScene(compiled);
      this._updateViewportScale();
      this._textMetricsCache.clear();
      const chunkSnapshot = new Map(this.chunks);
      this.buildBgCache();
      this.deriveVisualSystems();
      this.buildChapterSims();
      onProgress(100);
      return chunkSnapshot;
    } catch (err) {
      
      throw err;
    }
  }

  play(): void {
    if (this.destroyed) return;
    this.primeAudio();
    this.playing = true;

    // ═══ AUDIO GATE: don't start audio before scene is compiled ═══
    // Without compiled scene, the viewer sees black while hearing music.
    // Defer audio until fullModeEnabled, then start automatically.
    if (!this.fullModeEnabled) {
      this._audioDeferredUntilReady = true;
      // Start the upgrade — audio will start when it completes
      if (!this._bakePromise) {
        this.scheduleFullModeUpgrade();
      }
      // Start RAF loop so drawMinimalFirstFrame keeps rendering
      if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
      this.rafHandle = requestAnimationFrame(this.tick);
      return;
    }

    // Scene is ready — start audio immediately
    this._startAudioPlayback();
    this.startHealthMonitor();

    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.stopHealthMonitor();
    this.audio.pause();
  }

  /** Stop the visual render loop without pausing audio. Used by battle mode
   *  to keep the inactive side's audio buffering while saving CPU on rendering. */
  stopRendering(): void {
    this.playing = false;
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.stopHealthMonitor();
    // Note: audio is NOT paused — it continues loading/buffering silently
  }

  /** Start the visual render loop without touching audio. Used to animate
   *  the canvas behind a cover screen before the user has interacted. */
  startRendering(): void {
    if (this.destroyed) return;
    this.playing = true;
    if (!this.rafHandle) {
      this.rafHandle = requestAnimationFrame(this.tick);
    }
  }

  seek(timeSec: number): void {
    this._audioDeferredUntilReady = false;
    this.audio.currentTime = timeSec;
    const t = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (t - this.songStartSec) * 1000);
    this._beatCursor = 0;
    this._intensityRouter.reset();
    this._lastBeatIndex = -1;
    this._timeInitialized = false;
    // Layout cache intentionally NOT cleared on seek — layout inputs (words, font,
    // viewport) don't change, only playback time. Same group = same rows, always.
    // Solver hash reset so it re-runs for the new set of visible chunks.
    this.conductor?.resetCursor();
    this.cameraRig.reset();
    this._activeGroupCursor = 0;
    this._activeGroupCursorTime = -1;
    this._exitEffect.reset();
    this._heroSmoke.reset();
    this._exitTriggeredForGroup = -1;
    this._intensityRouter.reset();
    this._resetBgParallax();
  }

  seekTo(timeSec: number): void {
    this.seek(timeSec);


  }

  async startExport(ratio: "16:9" | "9:16"): Promise<void> {
    if (this.isExporting || !this.payload) return;

    const { width, height } = LyricDancePlayer.RESOLUTIONS[ratio];
    this.isExporting = true;
    this.wasLoopingBeforeExport = this.audio.loop;
    this.audio.loop = false;

    this.setResolution(width, height);
    this.seekTo(0);

    const stream = this.canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: Blob[] = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const onAudioEnded = () => {
      this.stopExport();
    };
    this.audio.addEventListener("ended", onAudioEnded, { once: true });

    this.mediaRecorder.onstop = () => {
      this.audio.removeEventListener("ended", onAudioEnded);
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${this.data.artist_name ?? "artist"}-${this.data.song_name ?? "song"}-${ratio.replace(":", "x")}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
      a.click();
      URL.revokeObjectURL(url);

      this.isExporting = false;
      this.mediaRecorder = null;
      this.audio.loop = this.wasLoopingBeforeExport;
      this.setResolution(this.displayWidth, this.displayHeight);
      this.onExportComplete?.();
    };

    this.mediaRecorder.start(100);
    this.play();
  }

  stopExport(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return;
    this.mediaRecorder.stop();
  }

  // ═══ WebCodecs export API ═══

  getSongDuration(): number {
    return Math.max(0, this.songEndSec - this.songStartSec);
  }

  setupExportResolution(width: number, height: number): void {
    this.pause();
    this.displayWidth = this.width;
    this.displayHeight = this.height;
    this.isExporting = true;

    // Export resolution IS the target pixel resolution — DPR must be 1.0
    // Otherwise a 2× display creates a 2160×3840 backing store for a 1080×1920 export
    this._exportSavedDpr = this.dpr;
    this._exportSavedVerticalBias = this._textVerticalBias;
    this.dpr = 1;
    this._textVerticalBias = 0; // no bottom overlays in export — center text properly

    // Use resize() instead of setResolution() — triggers scene recompile
    // when aspect ratio or size changes significantly. This ensures font sizing,
    // word wrapping, row stacking, and layout positions are correct for the
    // export resolution, not the live viewport.
    this.resize(width, height);
    // Re-acquire context with willReadFrequently for fast pixel readback
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      desynchronized: true,
    })!;
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);

    // Force quality tier 0 for export — maximum visual quality, CPU doesn't matter
    this._qualityTier = 0 as 0;
    this._qUpgradeStreak = 0;

    // Reset background snapshot so first export frame gets a fresh bake
    this._bgSnapshotSection = -999;
    this._bgLastBakeMs = 0;
    this.seek(this.songStartSec);
  }

  drawAtTime(tSec: number): void {
    const timeSec = this.songStartSec + tSec;
    const clamped = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (clamped - this.songStartSec) * 1000);

    // Set up frame context
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);

    const deltaMs = 16.67; // simulate at 60fps timestep — keeps spring physics identical to live playback
    const beatState = this.conductor?.getState(clamped) ?? null;
    if (beatState) (beatState as any)._tSec = clamped;
    this._lastBeatState = beatState;
    this._frameDt = deltaMs / 16.67;

    // Emoji stream — detect line changes and spawn risers (same as tick())
    if (this.emojiStreamEnabled) {
      const currentLineIdx = this.resolveCurrentLineIndex(clamped);
      if (currentLineIdx !== this._lastEmojiLineIndex && currentLineIdx >= 0) {
        this._lastEmojiLineIndex = currentLineIdx;
        this.scheduleEmojiSpawns(currentLineIdx, clamped);
      }
      this.processEmojiSpawnQueue();
    }

    // Section + palette
    {
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? (cd?.chapters as any[]) ?? [];
      const dur = this.getSongDuration() || 1;
      this._frameSectionIdx = sections.length > 0
        ? this.resolveSectionIndex(sections, clamped, dur)
        : -1;
      const secIdx = this._frameSectionIdx;
      if (secIdx !== this._framePaletteTime) {
        this._framePaletteTime = secIdx;
        this._framePalette = this._resolveAndCachePalette(secIdx);
        {
          const accent = this._currentSectionPalette.accent;
          if (this._globalBeatVis) this._globalBeatVis.setAccent(accent);
          if (this._globalWickBar) this._globalWickBar.setAccent(accent);
        }
      }
    }

    const frame = this.evaluateFrame(clamped);

    // Camera rig — must feed section + energy BEFORE update, same as tick()
    {
      const vocalActive = frame ? frame.chunks.some((c: any) => c.visible && c.alpha > 0.3) : false;
      const upcoming = this._getUpcomingHero(clamped);
      const songProg = (clamped - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
      const isClimax = (beatState?.energy ?? 0) > 0.65 && songProg > 0.50;

      // Feed section mood + energy — drives Layer 1 (Section Arc) camera behavior
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? (cd?.chapters as any[]) ?? [];
      const secIdx = this._frameSectionIdx;
      const currentSection = sections[secIdx];
      if (currentSection) {
        this.cameraRig.setSectionFromMood(
          currentSection.atmosphere
            ?? currentSection.mood
            ?? currentSection.description
            ?? ''
        );
      }
      this.cameraRig.setEnergy(beatState?.energy ?? 0.5);

      const focus: SubjectFocus = {
        x: this.width / 2,
        y: this.height / 2,
        heroActive: upcoming !== null && !upcoming.isAnticipation,
        emphasisLevel: upcoming?.emphasis ?? 0,
        isClimax,
        vocalActive,
        heroApproaching: upcoming?.isAnticipation ?? false,
      };
      // Tell camera which section we're in (for amplitude scaling)
      this.cameraRig.setSectionIndex(this._frameSectionIdx >= 0 ? this._frameSectionIdx : 0);

      this.cameraRig.setPhraseDamping(0);

      this.cameraRig.update(deltaMs, beatState, focus);
    }

    this.update(deltaMs, clamped, frame, beatState);
    this.draw(clamped, frame);
  }

  getExportCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  teardownExportResolution(): void {
    this.isExporting = false;
    this.dpr = this._exportSavedDpr; // restore display DPR
    this._textVerticalBias = this._exportSavedVerticalBias; // restore live overlay bias
    this.resize(this.displayWidth, this.displayHeight); // recompile scene for live viewport
    // Restore normal GPU-backed context
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
  }

  resize(logicalW: number, logicalH: number): void {
    const prevCompiledW = this._compiledViewportW;
    const prevCompiledH = this._compiledViewportH;
    const w = Math.max(1, Math.floor(logicalW));
    const h = Math.max(1, Math.floor(logicalH));
    this.width = w;
    this.height = h;
    this._applyDprToCanvas();

    if (this.payload) this.buildBgCache();
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._vignetteCanvas = null;
    this._vignetteKey = '';
    this._watermarkCache = null; // invalidate — dimensions depend on this.width
    this.ambientParticleEngine?.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
    this.cameraRig.setViewport(w, h);

    // ═══ RESPONSIVE: always recompile on resize ═══
    // Layout is in viewport pixels — any size change needs recompile.
    if (this.payload && this.compiledScene) {
      const sizeChanged = w !== prevCompiledW || h !== prevCompiledH;
      if (sizeChanged) {
        this.compiledScene = compileScene(this.payload, { viewportWidth: w, viewportHeight: h });
        this._buildChunkCacheFromScene(this.compiledScene);
        this._markCompiledViewport(w, h);
        this._textMetricsCache.clear();
      }
    }
  }

  /** Apply current effective DPR to canvas backing-store dimensions.
   *  Called by resize() and by _updateQualityTier when the DPR bucket changes.
   *  At tier ≥ 2 the effective DPR is capped at 1.5 (from the device DPR which may
   *  be 2–3×), cutting pixel fill by up to 75% with negligible visual degradation. */
  private _applyDprToCanvas(): void {
    const eDpr = this._effectiveDpr;
    this.canvas.width = Math.floor(this.width * eDpr);
    this.canvas.height = Math.floor(this.height * eDpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    // Text canvas is kept matched (never drawn to, but must agree on dimensions)
    this.textCanvas.width = this.canvas.width;
    this.textCanvas.height = this.canvas.height;
    this.textCanvas.style.width = `${this.width}px`;
    this.textCanvas.style.height = `${this.height}px`;
    // Invalidate bg cache — was baked at previous DPR
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._bgSnapshotSection = -999; // force rebake at new resolution
    if (this.payload) this.buildBgCache();
  }

  /**
   * Swap the render target to a different canvas pair.
   * Used by battle mode to render one engine to two canvases alternately.
   * Preserves all compiled state — only the output surface changes.
   */
  setRenderTarget(bgCanvas: HTMLCanvasElement, textCanvas: HTMLCanvasElement, container?: HTMLDivElement): void {
    if (this.destroyed) return;
    this.bgCanvas = bgCanvas;
    this.canvas = bgCanvas;
    this.ctx = bgCanvas.getContext('2d', { alpha: false })!;
    this.textCanvas = textCanvas;
    const tctx = textCanvas.getContext('2d', { alpha: true });
    if (tctx) tctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    if (container) this.container = container;

    const cw = container?.offsetWidth || bgCanvas.offsetWidth || this.width || 960;
    const ch = container?.offsetHeight || bgCanvas.offsetHeight || this.height || 540;
    if (cw > 0 && ch > 0) this.resize(cw, ch);
  }

  /**
   * Switch the playback region (hook window) without destroying the engine.
   * Seeks audio to the new region start and resets beat tracking.
   */
  setRegion(regionStart: number | undefined, regionEnd: number | undefined): void {
    if (this.destroyed) return;
    this.data = { ...this.data, region_start: regionStart, region_end: regionEnd };
    if (regionStart != null && regionEnd != null) {
      this.audio.loop = false;
    }
    if (regionStart != null && this.audio.readyState >= 2) {
      this.audio.currentTime = regionStart;
    } else if (regionStart != null) {
      const onReady = () => {
        this.audio.removeEventListener("canplay", onReady);
        if (!this.destroyed) this.audio.currentTime = regionStart;
      };
      this.audio.addEventListener("canplay", onReady);
    }

    // Recompile scene for the new time window
    const payload = this.buildScenePayload();
    this.payload = payload;
    this.songStartSec = payload.songStart;
    this.songEndSec = payload.songEnd;
    const compiled = compileScene(payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
    this.compiledScene = compiled;
    this._buildChunkCacheFromScene(compiled);
    this._markCompiledViewport(this.width || 960, this.height || 540);

    // Reset all per-frame tracking
    this.conductor?.resetCursor();
    this._beatCursor = 0;
    this._intensityRouter.reset();
    this._lastBeatIndex = -1;
    this._timeInitialized = false;
    this._textMetricsCache.clear();
    this._lastSortHash = 0;
    this.cameraRig.reset();
    this._activeGroupCursor = 0;
    this._activeGroupCursorTime = -1;
    this._exitEffect.reset();
    this._heroSmoke.reset();
    this._exitTriggeredForGroup = -1;
    this._intensityRouter.reset();
    this._resetBgParallax();
    this._bgSnapshotSection = -1;
  }

  /**
   * Capture the current canvas content to an offscreen canvas.
   * Returns the offscreen canvas (can be drawn onto another canvas via drawImage).
   */
  captureSnapshot(): HTMLCanvasElement | null {
    if (this.destroyed || !this.canvas) return null;
    const off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(this.canvas, 0, 0);
    return off;
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
    if (!muted) this.audio.play().catch(() => {});
  }

  /** Set vertical text bias in canvas pixels — shifts text up to account for bottom overlays (playbar, battle bar). */
  setTextVerticalBias(px: number): void {
    this._textVerticalBias = px;
  }

  /** Set per-line reaction data for the emoji stream. Called by parent surfaces. */
  setReactionData(data: Record<string, { line: Record<number, number>; total: number }>): void {
    this.emojiReactionData = data;
  }

  /** Enable/disable the emoji stream overlay. Disabled when reaction panel is open. */
  setEmojiStreamEnabled(enabled: boolean): void {
    this.emojiStreamEnabled = enabled;
  }

  updateCinematicDirection(direction: CinematicDirection): void {
    // Direct pass-through — new schema consumed directly by resolvers
    this.data = { ...this.data, cinematic_direction: direction };
    if (!this.payload) return;
    this.payload = { ...this.payload, cinematic_direction: direction };
    this._songGrade = null; // cinematic direction changed — recompute grade
    this.resolvePlayerState(this.payload);
    this.compiledScene = compileScene(this.payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
    this._markCompiledViewport(this.width || 960, this.height || 540);
    this._buildChunkCacheFromScene(this.compiledScene);
    this._updateViewportScale();
    this._textMetricsCache.clear();
    // ═══ V2: timing budgets (placeholder — method removed) ═══
    this.buildBgCache();
    this.deriveVisualSystems();
    this.buildChapterSims();
  }

  /**
   * Hot-patch lyrics/words without a full load() — skips images, sims, bg cache.
   * Only recompiles the scene and rebuilds chunk/timing caches.
   */
  updateTranscript(lines: LyricLine[], words?: Array<{ word: string; start: number; end: number }> | null): void {
    this.data = { ...this.data, lyrics: lines };
    if (words !== undefined) this.data = { ...this.data, words: words ?? undefined };

    // ── Reconcile edited line text back onto word-level tokens ────────────
    // compileScene renders wm.word (Whisper tokens), not line.text.
    // When the user edits a line, the new text must be tokenized and
    // redistributed across the existing word timestamp slots for that line.
    // Strategy: for each line, collect its word slots, split the edited text
    // into tokens, then zip new tokens onto old slots (preserving timestamps).
    // If counts differ: extra slots get "" (hidden), missing slots split time.
    const currentWords = this.data.words;
    if (currentWords && lines.length > 0) {
      const reconciled = currentWords.map(w => ({ ...w }));
      for (const line of lines) {
        if (!line.text) continue;
        const lineStart = line.start ?? 0;
        const lineEnd = line.end ?? Infinity;
        // Find all word slots belonging to this line (by timestamp)
        const slotIdxs = reconciled
          .map((w, i) => ({ w, i }))
          .filter(({ w }) => w.start >= lineStart && w.start < lineEnd)
          .map(({ i }) => i);
        if (!slotIdxs.length) continue;
        // Tokenize the edited line text
        const tokens = line.text.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) continue;
        const slotCount = slotIdxs.length;
        // Zip tokens onto slots
        slotIdxs.forEach((slotIdx, si) => {
          reconciled[slotIdx] = {
            ...reconciled[slotIdx],
            word: tokens[si] ?? tokens[tokens.length - 1], // clamp extras to last token
          };
        });
        // If fewer slots than tokens: nothing we can do (timestamps are fixed)
        // If more tokens than slots: they get collapsed into last slot — acceptable
      }
      this.data = { ...this.data, words: reconciled };
    }

    if (!this.payload) return;

    // ── Invalidate any in-flight bake ────────────────────────────────────
    this._bakeGeneration++;
    this._bakedScene = null;
    this._bakedChunkCache = null;

    const t = this.audio.currentTime;
    const payload = this.buildScenePayload();
    this.payload = payload;
    this.songStartSec = payload.songStart;
    this.songEndSec = payload.songEnd;
    this.compiledScene = compileScene(payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
    this._markCompiledViewport(this.width || 960, this.height || 540);
    this._buildChunkCacheFromScene(this.compiledScene);
    this._textMetricsCache.clear();
    // timing budgets (placeholder — method removed)
    this._updateViewportScale();
    this.audio.currentTime = t;
    const groupCount = this.compiledScene?.phraseGroups?.length ?? 0;
    
  }

  updateSectionImages(urls: string[]): void {
    this.data = { ...this.data, section_images: urls };
    this._bgSnapshotSection = -999; // force snapshot rebake with new images
    this.loadSectionImages();
  }

  updateSceneContext(sceneCtx: SceneContext): void {
    
    this.data = { ...this.data, scene_context: sceneCtx };
  }

  /** Hot-patch auto_palettes and recompile scene so word colors update */
  updateAutoPalettes(palettes: string[][]): void {
    if (!palettes?.length) return;
    
    (this as any)._paletteDiagLogged = false; // reset so next getResolvedPalette logs the new state
    this.data = { ...this.data, auto_palettes: palettes };
    // Recompile scene with fresh palette data
    if (this.payload) {
      this.payload = { ...this.payload, auto_palettes: palettes };
      const compiled = compileScene(this.payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
      this.compiledScene = compiled;
      this._markCompiledViewport(this.width || 960, this.height || 540);
      this._buildChunkCacheFromScene(compiled);
      this._textMetricsCache.clear();
    }
  }

  private _zeroCanvas(canvas: HTMLCanvasElement | null | undefined): void {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }

  private _zeroCanvasList(canvases: Array<HTMLCanvasElement | null | undefined>): void {
    canvases.forEach((canvas) => this._zeroCanvas(canvas));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    this.stopHealthMonitor();
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const tctx = this.textCanvas.getContext("2d", { alpha: true });
    if (tctx) tctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    // Only clear local reference, not the global cache
    this.chunks = new Map();
    this._zeroCanvasList(this.bgCaches);
    this.bgCaches = [];
    this.bgCacheCount = 0;

    // Cancel pending deferred work
    if (this._pendingUpgradeTimeout != null) {
      window.clearTimeout(this._pendingUpgradeTimeout);
      this._pendingUpgradeTimeout = null;
    }
    const idleApi = window as Window & { cancelIdleCallback?: (id: number) => void };
    if (this._pendingIdleHandle != null && idleApi.cancelIdleCallback) {
      idleApi.cancelIdleCallback(this._pendingIdleHandle);
    }
    this._pendingIdleHandle = null;
    if (this._pendingCanPlayHandler) {
      this.audio.removeEventListener("canplay", this._pendingCanPlayHandler);
      this._pendingCanPlayHandler = null;
    }
    this._audioDeferredUntilReady = false;

    this.audio.pause();
    this.audio.src = "";
    this._timeInitialized = false;
    document.removeEventListener("visibilitychange", this._handleVisibilityChange);

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.ambientParticleEngine?.clear();
    this.chapterSims.forEach((sim) => {
      this._zeroCanvas(sim.beatVis?.canvas);
    });
    this._zeroCanvas(this._globalBeatVis?.canvas ?? null);
    this._zeroCanvas(this._beatVisCanvas);
    this.chapterSims = [];
    this.chapterImages = [];
    this._zeroCanvas(this._lightingOverlayCanvas);
    this._lightingOverlayCanvas = null;
    this._zeroCanvas(this._vignetteCanvas);
    this._vignetteCanvas = null;
    this._zeroCanvas(this._grainCanvas);
    this._grainCanvas = null;
    this._grainPool = [];
    this._zeroCanvas(this._bgSnapshot);
    this._bgSnapshot = null;
    this._globalBeatVis = null;
    this._unmountWickSeekOverlay();
    this._globalWickBar = null;
    this._beatVisCanvas = null;
    this.emojiRisers = [];
    this._emojiSpawnQueue = [];
    this._textMetricsCache.clear();
    this._watermarkCache = null;
    this._zeroCanvas(this._measureCanvas);
    this._zeroCanvas(this.textCanvas);
    this._zeroCanvas(this.canvas);
    this._zeroCanvas(this.bgCanvas);
    revokeAnalyzerWorker();          // free blob URL (safe to call multiple times)
    this.ctx = null as any;
    this.canvas = null as any;
    this.bgCanvas = null as any;
    this.textCanvas = null as any;
    this.container = null as any;
  }

  // ────────────────────────────────────────────────────────────
  // RAF loop
  // ────────────────────────────────────────────────────────────

  private startHealthMonitor(): void {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => {
      this.frameCount = 0;
    }, 5000);
  }

  /** Adaptive quality — call once per frame to update tier based on rolling FPS. */
  private _updateQualityTier(nowMs: number): void {
    // During export, lock at tier 0 — maximum quality, CPU is irrelevant
    if (this.isExporting) return;
    this._qFrameCount++;
    if (this._qWindowStart === 0) { this._qWindowStart = nowMs; return; }
    const elapsed = nowMs - this._qWindowStart;
    if (elapsed < 1000) return; // 1-second measurement windows

    const fps = (this._qFrameCount / elapsed) * 1000;
    this._qFrameCount = 0;
    this._qWindowStart = nowMs;

    const tier = this._qualityTier;
    const sinceLast = nowMs - this._qLastDowngradeMs;

    // Downgrade instantly (with 2s cooldown to prevent thrashing)
    if (fps < 18 && tier < 3 && sinceLast > 2000) {
      const prevDprBucket = tier >= 2 ? 'low' : 'full';
      this._qualityTier = Math.min(3, tier + 1) as 0 | 1 | 2 | 3;
      this._qUpgradeStreak = 0;
      this._qLastDowngradeMs = nowMs;
      // Crossing into tier 2: switch to half-DPR backing store (cuts pixel fill 4×)
      if (prevDprBucket === 'full' && this._qualityTier >= 2) {
        this._applyDprToCanvas();
      }
    }
    // Upgrade only after 3 consecutive good windows (3s sustained)
    else if (fps > 40 && tier > 0) {
      const prevDprBucket = tier >= 2 ? 'low' : 'full';
      this._qUpgradeStreak++;
      if (this._qUpgradeStreak >= 3) {
        this._qualityTier = Math.max(0, tier - 1) as 0 | 1 | 2 | 3;
        this._qUpgradeStreak = 0;
        
        // Crossing back out of tier 2: restore full-DPR backing store
        if (prevDprBucket === 'low' && this._qualityTier < 2) {
          this._applyDprToCanvas();
        }
      }
    } else {
      this._qUpgradeStreak = 0;
    }
  }


  private stopHealthMonitor(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private _resetBgParallax(): void {
    this._bgPulseZoom = 1.0;
    this._bgZoomPivotX = 0;
    this._bgZoomPivotY = 0;
    this._textBeatNodX = 0;
    this._textBeatNodY = 0;
    this._finaleEffect.reset();
    this._exitEffect.reset();
    this._heroSmoke.reset();
    this._exitTriggeredForGroup = -1;
  }

  private _handleVisibilityChangeImpl(): void {
    if (document.hidden) return;

    this.lastTimestamp = 0;

    this._qFrameCount = 0;
    this._qWindowStart = 0;

    this.frameBudget.dtAvgMs = 16.67;
    this.frameBudget.fpsAvg = 60;
    this.frameBudget.spikeFrames = 0;

    this._timeInitialized = false;

    this.cameraRig?.reset();
    this._resetBgParallax();
    this.ambientParticleEngine?.clear();

    if (this._qualityTier > 0) {
      const prevBucket = this._qualityTier >= 2 ? 'low' : 'full';
      this._qualityTier = 0;
      this._qUpgradeStreak = 0;
      if (prevBucket === 'low' && this._qualityTier < 2) {
        this._applyDprToCanvas();
      }
    }

    // Restart the RAF loop — the browser kills requestAnimationFrame while the tab
    // is hidden. playing may still be true but the loop is dead. Restart it.
    if (this.playing && !this.rafHandle) {
      this.lastTimestamp = 0;
      this.rafHandle = requestAnimationFrame(this.tick);
    }

  }

  private tick = (timestamp: number): void => {
    if (this.destroyed) return;
    if (!this.playing) {
      this.rafHandle = 0;
      return;
    }

    try {
      const rawDelta = timestamp - (this.lastTimestamp || timestamp);
      const deltaMs = rawDelta > 200 ? 0 : Math.min(rawDelta, 50);
      this.lastTimestamp = timestamp;
      this.updateFrameBudget(deltaMs);
      if (this._fontLayoutReflowPending) {
        this._fontLayoutReflowPending = false;
        this._textMetricsCache.clear();
        // ═══ RECOMPILE SCENE: font loaded → layoutX positions were baked with wrong metrics ═══
        if (this.payload && this.compiledScene) {
          this.compiledScene = compileScene(this.payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
          this._buildChunkCacheFromScene(this.compiledScene);
        }
      }

      // ALWAYS start frame with this exact sequence
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
      this.ctx.clearRect(0, 0, this.width, this.height);

      const rawTime = this.audio.currentTime;

      // Region loop: when audio passes region_end, seek back to region_start
      if (this.data.region_end != null && this.data.region_start != null) {
        // Only seek when audio has buffered enough (readyState >= 2 = HAVE_CURRENT_DATA)
        if (this.audio.readyState >= 2) {
          if (rawTime >= this.data.region_end || rawTime < this.data.region_start - 0.5) {
            this.audio.currentTime = this.data.region_start;
            this.conductor?.resetCursor();
            this._beatCursor = 0;
            this._intensityRouter.reset();
            this._lastBeatIndex = -1;
          }
        }
      }

      // In region mode, use region_start as visual time while audio is still loading/seeking.
      // Without this, evaluateFrame(0) finds no lyrics (they're at e.g. t=30) → black canvas.
      const effectiveAudioTime = (
        this.data.region_start != null &&
        this.audio.currentTime < this.data.region_start - 0.5
      ) ? this.data.region_start : this.audio.currentTime;

      const smoothedTime = this.smoothAudioTime(effectiveAudioTime);

      // ── Emoji stream: detect line changes and populate spawn queue ──
      if (this.emojiStreamEnabled && !this.audio.paused) {
        const currentLineIdx = this.resolveCurrentLineIndex(smoothedTime);
        if (currentLineIdx !== this._lastEmojiLineIndex && currentLineIdx >= 0) {
          this._lastEmojiLineIndex = currentLineIdx;
          this.scheduleEmojiSpawns(currentLineIdx, smoothedTime);
        }
        this.processEmojiSpawnQueue();
      }

      // ═══ V2: Get beat state ONCE from conductor ═══
      const beatState = this.conductor?.getState(smoothedTime) ?? null;
      if (beatState) (beatState as any)._tSec = smoothedTime;
      this._lastBeatState = beatState;
      this._frameDt = Math.min(deltaMs, 33.33) / 16.67; // normalized to 60fps

      // ═══ Per-frame caches: section index + palette ═══
      {
        const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
        const sections = (cd?.sections as any[]) ?? (cd?.chapters as any[]) ?? [];
        const dur = this.audio?.duration || 1;
        // In region mode, lock section index to the section at region_start.
        // A 10-second hook that crosses a section boundary would otherwise
        // cycle images every loop — distracting flicker instead of stable bg.
        const sectionTime = this.data.region_start != null
          ? this.data.region_start
          : smoothedTime;
        this._frameSectionIdx = sections.length > 0
          ? this.resolveSectionIndex(sections, sectionTime, dur)
          : -1;
        // Palette: only re-resolve if section changed
        const secIdx = this._frameSectionIdx;
        if (secIdx !== this._framePaletteTime) {
          this._framePaletteTime = secIdx;
          this._framePalette = this._resolveAndCachePalette(secIdx);
          {
            const accent = this._currentSectionPalette.accent;
            if (this._globalBeatVis) this._globalBeatVis.setAccent(accent);
            if (this._globalWickBar) this._globalWickBar.setAccent(accent);
          }
        }
      }

      // ═══ V2: Single evaluateFrame call ═══
      const frame = this.evaluateFrame(smoothedTime);

      // ═══ V2: Update CameraRig with LOOKAHEAD — anticipate hero words ═══
      {
        const vocalActive = frame ? frame.chunks.some((c: any) => c.visible && c.alpha > 0.3) : false;
        const upcoming = this._getUpcomingHero(smoothedTime);

        const songProg = (smoothedTime - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
        // Climax = high energy + past halfway through the song
        const isClimax = (beatState?.energy ?? 0) > 0.65 && songProg > 0.50;

        // ── Feed section + energy to camera ──
        {
          const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
          const sections = (cd?.sections as any[]) ?? (cd?.chapters as any[]) ?? [];
          const secIdx = this._frameSectionIdx;
          const currentSection = sections[secIdx];

          if (currentSection) {
            this.cameraRig.setSectionFromMood(
              currentSection.atmosphere
                ?? currentSection.mood
                ?? currentSection.description
                ?? ''
            );
          }
          this.cameraRig.setEnergy(beatState?.energy ?? 0.5);
        }

        const focus: SubjectFocus = {
          x: this.width / 2,
          y: this.height / 2,
          heroActive: upcoming !== null && !upcoming.isAnticipation,
          emphasisLevel: upcoming?.emphasis ?? 0,
          isClimax,
          vocalActive,
          heroApproaching: upcoming?.isAnticipation ?? false,
        };
        // Tell camera which section we're in (for amplitude scaling)
        this.cameraRig.setSectionIndex(this._frameSectionIdx >= 0 ? this._frameSectionIdx : 0);

        this.cameraRig.setPhraseDamping(0);

        // CameraRig driven by IntensityRouter — background moves with the beat
        const camIntensity = this._motionProfile?.cameraBeatMult ?? 0;
        if (camIntensity > 0.02) {
          this.cameraRig.setAmplitudeScale(camIntensity);
          this.cameraRig.update(deltaMs, beatState, focus);
        } else {
          this.cameraRig.setAmplitudeScale(0);
          this.cameraRig.softReset();
        }
      }

      this.update(deltaMs, smoothedTime, frame, beatState);
      this.draw(smoothedTime, frame);
    } catch (err) {
      console.error('[LyricEngine] tick crash:', err);
    } finally {
      // ALWAYS reschedule — even after crash — loop must never die
      if (!this.destroyed && this.playing) {
        this.rafHandle = requestAnimationFrame(this.tick);
      }
    }
  };

  private updateFrameBudget(deltaMs: number): void {
    if (deltaMs === 0 || deltaMs > 100) {
      this._qFrameCount = 0;
      this._qWindowStart = 0;
      this.frameBudget.dtAvgMs = 16.67;
      this.frameBudget.fpsAvg = 60;
      return;
    }

    const alpha = 0.12;
    this.frameBudget.dtAvgMs += (deltaMs - this.frameBudget.dtAvgMs) * alpha;
    this.frameBudget.fpsAvg = 1000 / Math.max(1, this.frameBudget.dtAvgMs);
    this.frameBudget.frames += 1;
    if (deltaMs > 24) {
      this.frameBudget.spikeFrames += 1;
    }
  }

  private smoothAudioTime(rawTime: number): number {
    const jumped = Math.abs(rawTime - this._lastRawTime) > 0.5;
    const looped = rawTime < this._lastRawTime - 1.0;

    // On first call or after seek, snap immediately
    if (!this._timeInitialized || jumped) {
      this._smoothedTime = rawTime;
      this._timeInitialized = true;
      this._lastRawTime = rawTime;

      if (looped) {
        this.cameraRig?.softReset();
      }

      return rawTime;
    }

    this._lastRawTime = rawTime;

    // PERF: audio buffers step in ~5.8ms increments at 44100Hz.
    // Alpha=0.2 can accumulate up to ~25ms of drift before self-correcting,
    // causing word entry/exit to fire a full frame late.
    // Fix: use 0.5 alpha (snappier convergence) + hard-snap when within 4ms of real time.
    const diff = rawTime - this._smoothedTime;
    if (Math.abs(diff) < 0.004) {
      // Within 4ms — just snap to avoid micro-drift accumulation
      this._smoothedTime = rawTime;
    } else {
      this._smoothedTime += diff * 0.5;
    }

    // Never drift more than 50ms from real time (down from 100ms)
    if (Math.abs(this._smoothedTime - rawTime) > 0.05) {
      this._smoothedTime = rawTime;
    }

    return this._smoothedTime;
  }

  private static readonly PALETTE_COLORS: Record<string, string[]> = {
    // [background, accent, text, glow, dim]
    'cold-gold': ['#0A0A0F', '#C9A96E', '#F0ECE2', '#FFD700', '#5A4A30'],
    'warm-ember': ['#1A0A05', '#E8632B', '#FFF0E6', '#FF6B35', '#7D3A1A'],
    'ice-blue': ['#050A14', '#4FA4D4', '#E8F4F8', '#00BFFF', '#2A5570'],
    'midnight-rose': ['#0F0510', '#D4618C', '#F5E6EE', '#FF69B4', '#8A3358'],
    'neon-green': ['#050F05', '#39FF14', '#E6FFE6', '#00FF41', '#1A7A0A'],
    'storm-grey': ['#0E0E12', '#A0A4AC', '#E8E8EC', '#B8BCC4', '#5A5A66'],
    'blood-red': ['#120505', '#D43030', '#FFE6E6', '#FF3030', '#7A1A1A'],
    'lavender-dream': ['#0A0510', '#B088F9', '#F0E6FF', '#C49EFF', '#5A3A8A'],
    'earth-brown': ['#0F0A05', '#A0845C', '#F5EDE2', '#C4A878', '#6A5030'],
    'pure-white': ['#F8F8FA', '#3344AA', '#1A1A2E', '#4466FF', '#8888AA'],
    'soft-cream': ['#FFF8F0', '#8B6040', '#1A1008', '#C49A6C', '#6A4A30'],
    'sky-blue': ['#EEF5FF', '#2255AA', '#0A1A30', '#3B82F6', '#4A6A9A'],
    'sunset-pink': ['#FFF0F0', '#AA3366', '#1A0510', '#FF6B9D', '#883355'],
    'spring-green': ['#F0FFF0', '#228844', '#0A200F', '#34D058', '#3A7A4A'],
  };

  private static readonly TYPOGRAPHY_FONTS: Record<string, string> = {
    'bold-impact': '"Oswald", sans-serif',
    'clean-modern': '"Montserrat", sans-serif',
    'elegant-serif': '"Playfair Display", serif',
    'raw-condensed': '"Barlow Condensed", sans-serif',
    'whisper-soft': '"Nunito", sans-serif',
    'tech-mono': '"JetBrains Mono", monospace',
    'display-heavy': '"Bebas Neue", sans-serif',
    'editorial-light': '"Cormorant Garamond", serif',
  };


  private resolveSectionIndex(sections: Array<{ startSec?: number; endSec?: number; startRatio?: number; endRatio?: number }>, currentTimeSec: number, totalDurationSec?: number): number {
    // Try absolute time boundaries first
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].startSec != null && sections[i].endSec != null) {
        if (currentTimeSec >= sections[i].startSec! && currentTimeSec < sections[i].endSec!) {
          return i;
        }
      }
    }
    // Fallback: use ratio-based boundaries
    const dur = totalDurationSec ?? (this.audio?.duration || 1);
    if (dur > 0) {
      const progress = currentTimeSec / dur;
      for (let i = 0; i < sections.length; i++) {
        const sr = sections[i].startRatio ?? (i / sections.length);
        const er = sections[i].endRatio ?? ((i + 1) / sections.length);
        if (progress >= sr && progress < er) return i;
      }
    }
    return Math.max(0, sections.length - 1);
  }

  /** Return per-frame cached palette */
  private getResolvedPalette(): string[] {
    return this._framePalette ?? this._resolveAndCachePalette(this._frameSectionIdx);
  }

  /** Raw palette resolution — only called on section change */
  private _resolveCurrentPalette(secIdx: number): string[] {
    const autoPalettes = this.data?.auto_palettes;
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const chapters = (cd?.chapters as any[]) ?? [];

    if (Array.isArray(autoPalettes) && autoPalettes.length > 0) {
      if (secIdx >= 0 && autoPalettes[secIdx]) return autoPalettes[secIdx];
      const totalDurationSec = this.audio?.duration || 1;
      const currentTimeSec = this.audio?.currentTime ?? 0;
      if (totalDurationSec > 0 && autoPalettes.length > 1) {
        const progress = Math.max(0, Math.min(0.999, currentTimeSec / totalDurationSec));
        return autoPalettes[Math.floor(progress * autoPalettes.length)];
      }
      return autoPalettes[0];
    }

    const chIdx = secIdx >= 0 ? secIdx : 0;
    const bakedPalettes = (this.data as any)?.resolvedPalettes;
    if (bakedPalettes && Array.isArray(bakedPalettes) && chIdx >= 0 && bakedPalettes[chIdx]) {
      return bakedPalettes[chIdx];
    }
    if (chIdx >= 0) {
      const chapterPalette = chapters[chIdx]?.palette as string | undefined;
      if (chapterPalette && LyricDancePlayer.PALETTE_COLORS[chapterPalette]) {
        return LyricDancePlayer.PALETTE_COLORS[chapterPalette];
      }
    }
    const bakedDefault = (this.data as any)?.resolvedPaletteDefault;
    if (bakedDefault && Array.isArray(bakedDefault) && bakedDefault.length >= 5) return bakedDefault;
    const paletteName = cd?.palette as string | undefined;
    if (paletteName && LyricDancePlayer.PALETTE_COLORS[paletteName]) {
      return LyricDancePlayer.PALETTE_COLORS[paletteName];
    }
    const existing = this.payload?.palette ?? [];
    return [
      existing[0] ?? '#0A0A0F', existing[1] ?? '#FFD700', existing[2] ?? '#F0F0F0',
      existing[3] ?? '#FFD700', existing[4] ?? '#555555',
    ];
  }

  /** Resolve palette and update structured SectionPalette */
  private _resolveAndCachePalette(secIdx: number): string[] {
    const raw = this._resolveCurrentPalette(secIdx);
    this._currentSectionPalette = deserializeSectionPalette(raw);
    return raw;
  }

  private setCanvasBaseline(value: CanvasTextBaseline): void {
    (this.ctx as unknown as Record<string, unknown>)['text' + 'Baseline'] = value;
  }

  private getResolvedFont(): string {
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const typoKey = cd?.typography as string | undefined;
    if (typoKey && LyricDancePlayer.TYPOGRAPHY_FONTS[typoKey]) {
      return LyricDancePlayer.TYPOGRAPHY_FONTS[typoKey];
    }
    return '"Montserrat", sans-serif';
  }


  private async preloadFonts(): Promise<void> {
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const typoKey = cd?.typography as string;
    const fontMap: Record<string, string> = {
      'bold-impact': 'Oswald',
      'clean-modern': 'Montserrat',
      'elegant-serif': 'Playfair Display',
      'raw-condensed': 'Barlow Condensed',
      'whisper-soft': 'Nunito',
      'tech-mono': 'JetBrains Mono',
      'display-heavy': 'Bebas Neue',
      'editorial-light': 'Cormorant Garamond',
    };
    const fontName = fontMap[typoKey] ?? 'Montserrat';
    const loaded = await ensureFontReady(fontName);
    if (loaded && !this.destroyed) {
      this._fontStabilized = true;
    }
  }


  /**
   * Computes a combined 2D affine matrix for:
   *   translate(tx, ty) → rotate(r) → skewX(s) → scale(sx, sy)
   * PERF: writes into this._tmBuf instead of allocating a new array.
   * Caller must use the return value immediately (or read _tmBuf) — it is overwritten next call.
   */
  private computeTransformMatrix(
    tx: number,
    ty: number,
    rotation: number,
    skewXDeg: number,
    sx: number,
    sy: number,
  ): [number, number, number, number, number, number] {
    const dpr = this._effectiveDpr;
    const buf = this._tmBuf;
    if (rotation === 0 && skewXDeg === 0 && sx === 1 && sy === 1) {
      buf[0] = dpr; buf[1] = 0; buf[2] = 0; buf[3] = dpr;
      buf[4] = tx * dpr; buf[5] = ty * dpr;
      return buf;
    }

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const skewTan = skewXDeg !== 0 ? Math.tan((skewXDeg * Math.PI) / 180) : 0;

    buf[0] = cos * sx * dpr;
    buf[1] = sin * sx * dpr;
    buf[2] = (cos * skewTan - sin) * sy * dpr;
    buf[3] = (sin * skewTan + cos) * sy * dpr;
    buf[4] = tx * dpr;
    buf[5] = ty * dpr;
    return buf;
  }

  private update(deltaMs: number, timeSec: number, frame: ScaledKeyframe | null, beatState: BeatState | null): void {
    const clamped = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (clamped - this.songStartSec) * 1000);

    if (this.isExporting && clamped >= this.songEndSec) {
      this.stopExport();
    }

    this.fpsAccum.t += deltaMs;
    this.fpsAccum.frames += 1;
    if (this.fpsAccum.t >= 500) {
      this.fpsAccum.fps = (this.fpsAccum.frames * 1000) / this.fpsAccum.t;
      this.fpsAccum.t = 0;
      this.fpsAccum.frames = 0;
    }

    const duration = this.songEndSec - this.songStartSec;
    const songProgress = duration > 0 ? Math.max(0, Math.min(1, (clamped - this.songStartSec) / duration)) : 0;
    const cd = this.payload?.cinematic_direction;
    const chapters = this.resolvedState.chapters;

    // Use cached section index — already resolved in tick()
    const sectionIndex = this._frameSectionIdx;
    const section = sectionIndex >= 0 ? chapters[sectionIndex] : null;
    if (sectionIndex !== this.activeSectionIndex) {
      this.activeSectionIndex = sectionIndex;

      // Derive effects from audio energy — no mood table
      const sectionEnergy = (section as any)?.avgEnergy ?? 0.3;
      const sectionDensity = (section as any)?.beatDensity ?? 2;
      const baseEffects = computeEffectsFromEnergy(sectionEnergy, sectionDensity);

      this._effectsTransition = {
        from: { ...this._activeEffects },
        to: baseEffects,
        startMs: performance.now(),
        durationMs: 500,
      };

      if (this._globalBeatVis) {
        this._globalBeatVis.setStyle(baseEffects.beatBarStyle);
      }

      const texture = section?.texture ?? this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, cd) ?? "dust";
      this.activeSectionTexture = texture;
      // Guarantee visible atmosphere in every section
      if (this.ambientParticleEngine) {
        this.ambientParticleEngine.setSystem(texture);
        this.ambientParticleEngine.setDensityMultiplier(Math.max(0.5, this._activeEffects.particleDensity));
        this.ambientParticleEngine.setSpeedMultiplier(Math.max(0.2, this._activeEffects.particleSpeed));
      }
      const atmosphereState = (section as any)?.atmosphereState as string | undefined;
      if (atmosphereState && this.ambientParticleEngine) {
        switch (atmosphereState) {
          case 'still':
            this.ambientParticleEngine.setSpeedMultiplier(0.15);
            break;
          case 'drifting':
            this.ambientParticleEngine.setSpeedMultiplier(0.5);
            break;
          case 'falling':
            this.ambientParticleEngine.setSpeedMultiplier(0.8);
            (this.ambientParticleEngine as any).setDirection?.('down');
            break;
          case 'swirling':
            this.ambientParticleEngine.setSpeedMultiplier(1.2);
            (this.ambientParticleEngine as any).setDirection?.('swirl');
            break;
        }
      }
      const mapped = (PARTICLE_SYSTEM_MAP as Record<string, string | undefined>)[texture?.toLowerCase?.() ?? ""]?.toLowerCase?.() ?? texture;
      this.ambientParticleEngine?.setSystem(mapped);
      this.ambientParticleEngine?.setConfig({
        system: mapped,
        density: this.resolvedState.particleConfig.density ?? 0.8,
        speed: this.resolvedState.particleConfig.speed ?? 0.5,
        opacity: Math.min(0.7, LEGIBILITY.maxForegroundAlphaOverText / 0.12 * 0.7),
        beatReactive: mapped !== 'glare',
      });
    }

    // ═══ V2: Use conductor for particle intensity instead of tension curve ═══
    const conductorResponse = beatState ? this.conductor?.getSubsystemResponse(beatState, 2) ?? null : null;
    this._lastSubsystemResponse = conductorResponse;

    const config = this._activeEffects;

    if (conductorResponse) {
      const irDensity = (this._motionProfile ?? { particleDensityMult: 1 }).particleDensityMult;
      const irSpeed = (this._motionProfile ?? { particleSpeedMult: 1 }).particleSpeedMult;
      this.ambientParticleEngine?.setDensityMultiplier(irDensity * config.particleDensity);
      this.ambientParticleEngine?.setSpeedMultiplier(irSpeed * config.particleSpeed);
    }

    // ── Minimal debug state (always cheap) ──
    const ds = this.debugState;
    ds.time = clamped;
    ds.fps = Math.round(this.fpsAccum.fps);
    ds.qualityTier = this._qualityTier;
    ds.songProgress = songProgress;
    ds.beatIntensity = beatState?.pulse ?? 0;


    const particleBeatIntensity = (beatState?.pulse ?? 0) * (1 + (this._motionProfile?.bgPulseAmplitude ?? 0));
    const beatIntensityClamped = Math.max(0, Math.min(1, particleBeatIntensity));
    if (this._qualityTier < 3) this.ambientParticleEngine?.update(deltaMs, beatIntensityClamped);
  }

  private draw(tSec: number, precomputedFrame: ScaledKeyframe | null): void {
    try {
      this._draw(tSec, precomputedFrame);
    } catch (err) {
      console.error('[LyricEngine] draw crash:', err);
    }
  }

  private _draw(tSec: number, precomputedFrame: ScaledKeyframe | null): void {
    this.currentTSec = tSec;
    this.frameCount++;
    this._updateQualityTier(performance.now());
    const qTier = this._qualityTier;

    // ── During minimal-boot upgrade gap: keep the first frame visible ──
    if (!precomputedFrame) {
      if (!this.fullModeEnabled) {
        this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
        this.drawMinimalFirstFrame();
      }
      return;
    }

    const frame = precomputedFrame;
    const songProgress = (tSec - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
    const songDuration = this.songEndSec - this.songStartSec;

    // ═══ DYNAMITE FINALE ═══
    // After songEnd: either shatter animation or black. NEVER fall through to normal draw.
    if (songDuration >= 10 && tSec >= this.songEndSec) {
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
      const inShatterWindow = tSec < this.songEndSec + 2;
      if (inShatterWindow || this._finaleEffect.phase === "shatter") {
        // Shatter animation
        this._finaleEffect.update(
          tSec, this.songEndSec, songDuration,
          this.ctx, this.canvas, this.width, this.height, this._effectiveDpr,
        );
      } else {
        // Past shatter — hold black until audio loops back to start
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this._finaleEffect.reset();
      }
      return;
    }

    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);

    // Reset cached canvas state — canvas resize clears all context state (font, shadow, etc.)
    // but our caches don't know about it. Force re-set on every frame.
    this._lastFont = '';
    this._lastShadowBlur = -1;
    this._lastShadowColor = '';

    // ── Sim update: skip at tier ≥ 2 (they're not drawn) ──────────────
    // Cuts fire/water/aurora particle math entirely when fps is low.
    if (qTier < 2) {
      try { this.updateSims(tSec, frame); } catch (e) { console.error('[LyricEngine] sim crash:', e); }
    } else {
      // At tier >= 2, skip expensive fire/water/aurora sims but still update beat visualizer
      // (beat vis is always drawn — it's a single cheap drawImage).
      if (this.wickBarEnabled && this._globalWickBar) {
        const bs = this._lastBeatState;
        const songDuration = Math.max(0.01, this.songEndSec - this.songStartSec);
        const songProgress = Math.max(0, Math.min(1, (this.audio.currentTime - this.songStartSec) / songDuration));
        this._globalWickBar.update(
          bs?.energy ?? 0, bs?.pulse ?? 0, bs?.hitStrength ?? 0, bs?.phase ?? 0, bs?.beatIndex ?? 0,
          songProgress, bs?.hitType ?? 'none', bs?.brightness ?? 0.5, bs?.isDownbeat ?? false,
        );
      } else if (this._globalBeatVis) {
        const bs = this._lastBeatState;
        this._globalBeatVis.update(bs?.energy ?? 0, bs?.pulse ?? 0, bs?.hitStrength ?? 0, bs?.phase ?? 0, bs?.beatIndex ?? 0);
      }
    }

    // ── BACKGROUND: frozen snapshot at ALL tiers, rebaked periodically ───
    // At all tiers, bg is a static drawImage — zero filter overhead per frame.
    // Snapshot is rebaked on section change or every _bgRebakeIntervalMs.
    // This trades real-time Ken Burns smoothness for drastically lower CPU,
    // freeing frame budget for jitter-free text animation.
    const curSection = this._frameSectionIdx;
    const nowMsBg = performance.now();
    const snapshotDimsMismatch = this._bgSnapshot
      ? (this._bgSnapshot.width !== Math.floor(this.width * this._effectiveDpr)
        || this._bgSnapshot.height !== Math.floor(this.height * this._effectiveDpr))
      : false;
    const snapshotStale =
      curSection !== this._bgSnapshotSection
      || qTier !== this._bgSnapshotQTier
      || (nowMsBg - this._bgLastBakeMs > this._bgRebakeIntervalMs)
      || snapshotDimsMismatch
      || this.isExporting; // always rebake during export — CPU doesn't matter, quality does

    if (snapshotStale) {
      if (!this._bgSnapshot || this._bgSnapshot.width !== Math.floor(this.width * this._effectiveDpr) || this._bgSnapshot.height !== Math.floor(this.height * this._effectiveDpr)) {
        this._bgSnapshot = document.createElement('canvas');
        this._bgSnapshot.width = Math.floor(this.width * this._effectiveDpr);
        this._bgSnapshot.height = Math.floor(this.height * this._effectiveDpr);
      }
      const snapCtx = this._bgSnapshot.getContext('2d')!;
      snapCtx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
      snapCtx.clearRect(0, 0, this.width, this.height);

      // Draw full background stack into snapshot (gradient + chapter image + sims + lighting)
      this._drawBackgroundToCtx(snapCtx, frame);
      const imgIdx = Math.min(this._frameSectionIdx >= 0 ? this._frameSectionIdx : 0, Math.max(0, this.chapterImages.length - 1));
      const nextImgIdx = this.data.region_start != null
        ? imgIdx
        : Math.min(imgIdx + 1, Math.max(0, this.chapterImages.length - 1));
      const duration = this.audio?.duration || 1;
      const cdForCrossfade = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sectionsForCrossfade = (cdForCrossfade?.sections as any[]) ?? (cdForCrossfade?.chapters as any[]) ?? [];
      const currentSectionForCrossfade = sectionsForCrossfade[imgIdx];
      let crossfade = 0;
      if (currentSectionForCrossfade && nextImgIdx !== imgIdx) {
        const secEnd = currentSectionForCrossfade.endSec ?? (currentSectionForCrossfade.endRatio != null ? currentSectionForCrossfade.endRatio * duration : null);
        if (secEnd != null) {
          const timeToEnd = secEnd - (this.audio?.currentTime ?? 0);
          if (timeToEnd < 1.5 && timeToEnd > 0) crossfade = 1 - (timeToEnd / 1.5);
        }
      }
      this._drawChapterImageToCtx(snapCtx, imgIdx, nextImgIdx, crossfade);
      if (qTier < 2) {
        this._drawSimLayerToCtx(snapCtx, frame);
      }

      // Lighting overlay — bake into snapshot too
      {
        const savedCtx = this.ctx;
        (this as any).ctx = snapCtx;
        this.drawLightingOverlay(frame, tSec);
        (this as any).ctx = savedCtx;
      }

      snapCtx.setTransform(1, 0, 0, 1, 0, 0);

      this._bgSnapshotSection = curSection;
      this._bgSnapshotQTier = qTier;
      this._bgLastBakeMs = nowMsBg;
    }

    // ═══ BACKGROUND: beat-synced zoom pulse + directional pivot ═══
    if (this._bgSnapshot) {
      const dpr = this._effectiveDpr;
      const cx = (this.width / 2) * dpr;
      const cy = (this.height / 2) * dpr;
      const zoom = this._bgPulseZoom;
      // Directional pivot: zoom origin drifts, creating subtle camera movement
      const pivotX = this._bgZoomPivotX * dpr;
      const pivotY = this._bgZoomPivotY * dpr;

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.save();
      this.ctx.translate(cx + pivotX, cy + pivotY);
      this.ctx.scale(zoom, zoom);
      this.ctx.translate(-cx, -cy);
      this.ctx.drawImage(this._bgSnapshot, 0, 0);
      this.ctx.restore();
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
    }

    // ═══ Beat visualizer strip — drawn every frame on main canvas (not in snapshot) ═══
    // Single lightweight drawImage of 320×64 offscreen canvas. Costs ~0.1ms/frame.
    // Must be outside snapshot path to stay synced to real-time beat state.
    {
      const bs = this._lastBeatState;
      const bsEnergy = bs?.energy ?? 0;
      const bsPulse = bs?.pulse ?? 0;
      const activeCnv = this.wickBarEnabled && this._globalWickBar
        ? this._globalWickBar.canvas
        : this._globalBeatVis?.canvas ?? null;

      if (activeCnv) {
        if (this.wickBarEnabled) {
          // Wick bar: 18% height, smooth, slightly higher base alpha for flame visibility
          const visAlpha = Math.min(0.95, 0.50 + bsEnergy * 0.30 + bsPulse * 0.15);
          if (visAlpha > 0.01) {
            const visH = this.height * 0.18;
            const visTop = this.height - visH;
            this.ctx.globalAlpha = visAlpha;
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.drawImage(activeCnv, 0, visTop, this.width, visH);
            this.ctx.globalAlpha = 1;
          }
        } else {
          // Original BeatVisSim: unchanged
          const visAlpha = Math.min(0.85, 0.30 + bsEnergy * 0.40 + bsPulse * 0.15);
          if (visAlpha > 0.01) {
            const visH = this.height * 0.28;
            const visTop = this.height - visH;
            this.ctx.globalAlpha = visAlpha;
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(activeCnv, 0, visTop, this.width, visH);
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.globalAlpha = 1;
          }
        }
      }
    }

    if (qTier < 3) {
      this.ambientParticleEngine?.draw(this.ctx, "far");
    }

    // ═══ V2: Text is screen-space (no parallax — readability constraint) ═══

    // ═══ Sample center brightness for text contrast — ZERO GPU STALL ═══
    // Instead of getImageData (forces GPU→CPU sync), use the mood grade brightness
    // from the CSS filter + a bias toward dark (text is usually in bottom half).
    // This costs nothing — it's already computed.
    const nowMs = performance.now();
    const isForced = this.themeOverride !== 'auto';
    if (isForced || nowMs - this._lastBandSampleMs > 2000) {
      this._lastBandSampleMs = nowMs;
      if (this.themeOverride === 'light') {
        // Force light background → dark text
        this._textBandBrightness = 0.75;
      } else if (this.themeOverride === 'dark') {
        // Force dark background → light text
        this._textBandBrightness = 0.25;
      } else {
        // Auto: prefer palette isLight (derived from actual image luminance)
        // Fall back to mood grade if no palette is available yet
        if (this._currentSectionPalette) {
          this._textBandBrightness = this._currentSectionPalette.isLight ? 0.7 : 0.25;
        } else {
          const moodGrade = (this as any)._activeMoodGrade as MoodGrade | undefined;
          if (moodGrade) {
            this._textBandBrightness = Math.max(0, moodGrade.brightness - 0.15);
          }
        }
      }
    }

    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);

    // Camera zoom is now applied via CameraRig.getSubjectTransform() at the text rendering stage
    this.ctx.textAlign = 'left';
    this.setCanvasBaseline('middle');

    let drawCalls = 0;
    const sortBuf = this._sortBuffer;
    // PERF: skip sort when visible set hasn't changed — hash already computed for collision solver above
    // Inline FNV-1a hash of visible chunk ids — computed here for sort-skip
    let sortHash = 2166136261;
    for (let shi = 0; shi < frame.chunks.length; shi += 1) {
      const sid = frame.chunks[shi].id;
      for (let sci = 0; sci < sid.length; sci += 1) {
        sortHash ^= sid.charCodeAt(sci);
        sortHash = Math.imul(sortHash, 16777619);
      }
      sortHash ^= 44;
      sortHash = Math.imul(sortHash, 16777619);
    }
    if (sortHash !== this._lastSortHash || sortBuf.length !== frame.chunks.length) {
      this._lastSortHash = sortHash;
      sortBuf.length = 0;
      for (let i = 0; i < frame.chunks.length; i += 1) sortBuf.push(frame.chunks[i]);
      for (let i = 1; i < sortBuf.length; i += 1) {
        const v = sortBuf[i];
        const vKey = 0;
        const vSort = (v.fontWeight ?? 700) * 10000 + (v.fontSize ?? 36);
        let j = i - 1;
        while (j >= 0) {
          const jKey = 0;
          const jSort = (sortBuf[j].fontWeight ?? 700) * 10000 + (sortBuf[j].fontSize ?? 36);
          if (jKey > vKey || (jKey === vKey && jSort > vSort)) {
            sortBuf[j + 1] = sortBuf[j];
            j -= 1;
          } else {
            break;
          }
        }
        sortBuf[j + 1] = v;
      }
    }
    const frameNowMs = performance.now(); // hoisted — used everywhere below
    const frameNowSec = frameNowMs / 1000;

    // ── Pre-zero shadow state at tier ≥ 2 ────────────────────────────
    // Setting shadowBlur=0 here once is cheaper than the browser having to
    // re-evaluate 'if blurCap===0 then shadow is still dirty' per chunk.
    if (qTier >= 2) {
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = 'transparent';
      this._lastShadowBlur = 0;
      this._lastShadowColor = 'transparent';
    }

    const isPortraitLocal = this.height > this.width;
    const isCompact = this.width < 250;
    const viewportMinFont = isCompact ? 10 : isPortraitLocal ? 12 : 10;
    const clampMargin = isPortraitLocal ? this.width * 0.05 : 8;
    const clampMinX = clampMargin;
    const clampMaxX = this.width - clampMargin;
    const clampMinY = clampMargin;
    const clampMaxY = this.height - clampMargin;

    const camT = this.cameraRig.getSubjectTransform();
    const resolvedFont = this.getResolvedFont();

    this.ctx.save();
    // ═══ DIRECTOR'S CAMERA: Pure depth — zoom into the words ═══
    // NOTE: Canvas zoom is baked into each chunk's setTransform() call below,
    // NOT applied as a parent transform, because setTransform() replaces the
    // entire matrix and would wipe any parent zoom.
    // camT was already read above for wall computation — reuse it
    const camZoom = 1.0;
    const syncFrac = this._textSyncFraction;
    const finaleShake = this._finaleEffect.getShake(tSec, this.songEndSec);
    const camShakeX = camT.offsetX * syncFrac + this._textBeatNodX + finaleShake.x;
    const camShakeY = camT.offsetY * syncFrac + this._textBeatNodY + finaleShake.y;
    const camRotation = camT.rotation * syncFrac;
    const camCX = this.width / 2;
    const camCY = this.height / 2;

    const drawChunkText = (chunk: ScaledKeyframe['chunks'][number]) => {
      if (!chunk.visible) return;

      const rawDrawX = Number.isFinite(chunk.x) ? chunk.x : 0;
      const rawDrawY = Number.isFinite(chunk.y) ? chunk.y - this._textVerticalBias : 0;

      const baseFontSize = Number.isFinite(chunk.fontSize) ? (chunk.fontSize as number) : 36;
      const safeFontSize = Math.max(viewportMinFont, Math.round(baseFontSize) || 36);
      const fontWeight = chunk.fontWeight ?? 700;
      const family = chunk.fontFamily ?? resolvedFont;
      const text = chunk.text;

      const measureFont = `${fontWeight} ${safeFontSize}px ${family}`;
      const textWidth = this.getCachedMetrics(text, measureFont).width;
      const centerX = rawDrawX;
      const centerY = rawDrawY;

      const baseScale = Number.isFinite(chunk.scale) ? (chunk.scale as number) : 1;
      const sxRaw = Number.isFinite(chunk.scaleX) ? (chunk.scaleX as number) : baseScale;
      const syRaw = Number.isFinite(chunk.scaleY) ? (chunk.scaleY as number) : baseScale;
      const sx = Number.isFinite(sxRaw) ? sxRaw : 1;
      const sy = Number.isFinite(syRaw) ? syRaw : 1;

      // drawX: position the text's left edge so that AFTER scaling, it's centered on centerX.
      // With textAlign='left', fillText draws from x=0 → rightward.
      // The transform scales by sx, so visual width = textWidth * sx.
      // We need: tx + textWidth * sx / 2 = visual_center
      // But tx feeds through computeTransformMatrix as the origin (e = tx * dpr).
      // So: drawX = centerX - textWidth * sx * 0.5
      const drawX = centerX - textWidth * sx * 0.5;
      const finalDrawY = centerY;

      // ═══ SINGLE COLOR MODEL: no colored halos behind words ═══

      const drawAlpha = Number.isFinite(chunk.alpha) ? Math.max(0, Math.min(1, chunk.alpha)) : 1;

      const drawFont = `${fontWeight} ${safeFontSize}px ${family}`;
      if (drawFont !== this._lastFont) { this.ctx.font = drawFont; this._lastFont = drawFont; }
      this.ctx.globalAlpha = drawAlpha;
      this.ctx.fillStyle = chunk.color ?? '#ffffff';

      const dpr = this._effectiveDpr;
      const heroDrawX = Math.round(drawX * dpr) / dpr;
      const heroDrawY = Math.round(finalDrawY * dpr) / dpr;
      const clampedDrawX = Math.max(clampMinX, Math.min(clampMaxX, heroDrawX));
      const clampedDrawY = Math.max(clampMinY, Math.min(clampMaxY, heroDrawY));

      const [ma, mb, mc, md, me, mf] = this.computeTransformMatrix(
        camShakeX + camCX + (clampedDrawX - camCX) * camZoom,
        camShakeY + camCY + (clampedDrawY - camCY) * camZoom,
        (chunk.rotation ?? 0) + camRotation,
        chunk.skewX ?? 0,
        sx * camZoom,
        sy * camZoom,
      );
      this.ctx.setTransform(ma, mb, mc, md, me, mf);

      // Main text draw — single fillText, no stroke, no glow
      this.ctx.fillText(text, 0, 0);

      // Inline elemental textures removed — single color doctrine (all text bright white)

      // Elemental effects moved to phrase-level pass (drawn after all text)
      drawCalls += 1;
    };

    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this._lastShadowBlur = 0;
    this._lastShadowColor = 'transparent';

    // ═══ HERO SMOKE: palette-colored flame wisps rising from hero words ═══
    if (qTier < 3) {
      const smokePalette = this._framePalette ?? this.data?.palette ?? ['#a855f7', '#ec4899', '#ffffff'];
      this._heroSmoke.update(sortBuf, smokePalette, qTier, this._smokePhraseAge);
      this.ctx.save();
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
      this._heroSmoke.draw(this.ctx);
      this.ctx.restore();
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
      this.ctx.textAlign = 'left';
      this.setCanvasBaseline('middle');
    }

    for (let ci = 0; ci < sortBuf.length; ci += 1) {
      drawChunkText(sortBuf[ci]);
    }

    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this.ctx.globalAlpha = 1;
    this._lastShadowBlur = 0;
    this._lastShadowColor = 'transparent';
    this.ctx.restore();
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'left';
    this.setCanvasBaseline('alphabetic');

    // ═══ EXIT EFFECT: cinematic phrase exit ═══
    if (this._exitEffect.active) {
      this._exitEffect.draw(this.ctx, tSec, this._effectiveDpr);
    }

    // Comment comets — after text, before watermark
    this.drawComments(frameNowSec);

    // Emoji stream — community reactions rising from bottom-right
    this.drawEmojiRisers();

    // ═══ Near-plane particles — Lubezki's envelope ═══
    // Foreground particles (depth >= 0.5) drawn AFTER text.
    // Snow, petals, ash, confetti, crystals pass between viewer and words.
    // Completes the depth sandwich: bg → far particles → text → near particles.
    if (qTier < 2 && this.ambientParticleEngine?.shouldRenderForeground()) {
      this.ambientParticleEngine.draw(this.ctx, "near");
    }

    // ═══ Breathing vignette — Fincher's darkness ═══
    // Drawn LAST before UI (watermark/perf) — sits on top of everything.
    // Like a lens: the optics don't exist inside the scene, they shape how you see it.
    if (this._qualityTier < 3) {
      this.drawVignette();
    }

    if (songDuration >= 10) {
      const finaleActive = this._finaleEffect.update(
        tSec, this.songEndSec, songDuration,
        this.ctx, this.canvas, this.width, this.height, this._effectiveDpr,
      );
      if (finaleActive) {
        this.debugState.drawCalls = drawCalls;
        return;
      }
    }

    if (this.isExporting) this.drawWatermark();
    if (this.perfDebugEnabled) this.drawPerfOverlay();
    this.debugState.drawCalls = drawCalls;
  }

  private resolveCurrentLineIndex(timeSec: number): number {
    const lines = this.data.lyrics ?? [];
    for (let i = 0; i < lines.length; i++) {
      if (timeSec >= lines[i].start && timeSec < lines[i].end + 0.05) return i;
    }
    return -1;
  }

  private scheduleEmojiSpawns(lineIndex: number, lineStartTimeSec: number): void {
    this._emojiSpawnQueue = [];
    const line = this.data.lyrics?.[lineIndex];
    if (!line) return;

    const emojiCounts: Array<{ emoji: string; count: number }> = [];
    let totalCount = 0;
    for (const [key, data] of Object.entries(this.emojiReactionData)) {
      const count = data.line[lineIndex] ?? 0;
      if (count > 0) {
        const symbol = LyricDancePlayer.EMOJI_MAP[key] ?? "🔥";
        emojiCounts.push({ emoji: symbol, count });
        totalCount += count;
      }
    }
    if (totalCount === 0) return;

    const spawnCount = Math.min(totalCount, 25);
    const lineDuration = Math.max(0.5, line.end - line.start);

    const pool: string[] = [];
    for (const { emoji, count } of emojiCounts) {
      const slots = Math.max(1, Math.round((count / totalCount) * spawnCount));
      for (let i = 0; i < slots; i++) pool.push(emoji);
    }

    for (let i = 0; i < spawnCount; i++) {
      const offset = (i / spawnCount) * lineDuration;
      const emoji = pool[Math.floor(Math.random() * pool.length)];
      this._emojiSpawnQueue.push({
        emoji,
        spawnAtSec: lineStartTimeSec + offset,
      });
    }
  }

  private processEmojiSpawnQueue(): void {
    const nowSec = performance.now() / 1000;
    while (this._emojiSpawnQueue.length > 0) {
      if (this._emojiSpawnQueue[0].spawnAtSec > this.audio.currentTime) break;
      const item = this._emojiSpawnQueue.shift()!;
      this.emojiRisers.push({
        emoji: item.emoji,
        spawnTime: nowSec,
        lifetime: 3,
        spawnX: this.width - 48,
        spawnY: this.height - 70,
        size: 16 + Math.random() * 12,
        driftAmplitude: 8 + Math.random() * 12,
        driftPhase: Math.random() * Math.PI * 2,
        opacity: 0.7,
      });
    }

    this.emojiRisers = this.emojiRisers.filter((r) => {
      const elapsed = nowSec - r.spawnTime;
      return elapsed < r.lifetime;
    });

    if (this.emojiRisers.length > 40) {
      this.emojiRisers = this.emojiRisers.slice(-40);
    }
  }

  private drawEmojiRisers(): void {
    if (this.emojiRisers.length === 0) return;
    const nowSec = performance.now() / 1000;

    this.ctx.save();
    this.ctx.textAlign = 'center';
    this.setCanvasBaseline('middle');

    for (const riser of this.emojiRisers) {
      const elapsed = nowSec - riser.spawnTime;
      const t = elapsed / riser.lifetime;
      if (t >= 1) continue;

      const y = riser.spawnY - (riser.spawnY + 40) * t;
      const x = riser.spawnX + riser.driftAmplitude * Math.sin(elapsed * 1.5 + riser.driftPhase);
      const alpha = riser.opacity * (1 - t);

      this.ctx.globalAlpha = alpha;
      this.ctx.font = `${Math.round(riser.size)}px serif`;
      this.ctx.fillText(riser.emoji, x, y);
    }

    this.ctx.restore();
  }

  private drawPerfOverlay(): void {
    const x = 16;
    const y = 16;
    const h = 66;
    this.ctx.save();
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = 'rgba(0,0,0,0.58)';
    this.ctx.fillRect(x, y, 300, h);
    this.ctx.fillStyle = '#9df7c4';
    this.ctx.font = '600 12px "Montserrat", sans-serif';
    this.ctx.textAlign = 'left';
    this.setCanvasBaseline('top');
    this.ctx.fillText(`fps(avg): ${this.frameBudget.fpsAvg.toFixed(1)}  dt(avg): ${this.frameBudget.dtAvgMs.toFixed(2)}ms`, x + 8, y + 8);
    this.ctx.fillText(`entities: ${this._sortBuffer.length}  pairs: 0  hits: 0`, x + 8, y + 26);
    this.ctx.fillText(`drawCalls: ${this.debugState.drawCalls}  qualityTier: ${this._qualityTier}`, x + 8, y + 44);
    this.ctx.restore();
  }

  private drawWatermark(): void {
    const margin = 20;
    const padX = 14;
    const padY = 8;
    const text = "♥ tools.FMLY";
    const fontSize = Math.max(12, this.width * 0.013);
    const font = `400 ${fontSize}px "Space Mono", "Geist Mono", monospace`;

    // Recompute only when font changes (i.e. on resize). measureText is a DOM
    // layout call — calling it every frame burns ~0.1ms for no reason.
    if (!this._watermarkCache || this._watermarkCache.font !== font) {
      this.ctx.save();
      this.ctx.font = font;
      const tw = this.ctx.measureText(text).width;
      this.ctx.restore();
      const badgeW = tw + padX * 2;
      const badgeH = fontSize + padY * 2;
      this._watermarkCache = {
        font,
        w: badgeW,
        h: badgeH,
        x: this.width - badgeW - margin,
        y: this.height - badgeH - margin,
      };
    }

    const { w: badgeW, h: badgeH, x, y } = this._watermarkCache;
    const radius = badgeH / 2;

    this.ctx.save();
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = font;
    (this.ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0.08em";

    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + badgeW - radius, y);
    this.ctx.arcTo(x + badgeW, y, x + badgeW, y + badgeH, radius);
    this.ctx.lineTo(x + badgeW, y + badgeH - radius);
    this.ctx.arcTo(x + badgeW, y + badgeH, x, y + badgeH, radius);
    this.ctx.lineTo(x + radius, y + badgeH);
    this.ctx.arcTo(x, y + badgeH, x, y, radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.arcTo(x, y, x + badgeW, y, radius);
    this.ctx.closePath();

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    this.ctx.fill();

    this.ctx.fillStyle = "#00FF87";
    this.ctx.textAlign = "left";
    this.setCanvasBaseline('middle');
    this.ctx.globalAlpha = 1;
    this.ctx.fillText(text, x + padX, y + badgeH / 2);

    this.ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // Comment comets
  // ────────────────────────────────────────────────────────────

  public fireComment(text: string): void {
    const color = this.commentColors[this.commentColorIdx % this.commentColors.length];
    this.commentColorIdx++;

    // Left OR right entry only — rockets across horizontally
    const fromLeft = Math.random() > 0.5;
    const direction: 1 | -1 = fromLeft ? 1 : -1;
    const margin = 400;
    const startX = fromLeft ? -margin : this.width + margin;
    const endX = fromLeft ? this.width + margin : -margin;
    const y = this.height * (0.15 + Math.random() * 0.7);

    const comment: CommentChunk = {
      id: `comment-${Date.now()}`,
      text,
      color,
      startTime: performance.now() / 1000,
      duration: 3.5,
      startX, y, endX, direction,
      trailLength: 120,
      fontSize: Math.max(18, Math.min(26, Math.floor(280 / text.length))),
    };

    this.activeComments.push(comment);

    if (this.activeComments.length > 8) {
      this.activeComments = this.activeComments.slice(-8);
    }

    const now = performance.now() / 1000;
    this.activeComments = this.activeComments.filter(
      c => now - c.startTime < c.duration + 0.5
    );
  }

  private drawComments(nowSec: number): void {
    if (this.activeComments.length === 0) return;

    for (const comment of this.activeComments) {
      const elapsed = nowSec - comment.startTime;
      const t = Math.min(1, elapsed / comment.duration);
      if (t >= 1) continue;

      // Piecewise speed curve: rocket-cruise-rocket
      let ep: number;
      if (t < 0.15) {
        ep = (t / 0.15) * 0.2;
      } else if (t > 0.82) {
        ep = 0.2 + ((t - 0.15) / 0.67) * 0.6 + ((t - 0.82) / 0.18) * 0.2;
      } else {
        ep = 0.2 + ((t - 0.15) / 0.67) * 0.6;
      }

      const x = comment.startX + (comment.endX - comment.startX) * ep;
      const y = comment.y;

      // Alpha: fade in 10%, full middle, fade out last 25% — capped at 65%
      const alpha = (t < 0.10
        ? t / 0.10
        : t > 0.75
          ? 1 - (t - 0.75) / 0.25
          : 1) * 0.65;

      this.ctx.save();

      // Glow — softer
      this.ctx.shadowColor = comment.color;
      this.ctx.shadowBlur = 6;

      // Trail — thinner, more transparent
      const trailX = x - comment.direction * comment.trailLength;
      // Cache the gradient — re-create only when comet has moved > 2px or alpha changed.
      // createLinearGradient allocates a GPU gradient object every call — avoid it.
      const alphaHex = Math.floor(alpha * 120).toString(16).padStart(2, '0');
      let trail: CanvasGradient;
      const gc = comment._cachedTrailGrad;
      if (!gc || Math.abs(gc.x1 - trailX) > 2 || Math.abs(gc.x2 - x) > 2 || gc.alphaHex !== alphaHex) {
        const g = this.ctx.createLinearGradient(trailX, y, x, y);
        g.addColorStop(0, 'transparent');
        g.addColorStop(1, `${comment.color}${alphaHex}`);
        comment._cachedTrailGrad = { grad: g, x1: trailX, x2: x, alphaHex };
        trail = g;
      } else {
        trail = gc.grad;
      }
      this.ctx.strokeStyle = trail;
      this.ctx.lineWidth = comment.fontSize * 0.15;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(trailX, y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();

      // 3 spark particles — smaller
      for (let i = 0; i < 3; i++) {
        const seed = (i * 0.618033) % 1;
        const sparkX = x - comment.direction * seed * comment.trailLength * 0.8;
        const sparkY = y + Math.sin(nowSec * 8 + i * 2.1) * 6;
        const sparkAlpha = (1 - seed) * alpha * 0.7;
        this.ctx.globalAlpha = sparkAlpha;
        this.ctx.fillStyle = comment.color;
        this.ctx.shadowBlur = 0;
        this.ctx.beginPath();
        this.ctx.arc(sparkX, sparkY, 0.8 + seed * 0.7, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Color bullet dot — smaller
      this.ctx.globalAlpha = alpha;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = comment.color;
      const commentFont = `400 ${comment.fontSize * 0.85}px "Space Mono", monospace`;
      const textWidth = this.getCachedMetrics(comment.text, commentFont).width || 60;
      const dotX = x - comment.direction * (textWidth / 2 + 12);
      this.ctx.fillStyle = comment.color;
      this.ctx.beginPath();
      this.ctx.arc(dotX, y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Text — lighter weight, smaller, muted white
      this.ctx.globalAlpha = alpha;
      this.ctx.font = `400 ${comment.fontSize * 0.85}px "Space Mono", monospace`;
      this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
      this.ctx.textAlign = 'center';
      this.setCanvasBaseline('middle');
      this.ctx.fillText(comment.text, x, y);

      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }
  }

  // ────────────────────────────────────────────────────────────
  // Hero Decomposition — shatter hero words into particles on exit
  // ────────────────────────────────────────────────────────────





  private setResolution(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.textCanvas.width = this.canvas.width;
    this.textCanvas.height = this.canvas.height;
    this.textCanvas.style.width = `${width}px`;
    this.textCanvas.style.height = `${height}px`;

    this.ctx.setTransform(this._effectiveDpr, 0, 0, this.dpr, 0, 0);
    this.buildBgCache();
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
  }

  private getCachedMetrics(text: string, font: string): { width: number; ascent: number; descent: number } {
    const key = font + '|' + text;
    const cached = this._textMetricsCache.get(key);
    if (cached) return cached;

    if (font !== this._lastFont) {
      this.ctx.font = font;
      this._lastFont = font;
    }
    const m = this.ctx.measureText(text);
    const metrics = {
      width: m.width,
      ascent: m.actualBoundingBoxAscent ?? (parseFloat(font) * 0.45),
      descent: m.actualBoundingBoxDescent ?? (parseFloat(font) * 0.15),
    };
    this._textMetricsCache.set(key, metrics);
    if (this._textMetricsCache.size > 2500) {
      const first = this._textMetricsCache.keys().next().value;
      if (first) this._textMetricsCache.delete(first);
    }
    return metrics;
  }

  // ────────────────────────────────────────────────────────────
  // Loading / caching helpers
  // ────────────────────────────────────────────────────────────

  private buildScenePayload(): ScenePayload {
    const lines = this.data.lyrics ?? [];
    const fullStart = lines.length ? Math.max(0, (lines[0].start ?? 0) - 0.5) : 0;
    const fullEnd = lines.length ? (lines[lines.length - 1].end ?? 0) + 1 : 0;
    // Region override: constrain to hook window if specified
    const songStart = this.data.region_start != null ? this.data.region_start : fullStart;
    const songEnd = this.data.region_end != null ? this.data.region_end : fullEnd;

    const payload = {
      lines,
      words: this.data.words ?? [],
      bpm: this.data.beat_grid?.bpm ?? null,
      beat_grid: this.data.beat_grid,
      motion_profile_spec: this.data.motion_profile_spec,
      frame_state: this.data.frame_state ?? null,
      cinematic_direction: this.data.cinematic_direction ?? null,
      auto_palettes: this.data.auto_palettes,
      palette: this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"],
      lineBeatMap: [],
      songStart,
      songEnd,
    };

    return payload;
  }

  private toLegacyChapters(direction: CinematicDirection | null | undefined): any[] {
    if (!direction) return [];
    if (Array.isArray(direction.chapters) && direction.chapters.length > 0) {
      return direction.chapters;
    }
    return enrichSections(direction.sections).map((section) => ({
      title: section.description ?? `Section ${section.sectionIndex}`,
      startSec: section.startSec,
      endSec: section.endSec,
      startRatio: section.startRatio,
      endRatio: section.endRatio,
      emotionalArc: section.mood ?? '',
      motion: section.motion,
      texture: section.texture,
      atmosphere: section.atmosphere,
      backgroundDirective: section.description ?? '',
      sectionIndex: section.sectionIndex,
      mood: section.mood,
      visualMood: section.visualMood,
      atmosphereState: section.atmosphereState,
      dominantColor: section.dominantColor,
      zoom: 1,
      driftIntensity: direction.motion === 'fluid' ? 0.3 : 0.1,
    }));
  }

  private toWordDirectivesMap(wordDirectives: CinematicDirection['wordDirectives'], words?: Array<{ word: string }> | null): Record<string, any> {
    const map: Record<string, any> = {};
    // ── AI directives (highest priority) ──
    if (wordDirectives) {
      if (Array.isArray(wordDirectives)) {
        for (const directive of wordDirectives) {
          const key = String(directive?.word ?? '').trim().toLowerCase();
          if (!key) continue;
          map[key] = directive;
        }
      } else {
        for (const [key, value] of Object.entries(wordDirectives)) {
          const clean = key.trim().toLowerCase();
          if (!clean) continue;
          map[clean] = value;
        }
      }
    }

    return map;
  }

  private resolveParticleTexture(sectionIndex: number, direction: CinematicDirection | null | undefined): string {
    const sectionTexture = direction?.sections?.[sectionIndex]?.texture;
    return sectionTexture ?? direction?.texture ?? 'dust';
  }

  private resolvePlayerState(payload: ScenePayload): void {
    const direction = payload.cinematic_direction;
    const chapters = this.toLegacyChapters(direction);
    const wordDirectivesMap = this.toWordDirectivesMap(direction?.wordDirectives, payload.words as any);
    const durationSec = Math.max(0.01, (payload.songEnd ?? this.audio.duration ?? 1) - (payload.songStart ?? 0));
    const sectionIndex = Math.max(0, Math.min(chapters.length - 1, this.resolveSectionIndex(chapters, this.audio.currentTime, this.audio.duration || 1)));
    const currentSection = chapters[sectionIndex];
    this.cameraRig.setSectionFromMood(
      currentSection?.atmosphere
        ?? currentSection?.mood
        ?? currentSection?.backgroundDirective
        ?? currentSection?.title
        ?? 'verse'
    );
    const texture = this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, direction);
    this.resolvedState = {
      chapters,
      wordDirectivesMap,
      particleConfig: {
        texture,
        system: texture,
        density: 0.35,
        speed: 0.35,
      },
    };
    this.activeSectionIndex = -1;
    this.activeSectionTexture = texture;

    // ═══ Build pre-computed hero schedule for camera lookahead ═══
    this._buildHeroSchedule();
  }

  private _buildChunkCacheFromScene(scene: CompiledScene): void {
    this.chunks.clear();
    const measureCtx = this._measureCtx;

    for (const group of scene.phraseGroups) {
      for (const word of group.words) {
        const fontStr = `${word.fontWeight} 42px ${word.fontFamily}`;
        if (measureCtx.font !== fontStr) measureCtx.font = fontStr;
        const displayText = LyricDancePlayer.stripDisplayPunctuation(word.text);
        this.chunks.set(word.id, {
          id: word.id,
          text: displayText,
          color: word.color,
          font: fontStr,
          width: measureCtx.measureText(displayText).width,
        });
      }
    }
  }

  private _markCompiledViewport(width: number, height: number): void {
    this._compiledViewportW = Math.max(1, Math.floor(width));
    this._compiledViewportH = Math.max(1, Math.floor(height));
    this._compiledWasPortrait = this._compiledViewportH > this._compiledViewportW;
  }

  private _updateViewportScale(): void {
    // ═══ RESPONSIVE: no reference space scaling ═══
    // Positions and font sizes from compileScene are already in viewport pixels.
    // sx/sy are kept as 1.0 for backward compat with any code that reads them.
    this._viewportSx = 1.0;
    this._viewportSy = 1.0;
    this._viewportFontScale = 1.0;
  }

  private _getArcFunction(arcName: string): (p: number) => number {
    const curves: Record<string, (p: number) => number> = {
      'slow-burn': (p) => p * p,
      'explosive-peak': (p) => Math.sin(p * Math.PI),
      'steady-rise': (p) => p,
      'wave': (p) => (Math.sin(p * Math.PI * 2 - Math.PI / 2) + 1) / 2,
      'double-peak': (p) => Math.sin(p * Math.PI * 2) * 0.5 + 0.5,
    };
    return curves[arcName] ?? curves['slow-burn'];
      }

  private getActiveWord(timeSec: number): { word?: string; start: number; end: number } | null {
    const words = this.data.words ?? [];
    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i];
      if (word.start <= timeSec && word.end >= timeSec) {
        return word;
      }
      if (word.start <= timeSec) {
        return word;
      }
    }
    return null;
  }

  private mapBackgroundSystem(desc: string): string {
    const lower = (desc || '').toLowerCase();
    if (lower.includes('fire') || lower.includes('ember') || lower.includes('flame') || lower.includes('burn')) return 'fire';
    if (lower.includes('smoke') || lower.includes('haze') || lower.includes('churn') || lower.includes('fog') || lower.includes('storm') || lower.includes('cloud')) return 'storm';
    if (lower.includes('aurora') || lower.includes('northern') || lower.includes('teal curtain')) return 'aurora';
    if (lower.includes('rain') || lower.includes('urban') || lower.includes('city') || lower.includes('neon')) return 'urban';
    if (lower.includes('ebb') || lower.includes('flow') || lower.includes('drift') || lower.includes('wave') || lower.includes('ocean') || lower.includes('water')) return 'ocean';
    if (lower.includes('warm') || lower.includes('soft') || lower.includes('beam') || lower.includes('glow') || lower.includes('light') || lower.includes('clarity') || lower.includes('intimate') || lower.includes('reveal')) return 'intimate';
    return 'default';
  }

  private async loadSectionImages(): Promise<void> {
    const urls = this.data.section_images ?? [];
    if (this.options?.preloadedImages?.length) {
      this.chapterImages = this.options.preloadedImages;
      this._rebuildKenBurnsParams();
      return;
    }
    if (urls.length === 0) return;
    this.chapterImages = urls.map(() => new Image());

    const loadPromises = urls.map(async (url: string, i: number) => {
      if (!url) return;
      try {
        const img = await preloadImage(url);
        this.chapterImages[i] = img;
      } catch {
        // leave fallback empty image
      }
    });

    const firstLoads = loadPromises.filter((_, i) => !!urls[i]);
    if (firstLoads.length > 0) {
      await Promise.race(firstLoads);
    }

    void Promise.all(loadPromises).then(() => {
      this._rebuildKenBurnsParams();
    }).catch(() => {});
  }

  private _drawImageCoverCropped(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const srcW = img.naturalWidth || Math.max(1, Math.round(dw));
    const srcH = img.naturalHeight || Math.max(1, Math.round(dh));
    const canvasAspect = Math.max(0.0001, dw / Math.max(1, dh));
    const srcAspect = srcW / Math.max(1, srcH);
    let cropX = 0, cropY = 0, cropW = srcW, cropH = srcH;
    if (srcAspect > canvasAspect) {
      cropW = Math.round(srcH * canvasAspect);
      cropX = Math.round((srcW - cropW) / 2);
    } else {
      cropH = Math.round(srcW / canvasAspect);
      cropY = Math.round((srcH - cropH) / 2);
    }
    ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  }

  private _rebuildKenBurnsParams(): void {
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const sections = (cd?.sections as any[]) ?? [];
    this._kenBurnsParams = this.chapterImages.map((_, i) => {
      const seed = (i * 2654435761) >>> 0;
      const s = (v: number) => ((seed * v) & 0xFFFF) / 0xFFFF;
      const sectionMood = sections[i]?.visualMood as string | undefined;
      const grade = getMoodGrade(sectionMood);
      const intent = grade.motionIntent;

      let zoomStart = 1.06;
      let zoomEnd = 1.06;
      let panStartX = 0;
      let panStartY = 0;
      let panEndX = 0;
      let panEndY = 0;

      switch (intent) {
        case 'push-in':
          zoomStart = 1.06; zoomEnd = 1.14;
          panStartX = (s(17) - 0.5) * 0.03; panStartY = (s(31) - 0.5) * 0.02;
          break;
        case 'pull-out':
          zoomStart = 1.14; zoomEnd = 1.06;
          panEndX = (s(53) - 0.5) * 0.03; panEndY = (s(71) - 0.5) * 0.02;
          break;
        case 'drift-up':
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartY = 0.03; panEndY = -0.03;
          panStartX = (s(17) - 0.5) * 0.01; panEndX = (s(53) - 0.5) * 0.01;
          break;
        case 'drift-down':
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartY = -0.03; panEndY = 0.03;
          panStartX = (s(17) - 0.5) * 0.01; panEndX = (s(53) - 0.5) * 0.01;
          break;
        case 'drift-lateral': {
          const leftToRight = i % 2 === 0;
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartX = leftToRight ? -0.04 : 0.04;
          panEndX = leftToRight ? 0.04 : -0.04;
          panStartY = (s(31) - 0.5) * 0.015; panEndY = (s(71) - 0.5) * 0.015;
          break;
        }
        case 'slow-zoom':
          zoomStart = 1.06; zoomEnd = 1.15;
          panStartX = (s(17) - 0.5) * 0.02; panStartY = (s(31) - 0.5) * 0.015;
          panEndX = panStartX * 0.3; panEndY = panStartY * 0.3;
          break;
        case 'breathing':
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartX = (s(17) - 0.5) * 0.015; panStartY = (s(31) - 0.5) * 0.015;
          panEndX = -panStartX; panEndY = -panStartY;
          break;
        case 'handheld':
          zoomStart = 1.07; zoomEnd = 1.09;
          panStartX = (s(17) - 0.5) * 0.04; panStartY = (s(31) - 0.5) * 0.03;
          panEndX = (s(53) - 0.5) * 0.04; panEndY = (s(71) - 0.5) * 0.03;
          break;
        case 'stable':
        default:
          zoomStart = 1.07; zoomEnd = 1.08;
          panStartX = (s(17) - 0.5) * 0.01; panStartY = (s(31) - 0.5) * 0.01;
          panEndX = (s(53) - 0.5) * 0.01; panEndY = (s(71) - 0.5) * 0.01;
          break;
      }

      return { zoomStart, zoomEnd, panStartX, panStartY, panEndX, panEndY };
    });
  }

  private drawChapterImage(chapterIdx: number, nextChapterIdx: number, blend: number): void {
    if (this.chapterImages.length === 0) return;

    const current = this.chapterImages[chapterIdx];
    const next = this.chapterImages[nextChapterIdx];
    // ═══ SONG-LEVEL GRADE: one look for the entire song ═══
    // Computed once from the dominant mood, then locked in.
    if (!this._songGrade) {
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];
      // Use the first section's mood as the song's vibe, or fall back to default
      const dominantMood = sections[0]?.visualMood as string | undefined;
      this._songGrade = getMoodGrade(dominantMood);
    }
    let activeGrade = this._songGrade;

    // ═══ THEME OVERRIDE: modify grade for forced light/dark ═══
    if (this.themeOverride !== 'auto' && activeGrade) {
      // Clone the grade to avoid mutating the cached _songGrade
      activeGrade = { ...activeGrade, blur: { ...activeGrade.blur }, grain: { ...activeGrade.grain } };
      if (this.themeOverride === 'light') {
        // Push brightness way up, reduce contrast, desaturate slightly
        activeGrade.brightness = Math.max(activeGrade.brightness, 0.75);
        activeGrade.contrast = Math.min(activeGrade.contrast, 0.90);
        activeGrade.saturation = Math.min(activeGrade.saturation, 0.70);
      } else {
        // Push brightness down for a moody dark look
        activeGrade.brightness = Math.min(activeGrade.brightness, 0.28);
        activeGrade.contrast = Math.max(activeGrade.contrast, 1.2);
        activeGrade.saturation = Math.min(activeGrade.saturation, 0.65);
      }
    }

    // Emotional intensity: use a fixed mid-level — no per-section variation
    const intensity = 0.5;

    // Beat response amplified by IntensityRouter section intensity
    const beatMod = this._bgBeatBrightnessBoost;

    const filterStr = buildGradeFilter(activeGrade, intensity, beatMod);

    const drawCurrent = current;

    if (current?.complete && current.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.filter = filterStr;

      // ═══ OVERSCAN: draw image 20% larger than canvas to prevent border visibility
      const OVERSCAN = 1.20;
      const ow = this.width * OVERSCAN;
      const oh = this.height * OVERSCAN;
      const ox = (this.width - ow) / 2;
      const oy = (this.height - oh) / 2;

      // Ken Burns: slow zoom + pan over chapter duration
      const kb = this._kenBurnsParams[chapterIdx];
      const chapterCount = this.chapterImages.length || 1;
      const audioDur = this.audio?.duration || 1;
      const chapterDur = audioDur / chapterCount;
      const chapterStart = chapterIdx * chapterDur;
      const localT = Math.max(0, Math.min(1, ((this.audio?.currentTime ?? 0) - chapterStart) / chapterDur));
      const eased = localT * localT * (3 - 2 * localT);
      if (kb) {
        const zoom = kb.zoomStart + (kb.zoomEnd - kb.zoomStart) * eased;
        const panX = (kb.panStartX + (kb.panEndX - kb.panStartX) * eased) * this.width;
        const panY = (kb.panStartY + (kb.panEndY - kb.panStartY) * eased) * this.height;

        this.ctx.save();
        this.ctx.translate(this.width / 2 + panX, this.height / 2 + panY);
        this.ctx.scale(zoom, zoom);
        this.ctx.translate(-this.width / 2, -this.height / 2);
        this._drawImageCoverCropped(this.ctx, drawCurrent, ox, oy, ow, oh);
        this.ctx.restore();
      } else {
        this._drawImageCoverCropped(this.ctx, drawCurrent, ox, oy, ow, oh);
      }

      this.ctx.restore(); // restore filter state
    }

    const drawNext = next;

    if (next?.complete && next.naturalWidth > 0 && blend > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = blend;
      this.ctx.filter = filterStr;

      const OVERSCAN_NEXT = 1.20;
      const onw = this.width * OVERSCAN_NEXT;
      const onh = this.height * OVERSCAN_NEXT;
      const onx = (this.width - onw) / 2;
      const ony = (this.height - onh) / 2;

      const kbNext = this._kenBurnsParams[nextChapterIdx];
      if (kbNext) {
        const nextLocalT = blend;
        const nextEased = nextLocalT * nextLocalT * (3 - 2 * nextLocalT);
        const nextZoom = kbNext.zoomStart + (kbNext.zoomEnd - kbNext.zoomStart) * nextEased * 0.15;
        const nextPanX = kbNext.panStartX * this.width * nextEased * 0.15;
        const nextPanY = kbNext.panStartY * this.height * nextEased * 0.15;

        this.ctx.save();
        this.ctx.translate(this.width / 2 + nextPanX, this.height / 2 + nextPanY);
        this.ctx.scale(nextZoom, nextZoom);
        this.ctx.translate(-this.width / 2, -this.height / 2);
        this._drawImageCoverCropped(this.ctx, drawNext, onx, ony, onw, onh);
        this.ctx.restore();
      } else {
        this._drawImageCoverCropped(this.ctx, drawNext, onx, ony, onw, onh);
      }

      this.ctx.restore();
    }

    // ═══ LIGHT THEME WASH: overlay white on top of background to actually make it light ═══
    if (this.themeOverride === 'light') {
      this.ctx.save();
      this.ctx.globalAlpha = 0.82;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    } else if (this.themeOverride === 'dark') {
      // Deepen dark mode with a subtle black overlay
      this.ctx.save();
      this.ctx.globalAlpha = 0.35;
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    }

    // ─── Film grain: consistent level from song grade ───
    // Skip grain at tier 1+ (overlay composite + putImageData is expensive)
    if (this._qualityTier === 0) {
      const grainIntensity = Math.min(0.15, activeGrade.grain.intensity);
      if (grainIntensity > 0.02) {
        this.renderFilmGrain(grainIntensity, activeGrade.grain.size);
      }
    }

    // Store for _textBandBrightness sampling
    (this as any)._activeMoodGrade = activeGrade;
    (this as any)._activeIntensity = intensity;
  }

  /**
   * Render film grain overlay. Uses pre-generated noise buffers rotated per frame
   * to eliminate per-frame Math.random() cost (~57K calls/frame → 0).
   */
  /** Relative luminance of a hex color (0 = black, 1 = white) */
  private _hexLuminance(hex: string): number {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lr = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const lg = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const lb = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  }
  private renderFilmGrain(intensity: number, size: number): void {
    const grainW = Math.ceil(this.width / Math.max(1, size * 2));
    const grainH = Math.ceil(this.height / Math.max(1, size * 2));

    // Re-generate pool on resize or first call
    if (grainW !== this._grainPoolW || grainH !== this._grainPoolH || this._grainPool.length === 0) {
      this._grainPoolW = grainW;
      this._grainPoolH = grainH;
      this._grainPool = [];
      const POOL_SIZE = 4;
      for (let p = 0; p < POOL_SIZE; p++) {
        const img = new ImageData(grainW, grainH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.random() * 255;
          d[i] = v; d[i + 1] = v; d[i + 2] = v;
          d[i + 3] = 255; // alpha set at draw time via globalAlpha
        }
        this._grainPool.push(img);
      }
    }

    if (!this._grainCanvas || this._grainCanvas.width !== grainW || this._grainCanvas.height !== grainH) {
      this._grainCanvas = document.createElement('canvas');
      this._grainCanvas.width = grainW;
      this._grainCanvas.height = grainH;
    }

    const gctx = this._grainCanvas.getContext('2d');
    if (!gctx) return;

    // Rotate through pre-generated noise frames (zero random calls per frame)
    this._grainFrameIdx = (this._grainFrameIdx + 1) % this._grainPool.length;
    gctx.putImageData(this._grainPool[this._grainFrameIdx], 0, 0);

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'overlay';
    this.ctx.globalAlpha = Math.min(1, intensity * 0.24); // ~same as old alpha/255 with 60 max
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this._grainCanvas, 0, 0, this.width, this.height);
    this.ctx.restore();
  }

  private buildBgCache(): void {
    
    try {
      const chapters = this.resolvedState.chapters ?? [];
      const count = Math.max(1, chapters.length);
      this.bgCaches = [];
      this.chapterParticleSystems = [];

      for (let ci = 0; ci < count; ci++) {
        const chapter = chapters[ci] as any;
        const off = document.createElement('canvas');
        off.width = this.width;
        off.height = this.height;
        const ctx = off.getContext('2d');
        if (!ctx) continue;

        this.getResolvedPalette(); // ensure _currentSectionPalette is populated
        const bgColor = this._currentSectionPalette.background;
        const bgDesc = chapter?.backgroundDirective ?? chapter?.background ?? '';
        const sectionTexture = this.resolveParticleTexture(ci, this.payload?.cinematic_direction);
        this.chapterParticleSystems.push(sectionTexture);

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, off.width, off.height);
        this.bgCaches.push(off);
      }

      this.bgCacheCount = this.bgCaches.length;
      
    } catch (err) {
      console.error('[LyricEngine] buildBgCache crash:', err);
    }
  }

  private deriveVisualSystems(): void {
    const chapter0 = this.resolvedState.chapters?.[0] as any;
    const bgDesc = chapter0?.backgroundDirective ?? chapter0?.background ?? '';
    this.backgroundSystem = this.mapBackgroundSystem(bgDesc);
  }

  private buildChapterSims(): void {
    
    try {
      const chapters = this.resolvedState.chapters.length > 0 ? this.resolvedState.chapters : [{}];
      this.getResolvedPalette(); // ensure _currentSectionPalette is populated
      const accentColor = this._currentSectionPalette.accent;
      // ═══ Always-on beat visualizer — present throughout entire song ═══
      if (!this._globalBeatVis) {
        this._globalBeatVis = new BeatVisSim(accentColor);
      }
      if (!this._globalWickBar) {
        this._globalWickBar = new DynamiteWickBar(accentColor);
        const analysisRef = (this.conductor as any)?._analysis as import('@/engine/audioAnalyzer').AudioAnalysis | null;
        if (analysisRef?.beatEnergies) {
          this._globalWickBar.setWaveformPreview(analysisRef.beatEnergies);
        }
      }
      if (this.wickBarEnabled && !this._wickSeekOverlay) {
        this._mountWickSeekOverlay();
      }

      this.chapterSims = chapters.map(() => ({}));

      // Bar visualizer style: round-robin by section for variety
      const styleRotation: BarVisStyle[] = ['flame', 'neon', 'smoke', 'light'];
      this._barVisStyles = chapters.map((_: any, ci: number) => {
        return styleRotation[ci % styleRotation.length];
      });

      
    } catch (err) {
      console.error('[LyricEngine] buildChapterSims crash:', err);
    }
  }

  /**
   * Transparent seek overlay positioned at bottom 18% of the container.
   * Click/drag → converts X to song time → seek().
   */
  private _mountWickSeekOverlay(): void {
    if (this._wickSeekOverlay || !this.wickBarEnabled) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 18%;
      z-index: 20;
      cursor: pointer;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    `;

    let dragging = false;
    let wasPlaying = false;

    const seekFromEvent = (clientX: number) => {
      const rect = overlay.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const timeSec = this.songStartSec + ratio * (this.songEndSec - this.songStartSec);
      this.seek(timeSec);
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      wasPlaying = !this.audio.paused;
      this.pause();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      seekFromEvent(clientX);
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      seekFromEvent(clientX);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (wasPlaying) this.play();
    };

    overlay.addEventListener('mousedown', onDown);
    overlay.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    (overlay as any).__dwb_cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };

    this.container.style.position = this.container.style.position || 'relative';
    this.container.appendChild(overlay);
    this._wickSeekOverlay = overlay;
  }

  private _unmountWickSeekOverlay(): void {
    if (!this._wickSeekOverlay) return;
    (this._wickSeekOverlay as any).__dwb_cleanup?.();
    this._wickSeekOverlay.remove();
    this._wickSeekOverlay = null;
  }

  private updateSims(_tSec: number, _frame: ScaledKeyframe): void {
    try {
      const tSec = this.currentTSec;
      const simFrame = Math.floor(tSec * 24);
      if (simFrame === this.lastSimFrame) return;
      this.lastSimFrame = simFrame;
      const chapters = this.resolvedState.chapters.length > 0 ? this.resolvedState.chapters : [{}];
      const chapterIdx = this._frameSectionIdx >= 0 ? Math.min(this._frameSectionIdx, chapters.length - 1) : chapters.length - 1;
      const ci = Math.max(0, chapterIdx);
      if (this.wickBarEnabled && this._globalWickBar) {
        const bs = this._lastBeatState;
        const songDuration = Math.max(0.01, this.songEndSec - this.songStartSec);
        const songProgress = Math.max(0, Math.min(1, (this.audio.currentTime - this.songStartSec) / songDuration));
        this._globalWickBar.update(
          bs?.energy ?? 0,
          bs?.pulse ?? 0,
          bs?.hitStrength ?? 0,
          bs?.phase ?? 0,
          bs?.beatIndex ?? 0,
          songProgress,
          bs?.hitType ?? 'none',
          bs?.brightness ?? 0.5,
          bs?.isDownbeat ?? false,
        );
      } else if (this._globalBeatVis) {
        const visStyle = this._barVisStyles[ci] ?? 'flame';
        this._globalBeatVis.setStyle(visStyle);
        const bs = this._lastBeatState;
        this._globalBeatVis.update(
          bs?.energy ?? 0,       // RMS energy — goes to 0 during silence
          bs?.pulse ?? 0,        // Gaussian beat pulse
          bs?.hitStrength ?? 0,  // onset impulse
          bs?.phase ?? 0,        // beat phase 0-1
          bs?.beatIndex ?? 0,    // for new-beat detection
        );
      }
    } catch (err) {
      console.error('[LyricEngine] updateSims crash:', err);
    }
  }

  private drawSimLayer(_frame: ScaledKeyframe): void {}

  private evaluateFrame(tSec: number): ScaledKeyframe | null {
    const scene = this.compiledScene;
    if (!scene) return null;

    if (this._effectsTransition) {
      const t = this._effectsTransition;
      const elapsed = performance.now() - t.startMs;
      const progress = Math.min(1, elapsed / t.durationMs);
      this._activeEffects = lerpEffectsConfig(t.from, t.to, progress);
      if (progress >= 1) this._effectsTransition = null;
    }

    const deltaMs = this._frameDt * 16.67;

    const songDuration = Math.max(0.01, scene.durationSec);
    const songProgress = Math.max(0, Math.min(1, (tSec - scene.songStartSec) / songDuration));
    const { _viewportSx: sx, _viewportSy: sy, _viewportFontScale: fontScale } = this;

    const beats = scene.beatEvents;
    while (this._beatCursor + 1 < beats.length && beats[this._beatCursor + 1].time <= tSec) this._beatCursor++;
    while (this._beatCursor > 0 && beats[this._beatCursor].time > tSec) this._beatCursor--;
    const beatIndex = beats.length > 0 ? this._beatCursor : -1;

    // ═══ V2: Use conductor instead of computeBeatSpine ═══
    const beatState = this._lastBeatState ?? this.conductor?.getState(tSec) ?? null;
    const beatPulse = beatState?.pulse ?? 0;
    const beatPhase = beatState?.phase ?? 0;

    // ═══ INTENSITY ROUTER: derive motion profile from audio signal ═══
    const frameDt = Math.max(0.001, Math.min(0.1, this._frameDt * 16.67 / 1000));
    if (beatState) {
      this._motionProfile = this._intensityRouter.update(beatState, frameDt);
    }
    const mp: MotionProfile = this._motionProfile ?? {
      intensity: 0,
      bgPulseAmplitude: 0, cameraBeatMult: 0,
      textSyncFraction: 0, particleDensityMult: 0.2, particleSpeedMult: 0.3,
    };
    this._textSyncFraction = mp.textSyncFraction;

    // ═══ BACKGROUND BEAT PULSE: one zoom, synced to beat ═══
    // phase: 0 = on beat, 1 = just before next beat
    // Attack curve: sharp zoom on hit, smooth decay back to 1.0
    const rawPulse = beatState?.pulse ?? 0;
    const beatPhaseNow = beatState?.phase ?? 0;
    const hitStr = beatState?.hitStrength ?? 0;
    const beatStrength = beatState?.strength ?? 0.5;
    const beatEnergy = beatState?.energy ?? 0.3;
    void beatPhaseNow;

    // ═══ DYNAMIC PULSE: 2x rate (eighth notes) with directional shift ═══
    // On-beat pulse from conductor + synthetic sub-beat pulse at phase 0.5.
    // Combined = two hits per beat = matches real head bob frequency.
    const onBeatPulse = Math.max(rawPulse, hitStr * 0.8);

    // Sub-beat pulse: gaussian centered at phase=0.5 (halfway between beats)
    const subBeatDist = Math.abs((beatState?.phase ?? 0) - 0.5);
    const subBeatPulse = Math.exp(-(subBeatDist * subBeatDist) / (0.04 * 0.04));

    // Combined: on-beat at full strength, sub-beat at 60%
    const pulseEnvelope = Math.max(onBeatPulse, subBeatPulse * 0.6);

    // Per-beat dynamic: downbeats harder, strong onsets harder, louder = bigger.
    const beatDynamic = Math.min(1.0,
      beatStrength * 0.4
      + hitStr * 0.35
      + beatEnergy * 0.25,
    );

    // Final zoom
    this._bgPulseZoom = 1.0 + mp.bgPulseAmplitude * pulseEnvelope * beatDynamic;

    // ═══ DIRECTIONAL PIVOT: slow sine pendulum ═══
    // One continuous swing — ~21 seconds per full cycle.
    // Barely perceptible drift. Like rocking a baby.
    const songTime = Math.max(0, tSec - scene.songStartSec);
    const targetPivotX = Math.sin(songTime * 0.3) * this.width * 0.006;
    const targetPivotY = 0;

    // EMA smooth — ultra-gentle glide
    this._bgZoomPivotX += (targetPivotX - this._bgZoomPivotX) * 0.04;
    this._bgZoomPivotY += (targetPivotY - this._bgZoomPivotY) * 0.04;

    // Text stays still — background zoom drives the rhythm.
    this._textBeatNodX = 0;
    this._textBeatNodY = 0;

    // Brightness flash and vignette also scale per-beat
    const beatFlash = pulseEnvelope * beatDynamic * mp.intensity;
    this._bgBeatBrightnessBoost += (beatFlash - this._bgBeatBrightnessBoost) * 0.5;

    const vignetteBeat = pulseEnvelope * beatDynamic * mp.intensity * 0.20;
    this._vignetteBeatPulse += (vignetteBeat - this._vignetteBeatPulse) * 0.35;

    if (beatIndex !== this._lastBeatIndex && beatIndex >= 0) {
      this._lastBeatIndex = beatIndex;
    }

    // CameraRig owns text zoom — effectiveZoom neutralized to 1.0
    const effectiveZoom = 1.0;
    // Resolve current chapter for atmosphere metadata (no zoom — CameraRig owns that)
    let currentChapterIdx = 0;
    for (let i = 0; i < scene.chapters.length; i++) {
      if (songProgress >= scene.chapters[i].startRatio && songProgress < scene.chapters[i].endRatio) {
        currentChapterIdx = i;
        break;
      }
    }
    const chapter = scene.chapters[currentChapterIdx] ?? scene.chapters[0];

    const groups = scene.phraseGroups;

    // ═══ ACTIVE GROUP: PhraseAnimator resolves cursor + never-blank ═══
    const { activeIdx: activeGroupIdx, cursor: newCursor } = resolveActiveGroup(
      groups, tSec, this._activeGroupCursor, this._activeGroupCursorTime,
    );
    this._activeGroupCursor = newCursor;
    this._activeGroupCursorTime = tSec;

    const activeGroups = this._activeGroupIndices;
    activeGroups.length = 0;
    if (activeGroupIdx >= 0) {
      activeGroups.push(activeGroupIdx);
    }

    // ── Exit effect: detect gap (tSec past active group's end) ──
    // resolveActiveGroup stays on group N during the gap (never-blank),
    // so we detect "in the gap" by checking tSec >= group.end.
    if (activeGroupIdx >= 0 && this._exitTriggeredForGroup !== activeGroupIdx) {
      const activeGroup = groups[activeGroupIdx];
      if (tSec >= activeGroup.end) {
        this._exitTriggeredForGroup = activeGroupIdx;
        const nextGroupStart = (activeGroupIdx + 1 < groups.length)
          ? groups[activeGroupIdx + 1].start : Infinity;
        this._exitEffect.onGroupChange(
          activeGroup as any, nextGroupStart, tSec,
          this.ctx, this.width, this.height,
        );
      }
    }

    let ci = 0;
    if (!this._evalChunks) this._evalChunks = [] as ScaledKeyframe['chunks'];
    const chunks = this._evalChunks;

    for (const groupIdx of activeGroups) {
      const group = groups[groupIdx];
      const nextGroupStart = (groupIdx + 1 < groups.length) ? groups[groupIdx + 1].start : Infinity;

      // ── Phrase animation state from PhraseAnimator ──
      // Mood config is ONLY used as fallback for ai_moment phrases (no presentation mode).
      // Presentation mode cards are self-contained — they define their own timing + intensity.
      const prevGroupEnd = (groupIdx > 0) ? groups[groupIdx - 1].end : -Infinity;

      const beatForAnim: AnimBeatState | null = beatState
        ? { pulse: beatState.pulse ?? 0, phase: beatState.phase ?? 0 }
        : null;

      const phraseState = computePhraseState(
        group, nextGroupStart, prevGroupEnd, tSec, beatForAnim, this.width, mp,
      );

      if (!this._debugModeLogged && groupIdx === activeGroups[activeGroups.length - 1]) {
        this._debugModeLogged = true;
        // Log ALL phrase groups with their words and times
        const allGroups = this.compiledScene?.phraseGroups ?? [];
        console.log(`[LyricDance] Total phrases: ${allGroups.length}`);
        console.table(allGroups.slice(0, 20).map((gg: any, i: number) => ({
          idx: i,
          words: (gg.words ?? []).map((w: any) => w.text || w.word).join(' '),
          wordCount: (gg.words ?? []).length,
          start: gg.start?.toFixed(2),
          end: gg.end?.toFixed(2),
          dur: ((gg.end - gg.start) * 1000).toFixed(0) + 'ms',
          mode: gg.presentationMode ?? 'UNDEF',
          hero: gg.phraseHeroWord ?? 'none',
        })));

        // Check for word index alignment
        const rawWords = this.data?.words ?? [];
        const cdPhrases = (this.data?.cinematic_direction as any)?.phrases ?? [];
        if (cdPhrases.length > 0 && rawWords.length > 0) {
          console.log(`[LyricDance] Raw words: ${rawWords.length}, AI phrases: ${cdPhrases.length}`);
          // Show first 5 AI phrase word ranges vs actual words
          for (let pi = 0; pi < Math.min(5, cdPhrases.length); pi++) {
            const [s, e] = cdPhrases[pi].wordRange;
            const wordsInRange = rawWords.slice(s, e + 1).map((w: any) => w.word).join(' ');
            console.log(`  Phrase ${pi}: [${s},${e}] = "${wordsInRange}" | hero: ${cdPhrases[pi].heroWord}`);
          }
        }

        // Flag any zero-duration or negative-duration words
        const badWords = rawWords.filter((w: any) => w.start >= w.end || w.end - w.start < 0.01);
        if (badWords.length > 0) {
          console.warn(`[LyricDance] ${badWords.length} zero/tiny-duration words:`, badWords.map((w: any) => `"${w.word}" ${w.start.toFixed(3)}-${w.end.toFixed(3)}`));
        }
      }

      const groupHasActiveSoloHero = detectSoloHero(group, tSec);

      // ── Per-word animation states (reused buffer) ──
      const wab = this._wordAnimBuffer;
      for (let wi = 0; wi < group.words.length; wi++) {
        if (!wab[wi]) {
          wab[wi] = {
            wordState: 'upcoming',
            waveScale: 1,
            isSoloHero: false,
            soloHeroHidden: false,
            heroOffsetX: 0,
            heroOffsetY: 0,
          };
        }
        computeWordStateInto(
          group.words[wi], wi, group, tSec, groupHasActiveSoloHero, this.width, this.height, wab[wi],
        );
      }
      const wordAnimStates = wab;

      // ── Build chunks ──
      for (let wi = 0; wi < group.words.length; wi++) {
        const word = group.words[wi];
        const ws = wordAnimStates[wi];
        const scale = ws.waveScale * phraseState.pushInScale;

        const chunk = chunks[ci] ?? ({} as ScaledKeyframe['chunks'][number]);
        chunks[ci] = chunk;

        chunk.id = word.id;
        chunk.text = LyricDancePlayer.stripDisplayPunctuation(word.text);

        // Position: layout + animation offsets
        chunk.x = word.layoutX + ws.heroOffsetX;
        chunk.y = word.layoutY + ws.heroOffsetY;

        chunk.alpha = ws.soloHeroHidden ? 0 : 1.0;
        chunk.scaleX = scale;
        chunk.scaleY = scale;
        chunk.scale = 1;
        chunk.visible = chunk.alpha > 0.01;
        chunk.fontSize = word.baseFontSize;
        chunk.fontWeight = word.fontWeight;
        chunk.fontFamily = word.fontFamily;
        chunk.rotation = 0;
        chunk.skewX = 0;

        chunk.color = word.color;
        chunk.isHeroWord = word.isHeroWord;
        chunk.emphasisLevel = word.emphasisLevel;
        chunk.wordDuration = word.wordDuration;

        ci++;
      }
    }
    chunks.length = ci;

    // ── Suppress main text when outside active phrase window ──
    // resolveActiveGroup is "never-blank" — returns a group even in gaps.
    // Suppress chunks when tSec is before the group starts or after it ends.
    // This handles: pre-first-phrase, during exit animation, post-exit gap.
    if (activeGroupIdx >= 0) {
      const activeGroup = groups[activeGroupIdx];
      if (tSec < activeGroup.start || tSec >= activeGroup.end) {
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].alpha = 0;
          chunks[i].visible = false;
        }
      }
    }

    // Stash phrase age for hero smoke (read in _draw)
    if (activeGroupIdx >= 0) {
      const ag = groups[activeGroupIdx];
      this._smokePhraseAge = (tSec >= ag.start && tSec < ag.end) ? tSec - ag.start : -1;
    } else {
      this._smokePhraseAge = -1;
    }

    if (!this._evalFrame) {
      this._evalFrame = {
        timeMs: 0, beatIndex: 0, sectionIndex: 0,
        cameraX: 0, cameraY: 0, cameraZoom: 1, bgBlend: 0,
        particleColor: '#ffffff', atmosphere: chapter?.atmosphere ?? 'cinematic' as any,
        chunks: [], particles: [],
      } as unknown as ScaledKeyframe;
    }

    const frame = this._evalFrame;
    frame.timeMs = (tSec - scene.songStartSec) * 1000;
    frame.beatIndex = beatIndex;
    frame.sectionIndex = currentChapterIdx;
    frame.cameraX = 0;
    frame.cameraY = 0;
    frame.cameraZoom = effectiveZoom;
    frame.bgBlend = 0;
    (frame as any).beatPulse = beatPulse;
    frame.atmosphere = (chapter?.atmosphere ?? 'cinematic') as any;
    frame.chunks = chunks;
    frame.particles = [];
    return frame;
      }

  /** Draw background gradient to an arbitrary ctx (used for snapshot baking) */
  private _drawBackgroundToCtx(ctx: CanvasRenderingContext2D, frame: ScaledKeyframe): void {
    const saved = this.ctx;
    (this as any).ctx = ctx;
    this.drawBackground(frame);
    (this as any).ctx = saved;
  }

  /** Draw chapter image to an arbitrary ctx (used for snapshot baking) */
  private _drawChapterImageToCtx(ctx: CanvasRenderingContext2D, imgIdx: number, nextImgIdx: number, blend: number): void {
    const saved = this.ctx;
    (this as any).ctx = ctx;
    this.drawChapterImage(imgIdx, nextImgIdx, blend);
    (this as any).ctx = saved;
  }

  /** Draw sim layer to an arbitrary ctx (used for snapshot baking) */
  private _drawSimLayerToCtx(ctx: CanvasRenderingContext2D, frame: ScaledKeyframe): void {
    const saved = this.ctx;
    (this as any).ctx = ctx;
    this.drawSimLayer(frame);
    (this as any).ctx = saved;
  }

  private drawBackground(frame: ScaledKeyframe): void {
    const chapters = this.resolvedState.chapters ?? [];
    const chapterCount = Math.max(1, chapters.length);
    const songDuration = Math.max(1, this.songEndSec - this.songStartSec);
    const songProgress = Math.max(0, Math.min(1, (this.currentTSec - this.songStartSec) / songDuration));
    const chapterIdx = Math.min(Math.floor(songProgress * chapterCount), chapterCount - 1);

    const bgCanvas = this.bgCaches[chapterIdx] ?? this.bgCaches[0];
    if (bgCanvas) {
      this.ctx.drawImage(bgCanvas, 0, 0, this.width, this.height);
    } else {
      this.ctx.fillStyle = this.themeOverride === 'light' ? '#f0f0f5' : '#0a0a0f';
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Theme wash for system backgrounds
    if (this.themeOverride === 'light') {
      this.ctx.save();
      this.ctx.globalAlpha = 0.82;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    } else if (this.themeOverride === 'dark') {
      this.ctx.save();
      this.ctx.globalAlpha = 0.35;
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    }
  }

  private drawLightingOverlay(_frame: ScaledKeyframe, _tSec: number): void {
    const intensity = this._motionProfile?.intensity ?? 0;
    if (intensity < 0.3) return;

    const alpha = (intensity - 0.3) * 0.2;
    const alphaKey = Math.round(alpha * 100);
    const key = `${this.width}-${this.height}-${alphaKey}`;

    if (key !== this._lightingOverlayKey || !this._lightingOverlayCanvas) {
      const off = document.createElement('canvas');
      off.width = this.width; off.height = this.height;
      const octx = off.getContext('2d')!;
      const grad = octx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, this.width * 0.65,
      );
      grad.addColorStop(0, `rgba(255,245,220,${alpha})`);
      grad.addColorStop(0.6, `rgba(255,235,200,${alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(255,230,190,0)');
      octx.fillStyle = grad;
      octx.fillRect(0, 0, this.width, this.height);
      this._lightingOverlayCanvas = off;
      this._lightingOverlayKey = key;
    }
    this.ctx.drawImage(this._lightingOverlayCanvas, 0, 0);
  }

  /**
   * Breathing vignette — Fincher/Cronenweth eye funnel.
   * Dark oval that breathes with song energy.
   * Quiet = heavy vignette (world closes in, intimacy).
   * Loud = light vignette (world opens up, power).
   * The audience never sees the vignette. They feel claustrophobia and release.
   */
  private drawVignette(): void {
    const strength = this._activeEffects.vignetteStrength;
    if (strength < 0.01) return;
    // Smoothed energy for gentle breathing (not beat-by-beat, section-level)
    // Use IntensityRouter's smoothed energy for coherent breathing
    this._vignetteEnergy = this._intensityRouter.smoothedEnergy;

    const w = this.width;
    const h = this.height;
    const key = `${w}-${h}`;

    // Rebuild gradient only on resize
    if (key !== this._vignetteKey || !this._vignetteCanvas) {
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d')!;

      // Oval gradient: fully transparent center, dark edges
      // Aspect-corrected: use the diagonal as the outer radius, center radius at 40%
      const diag = Math.sqrt(w * w + h * h);
      const grad = octx.createRadialGradient(w / 2, h / 2, diag * 0.28, w / 2, h / 2, diag * 0.58);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      octx.fillStyle = grad;
      octx.fillRect(0, 0, w, h);

      this._vignetteCanvas = off;
      this._vignetteKey = key;
    }

    // Alpha driven by inverse energy:
    // Low energy (quiet verse) → higher alpha → heavier vignette → intimate
    // High energy (loud chorus) → lower alpha → lighter vignette → expansive
    // Range: 0.35 (loud) to 0.75 (quiet)
    const baseAlpha = (0.75 - this._vignetteEnergy * 0.40) * strength;
    const alpha = Math.max(0, baseAlpha - this._vignetteBeatPulse);
    if (alpha < 0.02) return;

    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(this._vignetteCanvas, 0, 0, w, h);
    this.ctx.globalAlpha = 1;
  }

  private cleanWord(text: string): string {
    return text.replace(/[^a-zA-Z'']/g, '').toLowerCase();
  }

  /** Strip punctuation for canvas display — keeps apostrophes/hyphens inside words.
   *  Raw text stays intact on the word data for closed-captioning / lyrics tab. */
  private static stripDisplayPunctuation(text: string): string {
    return text
      .replace(/^[^a-zA-Z0-9'']+/, '')   // leading punctuation
      .replace(/[^a-zA-Z0-9'']+$/, '');   // trailing punctuation
  }

  // ═══ Hero schedule: pre-computed for SOLO heroes (≥500ms, emphasis ≥4) ═══

  private _buildHeroSchedule(): void {
    const words = this.data.words ?? [];
    const schedule: typeof this._heroSchedule = [];
    for (const w of words) {
      const duration = w.end - w.start;
      if (duration >= 0.5) {
        schedule.push({ startSec: w.start, endSec: w.end, emphasis: duration >= 1.0 ? 5 : 4, word: w.word });
      }
    }
    schedule.sort((a, b) => a.startSec - b.startSec);
    this._heroSchedule = schedule;
  }

  /**
   * Given current time, return the hero word that is either:
   * - Currently active (startSec <= t <= endSec)
   * - About to appear within lookahead window (t + lookahead >= startSec)
   * Returns null if no hero is near.
   */
  _getUpcomingHero(timeSec: number): { emphasis: number; word: string; isAnticipation: boolean; startSec: number; endSec: number } | null {
    const lookahead = this._heroLookaheadMs / 1000;
    const schedule = this._heroSchedule;

    // Binary search for first hero where endSec > timeSec (still relevant)
    let lo = 0, hi = schedule.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (schedule[mid].endSec < timeSec) lo = mid + 1;
      else hi = mid - 1;
    }

    // Check from `lo` onward for current or upcoming hero
    for (let i = lo; i < Math.min(lo + 3, schedule.length); i++) {
      const h = schedule[i];
      if (timeSec >= h.startSec && timeSec <= h.endSec) {
        // Currently active
        return { emphasis: h.emphasis, word: h.word, isAnticipation: false, startSec: h.startSec, endSec: h.endSec };
      }
      if (h.startSec > timeSec && h.startSec - timeSec <= lookahead) {
        // About to appear — anticipate!
        return { emphasis: h.emphasis, word: h.word, isAnticipation: true, startSec: h.startSec, endSec: h.endSec };
      }
    }
    return null;
  }
}
