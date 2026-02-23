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
import {
  bakeSceneChunked,
  type BakedTimeline,
  type Keyframe,
  type ScenePayload,
} from "@/lib/lyricSceneBaker";

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
  physics_spec: PhysicsSpec;
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  palette: string[];
  system_type: string;
  artist_dna: any;
  seed: string;
  scene_manifest: any;
  cinematic_direction: CinematicDirection | null;
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
  tensionTypo: number;

  wordDirectiveWord: string;
  wordDirectiveKinetic: string;
  wordDirectiveElemental: string;
  wordDirectiveEmphasis: number;
  wordDirectiveEvolution: string;

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
  tensionTypo: 0,

  wordDirectiveWord: "",
  wordDirectiveKinetic: "—",
  wordDirectiveElemental: "—",
  wordDirectiveEmphasis: 0,
  wordDirectiveEvolution: "—",

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

type ScaledKeyframe = Omit<Keyframe, "chunks" | "cameraX" | "cameraY"> & {
  cameraX: number;
  cameraY: number;
  chunks: Array<{
    id: string;
    x: number;
    y: number;
    alpha: number;
    visible: boolean;
  }>;
};

const BASE_W = 960;
const BASE_H = 540;
let globalBakeLock = false;
let globalBakePromise: Promise<void> | null = null;
let globalTimelineCache: ScaledKeyframe[] | null = null;
let globalChunkCache: Map<string, ChunkState> | null = null;

// ──────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────

export class LyricDancePlayer {
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

  // Audio (React reads this)
  public audio: HTMLAudioElement;

  // Public debug surface (React reads this)
  public debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };

  // Public writeable surface (React pushes comments here)
  public constellationNodes: any[] = [];

  // Data
  private data: LyricDanceData;
  private payload: ScenePayload | null = null;

  // Baked
  private timeline: ScaledKeyframe[] = [];
  private chunks: Map<string, ChunkState> = new Map();

  // Background cache
  private bgCache: HTMLCanvasElement | null = null;

  // Playback
  private rafHandle = 0;
  private lastTimestamp = 0;
  private currentTimeMs = 0;
  private songStartSec = 0;
  private songEndSec = 0;
  private playing = false;
  private destroyed = false;

  // Perf
  private fpsAccum = { t: 0, frames: 0, fps: 60 };

  constructor(
    data: LyricDanceData,
    bgCanvas: HTMLCanvasElement,
    textCanvas: HTMLCanvasElement,
    container: HTMLDivElement,
  ) {
    console.log('[PLAYER] constructor called', data?.lyrics?.length);
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
  }

  // Compatibility with existing React shell
  async init(): Promise<void> {
    this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);

    if (!globalTimelineCache && !globalBakeLock) {
      // First instance — start the bake
      globalBakeLock = true;
      globalBakePromise = (async () => {
        const payload = this.buildScenePayload();
        try {
          await this.load(payload, (pct) => console.log('[PLAYER] bake pct:', pct));
          globalTimelineCache = [...this.timeline];
          globalChunkCache = new Map(this.chunks);
          console.log('[PLAYER] bake done — frames:', this.timeline.length);
        } catch (e) {
          console.error('[PLAYER] bake failed:', e);
        } finally {
          globalBakeLock = false;
        }
      })();
      await globalBakePromise;
    } else if (globalBakePromise && !globalTimelineCache) {
      // Second instance — bake in progress, wait for it
      console.log('[PLAYER] waiting for bake to complete');
      await globalBakePromise;
      console.log('[PLAYER] instance 2 after wait — cache exists:',
        !!globalTimelineCache, 'frames:', globalTimelineCache?.length,
        'chunks:', globalChunkCache?.size,
        'this.timeline after copy:', this.timeline.length);
    }

    if (globalTimelineCache?.length && globalChunkCache) {
      this.timeline = [...globalTimelineCache];
      this.chunks = new Map(globalChunkCache);
      this.buildBgCache();
      console.log('[PLAYER] instance 2 reused — frames:', this.timeline.length, 'chunks:', this.chunks.size);
    }

    this.audio.currentTime = this.songStartSec;
    this.audio.play().catch(() => {});
    this.playing = true;
    console.log('[PLAYER] starting RAF — timeline frames:', this.timeline.length,
      'chunks:', this.chunks.size);
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  // ────────────────────────────────────────────────────────────
  // Public API (React calls these)
  // ────────────────────────────────────────────────────────────

  async load(payload: ScenePayload, onProgress: (pct: number) => void): Promise<void> {
    console.log('[PLAYER] load() called — lines:', payload.lines.length);
    this.payload = payload;
    this.songStartSec = payload.songStart;
    this.songEndSec = payload.songEnd;

    this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);
    console.log('[PLAYER] calling buildChunkCache now');
    this.buildChunkCache(payload);
    console.log('[PLAYER] after buildChunkCache — chunks:', this.chunks.size);
    const baked = await bakeSceneChunked(payload, (p) => onProgress(Math.round(p * 100)));

    this.timeline = this.scaleTimeline(baked);
    this.buildBgCache();
    onProgress(100);
  }

  play(): void {
    this.playing = true;
    this.audio.play().catch(() => {});
  }

  pause(): void {
    this.playing = false;
    this.audio.pause();
  }

  seek(timeSec: number): void {
    this.audio.currentTime = timeSec;
    const t = Math.max(this.songStartSec, Math.min(this.songEndSec, timeSec));
    this.currentTimeMs = Math.max(0, (t - this.songStartSec) * 1000);
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

    this.buildBgCache();
    if (this.timeline.length) this.timeline = this.scaleTimeline(this.unscaleTimeline());
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
    if (!muted) this.audio.play().catch(() => {});
  }

  updateCinematicDirection(direction: CinematicDirection): void {
    this.data = { ...this.data, cinematic_direction: direction };
    if (!this.payload) return;
    this.payload = { ...this.payload, cinematic_direction: direction };
    this.buildChunkCache(this.payload);
    this.buildBgCache();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafHandle);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const tctx = this.textCanvas.getContext("2d", { alpha: true });
    if (tctx) tctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    // Only clear local reference, not the global cache
    this.chunks = new Map();
    this.timeline = [];
    this.bgCache = null;

    this.audio.pause();
    this.audio.src = "";
  }

  // ────────────────────────────────────────────────────────────
  // RAF loop
  // ────────────────────────────────────────────────────────────

  private tick = (timestamp: number): void => {
    if (this.destroyed) return;

    const deltaMs = Math.min(timestamp - (this.lastTimestamp || timestamp), 100);
    this.lastTimestamp = timestamp;

    // ALWAYS start frame with this exact sequence
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.update(deltaMs);
    this.draw();

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  private update(deltaMs: number): void {
    const t = this.audio.currentTime;
    const clamped = Math.max(this.songStartSec, Math.min(this.songEndSec, t));
    this.currentTimeMs = Math.max(0, (clamped - this.songStartSec) * 1000);

    this.fpsAccum.t += deltaMs;
    this.fpsAccum.frames += 1;
    if (this.fpsAccum.t >= 500) {
      this.fpsAccum.fps = (this.fpsAccum.frames * 1000) / this.fpsAccum.t;
      this.fpsAccum.t = 0;
      this.fpsAccum.frames = 0;
    }

    this.debugState = {
      ...this.debugState,
      time: clamped,
      fps: Math.round(this.fpsAccum.fps),
      wordCount: this.payload?.lines?.length ?? 0,
      perfTotal: deltaMs,
      perfBg: 0,
      perfText: 0,
      beatIntensity: 0,
      physGlow: 0,
      songProgress: this.songEndSec > this.songStartSec
        ? Math.max(0, Math.min(1, (clamped - this.songStartSec) / (this.songEndSec - this.songStartSec)))
        : 0,
      dirChapter: this.payload?.cinematic_direction?.chapters?.[0]?.title ?? "—",
      tensionStage: this.payload?.cinematic_direction?.tensionCurve?.[0]?.stage ?? "—",
    };
  }

  private draw(): void {
    const frame = this.getFrame(this.currentTimeMs);
    if (!frame) return;

    if (this.bgCache) this.ctx.drawImage(this.bgCache, 0, 0, this.width, this.height);

    this.ctx.translate(frame.cameraX, frame.cameraY);

    let drawCalls = 0;
    for (const chunk of frame.chunks) {
      if (!chunk.visible) continue;
      const obj = this.chunks.get(chunk.id);
      if (!obj) continue;

      this.ctx.globalAlpha = chunk.alpha;
      this.ctx.font = obj.font;
      this.ctx.fillStyle = obj.color;
      this.ctx.fillText(obj.text, chunk.x, chunk.y);
      drawCalls += 1;
    }

    this.ctx.globalAlpha = 1;
    this.debugState = { ...this.debugState, drawCalls };
  }

  // ────────────────────────────────────────────────────────────
  // Loading / caching helpers
  // ────────────────────────────────────────────────────────────

  private buildScenePayload(): ScenePayload {
    const lines = this.data.lyrics ?? [];
    const songStart = lines.length ? Math.max(0, (lines[0].start ?? 0) - 0.5) : 0;
    const songEnd = lines.length ? (lines[lines.length - 1].end ?? 0) + 1 : 0;

    return {
      lines,
      beat_grid: this.data.beat_grid,
      physics_spec: this.data.physics_spec,
      scene_manifest: this.data.scene_manifest ?? null,
      cinematic_direction: this.data.cinematic_direction ?? null,
      palette: this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"],
      lineBeatMap: [],
      songStart,
      songEnd,
    };
  }

  private buildChunkCache(payload: ScenePayload): void {
    console.log('[PLAYER] buildChunkCache entered — lines:', payload.lines.length);
    this.chunks.clear();

    // Use a throwaway offscreen canvas for measurement
    // so we never depend on the main canvas being sized
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 960;
    measureCanvas.height = 540;
    const measureCtx = measureCanvas.getContext('2d')!;

    const fontFamily = payload.cinematic_direction?.visualWorld?.typographyProfile?.fontFamily?.trim() || 'Montserrat';
    const baseFontPx = 36;
    const font = `${baseFontPx}px ${fontFamily}`;
    measureCtx.font = font;

    for (let i = 0; i < payload.lines.length; i++) {
      const text = payload.lines[i]?.text ?? '';
      const color = payload.palette?.[2] ?? '#ffffff';
      const width = measureCtx.measureText(text).width;

      this.chunks.set(String(i), {
        id: String(i),
        text,
        color,
        font,
        width,
      });
    }

    console.log('[PLAYER] buildChunkCache done — chunks:', this.chunks.size);
  }

  private buildBgCache(): void {
    const off = document.createElement("canvas");
    off.width = this.canvas.width;
    off.height = this.canvas.height;

    const offCtx = off.getContext("2d", { alpha: false });
    if (!offCtx) {
      this.bgCache = null;
      return;
    }

    const palette = this.payload?.palette ?? this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"];
    const grad = offCtx.createLinearGradient(0, 0, 0, off.height);
    grad.addColorStop(0, palette[0] || "#0a0a0a");
    grad.addColorStop(1, palette[1] || "#111111");
    offCtx.fillStyle = grad;
    offCtx.fillRect(0, 0, off.width, off.height);

    this.bgCache = off;
  }

  // ────────────────────────────────────────────────────────────
  // Timeline helpers
  // ────────────────────────────────────────────────────────────

  private getFrame(currentTimeMs: number): ScaledKeyframe | null {
    const t = this.timeline;
    if (!t.length) return null;

    let low = 0;
    let high = t.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (t[mid].timeMs < currentTimeMs) low = mid + 1;
      else high = mid - 1;
    }
    return t[Math.max(0, low - 1)] ?? t[0];
  }

  private scaleTimeline(raw: BakedTimeline): ScaledKeyframe[] {
    const sx = this.width / BASE_W;
    const sy = this.height / BASE_H;

    return raw.map((f) => ({
      timeMs: f.timeMs,
      beatIndex: f.beatIndex,
      cameraX: f.cameraX * sx,
      cameraY: f.cameraY * sy,
      chunks: f.chunks.map((c) => ({
        id: c.id,
        x: c.x * sx,
        y: c.y * sy,
        alpha: c.alpha,
        visible: c.visible,
      })),
    }));
  }

  // Used only so resize can rescale without rebaking.
  private unscaleTimeline(): BakedTimeline {
    const sx = this.width / BASE_W;
    const sy = this.height / BASE_H;

    return this.timeline.map((f) => ({
      timeMs: f.timeMs,
      beatIndex: f.beatIndex,
      cameraX: sx ? f.cameraX / sx : f.cameraX,
      cameraY: sy ? f.cameraY / sy : f.cameraY,
      chunks: f.chunks.map((c) => ({
        id: c.id,
        x: sx ? c.x / sx : c.x,
        y: sy ? c.y / sy : c.y,
        alpha: c.alpha,
        scale: 1,
        visible: c.visible,
      })),
    }));
  }
}
