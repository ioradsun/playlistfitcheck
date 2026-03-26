/**
 * FinaleEffect — Dynamite ending sequence.
 *
 * Phase 1: CRACKS (last 3.5s) — white fracture lines spread from center
 * Phase 2: SHATTER — canvas snapshot breaks into grid shards
 * Phase 3: SMOKE — embers + smoke fill the void
 * Phase 4: REFORM — scene fades back in, loop restarts
 */

interface CrackSegment { x1: number; y1: number; x2: number; y2: number; }
interface Crack { segments: CrackSegment[]; revealProgress: number; width: number; glowColor: string; }
interface Shard {
  sx: number; sy: number; sw: number; sh: number;
  x: number; y: number; vx: number; vy: number;
  rotation: number; rotSpeed: number; life: number; scale: number;
}
interface Ember {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; color: string;
  trail: Array<{ x: number; y: number }>;
}
interface SmokePuff {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; opacity: number; color: string;
}

const CRACK_DURATION = 3.5;
const SHATTER_DURATION = 2.0;
const REFORM_DURATION = 1.2;
const GRID_X = 6;
const GRID_Y = 4;

export type FinalePhase = "inactive" | "cracking" | "shatter" | "reform";

export class FinaleEffect {
  private cracks: Crack[] = [];
  private shards: Shard[] = [];
  private embers: Ember[] = [];
  private smokes: SmokePuff[] = [];
  private crackIntensity = 0;
  private snapshot: HTMLCanvasElement | null = null;
  private shattered = false;
  private _phase: FinalePhase = "inactive";

  get phase(): FinalePhase { return this._phase; }

  /** Call every frame. Returns true if finale is active (caller should skip normal draw). */
  update(
    tSec: number,
    songEndSec: number,
    songDuration: number,
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    W: number,
    H: number,
    dpr: number,
  ): boolean {
    const timeToEnd = songEndSec - tSec;
    const isRegionLoop = songDuration < 10;

    if (timeToEnd > CRACK_DURATION || timeToEnd < -SHATTER_DURATION - REFORM_DURATION || isRegionLoop) {
      if (this._phase !== "inactive") this.reset();
      return false;
    }

    if (timeToEnd > 0 && timeToEnd <= CRACK_DURATION) {
      this._phase = "cracking";
      this.crackIntensity = 1 - (timeToEnd / CRACK_DURATION);
      this._growCracks(W, H);
      this._drawCracks(ctx, W, H);

      if (this.crackIntensity > 0.7) {
        const glowA = (this.crackIntensity - 0.7) / 0.3;
        const gG = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.2 * glowA);
        gG.addColorStop(0, `rgba(255,255,255,${(glowA * 0.4).toFixed(2)})`);
        gG.addColorStop(0.5, `rgba(200,200,255,${(glowA * 0.15).toFixed(2)})`);
        gG.addColorStop(1, "rgba(180,180,255,0)");
        ctx.fillStyle = gG;
        ctx.fillRect(0, 0, W, H);
      }

      if (this.crackIntensity > 0.95 && !this.snapshot) {
        this.snapshot = document.createElement("canvas");
        this.snapshot.width = canvas.width;
        this.snapshot.height = canvas.height;
        this.snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
      }

      return false;
    }

    if (timeToEnd <= 0 && timeToEnd > -SHATTER_DURATION) {
      this._phase = "shatter";
      const blowElapsed = -timeToEnd;

      if (!this.shattered) {
        this.shattered = true;
        this._spawnShards(W, H);
        this._spawnEmbers(W, H);
        this._spawnSmoke(W, H);
      }

      if (blowElapsed < 0.15) {
        ctx.fillStyle = `rgba(255,255,255,${((0.15 - blowElapsed) / 0.15 * 0.85).toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);

        const glowFade = Math.max(0, 1 - blowElapsed / 1.5);
        if (glowFade > 0) {
          const gG = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.3);
          gG.addColorStop(0, `rgba(200,200,255,${(glowFade * 0.25).toFixed(2)})`);
          gG.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gG;
          ctx.fillRect(0, 0, W, H);
        }
      }

      this._updateAndDrawShards(ctx, dpr);
      this._updateAndDrawSmoke(ctx);
      this._updateAndDrawEmbers(ctx);

      return true;
    }

    if (timeToEnd <= -SHATTER_DURATION) {
      this._phase = "reform";
      return false;
    }

    return false;
  }

  /** Reform progress: 0 (just started reforming) → 1 (fully reformed). */
  getReformProgress(tSec: number, songEndSec: number): number {
    const blowElapsed = tSec - songEndSec;
    if (blowElapsed < SHATTER_DURATION) return 0;
    return Math.min(1, (blowElapsed - SHATTER_DURATION) / REFORM_DURATION);
  }

  /** Screen shake amount for current phase. Caller adds to camShakeX/Y. */
  getShake(tSec: number, songEndSec: number): { x: number; y: number } {
    const timeToEnd = songEndSec - tSec;
    if (this._phase === "cracking") {
      const amt = this.crackIntensity * this.crackIntensity * 4;
      return { x: (Math.random() - 0.5) * amt * 2, y: (Math.random() - 0.5) * amt * 2 };
    }
    if (this._phase === "shatter") {
      const blowElapsed = -timeToEnd;
      const amt = blowElapsed < 0.8 ? 18 * (1 - blowElapsed / 0.8) : 0;
      return { x: (Math.random() - 0.5) * amt * 2, y: (Math.random() - 0.5) * amt * 2 };
    }
    return { x: 0, y: 0 };
  }

  reset(): void {
    this.cracks = [];
    this.shards = [];
    this.embers = [];
    this.smokes = [];
    this.crackIntensity = 0;
    this.snapshot = null;
    this.shattered = false;
    this._phase = "inactive";
  }

  private _growCracks(W: number, H: number): void {
    const intensity = this.crackIntensity;
    if (Math.random() < intensity * 0.4) {
      const originAngle = Math.random() * Math.PI * 2;
      const startDist = intensity * Math.max(W, H) * 0.3;
      const sx = W / 2 + Math.cos(originAngle) * startDist * (0.3 + Math.random() * 0.7);
      const sy = H / 2 + Math.sin(originAngle) * startDist * (0.3 + Math.random() * 0.7);

      const segments: CrackSegment[] = [];
      let cx = sx;
      let cy = sy;
      const mainAngle = originAngle + (Math.random() - 0.5) * 1.5;
      const segCount = 4 + Math.floor(Math.random() * 8);

      for (let i = 0; i < segCount; i++) {
        const segLen = 8 + Math.random() * 25 + intensity * 15;
        const angle = mainAngle + (Math.random() - 0.5) * 1.2;
        const nx = cx + Math.cos(angle) * segLen;
        const ny = cy + Math.sin(angle) * segLen;
        segments.push({ x1: cx, y1: cy, x2: nx, y2: ny });
        cx = nx;
        cy = ny;

        if (Math.random() < 0.35 * intensity) {
          const bAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.8);
          const bLen = 5 + Math.random() * 15;
          segments.push({ x1: cx, y1: cy, x2: cx + Math.cos(bAngle) * bLen, y2: cy + Math.sin(bAngle) * bLen });
        }
      }

      this.cracks.push({
        segments,
        revealProgress: 0,
        width: 1 + Math.random() * 2 * intensity,
        glowColor: Math.random() > 0.5 ? "#ffffff" : "#e0e0ff",
      });
    }

    for (const crack of this.cracks) {
      crack.revealProgress = Math.min(1, crack.revealProgress + 0.02 + intensity * 0.03);
    }
  }

  private _drawCracks(ctx: CanvasRenderingContext2D, _W: number, _H: number): void {
    for (const crack of this.cracks) {
      const visibleSegs = Math.ceil(crack.segments.length * crack.revealProgress);

      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = crack.width + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < visibleSegs && i < crack.segments.length; i++) {
        const s = crack.segments[i];
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = crack.width * 0.8;
      ctx.globalAlpha = 0.8 + this.crackIntensity * 0.2;
      ctx.beginPath();
      for (let i = 0; i < visibleSegs && i < crack.segments.length; i++) {
        const s = crack.segments[i];
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();

      ctx.strokeStyle = crack.glowColor;
      ctx.lineWidth = crack.width * 4;
      ctx.globalAlpha = 0.08 + this.crackIntensity * 0.12;
      ctx.beginPath();
      for (let i = 0; i < visibleSegs && i < crack.segments.length; i++) {
        const s = crack.segments[i];
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private _spawnShards(W: number, H: number): void {
    const cellW = W / GRID_X;
    const cellH = H / GRID_Y;
    for (let gx = 0; gx < GRID_X; gx++) {
      for (let gy = 0; gy < GRID_Y; gy++) {
        const cx = (gx + 0.5) * cellW;
        const cy = (gy + 0.5) * cellH;
        const angle = Math.atan2(cy - H / 2, cx - W / 2) + (Math.random() - 0.5) * 0.5;
        const dist = Math.sqrt((cx - W / 2) ** 2 + (cy - H / 2) ** 2);
        const speed = 2 + (dist / Math.max(W, H)) * 8 + Math.random() * 3;
        this.shards.push({
          sx: gx * cellW,
          sy: gy * cellH,
          sw: cellW,
          sh: cellH,
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          rotation: 0,
          rotSpeed: (Math.random() - 0.5) * 0.15,
          life: 1,
          scale: 1,
        });
      }
    }
  }

  private _updateAndDrawShards(ctx: CanvasRenderingContext2D, dpr: number): void {
    if (!this.snapshot) return;
    for (const shard of this.shards) {
      shard.x += shard.vx;
      shard.y += shard.vy;
      shard.vy += 0.06;
      shard.vx *= 0.995;
      shard.rotation += shard.rotSpeed;
      shard.life -= 0.008;
      shard.scale *= 0.998;
      if (shard.life <= 0) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, shard.life);
      ctx.translate(shard.x * dpr, shard.y * dpr);
      ctx.rotate(shard.rotation);
      ctx.scale(shard.scale, shard.scale);
      ctx.drawImage(
        this.snapshot,
        shard.sx * dpr,
        shard.sy * dpr,
        shard.sw * dpr,
        shard.sh * dpr,
        -shard.sw * dpr / 2,
        -shard.sh * dpr / 2,
        shard.sw * dpr,
        shard.sh * dpr,
      );
      ctx.restore();
    }
  }

  private _spawnEmbers(W: number, H: number): void {
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 8;
      this.embers.push({
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H / 2 + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 2,
        size: 1 + Math.random() * 4,
        life: 0.6 + Math.random() * 0.4,
        color: ["#ffffff", "#e0e0ff", "#c0c0ff", "#a0a0ff", "#fff"][Math.floor(Math.random() * 5)],
        trail: [],
      });
    }
  }

  private _updateAndDrawEmbers(ctx: CanvasRenderingContext2D): void {
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.vx;
      e.y += e.vy;
      e.vy += 0.04;
      e.vx *= 0.998;
      e.life -= 0.006;
      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > 8) e.trail.shift();

      if (e.life <= 0) {
        this.embers.splice(i, 1);
        continue;
      }

      if (e.trail.length > 1) {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.size * 0.4 * e.life;
        ctx.globalAlpha = e.life * 0.4;
        ctx.beginPath();
        ctx.moveTo(e.trail[0].x, e.trail[0].y);
        for (const tp of e.trail) ctx.lineTo(tp.x, tp.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }

      ctx.globalAlpha = e.life;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * e.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = e.life * 0.4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * e.life * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private _spawnSmoke(W: number, H: number): void {
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.smokes.push({
        x: W / 2 + (Math.random() - 0.5) * 100,
        y: H / 2 + (Math.random() - 0.5) * 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3 - Math.random() * 0.5,
        size: 30 + Math.random() * 60,
        life: 0.8 + Math.random() * 0.2,
        opacity: 0.4 + Math.random() * 0.3,
        color: Math.random() > 0.4 ? "#555" : "#888",
      });
    }
  }

  private _updateAndDrawSmoke(ctx: CanvasRenderingContext2D): void {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy -= 0.01;
      s.vx *= 0.99;
      s.size += 0.8;
      s.life -= 0.005;
      s.opacity *= 0.995;

      if (s.life <= 0) {
        this.smokes.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = s.opacity * s.life;
      const sG = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
      sG.addColorStop(0, s.color);
      sG.addColorStop(0.6, `${s.color}80`);
      sG.addColorStop(1, "transparent");
      ctx.fillStyle = sG;
      ctx.fillRect(s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
    }
    ctx.globalAlpha = 1;
  }
}
