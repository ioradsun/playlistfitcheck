import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { CinematicDirection } from "@/types/CinematicDirection";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ConstellationNode } from "@/hooks/useHookCanvas";
import type { SceneManifest } from "@/engine/SceneManifest";
import { bakeSceneChunked, type BakedTimeline, type ScenePayload } from "@/lib/lyricSceneBaker";

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
  artist_dna: unknown;
  seed: string;
  scene_manifest: SceneManifest | null;
  cinematic_direction: CinematicDirection | null;
}

export interface LiveDebugState {
  beatIntensity: number; physGlow: number;
  physicsActive: boolean; wordCount: number; heat: number; velocity: number; rotation: number; lastBeatForce: number;
  effectKey: string; entryProgress: number; exitProgress: number; activeMod: string | null;
  fontScale: number; scale: number; lineColor: string; isHookLine: boolean; repIndex: number; repTotal: number;
  particleSystem: string; particleDensity: number; particleSpeed: number; particleCount: number; songSection: string;
  xOffset: number; yBase: number; xNudge: number; shake: number;
  backgroundSystem: string; imageLoaded: boolean; zoom: number; vignetteIntensity: number; songProgress: number;
  dirThesis: string; dirChapter: string; dirChapterProgress: number; dirIntensity: number; dirBgDirective: string; dirLightBehavior: string;
  symbolPrimary: string; symbolSecondary: string; symbolState: string;
  cameraDistance: string; cameraMovement: string; tensionStage: string; tensionMotion: number; tensionParticles: number; tensionTypo: number;
  wordDirectiveWord: string; wordDirectiveKinetic: string; wordDirectiveElemental: string; wordDirectiveEmphasis: number; wordDirectiveEvolution: string;
  lineHeroWord: string; lineEntry: string; lineExit: string; lineIntent: string; shotType: string; shotDescription: string;
  evolutionWord: string; evolutionCount: number; evolutionScale: number; evolutionGlow: number; evolutionBubbles: number; evolutionSinkPx: number;
  fps: number; drawCalls: number; cacheHits: number;
  perfBg: number; perfSymbol: number; perfParticlesFar: number; perfText: number; perfOverlays: number; perfNear: number; perfTotal: number;
  time: number;
}

export const DEFAULT_DEBUG_STATE: LiveDebugState = {
  time: 0, beatIntensity: 0, physGlow: 0,
  physicsActive: false, wordCount: 0, heat: 0, velocity: 0, rotation: 0, lastBeatForce: 0,
  effectKey: "—", entryProgress: 0, exitProgress: 0, activeMod: null,
  fontScale: 1, scale: 1, lineColor: "#ffffff", isHookLine: false, repIndex: 0, repTotal: 0,
  particleSystem: "none", particleDensity: 0, particleSpeed: 0, particleCount: 0, songSection: "intro",
  xOffset: 0, yBase: 0.5, xNudge: 0, shake: 0,
  backgroundSystem: "minimal", imageLoaded: false, zoom: 1, vignetteIntensity: 0.25, songProgress: 0,
  dirThesis: "—", dirChapter: "—", dirChapterProgress: 0, dirIntensity: 0, dirBgDirective: "—", dirLightBehavior: "—",
  symbolPrimary: "—", symbolSecondary: "—", symbolState: "—",
  cameraDistance: "Medium", cameraMovement: "baked", tensionStage: "—", tensionMotion: 0, tensionParticles: 0, tensionTypo: 0,
  wordDirectiveWord: "", wordDirectiveKinetic: "—", wordDirectiveElemental: "—", wordDirectiveEmphasis: 0, wordDirectiveEvolution: "—",
  lineHeroWord: "", lineEntry: "show", lineExit: "hide", lineIntent: "—", shotType: "Static", shotDescription: "Baked timeline",
  evolutionWord: "—", evolutionCount: 0, evolutionScale: 1, evolutionGlow: 0, evolutionBubbles: 0, evolutionSinkPx: 0,
  fps: 60, drawCalls: 0, cacheHits: 0,
  perfBg: 0, perfSymbol: 0, perfParticlesFar: 0, perfText: 0, perfOverlays: 0, perfNear: 0, perfTotal: 0,
};

type MeasuredLine = { text: string; width: number; fontPx: number; lineHeight: number };

export class LyricDancePlayer {
  private readonly data: LyricDanceData;
  private readonly bgCanvas: HTMLCanvasElement;
  private readonly textCanvas: HTMLCanvasElement;
  private readonly container: HTMLDivElement;

  private bgCtx!: CanvasRenderingContext2D;
  private textCtx!: CanvasRenderingContext2D;
  private bgCache: HTMLCanvasElement | null = null;

  private timeline: BakedTimeline = [];
  private timelineReady = false;
  private baking = false;

  private measuredLines: MeasuredLine[] = [];
  private resizeHandler: () => void;
  private rafId = 0;
  private destroyed = false;

  private dpr = 1;
  private width = 0;
  private height = 0;

  private songStart = 0;
  private songEnd = 0;
  private songDuration = 1;

  private lastFrameAt = 0;
  private frameCount = 0;

  audio: HTMLAudioElement;
  constellationNodes: ConstellationNode[] = [];
  debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };

  private cinematicDirection: CinematicDirection | null;

  constructor(data: LyricDanceData, bgCanvas: HTMLCanvasElement, textCanvas: HTMLCanvasElement, container: HTMLDivElement) {
    this.data = data;
    this.bgCanvas = bgCanvas;
    this.textCanvas = textCanvas;
    this.container = container;
    this.cinematicDirection = data.cinematic_direction;

    this.songStart = data.lyrics.length > 0 ? Math.max(0, data.lyrics[0].start - 0.5) : 0;
    this.songEnd = data.lyrics.length > 0 ? data.lyrics[data.lyrics.length - 1].end + 1 : this.songStart + 1;
    this.songDuration = Math.max(0.001, this.songEnd - this.songStart);

    this.audio = new Audio(data.audio_url);
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.muted = true;
    this.audio.currentTime = this.songStart;

    this.resizeHandler = () => {
      this.syncCanvasSize();
      this.measureTextLayouts();
      this.renderBackgroundCache();
      this.renderFrame();
    };
  }

  init(): void {
    const bgCtx = this.bgCanvas.getContext("2d", { alpha: false });
    const textCtx = this.textCanvas.getContext("2d", { alpha: true });
    if (!bgCtx || !textCtx) throw new Error("Canvas context unavailable");

    this.bgCtx = bgCtx;
    this.textCtx = textCtx;

    this.syncCanvasSize();
    this.measureTextLayouts();
    this.renderBackgroundCache();

    window.addEventListener("resize", this.resizeHandler);

    this.bakeTimeline();
    this.startLoop();
  }

  play(): void {
    void this.audio.play().catch(() => undefined);
  }

  pause(): void {
    this.audio.pause();
  }

  seek(timeSec: number): void {
    const clamped = Math.max(this.songStart, Math.min(this.songEnd, timeSec));
    this.audio.currentTime = clamped;
    this.renderFrame();
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
  }

  updateCinematicDirection(direction: CinematicDirection): void {
    this.cinematicDirection = direction;
    this.renderBackgroundCache();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.resizeHandler);

    this.audio.pause();
    this.audio.src = "";
    this.timeline = [];
    this.timelineReady = false;
  }

  private buildPayload(): ScenePayload {
    return {
      lines: this.data.lyrics,
      beat_grid: this.data.beat_grid,
      physics_spec: this.data.physics_spec,
      scene_manifest: this.data.scene_manifest,
      cinematic_direction: this.cinematicDirection,
      palette: this.data.palette,
      lineBeatMap: [],
      songStart: this.songStart,
      songEnd: this.songEnd,
    };
  }

  private bakeTimeline(): void {
    if (this.baking) return;
    this.baking = true;
    this.timelineReady = false;

    void bakeSceneChunked(this.buildPayload(), () => undefined)
      .then((timeline) => {
        if (this.destroyed) return;
        this.timeline = timeline;
        this.timelineReady = true;
      })
      .finally(() => {
        this.baking = false;
      });
  }

  private startLoop(): void {
    if (this.rafId) return;
    const tick = () => {
      if (this.destroyed) return;
      this.renderFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private syncCanvasSize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    if (width === this.width && height === this.height && dpr === this.dpr) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.bgCanvas.width = Math.floor(width * dpr);
    this.bgCanvas.height = Math.floor(height * dpr);
    this.bgCanvas.style.width = `${width}px`;
    this.bgCanvas.style.height = `${height}px`;

    this.textCanvas.width = Math.floor(width * dpr);
    this.textCanvas.height = Math.floor(height * dpr);
    this.textCanvas.style.width = `${width}px`;
    this.textCanvas.style.height = `${height}px`;
  }

  private measureTextLayouts(): void {
    const basePx = Math.max(24, Math.min(56, this.width * 0.06));
    this.measuredLines = this.data.lyrics.map((line) => {
      this.textCtx.font = `700 ${basePx}px Inter, system-ui, sans-serif`;
      const width = this.textCtx.measureText(line.text).width;
      return { text: line.text, width, fontPx: basePx, lineHeight: basePx * 1.1 };
    });
  }

  private renderBackgroundCache(): void {
    if (this.width <= 0 || this.height <= 0) return;

    const cache = document.createElement("canvas");
    cache.width = this.width;
    cache.height = this.height;

    const ctx = cache.getContext("2d", { alpha: false });
    if (!ctx) {
      this.bgCache = null;
      return;
    }

    const p0 = this.data.palette[0] ?? "#0b0b0f";
    const p1 = this.data.palette[1] ?? "#1f2937";
    const p2 = this.data.palette[2] ?? "#111827";

    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, p0);
    gradient.addColorStop(0.5, p1);
    gradient.addColorStop(1, p2);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const overlayAlpha = this.cinematicDirection ? 0.12 : 0.06;
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);

    this.bgCache = cache;
  }

  private frameForTime(timeSec: number) {
    if (!this.timelineReady || this.timeline.length === 0) return null;

    const relMs = Math.max(0, (timeSec - this.songStart) * 1000);
    const maxIndex = this.timeline.length - 1;
    let lo = 0;
    let hi = maxIndex;

    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.timeline[mid].timeMs <= relMs) lo = mid;
      else hi = mid - 1;
    }

    return this.timeline[lo] ?? null;
  }

  private renderFrame(): void {
    if (this.destroyed || !this.bgCtx || !this.textCtx) return;

    this.syncCanvasSize();

    const frameStart = performance.now();

    this.bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bgCtx.clearRect(0, 0, this.width, this.height);
    this.textCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.textCtx.clearRect(0, 0, this.width, this.height);

    if (this.bgCache) {
      this.bgCtx.globalAlpha = 1;
      this.bgCtx.drawImage(this.bgCache, 0, 0, this.width, this.height);
    }

    if (!this.timelineReady || this.timeline.length === 0) {
      this.updateDebug(frameStart, 0, 0, 0, this.audio.currentTime, null);
      return;
    }

    const frame = this.frameForTime(this.audio.currentTime);
    if (!frame) {
      this.updateDebug(frameStart, 0, 0, 0, this.audio.currentTime, null);
      return;
    }

    const textStart = performance.now();
    let wordCount = 0;

    for (const chunk of frame.chunks) {
      if (!chunk.visible || chunk.alpha <= 0) continue;
      const idx = Number.parseInt(chunk.id, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= this.measuredLines.length) continue;
      const line = this.measuredLines[idx];
      wordCount += line.text.trim().split(/\s+/).filter(Boolean).length;

      const drawX = chunk.x - line.width * 0.5 + frame.cameraX;
      const drawY = chunk.y + frame.cameraY;

      this.textCtx.globalAlpha = chunk.alpha;
      this.textCtx.font = `700 ${line.fontPx * chunk.scale}px Inter, system-ui, sans-serif`;
      this.textCtx.fillStyle = "#ffffff";
      this.textCtx.fillText(line.text, drawX, drawY);
    }

    this.textCtx.globalAlpha = 1;
    const textPerf = performance.now() - textStart;

    this.updateDebug(frameStart, textPerf, frame.beatIndex, wordCount, this.audio.currentTime, frame);
  }

  private updateDebug(
    frameStart: number,
    perfText: number,
    beatIndex: number,
    wordCount: number,
    timeSec: number,
    frame: BakedTimeline[number] | null,
  ): void {
    this.frameCount += 1;
    const now = performance.now();
    const dt = this.lastFrameAt > 0 ? now - this.lastFrameAt : 16;
    this.lastFrameAt = now;

    const fps = dt > 0 ? 1000 / dt : 60;
    const progress = Math.max(0, Math.min(1, (timeSec - this.songStart) / this.songDuration));
    const beatIntensity = this.data.beat_grid.beats.length > 0 ? (beatIndex % 4 === 0 ? 1 : 0.5) : 0;

    this.debugState = {
      ...this.debugState,
      time: timeSec,
      beatIntensity,
      physGlow: beatIntensity,
      wordCount,
      lineColor: "#ffffff",
      particleCount: this.constellationNodes.length,
      songProgress: progress,
      xOffset: frame?.cameraX ?? 0,
      yBase: frame?.cameraY ?? 0,
      dirChapter: this.cinematicDirection ? "active" : "none",
      tensionStage: this.cinematicDirection ? "guided" : "neutral",
      fps,
      perfBg: 0,
      perfText,
      perfTotal: performance.now() - frameStart,
      imageLoaded: this.bgCache !== null,
      drawCalls: frame ? 1 : 0,
      cacheHits: this.bgCache ? 1 : 0,
    };
  }
}
