/**
 * LyricDancePlayer — Imperative render engine for the Lyric Dance feature.
 *
 * Owns: canvases, audio, physics, particles, direction, rAF loop.
 * React never touches the internals — one useEffect mounts/unmounts this.
 */

import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { getSymbolStateForProgress } from "@/engine/BackgroundDirector";
import { renderBackground, renderParticles, type BackgroundState, type ParticleState } from "@/engine/renderFrame";
import { renderText, type TextState } from "@/engine/renderText";
import { ParticleEngine } from "@/engine/ParticleEngine";
import type { SceneManifest } from "@/engine/SceneManifest";
import { animationResolver } from "@/engine/AnimationResolver";
import { deriveCanvasManifest } from "@/engine/deriveCanvasManifest";
import { DirectionInterpreter, ensureFullTensionCurve } from "@/engine/DirectionInterpreter";
import { buildWordPlan, getActiveLineIndexMonotonic, getNextStartAfterMonotonic, type WordPlan } from "@/engine/precomputeWordPlan";
import type { CinematicDirection, TensionStage } from "@/types/CinematicDirection";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import { renderSymbol } from "@/engine/SymbolRenderer";
import * as WordClassifier from "@/engine/WordClassifier";

// ─── Types ──────────────────────────────────────────────────────────

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

interface CollisionBox { id: string; x: number; y: number; w: number; h: number; }
interface SpatialGrid { cellSize: number; buckets: Map<string, number[]>; }

function intersectsAABB(a: CollisionBox, b: CollisionBox): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}
function resolveAABBCollision(a: CollisionBox, b: CollisionBox, strength: number): void {
  const axC = a.x + a.w * 0.5, ayC = a.y + a.h * 0.5;
  const bxC = b.x + b.w * 0.5, byC = b.y + b.h * 0.5;
  const oX = (a.w + b.w) * 0.5 - Math.abs(axC - bxC);
  const oY = (a.h + b.h) * 0.5 - Math.abs(ayC - byC);
  if (oX <= 0 || oY <= 0) return;
  if (oX < oY) { a.x += (axC < bxC ? -1 : 1) * oX * strength; }
  else { a.y += (ayC < byC ? -1 : 1) * oY * strength; }
}
function gridKey(gx: number, gy: number) { return `${gx}:${gy}`; }

function hexToRgbString(hex: string): string {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return `${parseInt(safe.slice(1, 3), 16)},${parseInt(safe.slice(3, 5), 16)},${parseInt(safe.slice(5, 7), 16)}`;
}

function getSongSection(progress: number): string {
  if (progress < 0.08) return "intro";
  if (progress < 0.33) return "verse";
  if (progress < 0.6) return "chorus";
  if (progress < 0.75) return "bridge";
  return "outro";
}

const distanceToZoom: Record<string, number> = {
  ExtremeWide: 0.7, Wide: 0.85, MediumWide: 0.9, Medium: 1.0,
  MediumClose: 1.1, Close: 1.2, ExtremeClose: 1.5,
};

export const DEFAULT_DEBUG_STATE: LiveDebugState = {
  time: 0, beatIntensity: 0, physGlow: 0,
  physicsActive: false, wordCount: 0, heat: 0, velocity: 0, rotation: 0, lastBeatForce: 0,
  effectKey: "—", entryProgress: 0, exitProgress: 0, activeMod: null,
  fontScale: 1, scale: 1, lineColor: "#ffffff", isHookLine: false, repIndex: 0, repTotal: 0,
  particleSystem: "none", particleDensity: 0, particleSpeed: 0, particleCount: 0, songSection: "intro",
  xOffset: 0, yBase: 0.5, xNudge: 0, shake: 0,
  backgroundSystem: "—", imageLoaded: false, zoom: 1, vignetteIntensity: 0, songProgress: 0,
  dirThesis: "—", dirChapter: "—", dirChapterProgress: 0, dirIntensity: 0, dirBgDirective: "—", dirLightBehavior: "—",
  symbolPrimary: "—", symbolSecondary: "—", symbolState: "—",
  cameraDistance: "Wide", cameraMovement: "—", tensionStage: "—", tensionMotion: 0, tensionParticles: 0, tensionTypo: 0,
  wordDirectiveWord: "", wordDirectiveKinetic: "—", wordDirectiveElemental: "—", wordDirectiveEmphasis: 0, wordDirectiveEvolution: "—",
  lineHeroWord: "", lineEntry: "fades", lineExit: "fades", lineIntent: "—", shotType: "FloatingInWorld", shotDescription: "—",
  evolutionWord: "—", evolutionCount: 0, evolutionScale: 1, evolutionGlow: 0, evolutionBubbles: 0, evolutionSinkPx: 0,
  fps: 60, drawCalls: 0, cacheHits: 0,
  perfBg: 0, perfSymbol: 0, perfParticlesFar: 0, perfText: 0, perfOverlays: 0, perfNear: 0, perfTotal: 0,
};

// ─── Player Class ───────────────────────────────────────────────────

export class LyricDancePlayer {
  // DOM
  private bgCanvas: HTMLCanvasElement;
  private textCanvas: HTMLCanvasElement;
  private container: HTMLDivElement;
  private bgCtx!: CanvasRenderingContext2D;
  private textCtx!: CanvasRenderingContext2D;

  // Data
  private data: LyricDanceData;
  private lines: LyricLine[];
  private sortedBeats: number[];
  private beats: BeatTick[];
  private songStart: number;
  private songEnd: number;
  private totalDuration: number;

  // Audio
  audio: HTMLAudioElement;

  // Engines
  private engine: HookDanceEngine | null = null;
  private particleEngine: ParticleEngine | null = null;
  private interpreter: DirectionInterpreter | null = null;

  // Manifest
  private resolvedManifest!: SceneManifest;
  private effectivePalette!: string[];
  private effectiveSystem!: string;
  private textPalette: any;
  private cinematicDirection: CinematicDirection | null = null;

  // rAF state
  private animFrame = 0;
  private beatIndex = 0;
  private prevTime = 0;
  private smoothBeatIntensity = 0;
  private lastFrameTime = 0;
  private activePixelRatio = 1;
  private rng: () => number;

  // Precomputed
  private wordPlan: WordPlan | null = null;
  private lineIndex = -1;
  private nextLinePtr = 0;
  private nextHookPtr = 0;
  private chapterIndex = 0;
  private tensionIndex = 0;

  // Render state objects (mutated in-place, no GC)
  private textState: TextState = {
    xOffset: 0, yBase: 0, beatScale: 1,
    wordCounts: new Map(), seenAppearances: new Set(),
    wordHistory: new Map(), directiveCache: new Map(), evolutionCache: new Map(),
  };
  private bgState: BackgroundState = { lastChapterTitle: "", lastBeatIntensity: 0, lastProgress: 0, lastDrawTime: 0 };
  private particleState: ParticleState = { configCache: { bucket: -1, config: null }, slowFrameCount: 0, adaptiveMaxParticles: 0, frameCount: 0 };

  // Camera
  private cameraZoom = 1;
  private cameraOffset = { x: 0, y: 0 };
  private cameraTarget = { zoom: 1, x: 0, y: 0 };
  private cameraChapter = -1;
  private silenceOffsetY = 0;
  private silenceZoom = 1;
  private vignetteIntensity = 0.55;
  private lightIntensity = 1;
  private climaxActive = false;
  private chapterTransition = { previous: null as string | null, current: null as string | null, progress: 1 };
  private chapterBoundary = { key: -1, chapter: null as any };
  private tensionBoundary = { key: -1, stage: null as TensionStage | null };

  // Caches
  private wordWidthIntCache = new Map<number, number>();
  private commentTextCache = new Map<string, string>();
  private commentWidthCache = new Map<string, number>();

  // Constellation
  constellationNodes: ConstellationNode[] = [];
  private riverOffsets = [0, 0, 0, 0];
  private collisionBoxes: CollisionBox[] = [];
  private grid: SpatialGrid = { cellSize: 96, buckets: new Map() };
  private constellationCanvas: HTMLCanvasElement;
  private constellationDirty = true;
  private constellationLastFrame = 0;
  private riverNodeBuckets: ConstellationNode[][] = Array.from({ length: RIVER_ROWS.length }, () => []);

  // Timeline manifests
  private baseParticleConfig: any;
  private timelineManifest!: SceneManifest;
  private baseAtmosphere = 1;
  private isFireWorld = false;
  private symbol: any;
  private camera: any;

  // Debug
  debugState: LiveDebugState = { ...DEFAULT_DEBUG_STATE };

  // Flags
  private destroyed = false;

  constructor(
    data: LyricDanceData,
    bgCanvas: HTMLCanvasElement,
    textCanvas: HTMLCanvasElement,
    container: HTMLDivElement,
  ) {
    this.data = data;
    this.bgCanvas = bgCanvas;
    this.textCanvas = textCanvas;
    this.container = container;
    this.lines = data.lyrics;

    const safeBeats = data.beat_grid?.beats ?? [];
    this.sortedBeats = [...safeBeats].sort((a, b) => a - b);
    this.beats = this.sortedBeats.map((time, index) => ({
      time, isDownbeat: index % 4 === 0, strength: index % 4 === 0 ? 1 : 0.5,
    }));
    this.songStart = this.lines.length > 0 ? Math.max(0, this.lines[0].start - 0.5) : 0;
    this.songEnd = this.lines.length > 0 ? this.lines[this.lines.length - 1].end + 1 : 0;
    this.totalDuration = Math.max(0.001, this.songEnd - this.songStart);
    this.prevTime = this.songStart;
    this.rng = mulberry32(hashSeed(data.seed || data.id));

    // Audio
    this.audio = new Audio(data.audio_url);
    this.audio.loop = true;
    this.audio.muted = true;
    this.audio.preload = "auto";

    // Constellation offscreen
    this.constellationCanvas = document.createElement("canvas");
  }

  init(): void {
    const bgCtx = this.bgCanvas.getContext("2d", { alpha: false });
    const textCtx = this.textCanvas.getContext("2d", { alpha: true });
    if (!bgCtx || !textCtx) throw new Error("Canvas context unavailable");
    this.bgCtx = bgCtx;
    this.textCtx = textCtx;

    const spec = this.data.physics_spec;

    // Derive manifest
    const { manifest, textPalette, textColor, contrastRatio } = deriveCanvasManifest({
      physicsSpec: spec,
      storedManifest: this.data.scene_manifest as Record<string, unknown> | null,
      fallbackPalette: this.data.palette,
      systemType: this.data.system_type,
    });
    this.resolvedManifest = manifest;
    this.textPalette = textPalette;
    this.timelineManifest = manifest;
    this.baseParticleConfig = manifest.particleConfig;
    this.baseAtmosphere = Math.max(0, Math.min(1, manifest.backgroundIntensity ?? 1));

    const cinematicPalette = this.data.cinematic_direction?.visualWorld?.palette as string[] | undefined;
    this.effectivePalette = cinematicPalette && cinematicPalette.length >= 3 ? cinematicPalette : manifest.palette;
    this.effectiveSystem = manifest.backgroundSystem || spec.system;

    // Cinematic direction
    const raw = this.data.cinematic_direction;
    this.cinematicDirection = raw ? { ...raw, tensionCurve: ensureFullTensionCurve(raw.tensionCurve ?? []) } : null;

    // Interpreter
    this.interpreter = this.cinematicDirection
      ? new DirectionInterpreter(this.cinematicDirection, this.totalDuration)
      : null;
    WordClassifier.setCinematicDirection(this.cinematicDirection);

    // Particle engine
    this.particleEngine = new ParticleEngine(manifest);
    if (this.cinematicDirection?.visualWorld?.particleSystem) {
      this.particleEngine.setSystem(this.cinematicDirection.visualWorld.particleSystem);
    }

    // Animation resolver
    animationResolver.loadFromDna(
      { physics_spec: spec, physicsSpec: spec } as any,
      this.lines.map(l => ({ text: l.text, start: l.start })),
    );

    // Fire-world detection
    const warmLight = (manifest.lightSource || "").toLowerCase();
    const warmEmotion = (manifest.coreEmotion || "").toLowerCase();
    this.isFireWorld = ["flickering left", "flickering right", "ember glow", "flame"].some(k => warmLight.includes(k))
      || warmEmotion.includes("fire") || warmEmotion.includes("burn") || warmEmotion.includes("ember");

    this.symbol = this.cinematicDirection?.symbolSystem;
    this.camera = this.cinematicDirection?.cameraLanguage;

    // Particle adaptive
    this.particleState.adaptiveMaxParticles = window.devicePixelRatio > 1 ? 150 : 80;

    // Dance engine
    this.engine = new HookDanceEngine(
      { ...spec, system: this.effectiveSystem },
      this.beats, this.songStart, this.songEnd, this.audio,
      { onFrame: () => {}, onEnd: () => {} },
      `${this.data.seed || this.data.id}-shareable-dance`,
    );

    // Resize + word plan
    this.handleResize();
    window.addEventListener("resize", this.handleResize);

    // Load font
    const fontFamily = this.cinematicDirection?.visualWorld?.typographyProfile?.fontFamily ?? "Montserrat";
    const trimmed = fontFamily.trim();
    if (trimmed) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(trimmed.replace(/ /g, "+"))}:wght@300;400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }

    // Start audio + loop
    this.audio.currentTime = this.songStart;
    this.audio.play().catch(() => {});
    this.lastFrameTime = performance.now();
    this.animFrame = requestAnimationFrame(this.render);
  }

  // ── Public API ──────────────────────────────────────────────────────

  play(): void {
    this.audio.play().catch(() => {});
  }

  pause(): void {
    this.audio.pause();
  }

  seek(time: number): void {
    this.audio.currentTime = time;
    // Reset beat index for new position
    this.beatIndex = 0;
    while (this.beatIndex < this.sortedBeats.length && this.sortedBeats[this.beatIndex] <= time) {
      this.beatIndex++;
    }
    this.prevTime = time;
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
    if (!muted) this.audio.play().catch(() => {});
  }

  /** Call when cinematic direction arrives late (phase 2 fetch) */
  updateCinematicDirection(direction: CinematicDirection): void {
    this.data = { ...this.data, cinematic_direction: direction };
    this.cinematicDirection = { ...direction, tensionCurve: ensureFullTensionCurve(direction.tensionCurve ?? []) };
    this.interpreter = new DirectionInterpreter(this.cinematicDirection, this.totalDuration);
    WordClassifier.setCinematicDirection(this.cinematicDirection);
    this.symbol = this.cinematicDirection?.symbolSystem;
    this.camera = this.cinematicDirection?.cameraLanguage;

    const cinematicPalette = this.cinematicDirection?.visualWorld?.palette as string[] | undefined;
    if (cinematicPalette && cinematicPalette.length >= 3) this.effectivePalette = cinematicPalette;
    if (this.cinematicDirection?.visualWorld?.particleSystem) {
      this.particleEngine?.setSystem(this.cinematicDirection.visualWorld.particleSystem);
    }

    // Rebuild word plan
    this.wordWidthIntCache.clear();
    this.textState.evolutionCache.clear();
    this.textState.directiveCache.clear();
    this.interpreter?.invalidateEvolutionCache();
    this.handleResize();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.animFrame);
    window.removeEventListener("resize", this.handleResize);
    this.engine?.stop();
    this.audio.pause();
    this.audio.src = "";
    this.container.style.willChange = "auto";
    this.container.style.transform = "translate3d(0, 0, 0)";
  }

  // ── Resize ──────────────────────────────────────────────────────────

  private handleResize = (): void => {
    const isMobile = window.innerWidth < 768;
    const pixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.activePixelRatio = pixelRatio;
    const rect = this.container.getBoundingClientRect();

    [this.bgCanvas, this.textCanvas].forEach(c => {
      c.width = rect.width * pixelRatio;
      c.height = rect.height * pixelRatio;
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    });
    this.bgCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.textCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.wordWidthIntCache.clear();
    this.textState.evolutionCache.clear();
    this.interpreter?.invalidateEvolutionCache();
    this.constellationDirty = true;

    if (this.particleEngine) {
      this.particleEngine.setBounds({ x: 0, y: 0, w: rect.width, h: rect.height });
      this.particleEngine.init(this.resolvedManifest.particleConfig, this.resolvedManifest);
    }

    this.wordPlan = buildWordPlan({
      ctx: this.textCtx,
      lines: this.lines,
      sortedBeats: this.sortedBeats,
      interpreter: this.interpreter,
      chapters: this.cinematicDirection?.chapters,
      tensionCurve: this.cinematicDirection?.tensionCurve as TensionStage[] | undefined,
      shotProgression: this.cinematicDirection?.shotProgression,
      cameraDistanceByChapter: this.cinematicDirection?.cameraLanguage?.distanceByChapter,
      effectiveSystem: this.effectiveSystem,
      cw: rect.width,
      ch: rect.height,
      cinematicTextTransform: this.cinematicDirection?.visualWorld?.typographyProfile?.textTransform,
    });
  };

  // ── Word width helper ─────────────────────────────────────────────

  private hashWordKey(word: string, fSize: number, fontFamily: string): number {
    let h = fSize * 31;
    for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) | 0;
    for (let i = 0; i < fontFamily.length; i++) h = (h * 31 + fontFamily.charCodeAt(i)) | 0;
    return h;
  }

  private getTruncatedComment(node: ConstellationNode): string {
    const cached = this.commentTextCache.get(node.id);
    if (cached) return cached;
    const truncated = node.text.length > 40 ? `${node.text.slice(0, 40)}…` : node.text;
    this.commentTextCache.set(node.id, truncated);
    return truncated;
  }

  // ── rAF render loop ───────────────────────────────────────────────

  private render = (): void => {
    if (this.destroyed) return;
    this.animFrame = requestAnimationFrame(this.render);

    const frameStart = performance.now();
    const now = frameStart;
    const deltaMs = Math.min(100, now - this.lastFrameTime);
    this.lastFrameTime = now;

    const cw = this.textCanvas.width / this.activePixelRatio;
    const ch = this.textCanvas.height / this.activePixelRatio;
    const ctx = this.textCtx;
    const dpr = this.activePixelRatio;

    // Reset frame transforms so any translate/rotate performed by downstream renderers
    // never accumulates across rAF ticks.
    this.bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    let drawCalls = 0;
    let cacheHits = 0;
    let cacheLookups = 0;

    const getWordWidth = (word: string, fSize: number, fontFamily: string): number => {
      const intKey = this.hashWordKey(word, fSize, fontFamily);
      cacheLookups += 1;
      const cached = this.wordWidthIntCache.get(intKey);
      if (cached !== undefined) { cacheHits += 1; return cached; }
      const prev = this.textCtx.font;
      this.textCtx.font = `${fSize}px ${fontFamily}`;
      const w = this.textCtx.measureText(word).width;
      this.textCtx.font = prev;
      this.wordWidthIntCache.set(intKey, w);
      return w;
    };

    const currentTime = this.audio.currentTime;
    if (this.textState.yBase === 0) this.textState.yBase = ch * 0.5;

    if (currentTime >= this.songEnd) {
      this.audio.currentTime = this.songStart;
      this.beatIndex = 0;
      this.prevTime = this.songStart;
      this.smoothBeatIntensity = 0;
      this.engine?.resetPhysics();
      return;
    }

    // Beat intensity
    const decayRate = Math.exp(-deltaMs / 120);
    this.smoothBeatIntensity *= decayRate;
    let frameHadDownbeat = false;
    while (this.beatIndex < this.sortedBeats.length && this.sortedBeats[this.beatIndex] <= currentTime) {
      if (this.sortedBeats[this.beatIndex] > this.prevTime) {
        const isDownbeat = this.beatIndex % 4 === 0;
        this.smoothBeatIntensity = Math.max(this.smoothBeatIntensity, isDownbeat ? 1 : 0.5);
        if (isDownbeat) frameHadDownbeat = true;
      }
      this.beatIndex++;
    }
    const currentBeatIntensity = this.smoothBeatIntensity;

    // Physics
    this.engine?.setViewportBounds(cw, ch);
    this.engine?.update(currentBeatIntensity, deltaMs / 1000, frameHadDownbeat);
    const physicsState = this.engine?.getState();
    const state = physicsState ?? {
      scale: 1, blur: 0, glow: 0, shake: 0, isFractured: false,
      position: 0, velocity: 0, heat: 0, safeOffset: 0,
      offsetX: 0, offsetY: 0, rotation: 0, shatter: 0, wordOffsets: [],
    };

    const plan = this.wordPlan;
    const activeLineIndex = plan
      ? getActiveLineIndexMonotonic(currentTime, plan.lineStarts, plan.lineEnds, this.lineIndex)
      : this.lines.findIndex(l => currentTime >= l.start && currentTime < l.end);
    this.lineIndex = activeLineIndex;
    const activeLine = activeLineIndex >= 0 ? this.lines[activeLineIndex] : null;
    const activePlanLine = activeLineIndex >= 0 ? plan?.lines[activeLineIndex] ?? null : null;
    const songProgress = Math.max(0, Math.min(1, (currentTime - this.songStart) / this.totalDuration));

    // Chapter
    let chapterDirective = this.chapterBoundary.chapter;
    if (plan?.chapterBoundaries?.length) {
      let ci = this.chapterIndex;
      while (ci + 1 < plan.chapterBoundaries.length && songProgress > plan.chapterBoundaries[ci].end) ci += 1;
      while (ci > 0 && songProgress < plan.chapterBoundaries[ci].start) ci -= 1;
      this.chapterIndex = ci;
      chapterDirective = plan.chapterBoundaries[ci]?.chapter ?? null;
    } else {
      const key = Math.floor(songProgress * 100 / 5);
      if (this.chapterBoundary.key !== key) {
        this.chapterBoundary = { key, chapter: this.interpreter?.getCurrentChapter(songProgress) ?? null };
      }
      chapterDirective = this.chapterBoundary.chapter;
    }

    // Tension
    let tensionStage = this.tensionBoundary.stage;
    if (plan?.tensionBoundaries?.length) {
      let ti = this.tensionIndex;
      while (ti + 1 < plan.tensionBoundaries.length && songProgress > plan.tensionBoundaries[ti].end) ti += 1;
      while (ti > 0 && songProgress < plan.tensionBoundaries[ti].start) ti -= 1;
      this.tensionIndex = ti;
      tensionStage = plan.tensionBoundaries[ti]?.stage ?? null;
    }

    // Shot + camera
    const shot = activeLineIndex >= 0 ? plan?.shotsByLineIndex.get(activeLineIndex) ?? null : null;
    const chapterCamera = plan?.cameraByChapterIndex.get(this.chapterIndex) ?? null;
    const movement = String(chapterCamera?.movement ?? "").toLowerCase();
    let targetOffsetX = 0, targetOffsetY = 0;
    let targetZoom = distanceToZoom[chapterCamera?.distance ?? "Wide"] ?? 1.0;
    if (movement.includes("upwards")) targetOffsetY = -0.2 * ch;
    else if (movement.includes("downwards")) targetOffsetY = 0.2 * ch;
    if (movement.includes("pull back")) targetZoom = 0.8;

    if (this.cameraChapter !== this.chapterIndex) {
      this.cameraChapter = this.chapterIndex;
      this.cameraTarget = { zoom: targetZoom, x: targetOffsetX, y: targetOffsetY };
    }
    const cameraLerp = Math.min(1, deltaMs / 2000);
    this.cameraZoom += (this.cameraTarget.zoom - this.cameraZoom) * cameraLerp;
    this.cameraOffset.x += (this.cameraTarget.x - this.cameraOffset.x) * cameraLerp;
    this.cameraOffset.y += (this.cameraTarget.y - this.cameraOffset.y) * cameraLerp;

    // Silence
    const nextLineStart = plan
      ? getNextStartAfterMonotonic(currentTime, plan.lineStarts, this.nextLinePtr)
      : { value: this.lines.find(l => l.start > currentTime)?.start ?? Infinity, ptr: this.nextLinePtr };
    this.nextLinePtr = nextLineStart.ptr;
    const nextLine = Number.isFinite(nextLineStart.value) ? { start: nextLineStart.value } : null;
    const isInSilence = this.interpreter?.isInSilence(activeLine ?? null, nextLine ? { start: nextLine.start } : null, currentTime)
      ?? (!activeLine || Boolean(nextLine && currentTime < nextLine.start - 0.5));

    if (isInSilence && this.cinematicDirection?.silenceDirective) {
      const silence = this.cinematicDirection.silenceDirective;
      const tgtY = silence.cameraMovement.includes("downward") ? 12 : 0;
      const tgtZ = silence.cameraMovement.includes("push") ? 1.03 : 1;
      this.silenceOffsetY += (tgtY - this.silenceOffsetY) * 0.02;
      this.silenceZoom += (tgtZ - this.silenceZoom) * 0.02;
      if (silence.tensionDirection === "building") this.vignetteIntensity = Math.min(0.8, this.vignetteIntensity + 0.001);
      else if (silence.tensionDirection === "releasing") this.vignetteIntensity = Math.max(0.3, this.vignetteIntensity - 0.001);
    } else {
      this.silenceOffsetY += (0 - this.silenceOffsetY) * 0.05;
      this.silenceZoom += (1 - this.silenceZoom) * 0.05;
      if (Math.abs(this.silenceOffsetY) < 0.1) this.silenceOffsetY = 0;
      if (Math.abs(this.silenceZoom - 1) < 0.001) this.silenceZoom = 1;
    }

    const baselineY = this.textState.yBase === 0 ? ch * 0.5 : this.textState.yBase;
    let activeWordPosition = {
      x: cw / 2 + this.textState.xOffset + state.offsetX,
      y: baselineY + state.offsetY,
    };

    const lineAnim = activeLine
      ? animationResolver.resolveLine(activeLineIndex, activeLine.start, activeLine.end, currentTime, currentBeatIntensity, this.effectivePalette)
      : null;
    const isInHook = lineAnim?.isHookLine ?? false;

    // Hook proximity
    const hookStarts = plan?.hookStartTimes;
    let nextHookStart = Infinity;
    if (hookStarts?.length) {
      const next = getNextStartAfterMonotonic(currentTime, hookStarts, this.nextHookPtr);
      this.nextHookPtr = next.ptr;
      nextHookStart = next.value;
    }
    const timeToNextHook = nextHookStart - currentTime;
    const isPreHook = Number.isFinite(nextHookStart) && timeToNextHook > 0 && timeToNextHook < 2.0;

    // Chapter transition
    if (chapterDirective?.title !== this.chapterTransition.current) {
      this.chapterTransition = { previous: this.chapterTransition.current, current: chapterDirective?.title ?? null, progress: 0 };
    }
    this.chapterTransition.progress = Math.min(1, this.chapterTransition.progress + 1 / 120);

    const isClimax = this.interpreter?.isClimaxMoment(songProgress) ?? false;
    this.climaxActive = isClimax;

    // Camera transform
    const camOffX = this.cameraOffset.x + (currentBeatIntensity > 0.92 ? Math.sin(currentTime * 37.7) * (currentBeatIntensity - 0.92) * 15 : 0);
    const camOffY = this.cameraOffset.y + this.silenceOffsetY + (currentBeatIntensity > 0.92 ? Math.cos(currentTime * 37.7 * 1.3) * (currentBeatIntensity - 0.92) * 5 : 0);
    this.bgCtx.translate(camOffX, camOffY);
    ctx.translate(camOffX, camOffY);

    // Background chapter
    const chapterForRender = chapterDirective ?? {
      startRatio: 0, endRatio: 1, title: "default",
      emotionalArc: "ambient", dominantColor: this.timelineManifest.palette[1] ?? "#0a0a0a",
      lightBehavior: this.timelineManifest.lightSource, particleDirective: this.timelineManifest.particleConfig.system,
      backgroundDirective: this.timelineManifest.backgroundSystem, emotionalIntensity: 0.5, typographyShift: null,
    };

    const t0 = performance.now();

    // Background
    drawCalls += renderBackground(
      this.bgCtx, this.bgCanvas, ctx, this.textCanvas,
      { chapter: chapterForRender, songProgress, beatIntensity: currentBeatIntensity, currentTime, now, lightIntensity: this.lightIntensity, activeWordPosition, symbol: this.symbol },
      this.bgState,
    );
    const t1 = performance.now();

    // Particles
    const lineDir = lineAnim ? this.interpreter?.getLineDirection(activeLineIndex) ?? null : null;
    const { drawCalls: particleDrawCalls, lightIntensity } = renderParticles(
      ctx, ctx,
      {
        particleEngine: this.particleEngine, baseParticleConfig: this.baseParticleConfig,
        timelineManifest: this.timelineManifest, physicsSpec: this.data.physics_spec,
        songProgress, beatIntensity: currentBeatIntensity, deltaMs, cw, ch,
        chapterDirective: chapterDirective ?? null, isClimax,
        climaxMaxParticleDensity: this.cinematicDirection?.climax?.maxParticleDensity ?? null,
        tensionParticleDensity: tensionStage?.particleDensity ?? null,
        tensionLightBrightness: tensionStage?.lightBrightness ?? null,
        hasLineAnim: !!lineAnim, particleBehavior: lineDir?.particleBehavior ?? null,
        interpreter: this.interpreter ?? null, activeLineIndex,
      },
      this.particleState,
    );
    this.lightIntensity = lightIntensity;
    drawCalls += particleDrawCalls;

    if (this.symbol) renderSymbol(ctx, this.symbol, songProgress, cw, ch);
    const t2 = performance.now();

    // Far particles
    if (this.particleEngine) { this.particleEngine.draw(ctx, "far"); drawCalls += 1; }
    const t3 = performance.now();

    // Pre-hook darkness
    if (isPreHook && !isInHook) {
      const buildIntensity = (1 - timeToNextHook / 2.0) * 0.3 * this.baseAtmosphere;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, buildIntensity)})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // Fire flicker
    if (this.isFireWorld && currentBeatIntensity > 0.6) {
      ctx.fillStyle = `rgba(255,140,0,${currentBeatIntensity * 0.06 * this.baseAtmosphere})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // Constellation
    this.renderConstellation(ctx, cw, ch, now);

    // Text
    const spec = this.data.physics_spec;
    const visibleLines = activeLine ? [activeLine] : [];
    const isMobile = window.innerWidth < 768;
    const textResult = renderText(ctx, {
      lines: this.lines, activeLine: activeLine ?? null, activeLineIndex, visibleLines,
      currentTime, songProgress, beatIntensity: currentBeatIntensity, beatIndex: this.beatIndex,
      sortedBeats: this.sortedBeats, cw, ch, effectivePalette: this.effectivePalette,
      effectiveSystem: this.effectiveSystem, resolvedManifest: this.resolvedManifest,
      textPalette: this.textPalette, spec, state,
      interpreter: this.interpreter ?? null, shot, tensionStage,
      chapterDirective: chapterDirective ?? null, cinematicDirection: this.cinematicDirection ?? null,
      isClimax, particleEngine: this.particleEngine, rng: this.rng, getWordWidth, isMobile,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 4, devicePixelRatio: this.activePixelRatio,
      precomputedLine: activePlanLine,
    }, this.textState);
    const t4 = performance.now();
    activeWordPosition = textResult.activeWordPosition;
    drawCalls += textResult.drawCalls;

    // Chapter transition overlay
    if (this.chapterTransition.progress < 1 && chapterDirective) {
      const rgb = hexToRgbString(chapterDirective.dominantColor);
      ctx.fillStyle = `rgba(${rgb}, ${(1 - this.chapterTransition.progress) * 0.3})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // Composite overlay
    const overlayR = isClimax ? 255 : 0, overlayG = isClimax ? 255 : 0, overlayB = isClimax ? 255 : 0;
    const chapterOverlay = (chapterForRender.emotionalIntensity ?? 0.5) * 0.2;
    const vignetteOverlay = (this.vignetteIntensity + currentBeatIntensity * 0.15) * this.baseAtmosphere * 0.35;
    const climaxOverlay = isClimax ? currentBeatIntensity * 0.15 : 0;
    const overlayA = Math.max(0, Math.min(0.9, chapterOverlay + vignetteOverlay + climaxOverlay));
    ctx.fillStyle = `rgba(${overlayR},${overlayG},${overlayB},${overlayA})`;
    ctx.fillRect(0, 0, cw, ch);

    // Ending
    if (songProgress > 0.95 && this.cinematicDirection) {
      const ending = this.cinematicDirection.ending;
      const endProgress = (songProgress - 0.95) / 0.05;
      switch (ending.style) {
        case "dissolve":
          ctx.fillStyle = `rgba(${hexToRgbString(chapterDirective?.dominantColor ?? this.timelineManifest.palette[1])}, ${endProgress * 0.8})`;
          ctx.fillRect(0, 0, cw, ch); break;
        case "fade":
          ctx.fillStyle = `rgba(0,0,0,${endProgress})`;
          ctx.fillRect(0, 0, cw, ch); break;
        case "linger":
          this.particleEngine?.setSpeedMultiplier(1 - endProgress * 0.8); break;
        case "snap":
          if (endProgress > 0.8) { ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, cw, ch); } break;
      }
    } else {
      this.particleEngine?.setSpeedMultiplier(1);
    }
    const t5 = performance.now();

    // Near particles
    if (this.particleEngine) { this.particleEngine.draw(ctx, "near"); drawCalls += 1; }
    const t6 = performance.now();

    // Debug state update
    this.updateDebugState(
      currentTime, currentBeatIntensity, state, songProgress,
      chapterDirective, tensionStage, chapterCamera, shot,
      activeLineIndex, activeLine, textResult, lineDir,
      drawCalls, cacheHits, cacheLookups, deltaMs, ch,
      t0, t1, t2, t3, t4, t5, t6,
    );

    this.prevTime = currentTime;
  };

  // ── Constellation rendering ───────────────────────────────────────

  private renderConstellation(ctx: CanvasRenderingContext2D, cw: number, ch: number, now: number): void {
    const nodes = this.constellationNodes;
    const commentNow = Date.now();

    if (now - this.constellationLastFrame >= 100) {
      this.constellationDirty = true;
      this.constellationLastFrame = now;
    }

    if (this.constellationDirty && nodes.length > 0) {
      this.constellationDirty = false;
      const offCanvas = this.constellationCanvas;
      if (offCanvas.width !== cw || offCanvas.height !== ch) {
        offCanvas.width = cw; offCanvas.height = ch;
      }
      const offCtx = offCanvas.getContext("2d")!;
      offCtx.clearRect(0, 0, cw, ch);
      offCtx.textBaseline = "middle";
      offCtx.textAlign = "center";

      for (const node of nodes) {
        if (node.phase !== "constellation") continue;
        node.x += Math.cos(node.driftAngle) * node.driftSpeed / cw;
        node.y += Math.sin(node.driftAngle) * node.driftSpeed / ch;
        if (node.x < -0.1) node.x = 1.1;
        if (node.x > 1.1) node.x = -0.1;
        if (node.y < -0.1) node.y = 1.1;
        if (node.y > 1.1) node.y = -0.1;
        offCtx.font = "300 10px system-ui, -apple-system, sans-serif";
        offCtx.globalAlpha = node.baseOpacity;
        offCtx.fillStyle = "#ffffff";
        offCtx.fillText(this.getTruncatedComment(node), node.x * cw, node.y * ch);
      }

      // River rows
      for (let ri = 0; ri < this.riverNodeBuckets.length; ri++) this.riverNodeBuckets[ri].length = 0;
      for (const node of nodes) {
        if (node.phase === "river" && node.riverRowIndex >= 0 && node.riverRowIndex < this.riverNodeBuckets.length) {
          this.riverNodeBuckets[node.riverRowIndex].push(node);
        }
      }

      this.grid.buckets.clear();
      this.collisionBoxes.length = 0;

      for (let ri = 0; ri < RIVER_ROWS.length; ri++) {
        const row = RIVER_ROWS[ri];
        this.riverOffsets[ri] += row.speed * row.direction;
        const rowComments = this.riverNodeBuckets[ri];
        if (rowComments.length === 0) continue;

        offCtx.font = "300 11px system-ui, -apple-system, sans-serif";
        offCtx.globalAlpha = row.opacity;
        offCtx.fillStyle = "#ffffff";
        const rowY = row.y * ch;

        let totalWidth = 0;
        for (const node of rowComments) {
          const key = `${node.id}:11`;
          let w = this.commentWidthCache.get(key);
          if (w === undefined) { w = offCtx.measureText(this.getTruncatedComment(node)).width; this.commentWidthCache.set(key, w); }
          totalWidth += w + 120;
        }
        const wrapWidth = Math.max(totalWidth, cw + 200);

        let xBase = this.riverOffsets[ri];
        for (const node of rowComments) {
          const key = `${node.id}:11`;
          const textWidth = this.commentWidthCache.get(key) ?? 0;
          let drawX = ((xBase % wrapWidth) + wrapWidth) % wrapWidth;
          if (drawX > cw + 100) drawX -= wrapWidth;

          const box: CollisionBox = { id: node.id, x: drawX - textWidth * 0.5, y: rowY - 8, w: textWidth, h: 16 };
          const minGX = Math.floor(box.x / this.grid.cellSize);
          const maxGX = Math.floor((box.x + box.w) / this.grid.cellSize);
          const minGY = Math.floor(box.y / this.grid.cellSize);
          const maxGY = Math.floor((box.y + box.h) / this.grid.cellSize);
          for (let gx = minGX; gx <= maxGX; gx++) {
            for (let gy = minGY; gy <= maxGY; gy++) {
              const bucket = this.grid.buckets.get(gridKey(gx, gy));
              if (!bucket) continue;
              for (const bi of bucket) {
                const other = this.collisionBoxes[bi];
                if (other) intersectsAABB(box, other) && resolveAABBCollision(box, other, 0.35);
              }
            }
          }
          const boxIndex = this.collisionBoxes.length;
          this.collisionBoxes.push(box);
          for (let gx = minGX; gx <= maxGX; gx++) {
            for (let gy = minGY; gy <= maxGY; gy++) {
              const k = gridKey(gx, gy);
              const b = this.grid.buckets.get(k);
              if (b) b.push(boxIndex); else this.grid.buckets.set(k, [boxIndex]);
            }
          }
          offCtx.fillText(this.getTruncatedComment(node), box.x + box.w * 0.5, box.y + box.h * 0.5);
          node.x = (box.x + box.w * 0.5) / cw;
          node.y = (box.y + box.h * 0.5) / ch;
          xBase += textWidth + 120;
        }
      }
    }

    // Blit
    if (nodes.length > 0) ctx.drawImage(this.constellationCanvas, 0, 0);

    // Live comment animations
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const node of nodes) {
      if (node.phase === "center") {
        ctx.font = "400 14px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(this.getTruncatedComment(node), cw / 2, ch / 2);
        if (commentNow - node.phaseStartTime >= 800) { node.phase = "transitioning"; node.phaseStartTime = commentNow; }
      } else if (node.phase === "transitioning") {
        const elapsed = commentNow - node.phaseStartTime;
        const t = Math.min(1, elapsed / 4000);
        const targetRow = RIVER_ROWS[node.riverRowIndex];
        const targetY = targetRow ? targetRow.y : node.seedY;
        const curX = 0.5 + (node.seedX - 0.5) * t * 0.3;
        const curY = 0.5 + (targetY - 0.5) * t;
        const size = 14 - 3 * t;
        const opacity = 0.45 - (0.45 - (targetRow?.opacity || 0.09)) * t;
        ctx.font = `300 ${Math.round(size)}px system-ui, -apple-system, sans-serif`;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(this.getTruncatedComment(node), curX * cw, curY * ch);
        node.x = curX; node.y = curY; node.currentSize = size;
        if (elapsed >= 4000) { node.phase = "river"; node.phaseStartTime = commentNow; }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Debug state ───────────────────────────────────────────────────

  private updateDebugState(
    currentTime: number, beatIntensity: number, state: any, songProgress: number,
    chapterDirective: any, tensionStage: any, chapterCamera: any, shot: any,
    activeLineIndex: number, activeLine: any, textResult: any, lineDir: any,
    drawCalls: number, cacheHits: number, cacheLookups: number, deltaMs: number, ch: number,
    t0: number, t1: number, t2: number, t3: number, t4: number, t5: number, t6: number,
  ): void {
    const d = this.debugState;
    d.perfBg = t1 - t0; d.perfSymbol = t2 - t1; d.perfParticlesFar = t3 - t2;
    d.perfText = t4 - t3; d.perfOverlays = t5 - t4; d.perfNear = t6 - t5; d.perfTotal = t6 - t0;
    d.time = currentTime; d.beatIntensity = beatIntensity; d.physGlow = state.glow;
    d.physicsActive = true; d.wordCount = textResult.wordsProcessed;
    d.heat = state.heat; d.velocity = state.velocity; d.rotation = state.rotation; d.lastBeatForce = beatIntensity;
    d.effectKey = textResult.effectKey; d.entryProgress = textResult.entry; d.exitProgress = textResult.exit;
    d.activeMod = textResult.activeMod; d.fontScale = textResult.fontScale; d.scale = textResult.scale;
    d.lineColor = textResult.lineColor; d.isHookLine = textResult.isHook;
    d.repIndex = textResult.repIndex; d.repTotal = textResult.repTotal;
    d.particleSystem = this.particleEngine?.getConfig().system ?? "none";
    d.particleDensity = this.particleEngine?.getConfig().density ?? 0;
    d.particleSpeed = this.particleEngine?.getConfig().speed ?? 0;
    d.particleCount = this.particleEngine?.getActiveCount() ?? 0;
    d.songSection = `${textResult.sectionZone || getSongSection(songProgress)}`;
    d.xOffset = this.textState.xOffset; d.yBase = this.textState.yBase / ch;
    d.xNudge = textResult.xNudge; d.shake = state.shake;
    d.backgroundSystem = this.data.system_type; d.songProgress = songProgress;
    d.vignetteIntensity = (0.55 + beatIntensity * 0.15) * this.baseAtmosphere;
    d.dirThesis = this.interpreter?.direction?.thesis ?? "—";
    d.dirChapter = chapterDirective?.title ?? "—";
    d.dirChapterProgress = chapterDirective ? Math.max(0, Math.min(1, (songProgress - chapterDirective.startRatio) / Math.max(0.001, chapterDirective.endRatio - chapterDirective.startRatio))) : 0;
    d.dirIntensity = chapterDirective?.emotionalIntensity ?? 0;
    d.dirBgDirective = chapterDirective?.backgroundDirective ?? this.timelineManifest.backgroundSystem ?? "—";
    d.dirLightBehavior = chapterDirective?.lightBehavior ?? this.timelineManifest.lightSource ?? "—";
    const symbolState = getSymbolStateForProgress(songProgress, this.symbol);
    d.symbolPrimary = this.symbol?.primary ?? "—"; d.symbolSecondary = this.symbol?.secondary ?? "—";
    d.symbolState = symbolState ?? "—";
    d.cameraDistance = chapterCamera?.distance ?? this.camera?.openingDistance ?? "Wide";
    d.cameraMovement = chapterCamera?.movement ?? this.camera?.movementType ?? "—";
    d.tensionStage = tensionStage ? `${tensionStage.stage} (${songProgress.toFixed(2)})` : "—";
    d.tensionMotion = tensionStage?.motionIntensity ?? 0; d.tensionParticles = tensionStage?.particleDensity ?? 0;
    d.tensionTypo = tensionStage?.typographyAggression ?? 0;

    const dbgLineDir = this.interpreter?.getLineDirection(activeLineIndex) ?? null;
    const dbgWords = activeLine ? activeLine.text.split(/\s+/) : [];
    const dbgHeroWord = dbgLineDir?.heroWord ?? dbgWords.find((w: string) => WordClassifier.classifyWord(w) !== "FILLER") ?? dbgWords[0] ?? "";
    const dbgWordDir = this.interpreter?.getWordDirective(dbgHeroWord) ?? null;
    d.wordDirectiveWord = dbgHeroWord;
    d.wordDirectiveKinetic = dbgWordDir?.kineticClass ?? WordClassifier.classifyWord(dbgHeroWord);
    d.wordDirectiveElemental = dbgWordDir?.elementalClass ?? WordClassifier.getElementalClass(dbgHeroWord);
    d.wordDirectiveEmphasis = dbgWordDir?.emphasisLevel ?? 0;
    d.wordDirectiveEvolution = dbgWordDir?.evolutionRule ?? "—";
    d.lineHeroWord = dbgLineDir?.heroWord ?? dbgHeroWord;
    d.lineEntry = dbgLineDir?.entryStyle ?? this.resolvedManifest.lyricEntrance ?? "fades";
    d.lineExit = dbgLineDir?.exitStyle ?? "fades"; d.lineIntent = dbgLineDir?.emotionalIntent ?? "—";
    d.shotType = shot?.shotType ?? "FloatingInWorld"; d.shotDescription = shot?.description ?? "—";
    const normalizedHero = (dbgHeroWord || "").toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
    const tracked = dbgWordDir?.evolutionRule ? this.textState.wordHistory.get(normalizedHero) : null;
    const evCount = tracked?.count ?? 0;
    d.evolutionWord = dbgHeroWord || "—"; d.evolutionCount = evCount;
    d.evolutionScale = 1 + evCount * 0.06; d.evolutionGlow = evCount * 4;
    d.evolutionBubbles = dbgHeroWord.toLowerCase() === "drown" ? Math.min(20, 3 + evCount * 2) : 0;
    d.evolutionSinkPx = dbgHeroWord.toLowerCase() === "down" ? evCount * 3 : 0;
    d.fps = deltaMs > 0 ? 1000 / deltaMs : 60;
    d.drawCalls = drawCalls; d.cacheHits = cacheLookups > 0 ? cacheHits / cacheLookups : 1;
  }
}
