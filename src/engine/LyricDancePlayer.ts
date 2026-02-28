/* cache-bust: 2026-02-28T2 */
/**
 * LyricDancePlayer — frame-budget-first canvas engine.
 *
 * IMPORTANT:
 * - Fresh implementation. Do not copy logic from prior versions.
 * - React never draws to canvas; React only calls public methods.
 * - Draw loop is pure lookup from baked keyframes.
 */

import type { CinematicDirection } from "@/types/CinematicDirection";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { SceneContext } from "@/lib/sceneContexts";
import { drawIcon, type IconGlyph, type IconStyle } from "@/lib/lyricIcons";
import { type Keyframe, type ScenePayload } from "@/lib/lyricSceneBaker";
import {
  compileScene,
  computeEntryState,
  computeExitState,
  computeBehaviorState,
  type CompiledScene,
} from "@/lib/sceneCompiler";
import { deriveTensionCurve, enrichSections } from "@/engine/directionResolvers";
import { PARTICLE_SYSTEM_MAP, ParticleEngine } from "@/engine/ParticleEngine";
import {
  computeBeatSpine,
  isExactHeroTokenMatch,
  normalizeToken,
  resolveCinematicState,
  type ResolvedLineSettings,
  type ResolvedWordSettings,
} from "@/engine/cinematicResolver";

const DECOMP_ENABLED = true; // enabled for hero words (emphasis 4-5) only
const LYRIC_DANCE_PLAYER_BUILD_STAMP = '[LyricDancePlayer] build: v24-diag-2026-02-28';

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
  activeWordTrail: string;
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
  activeWordTrail: "none",
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
    trail?: string;
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
    emitterType?: string;
    letterIndex?: number;
    letterTotal?: number;
    letterDelay?: number;
    isLetterChunk?: boolean;
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
let globalBakeLock = false;
let globalBakePromise: Promise<void> | null = null;
let globalCompiledScene: CompiledScene | null = null;
let globalChunkCache: Map<string, ChunkState> | null = null;
let globalHasCinematicDirection = false;
let globalSongStartSec = 0;
let globalSongEndSec = 0;
let globalBakerVersion = 0;
let globalSessionKey = '';

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

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
  color: string;
  type: string;
  rotation: number;
  rotationSpeed: number;
}

interface BurstEmitter {
  id: string;
  x: number;
  y: number;
  startTime: number;
  emitDuration: number;
  totalDuration: number;
  particles: BurstParticle[];
  trailType: string;
  direction: 'up' | 'down' | 'left' | 'right' | 'radial';
  spawnRate: number;
  maxParticles: number;
  palette: { accent: string; glow: string; particle: string };
}

type DecompEffect = 'explode' | 'ice-shatter' | 'burn-away' | 'dissolve' | 'melt' | 'ascend' | 'glitch' | 'bloom' | 'crush' | 'shockwave' | 'magnetize';

interface DecompParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  life: number;
  rotation: number;
  rotSpeed: number;
  gravity: number;
  drag: number;
  shape: 'dot' | 'shard' | 'streak' | 'ember';
  column: number;
  burnDelay: number;
  dissolveDelay: number;
  dripDelay: number;
  riseDelay: number;
  burstDelay: number;
  glitchOffsetX: number;
  glitchOffsetY: number;
  targetX: number;
  targetY: number;
  active: boolean;
}

interface PixelDecomp {
  id: string;
  particles: DecompParticle[];
  effect: DecompEffect;
  startTime: number;
  duration: number;
  centerX: number;
  centerY: number;
  wordWidth: number;
  fontSize: number;
  word: string;
  color: string;
  phase: number;
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
  private _solvedWalls = { left: 0, right: 0, top: 0, bottom: 0 };

  // ═══ Compiled Scene (replaces timeline) ═══
  private compiledScene: CompiledScene | null = null;

  // Runtime evaluator state
  private _evalChunkPool: Array<ScaledKeyframe['chunks'][number]> = [];
  private _activeGroupIndices: number[] = [];

  // Beat-reactive state (evaluated incrementally)
  private _beatCursor = 0;
  private _springOffset = 0;
  private _springVelocity = 0;
  private _glowBudget = 0;
  private _lastBeatIndex = -1;
  private _currentZoom = 1.0;
  private _smoothedTime = 0;
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
  private chapterSims: Array<{ fire?: FireSim; water?: WaterSim; aurora?: AuroraSim; rain?: RainSim }> = [];
  private lastSimFrame = -1;
  private currentSimCanvases: HTMLCanvasElement[] = [];
  private chapterImages: HTMLImageElement[] = [];
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
  private chapterImageLuminance = new WeakMap<HTMLImageElement, number>();
  private _haloStamps: Map<string, HTMLCanvasElement> = new Map();
  private _crushOverlayCanvas: HTMLCanvasElement | null = null;
  private _crushOverlayKey = '';
  private _lightingOverlayCanvas: HTMLCanvasElement | null = null;
  private _lightingOverlayKey = '';
  private _prevImgIdx = -1;
  private emotionalEvents: EmotionalEvent[] = [];
  private activeEvents: Array<{ event: EmotionalEvent; startTime: number }> = [];

  // Word-local particle emitters
  private burstEmitters: BurstEmitter[] = [];
  private lastBurstTickMs = 0;
  private activeDecomps: PixelDecomp[] = [];
  private readonly particlePool: DecompParticle[] = Array.from({ length: 600 }, () => this.createEmptyParticle());
  private poolIndex = 0;
  private readonly offscreen = document.createElement('canvas');
  private readonly octx = this.offscreen.getContext('2d', { willReadFrequently: true })!;

  // Comment comets
  private activeComments: CommentChunk[] = [];
  private commentColors = ['#FFD700', '#00FF87', '#FF6B6B', '#88CCFF', '#FF88FF'];
  private commentColorIdx = 0;

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
  private activeSectionTexture = 'dust';
  private activeTension: any = null;
  private lastExitProgressByChunk = new Map<string, number>();
  private chunkActiveSinceMs: Map<string, number> = new Map();
  private _prevPrimaryLineIndex: number = -1;
  private _lineTransitionStartSec: number = 0;


  // Health monitor
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private lastHealthCheck = 0;
  private currentTSec = 0;

  // Stall detection
  private _lastLoggedTSec = 0;
  private _stalledFrames = 0;
  private _lastSimChapterIdx = -1;

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
    // Invalidate cache if song changed (survives HMR)
    const songId = data.id;
    if (
      globalCompiledScene &&
      (globalSessionKey !== `v15-${songId}` || globalBakerVersion !== BAKER_VERSION)
    ) {
      globalCompiledScene = null;
    }
    const sessionKey = `v15-${data.id}`;
    if (globalSessionKey !== sessionKey) {
      globalSessionKey = sessionKey;
      globalBakePromise = null;
      globalCompiledScene = null;
      globalChunkCache = null;
      globalBakeLock = false;
      globalHasCinematicDirection = false;
      globalBakerVersion = 0;
    }
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
    this.activeDecomps.length = 0;

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

    // Cache exists but was baked without cinematic direction — invalidate before promise reuse
    if (globalCompiledScene && !globalHasCinematicDirection && this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction)) {
      globalBakePromise = null;
      globalCompiledScene = null;
      globalChunkCache = null;
      globalBakeLock = false;
    }

    if (!globalBakePromise) {
      // First instance — start the bake
      globalBakeLock = true;
      globalBakePromise = (async () => {
        const payload = this.buildScenePayload();
        this.payload = payload;
        this.resolvePlayerState(payload);
        await this.preloadFonts();
        this.songStartSec = payload.songStart;
        this.songEndSec = payload.songEnd;

        // Compile the scene — produces lightweight schedule, not 15,000 frames
        const compiled = compileScene(payload);
        this.compiledScene = compiled;

        // Build chunk cache from compiled scene
        this._buildChunkCacheFromScene(compiled);

        // Compute viewport scale
        this._updateViewportScale();
        this._textMetricsCache.clear();

        globalCompiledScene = compiled;
        globalChunkCache = new Map(this.chunks);
        globalHasCinematicDirection = !!this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction);
        globalSongStartSec = payload.songStart;
        globalSongEndSec = payload.songEnd;
        globalBakerVersion = BAKER_VERSION;
        globalBakeLock = false;
      })();
    }

    // ALL instances wait for the promise — including the first one
    await globalBakePromise;

    // Now cache is guaranteed to exist for every instance
    this.compiledScene = globalCompiledScene;
    this.chunks = new Map(globalChunkCache!);
    this.songStartSec = globalSongStartSec;
    this.songEndSec = globalSongEndSec;
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
      this.resolvePlayerState(payload);
      this.songStartSec = payload.songStart;
      this.songEndSec = payload.songEnd;

      this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);
      const compiled = compileScene(payload);
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
    this._glowBudget = 0;
    this._springOffset = 0;
    this._springVelocity = 0;
    this._currentZoom = 1.0;
    this._timeInitialized = false;
  }

  seekTo(timeSec: number): void {
    this.seek(timeSec);
    this.burstEmitters = [];
    this.lastBurstTickMs = 0;
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
    this._crushOverlayCanvas = null;
    this._crushOverlayKey = '';
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._haloStamps.clear();
    this.ambientParticleEngine?.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
    this.lastSimFrame = -1;
    this._updateViewportScale();
    this._textMetricsCache.clear();
    this._lastVisibleChunkIds = '';
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
    this.resolvePlayerState(this.payload);
    this.compiledScene = compileScene(this.payload);
    this._buildChunkCacheFromScene(this.compiledScene);
    this._updateViewportScale();
    this._textMetricsCache.clear();
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
      const compiled = compileScene(this.payload);
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
    this._crushOverlayCanvas = null;
    this._lightingOverlayCanvas = null;
    this._haloStamps.clear();
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

      // Health check — silent (no logging)
    }, 5000);
  }

  private stopHealthMonitor(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private tick = (timestamp: number): void => {
    if (this.destroyed) return; // truly dead — no reschedule
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

      this.update(deltaMs, smoothedTime);
      this.draw(smoothedTime);
    } catch (err) {
      // render crash — silently continue
    } finally {
      // ALWAYS reschedule — even after crash — loop must never die
      if (!this.destroyed && this.playing) {
        this.rafHandle = requestAnimationFrame(this.tick);
      }
    }
  };

  private getHaloStamp(radius: number, isAnchor: boolean, chapterColor: string): HTMLCanvasElement {
    const bucketedRadius = Math.ceil(radius / 8) * 8;
    const key = `${bucketedRadius}-${isAnchor ? 1 : 0}-${chapterColor}`;

    let stamp = this._haloStamps.get(key);
    if (stamp) return stamp;

    const size = bucketedRadius * 2;
    stamp = document.createElement('canvas');
    stamp.width = size;
    stamp.height = size;
    const ctx = stamp.getContext('2d')!;

    const innerAlpha = isAnchor ? 0.72 : 0.45;
    const innerColor = isAnchor
      ? this.blendWithBlack(chapterColor, 0.85)
      : '#000000';

    const halo = ctx.createRadialGradient(bucketedRadius, bucketedRadius, 0, bucketedRadius, bucketedRadius, bucketedRadius);
    halo.addColorStop(0, this.hexWithAlpha(innerColor, innerAlpha));
    halo.addColorStop(0.6, this.hexWithAlpha(innerColor, innerAlpha * 0.6));
    halo.addColorStop(1, this.hexWithAlpha(innerColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(bucketedRadius, bucketedRadius, bucketedRadius, 0, Math.PI * 2);
    ctx.fill();

    this._haloStamps.set(key, stamp);
    return stamp;
  }

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
    // 0.15 = responsive enough to not drift, smooth enough to hide jitter
    const alpha = 0.5;
    this._smoothedTime += (rawTime - this._smoothedTime) * alpha;

    // Never drift more than 100ms from real time
    if (Math.abs(this._smoothedTime - rawTime) > 0.05) {
      this._smoothedTime = rawTime;
    }

    return this._smoothedTime;
  }

  private drawWordHalo(
    x: number,
    y: number,
    fontSize: number,
    isAnchor: boolean,
    chapterColor: string,
    alpha: number
  ): void {
    if (alpha < 0.01) return;
    const baseRadius = fontSize * (isAnchor ? 1.8 : 1.2);
    const stamp = this.getHaloStamp(baseRadius, isAnchor, chapterColor);
    const size = baseRadius * 2;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(stamp, x - baseRadius, y - baseRadius, size, size);
    this.ctx.globalAlpha = 1;
  }

  private blendWithBlack(hex: string, blackAmount: number): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '#000000';
    const r = Math.round(parseInt(clean.slice(0, 2), 16) * (1 - blackAmount));
    const g = Math.round(parseInt(clean.slice(2, 4), 16) * (1 - blackAmount));
    const b = Math.round(parseInt(clean.slice(4, 6), 16) * (1 - blackAmount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private getTextColor(chunkColor: string): string {
    // V3: colors come pre-resolved from the palette. Don't darken again.
    return chunkColor;
  }

  private darkenColor(hex: string, amount: number): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return hex;
    const r = Math.round(parseInt(clean.slice(0, 2), 16) * (1 - amount));
    const g = Math.round(parseInt(clean.slice(2, 4), 16) * (1 - amount));
    const b = Math.round(parseInt(clean.slice(4, 6), 16) * (1 - amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

  private resolveChapterIndex(chapters: any[], currentTimeSec: number, totalDurationSec: number): number {
    return this.resolveSectionIndex(chapters, currentTimeSec, totalDurationSec);
  }

  private resolveChapter(chapters: any[], currentTimeSec: number, totalDurationSec: number): any {
    const idx = this.resolveChapterIndex(chapters, currentTimeSec, totalDurationSec);
    return chapters[idx] ?? chapters[0];
  }
  /** Resolve the effective palette from image-derived palettes or legacy fallbacks */
  private getResolvedPalette(): string[] {
    const autoPalettes = this.data?.auto_palettes;
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const chapters = (cd?.chapters as any[]) ?? [];
    const sections = (cd?.sections as any[]) ?? [];

    // Find current chapter/section based on playback position
    const currentTimeSec = this.audio?.currentTime ?? 0;
    const totalDurationSec = this.audio?.duration || 1;

    // Priority 1: auto-palettes computed from section images
    // These align with sections, not chapters
    if (Array.isArray(autoPalettes) && autoPalettes.length > 0) {
      // Use sections for index since auto_palettes come from section_images
      const sectionSource = sections.length > 0 ? sections : chapters;
      let resolvedIdx = 0;
      let resolvedVia = 'fallback[0]';

      if (sectionSource.length > 0) {
        const secIdx = this.resolveSectionIndex(sectionSource, currentTimeSec, totalDurationSec);
        if (secIdx >= 0 && autoPalettes[secIdx]) {
          resolvedIdx = secIdx;
          resolvedVia = 'sectionIndex';
        } else if (totalDurationSec > 0 && autoPalettes.length > 1) {
          const progress = Math.max(0, Math.min(0.999, currentTimeSec / totalDurationSec));
          resolvedIdx = Math.floor(progress * autoPalettes.length);
          resolvedVia = 'evenSplit';
        }
      } else if (totalDurationSec > 0 && autoPalettes.length > 1) {
        const progress = Math.max(0, Math.min(0.999, currentTimeSec / totalDurationSec));
        resolvedIdx = Math.floor(progress * autoPalettes.length);
        resolvedVia = 'evenSplit(noSections)';
      }

      // Periodic diagnostic log every 3s
      const now = Date.now();
      if (!(this as any)._lastPaletteCycleLog || now - (this as any)._lastPaletteCycleLog > 3000) {
        (this as any)._lastPaletteCycleLog = now;
        const s0 = sectionSource[0];
        console.log(
          `[palette-cycle] t=${currentTimeSec.toFixed(1)}s / ${(this.audio?.duration ?? NaN).toFixed(1)}s, ` +
          `sections=${sectionSource.length}, secIdx=${resolvedIdx}, via=${resolvedVia}, ` +
          `palette=${autoPalettes[resolvedIdx]?.[2] ?? '?'}, ` +
          `s0={startSec:${s0?.startSec ?? 'undef'}, endSec:${s0?.endSec ?? 'undef'}, ` +
          `startRatio:${s0?.startRatio ?? 'undef'}, endRatio:${s0?.endRatio ?? 'undef'}}`
        );
      }

      return autoPalettes[resolvedIdx];
    }

    const chIdx = chapters.length > 0
      ? this.resolveChapterIndex(chapters, currentTimeSec, totalDurationSec)
      : 0;

    // DIAGNOSTIC: log which fallback branch is hit (once)
    if (!(this as any)._paletteDiagLogged) {
      (this as any)._paletteDiagLogged = true;
      const bakedPalettes = (this.data as any)?.resolvedPalettes;
      const bakedDefault = (this.data as any)?.resolvedPaletteDefault;
      const paletteName = cd?.palette as string | undefined;
      const chapterPalette = chIdx >= 0 ? chapters[chIdx]?.palette : undefined;
      console.log('[palette-diag] NO auto_palettes. Fallback chain:', {
        autoPalettes: autoPalettes?.length ?? 0,
        chIdx,
        chapterPalette,
        bakedPalettes: bakedPalettes?.length ?? 0,
        bakedDefault: bakedDefault?.length ?? 0,
        paletteName,
        payloadPalette: this.payload?.palette,
      });
    }

    // Try prebaked per-chapter palette
    const bakedPalettes = (this.data as any)?.resolvedPalettes;
    if (bakedPalettes && Array.isArray(bakedPalettes) && chIdx >= 0 && bakedPalettes[chIdx]) {
      return bakedPalettes[chIdx];
    }

    // Try chapter-level palette override from raw data
    if (chIdx >= 0) {
      const chapterPalette = chapters[chIdx]?.palette as string | undefined;
      if (chapterPalette && LyricDancePlayer.PALETTE_COLORS[chapterPalette]) {
        return LyricDancePlayer.PALETTE_COLORS[chapterPalette];
      }
    }

    // Try prebaked default
    const bakedDefault = (this.data as any)?.resolvedPaletteDefault;
    if (bakedDefault && Array.isArray(bakedDefault) && bakedDefault.length >= 5) {
      return bakedDefault;
    }

    // Try top-level palette name
    const paletteName = cd?.palette as string | undefined;
    if (paletteName && LyricDancePlayer.PALETTE_COLORS[paletteName]) {
      return LyricDancePlayer.PALETTE_COLORS[paletteName];
    }

    // Final fallback
    const existing = this.payload?.palette ?? [];
    return [
      existing[0] ?? '#0A0A0F',
      existing[1] ?? '#FFD700',
      existing[2] ?? '#F0F0F0',
      existing[3] ?? '#FFD700',
      existing[4] ?? '#555555',
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

  private getAtmosphere(): string {
    const cd = this.payload?.cinematic_direction as unknown as Record<string, unknown> | null;
    const chapters = (cd?.chapters as any[]) ?? [];
    const currentTimeSec = this.audio?.currentTime ?? 0;
    const totalDurationSec = this.audio?.duration || 1;
    const chIdx = this.resolveChapterIndex(chapters, currentTimeSec, totalDurationSec);

    // Chapter-level override
    if (chIdx >= 0 && chapters[chIdx]?.atmosphere) {
      return chapters[chIdx].atmosphere;
    }
    // Top-level default
    return (cd?.atmosphere as string) ?? 'cinematic';
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
    try {
      await document.fonts.load(`700 48px "${fontName}"`);
    } catch {
      // Font load failed — fallback is fine
    }
  }

  private hexWithAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
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

  private update(deltaMs: number, timeSec: number): void {
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
    const currentChapter = this.resolveChapter(chapters, clamped - this.songStartSec, duration);

    const tensionCurve = this.resolvedState.tensionCurve;
    const currentTension = tensionCurve.find(
      (ts: any) => songProgress >= (ts.startRatio ?? 0) && songProgress <= (ts.endRatio ?? 1)
    ) ?? tensionCurve[0];
    const lines = this.payload?.lines ?? [];

    const sectionIndex = chapters.length > 0 ? this.resolveSectionIndex(chapters, clamped - this.songStartSec, duration) : -1;
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
    }
    this.activeTension = currentTension;
    this.ambientParticleEngine?.setDensityMultiplier((currentTension?.particleDensity ?? 0.5) * 2);
    this.ambientParticleEngine?.setSpeedMultiplier((currentTension?.motionIntensity ?? 0.5) * 2);

    const visibleLines = lines.filter((l: any) => clamped >= (l.start ?? 0) && clamped < (l.end ?? 0));
    const activeLine = visibleLines.length === 0
      ? null
      : visibleLines.reduce((latest: any, l: any) => ((l.start ?? 0) > (latest.start ?? 0) ? l : latest));
    const climaxRatio = (cd as any)?.climax?.timeRatio ?? 0.75;
    const simulatedBeat = Math.max(0.1, 1 - Math.abs(songProgress - climaxRatio) * 2);
    const frame = this.evaluateFrame(clamped);
    const visibleChunks = frame?.chunks.filter((c: any) => c.visible) ?? [];

    const activeWord = this.getActiveWord(clamped);
    const activeWordClean = normalizeToken(activeWord?.word ?? '');
    const activeWordDirective = activeWordClean ? this.resolvedState.wordDirectivesMap[activeWordClean] ?? null : null;

    const ds = this.debugState;
    ds.time = clamped;
    ds.fps = Math.round(this.fpsAccum.fps);
    ds.songProgress = songProgress;
    ds.perfTotal = deltaMs;
    ds.perfBg = 0;
    ds.perfText = 0;
    ds.beatIntensity = simulatedBeat;
    ds.physGlow = simulatedBeat * 0.6;
    ds.lastBeatForce = simulatedBeat * 0.8;
    ds.physicsActive = this.playing;

    // ── Section boundaries ──
    ds.secIndex = sectionIndex;
    ds.lineIndex = activeLine ? lines.indexOf(activeLine) : -1;
    ds.secTotal = chapters.length;
    const secStartRatio = section?.startRatio ?? 0;
    const secEndRatio = section?.endRatio ?? 1;
    ds.secStartSec = +(secStartRatio * duration).toFixed(2);
    ds.secEndSec = +(secEndRatio * duration).toFixed(2);
    ds.secDuration = +(ds.secEndSec - ds.secStartSec).toFixed(2);
    ds.secElapsed = +((clamped - this.songStartSec) - ds.secStartSec).toFixed(2);
    ds.secProgress = ds.secDuration > 0 ? Math.max(0, Math.min(1, ds.secElapsed / ds.secDuration)) : 0;
    ds.secMood = section?.mood ?? section?.atmosphere ?? '—';
    ds.secTexture = this.activeSectionTexture ?? '—';
    ds.secHasImage = sectionIndex >= 0 && sectionIndex < this.chapterImages.length && !!this.chapterImages[sectionIndex];

    // ── Cinematic direction defaults ──
    const cdAny = cd as any;
    ds.cdSceneTone = cdAny?.sceneTone ?? '—';
    ds.cdAtmosphere = cdAny?.atmosphere ?? '—';
    ds.cdMotion = cdAny?.motion ?? '—';
    ds.cdTypography = cdAny?.typography ?? '—';
    ds.cdTexture = cdAny?.texture ?? '—';
    ds.cdEmotionalArc = cdAny?.emotionalArc ?? '—';
    ds.dirThesis = cd?.thesis ?? '—';

    // ── Chapter ──
    const chapterIdx = chapters.length > 0 ? this.resolveChapterIndex(chapters, clamped - this.songStartSec, duration) : -1;
    ds.dirChapter = chapterIdx >= 0 ? `${chapterIdx + 1}/${chapters.length}` : '—';
    const chapterStartR = currentChapter?.startRatio ?? 0;
    const chapterEndR = currentChapter?.endRatio ?? 1;
    const chapterRange = chapterEndR - chapterStartR;
    ds.dirChapterProgress = chapterRange > 0 ? Math.max(0, Math.min(1, (songProgress - chapterStartR) / chapterRange)) : 0;
    ds.dirIntensity = currentChapter?.emotionalIntensity ?? 0;
    ds.dirBgDirective = currentChapter?.bgDirective ?? currentChapter?.backgroundSystem ?? '—';
    ds.dirLightBehavior = currentChapter?.lightBehavior ?? currentChapter?.atmosphere ?? '—';

    // ── Beat grid phase ──
    const beatGrid = this.data?.beat_grid;
    const beatsArr = beatGrid?.beats ?? [];
    ds.bgBpm = beatGrid?.bpm ?? 0;
    ds.bgBeatsTotal = beatsArr.length;
    ds.bgConfidence = beatGrid?.confidence ?? 0;
    const beatSpine = computeBeatSpine(clamped, beatGrid, { lookAheadSec: 0.02, pulseWidth: 0.09 });
    ds.bgNextBeat = beatSpine.nextBeat;
    ds.bgBeatPhase = beatSpine.beatPhase;
    ds.bgBeatPulse = beatSpine.beatPulse;
    ds.beatIntensity = Math.max(ds.beatIntensity, beatSpine.beatPulse);

    // ── Active word ──
    ds.activeWord = activeWordClean || '—';
    ds.activeWordEntry = activeWordDirective?.entry ?? '—';
    ds.activeWordExit = activeWordDirective?.exit ?? '—';
    ds.activeWordEmphasis = activeWordDirective?.emphasisLevel ?? 0;
    ds.activeWordTrail = activeWordDirective?.trail ?? 'none';

    // ── Word directive (from cinematic direction) ──
    ds.wordDirectiveWord = activeWordClean || '';
    ds.wordDirectiveBehavior = activeWordDirective?.behavior ?? activeWordDirective?.kineticClass ?? '—';
    ds.wordDirectiveEntry = activeWordDirective?.entry ?? '—';
    ds.wordDirectiveExit = activeWordDirective?.exit ?? '—';
    ds.wordDirectiveEmphasis = activeWordDirective?.emphasisLevel ?? 0;
    ds.wordDirectiveGhostTrail = activeWordDirective?.ghostTrail ?? false;
    ds.wordDirectiveGhostDir = activeWordDirective?.ghostDirection ?? '—';

    // ── Line / storyboard ──
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

    // ── Camera & tension ──
    ds.cameraDistance = ds.cdTypography;
    ds.cameraMovement = cdAny?.cameraMovement ?? currentChapter?.cameraMovement ?? '—';
    ds.tensionStage = currentTension?.stage ?? '—';
    ds.tensionMotion = currentTension?.motionIntensity ?? 0;
    ds.tensionParticles = currentTension?.particleDensity ?? 0;
    ds.tensionTypo = currentTension?.typography ?? '—';

    // ── Symbols ──
    const symbols = cdAny?.symbolSystem ?? cdAny?.symbols ?? {};
    ds.symbolPrimary = symbols?.primary ?? '—';
    ds.symbolSecondary = symbols?.secondary ?? '—';
    ds.symbolState = symbols?.state ?? '—';

    // ── Physics / position ──
    const physics = cd?.visualWorld?.physicsProfile;
    ds.heat = physics?.heat ?? 0;
    ds.velocity = 0;
    ds.rotation = 0;
    ds.wordCount = visibleChunks.length;

    // ── Particles ──
    ds.particleSystem = this.activeSectionTexture ?? 'none';
    ds.particleDensity = this.resolvedState.particleConfig.density ?? 0;
    ds.particleSpeed = this.resolvedState.particleConfig.speed ?? 0;

    // ── Background / image ──
    ds.backgroundSystem = cdAny?.backgroundSystem ?? cd?.visualWorld?.backgroundSystem ?? '—';
    ds.imageLoaded = this.chapterImages.length > 0;
    ds.zoom = frame?.cameraZoom ?? 1;
    ds.vignetteIntensity = 0;

    // ── Font / animation stubs ──
    ds.fontScale = this._viewportFontScale ?? 1;
    ds.scale = frame?.cameraZoom ?? 1;
    ds.lineColor = this.getResolvedPalette()?.[2] ?? '#ffffff';
    ds.effectKey = activeLine?.tag ?? '—';
    const firstVisible = visibleChunks[0];
    ds.entryProgress = firstVisible?.entryProgress ?? 0;
    ds.exitProgress = firstVisible?.exitProgress ?? 0;

    const beatIntensity = Math.max(0, Math.min(1, simulatedBeat));
    this.ambientParticleEngine?.update(deltaMs, beatIntensity);
    ds.particleCount = this.ambientParticleEngine?.getActiveCount() ?? 0;
  }

  private draw(tSec: number): void {
    try {
      this._draw(tSec);
    } catch (err) {
      // draw crash — silently continue
      // Don't stop health monitor — let loop continue
    }
  }

  private _draw(tSec: number): void {
    this.currentTSec = tSec;
    this.frameCount++;

    // Stall detection — log when audio time stops advancing
    if (this._lastLoggedTSec === tSec && tSec > 0) {
      this._stalledFrames = (this._stalledFrames ?? 0) + 1;
      if (this._stalledFrames > 10) {
        this._stalledFrames = 0;
      }
    } else {
      this._stalledFrames = 0;
    }
    this._lastLoggedTSec = tSec;

    const frame = this.evaluateFrame(tSec);
    if (!frame) return;



    const songProgress = (tSec - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    try {
      this.updateSims(tSec, frame);
    } catch (e) {
      // sim crash — silently continue
    }

    // Background: static bg cache first, then section images on top
    this.drawBackground(frame);

    // Section image overlay — use baked sectionIndex directly
    const imgIdx = Math.min(frame.sectionIndex ?? 0, Math.max(0, this.chapterImages.length - 1));
    const nextImgIdx = Math.min(imgIdx + 1, Math.max(0, this.chapterImages.length - 1));
    // Simple crossfade: use fractional song progress within the chapter
    const duration = this.audio?.duration || 1;
    const totalChapters = this.chapterImages.length || 1;
    const chapterSpan = duration / totalChapters;
    const chapterLocalProgress = chapterSpan > 0 ? ((this.audio?.currentTime ?? 0) % chapterSpan) / chapterSpan : 0;
    const crossfade = chapterLocalProgress > 0.85 ? (chapterLocalProgress - 0.85) / 0.15 : 0;

    // Image diagnostics — log section transitions
    if (imgIdx !== this._prevImgIdx && this.chapterImages.length > 0) {
      this._prevImgIdx = imgIdx;
    }

    // Update image debug state
    const atmosphere = this.getAtmosphere();
    const atmosphereOpacityMap: Record<string, number> = { void: 0.10, cinematic: 0.65, haze: 0.50, split: 0.75, grain: 0.60, wash: 0.55, glass: 0.45, clean: 0.85 };
    this.debugState.imgCount = this.chapterImages.length;
    this.debugState.imgActiveIdx = imgIdx;
    this.debugState.imgNextIdx = nextImgIdx;
    this.debugState.imgCrossfade = crossfade;
    this.debugState.imgChapterSpan = chapterSpan;
    this.debugState.imgLocalProgress = chapterLocalProgress;
    this.debugState.imgOpacity = atmosphereOpacityMap[atmosphere] ?? 0.65;
    this.debugState.imgOverlap = false;

    this.drawChapterImage(imgIdx, nextImgIdx, crossfade);

    this.drawSimLayer(frame);
    this.drawLightingOverlay(frame, tSec);

    try {
      this.checkEmotionalEvents(tSec, songProgress);
    } catch (e) {
      // emotional events crash — silently continue
    }

    this.drawEmotionalEvents(tSec);

    // Ambient particles — runtime system updates per section
    this.ambientParticleEngine?.draw(this.ctx, "far");

    const safeCameraX = Number.isFinite(frame.cameraX) ? frame.cameraX : 0;
    const safeCameraY = Number.isFinite(frame.cameraY) ? frame.cameraY : 0;
    // Apply camera zoom as a canvas-level transform — NOT per-word font resize.
    // This keeps collision bounds stable across beat pulses.
    const applyZoom = Math.abs(frame.cameraZoom - 1.0) > 0.001;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';

    let drawCalls = 0;
    const palette = this.getBurstPalette(songProgress);
    const sortBuf = this._sortBuffer;
    sortBuf.length = 0;
    for (let i = 0; i < frame.chunks.length; i += 1) sortBuf.push(frame.chunks[i]);
    for (let i = 1; i < sortBuf.length; i += 1) {
      const v = sortBuf[i];
      const vKey = ((v.exitProgress ?? 0) > 0) ? 1 : 0;
      const vFont = `${v.fontWeight ?? 700}|${v.fontSize ?? 36}|${v.fontFamily ?? ''}`;
      let j = i - 1;
      while (j >= 0) {
        const jKey = ((sortBuf[j].exitProgress ?? 0) > 0) ? 1 : 0;
        const jFont = `${sortBuf[j].fontWeight ?? 700}|${sortBuf[j].fontSize ?? 36}|${sortBuf[j].fontFamily ?? ''}`;
        if (jKey > vKey || (jKey === vKey && jFont > vFont)) {
          sortBuf[j + 1] = sortBuf[j];
          j -= 1;
        } else {
          break;
        }
      }
      sortBuf[j + 1] = v;
    }
    const nowSec = performance.now() / 1000;
    this.drawDecompositions(this.ctx, nowSec);

    const isPortraitLocal = this.height > this.width;
    const viewportMinFont = isPortraitLocal
      ? Math.max(30, this.width * 0.085)
      : Math.max(36, this.height * 0.055);
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
    // Compile-time solver in sceneCompiler handles collision avoidance.
    // Runtime solver caused frame-to-frame jitter by re-solving every time
    // a word entered/exited. Now we only wall-clamp to keep words on-screen.
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
      // this.solveConstraints(bounds, wallLeft, wallRight, wallTop, wallBottom);
      this._solvedBounds = bounds.map(b => ({ ...b }));
    }

    this.ctx.save();
    if (applyZoom) {
      const zoomCx = this.width / 2;
      const zoomCy = this.height / 2;
      this.ctx.translate(zoomCx, zoomCy);
      this.ctx.scale(frame.cameraZoom, frame.cameraZoom);
      this.ctx.translate(-zoomCx, -zoomCy);
    }

    for (let ci = 0; ci < sortBuf.length; ci += 1) {
      const chunk = sortBuf[ci];
      if (!chunk.visible) continue;

      const isExiting = (chunk.exitScale !== 1) || (chunk.exitOffsetY !== 0) || ((chunk.entryProgress ?? 0) >= 1 && chunk.alpha < 0.85);
      if (chunk.trail && chunk.trail !== 'none' && isExiting) {
        this.spawnBurstEmitter(
          chunk.id,
          chunk.x,
          chunk.y,
          chunk.trail,
          this.deriveParticleDirection(chunk.entryStyle ?? '', chunk.exitStyle ?? ''),
          palette,
          chunk.emphasisLevel ?? 3,
        );
      }

      const prevExitProgress = this.lastExitProgressByChunk.get(chunk.id) ?? 0;
      const entry = Math.max(0, Math.min(1, chunk.entryProgress ?? 0));
      const exit = Math.max(0, Math.min(1, chunk.exitProgress ?? 0));
      if (entry >= 1.0 && exit === 0) {
        if (!this.chunkActiveSinceMs.has(chunk.id)) this.chunkActiveSinceMs.set(chunk.id, performance.now());
      }
      const activeSince = this.chunkActiveSinceMs.get(chunk.id);
      const visibleMs = activeSince != null ? performance.now() - activeSince : 0;
      if (exit > 0) this.chunkActiveSinceMs.delete(chunk.id);
      const allowDecomp = exit === 0 || visibleMs >= 1000;
      const currentExitProgress = exit;
      this.lastExitProgressByChunk.set(chunk.id, currentExitProgress);
      const wordJustExited = prevExitProgress <= 0 && currentExitProgress > 0;
      let hasActiveDecomp = false;
      for (let di = 0; di < this.activeDecomps.length; di += 1) {
        if (this.activeDecomps[di].id === chunk.id) {
          hasActiveDecomp = true;
          break;
        }
      }
      const wordFadingOut = currentExitProgress === 0 && (chunk.alpha ?? 1) < 0.75 && (chunk.entryProgress ?? 0) >= 1.0 && !hasActiveDecomp && !this.lastExitProgressByChunk.get(`pre_${chunk.id}`);
      if (wordFadingOut) this.lastExitProgressByChunk.set(`pre_${chunk.id}`, 1);
      const shouldSpawnDecomp = wordJustExited || wordFadingOut;
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
      let drawX = centerX - textWidth * 0.5;
      const drawY = centerY;
      const finalDrawY = drawY;

      const baseScale = Number.isFinite(chunk.scale) ? (chunk.scale as number) : ((chunk.entryScale ?? 1) * (chunk.exitScale ?? 1));
      const sxRaw = Number.isFinite(chunk.scaleX) ? (chunk.scaleX as number) : baseScale;
      const syRaw = Number.isFinite(chunk.scaleY) ? (chunk.scaleY as number) : baseScale;
      const sx = Number.isFinite(sxRaw) ? sxRaw : 1;
      const sy = Number.isFinite(syRaw) ? syRaw : 1;

      const isAnchor = chunk.isAnchor ?? false;
      const haloPal = this.getResolvedPalette();
      const chapterColor = haloPal[1];
      this.drawWordHalo(centerX, finalDrawY, safeFontSize, isAnchor, chapterColor, chunk.alpha);

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
      const iconColor = chunk.color ?? chapterColor;
      const now = performance.now() / 1000;
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
      if (DECOMP_ENABLED && shouldSpawnDecomp && allowDecomp && (chunk.emphasisLevel ?? 0) >= 4) {
        const decompDirective = directive ?? { exit: 'dissolve', emphasisLevel: 4 };
        this.tryStartDecomposition({ chunkId: chunk.id, text, drawX: centerX, drawY, fontSize: safeFontSize, fontWeight, fontFamily: chunk.fontFamily, color: this.getTextColor(chunk.color ?? chapterColor), directive: decompDirective });
      }

      if (chunk.iconPosition !== 'replace') {
        this.ctx.globalAlpha = drawAlpha;
        this.ctx.fillStyle = this.getTextColor(chunk.color ?? obj.color);
        const drawFont = `${fontWeight} ${safeFontSize}px ${family}`;
        if (drawFont !== this._lastFont) { this.ctx.font = drawFont; this._lastFont = drawFont; }
        if (chunk.glow > 0) {
          this.ctx.shadowColor = chunk.color ?? '#ffffff';
          this.ctx.shadowBlur = chunk.glow * 32;
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
              drawX + gx,
              finalDrawY + gy,
              chunk.rotation ?? 0,
              chunk.skewX ?? 0,
              sx,
              sy,
            );
            this.ctx.setTransform(ga, gb, gc, gd, ge, gf);
            this.ctx.fillText(chunk.text ?? obj.text, 0, 0);
          }
          this.ctx.globalAlpha = drawAlpha;
        }

        const [ma, mb, mc, md, me, mf] = this.computeTransformMatrix(
          drawX,
          finalDrawY,
          chunk.rotation ?? 0,
          chunk.skewX ?? 0,
          sx,
          sy,
        );
        this.ctx.setTransform(ma, mb, mc, md, me, mf);
        // Tracking expand: draw each letter with increased spacing
        if (chunk.heroTrackingExpand && chunk.visible) {
          const letters = text.split('');
          const baseSpacing = safeFontSize * 0.15;
          const totalExtraWidth = baseSpacing * (letters.length - 1);
          let letterX = -totalExtraWidth / 2;
          for (const letter of letters) {
            this.ctx.fillText(letter, letterX, 0);
            const letterWidth = this.ctx.measureText(letter).width;
            letterX += letterWidth + baseSpacing;
          }
        } else {
          this.ctx.fillText(text, 0, 0);
        }
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

    const nowMs = performance.now();
    const dt = this.lastBurstTickMs > 0 ? Math.max(0.001, Math.min(0.05, (nowMs - this.lastBurstTickMs) / 1000)) : 1 / 60;
    this.lastBurstTickMs = nowMs;
    this.updateBurstEmitters(dt);
    this.renderBurstParticles();

    // Comment comets — after text/bursts, before watermark
    this.drawComments(performance.now() / 1000);

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
    this._crushOverlayCanvas = null;
    this._crushOverlayKey = '';
    this._lightingOverlayCanvas = null;
    this._lightingOverlayKey = '';
    this._haloStamps.clear();
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


  private createEmptyParticle(): DecompParticle {
    return {
      x: 0, y: 0, vx: 0, vy: 0, r: 255, g: 255, b: 255, a: 0, size: 1.5, life: 0,
      rotation: 0, rotSpeed: 0, gravity: 0, drag: 0.96, shape: 'dot', column: 0,
      burnDelay: 0, dissolveDelay: 0, dripDelay: 0, riseDelay: 0, burstDelay: 0,
      glitchOffsetX: 0, glitchOffsetY: 0, targetX: 0, targetY: 0, active: false,
    };
  }

  private getParticle(): DecompParticle {
    const p = this.particlePool[this.poolIndex % this.particlePool.length];
    this.poolIndex += 1;
    return p;
  }

  private resolveDecompEffect(d: any): DecompEffect | null {
    const exit = String(d?.exit ?? '').toLowerCase();
    if (exit === 'shatter' || exit === 'shatters') return 'explode';
    if (exit === 'burn-out' || exit === 'burns-out') return 'burn-away';
    if (exit === 'dissolve' || exit === 'dissolves-upward') return 'dissolve';
    if (exit === 'melt' || exit === 'drip') return 'melt';
    if (exit === 'ascend' || exit === 'drift-up') return 'ascend';
    if (exit === 'fades' || exit === 'lingers') return 'dissolve';
    const meta = String(d?.visualMetaphor ?? '').toLowerCase();
    if (meta.includes('fire') || meta.includes('ember') || meta.includes('burn')) return 'burn-away';
    if (meta.includes('ice') || meta.includes('frost') || meta.includes('shatter')) return 'ice-shatter';
    if (meta.includes('bloom') || meta.includes('flower') || meta.includes('petal')) return 'bloom';
    if (meta.includes('weight') || meta.includes('crush') || meta.includes('heavy')) return 'crush';
    if (meta.includes('scream') || meta.includes('shock') || meta.includes('explod')) return 'shockwave';
    if (meta.includes('rain') || meta.includes('tear') || meta.includes('drip')) return 'melt';
    if (meta.includes('glitch') || meta.includes('static') || meta.includes('broken')) return 'glitch';
    if (meta.includes('gather') || meta.includes('together') || meta.includes('embrace')) return 'magnetize';
    if (meta.includes('rise') || meta.includes('ascend') || meta.includes('fly')) return 'ascend';
    if (d?.behavior === 'pulse') return 'shockwave';
    if (d?.behavior === 'float') return 'dissolve';
    if ((d?.emphasisLevel ?? 0) >= 4) return 'dissolve';
    return null;
  }

  private effectDuration(effect: DecompEffect): number {
    const m: Record<DecompEffect, number> = {
      'explode': 1.2, 'ice-shatter': 1.5, 'burn-away': 1.5, 'dissolve': 0.4, 'melt': 1.5,
      'ascend': 1.8, 'glitch': 0.8, 'bloom': 2.0, 'crush': 0.8, 'shockwave': 1.0, 'magnetize': 1.2,
    };
    return m[effect];
  }

  private tryStartDecomposition(input: { chunkId: string; text: string; drawX: number; drawY: number; fontSize: number; fontWeight: number; fontFamily?: string; color: string; directive: any; }): void {
    const effect = this.resolveDecompEffect(input.directive);
    if (!effect || this.activeDecomps.some((d) => d.id === input.chunkId)) return;
    if (this.activeDecomps.length >= 3) this.activeDecomps.shift();
    const particles = this.captureWordParticles(input, effect);
    const decomp: PixelDecomp = {
      id: input.chunkId, particles, effect, startTime: performance.now() / 1000,
      duration: this.effectDuration(effect), centerX: input.drawX, centerY: input.drawY,
      wordWidth: this.ctx.measureText(input.text).width, fontSize: input.fontSize, word: input.text,
      color: input.color, phase: 0,
    };
    this.activeDecomps.push(decomp);
  }

  private captureWordParticles(input: { text: string; drawX: number; drawY: number; fontSize: number; fontWeight: number; fontFamily?: string; color: string; }, effect: DecompEffect): DecompParticle[] {
    const GRID = 3;
    const padding = 4;
    const family = input.fontFamily ?? this.getResolvedFont();
    this.octx.font = `${input.fontWeight} ${input.fontSize}px ${family}`;
    const wordWidth = Math.ceil(this.octx.measureText(input.text).width);
    this.offscreen.width = Math.max(8, wordWidth + padding * 2);
    this.offscreen.height = Math.max(8, Math.ceil(input.fontSize * 1.4) + padding * 2);
    this.octx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
    this.octx.font = `${input.fontWeight} ${input.fontSize}px ${family}`;
    this.octx.fillStyle = input.color;
    this.octx.textBaseline = 'middle';
    this.octx.textAlign = 'center';
    this.octx.fillText(input.text, this.offscreen.width / 2, this.offscreen.height / 2);
    const pixels = this.octx.getImageData(0, 0, this.offscreen.width, this.offscreen.height).data;
    const out: DecompParticle[] = [];
    const cx = input.drawX;
    const cy = input.drawY;
    const maxParticles = 200;
    for (let y = 0; y < this.offscreen.height && out.length < maxParticles; y += GRID) {
      for (let x = 0; x < this.offscreen.width && out.length < maxParticles; x += GRID) {
        const i = (y * this.offscreen.width + x) * 4;
        const a = pixels[i + 3];
        if (a < 30) continue;
        const p = this.getParticle();
        Object.assign(p, this.createEmptyParticle());
        p.active = true;
        p.x = cx + x - this.offscreen.width / 2;
        p.y = cy + y - this.offscreen.height / 2;
        p.r = pixels[i]; p.g = pixels[i + 1]; p.b = pixels[i + 2]; p.a = a / 255;
        p.size = GRID * 0.6;
        p.life = 1;
        this.seedParticleEffect(p, effect, cx, cy, wordWidth, input.fontSize);
        out.push(p);
      }
    }
    return out;
  }

  private seedParticleEffect(p: DecompParticle, effect: DecompEffect, cx: number, cy: number, wordWidth: number, fontSize: number): void {
    if (effect === 'explode' || effect === 'shockwave') {
      const ang = Math.atan2(p.y - cy, p.x - cx);
      const force = 80 + Math.random() * 120;
      p.vx = Math.cos(ang) * force + (Math.random() - 0.5) * 40;
      p.vy = Math.sin(ang) * force + (Math.random() - 0.5) * 40;
      p.gravity = 60 + Math.random() * 40; p.drag = 0.96; p.shape = 'shard'; p.rotSpeed = (Math.random() - 0.5) * 8;
      p.burstDelay = effect === 'shockwave' ? 0.08 : 0;
    } else if (effect === 'dissolve') {
      p.vx = 0;
      p.vy = 0;
      p.gravity = 0;
      p.drag = 1.0;
      p.dissolveDelay = Math.random() * 0.15;
    }
    else if (effect === 'melt') { const xNorm=(p.x-(cx-wordWidth/2))/Math.max(1,wordWidth); p.dripDelay=Math.random()*0.5+Math.abs(xNorm-0.5)*0.3; p.gravity=120+Math.random()*80; p.drag=0.92; p.shape='streak'; }
    else if (effect === 'ascend') { p.vx=(Math.random()-0.5)*30; p.vy=-40-Math.random()*60; p.gravity=-10; p.drag=0.97; p.riseDelay=(1-((p.y-(cy-fontSize/2))/Math.max(1,fontSize)))*0.3; }
    else if (effect === 'burn-away') { const yNorm=(p.y-(cy-fontSize/2))/Math.max(1,fontSize); p.burnDelay=(1-Math.max(0,Math.min(1,yNorm)))*0.6; p.shape='ember'; }
    else if (effect === 'ice-shatter') { p.shape='shard'; p.column=Math.max(0,Math.min(4,Math.floor((p.x-(cx-wordWidth/2))/Math.max(1,wordWidth/4)))); p.rotSpeed=(Math.random()-0.5)*6; p.r=Math.min(255,p.r+80); p.g=Math.min(255,p.g+100); p.b=255; }
    else if (effect === 'glitch') { p.shape='dot'; }
    else if (effect === 'bloom') { const ang=Math.atan2(p.y-cy,p.x-cx)+(Math.random()-0.5)*0.5; const force=20+Math.random()*30; p.vx=Math.cos(ang)*force; p.vy=Math.sin(ang)*force; p.gravity=15; p.drag=0.96; p.r=Math.min(255,p.r+40); p.g=Math.max(0,p.g-20); }
    else if (effect === 'crush') { p.drag=0.95; p.targetX=cx; p.targetY=cy+20; }
    else if (effect === 'magnetize') { p.x+=(Math.random()-0.5)*30; p.y+=(Math.random()-0.5)*30; p.targetX=cx; p.targetY=cy; p.drag=0.92; }
  }

  private drawDecompositions(ctx: CanvasRenderingContext2D, time: number): void {
    const dt = 1 / 60;
    for (const d of this.activeDecomps) {
      const elapsed = time - d.startTime;
      if (elapsed > d.duration) continue;
      for (const p of d.particles) {
        if (!p.active || p.life <= 0 || p.a <= 0) continue;
        this.updateDecompParticle(d, p, elapsed, dt);
        const alpha = p.a * p.life;
        if (alpha < 0.01) continue;
        if (p.shape === 'shard') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`; ctx.fillRect(-p.size*0.4,-p.size,p.size*0.8,p.size*2); ctx.restore(); }
        else if (p.shape === 'streak') { const len=Math.min(Math.abs(p.vy)*0.03,8); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x,p.y-len); ctx.lineWidth=p.size*0.6; ctx.lineCap='round'; ctx.strokeStyle=`rgba(${p.r},${p.g},${p.b},${alpha})`; ctx.stroke(); }
        else if (p.shape === 'ember') { ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+p.vx*0.015,p.y+p.vy*0.015); ctx.lineWidth=p.size*0.4; ctx.strokeStyle=`rgba(${p.r},${p.g},${p.b},${alpha})`; ctx.stroke(); }
        else { ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`; ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size); }
      }
      if (d.effect === 'shockwave') {
        const ringRadius = elapsed * 150;
        const ringAlpha = Math.max(0, 0.3 * (1 - elapsed / 0.5));
        ctx.beginPath(); ctx.arc(d.centerX, d.centerY, ringRadius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.2, 2 * (1 - elapsed / 0.5));
        ctx.strokeStyle = `rgba(255,255,255,${ringAlpha})`; ctx.stroke();
      }
    }
    this.activeDecomps = this.activeDecomps.filter((d) => (time - d.startTime) < d.duration);
  }

  private updateDecompParticle(d: PixelDecomp, p: DecompParticle, elapsed: number, dt: number): void {
    if (d.effect === 'glitch' && elapsed < 0.3) {
      p.glitchOffsetX = (Math.random() - 0.5) * 40; p.glitchOffsetY = (Math.random() - 0.5) * 20;
      p.x += p.glitchOffsetX * 0.1; p.y += p.glitchOffsetY * 0.1; p.life -= dt * 0.25; return;
    }
    if (d.effect === 'shockwave' && elapsed < p.burstDelay) return;
    if (d.effect === 'dissolve' && elapsed < p.dissolveDelay) return;
    if (d.effect === 'melt' && elapsed < p.dripDelay) return;
    if (d.effect === 'ascend' && elapsed < p.riseDelay) return;
    if (d.effect === 'burn-away' && elapsed < p.burnDelay) return;
    if (d.effect === 'ice-shatter' && elapsed < (0.5 + p.column * 0.08)) return;

    if (d.effect === 'burn-away') {
      const burnAge = elapsed - p.burnDelay;
      if (burnAge < 0.3) { p.r = 255; p.g = Math.max(0, 200 - burnAge * 600); p.b = 0; }
      else { p.r = Math.max(0, 200 - (burnAge - 0.3) * 400); p.g = 0; p.b = 0; }
      p.vy = -20 - Math.random() * 30; p.vx = (Math.random() - 0.5) * 15; p.size *= 0.996;
    }
    if (d.effect === 'crush') {
      const dx = p.targetX - p.x; const dy = p.targetY - p.y; const dist = Math.max(5, Math.hypot(dx, dy));
      const force = 200 / dist; p.vx += (dx / dist) * force * dt; p.vy += (dy / dist) * force * dt; p.size *= 0.98;
    }
    if (d.effect === 'magnetize') {
      p.vx += (p.targetX - p.x) * 3 * dt; p.vy += (p.targetY - p.y) * 3 * dt;
      if (elapsed > 0.8) p.life -= dt * 4;
    }
    if (d.effect === 'glitch' && elapsed >= 0.3) {
      p.vx = (Math.random() - 0.5) * 200; p.vy = (Math.random() - 0.5) * 200; p.life -= dt * 2;
    } else {
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;
      const duration = d.effect === 'dissolve' ? 0.4 : d.duration;
      p.life -= dt * (1 / Math.max(0.2, duration));
    }
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
  }

  private _buildChunkCacheFromScene(scene: CompiledScene): void {
    this.chunks.clear();
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 1;
    measureCanvas.height = 1;
    const measureCtx = measureCanvas.getContext('2d')!;

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

    // fontScale must stay proportional to position scale.
    // Allow slight boost for readability on small screens,
    // but never more than 1.4× the base scale.
    let fontScale: number;
    if (isPortrait) {
      // Portrait (phone): base scale is tiny (0.4). Allow up to 1.4× for readability.
      fontScale = Math.max(baseScale, Math.min(this.width / 540, baseScale * 1.4));
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

  private mapParticleSystem(desc: string): string | null {
    const lower = (desc || '').toLowerCase();
    if (lower.includes('smoke') || lower.includes('swirl') || lower.includes('churn')) return 'dust';
    if (lower.includes('spark') || lower.includes('ember') || lower.includes('fire')) return 'embers';
    if (lower.includes('mist') || lower.includes('dissipat') || lower.includes('fog')) return 'snow';
    if (lower.includes('rain') || lower.includes('drip') || lower.includes('drop')) return 'rain';
    if (lower.includes('star') || lower.includes('shimmer') || lower.includes('glint')) return 'stars';
    return null;
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

    // Generate Ken Burns parameters per chapter
    this._kenBurnsParams = this.chapterImages.map((_, i) => {
      const seed = (i * 2654435761) >>> 0;
      const s = (v: number) => ((seed * v) & 0xFFFF) / 0xFFFF;

      const zoomIn = i % 2 === 0;
      const zoomStart = zoomIn ? 1.0 : 1.05;
      const zoomEnd = zoomIn ? 1.05 : 1.0;

      const panRange = 0.02;
      return {
        zoomStart,
        zoomEnd,
        panStartX: (s(17) - 0.5) * panRange,
        panStartY: (s(31) - 0.5) * panRange,
        panEndX: (s(53) - 0.5) * panRange,
        panEndY: (s(71) - 0.5) * panRange,
      };
    });
  }

  private drawChapterImage(chapterIdx: number, nextChapterIdx: number, blend: number): void {
    if (this.chapterImages.length === 0) return;

    const current = this.chapterImages[chapterIdx];
    const next = this.chapterImages[nextChapterIdx];
    const duration = this.audio?.duration || 1;
    const chapterProgress = this.audio ? this.audio.currentTime / duration : 0;

    const sceneCtx = this.data.scene_context;
    const atmosphere = this.getAtmosphere();
    const atmosphereOpacity: Record<string, number> = {
      void: 0.10,
      cinematic: 0.65,
      haze: 0.50,
      split: 0.75,
      grain: 0.60,
      wash: 0.55,
      glass: 0.45,
      clean: 0.85,
    };
    const targetImageOpacity = atmosphereOpacity[atmosphere] ?? 0.65;

    // Depth-of-field: verse = blurred, chorus = sharp
    const chapters = this.resolvedState.chapters ?? [];
    const currentChapterObj = this.resolveChapter(chapters, this.audio.currentTime, this.audio.duration || 1);
    const intensity = currentChapterObj?.emotionalIntensity ?? 0.5;
    const targetBlurPx = Math.max(0, (1 - intensity) * 5);
    this._bgBlurCurrent += (targetBlurPx - this._bgBlurCurrent) * 0.05;
    const blurPx = Math.round(this._bgBlurCurrent * 10) / 10;
    const needsBlur = blurPx > 0.2;

    if (needsBlur) {
      this.ctx.save();
      this.ctx.filter = `blur(${blurPx}px)`;
    }

    if (current?.complete && current.naturalWidth > 0) {
      this.ctx.globalAlpha = targetImageOpacity;

      // Ken Burns: slow zoom + pan over chapter duration + beat pulse response
      const kb = this._kenBurnsParams[chapterIdx];
      const chapterCount = this.chapterImages.length || 1;
      const audioDur = this.audio?.duration || 1;
      const chapterDur = audioDur / chapterCount;
      const chapterStart = chapterIdx * chapterDur;
      const localT = Math.max(0, Math.min(1, ((this.audio?.currentTime ?? 0) - chapterStart) / chapterDur));
      const eased = localT * localT * (3 - 2 * localT);
      const beatScale = 1.0 + Math.max(0, this._springOffset) * 0.008;

      if (kb) {
        const zoom = (kb.zoomStart + (kb.zoomEnd - kb.zoomStart) * eased) * beatScale;
        const panX = (kb.panStartX + (kb.panEndX - kb.panStartX) * eased) * this.width;
        const panY = (kb.panStartY + (kb.panEndY - kb.panStartY) * eased) * this.height;

        this.ctx.save();
        this.ctx.translate(this.width / 2 + panX, this.height / 2 + panY);
        this.ctx.scale(zoom, zoom);
        this.ctx.translate(-this.width / 2, -this.height / 2);
        this.ctx.drawImage(current, 0, 0, this.width, this.height);
        this.ctx.restore();
      } else {
        this.ctx.drawImage(current, 0, 0, this.width, this.height);
      }

      this.ctx.globalAlpha = 1;
    }

    if (next?.complete && next.naturalWidth > 0 && blend > 0) {
      this.ctx.globalAlpha = blend * targetImageOpacity;

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
        this.ctx.drawImage(next, 0, 0, this.width, this.height);
        this.ctx.restore();
      } else {
        this.ctx.drawImage(next, 0, 0, this.width, this.height);
      }

      this.ctx.globalAlpha = 1;
    }

    if (needsBlur) {
      this.ctx.restore();
    }

    // Dark crush overlay — cached per chapter+atmosphere
    const atmosphereCrush: Record<string, number> = {
      void: 0.80,
      cinematic: 0.35,
      haze: 0.25,
      split: 0.20,
      grain: 0.30,
      wash: 0.30,
      glass: 0.35,
      clean: 0.12,
    };
    const crushTarget = atmosphereCrush[atmosphere] ?? 0.35;
    const sceneCrushOpacity = sceneCtx?.crushOpacity ?? crushTarget;
    const baseCrushAlpha = Math.max(0.10, sceneCrushOpacity - intensity * 0.1);
    const currentLum = this.getAverageLuminance(current);
    const nextLum = blend > 0 ? this.getAverageLuminance(next) : null;
    const blendLum = currentLum != null && nextLum != null
      ? currentLum * (1 - blend) + nextLum * blend
      : currentLum ?? nextLum;
    const luminanceCrushAlpha = blendLum != null && blendLum > 0.72 ? baseCrushAlpha + 0.06 : baseCrushAlpha;
    const crushAlpha = Math.max(0.10, luminanceCrushAlpha);
    const isLight = sceneCtx?.baseLuminance === 'light';

    const crushKey = `${this.width}-${this.height}-${isLight ? 1 : 0}-${Math.round(crushAlpha * 100)}`;
    if (this._crushOverlayKey !== crushKey || !this._crushOverlayCanvas) {
      const off = document.createElement('canvas');
      off.width = this.width;
      off.height = this.height;
      const octx = off.getContext('2d')!;
      const crushColor = isLight
        ? `rgba(255,255,255,${crushAlpha * 0.4})`
        : `rgba(0,0,0,${crushAlpha})`;
      const crushColorMid = isLight
        ? `rgba(255,255,255,${Math.max(0.20, crushAlpha * 0.4 - 0.06)})`
        : `rgba(0,0,0,${Math.max(0.10, crushAlpha - 0.06)})`;
      const crush = octx.createLinearGradient(0, 0, 0, this.height);
      crush.addColorStop(0, crushColor);
      crush.addColorStop(0.5, crushColorMid);
      crush.addColorStop(1, crushColor);
      octx.fillStyle = crush;
      octx.fillRect(0, 0, this.width, this.height);
      this._crushOverlayCanvas = off;
      this._crushOverlayKey = crushKey;
    }
    this.ctx.drawImage(this._crushOverlayCanvas, 0, 0);
  }

  private getAverageLuminance(img: HTMLImageElement | undefined): number | null {
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
    const cached = this.chapterImageLuminance.get(img);
    if (cached != null) return cached;

    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 16;
      sampleCanvas.height = 16;
      const sampleCtx = sampleCanvas.getContext('2d');
      if (!sampleCtx) return null;
      sampleCtx.drawImage(img, 0, 0, 16, 16);
      const { data } = sampleCtx.getImageData(0, 0, 16, 16);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      const luminance = sum / (data.length / 4);
      this.chapterImageLuminance.set(img, luminance);
      return luminance;
    } catch {
      return null;
    }
  }

  private buildBgCache(): void {
    
    try {
      const chapters = this.resolvedState.chapters ?? [];
      const count = Math.max(1, chapters.length);
      this.bgCaches = [];
      this.chapterParticleSystems = [];
      this._haloStamps.clear();

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
      
    }
  }

  private drawRadialGlow(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    const glow = ctx.createRadialGradient(width / 2, height / 2, height * 0.08, width / 2, height / 2, height * 0.7);
    glow.addColorStop(0, palette[1] || 'rgba(255,255,255,0.2)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private darken(hex: string, factor: number): string {
    const clean = hex.replace('#', '');
    const padded = clean.length >= 6 ? clean : clean.padEnd(6, '0');
    const r = Math.round(parseInt(padded.slice(0, 2), 16) * factor);
    const g = Math.round(parseInt(padded.slice(2, 4), 16) * factor);
    const b = Math.round(parseInt(padded.slice(4, 6), 16) * factor);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
  }

  private drawStormAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, dominant: string, accent: string, intensity: number): void {
    for (let i = 0; i < 6; i++) {
      const x = (i * 0.618033 % 1) * w;
      const y = (i * 0.381966 % 1) * h * 0.7;
      const r = w * (0.2 + intensity * 0.15);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `${dominant}10`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    if (intensity > 0.6) {
      const lightGrad = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, h * 0.3);
      lightGrad.addColorStop(0, `${accent}0c`);
      lightGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  private drawCosmicAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, dominant: string, accent: string, intensity: number): void {
    for (let i = 0; i < 80; i++) {
      const x = (i * 0.618033 % 1) * w;
      const y = (i * 0.381966 % 1) * h;
      const size = 0.5 + (i % 3) * 0.5;
      const alpha = 0.3 + (i % 4) * 0.15;
      ctx.globalAlpha = alpha * intensity;
      ctx.fillStyle = i % 7 === 0 ? accent : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const nebula = ctx.createRadialGradient(w * 0.6, h * 0.3, 0, w * 0.6, h * 0.3, w * 0.4);
    nebula.addColorStop(0, `${accent}09`);
    nebula.addColorStop(1, 'transparent');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawIntimateAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, dominant: string, accent: string, intensity: number): void {
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
    glow.addColorStop(0, `${accent}0a`);
    glow.addColorStop(0.5, `${dominant}04`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const y = h * (0.3 + i * 0.2);
      const band = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      band.addColorStop(0, 'transparent');
      band.addColorStop(0.5, `${accent}04`);
      band.addColorStop(1, 'transparent');
      ctx.fillStyle = band;
      ctx.fillRect(0, y - 40, w, 80);
    }
    ctx.globalAlpha = 1;
  }

  private drawGoldenAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, dominant: string, accent: string, intensity: number): void {
    const beamCount = Math.floor(2 + intensity * 3);
    for (let i = 0; i < beamCount; i++) {
      const x = w * (0.2 + (i / beamCount) * 0.6);
      const beam = ctx.createLinearGradient(x, 0, x + w * 0.05, h);
      beam.addColorStop(0, `${accent}12`);
      beam.addColorStop(0.4, `${accent}08`);
      beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      ctx.fillRect(x - w * 0.05, 0, w * 0.15, h);
    }
    const bloom = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.35);
    bloom.addColorStop(0, `${accent}10`);
    bloom.addColorStop(1, 'transparent');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number): void {
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.55 + intensity * 0.2})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
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
      this.chapterSims = chapters.map((chapter: any, ci: number) => {
        const dominant = chapter?.dominantColor ?? palette[ci % palette.length] ?? '#111111';
        const bgDesc = (chapter?.backgroundDirective ?? chapter?.background ?? '').toLowerCase();
        const perSystem = this.mapBackgroundSystem(`${bgDesc} ${bgSystem}`);
        const sim: { fire?: FireSim; water?: WaterSim; aurora?: AuroraSim; rain?: RainSim } = {};
        if (perSystem === 'fire') sim.fire = new FireSim('fire', 0.08 + (chapter?.emotionalIntensity ?? 0.5) * 0.1);
        else if (perSystem === 'storm') sim.fire = new FireSim('smoke', 0.18);
        else if (perSystem === 'ocean') sim.water = new WaterSim(dominant, accentColor);
        else if (perSystem === 'aurora') sim.aurora = new AuroraSim(dominant, accentColor);
        else if (perSystem === 'urban') sim.rain = new RainSim(accentColor);
        else if (perSystem === 'intimate') sim.fire = new FireSim('ember', 0.25);
        return sim;
      });
      
    } catch (err) {
      
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
      const songProgress = (tSec - this.songStartSec) / Math.max(1, this.songEndSec - this.songStartSec);
      const isClimaxZone = songProgress >= 0.75 && songProgress <= 0.85;
      const climaxCurve = isClimaxZone
        ? Math.sin(((songProgress - 0.75) / 0.1) * Math.PI)
        : 0;
      const ambientFraction = 0.15;
      const climaxBoost = climaxCurve * 0.85;
      const ambientSimScale = ambientFraction + climaxBoost;
      const chapterIdxRaw = this.resolveChapterIndex(chapters, this.audio.currentTime, this.audio.duration || 1);
      const chapterIdx = chapterIdxRaw >= 0 ? Math.min(chapterIdxRaw, chapters.length - 1) : chapters.length - 1;
      const ci = Math.max(0, chapterIdx);

      if (ci !== this._lastSimChapterIdx) {
        this._lastSimChapterIdx = ci;
      }

      const chapter = chapters[ci] ?? {};
      const intensity = ((chapter as any)?.emotionalIntensity ?? 0.5) * ambientSimScale;
      const pulse = (frame as any).beatPulse ?? (frame.beatIndex ? (frame.beatIndex % 2 ? 0.2 : 0.7) : 0);
      const sim = this.chapterSims[ci];
      this.currentSimCanvases = [];
      if (!sim) return;
      if (sim.fire) { sim.fire.update(intensity, pulse); this.currentSimCanvases.push(sim.fire.canvas); }
      if (sim.water) { sim.water.update(tSec, pulse, intensity); this.currentSimCanvases.push(sim.water.canvas); }
      if (sim.aurora) { sim.aurora.update(tSec, intensity); this.currentSimCanvases.push(sim.aurora.canvas); }
      if (sim.rain) { sim.rain.update(tSec, intensity, pulse); this.currentSimCanvases.push(sim.rain.canvas); }
    } catch (err) {
      // sim crash — silently continue
    }
  }

  private drawSimLayer(_frame: ScaledKeyframe): void {
    const songDuration = Math.max(1, this.songEndSec - this.songStartSec);
    const songProgress = Math.max(0, Math.min(1, (this.currentTSec - this.songStartSec) / songDuration));
    const isClimaxZone = songProgress >= 0.75 && songProgress <= 0.85;
    const climaxCurve = isClimaxZone
      ? Math.sin(((songProgress - 0.75) / 0.1) * Math.PI)
      : 0;
    const ambientFraction = 0.15;
    const climaxBoost = climaxCurve * 0.85;
    const simOpacity = ambientFraction + climaxBoost;
    for (const simCanvas of this.currentSimCanvases) {
      this.ctx.globalAlpha = 0.38 * simOpacity;
      this.ctx.drawImage(simCanvas, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }
  }

  private getBurstPalette(songProgress: number): { accent: string; glow: string; particle: string } {
    const palette = this.getResolvedPalette();
    return {
      accent: palette[1] ?? '#FFD700',
      glow: palette[3] ?? '#ffffff',
      particle: palette[2] ?? '#ffffff',
    };
  }

  private deriveParticleDirection(entryStyle: string, exitStyle: string): 'up' | 'down' | 'left' | 'right' | 'radial' {
    switch (exitStyle) {
      case 'drift-up':
      case 'cascade-up':
      case 'evaporate':
        return 'up';
      case 'sink':
      case 'cascade-down':
        return 'down';
      case 'shatter':
      case 'scatter-letters':
      case 'burn-out':
      case 'snap-out':
        return 'radial';
      case 'peel-off':
        return 'right';
      case 'peel-reverse':
        return 'left';
    }
    switch (entryStyle) {
      case 'rise':
      case 'bloom':
        return 'up';
      case 'slam-down':
      case 'drop':
      case 'stomp':
      case 'plant':
      case 'tumble-in':
        return 'down';
      case 'explode-in':
      case 'spin-in':
        return 'radial';
      case 'punch-in':
        return 'right';
      case 'drift-in':
      case 'whisper':
        return 'left';
      default:
        return 'radial';
    }
  }

  private spawnBurstEmitter(
    chunkId: string,
    wordX: number,
    wordY: number,
    trailType: string,
    direction: 'up' | 'down' | 'left' | 'right' | 'radial',
    palette: { accent: string; glow: string; particle: string },
    emphasisLevel: number,
  ): void {
    if (this.burstEmitters.some((emitter) => emitter.id === chunkId)) return;
    const countScale = 0.5 + emphasisLevel * 0.15;
    this.burstEmitters.push({
      id: chunkId,
      x: wordX,
      y: wordY,
      startTime: performance.now(),
      emitDuration: 300 + emphasisLevel * 50,
      totalDuration: 1500 + emphasisLevel * 200,
      particles: [],
      trailType,
      direction,
      spawnRate: Math.round(80 * countScale),
      maxParticles: Math.round(50 * countScale),
      palette,
    });
  }

  private spawnBurstParticle(emitter: BurstEmitter): BurstParticle | null {
    const baseSpeed = 40 + Math.random() * 60;
    const spread = Math.random() * Math.PI * 2;
    let vx = 0;
    let vy = 0;
    switch (emitter.direction) {
      case 'up':
        vx = Math.sin(spread) * baseSpeed * 0.3;
        vy = -(baseSpeed * 0.7 + Math.random() * baseSpeed * 0.5);
        break;
      case 'down':
        vx = Math.sin(spread) * baseSpeed * 0.3;
        vy = baseSpeed * 0.7 + Math.random() * baseSpeed * 0.5;
        break;
      case 'left':
        vx = -(baseSpeed * 0.8 + Math.random() * baseSpeed * 0.3);
        vy = Math.sin(spread) * baseSpeed * 0.3;
        break;
      case 'right':
        vx = baseSpeed * 0.8 + Math.random() * baseSpeed * 0.3;
        vy = Math.sin(spread) * baseSpeed * 0.3;
        break;
      default:
        vx = Math.cos(spread) * baseSpeed;
        vy = Math.sin(spread) * baseSpeed;
        break;
    }
    let size = 3;
    let maxLife = 1.5;
    let color = emitter.palette.particle;
    switch (emitter.trailType) {
      case 'ember': size = 2 + Math.random() * 4; maxLife = 1 + Math.random() * 0.8; color = emitter.palette.glow; vy -= 20; break;
      case 'frost': size = 3 + Math.random() * 5; maxLife = 1.5 + Math.random() * 1; vx *= 0.5; vy *= 0.5; break;
      case 'spark-burst': size = 1.5 + Math.random() * 2; maxLife = 0.5 + Math.random() * 0.5; vx *= 2; vy *= 2; color = emitter.palette.accent; break;
      case 'dust-impact': size = 2 + Math.random() * 3; maxLife = 1.2 + Math.random() * 0.6; vy += 15; break;
      case 'light-rays': size = 1 + Math.random() * 2; maxLife = 0.8 + Math.random() * 0.4; color = emitter.palette.glow; break;
      case 'gold-coins': size = 4 + Math.random() * 3; maxLife = 1.5 + Math.random() * 0.5; vy += 30; color = '#FFD700'; break;
      case 'dark-absorb': { size = 3 + Math.random() * 4; maxLife = 1 + Math.random() * 0.5; vx *= -0.6; vy *= -0.6; const darkPal = this.getResolvedPalette(); color = darkPal[0]; break; }
      case 'motion-trail': size = 2 + Math.random() * 2; maxLife = 0.6 + Math.random() * 0.4; vx *= 0.3; vy *= 0.3; break;
      case 'memory-orbs': size = 5 + Math.random() * 4; maxLife = 2 + Math.random() * 0.5; vx *= 0.2; vy *= 0.2; color = emitter.palette.glow; break;
      default: return null;
    }
    return {
      x: emitter.x + (Math.random() - 0.5) * 20,
      y: emitter.y + (Math.random() - 0.5) * 10,
      vx,
      vy,
      life: 1,
      maxLife,
      size,
      alpha: 0.7 + Math.random() * 0.3,
      color,
      type: emitter.trailType,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 2,
    };
  }

  private updateBurstEmitters(dt: number): void {
    const now = performance.now();
    for (let i = this.burstEmitters.length - 1; i >= 0; i -= 1) {
      const emitter = this.burstEmitters[i];
      const elapsed = now - emitter.startTime;
      if (elapsed > emitter.totalDuration) {
        this.burstEmitters.splice(i, 1);
        continue;
      }
      if (elapsed < emitter.emitDuration && emitter.particles.length < emitter.maxParticles) {
        const spawnCount = Math.ceil(emitter.spawnRate * dt);
        for (let s = 0; s < spawnCount && emitter.particles.length < emitter.maxParticles; s += 1) {
          const p = this.spawnBurstParticle(emitter);
          if (p) emitter.particles.push(p);
        }
      }
      for (let j = emitter.particles.length - 1; j >= 0; j -= 1) {
        const p = emitter.particles[j];
        p.life -= dt / p.maxLife;
        if (p.life <= 0) {
          emitter.particles.splice(j, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotationSpeed * dt;
        switch (p.type) {
          case 'ember': p.vy -= 15 * dt; break;
          case 'frost': p.vy += 5 * dt; break;
          case 'dust-impact': p.vy += 25 * dt; break;
          case 'gold-coins': p.vy += 40 * dt; break;
          default: p.vy += 8 * dt; break;
        }
        p.vx *= (1 - 0.5 * dt);
        p.vy *= (1 - 0.3 * dt);
      }
    }
  }

  private renderBurstParticles(): void {
    for (const emitter of this.burstEmitters) {
      for (const p of emitter.particles) {
        const fadeAlpha = p.life * p.alpha;
        if (fadeAlpha < 0.01) continue;
        this.ctx.save();
        this.ctx.globalAlpha = fadeAlpha;
        this.ctx.translate(p.x, p.y);
        switch (p.type) {
          case 'ember': {
            const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
            gradient.addColorStop(0, p.color);
            gradient.addColorStop(0.6, p.color);
            gradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
            break;
          }
          case 'frost': {
            this.ctx.rotate(p.rotation);
            this.ctx.strokeStyle = p.color;
            this.ctx.lineWidth = 1;
            this.ctx.globalAlpha = fadeAlpha * 0.8;
            for (let a = 0; a < 6; a += 1) {
              const angle = (a / 6) * Math.PI * 2;
              this.ctx.beginPath();
              this.ctx.moveTo(0, 0);
              this.ctx.lineTo(Math.cos(angle) * p.size, Math.sin(angle) * p.size);
              this.ctx.stroke();
            }
            break;
          }
          case 'spark-burst':
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
            break;
          case 'dark-absorb':
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = fadeAlpha * 0.5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            break;
          case 'memory-orbs': {
            const orbGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
            orbGrad.addColorStop(0, p.color);
            orbGrad.addColorStop(0.4, `${p.color}80`);
            orbGrad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = orbGrad;
            this.ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
            break;
          }
          default:
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            break;
        }
        this.ctx.restore();
      }
    }
  }

  private _evalFrameLogged = false;
  private evaluateFrame(tSec: number): ScaledKeyframe | null {
    if (!this._evalFrameLogged) {
      this._evalFrameLogged = true;
      console.log("%c[LyricDancePlayer] NEW CODE ACTIVE — writeIdx filter, SPACE_MULT=1.15, single-line mode", "color:#0f0;font-size:16px;font-weight:bold;background:#111;padding:4px 8px;border-radius:4px");
    }
    const scene = this.compiledScene;
    if (!scene) return null;

    const songDuration = Math.max(0.01, scene.durationSec);
    const songProgress = Math.max(0, Math.min(1, (tSec - scene.songStartSec) / songDuration));
    const { _viewportSx: sx, _viewportSy: sy, _viewportFontScale: fontScale } = this;

    const beats = scene.beatEvents;
    while (this._beatCursor + 1 < beats.length && beats[this._beatCursor + 1].time <= tSec) this._beatCursor++;
    while (this._beatCursor > 0 && beats[this._beatCursor].time > tSec) this._beatCursor--;
    const beatIndex = beats.length > 0 ? this._beatCursor : -1;
    const beatSpine = computeBeatSpine(tSec, this.data.beat_grid, { lookAheadSec: 0.02, pulseWidth: 0.08 });

    if (beatIndex !== this._lastBeatIndex && beatIndex >= 0) {
      this._lastBeatIndex = beatIndex;
      this._glowBudget = 13;
      this._springVelocity = beats[beatIndex]?.springVelocity ?? 0;
    }
    if (this._glowBudget > 0) this._glowBudget -= 1;
    const glow = Math.pow(this._glowBudget / 13, 0.6);

    this._springOffset += this._springVelocity;
    this._springVelocity *= 0.82;
    this._springOffset *= 0.88;

    let currentChapterIdx = 0;
    for (let i = 0; i < scene.chapters.length; i++) {
      if (songProgress >= scene.chapters[i].startRatio && songProgress < scene.chapters[i].endRatio) {
        currentChapterIdx = i;
        break;
      }
    }
    const chapter = scene.chapters[currentChapterIdx] ?? scene.chapters[0];
    const targetZoom = chapter?.targetZoom ?? 1.0;
    this._currentZoom += (targetZoom - this._currentZoom) * 0.06;
    const effectiveZoom = this._currentZoom * (1.0 + Math.max(0, this._springOffset));

    const arcFn = this._getArcFunction(scene.emotionalArc);
    const intensity = Math.max(0, Math.min(1, arcFn(songProgress)));
    const intensityGlowMult = 0.5 + intensity * 1.0;
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

    const prevLineIndex = primaryLineIndex > 0 ? primaryLineIndex - 1 : -1;
    const nextLineIndex = primaryLineIndex + 1 < _roleLines.length ? primaryLineIndex + 1 : -1;

    // Second pass: ensure ALL groups on the CURRENT line are included
    // This prevents partial line display (e.g., "oh" appearing without "I've been here before")
    // Also filter OUT any lingering groups from other lines
    if (primaryLineIndex >= 0) {
      // Remove groups not on current line
      let writeIdx = 0;
      for (let ri = 0; ri < activeGroups.length; ri++) {
        if (groups[activeGroups[ri]].lineIndex === primaryLineIndex) {
          activeGroups[writeIdx++] = activeGroups[ri];
        }
      }
      activeGroups.length = writeIdx;

      // Add any missing groups from current line
      for (let gi = 0; gi < groups.length; gi++) {
        if (groups[gi].lineIndex === primaryLineIndex && !activeGroups.includes(gi)) {
          activeGroups.push(gi);
        }
      }
    }
    // Re-sort so groups render in temporal order
    activeGroups.sort((a: number, b: number) => groups[a].start - groups[b].start);

    // DIAGNOSTIC: log active groups every 2 seconds
    if (!(this as any)._lastDiagTime || tSec - (this as any)._lastDiagTime > 2) {
      (this as any)._lastDiagTime = tSec;
      const groupInfo = activeGroups.map(gi => {
        const g = groups[gi];
        const words = g.words.map(w => w.text).join(' ');
        return `L${g.lineIndex}:"${words}"`;
      }).join(' | ');
      console.log(`[diag] t=${tSec.toFixed(1)} primary=${primaryLineIndex} groups(${activeGroups.length}): ${groupInfo}`);
    }

    // Smooth line transitions (250ms ease-out)
    if (primaryLineIndex !== this._prevPrimaryLineIndex) {
      this._lineTransitionStartSec = tSec;
      this._prevPrimaryLineIndex = primaryLineIndex;
    }
    const _lineTransElapsed = Math.min(1, (tSec - this._lineTransitionStartSec) / 0.25);
    const lineTransEase = _lineTransElapsed * (2 - _lineTransElapsed); // ease-out quad

    const chunks = this._evalChunkPool;
    let ci = 0;
    const bpm = scene.bpm;

    for (let ai = 0; ai < activeGroups.length; ai++) {
      const groupIdx = activeGroups[ai];
      const group = groups[groupIdx];
      const resolvedLine = this.resolvedState.lineSettings[group.lineIndex];
      const nextGroupStart = (groupIdx + 1 < groups.length) ? groups[groupIdx + 1].start : Infinity;
      const groupEnd = Math.min(group.end + group.lingerDuration, nextGroupStart);

      const lineRole = group.lineIndex === primaryLineIndex ? 'current'
        : group.lineIndex === prevLineIndex ? 'previous'
        : group.lineIndex === nextLineIndex ? 'next'
        : 'offscreen';

      // Check if any hero word in this group is active and requesting sibling dimming
      let groupHeroDimming = false;
      let groupHeroIsolation = false;
      let groupHeroWaveProximity = 0;
      if (lineRole === 'current') {
        for (let hwi = 0; hwi < group.words.length; hwi++) {
          const hw = group.words[hwi];
          if (hw.isHeroWord && (hw as any).heroPresentation) {
            const hwStart = group.start + (hw === group.words[group.anchorWordIdx] ? 0 : Math.abs(hwi - group.anchorWordIdx) * group.staggerDelay);
            if (tSec >= hwStart) {
              const pres = (hw as any).heroPresentation as string;
              if (pres === 'isolation') groupHeroIsolation = true;
              if (['inline-scale', 'delayed-reveal', 'vertical-lift', 'vertical-drop', 'tracking-expand', 'dim-surroundings'].includes(pres)) {
                groupHeroDimming = true;
              }
            }
          }
        }
      }

      for (let wi = 0; wi < group.words.length; wi++) {
        const word = group.words[wi];
        const resolvedWord = this.resolvedState.wordSettings[word.clean ?? normalizeToken(word.text)] ?? null;
        const isAnchor = wi === group.anchorWordIdx;
        const staggerDelay = isAnchor ? 0 : Math.abs(wi - group.anchorWordIdx) * group.staggerDelay;
        const li = word.letterIndex ?? 0;
        const lt = word.letterTotal ?? 1;
        const letterDelay = word.isLetterChunk ? li * 0.06 : 0;
        const adjustedElapsed = Math.max(0, tSec - group.start - staggerDelay - letterDelay);
        const effectiveEntryDuration = group.entryDuration * word.entryDurationMult;
        const entryProgress = Math.min(1, Math.max(0, adjustedElapsed / Math.max(0.01, effectiveEntryDuration)));

        const effectiveExitDuration = Math.min(group.exitDuration, Math.max(0.05, nextGroupStart - group.end));
        const exitDelay = word.isLetterChunk && SPLIT_EXIT_STYLES.has(word.exitStyle) ? letterDelay : 0;
        const exitProgress = Math.max(0, (tSec - groupEnd - exitDelay) / Math.max(0.01, effectiveExitDuration));

        const entryState = computeEntryState(word.entryStyle as any, entryProgress, group.behaviorIntensity);
        const exitState = computeExitState(word.exitStyle as any, exitProgress, group.behaviorIntensity, li, lt);
        const beatPhase = beatIndex >= 0 ? ((tSec - (beats[beatIndex]?.time ?? 0)) / (60 / Math.max(1, bpm))) % 1 : 0;
        const behaviorState = computeBehaviorState(word.behaviorStyle as any, tSec, group.start, beatPhase, group.behaviorIntensity);

        const finalOffsetX = entryState.offsetX + (exitState.offsetX ?? 0) + (behaviorState.offsetX ?? 0);
        const finalOffsetY = entryState.offsetY + (exitState.offsetY ?? 0) + (behaviorState.offsetY ?? 0);
        let finalScaleX = entryState.scaleX * (exitState.scaleX ?? 1) * (behaviorState.scaleX ?? 1) * word.semanticScaleX;
        let finalScaleY = entryState.scaleY * (exitState.scaleY ?? 1) * (behaviorState.scaleY ?? 1) * word.semanticScaleY;

        const isEntryComplete = entryProgress >= 1.0;
        const isExiting = exitProgress > 0;

        // ─── Line role Y positioning ───
        // Compiler sets all words at canvasH * 0.50 (Y=270 in 960x540 space).
        // Override Y based on which line role this group belongs to.

        // Target Y positions in compile coordinate space (540px canvas height)
        let targetLineY: number;
        switch (lineRole) {
          case 'current': targetLineY = 270; break; // center
          case 'previous': targetLineY = 150; break; // above center
          case 'next': targetLineY = 390; break; // below center
          default: targetLineY = word.layoutY; break;
        }

        // Smooth transition when lines shift roles
        const baseLineY = word.layoutY; // compiled Y (270 for all)
        const roleY = baseLineY + (targetLineY - 270) * lineTransEase;

        // ─── Alpha: line role + vocal tracking ───
        // Base animation alpha (entry/exit/behavior)
        const animAlpha = isExiting
          ? Math.max(0, exitState.alpha)
          : isEntryComplete
            ? 1.0 * (behaviorState.alpha ?? 1)
            : Math.max(0.1, entryState.alpha * (behaviorState.alpha ?? 1));

        // Line role opacity
        let roleAlpha: number;
        switch (lineRole) {
          case 'current': roleAlpha = 1.0; break;
          case 'previous': roleAlpha = 0.0; break;
          case 'next': roleAlpha = 0.0; break;
          default: roleAlpha = 0.0; break;
        }

        // ─── Vocal wave: continuous brightness flowing through the line ───
        let waveProximity = 0; // 0-1, how close the wave peak is to this word
        if (lineRole === 'current' && isEntryComplete && !isExiting) {
          const lineData = _roleLines[primaryLineIndex];
          const lineStart = lineData?.start ?? group.start;
          const lineEnd = lineData?.end ?? group.end;
          const lineDuration = Math.max(0.01, lineEnd - lineStart);

          // Vocal position: where the voice is in the line (0 to 1)
          const vocalProgress = Math.max(0, Math.min(1, (tSec - lineStart) / lineDuration));

          // Word position: where this word sits in the line (0 to 1)
          const wordTime = group.start + staggerDelay;
          const wordPosition = Math.max(0, Math.min(1, (wordTime - lineStart) / lineDuration));

          // Distance between voice and word (positive = voice has passed)
          const distance = vocalProgress - wordPosition;

          // Wave width: hero words have wider brightness zone
          const isHero = word.isHeroWord === true;
          const waveWidth = isHero ? 0.25 : 0.15;

          // Gaussian brightness curve
          const gaussian = Math.exp(-(distance * distance) / (2 * waveWidth * waveWidth));
          waveProximity = gaussian;

          const peakAlpha = 1.0;
          const unsungFloor = 0.35;
          const sungFloor = 0.65;

          if (distance < -0.02) {
            // Voice hasn't reached this word yet — subtle anticipation glow
            const anticipationGlow = Math.exp(-(distance * distance) / (2 * (waveWidth * 1.5) * (waveWidth * 1.5)));
            roleAlpha = unsungFloor + (peakAlpha - unsungFloor) * anticipationGlow * 0.3;
          } else if (distance > waveWidth * 2.5) {
            // Wave fully passed — settle to sung brightness
            roleAlpha = sungFloor;
          } else {
            // In the wave — smooth brightness
            const floor = distance > 0 ? sungFloor : unsungFloor;
            roleAlpha = floor + (peakAlpha - floor) * gaussian;
          }
        }

        let finalAlpha = Math.min(word.semanticAlphaMax, animAlpha * roleAlpha);

        // ─── Hero word presentation (wave-driven) ───
        const isHeroWord = word.isHeroWord === true;
        const heroPresentation = (word as any).heroPresentation as string | undefined;
        let heroScaleMult = 1.0;
        let heroOffsetY = 0;
        let heroDelayMs = 0;
        let heroDimSiblings = false;
        let heroIsolate = false;
        let heroTrackingExpand = false;

        if (isHeroWord && lineRole === 'current') {
          // waveProximity (0-1) drives all hero effects smoothly
          // At 1.0 = wave peak is exactly on this word
          // At 0.0 = wave is far away
          const wp = waveProximity;

          switch (heroPresentation ?? 'inline-scale') {
            case 'inline-scale': {
              // 115-120% scale that follows the wave curve
              heroScaleMult = 1.0 + wp * 0.18;
              // Subtle 8px upward nudge at peak
              heroOffsetY = -8 * wp;
              if (wp > 0.5) heroDimSiblings = true;
              break;
            }
            case 'delayed-reveal': {
              // Snap-in effect: word is invisible until wave arrives, then pops
              heroDelayMs = 120;
              const wordStartTime = group.start + staggerDelay;
              const delayedStart = wordStartTime + heroDelayMs / 1000;
              if (tSec < delayedStart) {
                roleAlpha = 0.0;
              } else {
                // Once revealed, scale follows the wave
                heroScaleMult = 1.0 + wp * 0.16;
                if (wp > 0.3) heroDimSiblings = true;
              }
              break;
            }
            case 'isolation': {
              // Everything else fades proportional to wave proximity
              heroIsolate = true;
              heroScaleMult = 1.0 + wp * 0.35;
              // Offset toward center proportional to wave
              heroOffsetY = (270 - word.layoutY) * wp;
              roleAlpha = Math.max(roleAlpha, wp);
              break;
            }
            case 'vertical-lift': {
              // Rise follows the wave — eases up and settles back
              heroOffsetY = -28 * wp;
              heroScaleMult = 1.0 + wp * 0.15;
              if (wp > 0.5) heroDimSiblings = true;
              break;
            }
            case 'vertical-drop': {
              // Sink follows the wave
              heroOffsetY = 28 * wp;
              heroScaleMult = 1.0 + wp * 0.15;
              if (wp > 0.5) heroDimSiblings = true;
              break;
            }
            case 'tracking-expand': {
              heroTrackingExpand = true;
              heroScaleMult = 1.0 + wp * 0.10;
              if (wp > 0.5) heroDimSiblings = true;
              break;
            }
            case 'dim-surroundings': {
              heroDimSiblings = true;
              heroScaleMult = 1.0 + wp * 0.15;
              break;
            }
          }
        }

        if (isHeroWord && waveProximity > groupHeroWaveProximity) {
          groupHeroWaveProximity = waveProximity;
        }

        if (heroDimSiblings) groupHeroDimming = true;
        if (heroIsolate) groupHeroIsolation = true;

        // (Next-line anticipation removed — only current line is visible)

        // Sibling dimming: proportional to hero word's wave proximity
        if (!isHeroWord && lineRole === 'current') {
          if (groupHeroIsolation) {
            // Isolation: siblings fade smoothly as wave reaches hero, return after
            roleAlpha *= Math.max(0.05, 1.0 - groupHeroWaveProximity * 0.95);
          } else if (groupHeroDimming) {
            // Subtle dim: 0-20% reduction following the wave
            roleAlpha *= 1.0 - groupHeroWaveProximity * 0.20;
          }
        }

        finalAlpha = Math.min(word.semanticAlphaMax, animAlpha * roleAlpha);

        const finalSkewX = entryState.skewX + (exitState.skewX ?? 0) + (behaviorState.skewX ?? 0);
        const finalGlowMult = entryState.glowMult + (exitState.glowMult ?? 0);
        const finalBlur = (entryState.blur ?? 0) + (exitState.blur ?? 0) + (behaviorState.blur ?? 0);
        const finalRotation = (entryState.rotation ?? 0) + (exitState.rotation ?? 0) + (behaviorState.rotation ?? 0);
        const isFrozen = word.behaviorStyle === 'freeze' && (tSec - group.start) > 0.3;

        const effectiveFontSize = word.baseFontSize * fontScale;
        const charW = word.isLetterChunk ? effectiveFontSize * 0.6 : 0;
        const wordSpan = charW * lt;
        const letterOffsetX = word.isLetterChunk ? (li * charW) - (wordSpan * 0.5) + (charW * 0.5) : 0;

        const emphasisPulse = resolvedWord?.pulseAmp ?? 0;
        const beatScale = 1 + beatSpine.beatPulse * emphasisPulse;
        finalScaleX *= beatScale;
        finalScaleY *= beatScale;

        const isHeroBeatHit = isExactHeroTokenMatch(word.text, resolvedLine?.heroWord ?? '') && beatSpine.beatPulse > 0.35;
        if (isHeroBeatHit) {
          const push = resolvedWord?.microCamPush ?? 0.04;
          finalScaleX *= 1 + push;
          finalScaleY *= 1 + push;
          driftY += push * 16;
        }

        const glowGain = resolvedWord?.glowGain ?? 0;
        let wordGlow = ((isAnchor ? glow * (1 + finalGlowMult) * (word.isFiller ? 0.5 : 1.0) : glow * 0.3) * word.semanticGlowMult * intensityGlowMult)
          + beatSpine.beatPulse * glowGain;

        // Wave glow: all words near vocal position get subtle halo
        if (lineRole === 'current' && isEntryComplete && !isExiting) {
          wordGlow += 0.3 * waveProximity;
        }

        // Hero glow follows the wave
        if (isHeroWord && heroScaleMult > 1.02) {
          wordGlow += 0.4 * (heroScaleMult - 1.0);
          if ((heroPresentation ?? 'inline-scale') === 'isolation') wordGlow += 0.5 * waveProximity;
        }

        const chunk = chunks[ci] ?? ({} as ScaledKeyframe['chunks'][number]);
        chunks[ci] = chunk;
        chunk.id = word.id;
        chunk.text = word.text;
        chunk.x = (word.layoutX + finalOffsetX + letterOffsetX) * sx;
        chunk.y = (roleY + finalOffsetY + heroOffsetY) * sy;
        chunk.fontSize = effectiveFontSize;
        chunk.alpha = Math.max(0, Math.min(1, finalAlpha));
        chunk.scaleX = finalScaleX * intensityScaleMult * heroScaleMult;
        chunk.scaleY = finalScaleY * intensityScaleMult * heroScaleMult;
        chunk.scale = 1;
        chunk.visible = finalAlpha > 0.01 && lineRole !== 'offscreen';
        chunk.fontWeight = word.fontWeight;
        chunk.fontFamily = word.fontFamily;
        chunk.isAnchor = isAnchor;
        chunk.color = word.color;
        // Runtime palette override: use chapter-resolved text color so words
        // shift color as chapters change (auto_palettes may arrive after compile)
        if (!word.hasSemanticColor) {
          const runtimePal = this.getResolvedPalette();
          if (runtimePal?.[2]) chunk.color = runtimePal[2];
        }
        chunk.glow = wordGlow;
        chunk.emitterType = word.emitterType !== 'none' ? word.emitterType : undefined;
        chunk.trail = word.trail;
        chunk.entryStyle = word.entryStyle;
        chunk.exitStyle = word.exitStyle;
        chunk.emphasisLevel = word.emphasisLevel;
        chunk.entryProgress = entryProgress;
        chunk.exitProgress = Math.min(1, exitProgress);
        chunk.behavior = word.behaviorStyle;
        chunk.skewX = finalSkewX;
        chunk.blur = Math.max(0, Math.min(1, finalBlur));
        chunk.rotation = finalRotation;
        chunk.ghostTrail = resolvedWord?.ghostTrail ?? word.ghostTrail;
        chunk.ghostCount = word.ghostCount;
        chunk.ghostSpacing = word.ghostSpacing;
        chunk.ghostDirection = (resolvedWord?.ghostDirection ?? word.ghostDirection) as any;
        chunk.heroTrackingExpand = isHeroWord && heroTrackingExpand && tSec >= group.start + staggerDelay;
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
    (frame as any).beatPulse = beatSpine.beatPulse;
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
    this.activeEvents = this.activeEvents.filter(ae => (tSec - ae.startTime) < ae.event.duration);
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
}
