import type { FrameRenderState } from "@/engine/presetDerivation";
import type { ParticleEngine, ParticleRuntimeConfig } from "@/engine/ParticleEngine";
import type { DirectionInterpreter } from "@/engine/DirectionInterpreter";
import { renderSectionBackground } from "@/engine/BackgroundDirector";
import { renderSectionLighting } from "@/engine/LightingDirector";

export interface BackgroundState {
  lastSectionKey: string;
  lastBeatIntensity: number;
  lastProgress: number;
  lastDrawTime: number;
}

export interface ParticleState {
  configCache: { bucket: number; config: ParticleRuntimeConfig | null };
  slowFrameCount: number;
  adaptiveMaxParticles: number;
  frameCount: number;
}

export function getParticleConfigForTime(
  baseConfig: ParticleRuntimeConfig,
  _frame: FrameRenderState,
  songProgress: number,
  cache: { bucket: number; config: ParticleRuntimeConfig | null },
): ParticleRuntimeConfig {
  const bucket = Math.floor(songProgress * 20);
  if (cache.bucket === bucket && cache.config) return cache.config;
  const config = { ...baseConfig };
  cache.bucket = bucket;
  cache.config = config;
  return config;
}

export interface BackgroundRenderInput {
  background: { dominantColor: string; intensity: number; backgroundDirective: string };
  lighting: { lightBehavior: string; intensity: number };
  songProgress: number;
  beatIntensity: number;
  now: number;
  lightIntensity: number;
  activeWordPosition: { x: number; y: number };
}

export function renderBackground(
  bgCtx: CanvasRenderingContext2D,
  bgCanvas: HTMLCanvasElement,
  textCtx: CanvasRenderingContext2D,
  textCanvas: HTMLCanvasElement,
  bgState: BackgroundState,
  input: BackgroundRenderInput,
): number {
  const { background, lighting, songProgress, beatIntensity, now, lightIntensity, activeWordPosition } = input;
  const sectionKey = `${background.backgroundDirective}:${background.dominantColor}`;
  const timeSinceLastDraw = now - bgState.lastDrawTime;
  const needsUpdate =
    sectionKey !== bgState.lastSectionKey ||
    (timeSinceLastDraw > 100 &&
      (Math.abs(beatIntensity - bgState.lastBeatIntensity) > 0.2 || Math.abs(songProgress - bgState.lastProgress) > 0.05)) ||
    (bgState.lastBeatIntensity <= 0.2 && beatIntensity > 0.2) ||
    (bgState.lastBeatIntensity > 0.2 && beatIntensity <= 0.2);

  if (needsUpdate) {
    bgCtx.fillStyle = "#0a0a0a";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    renderSectionBackground(bgCtx, bgCanvas, background, songProgress, beatIntensity, now);
    renderSectionLighting(bgCtx, bgCanvas, lighting, activeWordPosition, songProgress, beatIntensity * lightIntensity, now);
    bgState.lastSectionKey = sectionKey;
    bgState.lastBeatIntensity = beatIntensity;
    bgState.lastProgress = songProgress;
    bgState.lastDrawTime = now;
  }

  renderSectionLighting(textCtx, textCanvas, lighting, activeWordPosition, songProgress, beatIntensity * lightIntensity, now);
  return 2;
}

export interface ParticleRenderInput {
  particleEngine: ParticleEngine;
  baseParticleConfig: ParticleRuntimeConfig;
  frameState: FrameRenderState;
  motionProfileSpec: any;
  songProgress: number;
  beatIntensity: number;
  deltaMs: number;
  isClimax: boolean;
  climaxMaxParticleDensity: number | null;
  tensionParticleDensity: number | null;
  tensionLightBrightness: number | null;
  hasLineAnim: boolean;
  particleBehavior: string | null;
  interpreter: DirectionInterpreter | null;
}

export function renderParticles(
  _particleCtx: CanvasRenderingContext2D,
  textCtx: CanvasRenderingContext2D,
  input: ParticleRenderInput,
  state: ParticleState,
): { lightIntensity: number; drawCalls: number } {
  const {
    particleEngine,
    baseParticleConfig,
    frameState,
    motionProfileSpec,
    songProgress,
    beatIntensity,
    deltaMs,
    isClimax,
    climaxMaxParticleDensity,
    tensionParticleDensity,
    tensionLightBrightness,
    hasLineAnim,
  } = input;

  const pConfig = getParticleConfigForTime(baseParticleConfig, frameState, songProgress, state.configCache);
  particleEngine.setConfig(pConfig);

  let densityMult = 1.0;
  if (motionProfileSpec?.density) densityMult *= motionProfileSpec.density;
  if (isClimax && climaxMaxParticleDensity) densityMult *= climaxMaxParticleDensity;
  if (tensionParticleDensity) densityMult *= tensionParticleDensity;
  if (!hasLineAnim) densityMult *= 0.2;

  if (deltaMs > 22) state.slowFrameCount++;
  else state.slowFrameCount = Math.max(0, state.slowFrameCount - 1);

  if (state.slowFrameCount > 10) state.adaptiveMaxParticles = 100;
  else if (state.slowFrameCount === 0 && state.adaptiveMaxParticles < 200) state.adaptiveMaxParticles = 200;

  particleEngine.setDensityMultiplier(densityMult);
  particleEngine.update(deltaMs, beatIntensity);
  particleEngine.draw(textCtx);

  const baseBright = tensionLightBrightness ?? 0.5;
  return { lightIntensity: Math.min(1, baseBright + beatIntensity * 0.3), drawCalls: 1 };
}
