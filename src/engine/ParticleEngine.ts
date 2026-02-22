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
  active: boolean;
}

interface LightRay {
  angle: number;
  width: number;
  length: number;
  jitter: number;
}

const MAX_PARTICLES = (typeof window !== "undefined" && window.devicePixelRatio > 2) ? 300 : 600;
const FOREGROUND_ALLOWED = new Set(["snow", "petals", "light-rays", "ash"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): [number, number, number] {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff";
  return [parseInt(safe.slice(1, 3), 16), parseInt(safe.slice(3, 5), 16), parseInt(safe.slice(5, 7), 16)];
}

export class ParticleEngine {
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 0.01, size: 1, rotation: 0, rotationSpeed: 0, opacity: 0, active: false,
  }));
  private config: ParticleConfig;
  private manifest: SceneManifest;
  private bounds: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private safeZone: Rect = { x: -1, y: -1, w: 0, h: 0 };
  private beatBoostFrames = 0;
  private time = 0;
  private readonly noiseData: Uint8ClampedArray = new Uint8ClampedArray(4 * 256 * 256);
  private noiseW = 256;
  private noiseH = 256;
  private readonly rays: LightRay[] = Array.from({ length: 16 }, (_, i) => ({ angle: (Math.PI * 2 * i) / 16, width: 2 + (i % 7), length: 0.35 + (i % 5) * 0.08, jitter: i * 0.43 }));

  constructor(manifest: SceneManifest) {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
  }

  setManifest(manifest: SceneManifest): void {
    this.manifest = manifest;
    this.config = manifest.particleConfig;
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
    if (this.config.system === "none" || this.config.system === "light-rays" || this.config.system === "static-noise") return;
    const dt = deltaMs / 16.67;
    if (beatIntensity > 0.7 && this.config.beatReactive) this.beatBoostFrames = Math.max(this.beatBoostFrames, 10);

    this.spawnParticles(beatIntensity);
    const sway = Math.sin(this.time * 0.0015);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this.config.system === "snow" || this.config.system === "petals" || this.config.system === "ash") p.x += sway * (0.3 + p.size * 0.05);
      if (this.config.system === "smoke") p.size += 0.03 * dt;
      p.rotation += p.rotationSpeed * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.x < this.bounds.x - 80 || p.x > this.bounds.x + this.bounds.w + 80 || p.y < this.bounds.y - 100 || p.y > this.bounds.y + this.bounds.h + 100) p.active = false;
    }
    this.beatBoostFrames = Math.max(0, this.beatBoostFrames - 1);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.config.system === "none") return;
    ctx.save();
    if (this.config.system === "light-rays") {
      this.renderLightRays(ctx);
      ctx.restore();
      return;
    }
    if (this.config.system === "static-noise") {
      this.renderStaticNoise(ctx);
      ctx.restore();
      return;
    }

    const [r, g, b] = parseHex(this.config.color);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      let alpha = p.opacity * p.life * this.config.opacity;
      const inSafe = p.x >= this.safeZone.x && p.x <= this.safeZone.x + this.safeZone.w && p.y >= this.safeZone.y && p.y <= this.safeZone.y + this.safeZone.h;
      if (inSafe) alpha *= 0.3;
      if (alpha < 0.005) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      this.drawParticle(ctx, p);
    }
    ctx.restore();
  }

  shouldRenderForeground(): boolean {
    return this.config.foreground && FOREGROUND_ALLOWED.has(this.config.system);
  }

  private targetActiveCount(): number {
    const d = clamp(this.config.density, 0, 1);
    if (d <= 0.2) return Math.floor(20 + (d / 0.2) * 40);
    if (d <= 0.5) return Math.floor(60 + ((d - 0.2) / 0.3) * 90);
    if (d <= 0.8) return Math.floor(150 + ((d - 0.5) / 0.3) * 150);
    return Math.floor(300 + ((d - 0.8) / 0.2) * 300);
  }

  private spawnParticles(beatIntensity: number): void {
    const target = Math.min(MAX_PARTICLES, this.targetActiveCount());
    let active = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) active++;
    let needed = target - active;
    if (this.beatBoostFrames > 0 && this.config.beatReactive) needed = Math.floor(needed * 2);
    if (beatIntensity > 0.8 && this.config.system === "sparks") needed += 12;
    if (beatIntensity > 0.75 && this.config.system === "embers") needed += 6;
    if (needed <= 0) return;

    for (let i = 0; i < this.pool.length && needed > 0; i++) {
      const p = this.pool[i];
      if (p.active) continue;
      this.spawnForSystem(p);
      p.active = true;
      needed--;
    }
  }

  private spawnForSystem(p: Particle): void {
    const b = this.bounds;
    const speed = 0.6 + this.config.speed;
    p.life = 1;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.08;
    p.opacity = 0.6;
    p.decay = 0.01;

    switch (this.config.system) {
      case "rain": p.x = b.x + Math.random() * b.w; p.y = b.y - 20; p.vx = 0.8 * speed; p.vy = 8 + Math.random() * 6 * speed; p.size = 8 + Math.random() * 12; p.decay = 0.03; break;
      case "snow": p.x = b.x + Math.random() * b.w; p.y = b.y - 10; p.vx = (Math.random() - 0.5) * 1.2 * speed; p.vy = 1.2 + Math.random() * 1.2 * speed; p.size = 1 + Math.random() * 3; p.decay = 0.004; break;
      case "embers": p.x = b.x + b.w * 0.2 + Math.random() * b.w * 0.6; p.y = b.y + b.h * 0.8 + Math.random() * b.h * 0.2; p.vx = (Math.random() - 0.5) * 1.4; p.vy = -(1 + Math.random() * 2.5 * speed); p.size = 1 + Math.random() * 2; p.decay = 0.02; break;
      case "flames": p.x = b.x + Math.random() * b.w; p.y = b.y + b.h + 10; p.vx = (Math.random() - 0.5) * 2.2; p.vy = -(2 + Math.random() * 4 * speed); p.size = 5 + Math.random() * 8; p.decay = 0.035; break;
      case "dust": p.x = b.x + Math.random() * b.w; p.y = b.y + b.h * (0.3 + Math.random() * 0.4); p.vx = (Math.random() - 0.5) * 0.9; p.vy = 0.05 + Math.random() * 0.15; p.size = 1 + Math.random() * 2; p.opacity = 0.25; p.decay = 0.003; break;
      case "smoke": p.x = b.x + Math.random() * b.w; p.y = b.y + b.h + 20; p.vx = (Math.random() - 0.5) * 1.3; p.vy = -(0.7 + Math.random() * 1.2); p.size = 15 + Math.random() * 25; p.opacity = 0.1; p.decay = 0.006; break;
      case "sparks": p.x = b.x + b.w * (0.4 + Math.random() * 0.2); p.y = b.y + b.h * (0.4 + Math.random() * 0.2); p.vx = (Math.random() - 0.5) * 8 * speed; p.vy = (Math.random() - 0.5) * 8 * speed; p.size = 1 + Math.random(); p.decay = 0.06; break;
      case "petals": p.x = b.x + Math.random() * b.w; p.y = b.y - 10; p.vx = (Math.random() - 0.5) * 1.1; p.vy = 0.6 + Math.random() * 1.1 * speed; p.size = 3 + Math.random() * 5; p.rotationSpeed = (Math.random() - 0.5) * 0.15; p.decay = 0.005; break;
      case "ash": p.x = b.x + Math.random() * b.w; p.y = b.y - 10; p.vx = (Math.random() - 0.5) * 1.5; p.vy = 0.8 + Math.random() * 1.8 * speed; p.size = 1 + Math.random() * 3; p.decay = 0.008; break;
      case "bubbles": p.x = b.x + Math.random() * b.w; p.y = b.y + b.h + 8; p.vx = (Math.random() - 0.5) * 0.8; p.vy = -(0.5 + Math.random() * 1.1 * speed); p.size = 4 + Math.random() * 8; p.opacity = 0.35; p.decay = 0.006; break;
      default: p.active = false;
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    switch (this.config.system) {
      case "rain": ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 1.5, p.y + p.size); ctx.stroke(); break;
      case "sparks": ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.6, p.y - p.vy * 0.6); ctx.stroke(); break;
      case "petals":
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      case "flames":
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + p.vx * 3, p.y - p.size * 0.6, p.x + p.vx, p.y - p.size * 1.5); ctx.lineWidth = Math.max(1, p.size * 0.2); ctx.stroke();
        break;
      case "bubbles": ctx.lineWidth = 1.25; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  private renderLightRays(ctx: CanvasRenderingContext2D): void {
    const [r, g, b] = parseHex(this.config.color);
    const cx = this.bounds.x + this.bounds.w / 2;
    const cy = this.bounds.y + this.bounds.h * 0.2;
    const beat = this.config.beatReactive ? this.beatBoostFrames * 0.01 : 0;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      const flicker = 0.03 + ((Math.sin(this.time * 0.002 + ray.jitter) + 1) * 0.5) * 0.05 + beat;
      ctx.globalAlpha = flicker * this.config.opacity;
      ctx.lineWidth = ray.width;
      const len = this.bounds.h * ray.length;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ray.angle) * len, cy + Math.sin(ray.angle) * len);
      ctx.stroke();
    }
  }

  private renderStaticNoise(ctx: CanvasRenderingContext2D): void {
    const [r, g, b] = parseHex(this.config.color);
    const intensity = Math.max(0.01, this.config.opacity * (this.config.beatReactive ? 1 + this.beatBoostFrames * 0.1 : 1));
    for (let i = 0; i < this.noiseData.length; i += 4) {
      const on = Math.random() < intensity * 0.06;
      this.noiseData[i] = on ? r : 0;
      this.noiseData[i + 1] = on ? g : 0;
      this.noiseData[i + 2] = on ? b : 0;
      this.noiseData[i + 3] = on ? Math.floor(255 * intensity) : 0;
    }
    const imageData = new ImageData(new Uint8ClampedArray(this.noiseData.buffer as ArrayBuffer), this.noiseW, this.noiseH);
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);
  }
}
