// removed duplicate import line
import type { ParticleConfig, SceneManifest } from "./SceneManifest";
import {
  drawAsh,
  drawBubble,
  drawCrystal,
  drawEmber,
  drawFirefly,
  drawNeonOrb,
  drawRainDrop,
  drawSmoke,
  drawSnowflake,
} from "./ElementalRenderers";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  depth: number;
  active: boolean;
  phase: number;
  aux: number;
  aux2: number;
}

interface ParticleSpawnOverrides {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  size?: number;
  opacity?: number;
  life?: number;
  rotation?: number;
  rotationSpeed?: number;
  depth?: number;
}

type ParticleLayer = "all" | "far" | "near";

interface LightningBranch {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface LightningBolt {
  points: Array<{ x: number; y: number }>;
  branches: LightningBranch[];
  framesLeft: number;
}

export const PARTICLE_SYSTEM_MAP = {
  embers: "EMBERS",
  smoke: "SMOKE",
  ash: "ASH",
  rain: "RAIN",
  snow: "SNOW",
  lightning: "LIGHTNING",
  fireflies: "FIREFLIES",
  stars: "STARS",
  petals: "PETALS",
  dust: "DUST",
  bubbles: "BUBBLES",
  glitch: "GLITCH_PIXELS",
  confetti: "CONFETTI",
  crystals: "CRYSTALS",
  moths: "MOTHS",
  fire: "EMBERS",
  sparks: "EMBERS",
  cinders: "EMBERS",
  haze: "SMOKE",
  fog: "SMOKE",
  mist: "SMOKE",
  drizzle: "RAIN",
  downpour: "RAIN",
  blizzard: "SNOW",
  flurries: "SNOW",
  storm: "LIGHTNING",
  thunder: "LIGHTNING",
  shimmer: "FIREFLIES",
  orbs: "FIREFLIES",
  constellation: "STARS",
  galaxy: "STARS",
  sakura: "PETALS",
  leaves: "PETALS",
  sand: "DUST",
  particles: "DUST",
  static: "GLITCH_PIXELS",
  noise: "GLITCH_PIXELS",
  ice: "CRYSTALS",
  frost: "CRYSTALS",
} as const;

const PARTICLE_LIMITS = {
  mobile: 30,
  tablet: 60,
  desktop: 100,
  highEnd: 150,
} as const;

function getMaxParticles(): number {
  if (typeof window === "undefined") return PARTICLE_LIMITS.desktop;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = window.innerWidth < 768;
  if (mobile) return PARTICLE_LIMITS.mobile;
  if (cores <= 4) return PARTICLE_LIMITS.tablet;
  if (cores <= 8) return PARTICLE_LIMITS.desktop;
  return PARTICLE_LIMITS.highEnd;
}

const MAX_PARTICLES = Math.max(PARTICLE_LIMITS.highEnd, 200);
const FOREGROUND_ALLOWED = new Set(["snow", "petals", "ash", "confetti", "crystals"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ParticleEngine {
  private maxParticles = getMaxParticles();
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    decay: 0.01,
    size: 1,
    rotation: 0,
    rotationSpeed: 0,
    opacity: 0,
    depth: 0,
    active: false,
    phase: 0,
    aux: 0,
    aux2: 0,
  }));
  private config: ParticleConfig;
  private manifest: SceneManifest;
  private bounds: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private safeZone: Rect = { x: -1, y: -1, w: 0, h: 0 };
  private beatBoostFrames = 0;
  private time = 0;
  private lastBeatIntensity = 0;
  private lightning: LightningBolt[] = [];
  private densityMultiplier = 1;
  private speedMultiplier = 1;
  private gravityMultiplier = 1;
  private behaviorHint: string | null = null;
  private updateFrameSkip = 1;
  private updateFrameCounter = 0;

  constructor(manifest: SceneManifest) {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
  }

  setManifest(manifest: SceneManifest): void {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
  }

  setConfig(config: ParticleConfig): void {
    this.config = config;
  }


  setSystem(system: string): void {
    this.config = { ...this.config, system: system as ParticleConfig["system"] };
    this.clear();
    // Warm-spawn initial particles for the new system
    const warmCount = Math.floor(this.maxParticles * this.config.density * 0.3);
    for (let i = 0; i < warmCount; i++) {
      this.spawnParticles(0);
    }
  }

  setDensityMultiplier(multiplier: number): void {
    this.densityMultiplier = clamp(multiplier, 0.1, 4);
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = clamp(multiplier, 0.1, 4);
  }

  setBehaviorHint(hint: string | null): void {
    this.behaviorHint = hint;
  }

  setUpdateFrameSkip(frameSkip: number): void {
    this.updateFrameSkip = Math.max(1, Math.floor(frameSkip));
  }

  setChapterDirective(directive: string): void {
    const d = directive.toLowerCase();
    this.speedMultiplier = 1;
    this.densityMultiplier = 1;

    if (d.includes("drift") || d.includes("slow")) {
      this.speedMultiplier = 0.4;
      this.densityMultiplier = 0.5;
    } else if (d.includes("swirl") || d.includes("vortex") || d.includes("faster")) {
      this.speedMultiplier = 1.4;
      this.densityMultiplier = 0.8;
    } else if (d.includes("dense") || d.includes("consuming") || d.includes("absorb")) {
      this.densityMultiplier = 1.4;
      this.speedMultiplier = 0.6;
    } else if (d.includes("sparse") || d.includes("barely")) {
      this.densityMultiplier = 0.2;
      this.speedMultiplier = 0.3;
    }

    if (d.includes("downward") || d.includes("drawn down")) {
      this.gravityMultiplier = 1.5;
    } else if (d.includes("upward") || d.includes("rising")) {
      this.gravityMultiplier = -0.5;
    } else {
      this.gravityMultiplier = 1;
    }
  }

  /** Public accessor: count of currently active particles */
  getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) count++;
    return count;
  }

  /** Public accessor: current config snapshot */
  getConfig(): ParticleConfig {
    return this.config;
  }


  init(config: ParticleConfig, manifest: SceneManifest): void {
    this.config = config;
    this.manifest = manifest;
    this.maxParticles = getMaxParticles();
    this.clear();

    const warmCount = Math.floor(this.maxParticles * config.density * 0.3);
    for (let i = 0; i < warmCount; i++) {
      const slot = this.getFreeSlot();
      if (slot) this.spawnParticle(slot);
    }
  }

  clear(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
      this.pool[i].life = 0;
    }
    this.lightning = [];
  }

  setBounds(bounds: Rect): void {
    this.bounds = bounds;
  }

  setLyricSafeZone(x: number, y: number, w: number, h: number): void {
    this.safeZone.x = x;
    this.safeZone.y = y;
    this.safeZone.w = w;
    this.safeZone.h = h;
  }

  update(deltaMs: number, beatIntensity: number, nextConfig?: ParticleConfig): void {
    this.maxParticles = getMaxParticles();
    this.enforceParticleLimit();
    this.time += deltaMs;
    this.updateFrameCounter += 1;
    if (this.updateFrameCounter % this.updateFrameSkip !== 0) return;
    if (nextConfig) this.config = nextConfig;
    if (this.config.system === "none") return;

    const dt = deltaMs / 16.67;
    const onBeat = beatIntensity > 0.6 && this.lastBeatIntensity <= 0.6;
    if (beatIntensity > 0.7 && this.config.beatReactive) {
      this.beatBoostFrames = Math.max(this.beatBoostFrames, 10);
    }

    this.spawnParticles(beatIntensity);

    if (this.config.system === "lightning" && beatIntensity > 0.8 && this.lastBeatIntensity <= 0.8) {
      this.lightning.push(this.createLightningBolt());
    }

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      this.updateParticleBySystem(p, dt, beatIntensity, onBeat);
      p.vy += 0.02 * (this.gravityMultiplier - 1) * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.phase += 0.02 * dt;
      p.life -= p.decay * dt;

      if (
        p.life <= 0 ||
        p.x < this.bounds.x - 120 ||
        p.x > this.bounds.x + this.bounds.w + 120 ||
        p.y < this.bounds.y - 120 ||
        p.y > this.bounds.y + this.bounds.h + 120
      ) {
        p.active = false;
      }
    }

    this.lightning = this.lightning
      .map((bolt) => ({ ...bolt, framesLeft: bolt.framesLeft - 1 }))
      .filter((bolt) => bolt.framesLeft > 0);

    this.beatBoostFrames = Math.max(0, this.beatBoostFrames - 1);
    this.lastBeatIntensity = beatIntensity;
  }

  draw(ctx: CanvasRenderingContext2D, layer: ParticleLayer = "all"): void {
    if (this.config.system === "none") return;
    ctx.save();

    const system = this.config.system;
    const canBatch = system === "rain" || system === "stars" || system === "dust";

    if (canBatch) {
      const groups = new Map<string, Path2D>();

      const pushToGroup = (key: string, build: (p: Path2D) => void) => {
        let path = groups.get(key);
        if (!path) {
          path = new Path2D();
          groups.set(key, path);
        }
        build(path);
      };

      for (let i = 0; i < this.pool.length; i++) {
        const p = this.pool[i];
        if (!p.active) continue;
        if (layer === "far" && p.depth >= 0.5) continue;
        if (layer === "near" && p.depth < 0.5) continue;

        let alpha = p.opacity * p.life * this.config.opacity * (0.7 + p.depth * 0.3);
        const inSafe =
          p.x >= this.safeZone.x &&
          p.x <= this.safeZone.x + this.safeZone.w &&
          p.y >= this.safeZone.y &&
          p.y <= this.safeZone.y + this.safeZone.h;
        if (inSafe) alpha *= 0.3;
        if (alpha < 0.004) continue;

        const alphaBucket = Math.round(alpha * 10) / 10;
        if (alphaBucket <= 0) continue;

        const depthScale = 0.8 + p.depth * 0.2;
        const s = p.size * depthScale;

        if (system === "rain") {
          const key = `rain_${alphaBucket}`;
          pushToGroup(key, (path) => {
            path.moveTo(p.x, p.y);
            path.lineTo(p.x + p.vy * 0.3, p.y + s * 4);
          });
        } else if (system === "stars") {
          const key = `stars_${alphaBucket}`;
          pushToGroup(key, (path) => {
            path.moveTo(p.x + s, p.y);
            path.arc(p.x, p.y, s, 0, Math.PI * 2);
          });
        } else if (system === "dust") {
          const key = `dust_${alphaBucket}`;
          pushToGroup(key, (path) => {
            path.moveTo(p.x + s, p.y);
            path.arc(p.x, p.y, s, 0, Math.PI * 2);
          });
        }
      }

      groups.forEach((path, key) => {
        const [kind, alphaStr] = key.split("_");
        ctx.globalAlpha = Number(alphaStr);
        if (kind === "rain") {
          ctx.strokeStyle = "rgba(168,196,232,1)";
          ctx.lineWidth = 1;
          ctx.stroke(path);
        } else if (kind === "stars") {
          ctx.fillStyle = "#ffffff";
          ctx.fill(path);
        } else if (kind === "dust") {
          ctx.fillStyle = "rgba(200,180,140,0.8)";
          ctx.fill(path);
        }
      });

      ctx.restore();
      return;
    }

    // Fallback for all other particle systems
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (layer === "far" && p.depth >= 0.5) continue;
      if (layer === "near" && p.depth < 0.5) continue;

      let alpha = p.opacity * p.life * this.config.opacity * (0.7 + p.depth * 0.3);
      const inSafe =
        p.x >= this.safeZone.x &&
        p.x <= this.safeZone.x + this.safeZone.w &&
        p.y >= this.safeZone.y &&
        p.y <= this.safeZone.y + this.safeZone.h;
      if (inSafe) alpha *= 0.3;
      if (alpha < 0.004) continue;

      ctx.globalAlpha = alpha;
      this.drawParticleBySystem(ctx, p, 0.8 + p.depth * 0.2);
    }

    if (this.config.system === "lightning") {
      this.drawLightning(ctx);
    }

    ctx.restore();
  }

  shouldRenderForeground(): boolean {
    return this.config.foreground && FOREGROUND_ALLOWED.has(this.config.system);
  }

  private targetActiveCount(): number {
    const d = clamp(this.config.density * this.densityMultiplier, 0, 1.5);
    return Math.floor(20 + d * 520);
  }

  private spawnParticles(beatIntensity: number): void {
    const target = Math.min(this.maxParticles, this.targetActiveCount());
    let active = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) active++;
    let needed = target - active;
    if (this.beatBoostFrames > 0 && this.config.beatReactive) needed = Math.floor(needed * 1.8);
    if (this.config.system === "embers" && beatIntensity > 0.75) needed += 8;
    if (this.config.system === "confetti" && beatIntensity > 0.7) needed += 5;

    for (let i = 0; i < this.pool.length && needed > 0; i++) {
      if (this.pool[i].active) continue;
      this.spawnParticle(this.pool[i]);
      needed -= 1;
    }
  }

  private getFreeSlot(): Particle | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  private spawnParticle(particle: Particle, overrides?: ParticleSpawnOverrides): void {
    this.spawnForSystem(particle);
    particle.depth = overrides?.depth ?? Math.random();
    particle.x = overrides?.x ?? particle.x;
    particle.y = overrides?.y ?? particle.y;
    particle.vx = overrides?.vx ?? particle.vx;
    particle.vy = overrides?.vy ?? particle.vy;
    particle.size = overrides?.size ?? particle.size;
    particle.opacity = overrides?.opacity ?? particle.opacity;
    particle.life = overrides?.life ?? particle.life;
    particle.rotation = overrides?.rotation ?? particle.rotation;
    particle.rotationSpeed = overrides?.rotationSpeed ?? particle.rotationSpeed;
    particle.active = true;
  }

  private spawnForSystem(p: Particle): void {
    const b = this.bounds;
    const speed = (0.5 + this.config.speed) * this.speedMultiplier;
    p.life = 1;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.08;
    p.opacity = 0.8;
    p.decay = 0.01;
    p.phase = Math.random() * Math.PI * 2;
    p.aux = Math.random();
    p.aux2 = Math.random();

    switch (this.config.system) {
      case "embers":
        p.x = b.x + b.w * (0.2 + Math.random() * 0.6);
        p.y = b.y + b.h * (0.78 + Math.random() * 0.25);
        p.vx = (Math.random() - 0.5) * 2.4 * speed;
        p.vy = -(2.6 + Math.random() * 3.2 * speed);
        p.size = 2 + Math.random() * 3;
        p.opacity = 0.75 + Math.random() * 0.25;
        p.decay = 0.015;
        break;
      case "smoke": {
        const isRainMist = this.config.renderStyle === "rain-mist";
        p.x = b.x + b.w * (0.1 + Math.random() * 0.8);
        p.y = isRainMist ? b.y + b.h * (0.2 + Math.random() * 0.6) : b.y + b.h + 10;
        p.vx = (Math.random() - 0.5) * (isRainMist ? 0.45 : 0.9);
        p.vy = isRainMist ? (Math.random() - 0.5) * 0.16 : -(0.3 + Math.random() * 0.8 * speed);
        p.size = isRainMist ? 6 + Math.random() * 8 : 12 + Math.random() * 16;
        p.opacity = isRainMist ? 0.2 : 0.35;
        p.decay = isRainMist ? 0.0035 : 0.005;
        break;
      }
      case "ash":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 16;
        p.vx = (Math.random() - 0.5) * 1.4;
        p.vy = 1 + Math.random() * 2.4 * speed;
        p.size = 2 + Math.random() * 3;
        p.decay = 0.007;
        p.rotationSpeed = (Math.random() - 0.5) * 0.2;
        break;
      case "rain": {
        const stormHint = (this.behaviorHint ?? "").toLowerCase().includes("storm");
        const isDrizzle = this.config.renderStyle === "rain-drizzle";
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 20;
        p.vx = (isDrizzle ? 1.2 : 2.1) * speed + Math.random() * (isDrizzle ? 0.4 : 0.9) * speed;
        p.vy = (isDrizzle ? 5.5 : 9.2) * speed + Math.random() * (isDrizzle ? 2.8 : 6.8) * speed;
        if (stormHint) p.vy *= 1.25;
        p.size = isDrizzle ? 7 + Math.random() * 5 : 10 + Math.random() * 9;
        p.opacity = isDrizzle ? 0.5 : 0.72;
        p.decay = isDrizzle ? 0.024 : 0.035;
        break;
      }
      case "snow":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 10;
        p.vx = (Math.random() - 0.5) * 0.8;
        p.vy = 0.7 + Math.random() * 1.1 * speed;
        p.size = 3 + Math.random() * 4;
        p.decay = 0.004;
        p.aux = Math.random() * 150;
        break;
      case "lightning":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + Math.random() * b.h * 0.4;
        p.vx = 0;
        p.vy = 0;
        p.size = 1 + Math.random();
        p.opacity = 0;
        p.decay = 0.2;
        break;
      case "fireflies":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + Math.random() * b.h;
        p.vx = (Math.random() - 0.5) * 0.6;
        p.vy = (Math.random() - 0.5) * 0.6;
        p.size = 3 + Math.random() * 3;
        p.opacity = 0.7;
        p.decay = 0.003;
        break;
      case "stars":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + Math.random() * b.h;
        p.vx = Math.random() < 0.65 ? 0 : (Math.random() - 0.5) * 0.12;
        p.vy = Math.random() < 0.65 ? 0 : (Math.random() - 0.5) * 0.06;
        p.size = 1 + Math.random() * 2;
        p.opacity = 0.5 + Math.random() * 0.5;
        p.decay = 0.001;
        break;
      case "petals":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 12;
        p.vx = (Math.random() - 0.5) * 0.9;
        p.vy = 0.8 + Math.random() * 1.1 * speed;
        p.size = 6 + Math.random() * 6;
        p.decay = 0.0045;
        p.rotationSpeed = (Math.random() - 0.5) * 0.1;
        break;
      case "dust":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + b.h * (0.2 + Math.random() * 0.6);
        p.vx = (0.25 + Math.random() * 0.35) * this.getWindDirection();
        p.vy = 0;
        p.size = 2 + Math.random() * 4;
        p.opacity = 0.35;
        p.decay = 0.002;
        break;
      case "bubbles":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + b.h + 8;
        p.vx = (Math.random() - 0.5) * 0.6;
        p.vy = -(0.5 + Math.random() * 1.1 * speed);
        p.size = 8 + Math.random() * 12;
        p.opacity = 0.4;
        p.decay = 0.005;
        break;
      case "glitch":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + Math.random() * b.h;
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = (Math.random() - 0.5) * 0.5;
        p.size = 4 + Math.random() * 8;
        p.opacity = 0;
        p.decay = 0.02;
        break;
      case "confetti":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 10;
        p.vx = (Math.random() - 0.5) * 1.8;
        p.vy = 1.6 + Math.random() * 2.2 * speed;
        p.size = 6 + Math.random() * 4;
        p.decay = 0.007;
        p.rotationSpeed = (Math.random() - 0.5) * 0.3;
        break;
      case "crystals":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 12;
        p.vx = (Math.random() - 0.5) * 0.7;
        p.vy = 0.9 + Math.random() * 1.3 * speed;
        p.size = 4 + Math.random() * 6;
        p.decay = 0.005;
        p.rotationSpeed = (Math.random() - 0.5) * 0.08;
        break;
      case "moths":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y + Math.random() * b.h;
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = (Math.random() - 0.5) * 0.5;
        p.size = 8 + Math.random() * 7;
        p.opacity = 0.55;
        p.decay = 0.004;
        break;
      default:
        p.active = false;
    }
  }

  private updateParticleBySystem(p: Particle, dt: number, beatIntensity: number, onBeat: boolean): void {
    const beatPulse = this.config.beatReactive ? beatIntensity : 0;
    switch (this.config.system) {
      case "embers":
        if ((this.behaviorHint ?? "").toLowerCase().includes("frantic")) {
          p.vx += (Math.random() - 0.5) * 0.2;
        }
        if (Math.random() < 0.02) p.vx += (Math.random() - 0.5) * 1.5;
        p.vx += (Math.random() - 0.5) * 0.08;
        p.vy -= 0.02;
        if (beatIntensity > 0.7) p.opacity = Math.min(1.35, p.opacity + beatIntensity * 0.08);
        break;
      case "smoke":
        p.size += this.config.renderStyle === "burn-smoke" ? 0.05 * dt : 0.02 * dt;
        p.vx += (Math.random() - 0.5) * (this.config.renderStyle === "rain-mist" ? 0.02 : 0.03);
        p.opacity *= this.config.renderStyle === "rain-mist" ? 0.998 : 0.996;
        break;
      case "ash":
        p.vx += (Math.random() - 0.5) * 0.04;
        p.vy = Math.max(0.4, p.vy + 0.006);
        break;
      case "rain":
        p.vx += (Math.random() - 0.5) * (this.config.renderStyle === "rain-drizzle" ? 0.015 : 0.03);
        break;
      case "snow":
        if (p.aux > 0) {
          p.aux -= dt;
          p.vy *= 0.98;
        } else if (Math.random() < 0.0015) {
          p.aux = 20 + Math.random() * 40;
        }
        p.vx += Math.sin(this.time * 0.001 + p.phase) * 0.02;
        break;
      case "fireflies":
        p.vx += Math.sin(this.time * 0.002 + p.phase) * 0.02;
        p.vy += Math.cos(this.time * 0.0022 + p.phase) * 0.02;
        p.vx = clamp(p.vx, -1.2, 1.2);
        p.vy = clamp(p.vy, -1.2, 1.2);
        break;
      case "stars":
        p.opacity = clamp(0.35 + 0.55 * ((Math.sin(this.time * 0.0025 + p.phase * 2) + 1) * 0.5), 0.2, 1);
        break;
      case "petals":
        p.vx += Math.sin(this.time * 0.0018 + p.phase) * 0.02;
        break;
      case "dust":
        p.vx += (this.getWindDirection() * 0.01 - p.vx) * 0.03;
        p.vy = 0;
        break;
      case "bubbles":
        p.vx += Math.sin(this.time * 0.0018 + p.phase) * 0.02;
        break;
      case "glitch":
        p.opacity = beatIntensity > 0.6 ? 0.85 : 0;
        if (onBeat && beatIntensity > 0.6) {
          p.x = this.bounds.x + Math.random() * this.bounds.w;
          p.y = this.bounds.y + Math.random() * this.bounds.h;
        }
        break;
      case "confetti":
        if (p.y > this.bounds.y + this.bounds.h - 4 && p.vy > 0) {
          p.vy *= -0.35;
          p.vx *= 0.8;
        }
        p.vy += 0.03;
        p.rotationSpeed += (Math.random() - 0.5) * 0.01;
        break;
      case "crystals":
        if (beatPulse > 0.75) {
          p.opacity = Math.min(1.3, p.opacity + 0.25);
        }
        break;
      case "moths": {
        const lx = this.bounds.x + this.bounds.w * 0.5;
        const ly = this.bounds.y + this.bounds.h * 0.2;
        const dx = lx - p.x;
        const dy = ly - p.y;
        const d = Math.max(30, Math.hypot(dx, dy));
        p.vx += (dx / d) * 0.03 + Math.sin(this.time * 0.004 + p.phase) * 0.05;
        p.vy += (dy / d) * 0.02 + Math.sin(this.time * 0.003 + p.phase) * Math.cos(this.time * 0.002 + p.phase) * 0.05;
        p.vx = clamp(p.vx, -1.2, 1.2);
        p.vy = clamp(p.vy, -1.2, 1.2);
        break;
      }
      default:
        break;
    }
  }

  private drawParticleBySystem(ctx: CanvasRenderingContext2D, p: Particle, depthScale: number): void {
    const s = p.size * depthScale;
    switch (this.config.system) {
      case "embers":
        drawEmber(ctx, p.x, p.y, s * 0.7, 1, this.time, p.phase);
        break;
      case "smoke":
        drawSmoke(ctx, p.x, p.y, s, 1, this.time, p.phase);
        break;
      case "ash":
        drawAsh(ctx, p.x, p.y, s, 1, this.time, p.phase);
        break;
      case "rain":
        drawRainDrop(ctx, p.x, p.y, s, 1, p.vy);
        break;
      case "snow":
        drawSnowflake(ctx, p.x + Math.sin(this.time * 0.0015 + p.phase) * 2.5, p.y, s * 0.8, 1, this.time, p.phase);
        break;
      case "lightning":
        break;
      case "fireflies": {
        const fx = p.x + Math.sin(this.time * 0.002 + p.phase) * 4;
        const fy = p.y + Math.cos(this.time * 0.0018 + p.phase) * 3;
        drawFirefly(ctx, fx, fy, s, 1, this.time, p.phase);
        break;
      }
      case "stars":
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "petals":
        ctx.fillStyle = p.aux > 0.5 ? "#ffb7c5" : "#fff5e4";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case "dust":
        ctx.fillStyle = "rgba(200,180,140,0.8)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "bubbles":
        drawBubble(ctx, p.x + Math.sin(this.time * 0.002 + p.phase) * 2, p.y, s, 0.7);
        break;
      case "glitch": {
        const palette = ["#ff3b30", "#34c759", "#0a84ff", "#ffd60a", "#bf5af2"];
        const color = palette[Math.floor(Math.random() * palette.length)];
        const o = Math.max(1, Math.floor(s * 0.1));
        ctx.fillStyle = "rgba(255,0,0,0.55)";
        ctx.fillRect(p.x - o, p.y, s, s * 0.65);
        ctx.fillStyle = "rgba(0,255,255,0.55)";
        ctx.fillRect(p.x + o, p.y, s, s * 0.65);
        ctx.fillStyle = color;
        ctx.fillRect(p.x, p.y, s, s * 0.65);
        break;
      }
      case "confetti": {
        const hue = Math.floor((p.phase * 190 + this.time * 0.05) % 360);
        ctx.fillStyle = `hsl(${hue} 90% 60%)`;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
        ctx.restore();
        break;
      }
      case "crystals": {
        const beat = this.beatBoostFrames > 0 ? 1 : 0;
        drawCrystal(ctx, p.x, p.y, s, 1, this.time + p.rotation * 1000, beat);
        break;
      }
      case "moths":
        ctx.fillStyle = "rgba(200,180,140,0.7)";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.ellipse(-s * 0.35, 0, s * 0.5, s * 0.25, 0, 0, Math.PI * 2);
        ctx.ellipse(s * 0.35, 0, s * 0.5, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      default: {
        drawNeonOrb(ctx, p.x, p.y, s, 1, this.time, this.config.color);
      }
    }
  }


  private enforceParticleLimit(): void {
    let active = 0;
    for (let i = 0; i < this.pool.length; i += 1) {
      if (this.pool[i].active) active += 1;
    }
    if (active <= this.maxParticles) return;

    for (let i = 0; i < this.pool.length && active > this.maxParticles; i += 1) {
      if (!this.pool[i].active) continue;
      this.pool[i].active = false;
      this.pool[i].life = 0;
      active -= 1;
    }
  }

  private createLightningBolt(): LightningBolt {
    const startX = this.bounds.x + Math.random() * this.bounds.w;
    const startY = this.bounds.y;
    const targetX = this.bounds.x + Math.random() * this.bounds.w;
    const targetY = this.bounds.y + this.bounds.h * (0.35 + Math.random() * 0.45);
    const segments = 7 + Math.floor(Math.random() * 4);
    const points: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x = startX + (targetX - startX) * t + (Math.random() - 0.5) * 22;
      const y = startY + (targetY - startY) * t;
      points.push({ x, y });
    }

    const branches: LightningBranch[] = [];
    const branchCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branchCount; i++) {
      const index = 1 + Math.floor(Math.random() * (points.length - 2));
      const pivot = points[index];
      branches.push({
        fromX: pivot.x,
        fromY: pivot.y,
        toX: pivot.x + (Math.random() - 0.5) * 70,
        toY: pivot.y + 20 + Math.random() * 65,
      });
    }

    return { points, branches, framesLeft: 2 + Math.floor(Math.random() * 2) };
  }

  private drawLightning(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.lightning.length; i++) {
      const bolt = this.lightning[i];
      const alpha = Math.max(0.2, bolt.framesLeft / 3);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = bolt.framesLeft % 2 === 0 ? "#ffffff" : "#a0c4ff";
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      for (let j = 0; j < bolt.points.length; j++) {
        const pt = bolt.points[j];
        if (j === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      ctx.lineWidth = 1;
      for (let j = 0; j < bolt.branches.length; j++) {
        const branch = bolt.branches[j];
        ctx.beginPath();
        ctx.moveTo(branch.fromX, branch.fromY);
        ctx.lineTo(branch.toX, branch.toY);
        ctx.stroke();
      }
    }
  }

  private getWindDirection(): number {
    const source = this.manifest.lightSource.toLowerCase();
    if (source.includes("east") || source.includes("right")) return 1;
    if (source.includes("west") || source.includes("left")) return -1;
    if (source.includes("north")) return 0.6;
    if (source.includes("south")) return -0.6;
    return source.length % 2 === 0 ? 1 : -1;
  }
}
