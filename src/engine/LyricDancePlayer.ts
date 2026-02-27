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
import { getTypography } from "@/engine/presetDerivation";
import { drawIcon, type IconGlyph, type IconStyle } from "@/lib/lyricIcons";
import {
  bakeSceneChunked,
  type BakedTimeline,
  type Keyframe,
  type ScenePayload,
} from "@/lib/lyricSceneBaker";
import { deriveTensionCurve, enrichSections } from "@/engine/directionResolvers";
import { PARTICLE_SYSTEM_MAP, ParticleEngine } from "@/engine/ParticleEngine";
import { cinematicFontSize, getCinematicLayout } from "@/engine/SystemStyles";

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

  // Active word
  activeWord: string;
  activeWordEntry: string;
  activeWordExit: string;
  activeWordEmphasis: number;
  activeWordTrail: string;

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

  activeWord: "—",
  activeWordEntry: "—",
  activeWordExit: "—",
  activeWordEmphasis: 0,
  activeWordTrail: "none",

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
    visible: boolean;
    entryOffsetY?: number;
    entryOffsetX?: number;
    entryScale?: number;
    exitOffsetY?: number;
    exitScale?: number;
  }>;
};

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

const BASE_W = 960;
const BASE_H = 540;
const BAKER_VERSION = 3;
let globalBakeLock = false;
let globalBakePromise: Promise<void> | null = null;
let globalTimelineCache: ScaledKeyframe[] | null = null;
let globalChunkCache: Map<string, ChunkState> | null = null;
let globalHasCinematicDirection = false;
let globalSongStartSec = 0;
let globalSongEndSec = 0;
let globalBakerVersion = 0;
let globalSessionKey = '';

const SIM_W = 96;
const SIM_H = 54;

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
    particleConfig: { texture: 'dust', system: 'dust', density: 0.35, speed: 0.35 },
  };
  

  // Public writeable surface (React pushes comments here)
  public constellationNodes: any[] = [];

  // Data
  private data: LyricDanceData;
  private payload: ScenePayload | null = null;

  // Baked
  private timeline: ScaledKeyframe[] = [];
  private chunks: Map<string, ChunkState> = new Map();

  // Background cache
  private bgCaches: HTMLCanvasElement[] = [];
  private bgCacheCount = 0;

  private backgroundSystem = 'default';
  private chapterSims: Array<{ fire?: FireSim; water?: WaterSim; aurora?: AuroraSim; rain?: RainSim }> = [];
  private lastSimFrame = -1;
  private currentSimCanvases: HTMLCanvasElement[] = [];
  private chapterImages: HTMLImageElement[] = [];
  private chapterImageLuminance = new WeakMap<HTMLImageElement, number>();
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
      globalTimelineCache &&
      (globalSessionKey !== `v15-${songId}` || globalBakerVersion !== BAKER_VERSION)
    ) {
      globalTimelineCache = null;
    }
    const sessionKey = `v15-${data.id}`;
    if (globalSessionKey !== sessionKey) {
      globalSessionKey = sessionKey;
      globalBakePromise = null;
      globalTimelineCache = null;
      globalChunkCache = null;
      globalBakeLock = false;
      globalHasCinematicDirection = false;
      globalBakerVersion = 0;
    }
    this.data = data;
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
    if (globalTimelineCache && !globalHasCinematicDirection && this.data.cinematic_direction && !Array.isArray(this.data.cinematic_direction)) {
      globalBakePromise = null;
      globalTimelineCache = null;
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

        // Build and capture chunks BEFORE the async bake
        // so Strict Mode destroy() can't wipe them
        this.buildChunkCache(payload);
        const localChunkSnapshot = new Map(this.chunks);

        const baked = await bakeSceneChunked(payload);

        // Use the local snapshot not this.chunks (which destroy() may have wiped)
        globalTimelineCache = this.scaleTimeline(baked);
        globalChunkCache = localChunkSnapshot;
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
    this.timeline = globalTimelineCache!.slice();
    this.chunks = new Map(globalChunkCache!);
    this.songStartSec = globalSongStartSec;
    this.songEndSec = globalSongEndSec;
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
      this.buildChunkCache(payload);
      // Snapshot chunks NOW before the async yield — destroy() may replace this.chunks
      const chunkSnapshot = new Map(this.chunks);
      const baked = await bakeSceneChunked(payload, (p) => onProgress(Math.round(p * 100)));

      this.timeline = this.scaleTimeline(baked);
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
    this.ambientParticleEngine?.setBounds({ x: 0, y: 0, w: this.width, h: this.height });
    this.lastSimFrame = -1;
    if (this.timeline.length) this.timeline = this.scaleTimeline(this.unscaleTimeline());
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
    this.buildChunkCache(this.payload);
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
    this.timeline = [];
    this.bgCaches = [];
    this.bgCacheCount = 0;

    this.audio.pause();
    this.audio.src = "";

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.currentSimCanvases = [];
    this.ambientParticleEngine?.clear();
    this.chapterSims = [];
    this.chapterImages = [];
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

      this.update(deltaMs);
      this.draw(this.audio.currentTime);
    } catch (err) {
      // render crash — silently continue
    } finally {
      // ALWAYS reschedule — even after crash — loop must never die
      if (!this.destroyed && this.playing) {
        this.rafHandle = requestAnimationFrame(this.tick);
      }
    }
  };

  private drawWordHalo(
    x: number,
    y: number,
    fontSize: number,
    isAnchor: boolean,
    chapterColor: string,
    alpha: number
  ): void {
    const baseRadius = fontSize * (isAnchor ? 1.8 : 1.2);
    const innerAlpha = isAnchor ? 0.72 : 0.45;
    const innerColor = isAnchor
      ? this.blendWithBlack(chapterColor, 0.85)
      : '#000000';

    const halo = this.ctx.createRadialGradient(x, y, 0, x, y, baseRadius);
    halo.addColorStop(0, this.hexWithAlpha(innerColor, innerAlpha * alpha));
    halo.addColorStop(0.6, this.hexWithAlpha(innerColor, innerAlpha * alpha * 0.6));
    halo.addColorStop(1, this.hexWithAlpha(innerColor, 0));

    this.ctx.fillStyle = halo;
    this.ctx.beginPath();
    this.ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
    this.ctx.fill();
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

    // Find current chapter based on playback position
    const currentTimeSec = this.audio?.currentTime ?? 0;
    const totalDurationSec = this.audio?.duration || 1;
    const chIdx = this.resolveChapterIndex(chapters, currentTimeSec, totalDurationSec);

    // Priority 1: auto-palettes computed from section images
    if (Array.isArray(autoPalettes) && chIdx >= 0 && autoPalettes[chIdx]) {
      return autoPalettes[chIdx];
    }
    if (Array.isArray(autoPalettes) && autoPalettes.length > 0) {
      return autoPalettes[0];
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

  private update(deltaMs: number): void {
    const t = this.audio.currentTime;
    const clamped = Math.max(this.songStartSec, Math.min(this.songEndSec, t));
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
      console.log('[Player] section changed:', {
        index: sectionIndex,
        texture,
        tension: currentTension?.stage ?? "—",
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
    const frame = this.getFrame(this.currentTimeMs);
    const visibleChunks = frame?.chunks.filter((c: any) => c.visible) ?? [];

    const activeWord = this.getActiveWord(clamped);
    const activeWordClean = activeWord?.word?.toLowerCase()?.replace(/[.,!?'"]/g, '') ?? '';
    const activeWordDirective = activeWordClean ? this.resolvedState.wordDirectivesMap[activeWordClean] ?? null : null;

    this.debugState = {
      ...this.debugState,
      time: clamped,
      fps: Math.round(this.fpsAccum.fps),
      songProgress,
      perfTotal: deltaMs,
      perfBg: 0,
      perfText: 0,
      beatIntensity: simulatedBeat,
      physGlow: simulatedBeat * 0.6,
      lastBeatForce: simulatedBeat * 0.8,
      physicsActive: this.playing,
      heat: (this.payload as any)?.motionProfileSpec?.params?.heat ?? 0,
      velocity: simulatedBeat * 0.5,
      wordCount: lines.length,
      effectKey: visibleChunks.length > 0 ? "baked" : "—",
      entryProgress: activeLine ? Math.min(1, (clamped - activeLine.start) / Math.max(0.1, activeLine.end - activeLine.start)) : 0,
      exitProgress: activeLine ? Math.max(0, 1 - (activeLine.end - clamped) / Math.max(0.1, activeLine.end - activeLine.start)) : 0,
      fontScale: frame?.cameraZoom ?? 1,
      scale: frame?.cameraZoom ?? 1,
      zoom: frame?.cameraZoom ?? 1,
      lineColor: (visibleChunks[0] as any)?.color ?? "#ffffff",
      particleSystem: this.activeSectionTexture ?? this.resolvedState.particleConfig.texture ?? "—",
      particleDensity: this.resolvedState.particleConfig.density ?? 0,
      particleSpeed: this.resolvedState.particleConfig.speed ?? 0,
      dirThesis: (cd as any)?.thesis ?? "—",
      dirChapter: currentChapter?.title ?? "—",
      dirChapterProgress: currentChapter ? Math.max(0, Math.min(1, (songProgress - (currentChapter.startRatio ?? 0)) / Math.max(0.001, (currentChapter.endRatio ?? 1) - (currentChapter.startRatio ?? 0)))) : 0,
      dirIntensity: simulatedBeat,
      dirBgDirective: currentChapter?.backgroundDirective ?? "—",
      dirLightBehavior: currentChapter?.lightBehavior ?? "—",
      cameraDistance: section?.atmosphere ?? (cd as any)?.atmosphere ?? "cinematic",
      cameraMovement: section?.motion ?? (cd as any)?.motion ?? "fluid",
      tensionStage: currentTension?.stage ?? "—",
      tensionMotion: currentTension?.motionIntensity ?? 0,
      tensionParticles: currentTension?.particleDensity ?? 0,
      tensionTypo: section?.typography ?? (cd as any)?.typography ?? "clean-modern",
      backgroundSystem: this.backgroundSystem ?? "—",
      lineHeroWord: activeLine?.text?.split(" ")[0] ?? "—",
      lineIntent: currentChapter?.emotionalArc ?? "—",
      wordDirectiveWord: activeWordDirective?.word ?? activeWordClean ?? "—",
      wordDirectiveBehavior: activeWordDirective?.behavior ?? "—",
      wordDirectiveEntry: activeWordDirective?.entry ?? "—",
      wordDirectiveEmphasis: activeWordDirective?.emphasisLevel ?? 0,
      wordDirectiveExit: activeWordDirective?.exit ?? "—",
      wordDirectiveGhostTrail: activeWordDirective?.ghostTrail ?? false,
      wordDirectiveGhostDir: activeWordDirective?.ghostDirection ?? "—",

      // Section boundaries
      ...(() => {
        const sections = this.resolvedState.chapters ?? [];
        const secIdx = sections.length > 0 ? this.resolveSectionIndex(sections, clamped - this.songStartSec, duration) : -1;
        const sec = secIdx >= 0 ? sections[secIdx] : null;
        const secStart = sec?.startSec ?? 0;
        const secEnd = sec?.endSec ?? 0;
        const secDur = secEnd - secStart;
        const secElapsed = Math.max(0, (clamped - this.songStartSec) - secStart);
        return {
          secIndex: secIdx,
          secTotal: sections.length,
          secStartSec: secStart,
          secEndSec: secEnd,
          secElapsed,
          secDuration: secDur,
          secProgress: secDur > 0 ? Math.min(1, secElapsed / secDur) : 0,
          secMood: sec?.mood ?? "—",
          secTexture: this.activeSectionTexture ?? sec?.texture ?? this.resolveParticleTexture(secIdx >= 0 ? secIdx : 0, cd) ?? "—",
          secHasImage: !!(this.data.section_images?.[secIdx]),
        };
      })(),

      // Cinematic direction defaults
      cdSceneTone: (cd as any)?.sceneTone ?? "—",
      cdAtmosphere: (cd as any)?.atmosphere ?? "—",
      cdMotion: (cd as any)?.motion ?? "—",
      cdTypography: (cd as any)?.typography ?? "—",
      cdTexture: (cd as any)?.texture ?? "—",
      cdEmotionalArc: (cd as any)?.emotionalArc ?? "—",

      // Beat grid phase
      ...(() => {
        const bg = this.data.beat_grid;
        if (!bg || !bg.beats?.length) return { bgBpm: 0, bgBeatsTotal: 0, bgConfidence: 0, bgNextBeat: 0, bgBeatPhase: 0 };
        const t = clamped;
        const beats = bg.beats;
        let nextBeat = 0;
        let lastBeat = 0;
        for (let i = 0; i < beats.length; i++) {
          if (beats[i] > t) { nextBeat = beats[i]; lastBeat = i > 0 ? beats[i - 1] : 0; break; }
          lastBeat = beats[i];
        }
        const interval = nextBeat > lastBeat ? nextBeat - lastBeat : 60 / (bg.bpm || 120);
        const phase = interval > 0 ? (t - lastBeat) / interval : 0;
        return { bgBpm: bg.bpm, bgBeatsTotal: beats.length, bgConfidence: bg.confidence, bgNextBeat: nextBeat, bgBeatPhase: Math.min(1, Math.max(0, phase)) };
      })(),

      // Active word
      ...(() => {
        const w = activeWord;
        if (!w) return { activeWord: "—", activeWordEntry: "—", activeWordExit: "—", activeWordEmphasis: 0, activeWordTrail: "none" };
        const directive = activeWordDirective;
        return {
          activeWord: w.word ?? "—",
          activeWordEntry: directive?.entry ?? "—",
          activeWordExit: directive?.exit ?? "—",
          activeWordEmphasis: directive?.emphasis ?? 0,
          activeWordTrail: directive?.trail ?? "none",
        };
      })(),
    };

    const beatIntensity = Math.max(0, Math.min(1, simulatedBeat));
    this.ambientParticleEngine?.update(deltaMs, beatIntensity);
    this.debugState = {
      ...this.debugState,
      particleCount: this.ambientParticleEngine?.getActiveCount() ?? 0,
      tensionStage: this.activeTension?.stage ?? this.debugState.tensionStage,
    };
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

    const frame = this.getFrame(this.currentTimeMs);
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
      const currentUrl = this.data.section_images?.[imgIdx];
      const prevUrl = this._prevImgIdx >= 0 ? this.data.section_images?.[this._prevImgIdx] : undefined;
      if (this._prevImgIdx >= 0 && prevUrl) {
        console.log('[Player Image Hide]', { sectionIndex: this._prevImgIdx, time: tSec.toFixed(2) });
      }
      if (currentUrl) {
        console.log('[Player Image Show]', { sectionIndex: imgIdx, time: tSec.toFixed(2), opacity: 1, url: currentUrl.slice(-30) });
      }
      console.log('[Player Section Change]', {
        time: tSec.toFixed(2),
        from: this._prevImgIdx,
        to: imgIdx,
        imageUrl: currentUrl ? currentUrl.slice(-30) : 'none',
      });
      this._prevImgIdx = imgIdx;
    }

    // Update image debug state
    const atmosphere = this.getAtmosphere();
    const atmosphereOpacityMap: Record<string, number> = { void: 0.10, cinematic: 0.65, haze: 0.50, split: 0.75, grain: 0.60, wash: 0.55, glass: 0.45, clean: 0.85 };
    this.debugState = {
      ...this.debugState,
      imgCount: this.chapterImages.length,
      imgActiveIdx: imgIdx,
      imgNextIdx: nextImgIdx,
      imgCrossfade: crossfade,
      imgChapterSpan: chapterSpan,
      imgLocalProgress: chapterLocalProgress,
      imgOpacity: atmosphereOpacityMap[atmosphere] ?? 0.65,
      imgOverlap: false,
    };

    this.drawChapterImage(imgIdx, nextImgIdx, crossfade);

    this.drawSimLayer(frame);
    this.drawLightingOverlay(frame, tSec);

    try {
      this.checkEmotionalEvents(tSec, songProgress);
    } catch (e) {
      // emotional events crash — silently continue
    }

    this.drawEmotionalEvents(tSec);

    const nowSec = performance.now() / 1000;
    this.drawDecompositions(this.ctx, nowSec);

    // Ambient particles — runtime system updates per section
    this.ambientParticleEngine?.draw(this.ctx, "far");

    const safeCameraX = Number.isFinite(frame.cameraX) ? frame.cameraX : 0;
    const safeCameraY = Number.isFinite(frame.cameraY) ? frame.cameraY : 0;
    this.ctx.translate(safeCameraX, safeCameraY);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    let drawCalls = 0;
    const palette = this.getBurstPalette(songProgress);
    const cinematicSizingV2 = true;
    const sortedChunks = [...frame.chunks].sort((a, b) => {
      const aIsExiting = (a.exitProgress ?? 0) > 0 ? 1 : 0;
      const bIsExiting = (b.exitProgress ?? 0) > 0 ? 1 : 0;
      return bIsExiting - aIsExiting;
    });

    const visibleLines = this.payload?.lines?.filter((l: any) => tSec >= (l.start ?? 0) && tSec < (l.end ?? 0)) ?? [];
    const activeLine = visibleLines.length === 0
      ? null
      : visibleLines.reduce((latest: any, l: any) => ((l.start ?? 0) > (latest.start ?? 0) ? l : latest));
    const activeLineText = activeLine?.text ?? null;

    let baseFontSize: number | null = null;
    if (cinematicSizingV2 && activeLineText) {
      const { fs } = cinematicFontSize(
        this.ctx,
        activeLineText,
        this.width,
        this.height,
        this.getResolvedFont(),
        700,
      );
      baseFontSize = fs;

      const activeChunks = sortedChunks.filter((c) => (c.exitProgress ?? 0) === 0 && c.visible);
      const bakedSizes = activeChunks
        .map((c) => c.fontSize)
        .filter((size): size is number => typeof size === 'number' && size > 0);
      const sortedSizes = [...bakedSizes].sort((a, b) => a - b);
      const medianBaked = sortedSizes.length > 0
        ? sortedSizes[Math.floor(sortedSizes.length / 2)]
        : null;

      for (const chunk of activeChunks) {
        const emphasisRatio = medianBaked != null && (chunk.fontSize ?? 0) > 0
          ? (chunk.fontSize as number) / medianBaked
          : 1.0;
        const clamped = Math.max(0.85, Math.min(1.25, emphasisRatio));
        (chunk as any)._resolvedFontSize = Math.round(fs * clamped);
      }

      for (const chunk of sortedChunks) {
        if ((chunk.exitProgress ?? 0) > 0 && (chunk as any)._resolvedFontSize == null && baseFontSize != null) {
          (chunk as any)._resolvedFontSize = baseFontSize;
        }
      }
    }

    const layout = getCinematicLayout(this.width, this.height);
    const opticalOffset = layout.baselineY - (this.height * 0.5);

    for (const chunk of sortedChunks) {
      if (!chunk.visible) continue;

      // Spawn ambient burst trails as words exit.
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
      const currentExitProgress = Math.max(0, Math.min(1, chunk.exitProgress ?? 0));
      const wordJustExited = prevExitProgress <= 0 && currentExitProgress > 0;
      this.lastExitProgressByChunk.set(chunk.id, currentExitProgress);
      const obj = this.chunks.get(chunk.id);
      if (!obj) {
        console.warn('[Decomp] chunk miss:', chunk.id, 'registered:', [...this.chunks.keys()].slice(0, 5));
        continue;
      }
      const chunkBaseX = Number.isFinite(chunk.x) ? chunk.x : 0;
      const chunkBaseY = Number.isFinite(chunk.y) ? chunk.y : 0;
      const drawX = chunk.frozen ? chunkBaseX - safeCameraX : chunkBaseX;
      const drawY = chunk.frozen ? chunkBaseY - safeCameraY : chunkBaseY;
      const isExitingChunk = (chunk.exitProgress ?? 0) > 0;
      const finalDrawY = isExitingChunk ? drawY : drawY + opticalOffset;
      const zoom = Number.isFinite(frame.cameraZoom) ? frame.cameraZoom : 1.0;
      const fontSize = cinematicSizingV2
        ? ((chunk as any)._resolvedFontSize ?? baseFontSize ?? 36)
        : (Number.isFinite(chunk.fontSize) ? (chunk.fontSize as number) : 36);
      const fontWeight = chunk.fontWeight ?? 700;
      const viewportMinFont = Math.max(16, Math.min(this.width, this.height) * 0.055);
      const safeFontSize = Math.max(viewportMinFont, Math.round(fontSize * zoom) || 36);
      const baseScale = Number.isFinite(chunk.scale) ? (chunk.scale as number) : ((chunk.entryScale ?? 1) * (chunk.exitScale ?? 1));
      const sxRaw = Number.isFinite(chunk.scaleX) ? (chunk.scaleX as number) : baseScale;
      const syRaw = Number.isFinite(chunk.scaleY) ? (chunk.scaleY as number) : baseScale;
      const sx = Number.isFinite(sxRaw) ? sxRaw : 1;
      const sy = Number.isFinite(syRaw) ? syRaw : 1;

      // Hierarchical halo — anchor vs supporting
      const isAnchor = chunk.isAnchor ?? false;
      const haloPal = this.getResolvedPalette();
      const chapterColor = haloPal[1];
      this.drawWordHalo(drawX, finalDrawY, fontSize, isAnchor, chapterColor, chunk.alpha);

      const drawAlpha = Number.isFinite(chunk.alpha) ? Math.max(0, Math.min(1, chunk.alpha)) : 1;
      const iconScaleMult = chunk.iconScale ?? 2.0;
      const positionScaleOverride: Record<string, number> = {
        behind: iconScaleMult,
        above: iconScaleMult * 0.55,
        beside: iconScaleMult * 0.5,
        replace: iconScaleMult * 0.9,
      };
      const effectiveScale = positionScaleOverride[chunk.iconPosition ?? 'behind'] ?? iconScaleMult;
      const iconBaseSize = (chunk.fontSize ?? 36) * effectiveScale;
      const iconColor = chunk.color ?? chapterColor;
      const now = performance.now() / 1000;
      let iconPulse = 1.0;
      if (chunk.iconPosition === 'behind') {
        iconPulse = 1.0 + Math.sin(now * 1.5) * 0.08;
      } else if (chunk.behavior === 'pulse') {
        iconPulse = 1.0 + Math.sin(now * 3) * 0.04;
      }
      const iconSize = iconBaseSize * iconPulse;
      let iconX = drawX;
      let iconY = finalDrawY;
      let iconOpacity = drawAlpha * 0.45;
      let iconGlow = 0;

      switch (chunk.iconPosition) {
        case 'behind':
          iconX = drawX;
          iconY = finalDrawY;
          iconOpacity = drawAlpha * 0.45;
          iconGlow = 12;
          break;
        case 'above':
          iconX = drawX;
          iconY = finalDrawY - (chunk.fontSize ?? 36) * 1.3;
          iconOpacity = drawAlpha * 0.85;
          iconGlow = 6;
          break;
        case 'beside':
          iconX = drawX - iconSize * 0.7;
          iconY = finalDrawY;
          iconOpacity = drawAlpha * 0.9;
          iconGlow = 6;
          break;
        case 'replace':
          iconX = drawX;
          iconY = finalDrawY;
          iconOpacity = drawAlpha * 1.0;
          iconGlow = 16;
          break;
      }

      const drawBefore = chunk.iconPosition === 'behind' || chunk.iconPosition === 'replace';
      if (chunk.iconGlyph && chunk.visible && drawBefore) {
        if (iconGlow > 0) {
          this.ctx.save();
          this.ctx.shadowColor = iconColor;
          this.ctx.shadowBlur = iconGlow;
        }
        drawIcon(this.ctx, chunk.iconGlyph as IconGlyph, iconX, iconY, iconSize, iconColor, (chunk.iconStyle as IconStyle) ?? 'ghost', iconOpacity);
        if (iconGlow > 0) {
          this.ctx.restore();
        }
      }

      const directiveKey = this.cleanWord((chunk.text ?? obj.text) as string);
      const directive = directiveKey ? this.resolvedState.wordDirectivesMap[directiveKey] ?? null : null;
      if (wordJustExited) {
        const decompDirective = directive ?? { exit: 'dissolve', emphasisLevel: 4 };
        this.tryStartDecomposition({
          chunkId: chunk.id,
          text: chunk.text ?? obj.text,
          drawX,
          drawY: finalDrawY,
          fontSize: safeFontSize,
          fontWeight,
          fontFamily: chunk.fontFamily,
          color: this.getTextColor(chunk.color ?? chapterColor),
          directive: decompDirective,
        });
      }
      // Allow word to render alongside particles for first 80ms — creates "bursts into particles" effect
      const nowForDecomp = performance.now() / 1000;
      const decompActive = this.activeDecomps.some(
        (d) => d.id === chunk.id && nowForDecomp - d.startTime > 0.08,
      );

      if (chunk.iconPosition !== 'replace' && !decompActive) {
        this.ctx.globalAlpha = drawAlpha;
        this.ctx.fillStyle = this.getTextColor(chunk.color ?? obj.color);
        const resolvedFont = this.getResolvedFont();
        const family = chunk.fontFamily ?? resolvedFont;
        this.ctx.font = `${fontWeight} ${safeFontSize}px ${family}`;
        if (!this.ctx.font.includes('px')) {
          this.ctx.font = `700 36px ${resolvedFont}`;
        }
        if (chunk.glow > 0) {
          this.ctx.shadowColor = chunk.color ?? '#ffffff';
          this.ctx.shadowBlur = chunk.glow * 32;
        }

        let filterApplied = false;
        if ((chunk.blur ?? 0) > 0.01) {
          this.ctx.filter = `blur(${(chunk.blur ?? 0) * 12}px)`;
          filterApplied = true;
        }

        if (chunk.ghostTrail && chunk.visible) {
          const count = chunk.ghostCount ?? 3;
          const spacing = chunk.ghostSpacing ?? 8;
          const dir = chunk.ghostDirection ?? 'up';
          for (let g = count; g >= 1; g--) {
            const ghostAlpha = drawAlpha * (0.12 + (count - g) * 0.06);
            const offset = g * spacing;
            let gx = 0, gy = 0;
            switch (dir) {
              case 'up': gy = offset; break;
              case 'down': gy = -offset; break;
              case 'left': gx = offset; break;
              case 'right': gx = -offset; break;
              case 'radial':
                gx = Math.cos(g * 1.2) * offset;
                gy = Math.sin(g * 1.2) * offset;
                break;
            }
            this.ctx.globalAlpha = ghostAlpha;
            this.ctx.save();
            this.ctx.translate(drawX + gx, finalDrawY + gy);
            if (chunk.rotation) this.ctx.rotate(chunk.rotation);
            this.ctx.transform(1, 0, Math.tan(((chunk.skewX ?? 0) * Math.PI) / 180), 1, 0, 0);
            this.ctx.scale(sx, sy);
            this.ctx.fillText(chunk.text ?? obj.text, 0, 0);
            this.ctx.restore();
          }
          this.ctx.globalAlpha = drawAlpha;
        }

        this.ctx.save();
        this.ctx.translate(drawX, finalDrawY);
        if (chunk.rotation) {
          this.ctx.rotate(chunk.rotation);
        }
        this.ctx.transform(1, 0, Math.tan(((chunk.skewX ?? 0) * Math.PI) / 180), 1, 0, 0);
        this.ctx.scale(sx, sy);
        this.ctx.fillText(chunk.text ?? obj.text, 0, 0);
        this.ctx.restore();

        if (filterApplied) {
          this.ctx.filter = 'none';
        }
      }

      if (chunk.iconGlyph && chunk.visible && !drawBefore) {
        if (iconGlow > 0) {
          this.ctx.save();
          this.ctx.shadowColor = iconColor;
          this.ctx.shadowBlur = iconGlow;
        }
        drawIcon(this.ctx, chunk.iconGlyph as IconGlyph, iconX, iconY, iconSize, iconColor, (chunk.iconStyle as IconStyle) ?? 'outline', iconOpacity);
        if (iconGlow > 0) {
          this.ctx.restore();
        }
      }
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
      drawCalls += 1;
    }

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
    this.debugState = { ...this.debugState, drawCalls };
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
      const textWidth = this.ctx.measureText(comment.text).width || 60;
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
    this.lastSimFrame = -1;
    if (this.timeline.length) this.timeline = this.scaleTimeline(this.unscaleTimeline());
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
      'explode': 1.2, 'ice-shatter': 1.5, 'burn-away': 1.5, 'dissolve': 2.0, 'melt': 1.5,
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
    console.log(`[Decomp] "${input.text}" → ${effect}, ${particles.length} particles`);
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
    } else if (effect === 'dissolve') { p.vx = (Math.random()-0.5)*20; p.vy=-8-Math.random()*15; p.gravity=-3; p.drag=0.97; p.dissolveDelay=Math.random()*0.4; }
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
      p.life -= dt * (1 / Math.max(0.2, d.duration));
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
    const sectionIndex = Math.max(0, Math.min(chapters.length - 1, this.resolveSectionIndex(chapters, this.audio.currentTime, this.audio.duration || 1)));
    const texture = this.resolveParticleTexture(sectionIndex >= 0 ? sectionIndex : 0, direction);
    this.resolvedState = {
      chapters,
      tensionCurve,
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
    console.log('[Player] wordDirectivesMap keys:', Object.keys(this.resolvedState?.wordDirectivesMap ?? {}));
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

  private buildChunkCache(payload: ScenePayload): void {
    this.chunks.clear();

    // Use a throwaway offscreen canvas for measurement
    // so we never depend on the main canvas being sized
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 960;
    measureCanvas.height = 540;
    const measureCtx = measureCanvas.getContext('2d')!;

    const cd = payload.cinematic_direction;
    const typoResolved = getTypography(cd?.typography ?? "clean-modern");
    const fontFamily = typoResolved.fontFamily?.trim() || 'Montserrat';
    const fontWeight = typoResolved.fontWeight || 800;
    const textTransform = typoResolved.textTransform || 'uppercase';
    const baseFontPx = 42;
    const font = `${fontWeight} ${baseFontPx}px ${fontFamily}`;
    measureCtx.font = font;

    const words = payload.words ?? [];
    const lines = payload.lines ?? [];

    if (words.length > 0) {
      // Replicate the baker's exact phrase-grouping (including mergeShortGroups)
      // to generate matching 3-part keys: ${lineIndex}-${groupIndex}-${wordIndex}
      const MAX_GROUP_SIZE = 5;
      const MIN_GROUP_DURATION = 0.4; // must match baker

      type WordEntry = { word: string; start: number; end: number };
      type PhraseGroup = {
        words: WordEntry[];
        start: number;
        end: number;
        lineIndex: number;
        groupIndex: number;
      };

      // Step 1: Assign each word to a line (same logic as baker)
      const lineMap = new Map<number, WordEntry[]>();
      for (const w of words) {
        const lineIndex = lines.findIndex(
          (l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? 9999),
        );
        const li = Math.max(0, lineIndex);
        if (!lineMap.has(li)) lineMap.set(li, []);
        lineMap.get(li)!.push(w);
      }

      // Step 2: Build phrase groups per line (same as baker's buildPhraseGroups)
      const allGroups: PhraseGroup[] = [];
      for (const [lineIdx, lineWords] of lineMap) {
        let current: WordEntry[] = [];
        let groupIdx = 0;

        const flushGroup = () => {
          if (current.length === 0) return;
          allGroups.push({
            words: [...current],
            start: current[0].start,
            end: current[current.length - 1].end,
            lineIndex: lineIdx,
            groupIndex: groupIdx,
          });
          groupIdx += 1;
          current = [];
        };

        for (let i = 0; i < lineWords.length; i++) {
          current.push(lineWords[i]);
          const duration = current[current.length - 1].end - current[0].start;
          const isNaturalBreak = /[,\.!?;]$/.test(lineWords[i].word);
          const isMaxSize = current.length >= MAX_GROUP_SIZE;
          const isLast = i === lineWords.length - 1;

          if (isLast) {
            flushGroup();
          } else if ((isNaturalBreak || isMaxSize) && duration >= MIN_GROUP_DURATION) {
            flushGroup();
          }
        }
      }

      // Sort by start time (same as baker)
      allGroups.sort((a, b) => a.start - b.start);

      // Step 3: Merge short groups (same as baker's mergeShortGroups)
      const merged: PhraseGroup[] = [];
      let gi = 0;
      while (gi < allGroups.length) {
        const g = allGroups[gi];
        const duration = g.end - g.start;
        if (duration < MIN_GROUP_DURATION && gi < allGroups.length - 1) {
          const next = allGroups[gi + 1];
          if (next.lineIndex === g.lineIndex && (g.words.length + next.words.length) <= MAX_GROUP_SIZE) {
            merged.push({
              words: [...g.words, ...next.words],
              start: g.start,
              end: next.end,
              lineIndex: g.lineIndex,
              groupIndex: g.groupIndex,
            });
            gi += 2;
            continue;
          }
        }
        merged.push(g);
        gi += 1;
      }

      // Step 4: Enforce min duration (same as baker)
      const finalGroups = merged.map((g) => ({
        ...g,
        end: Math.max(g.end, g.start + MIN_GROUP_DURATION),
      }));

      // Store phrase groups on the instance
      this.phraseGroups = finalGroups;

      // Clear and rebuild chunk map from ALL phrase groups
      this.chunks.clear();

      if (this.phraseGroups && this.phraseGroups.length > 0) {
        const wordDirectives = this.resolvedState.wordDirectivesMap;
        for (const group of this.phraseGroups) {
          let anchorIdx = group.words.length - 1;
          let maxEmp = -1;
          for (let i = 0; i < group.words.length; i++) {
            const clean = group.words[i].word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const emp = wordDirectives[clean]?.emphasisLevel ?? 1;
            if (emp > maxEmp) { maxEmp = emp; anchorIdx = i; }
          }
          for (let wi = 0; wi < group.words.length; wi++) {
            const wm = group.words[wi];
            const clean = wm.word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const shouldSplit = wi === anchorIdx && wordDirectives[clean]?.letterSequence === true;
            if (shouldSplit) {
              const letters = Array.from(wm.word);
              for (let li = 0; li < letters.length; li++) {
                const displayLetter = textTransform === 'uppercase' ? letters[li].toUpperCase() : letters[li];
                const key = `${group.lineIndex}-${group.groupIndex}-${wi}-L${li}`;
                this.chunks.set(key, { id: key, text: displayLetter, color: '#ffffff', font, width: measureCtx.measureText(displayLetter).width });
              }
            } else {
              const key = `${group.lineIndex}-${group.groupIndex}-${wi}`;
              const displayWord = textTransform === 'uppercase' ? wm.word.toUpperCase() : wm.word;
              this.chunks.set(key, { id: key, text: displayWord, color: '#ffffff', font, width: measureCtx.measureText(displayWord).width });
            }
          }
        }
      }


      return;
    }

    if (lines.length > 0) {
      lines.forEach((line, lineIndex) => {
        const lineText = line.text ?? '';
        const displayText = textTransform === 'uppercase' ? lineText.toUpperCase() : lineText;
        const key = `${lineIndex}-0-0`;
        this.chunks.set(key, {
          id: key,
          text: displayText,
          color: '#ffffff',
          font,
          width: measureCtx.measureText(displayText).width,
        });
      });
    }
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

  // Per-chapter particle systems derived from cinematic direction
  public chapterParticleSystems: (string | null)[] = [];

  private async loadSectionImages(): Promise<void> {
    const urls = this.data.section_images ?? [];
    if (urls.length === 0) return;
    const duration = this.audio?.duration || 1;
    const totalChapters = urls.length || 1;
    const chapterSpan = duration / totalChapters;
    console.log('[Player Sections]', urls.map((url: string, i: number) => ({
      index: i,
      start: (i * chapterSpan).toFixed(2),
      end: ((i + 1) * chapterSpan).toFixed(2),
      duration: chapterSpan.toFixed(2),
      hasImage: !!url,
      imageUrl: url ? url.slice(-30) : 'none',
    })));
    this.chapterImages = await Promise.all(
      urls.map((url: string, i: number) => new Promise<HTMLImageElement>((resolve) => {
        if (!url) { resolve(new Image()); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          console.log('[Player Image Preload]', { index: i, url: url.slice(-30), loaded: true });
          resolve(img);
        };
        img.onerror = () => {
          console.log('[Player Image Preload]', { index: i, url: url.slice(-30), loaded: false });
          resolve(new Image());
        };
        img.src = url;
      }))
    );
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
    if (current?.complete && current.naturalWidth > 0) {
      this.ctx.globalAlpha = targetImageOpacity;
      this.ctx.drawImage(current, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }

    if (next?.complete && next.naturalWidth > 0 && blend > 0) {
      this.ctx.globalAlpha = blend * targetImageOpacity;
      this.ctx.drawImage(next, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }

    // Dark crush overlay — always on top of image
    const chapters = this.resolvedState.chapters ?? [];
    const currentChapterObj = this.resolveChapter(chapters, this.audio.currentTime, this.audio.duration || 1);
    const intensity = currentChapterObj?.emotionalIntensity ?? 0.5;
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

    const crushColor = sceneCtx?.baseLuminance === 'light'
      ? `rgba(255,255,255,${crushAlpha * 0.4})`
      : `rgba(0,0,0,${crushAlpha})`;

    const crush = this.ctx.createLinearGradient(0, 0, 0, this.height);
    const crushColorMid = sceneCtx?.baseLuminance === 'light'
      ? `rgba(255,255,255,${Math.max(0.20, crushAlpha * 0.4 - 0.06)})`
      : `rgba(0,0,0,${Math.max(0.10, crushAlpha - 0.06)})`;
    crush.addColorStop(0, crushColor);
    crush.addColorStop(0.5, crushColorMid);
    crush.addColorStop(1, crushColor);
    this.ctx.fillStyle = crush;
    this.ctx.fillRect(0, 0, this.width, this.height);
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

  // ─── Scaling helpers ──────────────────────────────────────────────

  private scaleTimeline(baked: Keyframe[]): ScaledKeyframe[] {
    const sx = this.width / BASE_W;
    const sy = this.height / BASE_H;
    const isPortrait = this.height > this.width;
    const fontScale = isPortrait
      ? Math.min(this.width / BASE_H, this.height / BASE_W)
      : Math.min(sx, sy);
    return baked.map((kf) => ({
      ...kf,
      cameraX: kf.cameraX * sx,
      cameraY: kf.cameraY * sy,
      chunks: kf.chunks.map((c) => ({
        ...c,
        x: c.x * sx,
        y: c.y * sy,
        fontSize: c.fontSize ? c.fontSize * fontScale : undefined,
        entryOffsetY: c.entryOffsetY ? c.entryOffsetY * sy : undefined,
        entryOffsetX: c.entryOffsetX ? c.entryOffsetX * sx : undefined,
        exitOffsetY: c.exitOffsetY ? c.exitOffsetY * sy : undefined,
      })),
      particles: kf.particles.map((p) => ({
        ...p,
        x: p.x * sx,
        y: p.y * sy,
        size: p.size * Math.min(sx, sy),
      })),
    }));
  }

  private unscaleTimeline(): Keyframe[] {
    const sx = this.width / BASE_W;
    const sy = this.height / BASE_H;
    const isPortrait = this.height > this.width;
    const fontScale = isPortrait
      ? Math.min(this.width / BASE_H, this.height / BASE_W)
      : Math.min(sx, sy);
    if (sx === 0 || sy === 0 || fontScale === 0) return [];
    return this.timeline.map((kf) => ({
      ...kf,
      cameraX: kf.cameraX / sx,
      cameraY: kf.cameraY / sy,
      chunks: kf.chunks.map((c) => ({
        ...c,
        x: c.x / sx,
        y: c.y / sy,
        fontSize: c.fontSize ? c.fontSize / fontScale : 24,
        entryOffsetY: (c.entryOffsetY ?? 0) / sy,
        entryOffsetX: (c.entryOffsetX ?? 0) / sx,
        entryScale: c.entryScale ?? 1,
        exitOffsetY: (c.exitOffsetY ?? 0) / sy,
        exitScale: c.exitScale ?? 1,
        skewX: c.skewX ?? 0,
        isAnchor: c.isAnchor ?? false,
        color: c.color ?? '#ffffff',
      })),
      particles: kf.particles.map((p) => ({
        ...p,
        x: p.x / sx,
        y: p.y / sy,
        size: p.size / Math.min(sx, sy),
      })),
    })) as Keyframe[];
  }

  private getFrame(timeMs: number): ScaledKeyframe | null {
    if (!this.timeline.length) return null;
    // Binary search for the frame just at or before timeMs
    let lo = 0;
    let hi = this.timeline.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.timeline[mid].timeMs <= timeMs) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return this.timeline[lo];
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
    if (distToClimax < climaxRange) {
      const intensity = (1 - distToClimax / climaxRange) * (cd.climax?.maxLightIntensity ?? 0.6);
      this.ctx.save();
      const grad = this.ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, this.width * 0.6
      );
      grad.addColorStop(0, `rgba(255,255,240,${intensity * 0.15})`);
      grad.addColorStop(1, 'rgba(255,255,240,0)');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    }
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
