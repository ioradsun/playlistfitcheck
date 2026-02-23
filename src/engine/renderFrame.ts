/**
 * renderFrame.ts — Pure render function extracted from ShareableLyricDance.
 *
 * STATUS: SCAFFOLDING — This file defines the RendererState interface
 * and a stub renderFrame function. The actual 1100-line render loop
 * in ShareableLyricDance.tsx needs to be migrated here incrementally.
 *
 * The render loop is deeply coupled to:
 *   - 3 canvas contexts (bgCtx, particleCtx, textCtx)
 *   - HookDanceEngine (physics state)
 *   - ParticleEngine (particle simulation)
 *   - DirectionInterpreter (cinematic direction)
 *   - AnimationResolver (line animation)
 *   - WordClassifier (word visual props)
 *   - 20+ mutable ref-like state variables
 *   - Browser APIs (window.innerWidth, navigator.hardwareConcurrency)
 *
 * Migration strategy:
 *   1. Replace browser API calls with state-passed values
 *   2. Move engine instances into RendererState
 *   3. Convert ref accesses to state field accesses
 *   4. Extract one section at a time (background → particles → text → overlays)
 */

import type { CinematicDirection, TensionStage, WordDirective } from "@/types/CinematicDirection";
import type { ParticleConfig, SceneManifest } from "@/engine/SceneManifest";
import type { ParticleEngine } from "@/engine/ParticleEngine";
import type { DirectionInterpreter, WordHistory } from "@/engine/DirectionInterpreter";
import type { HookDanceEngine } from "@/engine/HookDanceEngine";

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

/** Complete state needed by the render loop — no React, no DOM */
export interface RendererState {
  // Canvas dimensions (logical, pre-pixelRatio)
  width: number;
  height: number;

  // Song data (immutable per session)
  lines: LyricLine[];
  sortedBeats: number[];
  totalDuration: number;
  songStart: number;
  songEnd: number;
  palette: string[];
  effectiveSystem: string;

  // Scene manifest
  manifest: SceneManifest;
  baseParticleConfig: ParticleConfig;

  // Cinematic direction (nullable)
  cinematicDirection: CinematicDirection | null;

  // Physics spec
  physicsSpec: any;

  // Per-frame input (updated via messages)
  currentTime: number;
  beatIntensity: number;
  deltaMs: number;

  // Mutable render state (persisted across frames)
  beatIndex: number;
  prevTime: number;
  smoothBeatIntensity: number;
  activeChapterIndex: number;
  xOffset: number;
  yBase: number;
  beatScale: number;
  cameraZoom: number;
  silenceOffsetY: number;
  silenceZoom: number;
  vignetteIntensity: number;
  lightIntensity: number;
  lastBgChapter: string;
  lastBgBeat: number;
  lastBgProgress: number;
  lastBgTime: number;

  // Word tracking
  wordCounts: Map<string, number>;
  seenAppearances: Set<string>;
  wordHistory: Map<string, WordHistory>;
  wordWidthCache: Map<number, number>;

  // Caches
  particleConfigCache: { bucket: number; config: ParticleConfig | null };
  chapterBoundaryCache: { key: number; chapter: any };
  tensionBoundaryCache: { key: number; stage: TensionStage | null };
  directiveCache: Map<string, WordDirective | null>;
  evolutionCache: Map<string, { count: number; scale: number; glow: number; opacity: number; yOffset: number }>;

  // Precomputed data
  lineBeatMap: LineBeatMap[];
  hookStartTimes: number[];
  chapters: any[];

  // Constellation
  constellationNodes: ConstellationNode[];
  riverOffsets: number[];
  constellationDirty: boolean;

  // Device info (passed once, no window access needed)
  isMobile: boolean;
  devicePixelRatio: number;
  hardwareConcurrency: number;

  // Engine instances (these contain internal state)
  // NOTE: These cannot be transferred to a worker via postMessage.
  // For worker mode, these must be instantiated inside the worker.
  particleEngine: ParticleEngine | null;
  physicsEngine: HookDanceEngine | null;
  interpreter: DirectionInterpreter | null;
}

/**
 * Pure render function — draws one frame to the provided canvases.
 *
 * TODO: Migrate the actual render loop from ShareableLyricDance.tsx here.
 * Currently a no-op stub. The render loop remains in the component
 * with USE_WORKER = false (see ShareableLyricDance.tsx).
 */
export function renderFrame(
  bgCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  particleCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  textCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: RendererState,
): void {
  // STUB — render loop lives in ShareableLyricDance.tsx for now.
  // This will be populated incrementally as sections are extracted.
  void bgCtx;
  void particleCtx;
  void textCtx;
  void state;
}
