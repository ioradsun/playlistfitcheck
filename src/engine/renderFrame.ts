// ============= Full file contents =============

import type { Chapter, CinematicDirection, SymbolSystem, TensionStage, WordDirective } from "@/types/CinematicDirection";
import type { ParticleConfig, SceneManifest } from "@/engine/SceneManifest";
import type { ParticleEngine } from "@/engine/ParticleEngine";
import type { DirectionInterpreter, WordHistory } from "@/engine/DirectionInterpreter";
import type { HookDanceEngine } from "@/engine/HookDanceEngine";
import { renderSectionBackground, getSymbolStateForProgress } from "@/engine/BackgroundDirector";
import { renderSectionLighting } from "@/engine/LightingDirector";
import { renderText, type TextState, type TextInput } from "@/engine/renderText";
import { renderSymbol } from "@/engine/SymbolRenderer";
import type { RenderSection } from "@/engine/directionResolvers";

// ─── Types ──────────────────────────────────────────────────────────

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag?: "main" | "adlib";
}

export interface LineBeatMap {
  lineIndex: number;
  beats: number[];
  strongBeats: number[];
  beatCount: number;
  beatsPerSecond: number;
  firstBeat: number;
  lastBeat: number;
}

export interface ConstellationNode {
  id: string;
  text: string;
  submittedAt: number;
  seedX: number;
  seedY: number;
  x: number;
  y: number;
  driftSpeed: number;
  driftAngle: number;
  phase: "constellation" | "river" | "center" | "transitioning";
  phaseStartTime: number;
  riverRowIndex: number;
  currentSize: number;
  baseOpacity: number;
}

/** Mutable background-layer state — persisted across frames by the caller. */
export interface BackgroundState {
  lastChapterTitle: string;
  lastBeatIntensity: number;
  lastProgress: number;
  lastDrawTime: number;
}

/** Mutable state for particle + text layers. */
export interface ParticleState {
  configCache: { bucket: number; config: ParticleConfig | null };
  slowFrameCount: number;
  adaptiveMaxParticles: number;
  frameCount: number;
}

export interface RendererState {
  background: BackgroundState;
  particle: ParticleState;
  text: TextState;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function getParticleConfigForTime(
  baseConfig: ParticleConfig,
  _manifest: SceneManifest,
  songProgress: number,
  cache: { bucket: number; config: ParticleConfig | null },
): ParticleConfig {
  const bucket = Math.floor(songProgress * 20); // 5% buckets
  if (cache.bucket === bucket && cache.config) {
    return cache.config;
  }

  // Clone base config — section overrides are now handled by the interpreter
  const config = { ...baseConfig };

  cache.bucket = bucket;
  cache.config = config;
  return config;
}

// ─── Section 1: Background layer ────────────────────────────────────

export interface BackgroundRenderInput {
  chapter: RenderSection;
  songProgress: number;
  beatIntensity: number;
  now: number;
  lightIntensity: number;
  activeWordPosition: { x: number; y: number };
  symbol: SymbolSystem | null;
}

export function renderBackground(
  bgCtx: CanvasRenderingContext2D,
  bgCanvas: HTMLCanvasElement,
  textCtx: CanvasRenderingContext2D,
  textCanvas: HTMLCanvasElement,
  bgState: BackgroundState,
  input: BackgroundRenderInput,
): number {
  const {
    chapter, songProgress, beatIntensity,
    now, lightIntensity, activeWordPosition, symbol,
  } = input;

  // Dirty check — same logic as the original rAF loop
  const timeSinceLastDraw = now - bgState.lastDrawTime;
  const needsUpdate =
    chapter.title !== bgState.lastChapterTitle ||
    (timeSinceLastDraw > 100 && (
      Math.abs(beatIntensity - bgState.lastBeatIntensity) > 0.2 ||
      Math.abs(songProgress - bgState.lastProgress) > 0.05
    )) ||
    (bgState.lastBeatIntensity <= 0.2 && beatIntensity > 0.2) ||
    (bgState.lastBeatIntensity > 0.2 && beatIntensity <= 0.2);

  if (needsUpdate) {
    const cw = bgCanvas.width;
    const ch = bgCanvas.height;
    bgCtx.fillStyle = "#0a0a0a";
    bgCtx.fillRect(0, 0, cw, ch);

    renderSectionBackground(
      bgCtx,
      bgCanvas,
      chapter,
      songProgress,
      beatIntensity,
      now, // currentTime
    );

    renderSectionLighting(
      bgCtx,
      bgCanvas,
      chapter,
      activeWordPosition,
      songProgress,
      beatIntensity * lightIntensity,
      now,
    );

    bgState.lastChapterTitle = chapter.title;
    bgState.lastBeatIntensity = beatIntensity;
    bgState.lastProgress = songProgress;
    bgState.lastDrawTime = now;
  }

  // Always render lighting on the text canvas (cheap — no budget gate)
  renderSectionLighting(
    textCtx,
    textCanvas,
    chapter,
    activeWordPosition,
    songProgress,
    beatIntensity * lightIntensity,
    now,
  );

  return 2; // draw-call accounting (bg + text lighting)
}

// ─── Section 2: Particle layer ──────────────────────────────────────

export interface ParticleRenderInput {
  particleEngine: ParticleEngine;
  baseParticleConfig: ParticleConfig;
  timelineManifest: SceneManifest;
  physicsSpec: any;
  songProgress: number;
  beatIntensity: number;
  deltaMs: number;
  cw: number;
  ch: number;
  chapterDirective: RenderSection | null;
  isClimax: boolean;
  climaxMaxParticleDensity: number | null;
  tensionParticleDensity: number | null;
  tensionLightBrightness: number | null;
  hasLineAnim: boolean;
  particleBehavior: string | null;
  interpreter: DirectionInterpreter | null;
  activeLineIndex: number;
}

export function renderParticles(
  particleCtx: CanvasRenderingContext2D, // Unused but kept for signature
  textCtx: CanvasRenderingContext2D, // Particles draw to text canvas now
  input: ParticleRenderInput,
  state: ParticleState,
): { lightIntensity: number; drawCalls: number } {
  const {
    particleEngine, baseParticleConfig, timelineManifest, physicsSpec,
    songProgress, beatIntensity, deltaMs, cw, ch,
    chapterDirective, isClimax, climaxMaxParticleDensity,
    tensionParticleDensity, tensionLightBrightness, hasLineAnim,
    particleBehavior, interpreter, activeLineIndex,
  } = input;

  let lightIntensity = 0.5;
  let drawCalls = 0;

  // Particle config
  const pConfig = getParticleConfigForTime(baseParticleConfig, timelineManifest, songProgress, state.configCache);
  const directiveSystem = interpreter?.getParticleDirective(songProgress) ?? null;
  if (directiveSystem && directiveSystem !== "ambient") {
    // Override system if directive is explicit
    // (In a real implementation, we'd map this string to a system ID)
  }

  particleEngine.setConfig(pConfig);

  // Density control
  let densityMult = 1.0;
  if (physicsSpec?.density) densityMult *= physicsSpec.density;
  if (isClimax && climaxMaxParticleDensity) densityMult *= climaxMaxParticleDensity;
  if (tensionParticleDensity) densityMult *= tensionParticleDensity;
  if (!hasLineAnim) densityMult *= 0.2; // Idle state

  // Perf throttling
  if (deltaMs > 22) state.slowFrameCount++;
  else state.slowFrameCount = Math.max(0, state.slowFrameCount - 1);

  if (state.slowFrameCount > 10) state.adaptiveMaxParticles = 100;
  else if (state.slowFrameCount === 0 && state.adaptiveMaxParticles < 200) state.adaptiveMaxParticles = 200;

  particleEngine.setDensityMultiplier(densityMult);
  // Max particles controlled internally by ParticleEngine based on hardware

  // Update & Draw
  particleEngine.update(deltaMs / 1000, beatIntensity);
  particleEngine.draw(textCtx); // Draw to text context (mid-layer)
  drawCalls += 1;

  // Light intensity calculation
  const baseBright = tensionLightBrightness ?? 0.5;
  const beatBright = beatIntensity * 0.3;
  lightIntensity = Math.min(1, baseBright + beatBright);

  return { lightIntensity, drawCalls };
}
