import type { ParticleConfig, SceneManifest } from "./SceneManifest";

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

const MAX_PARTICLES =
  typeof window !== "undefined" && window.devicePixelRatio > 2 ? 300 : 600;
const FOREGROUND_ALLOWED = new Set(["snow", "petals", "ash", "confetti", "crystals"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): [number, number, number] {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff";
  return [
    parseInt(safe.slice(1, 3), 16),
    parseInt(safe.slice(3, 5), 16),
    parseInt(safe.slice(5, 7), 16),
  ];
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class ParticleEngine {
  private readonly maxParticles = MAX_PARTICLES;
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

  constructor(manifest: SceneManifest) {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
  }

  setManifest(manifest: SceneManifest): void {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
  }

  init(config: ParticleConfig, manifest: SceneManifest): void {
    this.config = config;
    this.manifest = manifest;
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

  update(deltaMs: number, beatIntensity: number): void {
    this.time += deltaMs;
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

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (layer === "far" && p.depth >= 0.5) continue;
      if (layer === "near" && p.depth < 0.5) continue;

      let alpha = p.opacity * p.life * this.config.opacity * (0.55 + p.depth * 0.45);
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
    const d = clamp(this.config.density, 0, 1);
    return Math.floor(20 + d * 520);
  }

  private spawnParticles(beatIntensity: number): void {
    const target = Math.min(MAX_PARTICLES, this.targetActiveCount());
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
    const speed = 0.5 + this.config.speed;
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
      case "smoke":
        p.x = b.x + b.w * (0.2 + Math.random() * 0.6);
        p.y = b.y + b.h + 10;
        p.vx = (Math.random() - 0.5) * 0.9;
        p.vy = -(0.3 + Math.random() * 0.8 * speed);
        p.size = 8 + Math.random() * 12;
        p.opacity = 0.35;
        p.decay = 0.005;
        break;
      case "ash":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 16;
        p.vx = (Math.random() - 0.5) * 1.4;
        p.vy = 1 + Math.random() * 2.4 * speed;
        p.size = 3 + Math.random() * 5;
        p.decay = 0.007;
        p.rotationSpeed = (Math.random() - 0.5) * 0.2;
        break;
      case "rain":
        p.x = b.x + Math.random() * b.w;
        p.y = b.y - 20;
        p.vx = (1.8 + Math.random() * 0.8) * speed;
        p.vy = (8 + Math.random() * 7) * speed;
        p.size = 8 + Math.random() * 7;
        p.opacity = 0.7;
        p.decay = 0.03;
        break;
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
        if (Math.random() < 0.02) p.vx += (Math.random() - 0.5) * 1.5;
        p.vx += (Math.random() - 0.5) * 0.08;
        p.vy -= 0.02;
        if (beatIntensity > 0.7) p.opacity = Math.min(1.35, p.opacity + beatIntensity * 0.08);
        break;
      case "smoke":
        p.size += 0.03 * dt;
        p.vx += (Math.random() - 0.5) * 0.03;
        p.opacity *= 0.996;
        break;
      case "ash":
        p.vx += (Math.random() - 0.5) * 0.04;
        break;
      case "rain":
        p.vx += (Math.random() - 0.5) * 0.03;
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
      case "embers": {
        const flicker = (Math.sin(this.time * 0.02 + p.phase * 5) + 1) * 0.5;
        ctx.fillStyle = lerpColor([255, 140, 66], [255, 255, 255], flicker);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "smoke":
        ctx.fillStyle = "rgba(60,50,40,0.75)";
        ctx.filter = `blur(${3 + p.depth * 3}px)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.filter = "none";
        break;
      case "ash":
        ctx.fillStyle = "rgba(180,170,160,0.9)";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, -s * 0.3);
        ctx.lineTo(s * 0.4, -s * 0.6);
        ctx.lineTo(s * 0.8, s * 0.2);
        ctx.lineTo(-s * 0.1, s * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      case "rain":
        ctx.strokeStyle = "rgba(168,196,232,0.9)";
        ctx.lineWidth = Math.max(1, s * 0.15);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.55, p.y + s);
        ctx.stroke();
        break;
      case "snow":
        ctx.fillStyle = "rgba(220,235,255,0.85)";
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(this.time * 0.0015 + p.phase) * 2.5, p.y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "lightning":
        break;
      case "fireflies": {
        const c = lerpColor([170, 255, 68], [255, 255, 136], (Math.sin(this.time * 0.005 + p.phase * 5) + 1) * 0.5);
        ctx.fillStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(this.time * 0.002 + p.phase) * 4, p.y + Math.cos(this.time * 0.0018 + p.phase) * 3, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
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
        ctx.strokeStyle = "rgba(150,200,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(this.time * 0.002 + p.phase) * 2, p.y, s, 0, Math.PI * 2);
        ctx.stroke();
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
        const flicker = this.beatBoostFrames > 0 ? 0.8 : 0.35;
        ctx.fillStyle = lerpColor([168, 216, 234], [255, 255, 255], flicker);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((Math.PI / 4) + p.rotation);
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
        ctx.restore();
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
        const [r, g, b] = parseHex(this.config.color);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
      }
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
