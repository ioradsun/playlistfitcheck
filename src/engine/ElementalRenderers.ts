const spriteCache = new Map<string, HTMLCanvasElement>();

function makeFallbackSprite(size: number, color: string): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  const d = Math.max(4, size * 4);
  sprite.width = d;
  sprite.height = d;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(d / 2, d / 2, d / 4, 0, Math.PI * 2);
  ctx.fill();
  return sprite;
}

export function getSprite(type: string, size: number, color: string): HTMLCanvasElement {
  const safeSize = Math.max(1, size);
  const key = `${type}_${safeSize}_${color}`;
  const existing = spriteCache.get(key);
  if (existing) return existing;

  const sprite = document.createElement("canvas");
  sprite.width = safeSize * 4;
  sprite.height = safeSize * 4;
  const sCtx = sprite.getContext("2d");
  if (!sCtx) {
    return makeFallbackSprite(safeSize, "rgba(255,255,255,0.4)");
  }

  const cx = safeSize * 2;
  const cy = safeSize * 2;

  if (type === "ember") {
    const grad = sCtx.createRadialGradient(cx, cy, 0, cx, cy, safeSize * 2);
    grad.addColorStop(0, "rgba(255,255,200,1)");
    grad.addColorStop(0.3, "rgba(255,180,0,0.9)");
    grad.addColorStop(0.7, "rgba(255,60,0,0.5)");
    grad.addColorStop(1, "rgba(100,0,0,0)");
    sCtx.beginPath();
    sCtx.arc(cx, cy, safeSize * 2, 0, Math.PI * 2);
    sCtx.fillStyle = grad;
    sCtx.fill();
  }

  if (type === "bubble") {
    sCtx.beginPath();
    sCtx.arc(cx, cy, safeSize * 1.5, 0, Math.PI * 2);
    sCtx.strokeStyle = "rgba(150,200,255,0.6)";
    sCtx.lineWidth = 1;
    sCtx.stroke();

    sCtx.beginPath();
    sCtx.arc(cx - safeSize * 0.4, cy - safeSize * 0.4, safeSize * 0.3, 0, Math.PI * 2);
    sCtx.fillStyle = "rgba(255,255,255,0.4)";
    sCtx.fill();
  }

  if (type === "firefly") {
    const grad = sCtx.createRadialGradient(cx, cy, 0, cx, cy, safeSize * 2);
    grad.addColorStop(0, "rgba(200,255,100,1)");
    grad.addColorStop(0.5, "rgba(150,255,50,0.5)");
    grad.addColorStop(1, "rgba(0,255,0,0)");
    sCtx.beginPath();
    sCtx.arc(cx, cy, safeSize * 2, 0, Math.PI * 2);
    sCtx.fillStyle = grad;
    sCtx.fill();
  }

  if (type === "snowflake") {
    sCtx.strokeStyle = "rgba(200,230,255,0.8)";
    sCtx.lineWidth = 1;
    for (let arm = 0; arm < 6; arm += 1) {
      const angle = (arm / 6) * Math.PI * 2;
      sCtx.beginPath();
      sCtx.moveTo(cx, cy);
      sCtx.lineTo(cx + Math.cos(angle) * safeSize * 1.8, cy + Math.sin(angle) * safeSize * 1.8);
      sCtx.stroke();
    }
  }

  if (type === "ash") {
    sCtx.beginPath();
    sCtx.ellipse(cx, cy, safeSize * 1.2, safeSize * 0.8, 0.3, 0, Math.PI * 2);
    sCtx.fillStyle = "rgba(180,170,160,0.6)";
    sCtx.fill();
  }

  if (type === "crystal") {
    sCtx.save();
    sCtx.translate(cx, cy);
    sCtx.rotate(Math.PI / 4);
    sCtx.fillStyle = "rgba(180,220,255,0.8)";
    sCtx.fillRect(-safeSize, -safeSize, safeSize * 2, safeSize * 2);
    sCtx.restore();
  }

  if (type === "smoke") {
    const grad = sCtx.createRadialGradient(cx, cy, 0, cx, cy, safeSize * 2);
    grad.addColorStop(0, "rgba(140,130,120,0.55)");
    grad.addColorStop(0.6, "rgba(120,115,110,0.28)");
    grad.addColorStop(1, "rgba(110,105,100,0)");
    sCtx.beginPath();
    sCtx.arc(cx, cy, safeSize * 2, 0, Math.PI * 2);
    sCtx.fillStyle = grad;
    sCtx.fill();
  }

  spriteCache.set(key, sprite);
  return sprite;
}

export function drawEmber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  index: number,
): void {
  const flicker = 0.7 + Math.sin(currentTime * 12 + index * 2.3) * 0.3;
  const sprite = getSprite("ember", Math.ceil(size), "fire");
  const alpha = Math.max(0, opacity * flicker);
  if (alpha <= 0) return;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(sprite, x - size * 2, y - size * 2, size * 4, size * 4);
  ctx.globalAlpha /= alpha;
}

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
): void {
  const sprite = getSprite("bubble", Math.ceil(size), "water");
  const alpha = Math.max(0, opacity);
  if (alpha <= 0) return;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(sprite, x - size * 2, y - size * 2, size * 4, size * 4);
  ctx.globalAlpha /= alpha;
}

export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
): void {
  const sprite = getSprite("smoke", Math.ceil(size), "smoke");
  const alpha = Math.max(0, opacity);
  if (alpha <= 0) return;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(sprite, x - size * 2, y - size * 2, size * 4, size * 4);
  ctx.globalAlpha /= alpha;
}
