/**
 * PhysicsIntegrator — Spring-Damper model driven by beat impulses.
 *
 * Every beat from the BeatGrid acts as a force impulse applied to a
 * virtual mass-spring-damper system.  The integrator runs at a fixed
 * 60 fps timestep and outputs a deterministic PhysicsState that
 * downstream renderers can consume without any decision logic.
 */

const DT = 1 / 60; // fixed timestep (seconds)

// ── Public types ────────────────────────────────────────────────────────────

export interface PhysicsMaterial {
  mass: number;       // inertia — higher = slower response
  elasticity: number; // spring constant k — how hard it snaps back
  damping: number;    // viscous damping c — how fast vibration settles
  brittleness: number; // fracture threshold on |position|
  heat: number;       // initial thermal intensity (0–1)
}

export interface PhysicsResponse {
  beat_impulse: number;     // force multiplier for regular beats
  downbeat_impulse: number; // force multiplier for downbeats (bar start)
}

export interface PhysicsSpec {
  system: string; // "fracture" | "pressure" | "breath" | "combustion" | "orbit"
  params: Record<string, number>;
  palette: string[];
  // v6.0 pool-based fields
  effect_pool?: string[];
  logic_seed?: number;
  lexicon?: {
    semantic_tags?: { tag: string; strength: number }[];
    line_mods?: { t_lyric: number; mods: string[] }[];
    word_marks?: { t_lyric: number; wordIndex: number; mark: string }[];
  };
  // Legacy v5 fields (backwards compat)
  effect_sequence?: { line_index: number; effect_key: string }[];
  micro_surprise?: { every_n_beats: number; action: string };
  // Derived at construction time:
  material: PhysicsMaterial;
  response: PhysicsResponse;
}

export interface PhysicsState {
  /** 1 + |position| * 0.5 — scale factor for text / elements */
  scale: number;
  /** |velocity| * 2 — CSS blur radius hint (px) */
  blur: number;
  /** heat * 40 — glow radius (px) */
  glow: number;
  /** impulseNow * 10 — random-offset shake magnitude (px) */
  shake: number;
  /** true when |position| exceeds brittleness threshold */
  isFractured: boolean;
  /** raw values for advanced renderers */
  position: number;
  velocity: number;
  heat: number;
}

// ── Material presets derived from AI system label ────────────────────────────

const SYSTEM_PRESETS: Record<string, { material: PhysicsMaterial; response: PhysicsResponse }> = {
  fracture: {
    material: { mass: 0.8, elasticity: 6, damping: 0.3, brittleness: 0.9, heat: 0.2 },
    response: { beat_impulse: 1.8, downbeat_impulse: 3.5 },
  },
  pressure: {
    material: { mass: 2.0, elasticity: 4, damping: 0.4, brittleness: 1.5, heat: 0.1 },
    response: { beat_impulse: 1.2, downbeat_impulse: 2.8 },
  },
  breath: {
    material: { mass: 1.2, elasticity: 2, damping: 0.8, brittleness: 2.0, heat: 0.05 },
    response: { beat_impulse: 0.6, downbeat_impulse: 1.4 },
  },
  combustion: {
    material: { mass: 1.0, elasticity: 5, damping: 0.5, brittleness: 1.0, heat: 0.5 },
    response: { beat_impulse: 1.5, downbeat_impulse: 3.0 },
  },
  orbit: {
    material: { mass: 1.0, elasticity: 3, damping: 0.7, brittleness: 1.8, heat: 0.1 },
    response: { beat_impulse: 0.9, downbeat_impulse: 2.0 },
  },
};

// ── Deterministic PRNG (Mulberry32) ─────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string → 32-bit hash for seeding PRNG */
export function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ── Integrator ──────────────────────────────────────────────────────────────

export class PhysicsIntegrator {
  private position = 0;
  private velocity = 0;
  private heat: number;
  private stress = 0;
  private impulseNow = 0;

  public readonly spec: PhysicsSpec;

  constructor(rawSpec: PhysicsSpec) {
    // Hydrate material + response from system presets, merging AI params
    const preset = SYSTEM_PRESETS[rawSpec.system] ?? SYSTEM_PRESETS.pressure;
    const material: PhysicsMaterial = {
      ...preset.material,
      mass: rawSpec.params.mass ?? preset.material.mass,
      elasticity: rawSpec.params.elasticity ?? preset.material.elasticity,
      damping: rawSpec.params.damping ?? preset.material.damping,
      brittleness: rawSpec.params.brittleness ?? preset.material.brittleness,
      heat: rawSpec.params.heat ?? preset.material.heat,
    };
    this.spec = { ...rawSpec, material, response: preset.response };
    this.heat = material.heat;
  }

  /** Call when the audio playhead crosses a beat timestamp */
  onBeat(strength: number, isDownbeat: boolean) {
    const impulse = isDownbeat
      ? this.spec.response.downbeat_impulse
      : this.spec.response.beat_impulse;

    // F = ma  →  a = F/m
    const acceleration = (impulse * strength) / this.spec.material.mass;
    this.velocity += acceleration;

    // Increase thermal energy
    this.heat = Math.min(1, this.heat + 0.1 * impulse);
    this.impulseNow = impulse;
  }

  /** Advance one fixed-timestep frame and return the current state */
  tick(): PhysicsState {
    // Hooke's law:  F_spring = -k * x
    const springForce = -this.spec.material.elasticity * this.position;
    // Viscous damping: F_damp = -c * v
    const dampingForce = -this.spec.material.damping * this.velocity;

    // Semi-implicit Euler integration
    this.velocity += (springForce + dampingForce) * DT;
    this.position += this.velocity * DT;

    // Decay thermal & impulse
    this.heat *= 0.95;
    this.impulseNow *= 0.8;

    return {
      scale: 1 + Math.abs(this.position) * 0.5,
      blur: Math.abs(this.velocity) * 2,
      glow: this.heat * 40,
      shake: this.impulseNow * 10,
      isFractured: Math.abs(this.position) > this.spec.material.brittleness,
      position: this.position,
      velocity: this.velocity,
      heat: this.heat,
    };
  }

  /** Reset integrator to rest state */
  reset() {
    this.position = 0;
    this.velocity = 0;
    this.heat = this.spec.material.heat;
    this.stress = 0;
    this.impulseNow = 0;
  }
}
