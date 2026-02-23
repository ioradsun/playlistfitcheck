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
    glow: number;
    scale: number;
    fontSize?: number;
    color?: string;
    visible: boolean;
    entryOffsetY?: number;
    entryOffsetX?: number;
    entryScale?: number;
    exitOffsetY?: number;
    exitScale?: number;
  }>;
};

const BASE_W = 960;
const BASE_H = 540;
let globalBakeLock = false;
let globalBakePromise: Promise<void> | null = null;
let globalTimelineCache: ScaledKeyframe[] | null = null;
let globalChunkCache: Map<string, ChunkState> | null = null;
let globalHasCinematicDirection = false;
let globalSongStartSec = 0;
let globalSongEndSec = 0;


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
  private _hasLoggedDrawChunk = false;

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
  private bgCache2: HTMLCanvasElement | null = null;

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
    // Always clear cache on construction — component gates on full data
    globalBakePromise = null;
    globalTimelineCache = null;
    globalChunkCache = null;
    globalBakeLock = false;
    globalHasCinematicDirection = false;
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
  }

  // Compatibility with existing React shell
  async init(): Promise<void> {
    this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);

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
    this.buildBgCache();

    this.audio.currentTime = this.songStartSec;
    this.audio.play().catch(() => {});
    this.playing = true;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  // ────────────────────────────────────────────────────────────
  // Public API (React calls these)
  // ────────────────────────────────────────────────────────────

  async load(payload: ScenePayload, onProgress: (pct: number) => void): Promise<Map<string, ChunkState>> {
    try {
      this.payload = payload;
      this.songStartSec = payload.songStart;
      this.songEndSec = payload.songEnd;

      this.resize(this.canvas.offsetWidth || 960, this.canvas.offsetHeight || 540);
      this.buildChunkCache(payload);
      // Snapshot chunks NOW before the async yield — destroy() may replace this.chunks
      const chunkSnapshot = new Map(this.chunks);
      const baked = await bakeSceneChunked(payload, (p) => onProgress(Math.round(p * 100)));

      this.timeline = this.scaleTimeline(baked);
      this.buildBgCache();
      onProgress(100);
      return chunkSnapshot;
    } catch (err) {
      console.error('[PLAYER] load() error:', err);
      throw err;
    }
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
    this.bgCache2 = null;

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

    const duration = this.songEndSec - this.songStartSec;
    const songProgress = duration > 0 ? Math.max(0, Math.min(1, (clamped - this.songStartSec) / duration)) : 0;
    const cd = this.payload?.cinematic_direction;
    const chapters = cd?.chapters ?? [];
    const currentChapter = chapters.find(
      (ch: any) => songProgress >= (ch.startRatio ?? 0) && songProgress <= (ch.endRatio ?? 1)
    ) ?? chapters[0];
    const tensionCurve = (cd as any)?.tensionCurve ?? [];
    const currentTension = tensionCurve.find(
      (ts: any) => songProgress >= (ts.startRatio ?? 0) && songProgress <= (ts.endRatio ?? 1)
    ) ?? tensionCurve[0];
    const lines = this.payload?.lines ?? [];
    const activeLine = lines.find((l: any) => clamped >= l.start && clamped <= l.end);
    const climaxRatio = (cd as any)?.climax?.timeRatio ?? 0.75;
    const simulatedBeat = Math.max(0.1, 1 - Math.abs(songProgress - climaxRatio) * 2);
    const frame = this.getFrame(this.currentTimeMs);
    const visibleChunks = frame?.chunks.filter((c: any) => c.visible) ?? [];

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
      heat: (this.payload as any)?.physicsSpec?.params?.heat ?? 0,
      velocity: simulatedBeat * 0.5,
      wordCount: lines.length,
      effectKey: visibleChunks.length > 0 ? "baked" : "—",
      entryProgress: activeLine ? Math.min(1, (clamped - activeLine.start) / Math.max(0.1, activeLine.end - activeLine.start)) : 0,
      exitProgress: activeLine ? Math.max(0, 1 - (activeLine.end - clamped) / Math.max(0.1, activeLine.end - activeLine.start)) : 0,
      fontScale: frame?.cameraZoom ?? 1,
      scale: frame?.cameraZoom ?? 1,
      zoom: frame?.cameraZoom ?? 1,
      lineColor: (visibleChunks[0] as any)?.color ?? "#ffffff",
      particleSystem: this.payload?.scene_manifest?.particleConfig?.system ?? "—",
      particleDensity: this.payload?.scene_manifest?.particleConfig?.density ?? 0,
      particleSpeed: this.payload?.scene_manifest?.particleConfig?.speed ?? 0,
      dirThesis: (cd as any)?.thesis ?? "—",
      dirChapter: currentChapter?.title ?? "—",
      dirChapterProgress: currentChapter ? Math.max(0, Math.min(1, (songProgress - (currentChapter.startRatio ?? 0)) / Math.max(0.001, (currentChapter.endRatio ?? 1) - (currentChapter.startRatio ?? 0)))) : 0,
      dirIntensity: simulatedBeat,
      dirBgDirective: currentChapter?.backgroundDirective ?? "—",
      dirLightBehavior: currentChapter?.lightBehavior ?? "—",
      cameraDistance: (currentChapter as any)?.cameraDistance ?? "—",
      cameraMovement: (currentChapter as any)?.cameraMovement ?? "—",
      tensionStage: currentTension?.stage ?? "—",
      tensionMotion: currentTension?.motionIntensity ?? 0,
      tensionParticles: currentTension?.particleDensity ?? 0,
      backgroundSystem: this.payload?.scene_manifest?.backgroundSystem ?? "—",
      lineHeroWord: activeLine?.text?.split(" ")[0] ?? "—",
      lineIntent: currentChapter?.emotionalArc ?? "—",
    };
  }

  private draw(): void {
    const frame = this.getFrame(this.currentTimeMs);
    if (!frame) return;


    if (this.bgCache) {
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(this.bgCache, 0, 0, this.width, this.height);
    }

    // Blend overlay toward next chapter color
    if (frame.bgBlend > 0 && this.bgCache2) {
      this.ctx.globalAlpha = (frame.bgBlend % 1);
      this.ctx.drawImage(this.bgCache2, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }

    // Apply camera drift — subtle only, no zoom transform
    this.ctx.translate(frame.cameraX ?? 0, frame.cameraY ?? 0);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const cx = this.width / 2;
    const cy = this.height / 2;

    let drawCalls = 0;
    for (const chunk of frame.chunks) {
      if (!chunk.visible) continue;

      {
        const drawScale = (chunk.entryScale ?? 1) * (chunk.exitScale ?? 1);
        const zoom = frame.cameraZoom ?? 1.0;
        const fontSize = chunk.fontSize ?? 36;
        console.log('[DRAW] chunk:', chunk.id,
          'entryScale:', chunk.entryScale,
          'exitScale:', chunk.exitScale,
          'entryOffsetY:', chunk.entryOffsetY,
          'drawScale being used:', drawScale,
          'fontSize:', fontSize,
          'zoom:', zoom,
          'final px:', Math.round(fontSize * zoom * drawScale));
      }
      const obj = this.chunks.get(chunk.id);
      if (!obj) continue;

      const drawX = cx + (chunk.entryOffsetX ?? 0);
      const drawY = cy + (chunk.entryOffsetY ?? 0) + (chunk.exitOffsetY ?? 0);
      const drawScale = (chunk.entryScale ?? 1) * (chunk.exitScale ?? 1);

      const zoom = frame.cameraZoom ?? 1.0;
      const fontSize = chunk.fontSize ?? 36;
      const zoomedFont = obj.font.replace(
        /(\d+(\.\d+)?)px/,
        `${Math.round(fontSize * zoom * drawScale)}px`
      );

      this.ctx.globalAlpha = chunk.alpha;
      this.ctx.fillStyle = chunk.color ?? obj.color;
      this.ctx.font = zoomedFont;

      if (chunk.glow > 0) {
        this.ctx.shadowColor = chunk.color ?? '#ffffff';
        this.ctx.shadowBlur = chunk.glow * 32;
      }

      this.ctx.fillText(obj.text, drawX, drawY);
      this.ctx.shadowBlur = 0;
      drawCalls += 1;
    }

    // Particle pass — drawn after text, before reset
    if (frame.particles?.length) {
      for (const p of frame.particles) {
        this.ctx.globalAlpha = p.alpha;
        this.ctx.fillStyle = this.payload?.cinematic_direction?.visualWorld?.palette?.[1] ?? '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(
          p.x * this.width,
          p.y * this.height,
          p.size,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
    }

    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
    this.debugState = { ...this.debugState, drawCalls };
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
      beat_grid: this.data.beat_grid,
      physics_spec: this.data.physics_spec,
      scene_manifest: this.data.scene_manifest ?? null,
      cinematic_direction: this.data.cinematic_direction ?? null,
      palette: this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"],
      lineBeatMap: [],
      songStart,
      songEnd,
    };

    return payload;
  }

  private buildChunkCache(payload: ScenePayload): void {
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
  }

  private buildBgCache(): void {
    const buildCanvas = (dominantColor: string): HTMLCanvasElement | null => {
      const off = document.createElement("canvas");
      off.width = this.canvas.width;
      off.height = this.canvas.height;

      const offCtx = off.getContext("2d", { alpha: false });
      if (!offCtx) return null;

      const palette = this.payload?.palette ?? this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"];
      const sceneManifest = this.payload?.scene_manifest;

      const grad = offCtx.createLinearGradient(0, 0, 0, off.height);
      grad.addColorStop(0, dominantColor || "#0a0a0a");
      grad.addColorStop(0.6, palette[1] || "#111827");
      grad.addColorStop(1, palette[2] ? `${palette[2]}33` : "#0a0a0a");
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, off.width, off.height);

      const env = ((sceneManifest as any)?.environment ?? "").toLowerCase();
      if (env.includes("ocean") || env.includes("water") || env.includes("surf")) {
        this.drawWaveBands(offCtx, off.width, off.height, palette);
      } else if (env.includes("city") || env.includes("urban") || env.includes("street")) {
        this.drawLightStreaks(offCtx, off.width, off.height, palette);
      } else if (env.includes("space") || env.includes("cosmos") || env.includes("star")) {
        this.drawStarField(offCtx, off.width, off.height, palette);
      } else if (env.includes("forest") || env.includes("nature") || env.includes("wood")) {
        this.drawOrganicShapes(offCtx, off.width, off.height, palette);
      } else {
        this.drawRadialGlow(offCtx, off.width, off.height, palette);
      }

      const vignette = offCtx.createRadialGradient(
        off.width / 2, off.height / 2, off.height * 0.3,
        off.width / 2, off.height / 2, off.height * 0.9,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.65)");
      offCtx.fillStyle = vignette;
      offCtx.fillRect(0, 0, off.width, off.height);

      return off;
    };

    const palette = this.payload?.palette ?? this.data.palette ?? ["#0a0a0a", "#111111", "#ffffff"];
    this.bgCache = buildCanvas(palette[0] || "#0a0a0a");
    this.bgCache2 = buildCanvas(palette[1] || "#111111");
  }

  private drawWaveBands(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    ctx.save();
    for (let i = 0; i < 6; i += 1) {
      const y = (height / 6) * i + height * 0.08;
      ctx.globalAlpha = 0.08 + i * 0.01;
      ctx.fillStyle = palette[i % palette.length] || palette[1] || "#1f2937";
      ctx.fillRect(-width * 0.1, y, width * 1.2, height * 0.07);
    }
    ctx.restore();
  }

  private drawLightStreaks(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    ctx.save();
    for (let i = 0; i < 16; i += 1) {
      const x = (width / 16) * i + ((i % 3) - 1) * 8;
      ctx.globalAlpha = 0.08 + (i % 4) * 0.02;
      ctx.fillStyle = palette[(i + 1) % palette.length] || "#9ca3af";
      ctx.fillRect(x, 0, Math.max(2, width * 0.005), height);
    }
    ctx.restore();
  }

  private drawStarField(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    ctx.save();
    for (let i = 0; i < 90; i += 1) {
      const x = (width * ((i * 37) % 100)) / 100;
      const y = (height * ((i * 53) % 100)) / 100;
      const size = (i % 3) + 1;
      ctx.globalAlpha = 0.08 + (i % 5) * 0.02;
      ctx.fillStyle = palette[(i + 2) % palette.length] || "#f3f4f6";
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  private drawOrganicShapes(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    for (let i = 0; i < 7; i += 1) {
      ctx.rotate(0.35);
      ctx.globalAlpha = 0.1 + i * 0.01;
      ctx.fillStyle = palette[(i + 1) % palette.length] || "#065f46";
      ctx.fillRect(-width * 0.45, -height * 0.06, width * 0.9, height * 0.12);
    }
    ctx.restore();
  }

  private drawRadialGlow(ctx: CanvasRenderingContext2D, width: number, height: number, palette: string[]): void {
    const glow = ctx.createRadialGradient(width / 2, height / 2, height * 0.08, width / 2, height / 2, height * 0.7);
    glow.addColorStop(0, palette[2] || "rgba(255,255,255,0.2)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
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
      bgBlend: f.bgBlend,
      particles: f.particles,
      cameraX: f.cameraX * sx,
      cameraY: f.cameraY * sy,
      cameraZoom: f.cameraZoom,
      chunks: f.chunks.map((c) => ({
        id: c.id,
        x: c.x * sx,
        y: c.y * sy,
        alpha: c.alpha,
        glow: c.glow,
        scale: c.scale,
        fontSize: c.fontSize,
        color: c.color,
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
      bgBlend: f.bgBlend,
      particles: f.particles,
      cameraX: sx ? f.cameraX / sx : f.cameraX,
      cameraY: sy ? f.cameraY / sy : f.cameraY,
      cameraZoom: f.cameraZoom,
      chunks: f.chunks.map((c) => ({
        id: c.id,
        x: sx ? c.x / sx : c.x,
        y: sy ? c.y / sy : c.y,
        alpha: c.alpha,
        glow: c.glow,
        scale: c.scale,
        visible: c.visible,
        fontSize: c.fontSize ?? 36,
        color: c.color ?? "#ffffff",
        entryOffsetY: c.entryOffsetY ?? 0,
        entryOffsetX: c.entryOffsetX ?? 0,
        entryScale: c.entryScale ?? 1,
        exitOffsetY: c.exitOffsetY ?? 0,
        exitScale: c.exitScale ?? 1,
      })),
    }));
  }
}
