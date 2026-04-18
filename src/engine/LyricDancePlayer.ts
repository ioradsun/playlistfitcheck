/* cache-bust: 2026-03-25-V10 */
/**
 * LyricDancePlayer V2 — BeatConductor-driven canvas engine.
 *
 * Architecture:
 * - BeatConductor is the SINGLE rhythmic driver. No dual-system chaos.
 * - ACTIVE CHUNK ONLY: one phrase group on screen at a time, dead center.
 * - Single color model: one text color, contrast against background.
 * - Hero words: solo center (≥500ms) or inline emphasis scaling.
 * - One evaluateFrame() call per tick (not two).
 * - All catches log errors (no silent swallowing).
 * - All state on instance (no global singletons).
 *
 */

import {
  DEFAULT_VIDEO_OPTIONS,
  type CinematicDirection,
  type VideoOptions,
} from "@/types/CinematicDirection";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { SceneContext } from "@/lib/sceneContexts";
import {
  compileScene,
  type CompiledScene,
  type Keyframe,
  type ScenePayload,
} from "@/lib/sceneCompiler";
import type { Moment } from "@/lib/buildMoments";
import { enrichSections } from "@/engine/directionResolvers";
import { getMoodGrade, buildGradeFilter, modulateGradeByEnergy, type MoodGrade } from "@/engine/moodGrades";
// getSectionTones removed — song-level grade model
import { getEffectTier, canShowElemental, canShowHeroGlow, getParticleDensity, getGlowCap } from "@/engine/timeTiers";
import { PARTICLE_SYSTEM_MAP, ParticleEngine } from "@/engine/ParticleEngine";
import {
  normalizeCinematicDirection,
  normalizeToken,
} from "@/engine/cinematicResolver";
import { BeatConductor, type BeatState } from "@/engine/BeatConductor";
import { IntensityRouter, type MotionProfile } from '@/engine/IntensityRouter';
import { CameraRig, type SubjectFocus } from "@/engine/CameraRig";
import { FinaleEffect } from "@/engine/FinaleEffect";
import { ExitEffect } from '@/engine/ExitEffect';
import { HeroSmokeEffect } from '@/engine/HeroSmokeEffect';
import { revokeAnalyzerWorker } from "@/engine/audioAnalyzerWorker";
import { preloadImage } from "@/lib/imagePreloadCache";
import { ensureFontReady, isFontReady } from "@/lib/fontReadinessCache";
import { resolveTypographyFromDirection, getFontNamesForPreload } from "@/lib/fontResolver";
import { deserializeSectionPalette, type SectionPalette } from "@/lib/autoPalette";
import { stripDisplayPunctuation } from "@/lib/lyricTextFormat";
import {
  resolveActiveGroup,
  computeWordStateInto,
  detectSoloHero,
  type PhraseAnimState,
  type WordAnimState,
} from '@/engine/PhraseAnimator';


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
  song_slug?: string;
  url_slug?: string;
  artist_name: string;
  song_name?: string;
  title?: string;
  audio_url: string;
  lyrics?: LyricLine[];
  lines?: any;
  words?: Array<{ word: string; start: number; end: number; speaker_id?: string }>;
  motion_profile_spec?: PhysicsSpec;
  physics_spec?: PhysicsSpec;
  beat_grid: { bpm: number; beats: number[]; confidence: number; _duration?: number };
  palette: string[];
  system_type?: string;
  artist_dna?: any;
  seed?: string;
  frame_state?: any;
  cinematic_direction: CinematicDirection | null;
  section_images?: string[];
  auto_palettes?: string[][];
  scene_context?: SceneContext | null;
  cover_image_url?: string | null;
  album_art_url?: string | null;
  empowerment_promise?: any;
  spotify_track_id?: string | null;
  top_reaction?: { emoji: string; count: number; line_text: string } | null;
  preview_ready?: boolean;
  region_start?: number;
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
    isAdlib?: boolean;
    _wordStart?: number;
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

const BAKER_VERSION = 11;

/**
 * Build a ScenePayload from raw data without requiring an engine instance.
 * Used by both the instance method (via wrapper) and precompilation.
 *
 * Does not reference audio, canvas, or any browser API. Pure function.
 */
function buildScenePayloadFromData(
  data: LyricDanceData,
  fallbackDuration?: number,
): ScenePayload {
  const lines = data.lyrics ?? [];
  const fullStart = lines.length ? Math.max(0, (lines[0].start ?? 0) - 0.5) : 0;
  const fullEnd = lines.length
    ? (lines[lines.length - 1].end ?? 0) + 1
    : (data.beat_grid?._duration || fallbackDuration || 0);
  const songStart = data.region_start != null ? data.region_start : fullStart;
  const songEnd = data.region_end != null ? data.region_end : fullEnd;

  return {
    lines,
    words: data.words ?? [],
    bpm: data.beat_grid?.bpm ?? null,
    beat_grid: data.beat_grid,
    motion_profile_spec: data.motion_profile_spec,
    frame_state: data.frame_state ?? null,
    cinematic_direction: data.cinematic_direction ?? null,
    auto_palettes: data.auto_palettes,
    palette: data.palette ?? ["#0a0a0a", "#111111", "#ffffff"],
    lineBeatMap: [],
    songStart,
    songEnd,
  };
}

// ── Module-level compiled scene cache ───────────────────────────
// Survives player destroy(). Cards that return to view after eviction
// skip compileScene() entirely — near-zero reinit cost.
//
// Key: `${danceId}:${bakerVersion}:${width}x${height}`
// Value: { scene: CompiledScene; chunks: Map<string, ChunkState> }
// Capacity: LRU, max 25 entries (~5MB total for typical scenes)

interface SceneCacheEntry {
  scene: CompiledScene;
  chunks: Map<string, ChunkState>;
  hasCinematicDirection: boolean;
}

const SCENE_CACHE_MAX = 25;
const _sceneCache = new Map<string, SceneCacheEntry>();

function sceneCacheKey(
  danceId: string,
  width: number,
  height: number,
): string {
  return `${danceId}:${BAKER_VERSION}:${Math.round(width)}x${Math.round(height)}`;
}

function sceneCacheGet(key: string): SceneCacheEntry | null {
  const entry = _sceneCache.get(key);
  if (!entry) return null;
  // LRU: move to end on access
  _sceneCache.delete(key);
  _sceneCache.set(key, entry);
  return entry;
}

function sceneCacheSet(key: string, entry: SceneCacheEntry): void {
  if (_sceneCache.has(key)) _sceneCache.delete(key);
  _sceneCache.set(key, entry);
  // Evict oldest if over capacity
  if (_sceneCache.size > SCENE_CACHE_MAX) {
    const oldest = _sceneCache.keys().next().value;
    if (oldest) _sceneCache.delete(oldest);
  }
}

/**
 * Compile a scene and populate the module-level cache without booting an engine.
 * Safe to call repeatedly for the same card — idempotent (cache hit skips).
 * Safe to call on any data — no side effects beyond cache write.
 */
export function precompileSceneForData(
  data: LyricDanceData,
  width: number,
  height: number,
): 'cached' | 'compiled' | 'skipped' {
  const danceId = data.id ?? data.song_slug ?? "";
  if (!danceId) return 'skipped';
  if (!data.lyrics?.length) return 'skipped';

  const roundedW = Math.round(width || 960);
  const roundedH = Math.round(height || 540);
  const key = sceneCacheKey(danceId, roundedW, roundedH);

  const existing = _sceneCache.get(key);
  if (existing) {
    if (data.cinematic_direction && !existing.hasCinematicDirection) {
      _sceneCache.delete(key);
    } else {
      return 'cached';
    }
  }

  try {
    const payload = buildScenePayloadFromData(data);
    const compiled = compileScene(payload, {
      viewportWidth: roundedW,
      viewportHeight: roundedH,
    });
    sceneCacheSet(key, {
      scene: compiled,
      chunks: new Map(),
      hasCinematicDirection: !!data.cinematic_direction,
    });
    return 'compiled';
  } catch {
    return 'skipped';
  }
}

const SPLIT_EXIT_STYLES = new Set(['scatter-letters', 'peel-off', 'peel-reverse', 'cascade-down', 'cascade-up']);

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

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
  private baselineWaveform: Float32Array | null = null;

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
    this.palette = hexToRgb(accent);
  }

  setAccent(hex: string): void { this.palette = hexToRgb(hex); }

  /** Pre-computed energy waveform for export — provides visible bars without runtime audio. */
  setWaveformBaseline(waveform: number[] | Float32Array): void {
    const w = VIS_W;
    this.baselineWaveform = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      const srcIdx = Math.floor((i / w) * waveform.length);
      this.baselineWaveform[i] = Math.max(0, Math.min(1, waveform[srcIdx] ?? 0.15));
    }
  }

  update(energy: number, pulse: number, hitStrength: number, _beatPhase: number, beatIndex: number): void {
    const W = VIS_W;
    const H = VIS_H;
    const ctx = this.visCtx;

    ctx.clearRect(0, 0, W, H);

    const isNewBeat = beatIndex !== this.lastBeatIndex;
    this.lastBeatIndex = beatIndex;

    const [pr, pg, pb] = this.palette;
    const drive = energy * 0.55 + (pulse * energy) * 0.35 + hitStrength * 0.10;
    const hasBaseline = this.baselineWaveform !== null;

    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const centerBias = 0.5 + 0.5 * (1.0 - Math.abs(nx - 0.5) * 2.0);
      const variation = 0.7 + this.barSeeds[x] * 0.6;

      // Blend live energy with pre-computed waveform baseline.
      // When live energy is strong, it dominates. When weak, baseline provides shape.
      const baseLevel = hasBaseline ? (this.baselineWaveform![x] * 0.6) : 0;
      const liveLevel = drive * centerBias * variation;
      const target = Math.max(baseLevel * centerBias, liveLevel);

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
// TODO: DynamiteWickBar is superseded by canvas moment fuse (React overlay).
// Beat energy is now bridged to canvas moment fuse via LyricInteractionLayer polling.
// The canvas-level wick bar can be removed once canvas moment fuse is stable.
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

interface MomentSegment {
  startRatio: number;
  endRatio: number;
  sectionIndex: number;
  fireCount: number;
}

class DynamiteWickBar {
  private dwbCanvas: HTMLCanvasElement;
  private dwbCtx: CanvasRenderingContext2D;
  private _dpr = 1;
  private _W = DWB_W;  // logical width (always 640)
  private _H = DWB_H;  // logical height (always 96)
  private accent: [number, number, number] = [255, 160, 20];
  private sparks: DWBSpark[] = [];
  private smokes: DWBSmoke[] = [];
  private frame = 0;
  private lastBeatIndex = -1;
  // Physics: per-pixel velocity for ember glow pulsing
  private burstHeat: Float32Array;
  private baselineHeat: Float32Array;
  // Waveform
  private waveform: Float32Array;
  private waveformSmooth: Float32Array;
  // Flame flicker state
  private flamePhase = 0;
  private _momentSegments: MomentSegment[] = [];
  private _momentFireCounts: Record<number, number> = {};
  private _lastProgress = 0;
  private _continuousFireActive = false;
  private _manualHeatDecayTicks = 0;

  constructor(accentHex: string, dpr = 1) {
    this.dwbCanvas = document.createElement('canvas');
    this._dpr = Math.max(1, dpr);
    this._W = DWB_W;
    this._H = DWB_H;
    this.dwbCanvas.width = DWB_W * this._dpr;
    this.dwbCanvas.height = DWB_H * this._dpr;
    this.dwbCtx = this.dwbCanvas.getContext('2d')!;
    this.dwbCtx.scale(this._dpr, this._dpr);
    this.burstHeat = new Float32Array(DWB_W).fill(0);
    this.baselineHeat = new Float32Array(DWB_W).fill(0);
    this.waveform = new Float32Array(DWB_W).fill(0.15);
    this.waveformSmooth = new Float32Array(DWB_W).fill(0.15);
    this.setAccent(accentHex);
  }

  setAccent(hex: string): void { this.accent = hexToRgb(hex); }

  setDpr(dpr: number): void {
    const d = Math.max(1, dpr);
    if (d === this._dpr) return;
    this._dpr = d;
    this.dwbCanvas.width = DWB_W * d;
    this.dwbCanvas.height = DWB_H * d;
    this.dwbCtx = this.dwbCanvas.getContext('2d')!;
    this.dwbCtx.scale(d, d);
    this.setWaveformPreview(Array.from(this.waveform));
  }

  /**
   * Fallback waveform source derived from beat-grid spacing.
   * Shorter inter-beat gaps -> denser/faster sections -> higher relative energy.
   */
  static deriveWaveformFromBeats(beats: number[], width: number = DWB_W): number[] {
    if (!Array.isArray(beats) || beats.length < 3 || width <= 0) {
      return new Array(Math.max(1, width)).fill(0.15);
    }

    const out = new Array<number>(width).fill(0.15);
    const firstBeat = beats[0];
    const lastBeat = beats[beats.length - 1];
    const totalSpan = Math.max(1e-3, lastBeat - firstBeat);

    // Convert IBI to "energy-like" values: shorter intervals => higher values.
    const ibiEnergy: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      const ibi = Math.max(1e-3, beats[i] - beats[i - 1]);
      ibiEnergy.push(1 / ibi);
    }
    if (ibiEnergy.length === 0) return out;

    let minE = Infinity;
    let maxE = -Infinity;
    for (const e of ibiEnergy) {
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
    }
    const range = Math.max(1e-6, maxE - minE);

    for (let x = 0; x < width; x++) {
      const t = firstBeat + (x / Math.max(1, width - 1)) * totalSpan;

      let lo = 0;
      let hi = beats.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      const beatIdx = Math.max(1, Math.min(beats.length - 1, lo));

      const prevE = ibiEnergy[Math.max(0, beatIdx - 2)];
      const nextE = ibiEnergy[Math.min(ibiEnergy.length - 1, beatIdx - 1)];
      const t0 = beats[beatIdx - 1];
      const t1 = beats[beatIdx];
      const frac = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
      const e = prevE * (1 - frac) + nextE * frac;
      const norm = (e - minE) / range;
      out[x] = 0.10 + Math.pow(Math.max(0, Math.min(1, norm)), 0.70) * 0.90;
    }

    // Mild smoothing to avoid jagged spikes from noisy beat spacing.
    const smooth = new Array<number>(width);
    const R = 2;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -R; k <= R; k++) {
        const idx = x + k;
        if (idx >= 0 && idx < width) {
          sum += out[idx];
          count++;
        }
      }
      smooth[x] = count > 0 ? sum / count : out[x];
    }
    return smooth;
  }

  /** Call once after beat analysis. Resamples beatEnergies to DWB_W and smooths. */
  setWaveformPreview(beatEnergies: number[]): void {
    const out = new Float32Array(DWB_W);
    if (beatEnergies.length === 0) {
      out.fill(0.15);
      this.waveform = out;
      this.waveformSmooth = new Float32Array(out);
      return;
    }

    // Resample beatEnergies to DWB_W pixels
    const raw = new Float32Array(DWB_W);
    for (let x = 0; x < DWB_W; x++) {
      const srcIdx = (x / DWB_W) * beatEnergies.length;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, beatEnergies.length - 1);
      const frac = srcIdx - lo;
      raw[x] = beatEnergies[lo] * (1 - frac) + beatEnergies[hi] * frac;
    }

    // Local-window normalize so long flat songs get visible variation
    const WIN = 80;
    for (let x = 0; x < DWB_W; x++) {
      const lo = Math.max(0, x - WIN);
      const hi = Math.min(DWB_W - 1, x + WIN);
      let localMax = 0;
      for (let i = lo; i <= hi; i++) localMax = Math.max(localMax, raw[i]);
      const norm = localMax > 0.001 ? raw[x] / localMax : 0;
      out[x] = Math.max(0.10, Math.pow(norm, 0.55));
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

  setMoments(
    moments: Array<{ startSec: number; endSec: number; sectionIndex: number }>,
    songDurationSec: number,
  ): void {
    if (!moments.length || songDurationSec <= 0) {
      this._momentSegments = [];
      return;
    }
    this._momentSegments = moments.map((m) => ({
      startRatio: m.startSec / songDurationSec,
      endRatio: m.endSec / songDurationSec,
      sectionIndex: m.sectionIndex,
      fireCount: 0,
    }));
  }

  setMomentFireCounts(counts: Record<number, number>): void {
    this._momentFireCounts = counts;
    for (let i = 0; i < this._momentSegments.length; i++) {
      this._momentSegments[i].fireCount = counts[i] ?? 0;
    }
  }

  setBaselineFromFires(
    fires: Array<{ time_sec: number; hold_ms: number }>,
    durationSec: number,
  ): void {
    this.baselineHeat.fill(0);
    if (!fires.length || durationSec <= 0) return;

    for (const fire of fires) {
      const px = Math.min(
        this._W - 1,
        Math.max(0, Math.floor((fire.time_sec / durationSec) * this._W)),
      );
      const weight = fire.hold_ms < 300 ? 1 : fire.hold_ms < 1000 ? 2 : fire.hold_ms < 3000 ? 4 : 8;
      const radius = 6;
      for (let i = Math.max(0, px - radius); i <= Math.min(this._W - 1, px + radius); i++) {
        const dist = Math.abs(i - px);
        const falloff = 1 - dist / (radius + 1);
        this.baselineHeat[i] += weight * falloff;
      }
    }

    let maxVal = 0;
    for (let i = 0; i < this._W; i++) {
      if (this.baselineHeat[i] > maxVal) maxVal = this.baselineHeat[i];
    }
    if (maxVal > 0) {
      for (let i = 0; i < this._W; i++) {
        this.baselineHeat[i] /= maxVal;
      }
    }
  }

  receiveFire(holdRadius: number = 15): void {
    const px = Math.floor(this._lastProgress * this._W);
    const radius = Math.min(60, holdRadius);
    for (let i = Math.max(0, px - radius); i <= Math.min(this._W - 1, px + radius); i++) {
      const dist = Math.abs(i - px);
      const falloff = 1 - dist / (radius + 1);
      this.burstHeat[i] = Math.min(1, this.burstHeat[i] + 0.5 * falloff);
    }
    this._manualHeatDecayTicks = 30;

    for (let s = 0; s < 9; s++) {
      this.sparks.push({
        x: px + (Math.random() - 0.5) * 20,
        y: this._H * 0.85 - Math.random() * 10,
        vx: (Math.random() - 0.5) * 3,
        vy: -(2 + Math.random() * 4),
        life: 0.5 + Math.random() * 0.3,
        size: 1.5 + Math.random() * 2,
        bright: 0.5 + Math.random() * 0.5,
      });
    }

    const activeMomentIdx = this._momentSegments.findIndex(
      (seg) => seg.startRatio <= this._lastProgress && this._lastProgress < seg.endRatio,
    );
    if (activeMomentIdx >= 0) {
      this._momentSegments[activeMomentIdx].fireCount += 1;
      this._momentFireCounts[activeMomentIdx] = (this._momentFireCounts[activeMomentIdx] ?? 0) + 1;
    }
  }

  startContinuousFire(): void {
    this._continuousFireActive = true;
  }

  stopContinuousFire(): void {
    this._continuousFireActive = false;
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
    const W = this._W;
    const H = this._H;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const baseY = H * 0.85;
    const maxPeakH = H * 0.72;
    const isNewBeat = beatIndex !== this.lastBeatIndex;
    this._lastProgress = Math.max(0, Math.min(1, progress));

    this.frame++;
    this.flamePhase += 0.2 + energy * 0.3;

    if (this._manualHeatDecayTicks > 0) {
      const decayRate = this._manualHeatDecayTicks > 20 ? 0.92 : 0.97;
      for (let i = 0; i < this._W; i++) {
        this.burstHeat[i] *= decayRate;
        if (this.burstHeat[i] < 0.005) this.burstHeat[i] = 0;
      }
      this._manualHeatDecayTicks -= 1;
    }

    ctx.clearRect(0, 0, W, H);

    if (this._momentSegments.length > 0) {
      this._renderMomentFuse(ctx, W, H, baseY, maxPeakH, progress, energy, pulse, hitStrength, beatPhase, beatIndex, hitType, brightness, isDownbeat, isNewBeat);
    } else {
      this._renderContinuousFuse(ctx, W, H, baseY, maxPeakH, progress, energy, pulse, hitStrength, beatPhase, beatIndex, hitType, brightness, isDownbeat, isNewBeat);
    }
    this.lastBeatIndex = beatIndex;
  }

  private _composeHeatAt(x: number): { base: number; burst: number; heat: number; burstRatio: number } {
    const base = this.baselineHeat[x] || 0;
    const burst = this.burstHeat[x] || 0;
    const heat = Math.min(1, base + burst);
    const burstRatio = burst / Math.max(0.01, heat);
    return { base, burst, heat, burstRatio };
  }

  private _renderContinuousFuse(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    baseY: number,
    maxPeakH: number,
    progress: number,
    energy: number,
    pulse: number,
    hitStrength: number,
    beatPhase: number,
    beatIndex: number,
    hitType: 'transient' | 'bass' | 'tonal' | 'none',
    brightness: number,
    isDownbeat: boolean,
    isNewBeat: boolean,
  ): void {
    const px = Math.max(0, Math.min(W - 1, Math.floor(progress * W)));
    const wf = this.waveformSmooth;
    const heat = this.burstHeat;

    if (pulse > 0.3) {
      for (let i = Math.max(0, px - 20); i <= px; i++) {
        heat[i] = Math.min(1, heat[i] + pulse * energy * 0.15);
      }
    }
    for (let i = 0; i < W; i++) {
      heat[i] *= 0.975;
    }
    if (hitType === 'bass' && hitStrength > 0.3) {
      for (let i = 0; i <= px; i++) {
        heat[i] = Math.min(1, heat[i] + hitStrength * 0.25 * (1 - (px - i) / Math.max(1, px)));
      }
    }

    const getPeakH = (x: number): number => Math.min(maxPeakH, (wf[x] || 0.08) * maxPeakH);

    ctx.beginPath();
    ctx.moveTo(Math.max(px, 0), baseY);
    for (let x = Math.max(px, 0); x < W; x++) {
      ctx.lineTo(x, baseY - getPeakH(x));
    }
    ctx.lineTo(W, baseY);
    ctx.closePath();
    const fuseGrad = ctx.createLinearGradient(0, baseY - maxPeakH, 0, baseY);
    fuseGrad.addColorStop(0, 'rgba(160,110,60,0.35)');
    fuseGrad.addColorStop(0.5, 'rgba(130,85,45,0.25)');
    fuseGrad.addColorStop(1, 'rgba(90,60,30,0.15)');
    ctx.fillStyle = fuseGrad;
    ctx.fill();

    ctx.beginPath();
    for (let x = Math.max(px + 2, 0); x < W; x++) {
      const peakH = getPeakH(x);
      const jitter = Math.sin(x * 2.3 + 17.1) * 0.8 + Math.sin(x * 5.7 + 3.2) * 0.4;
      const y = baseY - peakH + jitter;
      x === Math.max(px + 2, 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(180,130,70,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    for (let x = Math.max(px + 2, 0); x < W; x++) {
      const peakH = getPeakH(x);
      const braidY = baseY - peakH * 0.5 + Math.sin(x * 0.3) * peakH * 0.15;
      x === Math.max(px + 2, 0) ? ctx.moveTo(x, braidY) : ctx.lineTo(x, braidY);
    }
    ctx.strokeStyle = 'rgba(140,100,55,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (px > 0) {
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= px; x++) {
        ctx.lineTo(x, baseY - getPeakH(x));
      }
      ctx.lineTo(px, baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,15,10,0.6)';
      ctx.fill();

      for (let x = 0; x <= px; x++) {
        const { heat: h, burst, burstRatio } = this._composeHeatAt(x);
        if (h < 0.02) continue;
        const peakH = getPeakH(x);
        if (peakH < 1) continue;
        const [ar, ag, ab] = this.accent;
        const r = Math.min(255, Math.floor(
          (1 - burstRatio) * (Math.min(1, h * 1.5) * 200 + ar * 0.3) +
          burstRatio * 255
        ));
        const g = Math.min(255, Math.floor(
          (1 - burstRatio) * (40 + h * 60 + ag * 0.2) +
          burstRatio * (180 + burst * 75)
        ));
        const b = Math.min(255, Math.floor(
          (1 - burstRatio) * (10 + ab * 0.1) +
          burstRatio * (80 + burst * 40)
        ));
        const a = Math.min(0.95, h * 0.8);
        const glowGrad = ctx.createLinearGradient(x, baseY - peakH, x, baseY);
        glowGrad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.9})`);
        glowGrad.addColorStop(0.6, `rgba(${r},${Math.floor(g * 0.6)},${b},${a * 0.5})`);
        glowGrad.addColorStop(1, `rgba(${Math.floor(r * 0.4)},${Math.floor(g * 0.2)},0,${a * 0.2})`);
        ctx.fillStyle = glowGrad;
        ctx.fillRect(x, baseY - peakH, 1.5, peakH);
      }

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
    }

    this._drawFlame(ctx, px, baseY, maxPeakH, energy, pulse, hitStrength, brightness, isDownbeat);
    this._updateSparks(ctx, px, baseY - getPeakH(px), energy, pulse, hitStrength, beatIndex, isDownbeat, isNewBeat);
    this._drawSmoke(ctx);
  }

  private _renderMomentFuse(
    ctx: CanvasRenderingContext2D,
    W: number,
    _H: number,
    baseY: number,
    maxPeakH: number,
    progress: number,
    energy: number,
    pulse: number,
    hitStrength: number,
    _beatPhase: number,
    beatIndex: number,
    _hitType: 'transient' | 'bass' | 'tonal' | 'none',
    brightness: number,
    isDownbeat: boolean,
    isNewBeat: boolean,
  ): void {
    const GAP = 3;
    const segments = this._momentSegments;
    const wf = this.waveformSmooth;
    let activePx = Math.max(0, Math.min(W - 1, Math.floor(progress * W)));

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const x0 = Math.floor(seg.startRatio * W) + (i > 0 ? GAP / 2 : 0);
      const x1 = Math.floor(seg.endRatio * W) - (i < segments.length - 1 ? GAP / 2 : 0);
      const segW = x1 - x0;
      if (segW <= 0) continue;

      const isPast = seg.endRatio < progress;
      const isActive = seg.startRatio <= progress && progress < seg.endRatio;
      let segBaseHeat = 0;
      let segBurstHeat = 0;
      let segHeat = 0;
      let sampleCount = 0;
      for (let x = x0; x <= x1; x++) {
        const composite = this._composeHeatAt(x);
        segBaseHeat += composite.base;
        segBurstHeat += composite.burst;
        segHeat += composite.heat;
        sampleCount += 1;
      }
      const avgBaseHeat = sampleCount > 0 ? segBaseHeat / sampleCount : 0;
      const avgBurstHeat = sampleCount > 0 ? segBurstHeat / sampleCount : 0;
      const avgHeat = sampleCount > 0 ? segHeat / sampleCount : 0;
      const normalizedHeat = Math.min(1, avgHeat);

      if (isPast) {
        if (normalizedHeat === 0) {
          ctx.save();
          ctx.globalAlpha = 0.08;
          const peakScale = 0.35;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          ctx.fillStyle = `rgba(80,75,70,0.3)`;
          ctx.fill();
          ctx.restore();
        } else if (normalizedHeat < 0.25) {
          const peakScale = 0.40 + normalizedHeat * 0.2;
          ctx.save();
          ctx.globalAlpha = 0.15 + normalizedHeat * 0.2;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          const r = this.accent[0], g = this.accent[1], b = this.accent[2];
          ctx.fillStyle = `rgba(${r},${Math.floor(g * 0.5)},${Math.floor(b * 0.2)},0.3)`;
          ctx.fill();
          ctx.restore();
        } else if (normalizedHeat < 0.65) {
          const peakScale = 0.50 + normalizedHeat * 0.3;
          ctx.save();
          ctx.globalAlpha = 0.3 + normalizedHeat * 0.3;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          const r = this.accent[0], g = this.accent[1];
          ctx.fillStyle = `rgba(${r},${Math.floor(g * 0.65)},20,0.5)`;
          ctx.fill();
          ctx.globalAlpha = normalizedHeat * 0.15;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale * 0.5);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,200,60,0.4)`;
          ctx.fill();
          ctx.restore();
        } else if (normalizedHeat < 0.95) {
          const peakScale = 0.65 + normalizedHeat * 0.25;
          ctx.save();
          ctx.globalAlpha = 0.5 + normalizedHeat * 0.3;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          const r = this.accent[0], g = this.accent[1];
          ctx.fillStyle = `rgba(${r},${Math.floor(g * 0.7)},15,0.6)`;
          ctx.fill();
          ctx.globalAlpha = normalizedHeat * 0.25;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale * 0.4);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,220,80,0.5)`;
          ctx.fill();
          ctx.restore();
        } else {
          const breathPhase = Math.sin(this.frame * 0.05) * 0.05;
          const peakScale = 0.75 + breathPhase;
          ctx.save();
          ctx.globalAlpha = 0.7 + breathPhase;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,${Math.floor(180 + breathPhase * 200)},40,0.65)`;
          ctx.fill();
          ctx.globalAlpha = 0.3 + breathPhase * 0.5;
          ctx.beginPath();
          ctx.moveTo(x0, baseY);
          for (let x = x0; x <= x1; x++) {
            ctx.lineTo(x, baseY - (wf[x] || 0.08) * maxPeakH * peakScale * 0.35);
          }
          ctx.lineTo(x1, baseY);
          ctx.closePath();
          ctx.fillStyle = `rgba(255,240,200,0.45)`;
          ctx.fill();
          ctx.restore();
        }
      } else if (isActive) {
        const localProgress = (progress - seg.startRatio) / Math.max(0.001, seg.endRatio - seg.startRatio);
        const px = x0 + Math.floor(localProgress * segW);
        activePx = px;
        const burstRatio = avgBurstHeat / Math.max(0.01, avgHeat);
        const activeAlpha = Math.min(0.8, 0.35 + normalizedHeat * 0.4);

        ctx.save();
        ctx.globalAlpha = 0.2 + avgBaseHeat * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.max(px, x0), baseY);
        for (let x = Math.max(px, x0); x <= x1; x++) {
          const peakH = (wf[x] || 0.08) * maxPeakH * 0.5;
          ctx.lineTo(x, baseY - peakH);
        }
        ctx.lineTo(x1, baseY);
        ctx.closePath();
        ctx.fillStyle = `rgba(${this.accent[0]},${Math.floor(this.accent[1] * 0.6)},${Math.floor(this.accent[2] * 0.2)},0.2)`;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = activeAlpha;
        ctx.beginPath();
        ctx.moveTo(x0, baseY);
        for (let x = x0; x <= px; x++) {
          const peakH = (wf[x] || 0.08) * maxPeakH;
          ctx.lineTo(x, baseY - peakH);
        }
        ctx.lineTo(px, baseY);
        ctx.closePath();
        const [ar, ag, ab] = this.accent;
        const r = Math.min(255, Math.floor((1 - burstRatio) * (Math.min(1, avgHeat * 1.5) * 200 + ar * 0.3) + burstRatio * 255));
        const g = Math.min(255, Math.floor((1 - burstRatio) * (40 + avgHeat * 60 + ag * 0.2) + burstRatio * (180 + avgBurstHeat * 75)));
        const b = Math.min(255, Math.floor((1 - burstRatio) * (10 + ab * 0.1) + burstRatio * (80 + avgBurstHeat * 40)));
        ctx.fillStyle = `rgba(${r},${Math.floor(g * 0.7)},${Math.floor(b * 0.4)},0.5)`;
        ctx.fill();
        ctx.restore();

        this._drawFlame(ctx, px, baseY, maxPeakH, energy, pulse, hitStrength, brightness, isDownbeat);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(x0, baseY);
        for (let x = x0; x <= x1; x++) {
          const peakH = (wf[x] || 0.08) * maxPeakH;
          ctx.lineTo(x, baseY - peakH);
        }
        ctx.lineTo(x1, baseY);
        ctx.closePath();
        ctx.fillStyle = `rgba(${this.accent[0]},${this.accent[1]},${this.accent[2]},0.2)`;
        ctx.fill();
        ctx.restore();
      }
    }

    const flameY = baseY - (wf[Math.max(0, Math.min(W - 1, Math.floor(activePx)))] || 0.08) * maxPeakH;
    this._updateSparks(ctx, activePx, flameY, energy, pulse, hitStrength, beatIndex, isDownbeat, isNewBeat);
    this._drawSmoke(ctx);
  }

  private _drawFlame(
    ctx: CanvasRenderingContext2D,
    px: number,
    baseY: number,
    maxPeakH: number,
    energy: number,
    pulse: number,
    hitStrength: number,
    _brightness: number,
    _isDownbeat: boolean,
  ): void {
    const wf = this.waveformSmooth;
    const peakH = Math.min(maxPeakH, (wf[Math.max(0, Math.min(this._W - 1, px))] || 0.08) * maxPeakH);
    const flameBase = baseY - peakH;
    const flameHeightMultiplier = this._continuousFireActive ? 1.5 : 1;
    const flameH = (8 + energy * 18 + pulse * energy * 8) * flameHeightMultiplier;
    const flicker1 = Math.sin(this.flamePhase * 1.7) * 0.3;
    const flicker2 = Math.sin(this.flamePhase * 2.9 + 1.3) * 0.2;
    const flicker3 = Math.sin(this.flamePhase * 4.3 + 2.7) * 0.15;
    const [ar, ag, ab] = this.accent;

    const outerGlow = ctx.createRadialGradient(px, flameBase - flameH * 0.3, 0, px, flameBase - flameH * 0.3, flameH * 1.5 + 10);
    outerGlow.addColorStop(0, `rgba(${Math.min(255, ar + 80)},${Math.max(70, ag)},${Math.max(10, Math.floor(ab * 0.35))},${0.25 + energy * 0.15})`);
    outerGlow.addColorStop(0.5, `rgba(${Math.min(255, ar + 40)},${Math.floor(Math.max(60, ag * 0.5))},0,${0.1 + energy * 0.05})`);
    outerGlow.addColorStop(1, 'rgba(255,30,0,0)');
    ctx.fillStyle = outerGlow;
    ctx.fillRect(px - flameH * 2, flameBase - flameH * 2, flameH * 4, flameH * 2.5);

    for (let tongue = 0; tongue < 3; tongue++) {
      const xOff = (tongue - 1) * (3 + energy * 3) + flicker1 * 4;
      const hMult = tongue === 1 ? 1.0 : 0.65 + flicker2 * 0.2;
      const tongueH = flameH * hMult;
      const tongueW = 4 + energy * 4 + flicker3 * 2;
      ctx.beginPath();
      ctx.moveTo(px + xOff - tongueW / 2, flameBase);
      ctx.quadraticCurveTo(px + xOff - tongueW * 0.3 + flicker2 * 3, flameBase - tongueH * 0.6, px + xOff + flicker1 * 2, flameBase - tongueH);
      ctx.quadraticCurveTo(px + xOff + tongueW * 0.3 - flicker3 * 3, flameBase - tongueH * 0.5, px + xOff + tongueW / 2, flameBase);
      ctx.closePath();

      const flameGrad = ctx.createLinearGradient(px + xOff, flameBase, px + xOff, flameBase - tongueH);
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
    coreGlow.addColorStop(0, `rgba(255,255,230,${0.7 + pulse * energy * 0.3})`);
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

  private _updateSparks(
    ctx: CanvasRenderingContext2D,
    px: number,
    spawnY: number,
    energy: number,
    pulse: number,
    hitStrength: number,
    beatIndex: number,
    isDownbeat: boolean,
    isNewBeat: boolean,
  ): void {
    if (energy > 0.35 && this.frame % 2 === 0) {
      const numSparks = Math.floor(energy * 3) + (isNewBeat && isDownbeat ? 4 : 0) + (hitStrength > 0.5 ? Math.floor(hitStrength * 6) : 0);
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

    this.sparks = this.sparks.filter((s) => s.life > 0.02);
    for (const s of this.sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.18;
      s.vx *= 0.98;
      s.life -= 0.025;

      const temp = s.life * s.bright;
      const sg = Math.min(255, Math.floor(100 + 155 * temp));
      const sb = Math.min(255, Math.floor(30 * temp));
      const sa = s.life * 0.8;

      ctx.beginPath();
      ctx.fillStyle = `rgba(255,${sg},${sb},${sa})`;
      ctx.arc(s.x, s.y, Math.max(0.1, s.size * s.life), 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.sparks.length > 80) this.sparks = this.sparks.slice(-80);

    if (this.frame % 4 === 0 && energy > 0.2) {
      const numSmoke = 1 + (hitStrength > 0.3 ? 1 : 0);
      for (let s = 0; s < numSmoke; s++) {
        this.smokes.push({
          x: px + (Math.random() - 0.5) * 8,
          y: spawnY - 10 - energy * 10,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(0.5 + Math.random() * 1.2),
          life: 1,
          size: 2 + Math.random() * 3,
          trail: [{ x: px + (Math.random() - 0.5) * 4, y: spawnY }],
        });
      }
    }
  }

  private _drawSmoke(ctx: CanvasRenderingContext2D): void {
    this.smokes = this.smokes.filter((s) => s.life > 0.03);
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
  isHistorical: boolean;
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
  tier?: 0 | 1 | 2 | 3;
}



// ──────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────

export class LyricDancePlayer {

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

  /** Public read-only accessors for current logical dimensions */
  get currentWidth(): number { return this.width; }
  get currentHeight(): number { return this.height; }
  /** Absolute time (seconds) where the song region begins in the audio file. */
  get exportSongStartSec(): number { return this.songStartSec; }
  get exportSongEndSec(): number { return this.songEndSec; }
  private isExporting = false;
  private displayWidth = 0;
  private displayHeight = 0;

  // Audio (React reads this)
  public audio: HTMLAudioElement;

  /** Theme override: 'auto' uses mood grade, 'light'/'dark' forces the look */
  public themeOverride: 'auto' | 'light' | 'dark' = 'auto';

  // Public debug surface (React reads this)
  public debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };
  public resolvedState: ResolvedPlayerState = {
    chapters: [],
    particleConfig: { texture: 'dust', system: 'dust', density: 0.8, speed: 0.5 },
  };
  

  // Public writeable surface (React pushes comments here)

  // Data
  private data: LyricDanceData;

  /** Read-only accessor — used by auto-save to retrieve reconciled words after updateTranscript */
  get currentData(): LyricDanceData { return this.data; }
  private payload: ScenePayload | null = null;

  // Runtime chunks
  private chunks: Map<string, ChunkState> = new Map();
  private _lastFont = '';
  private _lastLetterSpacing = '';
  private _sortBuffer: ScaledKeyframe['chunks'] = [];
  private _textMetricsCache = new Map<string, { width: number; ascent: number; descent: number }>();

  // ═══ Compiled Scene (replaces timeline) ═══
  private compiledScene: CompiledScene | null = null;
  private _debugModeLogged = false;

  // ═══ BeatConductor — single rhythmic driver ═══
  private conductor: BeatConductor | null = null;
  private cameraRig: CameraRig = new CameraRig();
  private _lastBeatState: BeatState | null = null;
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
  private _wallClockOrigin: number | null = null;
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
  private _compiledWidth = 960;
  private _compiledHeight = 540;
  private _compiledWasPortrait = false;
  private _evalFrame: ScaledKeyframe | null = null;
  private _evalChunks: ScaledKeyframe['chunks'] | null = null;
  private _lastEvalTime = 0;

  // Background cache
  private bgCaches: HTMLCanvasElement[] = [];
  private bgCacheCount = 0;
  public chapterParticleSystems: (string | null)[] = [];

  private backgroundSystem = 'default';
  private chapterSims: Array<{ beatVis?: BeatVisSim }> = [];
  private _globalBeatVis: BeatVisSim | null = null; // always-on beat visualizer
  private _barVisStyles: BarVisStyle[] = []; // per-chapter bar style from AI mood
  private lastSimFrame = -1;
  // ═══ Dynamite Wick Bar (always enabled) ═══
  private _globalWickBar: DynamiteWickBar | null = null;
  private _wickSeekOverlay: HTMLDivElement | null = null;
  private _beatBarVisible = false;
  private _intensityScale = 1.0;
  public textRenderMode: "dom" | "canvas" | "both" = "canvas";
  public wickBarEnabled = false;
  private chapterImages: HTMLImageElement[] = [];
  private _sectionScrimOpacity: number[] = [];
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
  private _bgSnapshotMomentIdx = -1; // moment index when snapshot was last baked
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
  private _frameMomentIdx = -1;
  private _framePalette: string[] | null = null;
  private _framePaletteTime = -1; // audio time when palette was last resolved
  private _phraseStateCache: PhraseAnimState = { groupStart: 0, groupEnd: 0, heroType: 'word', pushInScale: 1.0 };
  private _emptyParticles: any[] = [];
  private _moments: Moment[] = [];
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

  /** Pixel offset to shift text UP — compensates for bottom overlay (playbar) */
  private _textVerticalBias = 0;

  // Comment comets
  private activeComments: CommentChunk[] = [];
  private _historicalFires: Array<{
    time_sec: number;
    hold_ms: number;
    spawned: boolean;
  }> = [];
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
  playing = false;
  private destroyed = false;
  private audioContext: AudioContext | null = null;
  private phraseGroups: Array<{ words: Array<{ word: string; start: number; end: number }>; start: number; end: number; lineIndex: number; groupIndex: number }> = [];
  private ambientParticleEngine: ParticleEngine | null = null;
  private activeSectionIndex = -999;
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
  private _fontStabilized = false;
  private _fontLayoutReflowPending = false;
  private _handleVisibilityChange: () => void;
  private _handlePageShow: (e: PageTransitionEvent) => void;
  private _bgCacheDebounce: ReturnType<typeof setTimeout> | null = null;
  private _pendingCanPlayHandler: (() => void) | null = null;
  private _playPromise: Promise<void> | null = null;
  private _audioListenerAbort: AbortController = new AbortController();
  private _ownsAudio = true;
  private _exportFrameCount?: number;
  private options?: {
    preloadedImages?: HTMLImageElement[];
    externalAudio?: HTMLAudioElement;
  };

  constructor(
    data: LyricDanceData,
    bgCanvas: HTMLCanvasElement,
    textCanvas: HTMLCanvasElement,
    container: HTMLDivElement,
    options?: {
      preloadedImages?: HTMLImageElement[];
      externalAudio?: HTMLAudioElement;
    },
  ) {
    this.data = data;
    const opts = {
      ...DEFAULT_VIDEO_OPTIONS,
      ...(data.cinematic_direction?.options ?? {}),
    };
    this._beatBarVisible = opts.beatVisualizer;
    this.wickBarEnabled = opts.wickBar;
    this._intensityScale = opts.intensity === "hard" ? 1.5 : 1.0;
    // Normalize: DB stores lyrics as 'lines', engine uses 'lyrics' internally
    if (!this.data.lyrics?.length && (this.data as any).lines?.length) {
      this.data = { ...this.data, lyrics: (this.data as any).lines };
    }
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

    this._audioListenerAbort = new AbortController();
    const audioSignal = this._audioListenerAbort.signal;

    if (options?.externalAudio) {
      this.audio = options.externalAudio;
      this._ownsAudio = false;
      // Apply engine audio config to the shared element.
      this.audio.src = data.audio_url;
      // Disable native loop for region-based players — tick() handles region looping manually
      this.audio.loop = !(data.region_start != null && data.region_end != null);
      this.audio.preload = "auto";
      // Don't mutate mute state here — sync effects set this explicitly.
    } else {
      this.audio = new Audio(data.audio_url);
      this._ownsAudio = true;
      // Disable native loop for region-based players — tick() handles region looping manually
      this.audio.loop = !(data.region_start != null && data.region_end != null);
      this.audio.muted = true;
      // Start downloading immediately — HTTP cache is warm from prefetch.ts fetch().
      // No reason to defer: the engine WILL play this audio.
      this.audio.preload = "auto";
    }

    const onMetadata = () => {
      this.audio.removeEventListener("loadedmetadata", onMetadata);
      // If initial bake had wrong duration, re-bake once metadata is available
      if (this.songEndSec <= 0.2 && this.audio.duration > 1) {
        const payload = this.buildScenePayload();
        this.payload = payload;
        this.songStartSec = payload.songStart;
        this.songEndSec = payload.songEnd;
        const songDuration = Math.max(0.1, this.songEndSec - this.songStartSec);
        const beatGridData = this.data.beat_grid ?? { bpm: 120, beats: [], confidence: 0 };
        this.conductor = new BeatConductor(beatGridData, songDuration);
        if (this._bakedScene?.songMotion) this.conductor.setSongIdentity(this._bakedScene.songMotion);
        if (this._bakedScene?.sectionMods) this.conductor.setSectionMods(this._bakedScene.sectionMods);
        if ((beatGridData as any)._analysis) {
          this.conductor.setAnalysis((beatGridData as any)._analysis);
        }
      }
    };
    this.audio.addEventListener("loadedmetadata", onMetadata, { signal: audioSignal });
    this._handleVisibilityChange = this._handleVisibilityChangeImpl.bind(this);
    document.addEventListener("visibilitychange", this._handleVisibilityChange, { signal: audioSignal });
    this._handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page restored from BFCache — re-validate context and resume
        this._handleVisibilityChangeImpl();
      }
    };
    window.addEventListener("pageshow", this._handlePageShow, { signal: audioSignal });


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

  /**
   * Resolve the primary font family name via the typography resolver.
   * Handles typographyPlan (new), fontProfile, and legacy typography keys.
   * Falls back to Montserrat if no valid font is found.
   */
  private getTargetFontFamily(): string {
    const resolved = resolveTypographyFromDirection(this.data?.cinematic_direction);
    const names = getFontNamesForPreload(resolved);
    return names[0] ?? 'Montserrat';
  }

  private kickFontStabilizationLoad(): void {
    const fontName = this.getTargetFontFamily();

    if (isFontReady(fontName)) {
      this._fontStabilized = true;
      this._fontLayoutReflowPending = true;
      performance.mark("engine:fontReady");
      return;
    }

    ensureFontReady(fontName).then((ready) => {
      if (this.destroyed) return;
      if (ready) {
        this._fontStabilized = true;
        this._fontLayoutReflowPending = true;
        performance.mark("engine:fontReady");
      } else {
        const _poll = setInterval(() => {
          if (this.destroyed) { clearInterval(_poll); return; }
          if (isFontReady(fontName)) {
            clearInterval(_poll);
            this._fontStabilized = true;
            this._fontLayoutReflowPending = true;
          }
        }, 500);
        setTimeout(() => clearInterval(_poll), 10_000);
      }
    });
  }

  // Compatibility with existing React shell
  async init(): Promise<void> {
    this.perfDebugEnabled = Boolean((window as Window & { __LYRIC_DANCE_DEBUG_PERF?: boolean }).__LYRIC_DANCE_DEBUG_PERF);
    this.emojiStreamEnabled = true;
    this._fontLayoutReflowPending = false;
    performance.clearMarks("engine:start");
    performance.mark("engine:start");
    this.perfMarks.tInitStart = performance.now();

    this.kickFontStabilizationLoad();

    const cw = this.container?.offsetWidth || this.canvas.offsetWidth || 960;
    const ch = this.container?.offsetHeight || this.canvas.offsetHeight || 540;
    this.resize(cw, ch);

    // Warm-spawn particles now that bounds are valid.
    // Constructor called setSystem('dust') before resize → no particles spawned (bounds 1×1).
    if (this.ambientParticleEngine) {
      this.ambientParticleEngine.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
      this.ambientParticleEngine.setSystem(this.activeSectionTexture || 'dust');
    }

    this.displayWidth = this.width;
    this.displayHeight = this.height;

    await this.ensureTimelineReady();
    this.buildBgCache();
    this.deriveVisualSystems();
    this.buildChapterSims();
    this.loadSectionImages().catch(() => {});
    this.startPlaybackClock();
  }

  /** Serialized audio start — prevents AbortError from overlapping calls. */
  private _safePlay(): void {
    if (this._playPromise) return;
    const startPlayback = this.audio["play"].bind(this.audio);
    this._playPromise = startPlayback()
      .catch(() => {})
      .finally(() => { this._playPromise = null; });
  }

  private startPlaybackClock(): void {
    if (this.destroyed) return;
    this.perfMarks.tClockStart = this.perfMarks.tClockStart ?? performance.now();
    this.primeAudio();
    this._safePlay();
    this.playing = true;
    this.startHealthMonitor();
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  primeAudio(): void {
    this.audio.preload = "auto";
    // Avoid calling load() on every play/resume: it resets currentTime and breaks seek-based resumes.
    if (this.audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      this.audio.load();
    }
  }

  private async ensureTimelineReady(): Promise<void> {

    // Cache exists but was baked without cinematic direction — invalidate
    if (this._bakedScene && !this._bakedHasCinematicDirection && this.data.cinematic_direction) {
      this._bakePromise = null;
      this._bakedScene = null;
      this._bakedChunkCache = null;
      this._bakeLock = false;
    }

    // Check module-level cache first — hit = skip compileScene entirely
    if (!this._bakedScene) {
      const danceId = this.data.id ?? this.data.song_slug ?? "";
      if (danceId) {
        const cacheKey = sceneCacheKey(danceId, this.width || 960, this.height || 540);
        const cached = sceneCacheGet(cacheKey);
        if (
          cached &&
          // Don't use a non-cinematic cache entry when we now have direction
          (!this.data.cinematic_direction || cached.hasCinematicDirection)
        ) {
          // Restore from module cache — no compileScene() needed
          this._bakedScene = cached.scene;
          this._bakedChunkCache = new Map(cached.chunks);
          this._bakedHasCinematicDirection = cached.hasCinematicDirection;
          this._bakedVersion = BAKER_VERSION;
          this.compiledScene = cached.scene;
          this.chunks = new Map(cached.chunks);
          this._markCompiledViewport(this.width || 960, this.height || 540);
          // Still need payload + conductor for audio sync
          const payload = this.buildScenePayload();
          this.payload = payload;
          this.resolvePlayerState(payload);
          await this.preloadFonts(); // near-zero — fontReadinessCache hit
          this.songStartSec = payload.songStart;
          this.songEndSec = payload.songEnd;
          const songDuration = Math.max(0.1, this.songEndSec - this.songStartSec);
          const beatGridData = this.data.beat_grid ??
            { bpm: 120, beats: [], confidence: 0 };
          this.conductor = new BeatConductor(beatGridData, songDuration);
          if (cached.scene.songMotion) this.conductor.setSongIdentity(cached.scene.songMotion);
          if (cached.scene.sectionMods) this.conductor.setSectionMods(cached.scene.sectionMods);
          if (cached.scene.songMotion) this.cameraRig.setSongIdentity(cached.scene.songMotion);
          if (cached.scene.sectionMods) this.cameraRig.setSectionMods(cached.scene.sectionMods);
          this._updateViewportScale();
          this._textMetricsCache.clear();
          return; // skip the full bake
        }
      }
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
        this._bakedHasCinematicDirection = !!this.data.cinematic_direction;
        this._bakedVersion = BAKER_VERSION;
        this._bakeLock = false;

        // Write to module-level cache — survives player.destroy()
        const danceId = this.data.id ?? this.data.song_slug ?? "";
        if (danceId) {
          const cacheKey = sceneCacheKey(danceId, this.width || 960, this.height || 540);
          sceneCacheSet(cacheKey, {
            scene: compiled,
            chunks: new Map(this.chunks),
            hasCinematicDirection: !!this.data.cinematic_direction,
          });
        }
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
    // Fallback: derive songEndSec from lines data if audio duration isn't available yet
    if (this.songEndSec <= 0) {
      const lines = (this.data as any).lyrics ?? (this.data as any).lines ?? [];
      if (lines.length) {
        this.songEndSec = (lines[lines.length - 1].end ?? 0) + 1;
      }
    }

    const playStart = this.data.region_start ?? this.songStartSec;
    if (this.audio.currentTime <= 0 || this.data.region_start != null) {
      this.audio.currentTime = playStart;
    }
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
    // Guarantee muted autoplay succeeds — caller will unmute via setMuted() after
    const wasMuted = this.audio.muted;
    if (!wasMuted) this.audio.muted = true;

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
    this._safePlay();
    // Restore mute state — the embed's mute effect handles the real value
    if (!wasMuted) {
      // Defer unmute to next microtask so play() promise resolves first
      Promise.resolve().then(() => {
        if (!this.destroyed) this.audio.muted = wasMuted;
      });
    }
  }

  play(withAudio = true): void {
    if (this.destroyed) return;
    this.playing = true;
    // Clear wall-clock fallback — real audio time will take over in tick().
    // Prevents getCurrentTime() from returning stale wall-clock values
    // between play(true) and the first tick.
    this._wallClockOrigin = null;

    if (!withAudio) {
      // Visual-only: start RAF + wall clock, no audio.
      // Used by warm feed cards that animate without sound.
      if (!this._wallClockOrigin) this._wallClockOrigin = performance.now();
      if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
      this.rafHandle = requestAnimationFrame(this.tick);
      return;
    }

    // Full play: audio + visuals
    this.primeAudio();

    this._startAudioPlayback();
    this.startHealthMonitor();

    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    this._wallClockOrigin = null;
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.stopHealthMonitor();
    this.audio.pause();
    this._playPromise = null;
  }

  /** Stop the visual render loop without pausing audio.
   *  Keeps inactive surfaces buffering while saving CPU on rendering. */
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
    this._wallClockOrigin = null;
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
    this._resetBgParallax();
    // Reset historical fire spawn flags when seeking
    this._historicalFires.forEach(f => {
      f.spawned = f.time_sec < this.audio.currentTime;
    });
  }

  /** Returns the current effective playback time, using wall-clock fallback if audio is blocked. */
  getCurrentTime(): number {
    if (this.audio.paused && this.playing && this._wallClockOrigin != null) {
      const wallElapsed = (performance.now() - this._wallClockOrigin) / 1000;
      const startAt = this.data.region_start ?? this.songStartSec;
      return startAt + wallElapsed;
    }
    return this.audio.currentTime;
  }

  public applyOptions(options: Partial<VideoOptions>): void {
    if (options.beatVisualizer !== undefined) this._beatBarVisible = options.beatVisualizer;
    if (options.wickBar !== undefined) this.wickBarEnabled = options.wickBar;
    if (options.intensity !== undefined) {
      this._intensityScale = options.intensity === "hard" ? 1.5 : 1.0;
    }
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
    this._exportFrameCount = undefined;

    // Export resolution IS the target pixel resolution — DPR must be 1.0
    // Otherwise a 2× display creates a 2160×3840 backing store for a 1080×1920 export
    this._exportSavedDpr = this.dpr;
    this._exportSavedVerticalBias = this._textVerticalBias;
    this.dpr = 1;
    this._textVerticalBias = this.wickBarEnabled
      ? this._exportSavedVerticalBias
      : 0;

    // Use resize() instead of setResolution() — triggers scene recompile
    // when aspect ratio or size changes significantly. This ensures font sizing,
    // word wrapping, row stacking, and layout positions are correct for the
    // export resolution, not the live viewport.
    this.resize(width, height);

    // Force synchronous bg cache build — resize() debounces it and export starts immediately.
    if (this._bgCacheDebounce) {
      clearTimeout(this._bgCacheDebounce);
      this._bgCacheDebounce = null;
    }
    this.buildBgCache();
    // Re-acquire context with willReadFrequently for fast pixel readback
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
    })!;
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);

    // Force recompile with fresh context — metrics may differ.
    if (this.payload) {
      this.compiledScene = compileScene(this.payload, { viewportWidth: width, viewportHeight: height });
      this._buildChunkCacheFromScene(this.compiledScene);
      this._markCompiledViewport(width, height);
      this._textMetricsCache.clear();
    }

    // Force quality tier 0 for export — maximum visual quality, CPU doesn't matter
    this._qualityTier = 0 as 0;
    this._qUpgradeStreak = 0;

    // Reset background snapshot so first export frame gets a fresh bake
    this._bgSnapshotSection = -999;
    this._bgSnapshotMomentIdx = -1;
    this._bgLastBakeMs = 0;
    // Force-compile scene if resize didn't trigger it.
    if (!this.compiledScene && this.payload) {
      this.compiledScene = compileScene(this.payload, { viewportWidth: width, viewportHeight: height });
      this._buildChunkCacheFromScene(this.compiledScene);
      this._markCompiledViewport(width, height);
    }
    // Last resort: if payload doesn't exist but raw data does, rebuild from source data.
    if (!this.payload && this.data) {
      console.warn('[LyricDancePlayer] EXPORT: building payload from raw data');
      this.payload = this.buildScenePayload();
      if (this.payload && !this.compiledScene) {
        this.compiledScene = compileScene(this.payload, { viewportWidth: width, viewportHeight: height });
        this._buildChunkCacheFromScene(this.compiledScene);
        this._markCompiledViewport(width, height);
      }
      if (this.payload) {
        this.buildBgCache();
        this.deriveVisualSystems();
        this.buildChapterSims();
      }
    }
    this.emojiStreamEnabled = true;

    // Reset phrase cursor so export starts clean
    this._activeGroupCursor = 0;

    this.seek(this.songStartSec);

    // ── Export readiness diagnostic ──
    if (!this.compiledScene) {
      console.error('[LyricDancePlayer] EXPORT: compiledScene is NULL — lyrics will not render.', {
        payload: !!this.payload,
        width,
        height,
      });
    }
    if (!this.payload) {
      console.error('[LyricDancePlayer] EXPORT: payload is NULL — nothing to render.', {
        compiledScene: !!this.compiledScene,
        data: !!this.data,
      });
    }
    console.info('[LyricDancePlayer] EXPORT: ready', {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      effectiveDpr: this._effectiveDpr,
      compiledScene: !!this.compiledScene,
      phraseGroups: this.compiledScene?.phraseGroups?.length ?? 0,
      payload: !!this.payload,
      payloadWords: this.payload?.words?.length ?? 0,
      payloadLines: this.payload?.lines?.length ?? 0,
      payloadPhrases: (this.payload?.cinematic_direction as any)?.phrases?.length ?? 0,
      songStart: this.songStartSec,
      songEnd: this.songEndSec,
    });
    if (this.compiledScene && this.compiledScene.phraseGroups.length === 0) {
      console.error('[LyricDancePlayer] EXPORT: compiledScene has ZERO phraseGroups — lyrics will not appear.', {
        payloadWords: this.payload?.words?.length ?? 0,
        payloadLines: this.payload?.lines?.length ?? 0,
        payloadPhrases: (this.payload?.cinematic_direction as any)?.phrases?.length ?? 0,
        hasCinematicDirection: !!this.payload?.cinematic_direction,
      });
    }
  }

  drawAtTime(tSec: number): void {
    const timeSec = this.songStartSec + tSec;
    const clamped = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (clamped - this.songStartSec) * 1000);

    // Set up frame context
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
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
    this._processHistoricalFires();

    // Section + palette
    {
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];
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
    // Export frame diagnostic — log first 3 frames to trace rendering
    if (this.isExporting) {
      if (this._exportFrameCount === undefined) this._exportFrameCount = 0;
      this._exportFrameCount++;
      if (this._exportFrameCount <= 3) {
        const visibleChunks = frame?.chunks?.filter((c: any) => c.visible)?.length ?? 0;
        const totalChunks = frame?.chunks?.length ?? 0;
        console.info(`[LyricDancePlayer] EXPORT frame #${this._exportFrameCount}:`, {
          tSec: Math.round(tSec * 1000) / 1000,
          timeSec: Math.round(timeSec * 1000) / 1000,
          clamped: Math.round(clamped * 1000) / 1000,
          frameExists: !!frame,
          totalChunks,
          visibleChunks,
          phraseGroups: this.compiledScene?.phraseGroups?.length ?? 0,
          songStart: this.songStartSec,
          songEnd: this.songEndSec,
          activeGroupCursor: this._activeGroupCursor,
        });
      }
    }

    // Camera rig — must feed section + energy BEFORE update, same as tick()
    {
      const vocalActive = frame ? frame.chunks.some((c: any) => c.visible && c.alpha > 0.3) : false;
      const upcoming = this._getUpcomingHero(clamped);
      const songProg = (clamped - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
      const isClimax = (beatState?.energy ?? 0) > 0.65 && songProg > 0.50;

      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];

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
    this._exportFrameCount = undefined;
    this.dpr = this._exportSavedDpr; // restore display DPR
    this._textVerticalBias = this._exportSavedVerticalBias; // restore live overlay bias
    this.resize(this.displayWidth, this.displayHeight); // recompile scene for live viewport
    // Restore normal GPU-backed context
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
  }

  resize(logicalW: number, logicalH: number): void {
    const prevCompiledW = this._compiledViewportW;
    const prevCompiledH = this._compiledViewportH;
    const prevW = this.width;
    const prevH = this.height;
    const w = Math.max(1, Math.floor(logicalW));
    const h = Math.max(1, Math.floor(logicalH));
    this.width = w;
    this.height = h;
    this._applyDprToCanvas();

    if (this.payload) {
      if (this._bgCacheDebounce) clearTimeout(this._bgCacheDebounce);
      this._bgCacheDebounce = setTimeout(() => {
        this._bgCacheDebounce = null;
        if (!this.destroyed) this.buildBgCache();
      }, 200);
    }
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._vignetteCanvas = null;
    this._vignetteKey = '';
    this._watermarkCache = null; // invalidate — dimensions depend on this.width
    this.ambientParticleEngine?.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
    // If bounds changed significantly, clear stale out-of-bounds particles.
    const boundsChanged = Math.abs(this.width - prevW) > 20 || Math.abs(this.height - prevH) > 20;
    if (boundsChanged) {
      this.ambientParticleEngine?.clear();
      this.ambientParticleEngine?.setSystem(this.activeSectionTexture || 'dust');
    }
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
    this.cameraRig.setViewport(w, h);

    // ═══ RESPONSIVE: always recompile on resize ═══
    // Layout is in viewport pixels — any size change needs recompile.
    if (this.payload) {
      const sizeChanged = w !== prevCompiledW || h !== prevCompiledH;
      if (sizeChanged) {
        if (
          Math.abs(w - this._compiledWidth) < 4 &&
          Math.abs(h - this._compiledHeight) < 4
        ) {
          // Dimensions close enough — skip recompile but continue resize setup
        } else {
          this.compiledScene = compileScene(this.payload, { viewportWidth: w, viewportHeight: h });
          this._buildChunkCacheFromScene(this.compiledScene);
          this._markCompiledViewport(w, h);
          this._textMetricsCache.clear();
        }
      }
    }
  }

  /** Apply current effective DPR to canvas backing-store dimensions.
   *  Called by resize() and by _updateQualityTier when the DPR bucket changes.
   *  At tier ≥ 2 the effective DPR is capped at 1.5 (from the device DPR which may
   *  be 2–3×), cutting pixel fill by up to 75% with negligible visual degradation. */
  private _applyDprToCanvas(): void {
    const eDpr = this._effectiveDpr;
    this._globalWickBar?.setDpr(eDpr);
    this.canvas.width = Math.floor(this.width * eDpr);
    this.canvas.height = Math.floor(this.height * eDpr);
    // Text canvas is kept matched (never drawn to, but must agree on dimensions)
    this.textCanvas.width = this.canvas.width;
    this.textCanvas.height = this.canvas.height;
    // Invalidate bg cache — was baked at previous DPR
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._bgSnapshotSection = -999; // force rebake at new resolution
    this._bgSnapshotMomentIdx = -1;
    if (this.payload) {
      if (this._bgCacheDebounce) clearTimeout(this._bgCacheDebounce);
      this._bgCacheDebounce = setTimeout(() => {
        this._bgCacheDebounce = null;
        if (!this.destroyed) this.buildBgCache();
      }, 200);
    }
  }

  /**
   * Swap the render target to a different canvas pair.
   * Render one engine to two canvases alternately when needed.
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
   * Detach from the current audio element before a pool swap.
   * Removes all engine-owned listeners from the current audio so they
   * cannot fire on a reused pool element owned by another player.
   * Call this BEFORE replacing `this.audio`.
   */
  detachAudio(): void {
    if (this._pendingCanPlayHandler) {
      this.audio.removeEventListener("canplay", this._pendingCanPlayHandler);
      this._pendingCanPlayHandler = null;
    }
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
      // Clean any previous pending handler before adding a new one
      if (this._pendingCanPlayHandler) {
        this.audio.removeEventListener("canplay", this._pendingCanPlayHandler);
      }
      const onReady = () => {
        this.audio.removeEventListener("canplay", onReady);
        if (this._pendingCanPlayHandler === onReady) this._pendingCanPlayHandler = null;
        if (!this.destroyed) this.audio.currentTime = regionStart;
      };
      this._pendingCanPlayHandler = onReady;
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
    this._resetBgParallax();
    this._bgSnapshotSection = -1;
    this._bgSnapshotMomentIdx = -1;
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
  }

  /** Set vertical text bias in canvas pixels — shifts text up to account for bottom overlays (playbar). */
  setTextVerticalBias(px: number): void {
    this._textVerticalBias = px;
  }

  /** Set per-line reaction data for the emoji stream. Called by parent surfaces. */
  setFireHeat(data: Record<string, { line: Record<number, number>; total: number }>): void {
    this.emojiReactionData = data;
  }

  setHistoricalFires(fires: Array<{ time_sec: number; hold_ms: number }>): void {
    this._historicalFires = fires
      .map(f => ({ ...f, spawned: false }))
      .sort((a, b) => a.time_sec - b.time_sec);
  }

  /** Enable/disable the emoji stream overlay. Disabled when reaction panel is open. */
  setEmojiStreamEnabled(enabled: boolean): void {
    this.emojiStreamEnabled = enabled;
  }

  setMoments(moments: Moment[]): void {
    this._moments = Array.isArray(moments) ? moments : [];
    this._frameMomentIdx = -1;
    this._bgSnapshotMomentIdx = -1;
    if (this._globalWickBar) {
      const duration = Math.max(0.01, this.songEndSec - this.songStartSec);
      this._globalWickBar.setMoments(
        this._moments.map((m) => ({
          startSec: m.startSec,
          endSec: m.endSec,
          sectionIndex: m.sectionIndex ?? 0,
        })),
        duration,
      );
    }
  }

  updateCinematicDirection(direction: CinematicDirection): void {
    direction = (normalizeCinematicDirection(direction) ?? direction) as CinematicDirection;
    // Direct pass-through — new schema consumed directly by resolvers
    this.data = { ...this.data, cinematic_direction: direction };
    if (!this.payload) return;
    this.payload = { ...this.payload, cinematic_direction: direction };
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
  updateTranscript(lines: LyricLine[], words?: Array<{ word: string; start: number; end: number; speaker_id?: string }> | null): void {
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
        if (tokens.length <= slotCount) {
          // Same or fewer tokens than slots — zip 1:1, blank out extras
          slotIdxs.forEach((slotIdx, si) => {
            reconciled[slotIdx] = {
              ...reconciled[slotIdx],
              word: tokens[si] ?? "",
            };
          });
        } else {
          // More tokens than slots (user split a word) — distribute evenly across slots.
          const chunkSize = tokens.length / slotCount;
          slotIdxs.forEach((slotIdx, si) => {
            const from = Math.round(si * chunkSize);
            const to = Math.round((si + 1) * chunkSize);
            reconciled[slotIdx] = {
              ...reconciled[slotIdx],
              word: tokens.slice(from, to).join(" "),
            };
          });
        }
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
    this._bgSnapshotMomentIdx = -1;
    this.loadSectionImages();
  }

  updateSceneContext(sceneCtx: SceneContext): void {
    
    this.data = { ...this.data, scene_context: sceneCtx };
  }

  /** Hot-patch auto_palettes and recompile scene so word colors update */
  updateAutoPalettes(palettes: string[][]): void {
    if (!palettes?.length) return;
    
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
    if (this._bgCacheDebounce) {
      clearTimeout(this._bgCacheDebounce);
      this._bgCacheDebounce = null;
    }
    if (this._pendingCanPlayHandler) {
      this.audio.removeEventListener("canplay", this._pendingCanPlayHandler);
      this._pendingCanPlayHandler = null;
    }
    this.audio.pause();
    this._playPromise = null;
    this._audioListenerAbort.abort();

    if (this._ownsAudio) {
      this.audio.src = "";
    }
    this._timeInitialized = false;

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.ambientParticleEngine?.clear();
    this.chapterSims.forEach((sim) => {
      this._zeroCanvas(sim.beatVis?.canvas);
    });
    this._zeroCanvas(this._globalBeatVis?.canvas ?? null);
    this.chapterSims = [];
    this.chapterImages = [];
    this._sectionScrimOpacity = [];
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
    if (document.hidden) {
      // HIDE: stop RAF, health monitor, and audio to save battery
      if (this.rafHandle) {
        cancelAnimationFrame(this.rafHandle);
        this.rafHandle = 0;
      }
      this.stopHealthMonitor();
      if (!this.audio.paused) {
        this.audio.pause();
      }
      return;
    }

    // SHOW: recover from backgrounding
    if (!this.bgCanvas) return;

    // Attempt to re-acquire context (iOS may have reclaimed it under memory pressure)
    const testCtx = this.bgCanvas.getContext("2d", { alpha: false });
    if (!testCtx) {
      console.warn("[LyricDancePlayer] Canvas context lost, stopping playback");
      this.playing = false;
      this.destroyed = true;
      return;
    }
    this.ctx = testCtx;

    // Reset frame timing to avoid huge delta spike
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

    // Reset quality tier — fresh start after background
    if (this._qualityTier > 0) {
      this._qualityTier = 0;
      this._qUpgradeStreak = 0;
      this._applyDprToCanvas();
    }

    // Resume if was playing before hide
    if (this.playing) {
      this.startHealthMonitor();
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
      // Guard: canvas context may be lost after prolonged backgrounding.
      if (!this.ctx || !this.bgCanvas?.getContext) {
        this.playing = false;
        return;
      }

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
          this._markCompiledViewport(this.width || 960, this.height || 540);
        }
      }

      // ALWAYS start frame with this exact sequence
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
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

      // ═══ WALL-CLOCK FALLBACK ═══
      // If audio is paused (autoplay blocked, muted on iOS, etc.) but
      // the player is supposed to be playing, use performance.now() to
      // advance time so canvas animations and progress bar still run.
      // When audio starts playing, snap back to audio.currentTime.
      let effectiveAudioTime: number;
      if (this.audio.paused && this.playing) {
        if (this._wallClockOrigin == null) {
          this._wallClockOrigin = performance.now();
        }
        const wallElapsed = (performance.now() - this._wallClockOrigin) / 1000;
        const startAt = this.data.region_start ?? this.songStartSec;
        effectiveAudioTime = startAt + wallElapsed;
        // Loop at song end
        const endAt = this.data.region_end ?? this.songEndSec;
        if (effectiveAudioTime > endAt) {
          this._wallClockOrigin = performance.now();
          effectiveAudioTime = startAt;
        }
      } else {
        // Audio is playing — use real time, reset wall clock
        this._wallClockOrigin = null;
        effectiveAudioTime = (
          this.data.region_start != null &&
          this.audio.currentTime < this.data.region_start - 0.5
        ) ? this.data.region_start : this.audio.currentTime;
      }

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
      this._processHistoricalFires();

      // ═══ V2: Get beat state ONCE from conductor ═══
      const beatState = this.conductor?.getState(smoothedTime) ?? null;
      if (beatState) (beatState as any)._tSec = smoothedTime;
      this._lastBeatState = beatState;
      this._frameDt = Math.min(deltaMs, 33.33) / 16.67; // normalized to 60fps

      // ═══ Per-frame caches: section index + palette ═══
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];
      const dur = this.getSongDuration() || (this.audio?.duration > 0 ? this.audio.duration : 1);
      // In region mode, lock section index to the section at region_start.
      // A 10-second hook that crosses a section boundary would otherwise
      // cycle images every loop — distracting flicker instead of stable bg.
      const sectionTime = this.data.region_start != null
        ? this.data.region_start
        : smoothedTime;
      this._frameSectionIdx = sections.length > 0
        ? this.resolveSectionIndex(sections, sectionTime, dur)
        : -1;
      const activeMoment = this._resolveCurrentMoment(smoothedTime);
      this._frameMomentIdx = activeMoment?.index ?? -1;
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

      // ═══ V2: Single evaluateFrame call ═══
      const frame = this.evaluateFrame(smoothedTime);

      // ═══ V2: Update CameraRig with LOOKAHEAD — anticipate hero words ═══
        const vocalActive = frame ? frame.chunks.some((c: any) => c.visible && c.alpha > 0.3) : false;
        const upcoming = this._getUpcomingHero(smoothedTime);

        const songProg = (smoothedTime - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
        // Climax = high energy + past halfway through the song
        const isClimax = (beatState?.energy ?? 0) > 0.65 && songProg > 0.50;

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
    const dur = (totalDurationSec && totalDurationSec > 0)
      ? totalDurationSec
      : (this.audio?.duration > 0 ? this.audio.duration : null)
      ?? (this.songEndSec > 0 ? this.songEndSec : null);
    if (!dur) return 0;
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

  private _resolveCurrentMoment(tSec: number): Moment | null {
    for (let i = this._moments.length - 1; i >= 0; i -= 1) {
      if (tSec >= this._moments[i].startSec - 0.1) return this._moments[i];
    }
    return this._moments[0] ?? null;
  }

  /** Return per-frame cached palette */
  private getResolvedPalette(): string[] {
    return this._framePalette ?? this._resolveAndCachePalette(this._frameSectionIdx);
  }

  /** Raw palette resolution — only called on section change */
  private _resolveCurrentPalette(secIdx: number): string[] {
    const autoPalettes = this.data?.auto_palettes;
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const chapters = (cd?.sections as any[]) ?? [];

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
    if (chIdx >= 0) {
      const dominantColor = chapters[chIdx]?.dominantColor as string | undefined;
      if (dominantColor && /^#[0-9a-fA-F]{6}$/.test(dominantColor)) {
        const r = parseInt(dominantColor.slice(1, 3), 16);
        const g = parseInt(dominantColor.slice(3, 5), 16);
        const b = parseInt(dominantColor.slice(5, 7), 16);
        const toHex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
        const dark = `#${toHex(Math.round(r * 0.12))}${toHex(Math.round(g * 0.12))}${toHex(Math.round(b * 0.12))}`;
        const light = `#${toHex(Math.min(255, r + Math.round((255 - r) * 0.35)))}${toHex(Math.min(255, g + Math.round((255 - g) * 0.35)))}${toHex(Math.min(255, b + Math.round((255 - b) * 0.35)))}`;
        const dim = `#${toHex(Math.round(r * 0.5))}${toHex(Math.round(g * 0.5))}${toHex(Math.round(b * 0.5))}`;
        return [dark, dominantColor, '#F0ECE2', light, dim];
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
    const resolved = resolveTypographyFromDirection(this.payload?.cinematic_direction);
    return resolved.fontFamily;
  }


  private async preloadFonts(): Promise<void> {
    const resolved = resolveTypographyFromDirection(this.payload?.cinematic_direction);
    const fontNames = getFontNamesForPreload(resolved);
    const results = await Promise.all(fontNames.map(name => ensureFontReady(name)));
    const loaded = results.every(Boolean);
    if (!this.destroyed) {
      if (loaded) {
        this._fontStabilized = true;
        this._fontLayoutReflowPending = true;
      } else {
        for (const fontName of fontNames) {
          const _poll = setInterval(() => {
            if (this.destroyed) { clearInterval(_poll); return; }
            if (isFontReady(fontName)) {
              clearInterval(_poll);
              this._fontStabilized = true;
              this._fontLayoutReflowPending = true;
            }
          }, 500);
          setTimeout(() => clearInterval(_poll), 10_000);
        }
      }
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

      const texture = section?.texture ?? this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, cd) ?? "dust";
      this.activeSectionTexture = texture;
      // Guarantee visible atmosphere in every section
      if (this.ambientParticleEngine) {
        this.ambientParticleEngine.setDensityMultiplier(Math.max(0.5, this._activeEffects.particleDensity));
        this.ambientParticleEngine.setSpeedMultiplier(Math.max(0.2, this._activeEffects.particleSpeed));
      }
      const mapped = (PARTICLE_SYSTEM_MAP as Record<string, string | undefined>)[texture?.toLowerCase?.() ?? ""]?.toLowerCase?.() ?? texture;
      const currentSystem = this.ambientParticleEngine?.getSystem?.();
      if (mapped !== currentSystem) {
        this.ambientParticleEngine?.setSystem(mapped);
      }
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

    if (!precomputedFrame) {
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
        // Past shatter — hold black. Audio is paused by closing screen.
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
      // At tier >= 2, skip expensive fire/water/aurora sims but still update optional beat visualizer.
      if (this.wickBarEnabled && this._globalWickBar) {
        const bs = this._lastBeatState;
        const songDuration = Math.max(0.01, this.songEndSec - this.songStartSec);
        const songProgress = Math.max(0, Math.min(1, this.currentTimeMs / 1000 / songDuration));
        this._globalWickBar.update(
          bs?.energy ?? 0, bs?.pulse ?? 0, bs?.hitStrength ?? 0, bs?.phase ?? 0, bs?.beatIndex ?? 0,
          songProgress, bs?.hitType ?? 'none', bs?.brightness ?? 0.5, bs?.isDownbeat ?? false,
        );
      }
      if (this._beatBarVisible && this._globalBeatVis) {
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
    const curMomentIdx = this._frameMomentIdx;
    const nowMsBg = performance.now();
    const snapshotDimsMismatch = this._bgSnapshot
      ? (this._bgSnapshot.width !== Math.floor(this.width * this._effectiveDpr)
        || this._bgSnapshot.height !== Math.floor(this.height * this._effectiveDpr))
      : false;
    const snapshotStale =
      curSection !== this._bgSnapshotSection
      || curMomentIdx !== this._bgSnapshotMomentIdx
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
      const sectionsForCrossfade = (cdForCrossfade?.sections as any[]) ?? [];
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
      // Grade-aware scrim — reduce scrim when mood grade already darkens the image
      const baseScrimSoft = this._sectionScrimOpacity[imgIdx] ?? 0;
      const baseScrimHard = 0;
      const baseScrim = baseScrimSoft + (baseScrimHard - baseScrimSoft) * (this._intensityScale - 1.0);
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];
      const sectionMood = sections[imgIdx]?.visualMood as string | undefined;
      const sectionGrade = getMoodGrade(sectionMood);
      // If the grade brightness is below 0.45, the image is already dark — reduce scrim
      const gradeCompensation = sectionGrade.brightness < 0.45
        ? Math.max(0, 1 - ((0.45 - sectionGrade.brightness) / 0.20))
        : 1.0;
      const scrimOpacity = baseScrim * gradeCompensation;
      if (this._intensityScale > 1.2) {
        const hitStrength = this._lastBeatState?.hitStrength ?? 0;
        if (hitStrength > 0.6) {
          const flashAlpha = Math.min(0.15, (hitStrength - 0.6) * 0.375);
          snapCtx.save();
          snapCtx.globalAlpha = flashAlpha;
          snapCtx.fillStyle = '#ffffff';
          snapCtx.fillRect(0, 0, this.width, this.height);
          snapCtx.restore();
        }
      }
      if (scrimOpacity > 0.01) {
        this._drawContrastScrim(snapCtx, scrimOpacity);
      }
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
      this._bgSnapshotMomentIdx = curMomentIdx;
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
    if (this.wickBarEnabled && this._globalWickBar) {
      const bs = this._lastBeatState;
      const bsEnergy = bs?.energy ?? 0;
      const bsPulse = bs?.pulse ?? 0;
      const wickAlpha = Math.min(0.95, 0.50 + bsEnergy * 0.30 + bsPulse * 0.15);
      if (wickAlpha > 0.01) {
        const wickH = this.height * 0.18;
        const wickTop = this.height - wickH;
        this.ctx.globalAlpha = wickAlpha;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this._globalWickBar.canvas, 0, wickTop, this.width, wickH);
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.globalAlpha = 1;
      }
    }
    if (this._beatBarVisible && this._globalBeatVis) {
      const bs = this._lastBeatState;
      const bsEnergy = bs?.energy ?? 0;
      const bsPulse = bs?.pulse ?? 0;
      const baseAlpha = this.isExporting ? 0.45 : 0.30;
      const beatAlpha = Math.min(0.85, baseAlpha + bsEnergy * 0.40 + bsPulse * 0.15);
      if (beatAlpha > 0.01) {
        const beatH = this.height * 0.18;
        const beatTop = this.wickBarEnabled
          ? this.height - (this.height * 0.18) - beatH
          : this.height - beatH;
        this.ctx.globalAlpha = beatAlpha;
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this._globalBeatVis.canvas, 0, beatTop, this.width, beatH);
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.globalAlpha = 1;
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

    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);

    // Camera zoom is now applied via CameraRig.getSubjectTransform() at the text rendering stage
    this.ctx.textAlign = 'left';
    this.setCanvasBaseline('middle');
    const renderCanvasText = this.textRenderMode === 'canvas' || this.textRenderMode === 'both';

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
      const rawFontSize = (chunk as any).isAdlib ? baseFontSize * 0.65 : baseFontSize;
      const safeFontSize = Math.max(viewportMinFont, Math.round(rawFontSize) || 36);
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

      const drawFont = `${fontWeight} ${safeFontSize}px ${family}`;
      if (drawFont !== this._lastFont) { this.ctx.font = drawFont; this._lastFont = drawFont; }
      // Per-phrase letter spacing — tight for impact, wide for emotional
      const lsEm = (chunk as any)._letterSpacing ?? 0;
      const lsStr = lsEm === 0 ? '0px' : `${lsEm}em`;
      if (lsStr !== this._lastLetterSpacing) {
        (this.ctx as any).letterSpacing = lsStr;
        this._lastLetterSpacing = lsStr;
      }
      const isAdlib = (chunk as any).isAdlib === true;
      // INVARIANT: all lyric text renders at 100% opaque pure white.
      // - No entry fade ramp (words pop at stagger time via chunk.visibility gating)
      // - No filler dim (hierarchy comes from fontWeight, not opacity)
      // - No adlib alpha envelope (adlibs are also full-opacity white)
      // - No per-word color variation (always pure white)
      this.ctx.globalAlpha = 1.0;
      this.ctx.fillStyle = '#ffffff';

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

      // Hero glow: subtle white bloom behind hero words (quality tier >= 2 only)
      const isHero = (chunk as any).isHeroWord === true && !isAdlib;
      if (isHero && this._qualityTier >= 2) {
        const heroAlpha = Math.min(0.3, ((chunk as any)._heroScore ?? 0.4) * 0.5);
        this.ctx.shadowColor = `rgba(255, 255, 255, ${heroAlpha})`;
        this.ctx.shadowBlur = 6;
        this.ctx.fillText(text, 0, 0);
        // Reset shadow immediately — don't bleed into next word
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
      }
      // Main text draw
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
    if (renderCanvasText && qTier < 3) {
      const smokePalette = this._framePalette ?? this.data?.palette ?? ['#a855f7', '#ec4899', '#ffffff'];
      this._heroSmoke.update(sortBuf, smokePalette, qTier, this._smokePhraseAge);
      this.ctx.save();
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
      this._heroSmoke.draw(this.ctx);
      this.ctx.restore();
      this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
      this.ctx.textAlign = 'left';
      this.setCanvasBaseline('middle');
    }

    if (renderCanvasText) {
      for (let ci = 0; ci < sortBuf.length; ci += 1) {
        drawChunkText(sortBuf[ci]);
      }
    }

    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this.ctx.globalAlpha = 1;
    this._lastShadowBlur = 0;
    this._lastShadowColor = 'transparent';
    // Reset letter spacing so it doesn't bleed into watermark/debug text
    if (this._lastLetterSpacing !== '0px') {
      (this.ctx as any).letterSpacing = '0px';
      this._lastLetterSpacing = '0px';
    }
    this.ctx.restore();
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'left';
    this.setCanvasBaseline('alphabetic');

    // ═══ EXIT EFFECT: cinematic phrase exit ═══
    if (renderCanvasText && this._exitEffect.active) {
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

  private _processHistoricalFires(): void {
    const nowSec = this.audio.currentTime;
    for (const fire of this._historicalFires) {
      if (fire.spawned) continue;
      if (fire.time_sec > nowSec) break;
      fire.spawned = true;
      this.fireFire(0);
    }
    // Reset spawned flags on seek backward
    // (handled by setHistoricalFires reset on seek)
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

      if ((riser.tier ?? 0) >= 2) {
        this.ctx.shadowColor = (riser.tier ?? 0) >= 3
          ? 'rgba(255, 32, 96, 0.6)'
          : 'rgba(255, 94, 32, 0.5)';
        this.ctx.shadowBlur = (riser.tier ?? 0) >= 3 ? 16 : 8;
      } else {
        this.ctx.shadowBlur = 0;
      }

      this.ctx.fillText(riser.emoji, x, y);
    }

    this.ctx.shadowBlur = 0;
    this.ctx.restore();
  }

  private drawPerfOverlay(): void {
    const x = 16;
    const y = 16;
    const h = 66;
    this.ctx.save();
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
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
    const margin = Math.max(10, Math.round(this.width * 0.022));
    const padX = Math.max(6, Math.round(this.width * 0.014));
    const padY = Math.max(4, Math.round(this.width * 0.008));
    const text = "♥ tools.FMLY";
    const fontSize = Math.max(12, Math.round(this.width * 0.022));
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
    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
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

  private _legacyFireComment(text: string): void {
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
      isHistorical: false,
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

  public fireComment(text: string): void {
    if (text === '🔥') {
      this.fireFire(0);
      return;
    }
    this._legacyFireComment(text);
  }

  public fireFire(holdMs: number = 0): void {
    const tier: 0 | 1 | 2 | 3 =
      holdMs < 300  ? 0 :
      holdMs < 1000 ? 1 :
      holdMs < 3000 ? 2 : 3;

    // Size, lifetime, opacity, drift all scale with tier
    const sizeMap = [18, 26, 36, 48];
    const lifetimeMap = [2.5, 3.5, 5.0, 7.0];
    const opacityMap = [0.65, 0.75, 0.85, 0.95];
    const driftMap = [8, 12, 18, 24];

    // Spawn 1 riser for tap, 2 for tier1, 3 for tier2, 5 for tier3
    const countMap = [1, 2, 3, 5];
    const count = countMap[tier];

    const nowSec = performance.now() / 1000;

    for (let i = 0; i < count; i++) {
      // Spread spawn x slightly for multiple risers
      const xSpread = count > 1 ? (i - (count - 1) / 2) * 14 : 0;
      this.emojiRisers.push({
        emoji: '🔥',
        spawnTime: nowSec + i * 0.08,
        lifetime: lifetimeMap[tier] + Math.random() * 0.5,
        spawnX: this.width / 2 + xSpread,
        spawnY: this.height - 70,
        size: sizeMap[tier] + Math.random() * 4,
        driftAmplitude: driftMap[tier] + Math.random() * 8,
        driftPhase: Math.random() * Math.PI * 2,
        opacity: opacityMap[tier],
        tier,
      });
    }

    if (this.emojiRisers.length > 60) {
      this.emojiRisers = this.emojiRisers.slice(-60);
    }
  }

  public fireMoment(elapsedMs: number = 0): void {
    if (!this._globalWickBar) return;
    this._globalWickBar.receiveFire(Math.min(60, 15 + elapsedMs / 50));
  }

  public setFireBaseline(
    fires: Array<{ time_sec: number; hold_ms: number }>,
    durationSec: number,
  ): void {
    this._globalWickBar?.setBaselineFromFires(fires, durationSec);
  }

  public startContinuousFire(): void {
    if (!this._globalWickBar) return;
    this._globalWickBar.startContinuousFire();
  }

  public stopContinuousFire(): void {
    if (!this._globalWickBar) return;
    this._globalWickBar.stopContinuousFire();
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

      // Alpha: fade in 10%, full middle, fade out last 25% — capped at 65%
      const alpha = (t < 0.10
        ? t / 0.10
        : t > 0.75
          ? 1 - (t - 0.75) / 0.25
          : 1) * 0.65;
      const holdTier = 0 as 0 | 1 | 2 | 3;
      const tierAlphaBoost = [1.0, 1.15, 1.3, 1.5][holdTier];
      let effectiveAlpha = Math.min(0.85, alpha * tierAlphaBoost);
      if (comment.isHistorical) {
        effectiveAlpha *= 0.55;
      }
      const yOffset = holdTier >= 2
        ? Math.sin(nowSec * 3 + comment.startX) * (holdTier * 4)
        : 0;
      const drawY = comment.y + yOffset;

      this.ctx.save();

      // Glow — softer
      this.ctx.shadowColor = comment.color;
      this.ctx.shadowBlur = [4, 8, 14, 22][holdTier];

      if (holdTier === 3) {
        this.ctx.save();
        this.ctx.shadowColor = comment.color;
        this.ctx.shadowBlur = 40;
        this.ctx.globalAlpha = effectiveAlpha * 0.25;
        this.ctx.beginPath();
        this.ctx.arc(x, drawY, comment.fontSize * 0.4, 0, Math.PI * 2);
        this.ctx.fillStyle = comment.color;
        this.ctx.fill();
        this.ctx.restore();
      }

      // Trail — thinner, more transparent
      const trailX = x - comment.direction * comment.trailLength;
      // Cache the gradient — re-create only when comet has moved > 2px or alpha changed.
      // createLinearGradient allocates a GPU gradient object every call — avoid it.
      const alphaHex = Math.floor(effectiveAlpha * 120).toString(16).padStart(2, '0');
      // Expand 3-digit hex shorthand before appending alphaHex to prevent same crash.
      const trailColor = /^#[0-9a-fA-F]{3}$/.test(comment.color)
        ? `#${comment.color[1]}${comment.color[1]}${comment.color[2]}${comment.color[2]}${comment.color[3]}${comment.color[3]}`
        : comment.color;
      let trail: CanvasGradient;
      const gc = comment._cachedTrailGrad;
      if (!gc || Math.abs(gc.x1 - trailX) > 2 || Math.abs(gc.x2 - x) > 2 || gc.alphaHex !== alphaHex) {
        const g = this.ctx.createLinearGradient(trailX, drawY, x, drawY);
        g.addColorStop(0, 'transparent');
        g.addColorStop(1, `${trailColor}${alphaHex}`);
        comment._cachedTrailGrad = { grad: g, x1: trailX, x2: x, alphaHex };
        trail = g;
      } else {
        trail = gc.grad;
      }
      this.ctx.strokeStyle = trail;
      this.ctx.lineWidth = comment.fontSize * 0.15;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(trailX, drawY);
      this.ctx.lineTo(x, drawY);
      this.ctx.stroke();

      // 3 spark particles — smaller
      for (let i = 0; i < 3; i++) {
        const seed = (i * 0.618033) % 1;
        const sparkX = x - comment.direction * seed * comment.trailLength * 0.8;
        const sparkY = drawY + Math.sin(nowSec * 8 + i * 2.1) * 6;
        const sparkAlpha = (1 - seed) * effectiveAlpha * 0.7;
        this.ctx.globalAlpha = sparkAlpha;
        this.ctx.fillStyle = comment.color;
        this.ctx.shadowBlur = 0;
        this.ctx.beginPath();
        this.ctx.arc(sparkX, sparkY, 0.8 + seed * 0.7, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Color bullet dot — smaller
      this.ctx.globalAlpha = effectiveAlpha;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = comment.color;
      const commentFont = `400 ${comment.fontSize * 0.85}px "Space Mono", monospace`;
      const textWidth = this.getCachedMetrics(comment.text, commentFont).width || 60;
      const dotX = x - comment.direction * (textWidth / 2 + 12);
      this.ctx.fillStyle = comment.color;
      this.ctx.beginPath();
      this.ctx.arc(dotX, drawY, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Text — lighter weight, smaller, muted white
      this.ctx.globalAlpha = effectiveAlpha;
      this.ctx.font = `400 ${comment.fontSize * 0.85}px "Space Mono", monospace`;
      this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
      this.ctx.textAlign = 'center';
      this.setCanvasBaseline('middle');
      this.ctx.fillText(comment.text, x, drawY);

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

    this.textCanvas.width = this.canvas.width;
    this.textCanvas.height = this.canvas.height;

    this.ctx.setTransform(this._effectiveDpr, 0, 0, this._effectiveDpr, 0, 0);
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
    return buildScenePayloadFromData(
      this.data,
      this.audio?.duration ?? undefined,
    );
  }

  private toLegacyChapters(direction: CinematicDirection | null | undefined): any[] {
    if (!direction?.sections?.length) return [];
    const dur = this.data.beat_grid?._duration
      || (this.audio?.duration > 0 ? this.audio.duration : null)
      || (this.songEndSec > 0 ? this.songEndSec : undefined);
    return enrichSections(direction.sections, dur).map((section) => ({
      title: section.description ?? `Section ${section.sectionIndex}`,
      startSec: section.startSec,
      endSec: section.endSec,
      startRatio: section.startRatio,
      endRatio: section.endRatio,
      emotionalArc: section.visualMood ?? "",
      texture: section.texture,
      atmosphere: section.visualMood ?? "intimate",
      backgroundDirective: section.description ?? "",
      sectionIndex: section.sectionIndex,
      visualMood: section.visualMood,
      dominantColor: section.dominantColor,
      zoom: 1,
      driftIntensity: 0.1,
    }));
  }

  private resolveParticleTexture(sectionIndex: number, direction: CinematicDirection | null | undefined): string {
    const sectionTexture = direction?.sections?.[sectionIndex]?.texture;
    return sectionTexture ?? (direction as any)?.texture ?? 'dust';
  }

  private resolvePlayerState(payload: ScenePayload): void {
    const direction = payload.cinematic_direction;
    const chapters = this.toLegacyChapters(direction);
    const durationSec = Math.max(0.01, (payload.songEnd ?? this.audio.duration ?? 1) - (payload.songStart ?? 0));
    const sectionIndex = Math.max(0, Math.min(chapters.length - 1, this.resolveSectionIndex(chapters, this.audio.currentTime, this.audio.duration || 1)));
    const texture = this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, direction);
    this.resolvedState = {
      chapters,
      particleConfig: {
        texture,
        system: texture,
        density: 0.35,
        speed: 0.35,
      },
    };
    this.activeSectionIndex = -999;
    this.activeSectionTexture = texture;

    // Apply particle config immediately — don't wait for section transition in update()
    if (this.ambientParticleEngine) {
      const mapped = (PARTICLE_SYSTEM_MAP as Record<string, string | undefined>)[texture?.toLowerCase?.() ?? ""]?.toLowerCase?.() ?? texture;
      this.ambientParticleEngine.setSystem(mapped);
      this.ambientParticleEngine.setConfig({
        system: mapped,
        density: this.resolvedState.particleConfig.density ?? 0.8,
        speed: this.resolvedState.particleConfig.speed ?? 0.5,
        opacity: 0.7,
        beatReactive: mapped !== 'glare',
      });
      this.ambientParticleEngine.setDensityMultiplier(Math.max(0.5, this.resolvedState.particleConfig.density));
      this.ambientParticleEngine.setSpeedMultiplier(Math.max(0.2, this.resolvedState.particleConfig.speed));
    }

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
        const displayText = stripDisplayPunctuation(word.text);
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
    this._compiledWidth = this._compiledViewportW;
    this._compiledHeight = this._compiledViewportH;
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
    this._sectionScrimOpacity = [];
    if (this.options?.preloadedImages?.length) {
      this.chapterImages = this.options.preloadedImages;
      this._sectionScrimOpacity = this.chapterImages.map((img) =>
        this._requiredScrimOpacity(this._sampleRegionLuminance(img, 90))
      );
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
        this._sectionScrimOpacity[i] = this._requiredScrimOpacity(
          this._sampleRegionLuminance(img, 90)
        );
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
      // Center-zoom only — no panning. Pulse enlarges, never shows edges.
      // zoomStart > 1.0 ensures the image is always overscanned.
      // zoomEnd slightly higher = gentle outward drift over the section.
      return {
        zoomStart: 1.08,
        zoomEnd: 1.12,
        panStartX: 0,
        panStartY: 0,
        panEndX: 0,
        panEndY: 0,
      };
    });
  }

  private drawChapterImage(chapterIdx: number, nextChapterIdx: number, blend: number): void {
    if (this.chapterImages.length === 0) return;

    const current = this.chapterImages[chapterIdx];
    const next = this.chapterImages[nextChapterIdx];
    // ═══ PER-MOMENT GRADE: section mood + moment energy ═══
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const sections = (cd?.sections as any[]) ?? [];
    const currentMoment = this._resolveCurrentMoment(this.audio?.currentTime ?? 0);
    const sectionMood = sections[chapterIdx]?.visualMood as string | undefined;
    const baseGrade = getMoodGrade(sectionMood);
    let activeGrade = currentMoment
      ? modulateGradeByEnergy(baseGrade, currentMoment.energy, currentMoment.sectionProgress)
      : baseGrade;

    // ═══ THEME OVERRIDE: modify grade for forced light/dark ═══
    if (this.themeOverride !== 'auto' && activeGrade) {
      // Clone the section grade so theme override stays local
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

    // Emotional intensity: use a fixed mid-level — beat pulse remains separate
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
        const beatEnergyNow = this._lastBeatState?.energy ?? 0;
        const beatPulseNow = this._lastBeatState?.pulse ?? 0;
        const driftT = (localT * 2) % 1;
        const driftEased = driftT * driftT * (3 - 2 * driftT);
        const beatAccel = 1 + beatPulseNow * beatEnergyNow * 0.3;
        const zoom = kb.zoomStart + (kb.zoomEnd - kb.zoomStart) * driftEased * beatAccel;
        const panX = (kb.panStartX + (kb.panEndX - kb.panStartX) * driftEased * beatAccel) * this.width;
        const panY = (kb.panStartY + (kb.panEndY - kb.panStartY) * driftEased * beatAccel) * this.height;

        this.ctx.save();
        this.ctx.translate(this.width / 2 + panX, this.height / 2 + panY);
        this.ctx.scale(zoom, zoom);
        this.ctx.translate(-this.width / 2, -this.height / 2);
        this._drawImageCoverCropped(this.ctx, drawCurrent, ox, oy, ow, oh);
        this.ctx.restore();
      } else if (kb) {
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

    // ─── Film grain: derived from active moment-modulated grade ───
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
      // Give beat vis a baseline waveform for export rendering.
      {
        const analysisRef = (this.conductor as any)?._analysis as import('@/engine/audioAnalyzer').AudioAnalysis | null;
        if (analysisRef?.beatEnergies) {
          this._globalBeatVis.setWaveformBaseline(analysisRef.beatEnergies);
        } else {
          const beatGridBeats = this.data.beat_grid?.beats ?? [];
          const derived = DynamiteWickBar.deriveWaveformFromBeats(beatGridBeats, VIS_W);
          this._globalBeatVis.setWaveformBaseline(derived);
        }
      }
      if (!this._globalWickBar) {
        this._globalWickBar = new DynamiteWickBar(accentColor, this._effectiveDpr);
        const analysisRef = (this.conductor as any)?._analysis as import('@/engine/audioAnalyzer').AudioAnalysis | null;
        if (analysisRef?.beatEnergies) {
          this._globalWickBar.setWaveformPreview(analysisRef.beatEnergies);
        } else {
          const beatGridBeats = this.data.beat_grid?.beats ?? [];
          const derived = DynamiteWickBar.deriveWaveformFromBeats(beatGridBeats, DWB_W);
          this._globalWickBar.setWaveformPreview(derived);
        }
      }
      const duration = Math.max(0.01, this.songEndSec - this.songStartSec);
      this._globalWickBar.setMoments(
        this._moments.map((m) => ({
          startSec: m.startSec,
          endSec: m.endSec,
          sectionIndex: m.sectionIndex ?? 0,
        })),
        duration,
      );

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
      const duration = this.songEndSec - this.songStartSec;
      const clickTimeSec = this.songStartSec + ratio * duration;
      if (this._moments.length > 0) {
        for (const moment of this._moments) {
          if (clickTimeSec >= moment.startSec && clickTimeSec < moment.endSec) {
            this.seek(moment.startSec);
            return;
          }
        }
      }
      this.seek(clickTimeSec);
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
    overlay.addEventListener('click', (e) => { e.stopPropagation(); });
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
        const songProgress = Math.max(0, Math.min(1, this.currentTimeMs / 1000 / songDuration));
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
      }
      if (this._beatBarVisible && this._globalBeatVis) {
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
    this._lastEvalTime = tSec;

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
      this._motionProfile = this._intensityRouter.update(beatState, frameDt, this._intensityScale);
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
    // Pulse from center only — no directional drift
    this._bgZoomPivotX = 0;
    this._bgZoomPivotY = 0;

    // Text stays still — background zoom drives the rhythm.
    this._textBeatNodX = 0;
    this._textBeatNodY = 0;

    // Brightness flash and vignette also scale per-beat
    const beatFlashMult = this._intensityScale;
    const beatFlash = pulseEnvelope * beatDynamic * mp.intensity * beatFlashMult;
    const flashAlpha = 0.5 + 0.6 * (this._intensityScale - 1.0);
    this._bgBeatBrightnessBoost += (beatFlash - this._bgBeatBrightnessBoost) * flashAlpha;

    const vignettePulseScale = 0.20 + 0.40 * (this._intensityScale - 1.0);
    const vignetteBeat = pulseEnvelope * beatDynamic * mp.intensity * vignettePulseScale;
    this._vignetteBeatPulse += (vignetteBeat - this._vignetteBeatPulse) * 0.35;

    if (beatIndex !== this._lastBeatIndex && beatIndex >= 0) {
      this._lastBeatIndex = beatIndex;
    }

    // CameraRig owns text zoom — effectiveZoom neutralized to 1.0
    const effectiveZoom = 1.0;
    // Resolve current chapter for visualMood metadata (no zoom — CameraRig owns that)
    const currentChapterIdx = this._frameSectionIdx >= 0
      ? Math.min(this._frameSectionIdx, scene.chapters.length - 1)
      : 0;
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
      // lingerDuration: delay exit effect for emotional phrases
      const lingerSec = (activeGroup as any).lingerDuration ?? 0;
      const exitTriggerTime = activeGroup.end + lingerSec;
      // Don't linger past the next group's start — prevent overlap
      const nextGroupStart = (activeGroupIdx + 1 < groups.length)
        ? groups[activeGroupIdx + 1].start : Infinity;
      const clampedExitTime = Math.min(exitTriggerTime, nextGroupStart - 0.05);
      if (tSec >= clampedExitTime) {
        this._exitTriggeredForGroup = activeGroupIdx;
        this._exitEffect.onGroupChange(
          activeGroup as any, nextGroupStart, tSec,
          this.ctx, this.width, this.height,
          (activeGroup as any).exitEffect ?? undefined,
        );
      }
    }

    let ci = 0;
    if (!this._evalChunks) this._evalChunks = [] as ScaledKeyframe['chunks'];
    const chunks = this._evalChunks;

    for (const groupIdx of activeGroups) {
      const group = groups[groupIdx];
      // ── Phrase animation state (inlined, no per-frame allocation) ──
      this._phraseStateCache.groupStart = group.start;
      this._phraseStateCache.groupEnd = group.end;
      this._phraseStateCache.heroType = group.heroType ?? 'word';
      this._phraseStateCache.pushInScale = 1.0;
      const phraseState = this._phraseStateCache;

      if (!this._debugModeLogged && groupIdx === activeGroups[activeGroups.length - 1]) {
        this._debugModeLogged = true;
        // Flag any zero-duration or negative-duration words
        const rawWords = this.data?.words ?? [];
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
        chunk.text = stripDisplayPunctuation(word.text);
        (chunk as any)._groupIndex = (group as any).groupIndex;
        (chunk as any)._wordIndexInGroup = wi;

        // Position: layout + animation offsets
        chunk.x = word.layoutX + ws.heroOffsetX;
        chunk.y = word.layoutY + ws.heroOffsetY;

        // ── Word stagger entry ──
        // Words POP in at their stagger time — no fade ramp.
        // - revealStyle 'instant' (staggerSec === 0): all words visible from group.start.
        // - revealStyle 'stagger_fast'/'stagger_slow' (staggerSec > 0): each word hidden
        //   before its effective start time, then instantly visible at 1.0.
        // Original design decision: phrases typically span 400ms-2s; a 150ms fade per
        // word eats too much of the visible window and softens the rhythmic feel.
        let wordEntryAlpha = 1.0;
        if (!ws.soloHeroHidden) {
          const staggerSec = ((group as any).staggerDelay ?? 0);
          if (staggerSec > 0 && wi > 0) {
            const wordEffectiveStart = group.start + (wi * staggerSec);
            if (tSec < wordEffectiveStart) {
              wordEntryAlpha = 0;
            }
            // No else-if ramp — word is fully visible (1.0) from its effective start.
          }
        }
        chunk.alpha = ws.soloHeroHidden ? 0 : wordEntryAlpha;
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
        chunk.isAdlib = word.isAdlib;
        chunk._wordStart = word.wordStart;
        chunk.emphasisLevel = word.emphasisLevel;
        chunk.wordDuration = word.wordDuration;
        // Typography fields for per-phrase visual character
        (chunk as any)._letterSpacing = (word as any).letterSpacing ?? 0;
        (chunk as any)._isFiller = (word as any).isFiller === true;
        (chunk as any)._heroScore = (word as any).heroScore ?? 0;

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
      // Don't suppress if the "active" group is an adlib — let main text show
      const isActiveAdlib = (activeGroup as any).isAdlib === true;
      if (!isActiveAdlib && (tSec < activeGroup.start || tSec >= activeGroup.end)) {
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].alpha = 0;
          chunks[i].visible = false;
        }
      }
    }

    // Stash phrase age for hero smoke (read in _draw)
    if (activeGroupIdx >= 0) {
      const ag = groups[activeGroupIdx];
      this._smokePhraseAge = (tSec >= ag.start && tSec < ag.end) ? tSec - ag.start : 999;
    } else {
      this._smokePhraseAge = 999;
    }

    if (!this._evalFrame) {
      this._evalFrame = {
        timeMs: 0, beatIndex: 0, sectionIndex: 0,
        cameraX: 0, cameraY: 0, cameraZoom: 1, bgBlend: 0,
        particleColor: '#ffffff',
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
    frame.chunks = chunks;
    frame.particles = this._emptyParticles;
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

  private _sampleRegionLuminance(img: HTMLImageElement, percentile = 90): number {
    const W = 64;
    const H = 64;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(img, 0, 0, W, H);
    // Sample center 60% vertically — that's where lyrics live
    const yStart = Math.floor(H * 0.20);
    const yEnd = Math.floor(H * 0.80);
    const { data } = ctx.getImageData(0, yStart, W, yEnd - yStart);
    const lums: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      lums.push(0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b));
    }
    lums.sort((a, b) => a - b);
    return lums[Math.floor(lums.length * (percentile / 100))] ?? 0;
  }

  private _requiredScrimOpacity(bgLuminance: number, targetContrast = 4.5): number {
    // White (L=1.0) contrast ratio against background: (1.05) / (bgL + 0.05)
    // Solve for max bg luminance that achieves target: maxL = 1.05/target - 0.05
    const maxL = (1.05 / targetContrast) - 0.05; // ~0.183 for 4.5:1
    if (bgLuminance <= maxL) return 0;
    // Linear darkening: opacity needed to pull bgLuminance down to maxL
    return Math.min(0.78, 1 - maxL / bgLuminance);
  }

  private _drawContrastScrim(ctx: CanvasRenderingContext2D, opacity: number): void {
    if (opacity < 0.01) return;
    // Cinematic lens-shaped gradient: dark at center, transparent at top and bottom edges
    // This preserves the image's atmosphere while protecting the text zone
    const w = this.width;
    const h = this.height;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const a = opacity;
    grad.addColorStop(0, `rgba(0,0,0,${(a * 0.3).toFixed(3)})`);
    grad.addColorStop(0.25, `rgba(0,0,0,${(a * 0.7).toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(0,0,0,${a.toFixed(3)})`);
    grad.addColorStop(0.75, `rgba(0,0,0,${(a * 0.7).toFixed(3)})`);
    grad.addColorStop(1, `rgba(0,0,0,${(a * 0.3).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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
    const vignetteRange = 0.40 + 0.40 * (this._intensityScale - 1.0);
    const vignetteBase = 0.75 + 0.20 * (this._intensityScale - 1.0);
    const baseAlpha = (vignetteBase - this._vignetteEnergy * vignetteRange) * strength;
    const alpha = Math.max(0, baseAlpha - this._vignetteBeatPulse);
    if (alpha < 0.02) return;

    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(this._vignetteCanvas, 0, 0, w, h);
    this.ctx.globalAlpha = 1;
  }

  private cleanWord(text: string): string {
    return text.replace(/[^a-zA-Z'']/g, '').toLowerCase();
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
