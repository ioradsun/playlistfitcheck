/**
 * Master Layout Spec — Lyric Safety & Focus Invariants
 *
 * 1) Text is the hero:
 *    - Background animation must sit behind lyric readability.
 *    - Text effects can be expressive but never overpower legibility.
 *
 * 2) 80% viewport rule:
 *    - Lyric safe zone is based on viewport/container-relative sizing.
 *    - Renderers target the inner ~80% area with explicit safe padding.
 *
 * 3) Zero clipping tolerance:
 *    - Physics motion budgets scale from container dimensions.
 *    - EffectRegistry applies clip guards so glyph transforms stay in-bounds.
 *    - validateLayout() is the final safety net before lyric transitions.
 *
 * 4) Mobile-first:
 *    - Layout assumptions must hold at narrow portrait viewports.
 *    - Dynamic font and line-height reductions are applied when overflow risk is detected.
 *
 * Coordination across engine files:
 * - PhysicsIntegrator: computes viewport-aware safe motion envelopes.
 * - EffectRegistry: clamps animated glyph positions to lyric-safe bounds.
 * - SystemStyles: computes responsive type + stacked layouts for constrained screens.
 * - SystemBackgrounds: keeps ambience subordinate to lyric focal clarity.
 * - HookDanceEngine: validates fit pre-transition and orchestrates deterministic timing.
 */

import {
  PhysicsIntegrator,
  mulberry32,
  hashSeed,
  type PhysicsSpec,
  type PhysicsState,
} from "./PhysicsIntegrator";
import type { SceneManifest } from "./SceneManifest";

export interface BeatTick {
  time: number;       // seconds
  isDownbeat: boolean; // true = first beat of bar
  strength: number;   // 0–1 normalised
}

export interface HookDanceCallbacks {
  /** Fires every frame with the current physics state + playhead time */
  onFrame: (state: PhysicsState, time: number, beatCount: number) => void;
  /** Fires when the hook region ends or is stopped */
  onEnd: () => void;
}

export interface LayoutValidationInput {
  textWidth: number;
  textHeight: number;
  safeWidth: number;
  safeHeight: number;
  fontSize: number;
  lineHeight: number;
}

export interface LayoutValidationResult {
  fontSize: number;
  lineHeight: number;
  fits: boolean;
  steps: number;
}


export function isForegroundParticleSystem(system: string): boolean {
  return system === "snow" || system === "petals" || system === "light-rays" || system === "ash";
}

export class HookDanceEngine {
  private integrator: PhysicsIntegrator;
  private beats: BeatTick[];
  private hookStart: number;
  private hookEnd: number;
  private rafId: number | null = null;
  private prevTime: number;
  private beatIndex = 0; // pointer into sorted beats array
  private totalBeats = 0;
  private rand: () => number;
  private callbacks: HookDanceCallbacks;
  private audioRef: HTMLAudioElement;
  private running = false;
  private audioPlaying = false;
  private syntheticStart = 0; // performance.now() when engine started
  private boundTimeUpdate: (() => void) | null = null;
  private boundEnded: (() => void) | null = null;
  private activeManifest: SceneManifest | null = null;
  private lastExternalBeatIntensity = 0;

  constructor(
    spec: PhysicsSpec,
    beats: BeatTick[],
    hookStart: number,
    hookEnd: number,
    audio: HTMLAudioElement,
    callbacks: HookDanceCallbacks,
    seed?: string,
  ) {
    this.integrator = new PhysicsIntegrator(spec);
    // Sort beats and filter to hook region
    this.beats = beats
      .filter(b => b.time >= hookStart && b.time <= hookEnd)
      .sort((a, b) => a.time - b.time);
    this.hookStart = hookStart;
    this.hookEnd = hookEnd;
    this.audioRef = audio;
    this.callbacks = callbacks;
    this.prevTime = hookStart;

    // Deterministic PRNG seeded from song slug + hook start
    const seedStr = seed ?? `hook-${hookStart.toFixed(3)}`;
    this.rand = mulberry32(hashSeed(seedStr));
  }

  /** Get the integrator's hydrated spec (with material/response) */
  get spec(): PhysicsSpec {
    return this.integrator.spec;
  }

  /** Get the PRNG for downstream deterministic randomness */
  get prng(): () => number {
    return this.rand;
  }

  setViewportBounds(width: number, height: number) {
    this.integrator.setViewportBounds(width, height);
  }

  /**
   * External frame-driven update path used by full-song canvas rendering.
   * Allows callers to feed live beat intensity while preserving the spring world.
   */
  update(beatIntensity: number, isDownbeat = false): PhysicsState {
    const clamped = Math.max(0, Math.min(1, beatIntensity));
    const delta = Math.max(0, clamped - this.lastExternalBeatIntensity);
    if (delta > 0.01) {
      this.integrator.onBeat(Math.max(clamped, delta), isDownbeat);
    }
    this.lastExternalBeatIntensity = clamped;
    return this.integrator.tick();
  }

  /**
   * Last-resort safety net before lyric transitions.
   * Iteratively shrinks font-size / line-height until text fits safe zone.
   */
  validateLayout(input: LayoutValidationInput): LayoutValidationResult {
    let fontSize = input.fontSize;
    let lineHeight = input.lineHeight;
    let width = input.textWidth;
    let height = input.textHeight;
    let steps = 0;

    const widthRatio = input.safeWidth > 0 ? input.safeWidth / Math.max(1, width) : 1;
    const heightRatio = input.safeHeight > 0 ? input.safeHeight / Math.max(1, height) : 1;
    let fitRatio = Math.min(1, widthRatio, heightRatio);

    if (fitRatio < 1) {
      fontSize = Math.max(12, fontSize * fitRatio);
      lineHeight = Math.max(1.0, lineHeight * Math.min(1, fitRatio + 0.05));
      width *= fitRatio;
      height *= fitRatio;
      steps++;
    }

    const shrinkStep =
      this.spec.typographyProfile?.personality === "MONUMENTAL"
        ? 0.88
        : 0.95;

    while ((width > input.safeWidth || height > input.safeHeight) && steps < 10) {
      fontSize = Math.max(12, fontSize * shrinkStep);
      lineHeight = Math.max(1.0, lineHeight * 0.98);
      width *= shrinkStep;
      height *= shrinkStep;
      steps++;
    }

    return {
      fontSize: Math.round(fontSize),
      lineHeight,
      fits: width <= input.safeWidth && height <= input.safeHeight,
      steps,
    };
  }



  loadManifest(manifest: SceneManifest): void {
    this.activeManifest = manifest;

    console.log("[HookDanceEngine] loadManifest:", {
      system: manifest.backgroundSystem,
      particles: manifest.particleConfig?.system,
      density: manifest.particleConfig?.density,
    });
  }

  resetPhysics() {
    this.integrator.reset();
    this.lastExternalBeatIntensity = 0;
  }

  /** Start the engine — seeks audio to hookStart and begins ticking */
  start() {
    if (this.running) return;
    this.running = true;
    this.audioPlaying = false;
    this.integrator.reset();
    this.lastExternalBeatIntensity = 0;
    this.beatIndex = 0;
    this.totalBeats = 0;
    this.prevTime = this.hookStart;
    this.syntheticStart = performance.now();

    // Enforce hook boundaries via timeupdate — most reliable loop mechanism
    this.boundTimeUpdate = () => {
      if (!this.running) return;
      const t = this.audioRef.currentTime;
      if (t >= this.hookEnd || t < this.hookStart - 0.5) {
        try { this.audioRef.currentTime = this.hookStart; } catch {}
      }
    };
    this.boundEnded = () => {
      if (!this.running) return;
      try { this.audioRef.currentTime = this.hookStart; } catch {}
      this.audioRef.play().catch(() => {});
    };
    this.audioRef.addEventListener("timeupdate", this.boundTimeUpdate);
    this.audioRef.addEventListener("ended", this.boundEnded);

    // Wait for audio to be seekable before seeking
    const trySeekAndPlay = () => {
      try {
        this.audioRef.currentTime = this.hookStart;
      } catch (e) {
        console.warn("[HookDanceEngine] seek failed, retrying after load:", e);
      }
      this.audioRef.play()
        .then(() => {
          this.audioPlaying = true;
          this.syntheticStart = performance.now() - (this.audioRef.currentTime - this.hookStart) * 1000;
          console.log("[HookDanceEngine] audio playing at", this.audioRef.currentTime.toFixed(2), "hook:", this.hookStart.toFixed(2), "-", this.hookEnd.toFixed(2));
        })
        .catch((e) => {
          this.audioPlaying = false;
          console.warn("[HookDanceEngine] audio play failed, using synthetic clock:", e);
        });
    };

    if (this.audioRef.readyState >= 1) {
      trySeekAndPlay();
    } else {
      this.audioRef.addEventListener("loadedmetadata", () => trySeekAndPlay(), { once: true });
    }

    this.tick();
  }

  /** Pause the engine — freezes animation but keeps state for resume */
  pause() {
    if (!this.running) return;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audioRef.pause();
  }

  /** Resume a paused engine */
  resume() {
    if (!this.running) return;
    if (this.rafId != null) return; // already ticking
    // Re-sync synthetic clock
    this.syntheticStart = performance.now() - (this.prevTime - this.hookStart) * 1000;
    this.audioRef.play().then(() => { this.audioPlaying = true; }).catch(() => { this.audioPlaying = false; });
    this.tick();
  }

  /** Stop the engine and clean up */
  stop() {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.boundTimeUpdate) {
      this.audioRef.removeEventListener("timeupdate", this.boundTimeUpdate);
      this.boundTimeUpdate = null;
    }
    if (this.boundEnded) {
      this.audioRef.removeEventListener("ended", this.boundEnded);
      this.boundEnded = null;
    }
    this.audioRef.pause();
    this.callbacks.onEnd();
  }

  /** Internal 60fps loop slaved to audio.currentTime — loops at hookEnd */
  private tick = () => {
    if (!this.running) return;

    const hookDuration = this.hookEnd - this.hookStart;

    // Use audio time if playing AND within hook range, otherwise synthetic clock
    let currentTime: number;
    const audioUsable = this.audioPlaying && !this.audioRef.paused && !isNaN(this.audioRef.currentTime);
    if (audioUsable && this.audioRef.currentTime >= this.hookStart && this.audioRef.currentTime <= this.hookEnd) {
      currentTime = this.audioRef.currentTime;
      // Keep synthetic clock synced so transitions are smooth
      this.syntheticStart = performance.now() - (currentTime - this.hookStart) * 1000;
    } else {
      const elapsed = (performance.now() - this.syntheticStart) / 1000;
      currentTime = this.hookStart + (elapsed % hookDuration);
      // If audio is playing but outside hook range, re-seek it
      if (audioUsable && (this.audioRef.currentTime < this.hookStart || this.audioRef.currentTime > this.hookEnd)) {
        try { this.audioRef.currentTime = this.hookStart; } catch {}
      }
    }

    // Loop back to hookStart when we reach hookEnd
    if (currentTime >= this.hookEnd) {
      try { this.audioRef.currentTime = this.hookStart; } catch {}
      this.audioRef.play()
        .then(() => { this.audioPlaying = true; })
        .catch(() => { this.audioPlaying = false; });
      this.integrator.reset();
      this.lastExternalBeatIntensity = 0;
      this.beatIndex = 0;
      this.prevTime = this.hookStart;
      this.syntheticStart = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    // Scan beats between prevTime and currentTime
    while (
      this.beatIndex < this.beats.length &&
      this.beats[this.beatIndex].time <= currentTime
    ) {
      const beat = this.beats[this.beatIndex];
      if (beat.time > this.prevTime) {
        this.integrator.onBeat(beat.strength, beat.isDownbeat);
        this.totalBeats++;
      }
      this.beatIndex++;
    }

    // Integrate one step
    const state = this.integrator.tick();

    // Emit
    this.callbacks.onFrame(state, currentTime, this.totalBeats);

    this.prevTime = currentTime;
    this.rafId = requestAnimationFrame(this.tick);
  };
}
