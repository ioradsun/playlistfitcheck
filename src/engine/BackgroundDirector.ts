import type { Chapter } from "@/types/CinematicDirection";

export function renderChapterBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chapter: Chapter,
  songProgress: number,
  beatIntensity: number,
  currentTime: number,
): void {
  const intensity = chapter.emotionalIntensity;
  const color = chapter.dominantColor;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const depthGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  depthGrad.addColorStop(0, "rgba(0,0,0,0)");
  depthGrad.addColorStop(1, `rgba(0,0,0,${0.3 + intensity * 0.4})`);
  ctx.fillStyle = depthGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const directive = chapter.backgroundDirective.toLowerCase();
  if (directive.includes("ocean") || directive.includes("water") || directive.includes("deep")) {
    renderOceanBackground(ctx, canvas, chapter, songProgress, beatIntensity, currentTime);
  } else if (directive.includes("fire") || directive.includes("burn") || directive.includes("flame")) {
    renderFireBackground(ctx, canvas, chapter, songProgress, beatIntensity, currentTime);
  } else if (directive.includes("neon") || directive.includes("club") || directive.includes("electric")) {
    renderNeonBackground(ctx, canvas, chapter, songProgress, beatIntensity, currentTime);
  } else {
    renderAmbientBackground(ctx, canvas, chapter, songProgress, beatIntensity, currentTime);
  }
}

function renderOceanBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chapter: Chapter,
  _songProgress: number,
  _beatIntensity: number,
  currentTime: number,
): void {
  const intensity = chapter.emotionalIntensity;
  for (let w = 0; w < 3; w++) {
    ctx.beginPath();
    const waveY = canvas.height * (0.3 + w * 0.2);
    const waveAmp = 15 + intensity * 20;
    const waveSpeed = 0.3 + w * 0.15;

    ctx.moveTo(0, waveY);
    for (let x = 0; x <= canvas.width; x += 4) {
      const y = waveY + Math.sin(x * 0.01 + currentTime * waveSpeed + w) * waveAmp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();

    const waveOpacity = 0.04 + intensity * 0.04;
    ctx.fillStyle = `rgba(74,107,140,${waveOpacity})`;
    ctx.fill();
  }

  if (intensity > 0.5) {
    for (let c = 0; c < 5; c++) {
      const cx = (canvas.width * c) / 5 + Math.sin(currentTime * 0.2 + c) * 30;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + 40, canvas.height);
      ctx.strokeStyle = `rgba(140,160,180,${0.03 + intensity * 0.04})`;
      ctx.lineWidth = 15;
      ctx.stroke();
    }
  }

  const vigGrad = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.2,
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.9,
  );
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, `rgba(0,0,10,${0.3 + intensity * 0.4})`);
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderFireBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chapter: Chapter,
  _songProgress: number,
  beatIntensity: number,
  currentTime: number,
): void {
  const intensity = chapter.emotionalIntensity;
  for (let i = 0; i < 4; i++) {
    const y = canvas.height * (0.75 + i * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width; x += 8) {
      const flicker = Math.sin(x * 0.02 + currentTime * (1.4 + i * 0.2) + i) * (10 + intensity * 20);
      ctx.lineTo(x, y - flicker);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,120,20,${0.04 + intensity * 0.05})`;
    ctx.fill();
  }

  if (beatIntensity > 0.55) {
    const bloom = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height * 0.85,
      0,
      canvas.width / 2,
      canvas.height * 0.85,
      canvas.height * 0.7,
    );
    bloom.addColorStop(0, `rgba(255,180,80,${beatIntensity * 0.08})`);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function renderNeonBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chapter: Chapter,
  _songProgress: number,
  beatIntensity: number,
  _currentTime: number,
): void {
  const intensity = chapter.emotionalIntensity;
  ctx.strokeStyle = `rgba(138,74,240,${0.06 + intensity * 0.06})`;
  ctx.lineWidth = 1;

  const gridSize = 60;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  if (beatIntensity > 0.5) {
    const bloom = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.height * 0.6,
    );
    bloom.addColorStop(0, `rgba(138,74,240,${beatIntensity * 0.12})`);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function renderAmbientBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  _chapter: Chapter,
  _songProgress: number,
  _beatIntensity: number,
  currentTime: number,
): void {
  const pulse = Math.sin(currentTime * 0.5) * 0.03;
  const grad = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.8,
  );
  grad.addColorStop(0, `rgba(255,255,255,${0.03 + pulse})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
