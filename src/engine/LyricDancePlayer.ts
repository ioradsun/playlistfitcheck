/* cache-bust: 2026-03-01-V2-CONDUCTOR */
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
import { drawIcon, type IconGlyph, type IconStyle } from "@/lib/lyricIcons";
import {
  compileScene,
  computeEntryState,
  computeExitState,
  computeBehaviorState,
  type CompiledScene,
  type Keyframe,
  type ScenePayload,
} from "@/lib/sceneCompiler";
import { deriveTensionCurve, enrichSections } from "@/engine/directionResolvers";
import { getMoodGrade, buildGradeFilter, type MoodGrade } from "@/engine/moodGrades";
// getSectionTones removed — song-level grade model
// ColorEnhancer removed — single color model handles contrast directly
// ElementalEffects removed — single color model
import { PARTICLE_SYSTEM_MAP, ParticleEngine } from "@/engine/ParticleEngine";
import {
  isExactHeroTokenMatch,
  normalizeToken,
  resolveCinematicState,
  type ResolvedLineSettings,
  type ResolvedWordSettings,
} from "@/engine/cinematicResolver";
import { BeatConductor, type BeatState, type SubsystemResponse } from "@/engine/BeatConductor";
import { CameraRig, type SubjectFocus } from "@/engine/CameraRig";
import { computeTimingBudgets, type GroupTimingBudget, type WordTimingBudget } from "@/engine/EffectBudgeter";
import { revokeAnalyzerWorker } from "@/engine/audioAnalyzerWorker";

const LYRIC_DANCE_PLAYER_BUILD_STAMP = '[LyricDancePlayer] build: V2-CONDUCTOR-2026-03-01';

// ──────────────────────────────────────────────────────────────
// Types expected by ShareableLyricDance.tsx
// ──────────────────────────────────────────────────────────────

export interface LyricDanceData {
  id: string;
  user_id: string;
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
  tensionStage: string;
  tensionMotion: number;
  tensionParticles: number;
  tensionTypo: string;

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
  tensionStage: "—",
  tensionMotion: 0,
  tensionParticles: 0,
  tensionTypo: "—",

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
  tensionCurve: any[];
  wordDirectivesMap: Record<string, any>;
  lineSettings: Record<number, ResolvedLineSettings>;
  wordSettings: Record<string, ResolvedWordSettings>;
  particleConfig: {
    texture: string;
    system: string;
    density: number;
    speed: number;
  };
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
    ghostTrail?: boolean;
    ghostCount?: number;
    ghostSpacing?: number;
    ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial';
    heroTrackingExpand?: boolean;
    frozen?: boolean;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    isAnchor?: boolean;
    color?: string;
    entryStyle?: string;
    exitStyle?: string;
    emphasisLevel?: number;
    entryProgress?: number;
    exitProgress?: number;
    iconGlyph?: string;
    iconStyle?: 'outline' | 'filled' | 'ghost';
    iconPosition?: 'behind' | 'above' | 'beside' | 'replace';
    iconScale?: number;
    behavior?: string;
    letterIndex?: number;
    letterTotal?: number;
    letterDelay?: number;
    isLetterChunk?: boolean;
    isSoloHero?: boolean;
    isHeroWord?: boolean;
    visible: boolean;
    entryOffsetY?: number;
    entryOffsetX?: number;
    entryScale?: number;
    exitOffsetY?: number;
    exitScale?: number;
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

const BAKER_VERSION = 4;

const SIM_W = 96;
const SIM_H = 54;
const SPLIT_EXIT_STYLES = new Set(['scatter-letters', 'peel-off', 'peel-reverse', 'cascade-down', 'cascade-up']);

interface PixelSim {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buffer: Uint8ClampedArray;
  imageData: ImageData;
}

function createPixelSim(): PixelSim {
  const canvas = document.createElement('canvas');
  canvas.width = SIM_W;
  canvas.height = SIM_H;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(SIM_W, SIM_H);
  return { canvas, ctx, buffer: imageData.data, imageData };
}

class FireSim {
  private heat: Float32Array;
  private sim: PixelSim;
  private palette: Uint32Array;

  constructor(
    private colorMode: 'fire' | 'smoke' | 'ember',
    private cooling: number = 0.12,
  ) {
    this.heat = new Float32Array((SIM_H + 2) * SIM_W);
    this.sim = createPixelSim();
    this.palette = this.buildPalette(colorMode);
  }

  private buildPalette(mode: 'fire' | 'smoke' | 'ember'): Uint32Array {
    const p = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r = 0, g = 0, b = 0, a = 0;
      if (mode === 'fire') {
        r = Math.min(255, Math.floor(t < 0.5 ? t * 2 * 255 : 255));
        g = Math.min(255, Math.floor(t < 0.5 ? 0 : (t - 0.5) * 2 * 200));
        b = Math.min(255, Math.floor(t < 0.75 ? 0 : (t - 0.75) * 4 * 255));
        a = Math.min(255, Math.floor(t * 300));
      } else if (mode === 'smoke') {
        const gray = Math.floor(t * 180);
        r = gray; g = gray; b = gray + Math.floor(t * 30);
        a = Math.min(255, Math.floor(t * 200));
      } else {
        r = Math.min(255, Math.floor(t < 0.4 ? t * 2.5 * 180 : 180 + (t - 0.4) * 1.25 * 75));
        g = Math.min(255, Math.floor(t < 0.5 ? t * 100 : 100 + (t - 0.5) * 2 * 155));
        b = Math.min(255, Math.floor(t < 0.3 ? t * 3 * 120 : Math.max(0, 120 - (t - 0.3) * 170)));
        a = Math.min(255, Math.floor(t * 280));
      }
      p[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
    return p;
  }

  update(intensity: number, beatPulse: number): void {
    const W = SIM_W;
    const H = SIM_H;
    const heat = this.heat;
    const seedHeat = intensity * 0.9 + beatPulse * 0.8;
    for (let x = 0; x < W; x++) {
      const seed = Math.random();
      heat[(H + 1) * W + x] = seed < 0.6 ? seedHeat + Math.random() * 0.1 : 0;
      heat[H * W + x] = seed < 0.7 ? seedHeat * 0.8 : 0;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const below1 = heat[(y + 1) * W + x];
        const below2 = heat[(y + 2) * W + x];
        const left = heat[(y + 1) * W + Math.max(0, x - 1)];
        const right = heat[(y + 1) * W + Math.min(W - 1, x + 1)];
        heat[y * W + x] = Math.max(0, (below1 + below2 + left + right) / 4 - this.cooling);
      }
    }
    const buf = this.sim.buffer;
    for (let i = 0; i < W * H; i++) {
      const heatVal = Math.min(255, Math.floor(heat[i] * 255));
      const color = this.palette[heatVal];
      const idx = i * 4;
      buf[idx] = color & 0xff;
      buf[idx + 1] = (color >> 8) & 0xff;
      buf[idx + 2] = (color >> 16) & 0xff;
      buf[idx + 3] = (color >> 24) & 0xff;
    }
    this.sim.ctx.putImageData(this.sim.imageData, 0, 0);
  }

  get canvas(): HTMLCanvasElement { return this.sim.canvas; }
}

class WaterSim {
  private buf1 = new Float32Array(SIM_W * SIM_H);
  private buf2 = new Float32Array(SIM_W * SIM_H);
  private sim = createPixelSim();
  private dominantColor: [number, number, number];
  private accentColor: [number, number, number];

  constructor(dominant: string, accent: string) {
    this.dominantColor = this.hexToRgb(dominant);
    this.accentColor = this.hexToRgb(accent);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  disturb(x: number, y: number, strength: number): void {
    const ix = Math.floor(x * SIM_W);
    const iy = Math.floor(y * SIM_H);
    if (ix > 0 && ix < SIM_W - 1 && iy > 0 && iy < SIM_H - 1) this.buf1[iy * SIM_W + ix] = strength;
  }

  update(tSec: number, beatPulse: number, intensity: number): void {
    const W = SIM_W;
    const H = SIM_H;
    if (Math.random() < 0.08 + intensity * 0.15) this.disturb(Math.random(), Math.random() * 0.7, 0.8 + Math.random() * 0.4);
    if (beatPulse > 0.5) this.disturb(0.5, 0.5, beatPulse * 1.2 + Math.sin(tSec * 0.1) * 0.05);
    const damping = 0.985;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        const wave = (this.buf1[(y - 1) * W + x] + this.buf1[(y + 1) * W + x] + this.buf1[y * W + x - 1] + this.buf1[y * W + x + 1]) / 2 - this.buf2[idx];
        this.buf2[idx] = wave * damping;
      }
    }
    const temp = this.buf1;
    this.buf1 = this.buf2;
    this.buf2 = temp;
    const [dr, dg, db] = this.dominantColor;
    const [ar, ag, ab] = this.accentColor;
    const buf = this.sim.buffer;
    for (let i = 0; i < W * H; i++) {
      const wave = this.buf1[i];
      const t = Math.max(0, Math.min(1, wave * 0.5 + 0.5));
      const idx = i * 4;
      buf[idx] = Math.min(255, Math.floor(dr * (1 - t) * 0.3 + ar * t * 0.6));
      buf[idx + 1] = Math.min(255, Math.floor(dg * (1 - t) * 0.3 + ag * t * 0.6));
      buf[idx + 2] = Math.min(255, Math.floor(Math.min(255, db * 0.4 + ab * t * 0.8 + wave * 80)));
      buf[idx + 3] = Math.floor(120 + t * 80);
    }
    this.sim.ctx.putImageData(this.sim.imageData, 0, 0);
  }

  get canvas(): HTMLCanvasElement { return this.sim.canvas; }
}

class AuroraSim {
  private sim = createPixelSim();
  private colors: Array<[number, number, number]>;

  constructor(dominant: string, accent: string) {
    this.colors = [this.hexToRgb(dominant), this.hexToRgb(accent), [0, 200, 180], [120, 80, 200]];
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  update(tSec: number, intensity: number): void {
    const W = SIM_W;
    const H = SIM_H;
    const buf = this.sim.buffer;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        const ny = y / H;
        let r = 0, g = 0, b = 0, a = 0;
        for (let band = 0; band < 4; band++) {
          const bandY = 0.1 + band * 0.18 + Math.sin(tSec * 0.3 + band * 1.4) * 0.06;
          const bandW = 0.06 + band * 0.02 + Math.sin(tSec * 0.2 + band) * 0.02;
          const dist = Math.abs(ny - bandY) / bandW;
          if (dist > 1) continue;
          const wave = Math.sin(nx * 8 + tSec * 0.5 + band * 2) * 0.3 + 0.7;
          const brightness = (1 - dist) * wave * intensity * 0.6;
          const [cr, cg, cb] = this.colors[band % this.colors.length];
          r += cr * brightness; g += cg * brightness; b += cb * brightness; a += brightness * 180;
        }
        const idx = (y * W + x) * 4;
        buf[idx] = Math.min(255, Math.floor(r));
        buf[idx + 1] = Math.min(255, Math.floor(g));
        buf[idx + 2] = Math.min(255, Math.floor(b));
        buf[idx + 3] = Math.min(255, Math.floor(a));
      }
    }
    this.sim.ctx.putImageData(this.sim.imageData, 0, 0);
  }

  get canvas(): HTMLCanvasElement { return this.sim.canvas; }
}

class RainSim {
  private drops: Array<{ x: number; y: number; speed: number; length: number; alpha: number }>;
  private sim = createPixelSim();
  private accentColor: [number, number, number];

  constructor(accent: string) {
    this.accentColor = this.hexToRgb(accent);
    this.drops = Array.from({ length: 80 }, (_, i) => ({
      x: (i * 0.618033) % 1,
      y: (i * 0.381966) % 1,
      speed: 0.008 + (i * 0.618033 % 1) * 0.012,
      length: 0.03 + (i * 0.381966 % 1) * 0.06,
      alpha: 0.2 + (i % 5) * 0.08,
    }));
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  update(_tSec: number, intensity: number, beatPulse: number): void {
    const W = SIM_W;
    const H = SIM_H;
    const buf = this.sim.buffer;
    for (let i = 0; i < W * H * 4; i += 4) {
      buf[i] = 5; buf[i + 1] = 5; buf[i + 2] = 8; buf[i + 3] = 255;
    }
    const [ar, ag, ab] = this.accentColor;
    for (const drop of this.drops) {
      drop.y = (drop.y + drop.speed * (1 + beatPulse * 0.5)) % 1;
      const x = Math.floor(drop.x * W);
      const y1 = Math.floor(drop.y * H);
      const y2 = Math.floor((drop.y + drop.length) * H);
      const alpha = Math.floor(drop.alpha * intensity * 255);
      const denom = Math.max(1, y2 - y1);
      for (let py = y1; py < Math.min(y2, H); py++) {
        const t = (py - y1) / denom;
        const idx = (py * W + x) * 4;
        buf[idx] = Math.min(255, ar + Math.floor(t * 30));
        buf[idx + 1] = Math.min(255, ag + Math.floor(t * 30));
        buf[idx + 2] = Math.min(255, ab + Math.floor(t * 40));
        buf[idx + 3] = Math.floor(alpha * (1 - t * 0.5));
      }
    }
    this.sim.ctx.putImageData(this.sim.imageData, 0, 0);
  }

  get canvas(): HTMLCanvasElement { return this.sim.canvas; }
}

// ═══ BeatVisSim: Always-on beat-reactive visualizer ═══
// Higher-res (192×108) beat-reactive visualizer that runs throughout the entire song.
// Style changes per section keyword but is ALWAYS present.
type BeatVisStyle = 'bars' | 'mirror-bars' | 'wave' | 'pulse' | 'rings';
const VIS_W = 192;
const VIS_H = 108;

class BeatVisSim {
  private visCanvas: HTMLCanvasElement;
  private visCtx: CanvasRenderingContext2D;
  private buf: Uint8ClampedArray;
  private imageData: ImageData;
  private bars: Float32Array;
  private barTargets: Float32Array;
  private palette: [number, number, number];
  private style: BeatVisStyle;

  constructor(accent: string, style: BeatVisStyle = 'bars') {
    this.visCanvas = document.createElement('canvas');
    this.visCanvas.width = VIS_W;
    this.visCanvas.height = VIS_H;
    this.visCtx = this.visCanvas.getContext('2d')!;
    this.imageData = this.visCtx.createImageData(VIS_W, VIS_H);
    this.buf = this.imageData.data;
    this.bars = new Float32Array(VIS_W);
    this.barTargets = new Float32Array(VIS_W);
    this.palette = this.hexToRgb(accent);
    this.style = style;
  }

  private hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  setAccent(hex: string): void { this.palette = this.hexToRgb(hex); }
  setStyle(s: BeatVisStyle): void { this.style = s; }

  update(tSec: number, intensity: number, beatPulse: number): void {
    const W = VIS_W;
    const H = VIS_H;
    const buf = this.buf;

    // Clear to transparent
    for (let i = 0; i < W * H * 4; i += 4) {
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
    }

    const [pr, pg, pb] = this.palette;
    const energy = intensity * 0.7 + beatPulse * 0.85;

    if (this.style === 'bars') {
      this.updateBarTargets(W, energy, beatPulse, tSec);
      this.smoothBars(W);
      // Render bars rising from bottom
      for (let x = 0; x < W; x++) {
        const barH = Math.floor(this.bars[x] * H * 0.92);
        for (let y = H - 1; y >= H - barH && y >= 0; y--) {
          const t = (H - y) / Math.max(1, barH);
          const idx = (y * W + x) * 4;
          const bright = 0.35 + t * 0.65;
          buf[idx] = Math.min(255, Math.floor(pr * bright));
          buf[idx + 1] = Math.min(255, Math.floor(pg * bright));
          buf[idx + 2] = Math.min(255, Math.floor(pb * bright));
          buf[idx + 3] = Math.min(255, Math.floor((210 + beatPulse * 45) * (0.45 + t * 0.55)));
        }
      }
    } else if (this.style === 'mirror-bars') {
      this.updateBarTargets(W, energy, beatPulse, tSec);
      this.smoothBars(W);
      // Mirror: bars grow from center line outward (up + down)
      const midY = Math.floor(H * 0.45);
      for (let x = 0; x < W; x++) {
        const halfH = Math.floor(this.bars[x] * midY * 0.9);
        for (let d = 0; d < halfH; d++) {
          const t = d / Math.max(1, halfH);
          const bright = 0.5 + (1 - t) * 0.5;
          const alpha = Math.min(255, Math.floor((220 + beatPulse * 35) * (1 - t * 0.5)));
          // Up from center
          const yUp = midY - d;
          if (yUp >= 0) {
            const idx = (yUp * W + x) * 4;
            buf[idx] = Math.min(255, Math.floor(pr * bright));
            buf[idx + 1] = Math.min(255, Math.floor(pg * bright));
            buf[idx + 2] = Math.min(255, Math.floor(pb * bright));
            buf[idx + 3] = alpha;
          }
          // Down from center
          const yDown = midY + d;
          if (yDown < H) {
            const idx = (yDown * W + x) * 4;
            buf[idx] = Math.min(255, Math.floor(pr * bright * 0.7));
            buf[idx + 1] = Math.min(255, Math.floor(pg * bright * 0.7));
            buf[idx + 2] = Math.min(255, Math.floor(pb * bright * 0.7));
            buf[idx + 3] = Math.floor(alpha * 0.6);
          }
        }
      }
    } else if (this.style === 'wave') {
      // Dual sine-wave bands that ride on beat energy
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        const wave1 = Math.sin(nx * Math.PI * 4 + tSec * 3) * energy * 0.4
          + Math.sin(nx * Math.PI * 7 - tSec * 2) * beatPulse * 0.3;
        const wave2 = Math.sin(nx * Math.PI * 3 - tSec * 1.8) * energy * 0.25
          + Math.cos(nx * Math.PI * 5 + tSec * 2.5) * beatPulse * 0.2;
        const cy1 = H - 6 - Math.abs(wave1) * H * 0.55;
        const cy2 = H - 8 - Math.abs(wave2) * H * 0.35;
        const thick1 = 3 + energy * 4;
        const thick2 = 2 + energy * 2.5;
        // Wave 1 (primary)
        for (let y = Math.max(0, Math.floor(cy1 - thick1)); y < Math.min(H, Math.ceil(cy1 + thick1)); y++) {
          const dist = Math.abs(y - cy1) / thick1;
          const alpha = (1 - dist) * (160 + beatPulse * 95);
          const idx = (y * W + x) * 4;
          buf[idx] = Math.min(255, Math.floor(pr * (0.5 + (1 - dist) * 0.5)));
          buf[idx + 1] = Math.min(255, Math.floor(pg * (0.5 + (1 - dist) * 0.5)));
          buf[idx + 2] = Math.min(255, Math.floor(pb * (0.5 + (1 - dist) * 0.5)));
          buf[idx + 3] = Math.min(255, Math.floor(alpha));
        }
        // Wave 2 (secondary — dimmer)
        for (let y = Math.max(0, Math.floor(cy2 - thick2)); y < Math.min(H, Math.ceil(cy2 + thick2)); y++) {
          const dist = Math.abs(y - cy2) / thick2;
          const alpha = (1 - dist) * (80 + beatPulse * 60);
          const idx = (y * W + x) * 4;
          buf[idx] = Math.max(buf[idx], Math.min(255, Math.floor(pr * 0.6)));
          buf[idx + 1] = Math.max(buf[idx + 1], Math.min(255, Math.floor(pg * 0.6)));
          buf[idx + 2] = Math.max(buf[idx + 2], Math.min(255, Math.floor(pb * 0.6)));
          buf[idx + 3] = Math.max(buf[idx + 3], Math.min(255, Math.floor(alpha)));
        }
      }
    } else if (this.style === 'rings') {
      // Concentric arcs expanding from bottom center on each beat
      const cx = W / 2;
      const cy = H + 4;
      const maxR = H * 0.95;
      // 3 staggered rings at different expansion phases
      for (let ring = 0; ring < 3; ring++) {
        const phase = (tSec * 1.5 + ring * 0.33) % 1;
        const ringR = phase * maxR;
        const ringWidth = 3 + energy * 3 + beatPulse * 2;
        const ringAlpha = (1 - phase) * (0.6 + beatPulse * 0.4);
        const yStart = Math.max(0, Math.floor(cy - maxR));
        for (let y = yStart; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const fromRing = Math.abs(dist - ringR);
            if (fromRing > ringWidth) continue;
            const t = 1 - fromRing / ringWidth;
            const alpha = t * ringAlpha * 220;
            const idx = (y * W + x) * 4;
            buf[idx] = Math.max(buf[idx], Math.min(255, Math.floor(pr * t)));
            buf[idx + 1] = Math.max(buf[idx + 1], Math.min(255, Math.floor(pg * t)));
            buf[idx + 2] = Math.max(buf[idx + 2], Math.min(255, Math.floor(pb * t)));
            buf[idx + 3] = Math.max(buf[idx + 3], Math.min(255, Math.floor(alpha)));
          }
        }
      }
    } else {
      // Pulse: radial arc expanding from bottom center
      const cx = W / 2;
      const cy = H;
      const maxR = H * 0.9;
      const pulseR = energy * maxR + beatPulse * maxR * 0.4;
      for (let y = Math.max(0, Math.floor(cy - maxR)); y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > pulseR + 4) continue;
          const ring = Math.abs(dist - pulseR);
          if (ring > 5) continue;
          const alpha = (1 - ring / 5) * (140 + beatPulse * 115);
          const idx = (y * W + x) * 4;
          buf[idx] = Math.min(255, Math.floor(pr));
          buf[idx + 1] = Math.min(255, Math.floor(pg));
          buf[idx + 2] = Math.min(255, Math.floor(pb));
          buf[idx + 3] = Math.min(255, Math.floor(alpha));
        }
      }
    }

    this.visCtx.putImageData(this.imageData, 0, 0);
  }

  private updateBarTargets(W: number, energy: number, beatPulse: number, tSec: number): void {
    for (let x = 0; x < W; x++) {
      const freq = x / W;
      const centerBias = 1.0 - Math.abs(freq - 0.5) * 1.2;
      const spectral = Math.sin(tSec * (2 + freq * 8) + x * 0.3) * 0.3 + 0.5;
      this.barTargets[x] = Math.min(1, energy * centerBias * spectral * 2.0 + beatPulse * 0.5 * centerBias);
    }
  }

  private smoothBars(W: number): void {
    for (let x = 0; x < W; x++) {
      if (this.barTargets[x] > this.bars[x]) {
        this.bars[x] += (this.barTargets[x] - this.bars[x]) * 0.65;
      } else {
        this.bars[x] += (this.barTargets[x] - this.bars[x]) * 0.1;
      }
    }
  }

  get canvas(): HTMLCanvasElement { return this.visCanvas; }
}

// ═══ Hero Decomposition Particles ═══
// When a solo hero word (≥500ms) exits, it "freezes" then shatters into particles.
interface HeroDecompParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  color: string;
  shape: 'shard' | 'dust' | 'glow';
}

interface HeroDecompBurst {
  wordId: string;
  particles: HeroDecompParticle[];
  startTime: number;   // ms
  duration: number;     // ms
  originX: number;
  originY: number;
}

interface EmotionalEvent {
  type: 'soul-flare' | 'void-moment' | 'light-break' | 'heartbeat' | 'color-drain' | 'lens-breath' | 'halo-ring' | 'echo-ghost' | 'tremor' | 'golden-rain' | 'world-shift';
  triggerRatio: number;
  intensity: number;
  duration: number;
  triggered: boolean;
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
}



// ──────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────

export class LyricDancePlayer {
  static RESOLUTIONS = {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
  };

  // DOM (React passes these in; engine owns them after construction)
  private bgCanvas: HTMLCanvasElement;
  private textCanvas: HTMLCanvasElement;
  private container: HTMLDivElement;

  // Canvas core
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = window.devicePixelRatio || 1;
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

  // Public debug surface (React reads this)
  public debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };
  public resolvedState: ResolvedPlayerState = {
    chapters: [],
    tensionCurve: [],
    wordDirectivesMap: {},
    lineSettings: {},
    wordSettings: {},
    particleConfig: { texture: 'dust', system: 'dust', density: 0.35, speed: 0.35 },
  };
  

  // Public writeable surface (React pushes comments here)
  public constellationNodes: any[] = [];

  // Data
  private data: LyricDanceData;
  private payload: ScenePayload | null = null;

  // Runtime chunks
  private chunks: Map<string, ChunkState> = new Map();
  private _lastFont = '';
  private _sortBuffer: ScaledKeyframe['chunks'] = [];
  private _boundsBuffer: ChunkBounds[] = [];
  private _textMetricsCache = new Map<string, { width: number; ascent: number; descent: number }>();
  private _lastVisibleChunkIds = '';
  private _solvedBounds: ChunkBounds[] = [];

  // ═══ Compiled Scene (replaces timeline) ═══
  private compiledScene: CompiledScene | null = null;

  // ═══ BeatConductor — single rhythmic driver ═══
  private conductor: BeatConductor | null = null;
  private cameraRig: CameraRig = new CameraRig();
  private _lastBeatState: BeatState | null = null;
  private _lastSubsystemResponse: SubsystemResponse | null = null;

  // ═══ EffectBudgeter — compile-time timing guarantees ═══
  private timingBudgets: GroupTimingBudget[] = [];
  private _wordBudgetMap: Map<string, WordTimingBudget> = new Map();

  // ═══ Instance-level bake cache (no globals) ═══
  private _bakeLock = false;
  private _bakePromise: Promise<void> | null = null;
  private _bakedScene: CompiledScene | null = null;
  private _bakedChunkCache: Map<string, ChunkState> | null = null;
  private _bakedVersion = 0;
  private _bakedHasCinematicDirection = false;

  // Runtime evaluator state
  private _evalChunkPool: Array<ScaledKeyframe['chunks'][number]> = [];
  private _activeGroupIndices: number[] = [];

  // Beat-reactive state (evaluated incrementally)
  private _beatCursor = 0;
  private _springOffset = 0;
  private _springVelocity = 0;
  private _lastBeatIndex = -1;
  private _smoothedTime = 0;
  private _frameDt = 1.0;          // normalized dt (1.0 = 60fps), set by tick()
  private _lastRawTime = 0;
  private _timeInitialized = false;

  // Viewport scale (replaces timelineScale for runtime use)
  private _viewportSx = 1;
  private _viewportSy = 1;
  private _viewportFontScale = 1;
  private _evalFrame: ScaledKeyframe | null = null;

  // Background cache
  private bgCaches: HTMLCanvasElement[] = [];
  private bgCacheCount = 0;
  public chapterParticleSystems: (string | null)[] = [];

  private backgroundSystem = 'default';
  private chapterSims: Array<{ fire?: FireSim; water?: WaterSim; aurora?: AuroraSim; rain?: RainSim; beatVis?: BeatVisSim }> = [];
  private _globalBeatVis: BeatVisSim | null = null; // always-on beat visualizer
  private _beatVisStyles: BeatVisStyle[] = [];
  private lastSimFrame = -1;
  private currentSimCanvases: HTMLCanvasElement[] = [];
  private _beatVisCanvas: HTMLCanvasElement | null = null; // separate from themed sims
  private chapterImages: HTMLImageElement[] = [];
  /** Pre-blurred versions of chapter images — eliminates per-frame ctx.filter blur() cost */
  private _preBlurredImages: HTMLCanvasElement[] = [];
  // Ken Burns per-chapter parameters — computed once on image load
  private _kenBurnsParams: Array<{
    zoomStart: number;
    zoomEnd: number;
    panStartX: number;
    panStartY: number;
    panEndX: number;
    panEndY: number;
  }> = [];
  private _bgBlurCurrent = 3;
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
  // ═══ Per-frame caches — computed once in tick(), reused everywhere ═══
  private _frameSectionIdx = -1;
  private _framePalette: string[] | null = null;
  private _framePaletteTime = -1; // audio time when palette was last resolved
  private emotionalEvents: EmotionalEvent[] = [];
  private activeEvents: Array<{ event: EmotionalEvent; startTime: number }> = [];

  // Reusable 1×1 canvas for text measurement (avoids per-recompile DOM allocation)
  private readonly _measureCanvas = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c; })();
  private readonly _measureCtx = this._measureCanvas.getContext('2d')!;

  // Comment comets
  private activeComments: CommentChunk[] = [];
  private commentColors = ['#FFD700', '#00FF87', '#FF6B6B', '#88CCFF', '#FF88FF'];
  private commentColorIdx = 0;

  // Hero word decomposition bursts
  private _heroDecompBursts: HeroDecompBurst[] = [];
  private _heroDecompSpawned: Set<string> = new Set(); // track which words already burst

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

  // ═══ Pre-computed hero word schedule for camera lookahead ═══
  private _heroSchedule: Array<{ startSec: number; endSec: number; emphasis: number; word: string }> = [];
  private _heroLookaheadMs = 400; // anticipate hero words 400ms before they appear
  private activeSectionTexture = 'dust';
  private activeTension: any = null;
  private chunkActiveSinceMs: Map<string, number> = new Map();


  // Health monitor
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private currentTSec = 0;

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

  constructor(
    data: LyricDanceData,
    bgCanvas: HTMLCanvasElement,
    textCanvas: HTMLCanvasElement,
    container: HTMLDivElement,
    options?: { bootMode?: "minimal" | "full" },
  ) {
    this.data = data;
    this.bgCanvas = bgCanvas;
    this.textCanvas = textCanvas;
    this.container = container;

    // Engine owns ONE canvas; we draw everything on bgCanvas.
    this.canvas = bgCanvas;
    this.ctx = bgCanvas.getContext("2d", { alpha: false })!;

    // Keep text canvas blank (React shell still mounts it).
    const tctx = textCanvas.getContext("2d", { alpha: true });
    if (tctx) tctx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    this.audio = new Audio(data.audio_url);
    this.audio.loop = true;
    this.audio.muted = true;
    this.audio.preload = "auto";
    this.bootMode = options?.bootMode ?? "full";

    console.info(LYRIC_DANCE_PLAYER_BUILD_STAMP);

    this.ambientParticleEngine = new ParticleEngine({
      particleSystem: this.resolvedState.particleConfig.system,
      particleDensity: this.resolvedState.particleConfig.density,
      particleSpeed: this.resolvedState.particleConfig.speed,
      particleOpacity: 0.4,
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
  }

  // Compatibility with existing React shell
  async init(): Promise<void> {
    this.perfMarks.tInitStart = performance.now();

    if (this.bootMode === "full") {
      await Promise.all([
        document.fonts.load('400 16px Montserrat'),
        document.fonts.load('700 16px Montserrat'),
        document.fonts.load('800 16px Montserrat'),
        document.fonts.load('900 16px Montserrat'),
      ]).catch(() => { /* font preload best-effort */ });
    }

    this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);
    this.displayWidth = this.width;
    this.displayHeight = this.height;
    this.drawMinimalFirstFrame();

    if (this.bootMode === "minimal") {
      this.startPlaybackClock();
      this.scheduleFullModeUpgrade();
      return;
    }

    await this.prepareFullMode();
    this.startPlaybackClock();
  }

  private startPlaybackClock(): void {
    if (this.destroyed) return;
    this.perfMarks.tClockStart = this.perfMarks.tClockStart ?? performance.now();
    this.audio.play().catch(() => {});
    this.playing = true;
    this.startHealthMonitor();
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  private scheduleFullModeUpgrade(): void {
    const run = () => {
      this.prepareFullMode().catch(() => {
        // keep minimal mode alive on upgrade errors
      });
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    window.setTimeout(() => {
      if (idle) {
        idle(run, { timeout: 1200 });
      } else {
        run();
      }
    }, 400);
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

        // ═══ V2: Create BeatConductor with full audio analysis ═══
        const songDuration = Math.max(0.1, this.songEndSec - this.songStartSec);
        const beatGridData = this.data.beat_grid ?? { bpm: 120, beats: [], confidence: 0 };
        this.conductor = new BeatConductor(beatGridData, songDuration);
        // Attach runtime analysis if available (has energy/brightness curves not stored in DB)
        if ((beatGridData as any)._analysis) {
          this.conductor.setAnalysis((beatGridData as any)._analysis);
        }
        console.info(`[V2] BeatConductor created: ${this.conductor.beatsPerMinute} BPM, ${this.conductor.totalBeats} beats, ${songDuration.toFixed(1)}s, hits: ${(beatGridData as any).hits?.length ?? 0}`);
        this.cameraRig.setBPM(this.conductor.beatsPerMinute);

        // ═══ V2: Compute timing budgets ═══
        if (compiled.phraseGroups?.length > 0 && this.conductor) {
          this.timingBudgets = computeTimingBudgets(compiled.phraseGroups as any, this.conductor);
          this._buildWordBudgetMap();
          console.info(`[V2] EffectBudgeter: ${this.timingBudgets.length} group budgets, ${this._wordBudgetMap.size} word budgets`);
        }

        // Build chunk cache from compiled scene
        this._buildChunkCacheFromScene(compiled);

        // Compute viewport scale
        this._updateViewportScale();
        this._textMetricsCache.clear();

        this._bakedScene = compiled;
        this._bakedChunkCache = new Map(this.chunks);
        this._bakedHasCinematicDirection = !!this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction);
        this._bakedVersion = BAKER_VERSION;
        this._bakeLock = false;
      })();
    }

    await this._bakePromise;

    // Restore from instance cache
    this.compiledScene = this._bakedScene;
    this.chunks = new Map(this._bakedChunkCache!);
    this._updateViewportScale();
    this._textMetricsCache.clear();
    if (this.audio.currentTime <= 0) {
      this.audio.currentTime = this.songStartSec;
    }
  }

  private enableFullVisualMode(): void {
    if (this.destroyed || this.fullModeEnabled) return;
    this.buildBgCache();
    this.deriveVisualSystems();
    this.buildChapterSims();
    this.buildEmotionalEvents();
    this.loadSectionImages().catch(() => {
      // image upgrade best-effort
    });
    this.fullModeEnabled = true;
    this.perfMarks.tFullModeEnabled = performance.now();
  }

  private drawMinimalFirstFrame(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    const bg = this.data.palette?.[0] ?? '#0b0b10';
    const accent = this.data.palette?.[1] ?? '#2b2b45';
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, bg);
    gradient.addColorStop(1, accent);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const firstLine = this.data.lyrics?.[0]?.text?.trim() || 'Loading lyrics…';
    this.ctx.fillStyle = 'rgba(255,255,255,0.92)';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = '700 32px "Montserrat", sans-serif';
    this.ctx.fillText(firstLine, this.width / 2, this.height / 2);
    this.perfMarks.tFirstFrameDrawn = this.perfMarks.tFirstFrameDrawn ?? performance.now();
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

  async load(payload: ScenePayload, onProgress: (pct: number) => void): Promise<Map<string, ChunkState>> {
    try {
      this.payload = payload;
      this._songGrade = null; // force recomputation for new song
      this.resolvePlayerState(payload);
      this.songStartSec = payload.songStart;
      this.songEndSec = payload.songEnd;

      this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);
      const compiled = compileScene(payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
      this.compiledScene = compiled;
      this._buildChunkCacheFromScene(compiled);
      this._updateViewportScale();
      this._textMetricsCache.clear();
      const chunkSnapshot = new Map(this.chunks);
      this.buildBgCache();
      this.deriveVisualSystems();
      this.buildChapterSims();
      this.buildEmotionalEvents();
      onProgress(100);
      return chunkSnapshot;
    } catch (err) {
      
      throw err;
    }
  }

  play(): void {
    if (this.destroyed) return;
    this.playing = true;
    this.audio.play().catch(() => {});
    this.startHealthMonitor();
    // Restart the RAF loop — it stops when playing becomes false
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

  seek(timeSec: number): void {
    this.audio.currentTime = timeSec;
    const t = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (t - this.songStartSec) * 1000);
    this._beatCursor = 0;
    this._lastBeatIndex = -1;
    this._springOffset = 0;
    this._springVelocity = 0;
    this._timeInitialized = false;
    this.conductor?.resetCursor();
    this.cameraRig.reset();
    this._heroDecompBursts.length = 0;
    this._heroDecompSpawned.clear();
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

  resize(logicalW: number, logicalH: number): void {
    const w = Math.max(1, Math.floor(logicalW));
    const h = Math.max(1, Math.floor(logicalH));
    this.width = w;
    this.height = h;

    // Single source of truth for canvas dimensions.
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // Keep the stacked canvas matched, but never draw to it.
    this.textCanvas.width = this.canvas.width;
    this.textCanvas.height = this.canvas.height;
    this.textCanvas.style.width = `${w}px`;
    this.textCanvas.style.height = `${h}px`;

    if (this.payload) this.buildBgCache();
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._preBlurredImages = []; // invalidate — will use runtime blur fallback until reload
    this.ambientParticleEngine?.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
    this._lastVisibleChunkIds = '';
    this.cameraRig.setViewport(w, h);
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
    if (!muted) this.audio.play().catch(() => {});
  }

  updateCinematicDirection(direction: CinematicDirection): void {
    // Direct pass-through — new schema consumed directly by resolvers
    this.data = { ...this.data, cinematic_direction: direction };
    if (!this.payload) return;
    this.payload = { ...this.payload, cinematic_direction: direction };
    this._songGrade = null; // cinematic direction changed — recompute grade
    this.resolvePlayerState(this.payload);
    this.compiledScene = compileScene(this.payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
    this._buildChunkCacheFromScene(this.compiledScene);
    this._updateViewportScale();
    this._textMetricsCache.clear();
    // ═══ V2: Recompute timing budgets with conductor ═══
    if (this.compiledScene?.phraseGroups?.length > 0 && this.conductor) {
      this.timingBudgets = computeTimingBudgets(this.compiledScene.phraseGroups as any, this.conductor);
      this._buildWordBudgetMap();
    }
    this.buildBgCache();
    this.deriveVisualSystems();
    this.buildChapterSims();
    this.buildEmotionalEvents();
  }

  updateSectionImages(urls: string[]): void {
    
    this.data = { ...this.data, section_images: urls };
    this.loadSectionImages();
  }

  updateSceneContext(sceneCtx: SceneContext): void {
    
    this.data = { ...this.data, scene_context: sceneCtx };
  }

  /** Hot-patch auto_palettes and recompile scene so word colors update */
  updateAutoPalettes(palettes: string[][]): void {
    if (!palettes?.length) return;
    console.log('[auto-palette] updateAutoPalettes received:', palettes.length, 'text color[0]:', palettes[0]?.[2]);
    (this as any)._paletteDiagLogged = false; // reset so next getResolvedPalette logs the new state
    this.data = { ...this.data, auto_palettes: palettes };
    // Recompile scene with fresh palette data
    if (this.payload) {
      this.payload = { ...this.payload, auto_palettes: palettes };
      const compiled = compileScene(this.payload, { viewportWidth: this.width || 960, viewportHeight: this.height || 540 });
      this.compiledScene = compiled;
      this._buildChunkCacheFromScene(compiled);
      this._textMetricsCache.clear();
    }
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
    this.bgCaches = [];
    this.bgCacheCount = 0;

    this.audio.pause();
    this.audio.src = "";
    this._timeInitialized = false;

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.currentSimCanvases = [];
    this.ambientParticleEngine?.clear();
    this.chapterSims = [];
    this.chapterImages = [];
    this._preBlurredImages = [];
    this._lightingOverlayCanvas = null;
    this._grainCanvas = null;
    this._grainPool = [];
    this._textMetricsCache.clear();
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
      const fps = this.frameCount / 5;
      this.frameCount = 0;
      if (fps > 0 && fps < 20 && this.playing) {
        console.warn(`[LyricEngine] low fps: ${fps.toFixed(1)} — consider reducing effects`);
      }
    }, 5000);
  }

  /** Build O(1) lookup from wordId → WordTimingBudget for evaluateFrame. */
  private _buildWordBudgetMap(): void {
    this._wordBudgetMap.clear();
    for (const group of this.timingBudgets) {
      for (const wb of group.words) {
        this._wordBudgetMap.set(wb.wordId, wb);
      }
    }
  }

  private stopHealthMonitor(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private tick = (timestamp: number): void => {
    if (this.destroyed) return;
    if (!this.playing) {
      this.rafHandle = 0;
      return;
    }

    try {
      const deltaMs = Math.min(timestamp - (this.lastTimestamp || timestamp), 100);
      this.lastTimestamp = timestamp;

      // ALWAYS start frame with this exact sequence
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.clearRect(0, 0, this.width, this.height);

      const rawTime = this.audio.currentTime;
      const smoothedTime = this.smoothAudioTime(rawTime);

      // ═══ V2: Get beat state ONCE from conductor ═══
      const beatState = this.conductor?.getState(smoothedTime) ?? null;
      this._lastBeatState = beatState;
      this._frameDt = Math.min(deltaMs, 33.33) / 16.67; // normalized to 60fps

      // ═══ Per-frame caches: section index + palette ═══
      {
        const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
        const sections = (cd?.sections as any[]) ?? (cd?.chapters as any[]) ?? [];
        const dur = this.audio?.duration || 1;
        this._frameSectionIdx = sections.length > 0
          ? this.resolveSectionIndex(sections, smoothedTime, dur)
          : -1;
        // Palette: only re-resolve if section changed
        const secIdx = this._frameSectionIdx;
        if (secIdx !== this._framePaletteTime) {
          this._framePaletteTime = secIdx;
          this._framePalette = this._resolveCurrentPalette(secIdx);
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

        const focus: SubjectFocus = {
          x: this.width / 2,
          y: this.height / 2,
          heroActive: upcoming !== null && !upcoming.isAnticipation,
          emphasisLevel: upcoming?.emphasis ?? 0,
          isClimax,
          vocalActive,
          heroApproaching: upcoming?.isAnticipation ?? false,
        };
        this.cameraRig.update(deltaMs, beatState, focus);
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

  private smoothAudioTime(rawTime: number): number {
    // On first call or after seek, snap immediately
    if (!this._timeInitialized || Math.abs(rawTime - this._lastRawTime) > 0.5) {
      this._smoothedTime = rawTime;
      this._timeInitialized = true;
      this._lastRawTime = rawTime;
      return rawTime;
    }

    this._lastRawTime = rawTime;

    // Lerp toward real time — smooths out audio buffer jitter
    // 0.2 = responsive enough to not drift, smooth enough to hide 1-frame jitter
    const alpha = 0.2;
    this._smoothedTime += (rawTime - this._smoothedTime) * alpha;

    // Never drift more than 100ms from real time
    if (Math.abs(this._smoothedTime - rawTime) > 0.1) {
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
    return this._framePalette ?? this._resolveCurrentPalette(this._frameSectionIdx);
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
    console.log(`[fonts] typography=${typoKey ?? 'default'} → loading "${fontName}"`);

    try {
      // Inject Google Fonts <link> tag if not already present
      if (typeof document !== 'undefined') {
        const encodedFamily = fontName.replace(/\s+/g, '+');
        const linkId = `gfont-${encodedFamily}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement('link');
          link.id = linkId;
          link.rel = 'stylesheet';
          link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@400;500;600;700;800;900&display=swap`;
          document.head.appendChild(link);
          console.log(`[fonts] injected Google Fonts link for "${fontName}"`);
        }
        // Wait for font to actually load (with timeout)
        await Promise.race([
          document.fonts.load(`700 48px "${fontName}"`),
          new Promise<void>(resolve => setTimeout(resolve, 2000)),
        ]);
        const loaded = document.fonts.check(`700 48px "${fontName}"`);
        console.log(`[fonts] "${fontName}" loaded: ${loaded}`);
      }
    } catch (e) {
      console.warn(`[fonts] Failed to load "${fontName}":`, e);
    }
  }


  /**
   * Computes a combined 2D affine matrix for:
   *   translate(tx, ty) → rotate(r) → skewX(s) → scale(sx, sy)
   * Returns the 6 parameters for ctx.setTransform(a, b, c, d, e, f)
   * Pre-multiplied by DPR.
   */
  private computeTransformMatrix(
    tx: number,
    ty: number,
    rotation: number,
    skewXDeg: number,
    sx: number,
    sy: number,
  ): [number, number, number, number, number, number] {
    const dpr = this.dpr;
    if (rotation === 0 && skewXDeg === 0 && sx === 1 && sy === 1) {
      return [dpr, 0, 0, dpr, tx * dpr, ty * dpr];
    }

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const skewTan = skewXDeg !== 0 ? Math.tan((skewXDeg * Math.PI) / 180) : 0;

    const a = cos * sx * dpr;
    const b = sin * sx * dpr;
    const c = (cos * skewTan - sin) * sy * dpr;
    const d = (sin * skewTan + cos) * sy * dpr;
    const e = tx * dpr;
    const f = ty * dpr;

    return [a, b, c, d, e, f];
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
      const texture = section?.texture ?? this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, cd) ?? "dust";
      this.activeSectionTexture = texture;
      const mapped = (PARTICLE_SYSTEM_MAP as Record<string, string | undefined>)[texture?.toLowerCase?.() ?? ""]?.toLowerCase?.() ?? texture;
      this.ambientParticleEngine?.setSystem(mapped);
      this.ambientParticleEngine?.setConfig({
        system: mapped,
        density: this.resolvedState.particleConfig.density ?? 0.35,
        speed: this.resolvedState.particleConfig.speed ?? 0.35,
        opacity: 0.4,
        beatReactive: true,
      });

      // Cache tension for this section
      this.activeTension = this.resolvedState.tensionCurve.find(
        (ts: any) => songProgress >= (ts.startRatio ?? 0) && songProgress <= (ts.endRatio ?? 1)
      ) ?? this.resolvedState.tensionCurve[0] ?? null;
    }

    // ═══ V2: Use conductor for particle intensity instead of tension curve ═══
    const conductorResponse = beatState ? this.conductor?.getSubsystemResponse(beatState, 2) ?? null : null;
    this._lastSubsystemResponse = conductorResponse;
    const currentTension = this.activeTension;
    if (conductorResponse) {
      this.ambientParticleEngine?.setDensityMultiplier(conductorResponse.particleDensity * 2);
      this.ambientParticleEngine?.setSpeedMultiplier(conductorResponse.particleSpeed * 2);
    } else {
      this.ambientParticleEngine?.setDensityMultiplier((currentTension?.particleDensity ?? 0.5) * 2);
      this.ambientParticleEngine?.setSpeedMultiplier((currentTension?.motionIntensity ?? 0.5) * 2);
    }

    // ── Minimal debug state (always cheap) ──
    const ds = this.debugState;
    ds.time = clamped;
    ds.fps = Math.round(this.fpsAccum.fps);
    ds.songProgress = songProgress;
    ds.beatIntensity = beatState?.pulse ?? 0;

    // Heavy debug state — only when debug panel is open
    if ((this as any)._debugPanelOpen) {
      const visibleChunks = frame?.chunks.filter((c: any) => c.visible) ?? [];
      ds.wordCount = visibleChunks.length;
      ds.particleCount = this.ambientParticleEngine?.getActiveCount() ?? 0;

      const currentChapter = section;
      const cdAny = cd as any;
      ds.cdSceneTone = cdAny?.sceneTone ?? '—';
      ds.cdAtmosphere = cdAny?.atmosphere ?? '—';
      ds.cdMotion = cdAny?.motion ?? '—';
      ds.cdTypography = cdAny?.typography ?? '—';
      ds.cdTexture = cdAny?.texture ?? '—';
      ds.cdEmotionalArc = cdAny?.emotionalArc ?? '—';
      ds.dirThesis = cd?.thesis ?? '—';

      ds.dirChapter = sectionIndex >= 0 ? `${sectionIndex + 1}/${chapters.length}` : '—';
      const chapterStartR = (currentChapter as any)?.startRatio ?? 0;
      const chapterEndR = (currentChapter as any)?.endRatio ?? 1;
      const chapterRange = chapterEndR - chapterStartR;
      ds.dirChapterProgress = chapterRange > 0 ? Math.max(0, Math.min(1, (songProgress - chapterStartR) / chapterRange)) : 0;
      ds.dirIntensity = (currentChapter as any)?.emotionalIntensity ?? 0;
      ds.dirBgDirective = (currentChapter as any)?.bgDirective ?? (currentChapter as any)?.backgroundSystem ?? '—';
      ds.dirLightBehavior = (currentChapter as any)?.lightBehavior ?? (currentChapter as any)?.atmosphere ?? '—';

      const beatGrid = this.data?.beat_grid;
      const beatsArr = beatGrid?.beats ?? [];
      ds.bgBpm = beatGrid?.bpm ?? 0;
      ds.bgBeatsTotal = beatsArr.length;
      ds.bgConfidence = beatGrid?.confidence ?? 0;
      ds.bgNextBeat = beatState?.nextBeat ?? 0;
      ds.bgBeatPhase = beatState?.phase ?? 0;
      ds.bgBeatPulse = beatState?.pulse ?? 0;

      const activeWord = this.getActiveWord(clamped);
      const activeWordClean = normalizeToken(activeWord?.word ?? '');
      const activeWordDirective = activeWordClean ? this.resolvedState.wordDirectivesMap[activeWordClean] ?? null : null;
      ds.activeWord = activeWordClean || '—';
      ds.activeWordEntry = activeWordDirective?.entry ?? '—';
      ds.activeWordExit = activeWordDirective?.exit ?? '—';
      ds.activeWordEmphasis = activeWordDirective?.emphasisLevel ?? 0;

      ds.wordDirectiveWord = activeWordClean || '';
      ds.wordDirectiveBehavior = activeWordDirective?.behavior ?? activeWordDirective?.kineticClass ?? '—';
      ds.wordDirectiveEntry = activeWordDirective?.entry ?? '—';
      ds.wordDirectiveExit = activeWordDirective?.exit ?? '—';
      ds.wordDirectiveEmphasis = activeWordDirective?.emphasisLevel ?? 0;
      ds.wordDirectiveGhostTrail = activeWordDirective?.ghostTrail ?? false;
      ds.wordDirectiveGhostDir = activeWordDirective?.ghostDirection ?? '—';

      const lines = this.payload?.lines ?? [];
      const visibleLines = lines.filter((l: any) => clamped >= (l.start ?? 0) && clamped < (l.end ?? 0));
      const activeLine = visibleLines.length === 0
        ? null
        : visibleLines.reduce((latest: any, l: any) => ((l.start ?? 0) > (latest.start ?? 0) ? l : latest));
      const storyboard = cd?.storyboard ?? [];
      const activeLineIdx = activeLine ? lines.indexOf(activeLine) : -1;
      const lineStory = activeLineIdx >= 0 ? (storyboard as any[])[activeLineIdx] : null;
      ds.lineHeroWord = lineStory?.heroWord ?? '';
      ds.lineEntry = lineStory?.entryStyle ?? 'fades';
      ds.lineExit = lineStory?.exitStyle ?? 'fades';
      ds.lineIntent = lineStory?.intent ?? lineStory?.emotion ?? '—';
      ds.shotType = lineStory?.shotType ?? 'FloatingInWorld';
      ds.shotDescription = lineStory?.description ?? '—';
      const resolvedLine = activeLineIdx >= 0 ? this.resolvedState.lineSettings[activeLineIdx] : null;
      const resolvedWord = activeWordClean ? this.resolvedState.wordSettings[activeWordClean] ?? null : null;
      ds.resolvedLineStyle = resolvedLine
        ? `${resolvedLine.entryStyle}→${resolvedLine.exitStyle} / ${resolvedLine.typography} / ${resolvedLine.atmosphere}`
        : '—';
      ds.resolvedWordStyle = resolvedWord
        ? `${resolvedWord.behavior} e${resolvedWord.emphasisLevel} pulse:${resolvedWord.pulseAmp.toFixed(2)}`
        : '—';
      ds.layoutStable = true;

      ds.cameraDistance = ds.cdTypography;
      ds.cameraMovement = cdAny?.cameraMovement ?? (currentChapter as any)?.cameraMovement ?? '—';
      ds.tensionStage = currentTension?.stage ?? '—';
      ds.tensionMotion = currentTension?.motionIntensity ?? 0;
      ds.tensionParticles = currentTension?.particleDensity ?? 0;
      ds.tensionTypo = currentTension?.typography ?? '—';

      const symbols = cdAny?.symbolSystem ?? cdAny?.symbols ?? {};
      ds.symbolPrimary = symbols?.primary ?? '—';
      ds.symbolSecondary = symbols?.secondary ?? '—';
      ds.symbolState = symbols?.state ?? '—';

      const physics = cd?.visualWorld?.physicsProfile;
      ds.heat = physics?.heat ?? 0;
      ds.velocity = 0;
      ds.rotation = 0;

      ds.particleSystem = this.activeSectionTexture ?? 'none';
      ds.particleDensity = this.resolvedState.particleConfig.density ?? 0;
      ds.particleSpeed = this.resolvedState.particleConfig.speed ?? 0;

      ds.backgroundSystem = cdAny?.backgroundSystem ?? cd?.visualWorld?.backgroundSystem ?? '—';
      ds.imageLoaded = this.chapterImages.length > 0;
      ds.zoom = frame?.cameraZoom ?? 1;
      ds.vignetteIntensity = 0;

      ds.fontScale = this._viewportFontScale ?? 1;
      ds.scale = frame?.cameraZoom ?? 1;
      ds.lineColor = this.getResolvedPalette()?.[2] ?? '#ffffff';
      ds.effectKey = activeLine?.tag ?? '—';
      const firstVisible = visibleChunks[0];
      ds.entryProgress = firstVisible?.entryProgress ?? 0;
      ds.exitProgress = firstVisible?.exitProgress ?? 0;
    } // end debug panel guard

    const beatIntensityClamped = Math.max(0, Math.min(1, beatState?.pulse ?? 0));
    this.ambientParticleEngine?.update(deltaMs, beatIntensityClamped);
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

    // Mood grade is computed inside drawChapterImage() which runs before text rendering.
    // _activeMoodGrade is set by drawChapterImage (song-level grade).

    // ═══ V2: Use pre-computed frame (single evaluateFrame per tick) ═══
    const frame = precomputedFrame;
    if (!frame) return;



    const songProgress = (tSec - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    try {
      this.updateSims(tSec, frame);
    } catch (e) {
      console.error('[LyricEngine] sim crash:', e);
    }

    // Background: static bg cache first, then section images on top
    // ═══ V2: CameraRig parallax — BG_FAR layer ═══
    this.cameraRig.applyTransform(this.ctx, 'far');
    this.drawBackground(frame);

    // Section image overlay — use baked sectionIndex directly
    const imgIdx = Math.min(frame.sectionIndex ?? 0, Math.max(0, this.chapterImages.length - 1));
    const nextImgIdx = Math.min(imgIdx + 1, Math.max(0, this.chapterImages.length - 1));
    // Crossfade based on actual section boundaries (matches grade lerp timing)
    const duration = this.audio?.duration || 1;
    const totalChapters = this.chapterImages.length || 1;
    const chapterSpan = duration / totalChapters;
    const currentTimeSec = this.audio?.currentTime ?? 0;
    const cdForCrossfade = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const sectionsForCrossfade = (cdForCrossfade?.sections as any[]) ?? (cdForCrossfade?.chapters as any[]) ?? [];
    const currentSection = sectionsForCrossfade[imgIdx];
    let crossfade = 0;
    if (currentSection && nextImgIdx !== imgIdx) {
      // Resolve the end time of the current section
      const secEnd = currentSection.endSec
        ?? (currentSection.endRatio != null ? currentSection.endRatio * duration : null);
      if (secEnd != null) {
        const crossfadeDur = 1.5; // seconds — matches grade lerp transitionDur
        const timeToEnd = secEnd - currentTimeSec;
        if (timeToEnd < crossfadeDur && timeToEnd > 0) {
          crossfade = 1 - (timeToEnd / crossfadeDur); // 0 at start → 1 at boundary
        }
      }
    }
    this.drawChapterImage(imgIdx, nextImgIdx, crossfade);
    // ═══ V2: End BG_FAR parallax ═══
    this.cameraRig.resetTransform(this.ctx);

    // ═══ V2: CameraRig parallax — BG_MID layer (sims, lighting) ═══
    this.cameraRig.applyTransform(this.ctx, 'mid');
    this.drawSimLayer(frame);
    this.drawLightingOverlay(frame, tSec);
    this.cameraRig.resetTransform(this.ctx);

    try {
      this.checkEmotionalEvents(tSec, songProgress);
    } catch (e) {
      console.error('[LyricEngine] emotional events crash:', e);
    }

    this.drawEmotionalEvents(tSec);

    // Ambient particles — runtime system updates per section
    // ═══ V2: CameraRig parallax — BG_NEAR layer ═══
    this.cameraRig.applyTransform(this.ctx, 'near');
    this.ambientParticleEngine?.draw(this.ctx, "far");
    this.cameraRig.resetTransform(this.ctx);

    // ═══ V2: Text is screen-space (no parallax — readability constraint) ═══

    // ═══ Sample center brightness for text contrast — ZERO GPU STALL ═══
    // Instead of getImageData (forces GPU→CPU sync), use the mood grade brightness
    // from the CSS filter + a bias toward dark (text is usually in bottom half).
    // This costs nothing — it's already computed.
    const nowMs = performance.now();
    if (nowMs - this._lastBandSampleMs > 2000) {
      this._lastBandSampleMs = nowMs;
      const moodGrade = (this as any)._activeMoodGrade as MoodGrade | undefined;
      if (moodGrade) {
        // CSS filter brightness applies to the whole image. Text sits in the lower
        // half where it's almost always darker. Bias down by 0.15.
        this._textBandBrightness = Math.max(0, moodGrade.brightness - 0.15);
      }
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const safeCameraX = Number.isFinite(frame.cameraX) ? frame.cameraX : 0;
    const safeCameraY = Number.isFinite(frame.cameraY) ? frame.cameraY : 0;
    // Camera zoom is now applied via CameraRig.getSubjectTransform() at the text rendering stage
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';

    let drawCalls = 0;
    const sortBuf = this._sortBuffer;
    sortBuf.length = 0;
    for (let i = 0; i < frame.chunks.length; i += 1) sortBuf.push(frame.chunks[i]);
    for (let i = 1; i < sortBuf.length; i += 1) {
      const v = sortBuf[i];
      const vKey = ((v.exitProgress ?? 0) > 0) ? 1 : 0;
      const vSort = (v.fontWeight ?? 700) * 10000 + (v.fontSize ?? 36);
      let j = i - 1;
      while (j >= 0) {
        const jKey = ((sortBuf[j].exitProgress ?? 0) > 0) ? 1 : 0;
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
    const frameNowMs = performance.now(); // hoisted — used everywhere below
    const frameNowSec = frameNowMs / 1000;

    const isPortraitLocal = this.height > this.width;
    const viewportMinFont = isPortraitLocal
      ? Math.max(26, this.width * 0.065)
      : Math.max(28, this.height * 0.045);
    const margin = 4;
    const wallLeft = -safeCameraX + margin;
    const wallRight = this.width - safeCameraX - margin;
    const wallTop = -safeCameraY + margin;
    const wallBottom = this.height - safeCameraY - margin;

    const bounds = this._boundsBuffer;
    bounds.length = 0;
    const resolvedFont = this.getResolvedFont();
    for (let i = 0; i < sortBuf.length; i += 1) {
      const chunk = sortBuf[i];
      if (!chunk.visible) continue;
      const obj = this.chunks.get(chunk.id);
      if (!obj) continue;
      const text = chunk.text ?? obj.text;
      const chunkBaseX = Number.isFinite(chunk.x) ? chunk.x : 0;
      const chunkBaseY = Number.isFinite(chunk.y) ? chunk.y : 0;
      const cx = chunk.frozen ? chunkBaseX - safeCameraX : chunkBaseX;
      const cy = chunk.frozen ? chunkBaseY - safeCameraY : chunkBaseY;
      const baseFontSize = Number.isFinite(chunk.fontSize) ? (chunk.fontSize as number) : 36;
      const fontSize = Math.max(viewportMinFont, Math.round(baseFontSize) || 36);
      const weight = chunk.fontWeight ?? 700;
      const family = chunk.fontFamily ?? resolvedFont;
      const measureFont = `${weight} ${fontSize}px ${family}`;
      const metrics = this.getCachedMetrics(text, measureFont);
      const baseTextWidth = metrics.width;
      const asc = metrics.ascent;
      const desc = metrics.descent;
      const halfTextH = (asc + desc) / 2;
      const baseScale = Number.isFinite(chunk.scale) ? (chunk.scale as number) : ((chunk.entryScale ?? 1) * (chunk.exitScale ?? 1));
      const sxRaw = Number.isFinite(chunk.scaleX) ? (chunk.scaleX as number) : baseScale;
      const syRaw = Number.isFinite(chunk.scaleY) ? (chunk.scaleY as number) : baseScale;
      const scaleX = Number.isFinite(sxRaw) ? sxRaw : 1;
      const scaleY = Number.isFinite(syRaw) ? syRaw : 1;
      bounds.push({
        chunk,
        cx,
        cy,
        halfW: (baseTextWidth * Math.abs(scaleX)) / 2 + 6,
        halfH: (halfTextH * Math.abs(scaleY)) + 3,
        priority: chunk.isAnchor ? 0 : ((chunk.exitProgress ?? 0) > 0 ? 2 : 1),
        fontSize,
        minFont: viewportMinFont,
        text,
        family,
        weight,
        baseTextWidth,
        scaleX,
        scaleY,
      });
    }

    // Build a signature of which chunks are visible — only re-solve when this changes
    let visibleSig = '';
    for (let i = 0; i < bounds.length; i++) {
      visibleSig += bounds[i].chunk.id;
      visibleSig += ',';
    }
    // Compile-time solver in sceneCompiler handles static layout.
    // Runtime solver fixes dynamic overlaps from entry/exit offsets.
    // Only re-solve when the visible word set changes (prevents jitter).
    const setChanged = visibleSig !== this._lastVisibleChunkIds;
    if (setChanged && bounds.length >= 2) {
      this.solveConstraints(bounds, wallLeft, wallRight, wallTop, wallBottom);
    }
    // Wall-clamp ALL bounds every frame (stable, no jitter)
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      const minX = wallLeft + b.halfW;
      const maxX = wallRight - b.halfW;
      const minY = wallTop + b.halfH;
      const maxY = wallBottom - b.halfH;
      b.cx = Math.max(minX, Math.min(maxX, b.cx));
      b.cy = Math.max(minY, Math.min(maxY, b.cy));
    }
    this._lastVisibleChunkIds = visibleSig;
    this._solvedBounds.length = bounds.length;
    for (let i = 0; i < bounds.length; i++) {
      if (!this._solvedBounds[i]) {
        this._solvedBounds[i] = { ...bounds[i] };
      } else {
        this._solvedBounds[i].cx = bounds[i].cx;
        this._solvedBounds[i].cy = bounds[i].cy;
      }
    }

    let shrinkOccurred = false;
    for (let passPriority = 2; passPriority >= 0; passPriority -= 1) {
      for (let bi = 0; bi < bounds.length; bi += 1) {
        const b = bounds[bi];
        if (b.priority !== passPriority) continue;
        const availW = wallRight - wallLeft;
        const availH = wallBottom - wallTop;
        const tooWide = b.halfW * 2 > availW;
        const tooTall = b.halfH * 2 > availH;
        if (!tooWide && !tooTall) continue;
        const shrinkRatioW = tooWide ? (availW / (b.halfW * 2)) : 1;
        const shrinkRatioH = tooTall ? (availH / (b.halfH * 2)) : 1;
        const shrinkRatio = Math.min(shrinkRatioW, shrinkRatioH);
        b.fontSize = Math.max(b.minFont, Math.floor(b.fontSize * shrinkRatio));
        const newFontStr = `${b.weight} ${b.fontSize}px ${b.family}`;
        const metrics2 = this.getCachedMetrics(b.text, newFontStr);
        b.baseTextWidth = metrics2.width;
        const asc2 = metrics2.ascent;
        const desc2 = metrics2.descent;
        const halfTextH2 = (asc2 + desc2) / 2;
        b.halfW = (b.baseTextWidth * Math.abs(b.scaleX)) / 2 + 6;
        b.halfH = (halfTextH2 * Math.abs(b.scaleY)) + 3;
        shrinkOccurred = true;
      }
    }

    if (shrinkOccurred) {
      this.solveConstraints(bounds, wallLeft, wallRight, wallTop, wallBottom);
      this._solvedBounds = bounds.map(b => ({ ...b }));
    }

    this.ctx.save();
    // ═══ DIRECTOR'S CAMERA: Pure depth — zoom into the words ═══
    // NOTE: Canvas zoom is baked into each chunk's setTransform() call below,
    // NOT applied as a parent transform, because setTransform() replaces the
    // entire matrix and would wipe any parent zoom.
    const subjectT = this.cameraRig.getSubjectTransform();
    const camZoom = subjectT.zoom;
    const camCX = this.width / 2;
    const camCY = this.height / 2;

    for (let ci = 0; ci < sortBuf.length; ci += 1) {
      const chunk = sortBuf[ci];
      if (!chunk.visible) continue;

      const entry = Math.max(0, Math.min(1, chunk.entryProgress ?? 0));
      const exit = Math.max(0, Math.min(1, chunk.exitProgress ?? 0));
      if (entry >= 1.0 && exit === 0) {
        if (!this.chunkActiveSinceMs.has(chunk.id)) this.chunkActiveSinceMs.set(chunk.id, frameNowMs);
      }
      const activeSince = this.chunkActiveSinceMs.get(chunk.id);
      const visibleMs = activeSince != null ? frameNowMs - activeSince : 0;
      if (exit > 0) this.chunkActiveSinceMs.delete(chunk.id);

      // ═══ HERO DECOMPOSITION: spawn shatter burst when solo hero starts exiting ═══
      if (exit > 0.01 && exit < 0.3 && chunk.isSoloHero && !this._heroDecompSpawned.has(chunk.id)) {
        this._heroDecompSpawned.add(chunk.id);
        const spawnBound = bounds.find(b => b.chunk.id === chunk.id);
        const spawnX = spawnBound ? spawnBound.cx : (Number.isFinite(chunk.x) ? chunk.x : this.width / 2);
        const spawnY = spawnBound ? spawnBound.cy : (Number.isFinite(chunk.y) ? chunk.y : this.height / 2);
        const spawnFontSize = spawnBound ? spawnBound.fontSize : 36;
        const spawnColor = chunk.color ?? '#f0f0f0';
        this.spawnDecompBurst(chunk.id, spawnX, spawnY, spawnFontSize, spawnColor, frameNowMs);
      }

      const obj = this.chunks.get(chunk.id);
      if (!obj) continue;

      const chunkBaseX = Number.isFinite(chunk.x) ? chunk.x : 0;
      const chunkBaseY = Number.isFinite(chunk.y) ? chunk.y : 0;
      const rawDrawX = chunk.frozen ? chunkBaseX - safeCameraX : chunkBaseX;
      const rawDrawY = chunk.frozen ? chunkBaseY - safeCameraY : chunkBaseY;

      let bound: ChunkBounds | null = null;
      for (let bi = 0; bi < bounds.length; bi += 1) {
        if (bounds[bi].chunk === chunk) {
          bound = bounds[bi];
          break;
        }
      }

      const baseFontSize = Number.isFinite(chunk.fontSize) ? (chunk.fontSize as number) : 36;
      let safeFontSize = Math.max(viewportMinFont, Math.round(baseFontSize) || 36);
      const fontWeight = chunk.fontWeight ?? 700;
      const family = chunk.fontFamily ?? resolvedFont;
      const text = chunk.text ?? obj.text;
      if (bound) safeFontSize = bound.fontSize;

      const measureFont = `${fontWeight} ${safeFontSize}px ${family}`;
      const textWidth = this.getCachedMetrics(text, measureFont).width;
      const centerX = bound ? bound.cx : rawDrawX;
      const centerY = bound ? bound.cy : rawDrawY;

      const baseScale = Number.isFinite(chunk.scale) ? (chunk.scale as number) : ((chunk.entryScale ?? 1) * (chunk.exitScale ?? 1));
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
      let drawX = centerX - textWidth * sx * 0.5;
      const drawY = centerY;
      const finalDrawY = drawY;

      const isAnchor = chunk.isAnchor ?? false;
      // ═══ SINGLE COLOR MODEL: no colored halos behind words ═══

      const drawAlpha = Number.isFinite(chunk.alpha) ? Math.max(0, Math.min(1, chunk.alpha)) : 1;
      const iconScaleMult = chunk.iconScale ?? 2.0;
      const positionScaleOverride: Record<string, number> = {
        behind: iconScaleMult,
        above: iconScaleMult * 0.55,
        beside: iconScaleMult * 0.5,
        replace: iconScaleMult * 0.9,
      };
      const effectiveScale = positionScaleOverride[chunk.iconPosition ?? 'behind'] ?? iconScaleMult;
      const iconBaseSize = safeFontSize * effectiveScale;
      const iconColor = chunk.color ?? '#f0f0f0';
      const now = frameNowSec;
      let iconPulse = 1.0;
      if (chunk.iconPosition === 'behind') iconPulse = 1.0 + Math.sin(now * 1.5) * 0.08;
      else if (chunk.behavior === 'pulse') iconPulse = 1.0 + Math.sin(now * 3) * 0.04;
      const iconSize = iconBaseSize * iconPulse;
      let iconX = centerX;
      let iconY = finalDrawY;
      let iconOpacity = drawAlpha * 0.45;
      let iconGlow = 0;

      switch (chunk.iconPosition) {
        case 'behind': iconX = centerX; iconY = finalDrawY; iconOpacity = drawAlpha * 0.45; iconGlow = 12; break;
        case 'above': iconX = centerX; iconY = finalDrawY - safeFontSize * 1.3; iconOpacity = drawAlpha * 0.85; iconGlow = 6; break;
        case 'beside': iconX = centerX - iconSize * 0.7; iconY = finalDrawY; iconOpacity = drawAlpha * 0.9; iconGlow = 6; break;
        case 'replace': iconX = centerX; iconY = finalDrawY; iconOpacity = drawAlpha * 1.0; iconGlow = 16; break;
      }

      const drawBefore = chunk.iconPosition === 'behind' || chunk.iconPosition === 'replace';
      if (chunk.iconGlyph && chunk.visible && drawBefore) {
        if (iconGlow > 0) { this.ctx.save(); this.ctx.shadowColor = iconColor; this.ctx.shadowBlur = iconGlow; }
        drawIcon(this.ctx, chunk.iconGlyph as IconGlyph, iconX, iconY, iconSize, iconColor, (chunk.iconStyle as IconStyle) ?? 'ghost', iconOpacity);
        if (iconGlow > 0) this.ctx.restore();
      }

      const directiveKey = this.cleanWord((chunk.text ?? obj.text) as string);
      const directive = directiveKey ? this.resolvedState.wordDirectivesMap[directiveKey] ?? null : null;

      if (chunk.iconPosition !== 'replace') {
        this.ctx.globalAlpha = drawAlpha;
        this.ctx.fillStyle = chunk.color ?? '#f0f0f0';
        const drawFont = `${fontWeight} ${safeFontSize}px ${family}`;
        if (drawFont !== this._lastFont) { this.ctx.font = drawFont; this._lastFont = drawFont; }

        // ═══ HERO EFFECTS: depth stack, bloom pulse, underline sweep, beat bounce ═══
        const isHeroChunk = (chunk.emphasisLevel ?? 0) >= 2 || chunk.isHeroWord;
        const beatState = this._lastBeatState;
        const beatPulse = beatState?.pulse ?? 0;
        let heroDrawX = drawX;
        let heroDrawY = finalDrawY;

        if (isHeroChunk && entry >= 0.5 && drawAlpha > 0.1) {
          // Beat bounce: gentle Y offset for words on screen > 500ms
          if (visibleMs > 500 && beatPulse > 0.05) {
            const bounceAmt = beatPulse * safeFontSize * 0.04; // subtle: ~4% of font size
            heroDrawY -= bounceAmt;
          }

          // Bloom pulse: amplified glow synced to beat
          const baseGlow = chunk.glow > 0 ? chunk.glow : 0.3;
          const bloomGlow = baseGlow + beatPulse * 0.5;
          this.ctx.shadowColor = '#ffffff';
          // Cap shadow blur to avoid GPU stall in dense sections
          // 16x gives visible glow without the 22px+ blur that tanks frame rate
          this.ctx.shadowBlur = Math.min(14, bloomGlow * 16);

          // Depth stack: 3 shadow layers behind the hero word
          const depthLayers = 3;
          const layerSpacing = safeFontSize * 0.025;
          this.ctx.save();
          for (let layer = depthLayers; layer >= 1; layer--) {
            const layerAlpha = drawAlpha * (0.12 / layer);
            const offsetY = layer * layerSpacing;
            this.ctx.globalAlpha = layerAlpha;
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
            const [da, db, dc, dd, de, df] = this.computeTransformMatrix(
              camCX + (heroDrawX - camCX) * camZoom,
              camCY + ((heroDrawY + offsetY) - camCY) * camZoom,
              chunk.rotation ?? 0,
              chunk.skewX ?? 0,
              sx * camZoom,
              sy * camZoom,
            );
            this.ctx.setTransform(da, db, dc, dd, de, df);
            this.ctx.fillText(text, 0, 0);
          }
          this.ctx.restore();
          this.ctx.globalAlpha = drawAlpha;
          this.ctx.fillStyle = chunk.color ?? '#f0f0f0';
          this.ctx.shadowColor = '#ffffff';
          this.ctx.shadowBlur = Math.min(14, bloomGlow * 16);
          if (drawFont !== this._lastFont) { this.ctx.font = drawFont; this._lastFont = drawFont; }
        } else if (chunk.glow > 0) {
          this.ctx.shadowColor = '#ffffff';
          this.ctx.shadowBlur = Math.min(14, chunk.glow * 16);
        }

        const needsFilterSaveRestore = (chunk.blur ?? 0) > 0.01;
        if (needsFilterSaveRestore) {
          this.ctx.save();
          this.ctx.filter = `blur(${(chunk.blur ?? 0) * 12}px)`;
        }

        if (chunk.ghostTrail && chunk.visible) {
          const count = chunk.ghostCount ?? 3;
          const spacing = chunk.ghostSpacing ?? 8;
          const dir = chunk.ghostDirection ?? 'up';
          for (let g = count; g >= 1; g -= 1) {
            const ghostAlpha = drawAlpha * (0.12 + (count - g) * 0.06);
            const offset = g * spacing;
            let gx = 0, gy = 0;
            switch (dir) {
              case 'up': gy = offset; break;
              case 'down': gy = -offset; break;
              case 'left': gx = offset; break;
              case 'right': gx = -offset; break;
              case 'radial': gx = Math.cos(g * 1.2) * offset; gy = Math.sin(g * 1.2) * offset; break;
            }
            this.ctx.globalAlpha = ghostAlpha;
            const [ga, gb, gc, gd, ge, gf] = this.computeTransformMatrix(
              camCX + ((heroDrawX + gx) - camCX) * camZoom,
              camCY + ((heroDrawY + gy) - camCY) * camZoom,
              chunk.rotation ?? 0,
              chunk.skewX ?? 0,
              sx * camZoom,
              sy * camZoom,
            );
            this.ctx.setTransform(ga, gb, gc, gd, ge, gf);
            this.ctx.fillText(chunk.text ?? obj.text, 0, 0);
          }
          this.ctx.globalAlpha = drawAlpha;
        }

        const [ma, mb, mc, md, me, mf] = this.computeTransformMatrix(
          camCX + (heroDrawX - camCX) * camZoom,
          camCY + (heroDrawY - camCY) * camZoom,
          chunk.rotation ?? 0,
          chunk.skewX ?? 0,
          sx * camZoom,
          sy * camZoom,
        );
        this.ctx.setTransform(ma, mb, mc, md, me, mf);

        // ═══ Text stroke for edge contrast in ambiguous zones ═══
        const textStrokeColor = (chunk as any).textStroke as string | undefined;
        if (textStrokeColor) {
          this.ctx.strokeStyle = textStrokeColor;
          this.ctx.lineWidth = Math.max(1.5, safeFontSize * 0.03);
          this.ctx.lineJoin = 'round';
        }

        // Main text draw
        if (textStrokeColor) this.ctx.strokeText(text, 0, 0);
        this.ctx.fillText(text, 0, 0);

        if (needsFilterSaveRestore) {
          this.ctx.filter = 'none';
          this.ctx.restore();
        }
      }

      if (chunk.iconGlyph && chunk.visible && !drawBefore) {
        if (iconGlow > 0) { this.ctx.save(); this.ctx.shadowColor = iconColor; this.ctx.shadowBlur = iconGlow; }
        drawIcon(this.ctx, chunk.iconGlyph as IconGlyph, iconX, iconY, iconSize, iconColor, (chunk.iconStyle as IconStyle) ?? 'outline', iconOpacity);
        if (iconGlow > 0) this.ctx.restore();
      }
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
      drawCalls += 1;
    }
    this.ctx.restore();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';


    // Comment comets — after text, before watermark
    this.drawComments(frameNowSec);

    // ═══ Hero decomposition particles — shatter effect on hero word exit ═══
    this.updateAndDrawDecomp(frameNowSec);

    this.drawWatermark();
    this.debugState.drawCalls = drawCalls;
  }

  private drawWatermark(): void {
    const margin = 20;
    const padX = 14;
    const padY = 8;
    const text = "♥ tools.FMLY";
    const fontSize = Math.max(12, this.width * 0.013);

    this.ctx.save();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = `400 ${fontSize}px "Space Mono", "Geist Mono", monospace`;
    (this.ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0.08em";

    const textWidth = this.ctx.measureText(text).width;
    const badgeW = textWidth + padX * 2;
    const badgeH = fontSize + padY * 2;
    const x = this.width - badgeW - margin;
    const y = this.height - badgeH - margin;

    const radius = badgeH / 2;
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
    this.ctx.textBaseline = "middle";
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
      const trail = this.ctx.createLinearGradient(trailX, y, x, y);
      trail.addColorStop(0, 'transparent');
      trail.addColorStop(1, `${comment.color}${Math.floor(alpha * 120).toString(16).padStart(2, '0')}`);
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
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(comment.text, x, y);

      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }
  }

  // ────────────────────────────────────────────────────────────
  // Hero Decomposition — shatter hero words into particles on exit
  // ────────────────────────────────────────────────────────────

  private spawnDecompBurst(wordId: string, cx: number, cy: number, fontSize: number, color: string, nowMs: number): void {
    const particles: HeroDecompParticle[] = [];
    const count = 28 + Math.floor(Math.random() * 12); // 28-40 particles
    const spread = fontSize * 1.2;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const shape: HeroDecompParticle['shape'] =
        i < count * 0.45 ? 'shard' : i < count * 0.8 ? 'dust' : 'glow';

      particles.push({
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * fontSize * 0.6,
        vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
        vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.7) - 30, // slight upward bias
        size: shape === 'shard' ? (3 + Math.random() * 6) : shape === 'dust' ? (1.5 + Math.random() * 3) : (2 + Math.random() * 4),
        alpha: 0.85 + Math.random() * 0.15,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 8,
        life: 1.0,
        color,
        shape,
      });
    }

    this._heroDecompBursts.push({
      wordId, particles, startTime: nowMs,
      duration: 1200, // 1.2 seconds
      originX: cx, originY: cy,
    });

    // Cap active bursts
    if (this._heroDecompBursts.length > 4) {
      this._heroDecompBursts = this._heroDecompBursts.slice(-4);
    }
  }

  private updateAndDrawDecomp(frameNowSec: number): void {
    if (this._heroDecompBursts.length === 0) return;

    const nowMs = frameNowSec * 1000;
    const dt = Math.min(0.05, this._frameDt); // capped delta
    const gravity = 180; // pixels/sec²

    this.ctx.save();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Update and draw all active bursts
    for (let bi = this._heroDecompBursts.length - 1; bi >= 0; bi--) {
      const burst = this._heroDecompBursts[bi];
      const elapsed = nowMs - burst.startTime;
      const burstT = Math.min(1, elapsed / burst.duration);

      if (burstT >= 1) {
        this._heroDecompBursts.splice(bi, 1);
        this._heroDecompSpawned.delete(burst.wordId);
        continue;
      }

      // Flash at burst start (first 80ms)
      if (elapsed < 80) {
        const flashAlpha = (1 - elapsed / 80) * 0.6;
        this.ctx.globalAlpha = flashAlpha;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(burst.originX, burst.originY, 20 + (elapsed / 80) * 40, 0, Math.PI * 2);
        this.ctx.fill();
      }

      for (const p of burst.particles) {
        // Physics
        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotSpeed * dt;

        // Life decay: shards last longer, dust fades faster
        const decayRate = p.shape === 'shard' ? 0.7 : p.shape === 'dust' ? 1.2 : 0.9;
        p.life = Math.max(0, 1 - burstT * decayRate);
        if (p.life <= 0) continue;

        const alpha = p.alpha * p.life * (1 - burstT * 0.3);
        if (alpha < 0.01) continue;

        this.ctx.globalAlpha = alpha;

        if (p.shape === 'shard') {
          // Rotated rectangles — icy shard look
          this.ctx.save();
          this.ctx.translate(p.x, p.y);
          this.ctx.rotate(p.rotation);
          this.ctx.fillStyle = p.color;
          this.ctx.shadowColor = p.color;
          this.ctx.shadowBlur = 4;
          const w = p.size * 0.4;
          const h = p.size;
          this.ctx.fillRect(-w / 2, -h / 2, w, h);
          this.ctx.restore();
        } else if (p.shape === 'dust') {
          // Tiny circles
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          // Glow dots — radial gradient, no ctx.filter
          const r = p.size;
          const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
          grad.addColorStop(0, p.color);
          grad.addColorStop(0.4, p.color);
          grad.addColorStop(1, 'transparent');
          this.ctx.fillStyle = grad;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }

    this.ctx.restore();
  }

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

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.buildBgCache();
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
    this._lastVisibleChunkIds = '';
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
    const songStart = lines.length ? Math.max(0, (lines[0].start ?? 0) - 0.5) : 0;
    const songEnd = lines.length ? (lines[lines.length - 1].end ?? 0) + 1 : 0;

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
      zoom: 1,
      driftIntensity: direction.motion === 'fluid' ? 0.3 : 0.1,
    }));
  }

  private toWordDirectivesMap(wordDirectives: CinematicDirection['wordDirectives']): Record<string, any> {
    const map: Record<string, any> = {};
    if (!wordDirectives) return map;
    if (Array.isArray(wordDirectives)) {
      for (const directive of wordDirectives) {
        const key = String(directive?.word ?? '').trim().toLowerCase();
        if (!key) continue;
        map[key] = directive;
      }
      return map;
    }
    for (const [key, value] of Object.entries(wordDirectives)) {
      const clean = key.trim().toLowerCase();
      if (!clean) continue;
      map[clean] = value;
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
    const tensionCurve = Array.isArray((direction as any)?.tensionCurve) && (direction as any).tensionCurve.length > 0
      ? (direction as any).tensionCurve
      : deriveTensionCurve(direction?.emotionalArc);
    const wordDirectivesMap = this.toWordDirectivesMap(direction?.wordDirectives);
    const durationSec = Math.max(0.01, (payload.songEnd ?? this.audio.duration ?? 1) - (payload.songStart ?? 0));
    const resolved = resolveCinematicState(direction, payload.lines as any[], durationSec);
    const sectionIndex = Math.max(0, Math.min(chapters.length - 1, this.resolveSectionIndex(chapters, this.audio.currentTime, this.audio.duration || 1)));
    const texture = this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, direction);
    this.resolvedState = {
      chapters,
      tensionCurve,
      wordDirectivesMap,
      lineSettings: resolved.lineSettings,
      wordSettings: resolved.wordSettings,
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
        this.chunks.set(word.id, {
          id: word.id,
          text: word.text,
          color: word.color,
          font: fontStr,
          width: measureCtx.measureText(word.text).width,
        });
      }
    }
  }

  private _updateViewportScale(): void {
    const sx = this.width / 960;
    const sy = this.height / 540;
    const baseScale = Math.min(sx, sy);
    const isPortrait = this.height > this.width;

    // fontScale must stay proportional to POSITION scale (sx).
    // If fontScale > sx, text is physically wider than the position spacing → overlap.
    let fontScale: number;
    if (isPortrait) {
      // Portrait: fontScale MUST equal sx so positions and font widths scale identically.
      // The scene compiler already boosts font sizes 1.5x for portrait readability.
      fontScale = sx;
    } else {
      // Landscape: scale proportionally, slight boost on small screens
      if (this.height >= 1080) {
        fontScale = baseScale;
      } else {
        const deficit = (1080 - this.height) / 1080;
        fontScale = Math.min(baseScale * (1 + deficit * 0.3), baseScale * 1.2);
      }
    }

    this._viewportSx = sx;
    this._viewportSy = sy;
    this._viewportFontScale = fontScale;
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
    if (urls.length === 0) return;
    const duration = this.audio?.duration || 1;
    const totalChapters = urls.length || 1;
    const chapterSpan = duration / totalChapters;
    this.chapterImages = await Promise.all(
      urls.map((url: string, i: number) => new Promise<HTMLImageElement>((resolve) => {
        if (!url) { resolve(new Image()); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          resolve(new Image());
        };
        img.src = url;
      }))
    );

    // ═══ PRE-BLUR: Bake Gaussian blur into offscreen canvases once ═══
    // This eliminates the ~1.65M pixel-op/frame cost of ctx.filter = 'blur(3px)'
    // which causes thermal throttle + frame drops after ~60-90s of playback.
    {
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const cdSections = (cd?.sections as any[]) ?? [];
      const songGrade = this._songGrade ?? getMoodGrade(cdSections[0]?.visualMood as string | undefined);
      const blurRadius = Math.min(3, songGrade.blur.radius);
      this._preBlurredImages = this.chapterImages.map((img) => {
        const off = document.createElement('canvas');
        // Use image natural size capped at canvas size (no need for higher res)
        off.width = this.width || 960;
        off.height = this.height || 540;
        const ctx = off.getContext('2d');
        if (!ctx || !img.complete || img.naturalWidth === 0) return off;
        // Apply blur once via filter
        if (blurRadius > 0.2) {
          ctx.filter = `blur(${blurRadius.toFixed(1)}px)`;
        }
        // Draw with overscan to avoid blurred edges
        const OVERSCAN = 1.25;
        const ow = off.width * OVERSCAN;
        const oh = off.height * OVERSCAN;
        const ox = (off.width - ow) / 2;
        const oy = (off.height - oh) / 2;
        ctx.drawImage(img, ox, oy, ow, oh);
        ctx.filter = 'none';
        return off;
      });
    }

    // Generate Ken Burns parameters per chapter — driven by motionIntent from mood grade.
    // Images are drawn with 20% overscan, so KB can safely use up to ~8% pan + 1.15 zoom
    // without ever revealing canvas edges (CameraRig 'far' parallax adds ≤2% displacement).
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const sections = (cd?.sections as any[]) ?? [];
    this._kenBurnsParams = this.chapterImages.map((_, i) => {
      const seed = (i * 2654435761) >>> 0;
      const s = (v: number) => ((seed * v) & 0xFFFF) / 0xFFFF;

      // Resolve this chapter's motionIntent from its section's visualMood
      const sectionMood = sections[i]?.visualMood as string | undefined;
      const grade = getMoodGrade(sectionMood);
      const intent = grade.motionIntent;

      // Base: all chapters have enough zoom to avoid border visibility
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
          panEndX = 0; panEndY = 0; // push-in converges toward center
          break;
        case 'pull-out':
          zoomStart = 1.14; zoomEnd = 1.06;
          panStartX = 0; panStartY = 0;
          panEndX = (s(53) - 0.5) * 0.03; panEndY = (s(71) - 0.5) * 0.02;
          break;
        case 'drift-up':
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartY = 0.03; panEndY = -0.03; // image drifts up (pan moves down in image space)
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
          panEndX = panStartX * 0.3; panEndY = panStartY * 0.3; // slowly converges
          break;
        case 'breathing':
          // Gentle oscillation — zoom handled by CameraRig sway, KB just holds steady
          zoomStart = 1.08; zoomEnd = 1.10;
          panStartX = (s(17) - 0.5) * 0.015; panStartY = (s(31) - 0.5) * 0.015;
          panEndX = -panStartX; panEndY = -panStartY;
          break;
        case 'handheld':
          // Intentionally jittery — small random start/end, CameraRig shake adds the rest
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
    const currentBlurred = this._preBlurredImages[chapterIdx];
    const nextBlurred = this._preBlurredImages[nextChapterIdx];

    // ═══ SONG-LEVEL GRADE: one look for the entire song ═══
    // Computed once from the dominant mood, then locked in.
    if (!this._songGrade) {
      const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
      const sections = (cd?.sections as any[]) ?? [];
      // Use the first section's mood as the song's vibe, or fall back to default
      const dominantMood = sections[0]?.visualMood as string | undefined;
      this._songGrade = getMoodGrade(dominantMood);
    }
    const activeGrade = this._songGrade;

    // Emotional intensity: use a fixed mid-level — no per-section variation
    const intensity = 0.5;

    // Beat response — subtle brightness pulse on beats
    const beatMod = Math.max(0, this._springOffset);

    // ═══ PRE-BLURRED PATH: blur is baked into offscreen canvases ═══
    // Only color adjustments at runtime (brightness, saturate, contrast, hue-rotate)
    // Pass blurOverride=0 to skip per-frame blur — already baked in
    const filterStr = buildGradeFilter(activeGrade, intensity, beatMod, 0);

    // Use pre-blurred canvas if available (eliminates per-frame blur cost),
    // otherwise fall back to original image
    const drawCurrent = (currentBlurred && currentBlurred.width > 0) ? currentBlurred : current;
    const useOrigCurrent = drawCurrent === current;

    if ((useOrigCurrent ? (current?.complete && current.naturalWidth > 0) : true)) {
      this.ctx.save();
      // If using original (no pre-blur), apply full filter including blur fallback
      this.ctx.filter = useOrigCurrent
        ? buildGradeFilter(activeGrade, intensity, beatMod)
        : filterStr;

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
        this.ctx.drawImage(drawCurrent, ox, oy, ow, oh);
        this.ctx.restore();
      } else {
        this.ctx.drawImage(drawCurrent, ox, oy, ow, oh);
      }

      this.ctx.restore(); // restore filter state
    }

    const drawNext = (nextBlurred && nextBlurred.width > 0) ? nextBlurred : next;
    const useOrigNext = drawNext === next;

    if ((useOrigNext ? (next?.complete && next.naturalWidth > 0) : true) && blend > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = blend;
      this.ctx.filter = useOrigNext
        ? buildGradeFilter(activeGrade, intensity, beatMod)
        : filterStr;

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
        this.ctx.drawImage(drawNext, onx, ony, onw, onh);
        this.ctx.restore();
      } else {
        this.ctx.drawImage(drawNext, onx, ony, onw, onh);
      }

      this.ctx.restore();
    }

    // ─── Film grain: consistent level from song grade ───
    const grainIntensity = Math.min(0.15, activeGrade.grain.intensity);
    if (grainIntensity > 0.02) {
      this.renderFilmGrain(grainIntensity, activeGrade.grain.size);
    }

    // Store for _textBandBrightness sampling
    (this as any)._activeMoodGrade = activeGrade;
    (this as any)._activeIntensity = intensity;
  }

  /**
   * Render film grain overlay. Uses pre-generated noise buffers rotated per frame
   * to eliminate per-frame Math.random() cost (~57K calls/frame → 0).
   */
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

        const resolvedPal = this.getResolvedPalette();
        const bgColor = resolvedPal[0];
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
      const palette = this.getResolvedPalette();
      const accentColor = palette[1] ?? '#FFD700';
      const bgSystem = this.backgroundSystem;

      // ═══ Always-on beat visualizer — present throughout entire song ═══
      if (!this._globalBeatVis) {
        this._globalBeatVis = new BeatVisSim(accentColor, 'bars');
      }

      this.chapterSims = chapters.map((chapter: any, ci: number) => {
        const dominant = chapter?.dominantColor ?? palette[ci % palette.length] ?? '#111111';
        const bgDesc = (chapter?.backgroundDirective ?? chapter?.background ?? '').toLowerCase();
        const perSystem = this.mapBackgroundSystem(`${bgDesc} ${bgSystem}`);
        const sim: { fire?: FireSim; water?: WaterSim; aurora?: AuroraSim; rain?: RainSim; beatVis?: BeatVisSim } = {};
        if (perSystem === 'fire') sim.fire = new FireSim('fire', 0.08 + (chapter?.emotionalIntensity ?? 0.5) * 0.1);
        else if (perSystem === 'storm') sim.fire = new FireSim('smoke', 0.18);
        else if (perSystem === 'ocean') sim.water = new WaterSim(dominant, accentColor);
        else if (perSystem === 'aurora') sim.aurora = new AuroraSim(dominant, accentColor);
        else if (perSystem === 'urban') sim.rain = new RainSim(accentColor);
        else if (perSystem === 'intimate') sim.fire = new FireSim('ember', 0.25);
        return sim;
      });

      // Map section keywords to beat vis styles — always present, style varies
      this._beatVisStyles = chapters.map((chapter: any) => {
        const desc = (chapter?.backgroundDirective ?? chapter?.background ?? '').toLowerCase();
        if (desc.includes('fire') || desc.includes('burn') || desc.includes('flame') || desc.includes('ember')) return 'pulse' as BeatVisStyle;
        if (desc.includes('wave') || desc.includes('ocean') || desc.includes('flow') || desc.includes('water') || desc.includes('rain')) return 'wave' as BeatVisStyle;
        if (desc.includes('storm') || desc.includes('chaos') || desc.includes('turbul') || desc.includes('smoke')) return 'rings' as BeatVisStyle;
        if (desc.includes('mirror') || desc.includes('reflect') || desc.includes('dream') || desc.includes('float') || desc.includes('drift')) return 'mirror-bars' as BeatVisStyle;
        return 'bars' as BeatVisStyle;
      });
      
    } catch (err) {
      console.error('[LyricEngine] buildChapterSims crash:', err);
    }
  }

  private buildEmotionalEvents(): void {
    const cd = this.payload?.cinematic_direction as any;
    if (!cd) return;
    const events: EmotionalEvent[] = [];
    if (cd.climax?.timeRatio) events.push({ type: 'light-break', triggerRatio: cd.climax.timeRatio, intensity: cd.climax.maxLightIntensity ?? 1, duration: 1.2, triggered: false });
    if (this.resolvedState.chapters?.length >= 3) events.push({ type: 'world-shift', triggerRatio: this.resolvedState.chapters[2].startRatio ?? 0.6, intensity: 0.8, duration: 2.0, triggered: false });
    events.push({ type: 'lens-breath', triggerRatio: 0.05, intensity: 0.5, duration: 3.0, triggered: false });
    const peakChapter = this.resolvedState.chapters?.reduce((max: any, ch: any) => (ch.emotionalIntensity ?? 0) > (max?.emotionalIntensity ?? 0) ? ch : max, null);
    if (peakChapter) events.push({ type: 'void-moment', triggerRatio: (peakChapter.startRatio ?? 0.6) + 0.05, intensity: 1.0, duration: 0.4, triggered: false });
    events.push({ type: 'halo-ring', triggerRatio: 0.82, intensity: 0.9, duration: 1.5, triggered: false });
    this.emotionalEvents = events;
    this.activeEvents = [];
  }

  private updateSims(tSec: number, frame: ScaledKeyframe): void {
    try {
      const simFrame = Math.floor(tSec * 24);
      if (simFrame === this.lastSimFrame) return;
      this.lastSimFrame = simFrame;
      const chapters = this.resolvedState.chapters.length > 0 ? this.resolvedState.chapters : [{}];
      // Use cached section index — already resolved in tick()
      const chapterIdx = this._frameSectionIdx >= 0 ? Math.min(this._frameSectionIdx, chapters.length - 1) : chapters.length - 1;
      const ci = Math.max(0, chapterIdx);
      const chapter = chapters[ci] ?? {};

      // ═══ V2: Beat-driven sim intensity (no climax curve) ═══
      const conductorResponse = this._lastSubsystemResponse;
      const simIntensity = conductorResponse
        ? conductorResponse.bgSimIntensity
        : 0.3; // fallback ambient
      const intensity = ((chapter as any)?.emotionalIntensity ?? 0.5) * simIntensity;
      const pulse = (frame as any).beatPulse ?? 0;

      const sim = this.chapterSims[ci];
      this.currentSimCanvases = [];
      if (!sim) return;
      if (sim.fire) { sim.fire.update(intensity, pulse); this.currentSimCanvases.push(sim.fire.canvas); }
      if (sim.water) { sim.water.update(tSec, pulse, intensity); this.currentSimCanvases.push(sim.water.canvas); }
      if (sim.aurora) { sim.aurora.update(tSec, intensity); this.currentSimCanvases.push(sim.aurora.canvas); }
      if (sim.rain) { sim.rain.update(tSec, intensity, pulse); this.currentSimCanvases.push(sim.rain.canvas); }

      // ═══ Always-on beat visualizer — present throughout entire song ═══
      if (this._globalBeatVis) {
        const visStyle = this._beatVisStyles[ci] ?? 'bars';
        this._globalBeatVis.setStyle(visStyle);
        this._globalBeatVis.update(tSec, intensity, pulse);
      }
    } catch (err) {
      console.error('[LyricEngine] updateSims crash:', err);
    }
  }

  private drawSimLayer(_frame: ScaledKeyframe): void {
    // ═══ V2: Sim opacity from conductor (fire flares on beats, water splashes on downbeats) ═══
    const conductorResponse = this._lastSubsystemResponse;
    const simOpacity = conductorResponse
      ? conductorResponse.bgSimIntensity
      : 0.3; // ambient fallback

    // Section-specific sims (fire, water, aurora, rain) — full canvas, subtle
    for (const simCanvas of this.currentSimCanvases) {
      this.ctx.globalAlpha = 0.38 * simOpacity;
      this.ctx.drawImage(simCanvas, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }

    // ═══ Always-on beat visualizer — bottom 60% of canvas, energy-reactive ═══
    if (this._globalBeatVis) {
      const beatPulse = (_frame as any).beatPulse ?? 0;
      const visAlpha = 0.50 + beatPulse * 0.30; // 0.50 ambient → 0.80 on beat
      // Vis height grows on beats: 55% ambient → 65% on strong beats
      const visRatio = 0.55 + beatPulse * 0.10;
      const visTop = this.height * (1 - visRatio);
      const visH = this.height * visRatio;
      this.ctx.globalAlpha = visAlpha * simOpacity;
      // Nearest-neighbor upscale preserves crisp bar edges
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(this._globalBeatVis.canvas, 0, visTop, this.width, visH);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.globalAlpha = 1;
    }
  }


  private evaluateFrame(tSec: number): ScaledKeyframe | null {
    const scene = this.compiledScene;
    if (!scene) return null;

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

    if (beatIndex !== this._lastBeatIndex && beatIndex >= 0) {
      this._lastBeatIndex = beatIndex;
      this._springVelocity = beats[beatIndex]?.springVelocity ?? 0;
    }

    // dt-compensated spring (identical feel at 30/60/120 fps)
    const dt = this._frameDt;
    this._springOffset += this._springVelocity * dt;
    this._springVelocity *= Math.pow(0.82, dt);
    this._springOffset *= Math.pow(0.88, dt);

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

    const arcFn = this._getArcFunction(scene.emotionalArc);
    const intensity = Math.max(0, Math.min(1, arcFn(songProgress)));
    const intensityScaleMult = 0.95 + intensity * 0.1;

    let driftX = Math.sin(tSec * 0.15) * 8 * sx;
    let driftY = Math.cos(tSec * 0.12) * 5 * sy;

    const groups = scene.phraseGroups;
    const activeGroups = this._activeGroupIndices;
    activeGroups.length = 0;

    // First pass: collect groups by their individual time windows (original logic)
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const visStart = group.start - group.entryDuration - group.staggerDelay * group.words.length;
      const visEnd = group.end + group.lingerDuration + group.exitDuration;
      if (tSec < visStart) {
        if (tSec < visStart - 2.0) break;
        continue;
      }
      if (tSec > visEnd) continue;
      activeGroups.push(gi);
    }

    // ─── Determine which line is currently being sung ───
    let primaryLineIndex = -1;
    const _roleLines = this.data.lyrics ?? [];
    for (let li = 0; li < _roleLines.length; li++) {
      const ls = _roleLines[li].start ?? 0;
      const le = _roleLines[li].end ?? Infinity;
      if (tSec >= ls && tSec < le) {
        primaryLineIndex = li;
        break;
      }
    }
    // If between lines, find the next upcoming line
    if (primaryLineIndex === -1) {
      for (let li = 0; li < _roleLines.length; li++) {
        if ((_roleLines[li].start ?? 0) > tSec) {
          primaryLineIndex = li;
          break;
        }
      }
    }
    if (primaryLineIndex === -1) primaryLineIndex = _roleLines.length - 1;

    // prevLineIndex/nextLineIndex removed — active chunk only model

    // ═══ ACTIVE CHUNK ONLY: find THE single group being spoken right now ═══
    // No previous groups. No upcoming groups. One chunk, dead center.
    let activeGroupIdx = -1;
    {
      // Pass 1a: find a group whose speech is actively happening (highest priority)
      for (let ri = 0; ri < activeGroups.length; ri++) {
        const g = groups[activeGroups[ri]];
        if (g.lineIndex !== primaryLineIndex) continue;
        if (tSec >= g.start && tSec < g.end) {
          activeGroupIdx = activeGroups[ri];
          break;
        }
      }
      // Pass 1b: find a group that finished speaking but is still lingering
      // Only if no actively-spoken group was found — prevents linger from blocking next group
      if (activeGroupIdx === -1) {
        for (let ri = 0; ri < activeGroups.length; ri++) {
          const g = groups[activeGroups[ri]];
          if (g.lineIndex !== primaryLineIndex) continue;
          if (tSec >= g.end && tSec < g.end + g.lingerDuration) {
            activeGroupIdx = activeGroups[ri];
            break;
          }
        }
      }
      // Pass 2: if between groups, find the one we're entering (entry animation visible)
      if (activeGroupIdx === -1) {
        for (let ri = 0; ri < activeGroups.length; ri++) {
          const g = groups[activeGroups[ri]];
          if (g.lineIndex !== primaryLineIndex) continue;
          const entryPad = g.words.length * (g.staggerDelay ?? 0.05) + 0.2;
          if (tSec >= g.start - entryPad && tSec < g.start) {
            activeGroupIdx = activeGroups[ri];
            break;
          }
        }
      }
      // Pass 3: if still nothing, find closest exiting group (exit animation visible)
      if (activeGroupIdx === -1) {
        for (let ri = 0; ri < activeGroups.length; ri++) {
          const g = groups[activeGroups[ri]];
          if (g.lineIndex !== primaryLineIndex) continue;
          const exitEnd = g.end + g.lingerDuration + g.exitDuration;
          if (tSec >= g.end && tSec < exitEnd) {
            activeGroupIdx = activeGroups[ri];
            break;
          }
        }
      }
    }
    // Replace activeGroups with just the one active group
    if (activeGroupIdx >= 0) {
      activeGroups.length = 1;
      activeGroups[0] = activeGroupIdx;
    } else {
      activeGroups.length = 0;
    }

    // Compute centering offset for the active group:
    // shift its words so the group center lands at (480, 270) in compile space
    let groupCenterOffsetX = 0;
    if (activeGroupIdx >= 0) {
      const g = groups[activeGroupIdx];
      let minX = Infinity, maxX = -Infinity;
      for (const w of g.words) {
        minX = Math.min(minX, w.layoutX);
        maxX = Math.max(maxX, w.layoutX);
      }
      const groupCenterX = (minX + maxX) / 2;
      groupCenterOffsetX = 480 - groupCenterX; // shift to horizontal center
    }

    // Line transition easing removed — active chunk always at center

    const chunks = this._evalChunkPool;
    let ci = 0;
    const bpm = scene.bpm;

    for (let ai = 0; ai < activeGroups.length; ai++) {
      const groupIdx = activeGroups[ai];
      const group = groups[groupIdx];
      const resolvedLine = this.resolvedState.lineSettings[group.lineIndex];
      const nextGroupStart = (groupIdx + 1 < groups.length) ? groups[groupIdx + 1].start : Infinity;
      const groupEnd = Math.min(group.end + group.lingerDuration, nextGroupStart);

      // ═══ ACTIVE CHUNK ONLY: non-current groups are already filtered out above ═══
      const lineRole = group.lineIndex === primaryLineIndex ? 'current' : 'offscreen';

      // Pre-scan: is any SOLO hero word (≥500ms duration, emphasis ≥4) currently active?
      let groupHasActiveSoloHero = false;
      if (lineRole === 'current') {
        for (let hwi = 0; hwi < group.words.length; hwi++) {
          const hw = group.words[hwi];
          if (!hw.isHeroWord) continue;
          // Solo treatment only for words with ≥500ms duration
          if ((hw.wordDuration ?? 0) < 0.5) continue;
          const hwStagger = Math.max(0, (hw.wordStart ?? group.start) - group.start);
          const hwStart = group.start + hwStagger;
          const hwEnd = group.end + group.lingerDuration;
          if (tSec >= hwStart + 0.08 && tSec < hwEnd) {
            groupHasActiveSoloHero = true;
            break;
          }
        }
      }

      // ═══ MULTI-LINE LAYOUT ═══
      // Triggers when: (a) any word has emphasis >= 2 or isHeroWord, OR
      //                (b) phrase is too wide for a single line (> ~85% of 960px compile space)
      // Scaled words get their own line. Non-scaled words wrap at max 3 per line.
      const _mlDy: number[] = [];    // per-word Y offset in compile space
      const _mlDx: number[] = [];    // per-word X re-centering offset
      let _isMultiLine = false;
      const MAX_WORDS_PER_LINE = 3;
      const MAX_LINE_WIDTH = 960 * 0.85; // 816px in compile space

      if (lineRole === 'current' && !groupHasActiveSoloHero && group.words.length > 1) {
        const mCtx = this._measureCtx;
        const resolvedFontML = this.getResolvedFont();

        // Measure total line width and detect scaled words in one pass
        let hasScaledWord = false;
        let totalLineW = 0;
        for (let wi = 0; wi < group.words.length; wi++) {
          const w = group.words[wi];
          if (w.isHeroWord || (w.emphasisLevel ?? 0) >= 2) hasScaledWord = true;
          const fs = Math.round(w.baseFontSize * fontScale);
          const fontStr = `${w.fontWeight ?? 700} ${fs}px ${w.fontFamily ?? resolvedFontML}`;
          if (mCtx.font !== fontStr) mCtx.font = fontStr;
          totalLineW += mCtx.measureText(w.text).width;
          if (wi < group.words.length - 1) {
            const spaceStr = `400 ${fs}px ${w.fontFamily ?? resolvedFontML}`;
            if (mCtx.font !== spaceStr) mCtx.font = spaceStr;
            totalLineW += mCtx.measureText(' ').width * 1.15;
          }
        }

        // Trigger multi-line for scaled words OR wide lines
        const needsWrap = hasScaledWord || totalLineW > MAX_LINE_WIDTH || group.words.length > 4;

        if (needsWrap) {
          _isMultiLine = true;
          const normalFS = group.words[0].baseFontSize * fontScale;
          const normalLineH = normalFS * 1.3;

          // Build line list: scaled words get solo lines, others wrap at max 3
          type LineRange = { words: number[]; isHero: boolean; h: number };
          const lines: LineRange[] = [];
          let nonHeroBuf: number[] = [];

          const flushNonHero = () => {
            while (nonHeroBuf.length > 0) {
              const take = nonHeroBuf.splice(0, MAX_WORDS_PER_LINE);
              lines.push({ words: take, isHero: false, h: normalLineH });
            }
          };

          for (let wi = 0; wi < group.words.length; wi++) {
            const w = group.words[wi];
            const isScaled = w.isHeroWord || (w.emphasisLevel ?? 0) >= 2;
            if (isScaled) {
              flushNonHero();
              const heroEmp = w.emphasisLevel ?? 0;
              const heroFS = w.baseFontSize * fontScale;
              const heroScale = 1.0 + Math.max(0, heroEmp - 1) * 0.25;
              lines.push({ words: [wi], isHero: true, h: heroFS * heroScale * 1.4 });
            } else {
              nonHeroBuf.push(wi);
            }
          }
          flushNonHero();

          // Compute total height and center vertically around 0
          const totalH = lines.reduce((sum, l) => sum + l.h, 0);
          let yPos = -totalH / 2;

          for (const line of lines) {
            const lineY = yPos + line.h / 2;

            // Measure total line width to center it
            let lineW = 0;
            const wordWidths: number[] = [];
            for (let i = 0; i < line.words.length; i++) {
              const w = group.words[line.words[i]];
              const fs = Math.round(w.baseFontSize * fontScale);
              const weight = w.fontWeight ?? 700;
              const family = w.fontFamily ?? resolvedFontML;
              const emp = w.emphasisLevel ?? 0;
              const scale = line.isHero ? (1.0 + Math.max(0, emp - 1) * 0.25) : 1.0;
              const fontStr = `${weight} ${fs}px ${family}`;
              if (mCtx.font !== fontStr) mCtx.font = fontStr;
              const ww = mCtx.measureText(w.text).width * scale;
              wordWidths.push(ww);
              lineW += ww;
              if (i < line.words.length - 1) {
                const spaceStr = `400 ${fs}px ${family}`;
                if (mCtx.font !== spaceStr) mCtx.font = spaceStr;
                lineW += mCtx.measureText(' ').width * 1.15;
              }
            }

            // Position words left-to-right centered at x=480
            const startX = 480 - lineW / 2;
            let cursor = startX;
            for (let i = 0; i < line.words.length; i++) {
              const wi = line.words[i];
              const w = group.words[wi];
              const wordCenterX = cursor + wordWidths[i] / 2;
              _mlDx[wi] = wordCenterX - w.layoutX;
              _mlDy[wi] = lineY;
              cursor += wordWidths[i];
              if (i < line.words.length - 1) {
                const fs = Math.round(w.baseFontSize * fontScale);
                const spaceStr = `400 ${fs}px ${w.fontFamily ?? resolvedFontML}`;
                if (mCtx.font !== spaceStr) mCtx.font = spaceStr;
                cursor += mCtx.measureText(' ').width * 1.15;
              }
            }

            yPos += line.h;
          }
        }
      }

      for (let wi = 0; wi < group.words.length; wi++) {
        const word = group.words[wi];
        const resolvedWord = this.resolvedState.wordSettings[word.clean ?? normalizeToken(word.text)] ?? null;
        const isAnchor = wi === group.anchorWordIdx;
        // Use actual word-level timestamp for entry timing instead of artificial stagger
        const staggerDelay = Math.max(0, (word.wordStart ?? group.start) - group.start);
        const li = word.letterIndex ?? 0;
        const lt = word.letterTotal ?? 1;
        const letterDelay = word.isLetterChunk ? li * 0.06 : 0;
        const adjustedElapsed = Math.max(0, tSec - group.start - staggerDelay - letterDelay);
        // Use budget-constrained entry duration when available — prevents 350ms fade-in
        // on words that are only spoken for 170ms in fast sections
        const wb = this._wordBudgetMap.get(word.id);
        const effectiveEntryDuration = wb ? wb.entryBudget : (group.entryDuration * word.entryDurationMult);
        const entryProgress = Math.min(1, Math.max(0, adjustedElapsed / Math.max(0.01, effectiveEntryDuration)));

        const effectiveExitDuration = wb ? wb.exitBudget : Math.min(group.exitDuration, Math.max(0.05, nextGroupStart - group.end));
        const exitDelay = word.isLetterChunk && SPLIT_EXIT_STYLES.has(word.exitStyle) ? letterDelay : 0;
        const exitProgress = Math.max(0, (tSec - groupEnd - exitDelay) / Math.max(0.01, effectiveExitDuration));

        // ═══ V2: EffectBudgeter — use budget-resolved styles when available ═══
        // Budget downgrades heavy effects (slide, scale) to lighter ones (fade, cut)
        // when the word's screen time is too short for the original animation to complete.
        // wb already resolved above for entry/exit duration budgeting
        const usedEntry = (wb?.resolvedEntry ?? word.entryStyle) as any;
        const usedExit = (wb?.resolvedExit ?? word.exitStyle) as any;
        const usedBehavior = (wb?.resolvedBehavior ?? word.behaviorStyle) as any;
        const usedIntensity = wb?.behaviorIntensity ?? group.behaviorIntensity;

        const entryState = computeEntryState(usedEntry, entryProgress, usedIntensity);
        const exitState = computeExitState(usedExit, exitProgress, usedIntensity, li, lt);
        // ═══ V2: Use conductor phase directly ═══
        const wordBeatPhase = beatPhase;
        const behaviorState = computeBehaviorState(usedBehavior, tSec, group.start, wordBeatPhase, usedIntensity);

        const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
        const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
        let finalScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1) * word.semanticScaleX;
        let finalScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1) * word.semanticScaleY;

        const isEntryComplete = entryProgress >= 1.0;
        const isExiting = exitProgress > 0;

        // ═══ ACTIVE CHUNK ONLY: always dead center, full brightness ═══
        const roleY = 270; // center of 540px compile space

        // Base animation alpha (entry/exit/behavior)
        const animAlpha = isExiting
          ? Math.max(0, exitState.alpha)
          : isEntryComplete
            ? 1.0 * (behaviorState.alpha ?? 1)
            : Math.max(0.1, entryState.alpha * (behaviorState.alpha ?? 1));

        // No previous/next/offscreen. No vocal wave alpha modulation.
        // Active chunk words are at full brightness. Period.
        let roleAlpha = lineRole === 'current' ? 1.0 : 0.0;
        let roleScale = 1.0;

        // Wave proximity still tracked for emphasis glow, but NOT for alpha
        let waveProximity = 0;
        if (lineRole === 'current' && isEntryComplete && !isExiting) {
          const lineData = _roleLines[primaryLineIndex];
          const lineStart = lineData?.start ?? group.start;
          const lineEnd = lineData?.end ?? group.end;
          const lineDuration = Math.max(0.01, lineEnd - lineStart);
          const vocalProgress = Math.max(0, Math.min(1, (tSec - lineStart) / lineDuration));
          const wordTime = group.start + staggerDelay;
          const wordPosition = Math.max(0, Math.min(1, (wordTime - lineStart) / lineDuration));
          const distance = vocalProgress - wordPosition;
          const empLevel = word.emphasisLevel ?? 0;
          const waveWidth = 0.12 + Math.min(empLevel, 5) * 0.026;
          waveProximity = Math.exp(-(distance * distance) / (2 * waveWidth * waveWidth));
        }

        let finalAlpha = Math.min(word.semanticAlphaMax, animAlpha * roleAlpha);

        // ─── NEW HERO MODEL: duration-gated solo OR emphasis-based inline ───
        const isHeroWord = word.isHeroWord === true;
        const heroDuration = word.wordDuration ?? 0;
        const isSoloHero = isHeroWord && heroDuration >= 0.5; // ≥500ms = solo center
        let heroScaleMult = 1.0;
        let heroOffsetX = 0;
        let heroOffsetY = 0;

        // SOLO hero: ≥500ms, alone center screen
        if (isSoloHero && lineRole === 'current' && groupHasActiveSoloHero) {
          heroOffsetX = 480 - word.layoutX - groupCenterOffsetX; // center, undoing group shift
          heroOffsetY = 270 - roleY;
          heroScaleMult = 1.5;
        }

        // Non-hero words: hidden while a SOLO hero is active
        if (!isSoloHero && lineRole === 'current' && groupHasActiveSoloHero) {
          roleAlpha = 0;
        }

        // ═══ EMPHASIS-BASED INLINE SCALING ═══
        // emp 1 = baseline (matches compile-time layout), emp 2+ = progressively larger.
        // Compile-time layoutX positions words at base size (emp 1 = 1.0x).
        // Runtime scale MUST match or words overflow their slots.
        const emp = word.emphasisLevel ?? 0;
        const emphasisScale = 1.0 + Math.max(0, emp - 1) * 0.25;
        const emphasisWeight = Math.min(900, (word.fontWeight ?? 400) + Math.max(0, emp - 1) * 100);

        // Apply emphasis to inline words (solo heroes get heroScaleMult instead)
        if (!isSoloHero || !groupHasActiveSoloHero) {
          heroScaleMult = emphasisScale;
        }

        finalAlpha = Math.min(word.semanticAlphaMax, animAlpha * roleAlpha);


        const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
        const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);
        const finalBlur = (entryState.blur ?? 0) + (exitState.blur ?? 0) + (behaviorState.blur ?? 0);
        const finalRotation = (entryState.rotation ?? 0) + (exitState.rotation ?? 0) + (behaviorState.rotation ?? 0);
        const isFrozen = usedBehavior === 'freeze' && (tSec - group.start) > 0.3;

        const effectiveFontSize = word.baseFontSize * fontScale;
        const charW = word.isLetterChunk ? effectiveFontSize * 0.6 : 0;
        const wordSpan = charW * lt;
        const letterOffsetX = word.isLetterChunk ? (li * charW) - (wordSpan * 0.5) + (charW * 0.5) : 0;

        // Micro cam push — skip for SOLO hero words (they're center-screen)
        if (!(isSoloHero && groupHasActiveSoloHero)) {
          const isHeroBeatHit = isExactHeroTokenMatch(word.text, resolvedLine?.heroWord ?? '') && beatPulse > 0.35;
          if (isHeroBeatHit) {
            const push = resolvedWord?.microCamPush ?? 0.04;
            finalScaleX *= 1 + push;
            finalScaleY *= 1 + push;
            driftY += push * 16;
          }
        }

        // ═══ SIMPLIFIED GLOW: spoken words glow, solo hero words glow stronger ═══
        let wordGlow = 0;
        if (isAnchor && lineRole === 'current') {
          // Currently spoken word — clean bright glow
          wordGlow = 0.6 + beatPulse * 0.3;
        } else if (isSoloHero && groupHasActiveSoloHero && lineRole === 'current') {
          // Solo hero during its center-screen moment
          wordGlow = 0.7;
        }

        const chunk = chunks[ci] ?? ({} as ScaledKeyframe['chunks'][number]);
        chunks[ci] = chunk;
        chunk.id = word.id;
        chunk.text = word.text;

        // Wave-driven scale: gentle breathe for inline words as vocal passes
        let waveScale = 1.0;
        if (!(isSoloHero && groupHasActiveSoloHero) && lineRole === 'current' && waveProximity > 0.01) {
          waveScale = 1.0 + waveProximity * 0.06;
        }

        // When multi-line is active, _mlDx already positions words centered at 480.
        // Skip groupCenterOffsetX to avoid double-centering.
        const xCenterOffset = _isMultiLine ? (_mlDx[wi] ?? 0) : groupCenterOffsetX;
        chunk.x = (word.layoutX + xCenterOffset + finalOffsetX + letterOffsetX + heroOffsetX) * sx;
        chunk.y = (roleY + (_isMultiLine ? (_mlDy[wi] ?? 0) : 0) + finalOffsetY + heroOffsetY) * sy;
        chunk.fontSize = effectiveFontSize;
        chunk.alpha = Math.max(0, Math.min(1, finalAlpha));
        chunk.scaleX = finalScaleX * intensityScaleMult * heroScaleMult * waveScale * roleScale;
        chunk.scaleY = finalScaleY * intensityScaleMult * heroScaleMult * waveScale * roleScale;
        chunk.scale = 1;
        chunk.visible = finalAlpha > 0.01;
        chunk.fontWeight = emphasisWeight;
        chunk.fontFamily = word.fontFamily;
        chunk.isAnchor = isAnchor;
        chunk.color = word.color;
        // ═══ SINGLE COLOR MODEL: one color for all words, contrast against background ═══
        // No tiers, no semantic overrides, no palette juggling.
        // Light text on dark backgrounds, dark text on light backgrounds.
        {
          const bgIsLight = this._textBandBrightness > 0.55;
          chunk.color = bgIsLight ? '#1a1a2e' : '#f0f0f0';
        }
        chunk.glow = wordGlow;
        chunk.entryStyle = usedEntry;
        chunk.exitStyle = usedExit;
        chunk.emphasisLevel = resolvedWord?.emphasisLevel ?? word.emphasisLevel ?? 0;
        chunk.entryProgress = entryProgress;
        chunk.exitProgress = Math.min(1, exitProgress);
        chunk.behavior = usedBehavior;
        chunk.skewX = finalSkewX;
        chunk.blur = Math.max(0, Math.min(1, finalBlur));
        chunk.rotation = finalRotation;
        chunk.ghostTrail = resolvedWord?.ghostTrail ?? word.ghostTrail;
        chunk.ghostCount = word.ghostCount;
        chunk.ghostSpacing = word.ghostSpacing;
        chunk.ghostDirection = (resolvedWord?.ghostDirection ?? word.ghostDirection) as any;
        chunk.heroTrackingExpand = false;
        chunk.isHeroWord = isHeroWord;
        chunk.isSoloHero = isSoloHero;
        chunk.letterIndex = word.letterIndex;
        chunk.letterTotal = word.letterTotal;
        chunk.letterDelay = word.letterDelay ?? 0;
        chunk.isLetterChunk = word.isLetterChunk;
        chunk.frozen = isFrozen;
        chunk.iconGlyph = isAnchor ? word.iconGlyph : undefined;
        chunk.iconStyle = isAnchor ? word.iconStyle : undefined;
        chunk.iconPosition = isAnchor ? word.iconPosition : undefined;
        chunk.iconScale = isAnchor ? word.iconScale : undefined;
        chunk.entryOffsetY = 0;
        chunk.entryOffsetX = 0;
        chunk.entryScale = 1;
        chunk.exitOffsetY = 0;
        chunk.exitScale = 1;
        ci++;
      }
    }
    chunks.length = ci;

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
    frame.cameraX = driftX;
    frame.cameraY = driftY;
    frame.cameraZoom = effectiveZoom;
    frame.bgBlend = 0;
    (frame as any).beatPulse = beatPulse;
    frame.atmosphere = (chapter?.atmosphere ?? 'cinematic') as any;
    frame.chunks = chunks;
    frame.particles = [];
    return frame;
  }

  private solveConstraints(
    bounds: ChunkBounds[],
    wallLeft: number,
    wallRight: number,
    wallTop: number,
    wallBottom: number,
  ): void {
    const MAX_ITERS = 4;
    for (let iter = 0; iter < MAX_ITERS; iter += 1) {
      let hadCollision = false;
      let hadWallProjection = false;

      for (let i = 0; i < bounds.length; i += 1) {
        const b = bounds[i];
        const minX = wallLeft + b.halfW;
        const maxX = wallRight - b.halfW;
        const minY = wallTop + b.halfH;
        const maxY = wallBottom - b.halfH;
        const nextX = Math.max(minX, Math.min(maxX, b.cx));
        const nextY = Math.max(minY, Math.min(maxY, b.cy));
        if (nextX !== b.cx || nextY !== b.cy) {
          b.cx = nextX;
          b.cy = nextY;
          hadWallProjection = true;
        }
      }

      for (let i = 0; i < bounds.length; i += 1) {
        const a = bounds[i];
        for (let j = i + 1; j < bounds.length; j += 1) {
          const b = bounds[j];
          const dx = a.cx - b.cx;
          const dy = a.cy - b.cy;
          const overlapX = (a.halfW + b.halfW) - Math.abs(dx);
          const overlapY = (a.halfH + b.halfH) - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          hadCollision = true;

          let moveA = 0.5;
          let moveB = 0.5;
          if (a.priority < b.priority) {
            moveA = 0.2;
            moveB = 0.8;
          } else if (b.priority < a.priority) {
            moveA = 0.8;
            moveB = 0.2;
          }

          if (overlapX < overlapY) {
            const sign = dx >= 0 ? 1 : -1;
            const sep = overlapX;
            a.cx += sign * sep * moveA;
            b.cx -= sign * sep * moveB;
          } else {
            const sign = dy >= 0 ? 1 : -1;
            const sep = overlapY;
            a.cy += sign * sep * moveA;
            b.cy -= sign * sep * moveB;
          }
        }
      }

      if (!hadCollision && !hadWallProjection) break;
    }

    for (let i = 0; i < bounds.length; i += 1) {
      const b = bounds[i];
      const minX = wallLeft + b.halfW;
      const maxX = wallRight - b.halfW;
      const minY = wallTop + b.halfH;
      const maxY = wallBottom - b.halfH;
      b.cx = Math.max(minX, Math.min(maxX, b.cx));
      b.cy = Math.max(minY, Math.min(maxY, b.cy));
    }
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
      this.ctx.fillStyle = '#0a0a0f';
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawLightingOverlay(_frame: ScaledKeyframe, tSec: number): void {
    const songDuration = Math.max(1, this.songEndSec - this.songStartSec);
    const songProgress = Math.max(0, Math.min(1, (tSec - this.songStartSec) / songDuration));
    const cd = this.data.cinematic_direction as any;
    if (!cd) return;

    const climaxRatio = cd.climax?.timeRatio ?? 0.75;
    const climaxRange = 0.08;
    const distToClimax = Math.abs(songProgress - climaxRatio);
    if (distToClimax >= climaxRange) return;

    const intensity = (1 - distToClimax / climaxRange) * (cd.climax?.maxLightIntensity ?? 0.6);
    const alphaKey = Math.round(intensity * 100);
    const key = `${this.width}-${this.height}-${alphaKey}`;

    if (key !== this._lightingOverlayKey || !this._lightingOverlayCanvas) {
      const off = document.createElement('canvas');
      off.width = this.width;
      off.height = this.height;
      const octx = off.getContext('2d')!;
      const grad = octx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, this.width * 0.6
      );
      grad.addColorStop(0, `rgba(255,255,240,${intensity * 0.15})`);
      grad.addColorStop(1, 'rgba(255,255,240,0)');
      octx.fillStyle = grad;
      octx.fillRect(0, 0, this.width, this.height);
      this._lightingOverlayCanvas = off;
      this._lightingOverlayKey = key;
    }

    this.ctx.drawImage(this._lightingOverlayCanvas, 0, 0);
  }

  private checkEmotionalEvents(tSec: number, songProgress: number): void {
    for (const ev of this.emotionalEvents) {
      if (ev.triggered) continue;
      if (songProgress >= ev.triggerRatio) {
        ev.triggered = true;
        this.activeEvents.push({ event: ev, startTime: tSec });
      }
    }
    // In-place filter — no allocation
    let writeIdx = 0;
    for (let i = 0; i < this.activeEvents.length; i++) {
      if ((tSec - this.activeEvents[i].startTime) < this.activeEvents[i].event.duration) {
        this.activeEvents[writeIdx++] = this.activeEvents[i];
      }
    }
    this.activeEvents.length = writeIdx;
  }

  private drawEmotionalEvents(tSec: number): void {
    for (const ae of this.activeEvents) {
      const age = tSec - ae.startTime;
      const progress = Math.min(1, age / ae.event.duration);
      const fadeAlpha = ae.event.intensity * (1 - progress);

      this.ctx.save();
      switch (ae.event.type) {
        case 'light-break': {
          const grad = this.ctx.createRadialGradient(
            this.width / 2, this.height / 2, 0,
            this.width / 2, this.height / 2, this.width * (0.3 + progress * 0.5)
          );
          grad.addColorStop(0, `rgba(255,255,220,${fadeAlpha * 0.25})`);
          grad.addColorStop(1, 'rgba(255,255,220,0)');
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(0, 0, this.width, this.height);
          break;
        }
        case 'void-moment': {
          this.ctx.fillStyle = `rgba(0,0,0,${fadeAlpha * 0.3})`;
          this.ctx.fillRect(0, 0, this.width, this.height);
          break;
        }
        case 'lens-breath': {
          const grad = this.ctx.createRadialGradient(
            this.width / 2, this.height / 2, this.width * 0.3,
            this.width / 2, this.height / 2, this.width * 0.7
          );
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, `rgba(0,0,0,${fadeAlpha * 0.15})`);
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(0, 0, this.width, this.height);
          break;
        }
        case 'halo-ring': {
          const radius = progress * this.width * 0.4;
          this.ctx.beginPath();
          this.ctx.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
          this.ctx.lineWidth = 2 * (1 - progress);
          this.ctx.strokeStyle = `rgba(255,255,255,${fadeAlpha * 0.2})`;
          this.ctx.stroke();
          break;
        }
        case 'world-shift': {
          this.ctx.fillStyle = `rgba(20,10,40,${fadeAlpha * 0.1})`;
          this.ctx.fillRect(0, 0, this.width, this.height);
          break;
        }
        default:
          break;
      }
      this.ctx.restore();
    }
  }

  private cleanWord(text: string): string {
    return text.replace(/[^a-zA-Z'']/g, '').toLowerCase();
  }

  // ═══ Hero schedule: pre-computed for SOLO heroes (≥500ms, emphasis ≥4) ═══

  private _buildHeroSchedule(): void {
    const words = this.data.words ?? [];
    const ws = this.resolvedState.wordSettings;
    const wdm = this.resolvedState.wordDirectivesMap;
    const schedule: typeof this._heroSchedule = [];

    for (const w of words) {
      const clean = normalizeToken(w.word);
      const resolved = ws[clean];
      const directive = wdm[clean];
      const emphasis = resolved?.emphasisLevel ?? directive?.emphasisLevel ?? 0;
      const duration = w.end - w.start;
      // Only solo-eligible heroes drive camera lookahead
      if (emphasis >= 4 && duration >= 0.5) {
        schedule.push({
          startSec: w.start,
          endSec: w.end,
          emphasis,
          word: w.word,
        });
      }
    }

    // Sort by start time
    schedule.sort((a, b) => a.startSec - b.startSec);
    this._heroSchedule = schedule;
    console.info(`[CameraLookahead] ${schedule.length} hero words scheduled`);
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
