function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }
  return color;
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
  const flicker = 0.85 + Math.sin(currentTime * 0.02 + index * 1.7) * 0.15;
  const radius = Math.max(0.8, size * flicker);

  ctx.save();
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.9);
  core.addColorStop(0, `rgba(255,255,255,${opacity})`);
  core.addColorStop(0.28, `rgba(255,188,74,${opacity * 0.95})`);
  core.addColorStop(0.65, `rgba(255,88,32,${opacity * 0.7})`);
  core.addColorStop(1, "rgba(190,20,0,0)");
  ctx.fillStyle = core;
  ctx.shadowColor = `rgba(255,120,40,${opacity})`;
  ctx.shadowBlur = radius * 2.2;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  index: number,
): void {
  const swell = 1 + clamp((Math.sin(currentTime * 0.003 + index * 0.4) + 1) * 0.12, 0, 0.24);
  const radius = Math.max(2, size * swell);

  ctx.save();
  ctx.filter = "blur(3px)";
  ctx.fillStyle = `rgba(60,50,40,${opacity * 0.55})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRainDrop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  speed: number,
): void {
  ctx.save();
  ctx.strokeStyle = `rgba(168,196,232,${opacity})`;
  ctx.lineWidth = Math.max(0.8, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + speed * 0.3, y + size * 4);
  ctx.stroke();
  ctx.restore();
}

export function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  index: number,
): void {
  const arm = Math.max(2, size * 1.8);
  const branch = arm * 0.35;
  const rotation = currentTime * 0.00025 + index * 0.15;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = `rgba(230,242,255,${opacity})`;
  ctx.lineWidth = Math.max(0.8, size * 0.12);

  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI * 2 * i) / 6;
    const ax = Math.cos(a) * arm;
    const ay = Math.sin(a) * arm;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    const bx = Math.cos(a) * (arm * 0.6);
    const by = Math.sin(a) * (arm * 0.6);
    const left = a - Math.PI / 6;
    const right = a + Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(left) * branch, by + Math.sin(left) * branch);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(right) * branch, by + Math.sin(right) * branch);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawFirefly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  index: number,
): void {
  const pulse = (Math.sin(currentTime * 0.004 + index * 1.4) + 1) * 0.5;
  const radius = Math.max(1.4, size * (0.85 + pulse * 0.35));

  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.3);
  glow.addColorStop(0, `rgba(255,255,255,${opacity})`);
  glow.addColorStop(0.45, `rgba(220,255,130,${opacity * (0.7 + pulse * 0.3)})`);
  glow.addColorStop(1, "rgba(170,255,68,0)");
  ctx.fillStyle = glow;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "#aaff44";
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
): void {
  const radius = Math.max(1.6, size);

  ctx.save();
  ctx.strokeStyle = `rgba(168,208,255,${opacity})`;
  ctx.lineWidth = Math.max(0.8, radius * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,255,255,${opacity * 0.8})`;
  ctx.lineWidth = Math.max(0.6, radius * 0.06);
  ctx.beginPath();
  ctx.arc(x - radius * 0.22, y - radius * 0.22, radius * 0.45, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();
}

export function drawCrystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  beatIntensity = 0,
): void {
  const twinkle = (Math.sin(currentTime * 0.004) + 1) * 0.5;
  const radius = Math.max(2, size);
  const flash = beatIntensity > 0.6 ? 0.35 + beatIntensity * 0.5 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);

  const fill = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * 1.2);
  fill.addColorStop(0, `rgba(255,255,255,${opacity * (0.8 + twinkle * 0.2)})`);
  fill.addColorStop(0.65, `rgba(160,220,255,${opacity * 0.9})`);
  fill.addColorStop(1, `rgba(120,190,245,${opacity * 0.65})`);

  ctx.fillStyle = fill;
  ctx.fillRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(-radius * 0.35, -radius * 0.35, radius * 0.7, radius * 0.7);
  }

  ctx.restore();
}

export function drawAsh(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  index: number,
): void {
  const driftX = Math.sin(currentTime * 0.004 + index * 2.3) * 0.8;
  const driftY = Math.cos(currentTime * 0.003 + index * 1.7) * 0.5;
  const radius = Math.max(1, size * 0.7);

  ctx.save();
  ctx.translate(x + driftX, y + driftY);
  ctx.fillStyle = `rgba(180,170,160,${opacity})`;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.7, -radius * 0.5);
  ctx.lineTo(radius * 0.8, -radius * 0.35);
  ctx.lineTo(radius * 0.55, radius * 0.9);
  ctx.lineTo(-radius * 0.9, radius * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawNeonOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  currentTime: number,
  color: string,
): void {
  const pulse = 0.85 + (Math.sin(currentTime * 0.005 + x * 0.01 + y * 0.01) + 1) * 0.2;
  const radius = Math.max(1.4, size * pulse);

  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
  g.addColorStop(0, withAlpha("#ffffff", opacity));
  g.addColorStop(0.38, withAlpha(color, opacity * 0.85));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.shadowColor = withAlpha(color, opacity);
  ctx.shadowBlur = size * 3;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
