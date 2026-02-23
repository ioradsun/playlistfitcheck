import type { SymbolSystem } from "@/types/CinematicDirection";

export function renderSymbol(
  ctx: CanvasRenderingContext2D,
  symbolSystem: SymbolSystem,
  songProgress: number,
  width: number,
  height: number,
): void {
  const primary = symbolSystem.primary.toLowerCase();

  if (primary.includes("mountain") || primary.includes("everest")) {
    renderMountain(ctx, symbolSystem, songProgress, width, height);
  }
}

function renderMountain(
  ctx: CanvasRenderingContext2D,
  _symbolSystem: SymbolSystem,
  songProgress: number,
  width: number,
  height: number,
): void {
  const centerX = width / 2;
  const baseY = height * 0.85;

  const decayFactor = songProgress > 0.5
    ? 1 - ((songProgress - 0.5) * 2)
    : 1;
  const mountainHeight = height * 0.6 * Math.max(0.05, decayFactor);
  const opacity = Math.max(0, decayFactor * 0.06);

  ctx.save();
  ctx.globalAlpha = opacity;

  ctx.beginPath();
  ctx.moveTo(centerX - width * 0.4, baseY);
  ctx.lineTo(centerX, baseY - mountainHeight);
  ctx.lineTo(centerX + width * 0.4, baseY);
  ctx.closePath();

  const grad = ctx.createLinearGradient(
    centerX,
    baseY - mountainHeight,
    centerX,
    baseY,
  );
  grad.addColorStop(0, "#F0F8FF");
  grad.addColorStop(0.4, "#87CEEB");
  grad.addColorStop(1, "#0A0A0A");
  ctx.fillStyle = grad;
  ctx.fill();

  if (songProgress > 0.65) {
    const crackProgress = (songProgress - 0.65) / 0.35;
    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, crackProgress)) * 0.4})`;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(centerX, baseY - mountainHeight);
    ctx.lineTo(centerX - 20, baseY - mountainHeight * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + 8, baseY - mountainHeight * 0.8);
    ctx.lineTo(centerX + 24, baseY - mountainHeight * 0.45);
    ctx.stroke();
  }

  ctx.restore();
}
