/**
 * ExitEffect — Cinematic phrase exit animations.
 *
 * 9 effects picked randomly per phrase (no consecutive repeats):
 *   fade, drift_up, shrink, dissolve, cascade, scatter, slam, glitch, burn
 *
 * Called from LyricDancePlayer after main text draw.
 */

export type ExitEffectType =
  | 'fade' | 'drift_up' | 'shrink' | 'dissolve'
  | 'cascade' | 'scatter' | 'slam' | 'glitch' | 'burn';

const ALL_EFFECTS: ExitEffectType[] = [
  'fade', 'drift_up', 'shrink', 'dissolve',
  'cascade', 'scatter', 'slam', 'glitch', 'burn',
];

// Effects that split words into individual letters
const SPLIT_EFFECTS = new Set<ExitEffectType>(['cascade', 'scatter', 'slam']);

const MAX_EXIT_DURATION = 1.0;  // 1s max
const MIN_EXIT_DURATION = 0.3;  // 300ms min — shorter gaps get no exit
const COMPLEX_MIN_GAP = 0.5;    // split effects need 500ms+

/** Strip leading/trailing punctuation — matches LyricDancePlayer.stripDisplayPunctuation */
function stripPunctuation(text: string): string {
  return text
    .replace(/^[^a-zA-Z0-9']+/, '')
    .replace(/[^a-zA-Z0-9']+$/, '');
}

interface LetterData {
  char: string; x: number; cx: number; y: number; w: number; seed: number;
  vx: number; vy: number; rotation: number; rotSpeed: number; life: number;
}

interface ExitWord {
  text: string; x: number; y: number;
  fontSize: number; fontWeight: number; fontFamily: string; color: string;
}

interface ExitParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; color: string;
  type: 'ember' | 'smoke' | 'debris';
}

export class ExitEffect {
  private _active = false;
  private _effectType: ExitEffectType = 'fade';
  private _startTime = 0;
  private _duration = 0;
  private _words: ExitWord[] = [];
  private _letters: LetterData[] = [];
  private _particles: ExitParticle[] = [];
  private _slamLettersSpawned = false;
  private _canvasW = 0;
  private _canvasH = 0;
  private _lastEffect: ExitEffectType | null = null;
  private _smokeFrame = 0;

  get active(): boolean { return this._active; }

  /** Pick a random effect, avoiding the previous one */
  private _pickRandom(): ExitEffectType {
    const choices = ALL_EFFECTS.filter(e => e !== this._lastEffect);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    this._lastEffect = pick;
    return pick;
  }

  /**
   * Call when active group changes. Starts exit for the previous phrase.
   */
  onGroupChange(
    prevGroup: { end: number; words: Array<{ text: string; layoutX: number; layoutY: number; baseFontSize: number; fontWeight: number; fontFamily: string; color: string }> } | null,
    nextGroupStart: number,
    currentTime: number,
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    preferredEffect?: ExitEffectType,
  ): void {
    if (!prevGroup) return;

    const gap = nextGroupStart - prevGroup.end;
    const remainingGap = nextGroupStart - currentTime;
    if (gap < MIN_EXIT_DURATION || remainingGap < 0.1) {
      this._active = false;
      return;
    }

    let effect: ExitEffectType = preferredEffect && ALL_EFFECTS.includes(preferredEffect)
      ? preferredEffect
      : this._pickRandom();

    // Complex effects need more time — fall back to fade
    if (SPLIT_EFFECTS.has(effect) && gap < COMPLEX_MIN_GAP) {
      effect = 'fade';
      this._lastEffect = effect;
    }

    this._effectType = effect;
    this._active = true;
    this._startTime = currentTime;
    this._duration = Math.min(MAX_EXIT_DURATION, Math.max(0.15, remainingGap * 0.85));
    this._canvasW = canvasW;
    this._canvasH = canvasH;
    this._particles = [];
    this._slamLettersSpawned = false;
    this._smokeFrame = 0;

    // Cache words
    this._words = prevGroup.words.map(w => ({
      text: stripPunctuation(w.text), x: w.layoutX, y: w.layoutY,
      fontSize: w.baseFontSize, fontWeight: w.fontWeight,
      fontFamily: w.fontFamily, color: w.color,
    }));

    // Pre-compute letters for split effects
    this._letters = [];
    if (SPLIT_EFFECTS.has(this._effectType)) {
      for (const word of this._words) {
        ctx.save();
        ctx.font = `${word.fontWeight} ${word.fontSize}px ${word.fontFamily}`;
        const strippedText = stripPunctuation(word.text);
        const chars = strippedText.split('');
        const wordW = ctx.measureText(strippedText).width;
        let charX = word.x - wordW / 2;
        for (const ch of chars) {
          const cw = ctx.measureText(ch).width;
          this._letters.push({
            char: ch, x: charX, cx: charX + cw / 2, y: word.y, w: cw,
            seed: Math.random(), vx: 0, vy: 0, rotation: 0, rotSpeed: 0, life: 1,
          });
          charX += cw;
        }
        ctx.restore();
      }
    }
  }

  /**
   * Draw exit effect. Returns true if still animating.
   */
  draw(ctx: CanvasRenderingContext2D, currentTime: number, dpr: number): boolean {
    if (!this._active) return false;

    const elapsed = currentTime - this._startTime;
    if (elapsed < 0 || elapsed > this._duration + 0.3) {
      this._active = false;
      return false;
    }

    const t = Math.min(1, elapsed / this._duration);
    const W = this._canvasW;
    const H = this._canvasH;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    switch (this._effectType) {
      case 'fade': this._drawFade(ctx, t); break;
      case 'drift_up': this._drawDriftUp(ctx, t, W, H); break;
      case 'shrink': this._drawShrink(ctx, t, W, H); break;
      case 'dissolve': this._drawDissolve(ctx, t); break;
      case 'cascade': this._drawCascade(ctx, t, H); break;
      case 'scatter': this._drawScatter(ctx, t); break;
      case 'slam': this._drawSlam(ctx, t, W, H); break;
      case 'glitch': this._drawGlitch(ctx, t, W, H); break;
      case 'burn': this._drawBurn(ctx, t, W); break;
    }

    this._drawParticles(ctx);
    ctx.restore();
    return t < 1;
  }

  reset(): void {
    this._active = false;
    this._particles = [];
    this._letters = [];
    this._words = [];
    this._lastEffect = null;
  }

  // ── Helpers ──

  private _setFont(ctx: CanvasRenderingContext2D, w: ExitWord): void {
    ctx.font = `${w.fontWeight} ${w.fontSize}px ${w.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = w.color;
  }

  private _setLetterFont(ctx: CanvasRenderingContext2D): void {
    if (this._words.length === 0) return;
    const w = this._words[0];
    ctx.font = `${w.fontWeight} ${w.fontSize}px ${w.fontFamily}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = w.color;
  }

  // ── Effects ──

  private _drawFade(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.globalAlpha = Math.max(0, 1 - t);
    for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, w.y); }
    ctx.globalAlpha = 1;
  }

  private _drawDriftUp(ctx: CanvasRenderingContext2D, t: number, _W: number, H: number): void {
    const drift = Math.sqrt(t) * H * 0.08;
    const alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    ctx.globalAlpha = alpha;
    for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, w.y - drift); }
    ctx.globalAlpha = 1;

    // Smoke puffs
    this._smokeFrame++;
    if (t > 0.15 && t < 0.8 && this._smokeFrame % 3 === 0) {
      for (const w of this._words) {
        const tw = w.fontSize * w.text.length * 0.5;
        this._particles.push({
          x: w.x + (Math.random() - 0.5) * tw, y: w.y - drift + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 0.6, vy: -0.3 - Math.random() * 0.6,
          size: 10 + Math.random() * 16, life: 0.5 + Math.random() * 0.3,
          color: '#bbb', type: 'smoke',
        });
      }
    }
  }

  private _drawShrink(ctx: CanvasRenderingContext2D, t: number, W: number, H: number): void {
    const scale = Math.max(0.01, 1 - t * t);
    const alpha = Math.max(0, 1 - t * 1.5);
    const cx = this._words.length > 0 ? this._words.reduce((s, w) => s + w.x, 0) / this._words.length : W / 2;
    const cy = this._words.length > 0 ? this._words[0].y : H / 2;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, w.y); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  private _drawDissolve(ctx: CanvasRenderingContext2D, t: number): void {
    const alpha = Math.max(0, 1 - t * 2);
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, w.y); }
      ctx.globalAlpha = 1;
    }
    if (t < 0.6 && Math.random() < 0.5) {
      for (const w of this._words) {
        const tw = w.fontSize * w.text.length * 0.5;
        this._particles.push({
          x: w.x + (Math.random() - 0.5) * tw, y: w.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 1.5, vy: -0.8 - Math.random() * 2,
          size: 1 + Math.random() * 2, life: 0.4 + Math.random() * 0.4,
          color: '#fff', type: 'ember',
        });
      }
    }
  }

  private _drawCascade(ctx: CanvasRenderingContext2D, t: number, H: number): void {
    if (this._letters.length === 0) return;
    this._setLetterFont(ctx);
    const stagger = 0.6;
    const perDelay = this._letters.length > 1 ? stagger / (this._letters.length - 1) : 0;

    for (let i = 0; i < this._letters.length; i++) {
      const L = this._letters[i];
      const lt = Math.max(0, t - i * perDelay);
      const fallDur = 0.35;
      if (lt <= 0) {
        ctx.globalAlpha = 1; ctx.fillText(L.char, L.x, L.y);
      } else {
        const ft = Math.min(1, lt / fallDur);
        const dropY = ft * ft * H * 0.5;
        const rot = ft * (i % 2 === 0 ? 1 : -1) * (0.2 + L.seed * 0.3);
        const alpha = ft < 0.6 ? 1 : Math.max(0, 1 - (ft - 0.6) / 0.4);
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.translate(L.cx, L.y + dropY); ctx.rotate(rot); ctx.translate(-L.cx, -(L.y + dropY));
        ctx.fillText(L.char, L.x, L.y + dropY);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  private _drawScatter(ctx: CanvasRenderingContext2D, t: number): void {
    if (this._letters.length === 0) return;
    this._setLetterFont(ctx);
    const ease = t * t;
    for (let i = 0; i < this._letters.length; i++) {
      const L = this._letters[i];
      const angle = ((i / this._letters.length) * Math.PI * 2) + L.seed * 0.8;
      const dist = ease * (60 + L.seed * 50);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const rot = ease * (L.seed - 0.5) * 2;
      const alpha = Math.max(0, 1 - ease * 1.3);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(L.cx + dx, L.y + dy); ctx.rotate(rot); ctx.translate(-(L.cx + dx), -(L.y + dy));
      ctx.fillText(L.char, L.x + dx, L.y + dy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private _drawSlam(ctx: CanvasRenderingContext2D, t: number, W: number, H: number): void {
    const impactT = 0.25;
    const squashEnd = 0.35;
    const floorY = H * 0.75;
    const baseY = this._words.length > 0 ? this._words[0].y : H / 2;

    if (t < impactT) {
      const ft = t / impactT;
      const drop = ft * ft * (floorY - baseY);
      for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, w.y + drop); }
    } else if (t < squashEnd) {
      const st = (t - impactT) / (squashEnd - impactT);
      const squashX = 1 + Math.sin(st * Math.PI) * 0.4;
      const squashY = 1 - Math.sin(st * Math.PI) * 0.25;
      const cx = this._words.length > 0 ? this._words.reduce((s, w) => s + w.x, 0) / this._words.length : W / 2;
      ctx.save(); ctx.translate(cx, floorY); ctx.scale(squashX, squashY); ctx.translate(-cx, -floorY);
      for (const w of this._words) { this._setFont(ctx, w); ctx.fillText(w.text, w.x, floorY); }
      ctx.restore();

      if (!this._slamLettersSpawned) {
        this._slamLettersSpawned = true;
        for (const L of this._letters) {
          const angle = -Math.PI * (0.2 + Math.random() * 0.6);
          const speed = 3 + Math.random() * 6;
          L.vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 3;
          L.vy = Math.sin(angle) * speed;
          L.rotation = 0; L.rotSpeed = (Math.random() - 0.5) * 0.4; L.life = 1;
          L.y = floorY;
        }
        for (let i = 0; i < 30; i++) {
          const angle = -Math.PI * (0.1 + Math.random() * 0.8);
          const speed = 2 + Math.random() * 6;
          this._particles.push({
            x: cx + (Math.random() - 0.5) * 80, y: floorY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            size: 1 + Math.random() * 2, life: 0.3 + Math.random() * 0.4,
            color: '#fff', type: 'debris',
          });
        }
      }
    } else {
      this._setLetterFont(ctx);
      for (const L of this._letters) {
        L.x += L.vx; L.y += L.vy; L.vy += 0.25; L.vx *= 0.99;
        L.rotation += L.rotSpeed; L.life -= 0.018;
        if (L.life > 0) {
          ctx.save(); ctx.globalAlpha = Math.max(0, L.life);
          ctx.translate(L.cx, L.y); ctx.rotate(L.rotation);
          ctx.fillText(L.char, 0, 0); ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private _drawGlitch(ctx: CanvasRenderingContext2D, t: number, W: number, H: number): void {
    const intensity = t * t;
    const alpha = Math.max(0, 1 - t * t * 1.2);
    const burst = Math.sin(t * 40) * Math.sin(t * 17);

    for (const w of this._words) {
      this._setFont(ctx, w);
      const sliceCount = 5;
      const sliceH = w.fontSize * 1.4 / sliceCount;
      const baseY = w.y - w.fontSize * 0.7;

      for (let s = 0; s < sliceCount; s++) {
        const offset = (burst + Math.sin(t * 30 + s * 7)) * intensity * 20 * (s % 2 === 0 ? 1 : -1);
        ctx.save(); ctx.globalAlpha = alpha * (0.7 + Math.random() * 0.3);
        ctx.beginPath(); ctx.rect(0, baseY + s * sliceH, W, sliceH); ctx.clip();
        ctx.fillText(w.text, w.x + offset, w.y); ctx.restore();
      }
    }
    if (intensity > 0.4) {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = intensity * 0.12; ctx.fillStyle = '#fff';
        ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2);
      }
    }
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 1;
  }

  private _drawBurn(ctx: CanvasRenderingContext2D, t: number, W: number): void {
    for (const w of this._words) {
      this._setFont(ctx, w);
      const textTop = w.y - w.fontSize * 0.45;
      const textBot = w.y + w.fontSize * 0.45;
      const textH = textBot - textTop;
      const ashLine = textBot - t * textH * 1.3;
      const sliceCount = 10;
      const sliceH = textH / sliceCount;

      for (let s = 0; s < sliceCount; s++) {
        const sliceY = textTop + s * sliceH;
        const dist = ((sliceY + sliceH / 2) - ashLine) / (textH * 0.35);
        const ash = Math.max(0, Math.min(1, dist));
        if (ash >= 1) continue;

        let grey: number, a: number;
        if (ash < 0.3) { grey = Math.floor(255 - (ash / 0.3) * 100); a = 1; }
        else if (ash < 0.6) { grey = Math.floor(155 - ((ash - 0.3) / 0.3) * 95); a = 1; }
        else { const bt = (ash - 0.6) / 0.4; grey = Math.floor(60 - bt * 40); a = Math.max(0, 1 - bt * 1.5); }

        const jitter = ash > 0.1 && ash < 0.7
          ? (Math.sin(s * 13.7 + t * 20) * 0.5 + Math.sin(s * 7.3 + t * 35) * 0.3) * 1.5 : 0;

        ctx.save(); ctx.beginPath(); ctx.rect(0, sliceY, W, sliceH + 1); ctx.clip();
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${grey},${grey},${Math.min(255, grey + 10)})`;
        ctx.fillText(w.text, w.x, w.y + jitter); ctx.restore();
      }

      // White embers from ash line
      if (t > 0.1 && t < 0.9 && Math.random() < 0.3) {
        const tw = w.fontSize * w.text.length * 0.5;
        for (let i = 0; i < 2; i++) {
          this._particles.push({
            x: w.x + (Math.random() - 0.5) * tw, y: ashLine + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 1.2, vy: -1 - Math.random() * 2,
            size: 1 + Math.random() * 1.5, life: 0.3 + Math.random() * 0.3,
            color: '#fff', type: 'ember',
          });
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Particles ──

  private _drawParticles(ctx: CanvasRenderingContext2D): void {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx; p.y += p.vy;
      p.life -= p.type === 'smoke' ? 0.008 : 0.012;
      if (p.life <= 0) { this._particles.splice(i, 1); continue; }

      if (p.type === 'smoke') {
        p.vy -= 0.008; p.size += 0.4; p.vx *= 0.98;
        ctx.globalAlpha = p.life * 0.35;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, `rgba(200,200,215,${(p.life * 0.4).toFixed(2)})`);
        g.addColorStop(0.6, `rgba(150,150,170,${(p.life * 0.15).toFixed(2)})`);
        g.addColorStop(1, 'rgba(100,100,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        if (p.type === 'debris') p.vy += 0.1; else p.vy -= 0.015;
        p.vx *= 0.99;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = p.life * 0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
    if (this._particles.length > 100) this._particles = this._particles.slice(-100);
  }
}
