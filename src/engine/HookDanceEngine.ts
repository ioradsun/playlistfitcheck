/**
 * HookDanceEngine — Deterministic render loop slaved to audio.currentTime.
 *
 * Scans the BeatGrid for events between prev and current playhead,
 * fires impulses into the PhysicsIntegrator, and emits PhysicsState
 * via a callback every animation frame.
 *
 * Phase 2 only outputs state — Phase 3 will consume it for Canvas rendering.
 */

import {
  PhysicsIntegrator,
  mulberry32,
  hashSeed,
  type PhysicsSpec,
  type PhysicsState,
} from "./PhysicsIntegrator";

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

  /** Start the engine — seeks audio to hookStart and begins ticking */
  start() {
    if (this.running) return;
    this.running = true;
    this.audioPlaying = false;
    this.integrator.reset();
    this.beatIndex = 0;
    this.totalBeats = 0;
    this.prevTime = this.hookStart;
    this.syntheticStart = performance.now();

    // Seek audio
    this.audioRef.currentTime = this.hookStart;
    this.audioRef.play()
      .then(() => { this.audioPlaying = true; })
      .catch(() => { this.audioPlaying = false; });

    this.tick();
  }

  /** Stop the engine and clean up */
  stop() {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audioRef.pause();
    this.callbacks.onEnd();
  }

  /** Internal 60fps loop slaved to audio.currentTime — loops at hookEnd */
  private tick = () => {
    if (!this.running) return;

    const hookDuration = this.hookEnd - this.hookStart;

    // Use audio time if playing, otherwise synthetic clock
    let currentTime: number;
    if (this.audioPlaying && !isNaN(this.audioRef.currentTime) && this.audioRef.currentTime > 0) {
      currentTime = this.audioRef.currentTime;
    } else {
      const elapsed = (performance.now() - this.syntheticStart) / 1000;
      currentTime = this.hookStart + (elapsed % hookDuration);
    }

    // Loop back to hookStart when we reach hookEnd
    if (currentTime >= this.hookEnd || currentTime < this.hookStart) {
      this.audioRef.currentTime = this.hookStart;
      this.audioRef.play()
        .then(() => { this.audioPlaying = true; })
        .catch(() => { this.audioPlaying = false; });
      this.integrator.reset();
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
