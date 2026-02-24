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
  words?: Array<{ word: string; start: number; end: number }>;
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
    scaleX?: number;
    scaleY?: number;
    skewX?: number;
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
let globalSessionKey = '';


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
    // Invalidate cache if song changed (survives HMR)
    const sessionKey = `v4-${data.id}-${data.words?.length ?? 0}`;
    if (globalSessionKey !== sessionKey) {
      globalSessionKey = sessionKey;
      globalBakePromise = null;
      globalTimelineCache = null;
      globalChunkCache = null;
      globalBakeLock = false;
      globalHasCinematicDirection = false;
    }
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
    this.displayWidth = this.width;
    this.displayHeight = this.height;

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
      console.log('[EXPORT] audio ended event — stopping export');
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
    this.bgCaches = [];
    this.bgCacheCount = 0;

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

    this.drawBackground(frame);

    // Apply camera drift — subtle only, no zoom transform
    this.ctx.translate(frame.cameraX ?? 0, frame.cameraY ?? 0);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    let drawCalls = 0;
    for (const chunk of frame.chunks) {
      if (!chunk.visible) continue;

      const obj = this.chunks.get(chunk.id);
      if (!obj) continue;

      const drawX = chunk.x;
      const drawY = chunk.y;
      const zoom = frame.cameraZoom ?? 1.0;
      const fontSize = chunk.fontSize ?? 36;
      const zoomedFont = obj.font.replace(
        /(\d+(\.\d+)?)px/,
        `${Math.round(fontSize * zoom)}px`
      );
      const sx = chunk.scaleX ?? chunk.scale ?? (chunk.entryScale ?? 1) * (chunk.exitScale ?? 1);
      const sy = chunk.scaleY ?? chunk.scale ?? (chunk.entryScale ?? 1) * (chunk.exitScale ?? 1);

      this.ctx.globalAlpha = chunk.alpha;
      this.ctx.fillStyle = chunk.color ?? obj.color;
      this.ctx.font = zoomedFont;

      if (chunk.glow > 0) {
        this.ctx.shadowColor = chunk.color ?? '#ffffff';
        this.ctx.shadowBlur = chunk.glow * 32;
      }

      this.ctx.save();
      this.ctx.translate(drawX, drawY);
      this.ctx.transform(1, 0, Math.tan(((chunk.skewX ?? 0) * Math.PI) / 180), 1, 0, 0);
      this.ctx.scale(sx, sy);
      this.ctx.fillText(obj.text, 0, 0);
      this.ctx.restore();
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

    const typo = payload.cinematic_direction?.visualWorld?.typographyProfile;
    const fontFamily = typo?.fontFamily?.trim() || 'Montserrat';
    const fontWeight = typo?.fontWeight || 800;
    const textTransform = typo?.textTransform || 'uppercase';
    const baseFontPx = 42;
    const font = `${fontWeight} ${baseFontPx}px ${fontFamily}`;
    measureCtx.font = font;

    const words = payload.words ?? [];
    const lines = payload.lines ?? [];

    if (words.length > 0) {
      const lineWordCounters: Record<number, number> = {};

      for (const w of words) {
        const lineIndex = lines.findIndex(
          (l) => w.start >= (l.start ?? 0) && w.start < (l.end ?? 9999),
        );
        const li = Math.max(0, lineIndex);
        const wi = lineWordCounters[li] ?? 0;
        lineWordCounters[li] = wi + 1;

        const key = `${li}-${wi}`;
        const displayWord = textTransform === 'uppercase'
          ? w.word.toUpperCase()
          : w.word;

        this.chunks.set(key, {
          id: key,
          text: displayWord,
          color: '#ffffff',
          font,
          width: measureCtx.measureText(displayWord).width,
        });
      }
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const rawText = lines[i]?.text ?? '';
      const text = textTransform === 'uppercase'
        ? rawText.toUpperCase()
        : rawText;
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
    const chapters = this.payload?.cinematic_direction?.chapters ?? [];
    const palette = this.payload?.cinematic_direction?.visualWorld?.palette
      ?? this.payload?.palette
      ?? ['#0a0a0a', '#111827', '#1a2a4a'];
    const backgroundSystem = this.payload?.cinematic_direction?.visualWorld?.backgroundSystem ?? 'default';

    const count = Math.max(1, chapters.length);
    this.bgCaches = [];

    for (let ci = 0; ci < count; ci++) {
      const chapter = chapters[ci];
      const off = document.createElement('canvas');
      off.width = this.width;
      off.height = this.height;
      const ctx = off.getContext('2d');
      if (!ctx) continue;

      const dominantColor = chapter?.dominantColor ?? palette[ci % palette.length] ?? '#0a0a0a';
      const accentColor = palette[1] ?? '#FFD700';
      const bgDirective = chapter?.backgroundDirective?.toLowerCase() ?? '';
      const intensity = chapter?.emotionalIntensity ?? 0.5;

      const grad = ctx.createLinearGradient(0, 0, 0, off.height);
      grad.addColorStop(0, this.darken(dominantColor, 0.08));
      grad.addColorStop(0.5, this.darken(dominantColor, 0.06));
      grad.addColorStop(1, this.darken(dominantColor, 0.07));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, off.width, off.height);

      if (backgroundSystem === 'storm' || bgDirective.includes('storm') || bgDirective.includes('cloud')) {
        this.drawStormAtmosphere(ctx, off.width, off.height, dominantColor, accentColor, intensity);
      } else if (backgroundSystem === 'cosmic' || bgDirective.includes('space') || bgDirective.includes('star')) {
        this.drawCosmicAtmosphere(ctx, off.width, off.height, dominantColor, accentColor, intensity);
      } else if (backgroundSystem === 'intimate' || bgDirective.includes('warm') || bgDirective.includes('soft')) {
        this.drawIntimateAtmosphere(ctx, off.width, off.height, dominantColor, accentColor, intensity);
      } else if (bgDirective.includes('gold') || bgDirective.includes('light floods')) {
        this.drawGoldenAtmosphere(ctx, off.width, off.height, dominantColor, accentColor, intensity);
      } else {
        this.drawRadialGlow(ctx, off.width, off.height, [dominantColor, accentColor]);
      }

      this.drawVignette(ctx, off.width, off.height, intensity);
      this.bgCaches.push(off);
    }

    this.bgCacheCount = this.bgCaches.length;
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
    nebula.addColorStop(0, `${accent}12`);
    nebula.addColorStop(1, 'transparent');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private drawIntimateAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, dominant: string, accent: string, intensity: number): void {
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
    glow.addColorStop(0, `${accent}14`);
    glow.addColorStop(0.5, `${dominant}08`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const y = h * (0.3 + i * 0.2);
      const band = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      band.addColorStop(0, 'transparent');
      band.addColorStop(0.5, `${accent}08`);
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
      beam.addColorStop(0, `${accent}25`);
      beam.addColorStop(0.4, `${accent}10`);
      beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      ctx.fillRect(x - w * 0.05, 0, w * 0.15, h);
    }
    const bloom = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.35);
    bloom.addColorStop(0, `${accent}20`);
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

  private drawBackground(frame: ScaledKeyframe): void {
    if (this.bgCaches.length === 0) return;

    const bgBlend = frame.bgBlend ?? 0;
    const totalChapters = this.bgCacheCount;
    const chapterProgress = bgBlend * (totalChapters - 1);
    const chapterIdx = Math.floor(chapterProgress);
    const chapterFraction = chapterProgress - chapterIdx;

    const currentBg = this.bgCaches[Math.min(chapterIdx, totalChapters - 1)];
    const nextBg = this.bgCaches[Math.min(chapterIdx + 1, totalChapters - 1)];

    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(currentBg, 0, 0, this.width, this.height);

    if (chapterFraction > 0 && nextBg !== currentBg) {
      this.ctx.globalAlpha = chapterFraction;
      this.ctx.drawImage(nextBg, 0, 0, this.width, this.height);
      this.ctx.globalAlpha = 1;
    }
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
        scaleX: c.scaleX,
        scaleY: c.scaleY,
        skewX: c.skewX,
        fontSize: c.fontSize,
        color: c.color,
        visible: c.visible,
        entryOffsetY: c.entryOffsetY,
        entryOffsetX: c.entryOffsetX,
        entryScale: c.entryScale,
        exitOffsetY: c.exitOffsetY,
        exitScale: c.exitScale,
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
        scaleX: c.scaleX ?? c.scale,
        scaleY: c.scaleY ?? c.scale,
        skewX: c.skewX ?? 0,
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
